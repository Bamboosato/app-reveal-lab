import * as twgl from 'twgl.js';

const VS_SOURCE = `#version 300 es
in vec2 position;
out vec2 v_uv;

void main() {
  v_uv = (position + 1.0) * 0.5;
  // テクスチャのY軸反転補正（WebGLテクスチャ座標系に合わせる）
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FS_SOURCE = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_resolution; // キャンバス解像度 (width, height)
uniform float u_progress;   // 0.0 (モザイク) ~ 1.0 (完全高解像度)
uniform int u_mode;        // 0: Radial Out, 1: Linear Scan
uniform float u_mosaicSize; // 初期モザイクのブロックサイズ（ピクセル数）
uniform float u_feather;    // 境界ぼかし幅 (0.01 ~ 0.5)

void main() {
  vec2 uv = v_uv;
  float aspect = u_resolution.x / u_resolution.y;

  // 1. モザイク座標の計算（UV量子化）
  // 進行に伴ってモザイクサイズ自体も小さくなり、最終的に1pxになる
  float currentBlockSize = max(1.0, mix(u_mosaicSize, 1.0, u_progress));
  vec2 gridCount = u_resolution / currentBlockSize;
  vec2 mosaicUv = floor(uv * gridCount) / gridCount;

  vec4 fullResColor = texture(u_texture, uv);
  vec4 mosaicColor = texture(u_texture, mosaicUv);

  // 2. 進行マスクの計算
  float revealFactor = 0.0;

  if (u_mode == 0) {
    // Mode 0: 中心から外側へ (Radial Out)
    // 正円を保つためアスペクト比を補正
    vec2 center = vec2(0.5, 0.5);
    vec2 diff = uv - center;
    diff.x *= aspect; // アスペクト補正

    float dist = length(diff);
    // 画面隅までの最大半径
    float maxDist = length(vec2(0.5 * aspect, 0.5));
    
    // progressに応じて半径を拡大
    float currentRadius = u_progress * (maxDist + u_feather);
    float edge0 = max(0.0, currentRadius - u_feather);
    float edge1 = currentRadius;

    // smoothstepで中心側を1.0（高解像度）、外側を0.0（モザイク）にする
    revealFactor = 1.0 - smoothstep(edge0, edge1, dist);
  } else {
    // Mode 1: 上から下へ (Linear Scan)
    float currentY = u_progress * (1.0 + u_feather);
    float edge0 = currentY - u_feather;
    float edge1 = currentY;

    // 上側(uv.y = 0.0)から下側(uv.y = 1.0)へ進行
    revealFactor = smoothstep(edge0, edge1, 1.0 - uv.y);
  }

  // progressが1.0の時は強制的に完全高解像度
  if (u_progress >= 1.0) {
    revealFactor = 1.0;
  }

  // モザイクと高解像度をブレンド合成
  fragColor = mix(mosaicColor, fullResColor, revealFactor);
}
`;

export interface RenderOptions {
  mode?: 0 | 1; // 0: Radial, 1: Linear
  mosaicSize?: number; // 初期モザイクサイズ（ピクセル）
  feather?: number;
}

export class SpikeWebglRenderer {
  private gl: WebGL2RenderingContext;
  private programInfo: twgl.ProgramInfo;
  private bufferInfo: twgl.BufferInfo;
  private texture: WebGLTexture | null = null;
  public canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });

    if (!gl) {
      throw new Error('WebGL 2 is not supported on this device/browser.');
    }

    this.gl = gl;
    this.programInfo = twgl.createProgramInfo(gl, [VS_SOURCE, FS_SOURCE]);

    // フルスクリーン四角形
    const arrays: twgl.Arrays = {
      position: {
        numComponents: 2,
        data: [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1],
      },
    };
    this.bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);
  }

  /**
   * テスト用パターン画像をCanvas上に生成してテクスチャに登録
   */
  public loadDefaultTestPattern(): void {
    const size = 1024;
    const pCanvas = document.createElement('canvas');
    pCanvas.width = size;
    pCanvas.height = size;
    const ctx = pCanvas.getContext('2d')!;

    // 鮮やかなテスト画像（グラデーション＋文字＋幾何学模様）
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#ff416c');
    grad.addColorStop(0.5, '#8a2387');
    grad.addColorStop(1, '#ff4b2b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // グリッド線
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 4;
    for (let i = 0; i < size; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }

    // 円形モチーフ
    ctx.fillStyle = '#00f2fe';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.28, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4facfe';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // テキスト
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('App Reveal Lab', size / 2, size / 2 - 30);
    ctx.font = '28px sans-serif';
    ctx.fillText('Spike Technology Verification', size / 2, size / 2 + 40);

    this.setImage(pCanvas);
  }

  /**
   * 任意の画像（HTMLImageElement, HTMLCanvasElement等）をテクスチャとして設定
   */
  public setImage(imageSource: TexImageSource): void {
    if (this.texture) {
      this.gl.deleteTexture(this.texture);
    }
    this.texture = twgl.createTexture(this.gl, {
      src: imageSource,
      min: this.gl.LINEAR,
      mag: this.gl.LINEAR,
      wrap: this.gl.CLAMP_TO_EDGE,
    });
  }

  /**
   * 決定論的固定タイムライン描画
   * @param timeSeconds 現在の仮想時刻
   * @param durationSeconds 演出本編の所要秒数
   * @param startDelaySeconds 開始待機秒数
   * @param holdTimeSeconds 完成保持秒数
   */
  public renderAtTime(
    timeSeconds: number,
    durationSeconds = 3.0,
    startDelaySeconds = 0.5,
    holdTimeSeconds = 1.0,
    options: RenderOptions = {}
  ): number {
    const gl = this.gl;
    if (!this.texture) return 0;

    // 進行率 (progress: 0.0 ~ 1.0) の計算
    let progress = 0.0;
    if (timeSeconds <= startDelaySeconds) {
      progress = 0.0;
    } else if (timeSeconds >= startDelaySeconds + durationSeconds) {
      progress = 1.0;
    } else {
      progress = (timeSeconds - startDelaySeconds) / durationSeconds;
      // イージング: Cubic EaseInOut
      progress = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    }

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.programInfo.program);

    twgl.setBuffersAndAttributes(gl, this.programInfo, this.bufferInfo);

    const uniforms = {
      u_texture: this.texture,
      u_resolution: [this.canvas.width, this.canvas.height],
      u_progress: progress,
      u_mode: options.mode ?? 0,
      u_mosaicSize: options.mosaicSize ?? 48.0,
      u_feather: options.feather ?? 0.15,
    };

    twgl.setUniforms(this.programInfo, uniforms);
    twgl.drawBufferInfo(gl, this.bufferInfo);

    return progress;
  }

  public resize(width: number, height: number): void {
    // H.264等の制約に対応するため偶数（2の倍数）にアライメント
    const evenWidth = width - (width % 2);
    const evenHeight = height - (height % 2);
    if (this.canvas.width !== evenWidth || this.canvas.height !== evenHeight) {
      this.canvas.width = evenWidth;
      this.canvas.height = evenHeight;
    }
  }

  public dispose(): void {
    if (this.texture) {
      this.gl.deleteTexture(this.texture);
      this.texture = null;
    }
  }
}
