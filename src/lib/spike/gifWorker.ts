import { GIFEncoder, quantize, applyPalette } from 'gifenc';

export interface GifWorkerMessage {
  type: 'init' | 'frame' | 'finish';
  width?: number;
  height?: number;
  fps?: number;
  paletteMode?: 'per-frame' | 'global';
  transparent?: boolean;
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
let isTransparent = false;

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
    isTransparent = !!msg.transparent;
    globalPalette = null;
    ctx.postMessage({ type: 'init_done' });
  } else if (msg.type === 'frame') {
    if (!gif || !msg.frameData) return;

    const rgba = msg.frameData;
    let palette: number[][];

    const quantizeOpts = isTransparent ? { format: 'rgba4444' as const, oneBitAlpha: 0 } : undefined;
    const format = isTransparent ? ('rgba4444' as const) : ('rgb565' as const);

    if (paletteMode === 'global') {
      if (!globalPalette) {
        globalPalette = quantize(rgba, 256, quantizeOpts);
      }
      palette = globalPalette!;
    } else {
      palette = quantize(rgba, 256, quantizeOpts);
    }

    const index = applyPalette(rgba, palette, format);
    const writeOpts: any = {
      palette,
      delay,
      repeat: 0, // 無限ループ
    };

    if (isTransparent) {
      const transparentIdx = palette.findIndex((p) => p.length > 3 && p[3] === 0);
      if (transparentIdx !== -1) {
        writeOpts.transparent = true;
        writeOpts.transparentIndex = transparentIdx;
      }
    }

    gif.writeFrame(index, width, height, writeOpts);

    ctx.postMessage({
      type: 'progress',
      frameIndex: msg.frameIndex,
      totalFrames: msg.totalFrames,
    });
    ctx.postMessage({
      type: 'frame_done',
      frameIndex: msg.frameIndex,
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
