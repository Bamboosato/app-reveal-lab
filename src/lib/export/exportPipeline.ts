import {
  Output,
  Mp4OutputFormat,
  WebMOutputFormat,
  BufferTarget,
  CanvasSource,
  QUALITY_HIGH,
} from 'mediabunny';
import type { RevealRenderer } from '../core/renderer';
import type { EffectState, CanvasSettings } from '../core/types';
import { calculateCanvasDimensions } from '../core/imageLoader';
import { checkVideoConfigSupported } from '../spike/capabilities';
import type { ExportSettings, ExportResult } from './exportTypes';

export type ProgressCallback = (percent: number, currentFrame: number, totalFrames: number, statusText: string) => void;

export class ExportPipeline {
  private canceled = false;
  private worker: Worker | null = null;
  private onFrameDoneCallback: (() => void) | null = null;
  private gifReject: ((reason?: any) => void) | null = null;
  private output: Output | null = null;

  public async cancel(): Promise<void> {
    this.canceled = true;
    if (this.onFrameDoneCallback) {
      this.onFrameDoneCallback();
      this.onFrameDoneCallback = null;
    }
    if (this.gifReject) {
      this.gifReject(new Error('エクスポート処理がキャンセルされました。'));
      this.gifReject = null;
    }
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.output) {
      try {
        await this.output.cancel();
      } catch {
        // すでにキャンセルまたは終了済みの場合は無視
      }
      this.output = null;
    }
  }

  public async run(
    renderer: RevealRenderer,
    effectState: EffectState,
    canvasSettings: CanvasSettings,
    exportSettings: ExportSettings,
    onProgress?: ProgressCallback,
    currentPreviewTime: number = 0
  ): Promise<ExportResult> {
    this.canceled = false;
    this.output = null;
    const startTime = performance.now();

    // プレビュー元の寸法を保存し、完了時/失敗時に必ず復元する
    const origWidth = renderer.canvas.width;
    const origHeight = renderer.canvas.height;

    try {
      // 1. 出力キャンバス寸法の算出（偶数ピクセル強制補正）
      let dimensions = calculateCanvasDimensions(
        canvasSettings.aspectRatio,
        exportSettings.resolution,
        renderer.imageWidth,
        renderer.imageHeight
      );

      // GIFの場合は負荷低減のため長辺480px相当にスケーリング
      if (exportSettings.format === 'gif') {
        const maxSide = 480;
        if (dimensions.width >= dimensions.height) {
          const aspect = dimensions.height / dimensions.width;
          let w = maxSide;
          let h = Math.round(maxSide * aspect);
          dimensions = { width: w - (w % 2), height: h - (h % 2) };
        } else {
          const aspect = dimensions.width / dimensions.height;
          let h = maxSide;
          let w = Math.round(maxSide * aspect);
          dimensions = { width: w - (w % 2), height: h - (h % 2) };
        }
      }

      const { width, height } = dimensions;
      renderer.resize(width, height);

      const totalDuration = effectState.common.startDelay + effectState.common.duration + effectState.common.holdTime;

      // --- A. PNG静止画出力 ---
      if (exportSettings.format === 'png') {
        onProgress?.(50, 1, 1, 'PNG静止画をレンダリング中...');
        const blob = await renderer.capturePNG(effectState, canvasSettings);
        const url = URL.createObjectURL(blob);
        const elapsedTimeMs = Math.round(performance.now() - startTime);

        onProgress?.(100, 1, 1, 'PNG保存完了！');
        return {
          format: 'png',
          blob,
          url,
          fileSizeBytes: blob.size,
          elapsedTimeMs,
          realtimeRatio: 0,
          totalFrames: 1,
          mimeType: 'image/png',
          width,
          height,
        };
      }

      // --- B. GIFアニメーション出力 (Web Worker + バックプレッシャー) ---
      if (exportSettings.format === 'gif') {
        const fps = exportSettings.fps || 15;
        const totalFrames = Math.ceil(totalDuration * fps);

        if (totalFrames > 150) {
          throw new Error(
            `GIFの総フレーム数 (${totalFrames}) が上限の150フレームを超えています。\n` +
            `待機・保持を含む総時間を10秒以下(15fps時)または5秒以下(30fps時)に設定してください。`
          );
        }

        const dt = 1 / fps;
        this.worker = new Worker(new URL('../spike/gifWorker.ts', import.meta.url), { type: 'module' });

        return await new Promise<ExportResult>((resolve, reject) => {
          this.gifReject = reject;
          if (!this.worker) return reject(new Error('Failed to start Web Worker'));

          this.worker.onmessage = async (e: MessageEvent) => {
            const msg = e.data;
            if (msg.type === 'init_done') {
              try {
                await this.processGifFrames(renderer, effectState, canvasSettings, totalFrames, totalDuration, dt, width, height, onProgress);
              } catch (err) {
                await this.cancel();
                reject(err);
              }
            } else if (msg.type === 'progress') {
              const pct = Math.round(((msg.frameIndex + 1) / msg.totalFrames) * 100);
              onProgress?.(pct, msg.frameIndex + 1, msg.totalFrames, `GIF 量子化中: ${pct}% (${msg.frameIndex + 1}/${msg.totalFrames})`);
            } else if (msg.type === 'frame_done') {
              if (this.onFrameDoneCallback) {
                const cb = this.onFrameDoneCallback;
                this.onFrameDoneCallback = null;
                cb();
              }
            } else if (msg.type === 'finished') {
              this.gifReject = null;
              const elapsedTimeMs = Math.round(performance.now() - startTime);
              const blob = new Blob([msg.buffer], { type: 'image/gif' });
              const url = URL.createObjectURL(blob);

              if (this.worker) {
                this.worker.terminate();
                this.worker = null;
              }

              resolve({
                format: 'gif',
                blob,
                url,
                fileSizeBytes: blob.size,
                elapsedTimeMs,
                realtimeRatio: Number((elapsedTimeMs / (totalDuration * 1000)).toFixed(2)),
                totalFrames,
                mimeType: 'image/gif',
                width,
                height,
              });
            }
          };

          this.worker.onerror = (err) => {
            this.cancel();
            reject(err);
          };

          this.worker.postMessage({
            type: 'init',
            width,
            height,
            fps,
            paletteMode: exportSettings.gifPaletteMode,
            transparent: canvasSettings.transparent,
          });
        });
      }

      // --- C. 動画出力 (MP4 / WebM) ---
      const isMp4 = exportSettings.format === 'mp4';
      const fps = exportSettings.fps || 30;

      // 直前ハードウェア/コーデックサポート検証
      const cap = await checkVideoConfigSupported(exportSettings.format, width, height, fps);
      if (!cap.supported) {
        throw new Error(`お使いのブラウザ/環境は指定された動画形式 (${exportSettings.format.toUpperCase()} ${width}x${height} @ ${fps}fps) に対応していません。別の形式または解像度を選択してください。`);
      }

      const totalFrames = Math.ceil(totalDuration * fps);
      const dt = 1 / fps;

      const target = new BufferTarget();
      const outputFormat = isMp4 ? new Mp4OutputFormat() : new WebMOutputFormat();
      this.output = new Output({
        format: outputFormat,
        target,
      });

      // 能力判定結果から正確にコーデックを選択し、fullCodecString も CanvasSource に伝達
      let codecName: 'avc' | 'vp9' | 'vp8';
      if (isMp4) {
        codecName = 'avc';
      } else {
        codecName = cap.codec === 'vp8' ? 'vp8' : 'vp9';
      }

      const videoSource = new CanvasSource(renderer.canvas, {
        codec: codecName,
        fullCodecString: cap.codec,
        quality: QUALITY_HIGH,
      });

      this.output.addVideoTrack(videoSource);
      await this.output.start();

      for (let frame = 0; frame < totalFrames; frame++) {
        if (this.canceled) {
          throw new Error('エクスポート処理がキャンセルされました。');
        }

        // 最終フレーム保証: 最後のコマは確実に totalDuration（進行度1.0完了状態）を描画する
        const currentTime = frame === totalFrames - 1 ? totalDuration : frame * dt;
        renderer.renderAtTime(currentTime, effectState, canvasSettings);

        // videoSource には規則的なタイムスタンプとフレーム時間を渡す
        await videoSource.add(frame * dt, dt);

        const percent = Math.round(((frame + 1) / totalFrames) * 100);
        onProgress?.(percent, frame + 1, totalFrames, `${isMp4 ? 'MP4' : 'WebM'} エンコード中: ${percent}% (${frame + 1}/${totalFrames})`);
      }

      if (this.canceled) {
        throw new Error('エクスポート処理がキャンセルされました。');
      }

      onProgress?.(99, totalFrames, totalFrames, 'メタデータを書き込み中...');
      await this.output.finalize();

      const elapsedTimeMs = Math.round(performance.now() - startTime);
      const realtimeRatio = Number((elapsedTimeMs / (totalDuration * 1000)).toFixed(2));

      const buffer = target.buffer;
      if (!buffer) {
        throw new Error('動画バッファの取得に失敗しました。');
      }

      const mimeType = isMp4 ? 'video/mp4' : 'video/webm';
      const blob = new Blob([buffer], { type: mimeType });
      const url = URL.createObjectURL(blob);

      return {
        format: exportSettings.format,
        blob,
        url,
        fileSizeBytes: blob.size,
        elapsedTimeMs,
        realtimeRatio,
        totalFrames,
        mimeType,
        width,
        height,
      };
    } finally {
      // プレビュー表示用の元寸法に確実に復帰し、停止中のプレビューが空になるのを防止
      renderer.resize(origWidth, origHeight);
      renderer.renderAtTime(currentPreviewTime, effectState, canvasSettings);
      this.output = null;
    }
  }

  private async processGifFrames(
    renderer: RevealRenderer,
    effectState: EffectState,
    canvasSettings: CanvasSettings,
    totalFrames: number,
    totalDuration: number,
    dt: number,
    width: number,
    height: number,
    onProgress?: ProgressCallback
  ): Promise<void> {
    const gl = (renderer as any).gl as WebGL2RenderingContext;
    const pixelBuffer = new Uint8Array(width * height * 4);
    const rowBytes = width * 4;

    for (let i = 0; i < totalFrames; i++) {
      if (this.canceled) {
        throw new Error('エクスポート処理がキャンセルされました。');
      }

      // 最終フレーム保証: 最後のコマは確実に totalDuration（進行度1.0完了状態）を描画する
      const currentTime = i === totalFrames - 1 ? totalDuration : i * dt;
      renderer.renderAtTime(currentTime, effectState, canvasSettings);

      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuffer);

      // Y軸反転
      const flippedBuffer = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++) {
        const srcRow = y * rowBytes;
        const dstRow = (height - 1 - y) * rowBytes;
        flippedBuffer.set(pixelBuffer.subarray(srcRow, srcRow + rowBytes), dstRow);
      }

      // Worker側で量子化・フレーム書き出しが完了するのを待機（バックプレッシャー）
      await new Promise<void>((resolve) => {
        this.onFrameDoneCallback = resolve;
        this.worker?.postMessage(
          {
            type: 'frame',
            frameIndex: i,
            totalFrames,
            frameData: flippedBuffer,
          },
          [flippedBuffer.buffer]
        );
      });
    }

    this.worker?.postMessage({ type: 'finish' });
  }
}
