import { GIFEncoder, quantize, applyPalette } from 'gifenc';

export interface GifWorkerMessage {
  type: 'init' | 'frame' | 'finish';
  width?: number;
  height?: number;
  fps?: number;
  paletteMode?: 'per-frame' | 'global';
  frameData?: Uint8Array; // RGBAピクセル
  totalFrames?: number;
  frameIndex?: number;
}

let gif: ReturnType<typeof GIFEncoder> | null = null;
let width = 0;
let height = 0;
let delay = 66; // 15fps -> ~66ms
let paletteMode: 'per-frame' | 'global' = 'per-frame';
let globalPalette: number[][] | null = null;

const ctx = self as any;

ctx.onmessage = (e: MessageEvent<GifWorkerMessage>) => {
  const msg = e.data;

  if (msg.type === 'init') {
    gif = GIFEncoder();
    width = msg.width!;
    height = msg.height!;
    const fps = msg.fps || 15;
    delay = Math.round(1000 / fps);
    paletteMode = msg.paletteMode || 'per-frame';
    globalPalette = null;
    ctx.postMessage({ type: 'init_done' });
  } else if (msg.type === 'frame') {
    if (!gif || !msg.frameData) return;

    const rgba = msg.frameData;
    let palette: number[][];

    if (paletteMode === 'global') {
      if (!globalPalette) {
        globalPalette = quantize(rgba, 256);
      }
      palette = globalPalette!;
    } else {
      palette = quantize(rgba, 256);
    }

    const index = applyPalette(rgba, palette);
    gif.writeFrame(index, width, height, {
      palette,
      delay,
      repeat: 0, // 無限ループ
    });

    ctx.postMessage({
      type: 'progress',
      frameIndex: msg.frameIndex,
      totalFrames: msg.totalFrames,
    });
  } else if (msg.type === 'finish') {
    if (!gif) return;
    gif.finish();
    const bytes = gif.bytes();
    ctx.postMessage({ type: 'finished', buffer: bytes.buffer }, [bytes.buffer]);
    gif = null;
    globalPalette = null;
  }
};
