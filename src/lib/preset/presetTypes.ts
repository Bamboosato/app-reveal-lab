import type { AspectRatioPreset, FitMode, EasingType, EffectMode } from '../core/types';
import type { ExportFormat, ResolutionPreset } from '../export/exportTypes';

/**
 * 要件定義書 10.1 に準拠したプリセットデータ構造
 */
export interface AppRevealPreset {
  schemaVersion: 1;
  id: string;
  name: string;
  description?: string;
  createdAt: string; // ISO 8601
  updatedAt: string;
  isBuiltin?: boolean;
  canvas: {
    aspectRatio: AspectRatioPreset;
    fit: FitMode;
    positionOffset: { x: number; y: number }; // -1.0 ~ 1.0
    backgroundColor: string; // HEXカラー
    transparent: boolean; // PNG / GIF のみ有効
  };
  animation: {
    mode: EffectMode;
    duration: number;
    startDelay: number;
    holdTime: number;
    mosaicSize: number;
    feather: number;
    easing: EasingType;
    loop: boolean;
    seed: number;
    gridSize?: number;
    noiseStrength?: number;
    lodSteps?: number;
    lodSmooth?: boolean;
  };
  exportSettings: {
    resolutionPreset: ResolutionPreset;
    fps: 15 | 24 | 30 | 60;
    format: ExportFormat;
    gifPaletteMode?: 'per-frame' | 'global';
  };
}
