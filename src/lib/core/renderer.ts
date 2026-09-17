import * as twgl from 'twgl.js';
import { VERTEX_SHADER, FRAGMENT_SHADER } from './shaders';
import type { EffectState, CanvasSettings, EffectMode } from './types';
import { applyEasing } from './easings';

function modeToId(mode: EffectMode): number {
  switch (mode) {
    case 'radial_out': return 0;
    case 'radial_in': return 1;
    case 'linear_scan': return 2;
    case 'block_scan': return 3;
    case 'random_reveal': return 4;
    case 'multi_step_lod': return 5;
    default: return 0;
  }
}

function hexToRgba(hex: string): [number, number, number, number] {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map(x => x + x).join('');
  }
  const num = parseInt(c, 16);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  return [r, g, b, 1.0];
}

export class RevealRenderer {
  public canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private programInfo: twgl.ProgramInfo;
  private bufferInfo: twgl.BufferInfo;
  private texture: WebGLTexture | null = null;
  private currentImageSource: TexImageSource | null = null;
  private isContextLost = false;
  public imageWidth = 1280;
  public imageHeight = 720;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      throw new Error('WebGL 2 is not supported on this browser or device.');
    }

    this.gl = gl;
    this.programInfo = twgl.createProgramInfo(gl, [VERTEX_SHADER, FRAGMENT_SHADER]);

    // フルスクリーンクアッド
    const arrays: twgl.Arrays = {
      position: {
        numComponents: 2,
        data: [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1],
      },
    };
    this.bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);

    // コンテキスト消失・復旧ハンドラ
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.isContextLost = true;
      console.warn('WebGL context lost.');
    });

    canvas.addEventListener('webglcontextrestored', () => {
      console.log('WebGL context restored. Re-creating resources...');
      this.isContextLost = false;
      this.reinitResources();
    });
  }

  private reinitResources(): void {
    const gl = this.gl;
    this.programInfo = twgl.createProgramInfo(gl, [VERTEX_SHADER, FRAGMENT_SHADER]);
    const arrays: twgl.Arrays = {
      position: {
        numComponents: 2,
        data: [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1],
      },
    };
    this.bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);
    if (this.currentImageSource) {
      this.setImage(this.currentImageSource, this.imageWidth, this.imageHeight);
    }
  }

  public setImage(source: TexImageSource, width?: number, height?: number): void {
    this.currentImageSource = source;
    if (width && height) {
      this.imageWidth = width;
      this.imageHeight = height;
    } else if (source instanceof HTMLImageElement) {
      this.imageWidth = source.naturalWidth || 1280;
      this.imageHeight = source.naturalHeight || 720;
    } else if (source instanceof HTMLCanvasElement) {
      this.imageWidth = source.width;
      this.imageHeight = source.height;
    }

    if (this.texture) {
      this.gl.deleteTexture(this.texture);
    }

    this.texture = twgl.createTexture(this.gl, {
      src: source,
      min: this.gl.LINEAR,
      mag: this.gl.LINEAR,
      wrap: this.gl.CLAMP_TO_EDGE,
    });
  }

  public resize(width: number, height: number): void {
    const evenWidth = width - (width % 2);
    const evenHeight = height - (height % 2);
    if (this.canvas.width !== evenWidth || this.canvas.height !== evenHeight) {
      this.canvas.width = evenWidth;
      this.canvas.height = evenHeight;
    }
  }

  /**
   * 指定仮想時刻での決定論的描画
   */
  public renderAtTime(
    timeSeconds: number,
    effectState: EffectState,
    canvasSettings: CanvasSettings
  ): number {
    const gl = this.gl;
    if (!this.texture || this.isContextLost) return 0;

    const { duration, startDelay, holdTime, mosaicSize, feather, easing } = effectState.common;

    // 1. 正規化進行率の算出 (0.0 ~ 1.0)
    let rawProgress = 0.0;
    if (timeSeconds <= startDelay) {
      rawProgress = 0.0;
    } else if (timeSeconds >= startDelay + duration) {
      rawProgress = 1.0;
    } else {
      rawProgress = (timeSeconds - startDelay) / duration;
    }

    // 2. イージング適用
    const progress = applyEasing(rawProgress, easing);

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.programInfo.program);

    twgl.setBuffersAndAttributes(gl, this.programInfo, this.bufferInfo);

    const uniforms = {
      u_texture: this.texture,
      u_canvasRes: [this.canvas.width, this.canvas.height],
      u_imageRes: [this.imageWidth, this.imageHeight],
      u_fitMode: canvasSettings.fit === 'cover' ? 1 : 0,
      u_panOffset: [canvasSettings.positionOffset.x, canvasSettings.positionOffset.y],
      u_bgColor: hexToRgba(canvasSettings.backgroundColor),

      u_mode: modeToId(effectState.mode),
      u_progress: progress,
      u_mosaicSize: mosaicSize,
      u_feather: feather,

      u_gridCount: effectState.block.gridCount,
      u_noiseStrength: effectState.block.noiseStrength,
      u_seed: effectState.block.seed,

      u_lodSteps: effectState.lod.steps,
      u_lodSmooth: effectState.lod.smooth ? 1 : 0,
    };

    twgl.setUniforms(this.programInfo, uniforms);
    twgl.drawBufferInfo(gl, this.bufferInfo);

    return progress;
  }

  /**
   * 完成状態（高解像度）または現在表示のPNGスナップショット書き出し
   */
  public async capturePNG(
    effectState: EffectState,
    canvasSettings: CanvasSettings,
    fullResolution = true
  ): Promise<Blob> {
    const originalWidth = this.canvas.width;
    const originalHeight = this.canvas.height;

    // 完全高解像度状態 (progress = 1.0) の時刻を描画
    const totalTime = effectState.common.startDelay + effectState.common.duration + effectState.common.holdTime;
    this.renderAtTime(totalTime, effectState, canvasSettings);

    return new Promise((resolve, reject) => {
      this.canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create PNG blob.'));
        }
      }, 'image/png');
    });
  }

  public dispose(): void {
    if (this.texture) {
      this.gl.deleteTexture(this.texture);
      this.texture = null;
    }
  }
}
