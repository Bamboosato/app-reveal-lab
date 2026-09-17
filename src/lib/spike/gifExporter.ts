import type { SpikeWebglRenderer, RenderOptions } from './webglRenderer';

export interface GifExportOptions {
  width: number;
  height: number;
  fps: number;
  duration: number;
  startDelay: number;
  holdTime: number;
  paletteMode: 'per-frame' | 'global';
  renderOptions?: RenderOptions;
  onProgress?: (progress: number, currentFrame: number, totalFrames: number) => void;
}

export interface GifExportResult {
  blob: Blob;
  url: string;
  fileSizeBytes: number;
  elapsedTimeMs: number;
  totalFrames: number;
}

export class SpikeGifExporter {
  private worker: Worker | null = null;
  private canceled = false;

  public cancel(): void {
    this.canceled = true;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  public async exportGif(
    renderer: SpikeWebglRenderer,
    options: GifExportOptions
  ): Promise<GifExportResult> {
    this.canceled = false;
    const startTime = performance.now();

    // 1. 総時間と総フレーム数の計算
    const totalDuration = options.startDelay + options.duration + options.holdTime;
    const totalFrames = Math.ceil(totalDuration * options.fps);

    // 最大150フレーム制限チェック
    if (totalFrames > 150) {
      throw new Error(
        `Total frames (${totalFrames}) exceeds the maximum limit of 150 frames. ` +
        `Please reduce duration or fps (e.g., max 10s at 15fps, or max 5s at 30fps).`
      );
    }

    const dt = 1 / options.fps;
    const width = options.width - (options.width % 2);
    const height = options.height - (options.height % 2);
    renderer.resize(width, height);

    // 2. Web Worker の起動
    this.worker = new Worker(new URL('./gifWorker.ts', import.meta.url), { type: 'module' });

    return new Promise((resolve, reject) => {
      if (!this.worker) return reject(new Error('Failed to create Web Worker'));

      this.worker.onmessage = (e: MessageEvent) => {
        const msg = e.data;
        if (msg.type === 'init_done') {
          // 初期化完了後、1フレームずつCanvasから読み出してWorkerへ送信
          this.processFrames(renderer, options, totalFrames, dt, width, height)
            .catch(err => {
              this.cancel();
              reject(err);
            });
        } else if (msg.type === 'progress') {
          const progress = Math.round(((msg.frameIndex + 1) / msg.totalFrames) * 100);
          options.onProgress?.(progress, msg.frameIndex + 1, msg.totalFrames);
        } else if (msg.type === 'finished') {
          const endTime = performance.now();
          const elapsedTimeMs = Math.round(endTime - startTime);
          const blob = new Blob([msg.buffer], { type: 'image/gif' });
          const url = URL.createObjectURL(blob);

          if (this.worker) {
            this.worker.terminate();
            this.worker = null;
          }

          resolve({
            blob,
            url,
            fileSizeBytes: blob.size,
            elapsedTimeMs,
            totalFrames,
          });
        }
      };

      this.worker.onerror = (err) => {
        this.cancel();
        reject(err);
      };

      // 初期化メッセージ送信
      this.worker.postMessage({
        type: 'init',
        width,
        height,
        fps: options.fps,
        paletteMode: options.paletteMode,
      });
    });
  }

  private async processFrames(
    renderer: SpikeWebglRenderer,
    options: GifExportOptions,
    totalFrames: number,
    dt: number,
    width: number,
    height: number
  ): Promise<void> {
    const gl = (renderer as any).gl as WebGL2RenderingContext;
    const pixelBuffer = new Uint8Array(width * height * 4);

    for (let i = 0; i < totalFrames; i++) {
      if (this.canceled) {
        throw new Error('GIF generation was canceled.');
      }

      const currentTime = i * dt;
      renderer.renderAtTime(
        currentTime,
        options.duration,
        options.startDelay,
        options.holdTime,
        options.renderOptions
      );

      // WebGLからRGBAピクセルを読み出し
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuffer);

      // WebGLのピクセルは上下反転しているためY軸を反転
      const flippedBuffer = new Uint8Array(width * height * 4);
      const rowBytes = width * 4;
      for (let y = 0; y < height; y++) {
        const srcRow = y * rowBytes;
        const dstRow = (height - 1 - y) * rowBytes;
        flippedBuffer.set(pixelBuffer.subarray(srcRow, srcRow + rowBytes), dstRow);
      }

      // Workerへ転送（ゼロコピー Transferable）
      this.worker?.postMessage(
        {
          type: 'frame',
          frameIndex: i,
          totalFrames,
          frameData: flippedBuffer,
        },
        [flippedBuffer.buffer]
      );

      // UI応答性のため microtask に yield
      await new Promise(r => setTimeout(r, 0));
    }

    // 全フレーム送信完了
    this.worker?.postMessage({ type: 'finish' });
  }
}
