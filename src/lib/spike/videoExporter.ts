import {
  Output,
  Mp4OutputFormat,
  WebMOutputFormat,
  BufferTarget,
  CanvasSource,
  QUALITY_HIGH,
  QUALITY_MEDIUM,
  canEncodeVideo
} from 'mediabunny';
import type { SpikeWebglRenderer, RenderOptions } from './webglRenderer';

export interface VideoExportOptions {
  format: 'mp4' | 'webm';
  width: number;
  height: number;
  fps: number;
  duration: number;       // 演出本編時間（秒）
  startDelay: number;     // 開始待機（秒）
  holdTime: number;       // 完成保持（秒）
  bitrate?: number;
  renderOptions?: RenderOptions;
  onProgress?: (progress: number, currentFrame: number, totalFrames: number) => void;
}

export interface VideoExportResult {
  blob: Blob;
  url: string;
  fileSizeBytes: number;
  elapsedTimeMs: number;
  realtimeRatio: number; // 実時間に対する生成速度比（1.0未満なら実時間より高速）
  totalFrames: number;
  mimeType: string;
}

export class SpikeVideoExporter {
  private canceled = false;

  public cancel(): void {
    this.canceled = true;
  }

  public async exportVideo(
    renderer: SpikeWebglRenderer,
    options: VideoExportOptions
  ): Promise<VideoExportResult> {
    this.canceled = false;
    const startTime = performance.now();

    // 1. 寸法の偶数化補正
    const evenWidth = options.width - (options.width % 2);
    const evenHeight = options.height - (options.height % 2);
    renderer.resize(evenWidth, evenHeight);

    // 2. 総時間と総フレーム数の計算
    const totalDuration = options.startDelay + options.duration + options.holdTime;
    const totalFrames = Math.ceil(totalDuration * options.fps);
    const dt = 1 / options.fps;

    // 3. コーデックとフォーマットの決定
    const isMp4 = options.format === 'mp4';
    const target = new BufferTarget();

    let outputFormat = isMp4 ? new Mp4OutputFormat() : new WebMOutputFormat();
    
    const output = new Output({
      format: outputFormat,
      target,
    });

    // コーデック選定: MP4は 'avc' (H.264), WebMは 'vp9'
    const codecName = isMp4 ? 'avc' : 'vp9';

    // CanvasSourceの作成 (qualityとbitrateは排他的なためqualityのみ指定)
    const videoSource = new CanvasSource(renderer.canvas, {
      codec: codecName,
      quality: QUALITY_HIGH,
    });

    output.addVideoTrack(videoSource);
    await output.start();

    // 4. 固定タイムライン描画 & エンコードループ
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      if (this.canceled) {
        throw new Error('Video generation was canceled by user.');
      }

      const currentTime = frameIndex * dt;

      // オフスクリーンCanvasに指定時刻の映像を描画
      renderer.renderAtTime(
        currentTime,
        options.duration,
        options.startDelay,
        options.holdTime,
        options.renderOptions
      );

      // CanvasからVideoFrameを生成してMediabunny経由でエンコーダーへ投入
      await videoSource.add(currentTime, dt);

      // 進捗通知
      const progressPercent = Math.round(((frameIndex + 1) / totalFrames) * 100);
      options.onProgress?.(progressPercent, frameIndex + 1, totalFrames);
    }

    // 5. ファイナライズ（コンテナメタデータ書き出し）
    await output.finalize();

    const endTime = performance.now();
    const elapsedTimeMs = Math.round(endTime - startTime);
    const realtimeRatio = Number((elapsedTimeMs / (totalDuration * 1000)).toFixed(2));

    const buffer = target.buffer;
    if (!buffer) {
      throw new Error('Failed to retrieve video buffer.');
    }

    const mimeType = isMp4 ? 'video/mp4' : 'video/webm';
    const blob = new Blob([buffer], { type: mimeType });
    const url = URL.createObjectURL(blob);

    return {
      blob,
      url,
      fileSizeBytes: blob.size,
      elapsedTimeMs,
      realtimeRatio,
      totalFrames,
      mimeType,
    };
  }
}
