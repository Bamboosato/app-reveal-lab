export type AspectRatioPreset = 'original' | '9:16' | '1:1' | '16:9' | '4:5';

export type FitMode = 'contain' | 'cover';

export type EffectMode =
  | 'radial_out'
  | 'radial_in'
  | 'linear_scan'
  | 'block_scan'
  | 'random_reveal'
  | 'multi_step_lod';

export type EasingType = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'cubic';

export interface CanvasSettings {
  aspectRatio: AspectRatioPreset;
  fit: FitMode;
  positionOffset: { x: number; y: number }; // -1.0 ~ 1.0
  backgroundColor: string; // HEX (#000000)
  transparent?: boolean; // PNG / GIF 出力時のみ有効
}

export interface CommonParams {
  duration: number; // 秒 (1.0 ~ 10.0)
  startDelay: number; // 秒 (0.0 ~ 3.0)
  holdTime: number; // 秒 (0.0 ~ 3.0)
  mosaicSize: number; // 開始時モザイク粗さ (ピクセル, 8 ~ 128)
  feather: number; // 境界ぼかし幅 (0.01 ~ 0.5)
  easing: EasingType;
  loop: boolean;
  stagedReveal?: boolean; // 段階的ランダム解像 (初期モザイクから段階的に高精細化)
}

export interface BlockParams {
  gridCount: number; // 8, 16, 32, 64
  noiseStrength: number; // 0.0 ~ 1.0 (ブロック先行出現率)
  seed: number; // 乱数シード
}

export interface LodParams {
  steps: number; // 3 ~ 8
  smooth: boolean; // 階段状 or 連続フェード
}

export interface EffectState {
  mode: EffectMode;
  common: CommonParams;
  block: BlockParams;
  lod: LodParams;
}

export interface ResolutionDimension {
  width: number;
  height: number;
}
