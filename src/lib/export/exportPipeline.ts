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
import type { ExportSettings, ExportResult } from './exportTypes';

export type ProgressCallback = (percent: number, currentFrame: number, totalFrames: number, statusText: string) => void;

export class ExportPipeline {
  private canceled = false;
  private worker: Worker | null = null;

  public cancel(): void {
    this.canceled = true;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  public async run(
    renderer: RevealRenderer,
    effectState: EffectState,
    canvasSettings: CanvasSettings,
    exportSettings: ExportSettings,
    onProgress?: ProgressCallback
  ): Promise<ExportResult> {
    this.canceled = false;
    const startTime = performance.now();

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

    // --- B. GIFアニメーション出力 (Web Worker) ---
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

      return new Promise<ExportResult>((resolve, reject) => {
        if (!this.worker) return reject(new Error('Failed to start Web Worker'));

        this.worker.onmessage = async (e: MessageEvent) => {
          const msg = e.data;
          if (msg.type === 'init_done') {
            try {
              await this.processGifFrames(renderer, effectState, canvasSettings, totalFrames, dt, width, height, onProgress);
            } catch (err) {
              this.cancel();
              reject(err);
            }
          } else if (msg.type === 'progress') {
            const pct = Math.round(((msg.frameIndex + 1) / msg.totalFrames) * 100);
            onProgress?.(pct, msg.frameIndex + 1, msg.totalFrames, `GIF 量子化中: ${pct}% (${msg.frameIndex + 1}/${msg.totalFrames})`);
          } else if (msg.type === 'finished') {
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
        });
      });
    }

    // --- C. 動画出力 (MP4 / WebM) ---
    const isMp4 = exportSettings.format === 'mp4';
    const fps = exportSettings.fps || 30;
    const totalFrames = Math.ceil(totalDuration * fps);
    const dt = 1 / fps;

    const target = new BufferTarget();
    const outputFormat = isMp4 ? new Mp4OutputFormat() : new WebMOutputFormat();
    const output = new Output({
      format: outputFormat,
      target,
    });

    const codecName = isMp4 ? 'avc' : 'vp9';
    const videoSource = new CanvasSource(renderer.canvas, {
      codec: codecName,
      quality: QUALITY_HIGH,
    });

    output.addVideoTrack(videoSource);
    await output.start();

    for (let frame = 0; frame < totalFrames; frame++) {
      if (this.canceled) {
        throw new Error('エクスポート処理がキャンセルされました。');
      }

      const currentTime = frame * dt;
      renderer.renderAtTime(currentTime, effectState, canvasSettings);

      await videoSource.add(currentTime, dt);

      const percent = Math.round(((frame + 1) / totalFrames) * 100);
      onProgress?.(percent, frame + 1, totalFrames, `${isMp4 ? 'MP4' : 'WebM'} エンコード中: ${percent}% (${frame + 1}/${totalFrames})`);
    }

    onProgress?.(99, totalFrames, totalFrames, 'メタデータを書き込み中...');
    await output.finalize();

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
  }

  private async processGifFrames(
    renderer: RevealRenderer,
    effectState: EffectState,
    canvasSettings: CanvasSettings,
    totalFrames: number,
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

      const currentTime = i * dt;
      renderer.renderAtTime(currentTime, effectState, canvasSettings);

      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuffer);

      // Y軸反転
      const flippedBuffer = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++) {
        const srcRow = y * rowBytes;
        const dstRow = (height - 1 - y) * rowBytes;
        flippedBuffer.set(pixelBuffer.subarray(srcRow, srcRow + rowBytes), dstRow);
      }

      this.worker?.postMessage(
        {
          type: 'frame',
          frameIndex: i,
          totalFrames,
          frameData: flippedBuffer,
        },
        [flippedBuffer.buffer]
      );

      // イベントループに一度制御を戻す
      await new Promise((r) => setTimeout(r, 0));
    }

    this.worker?.postMessage({ type: 'finish' });
  }
}
