import type { CanvasSettings, EffectState } from '../core/types';
import type { ExportSettings } from '../export/exportTypes';
import type { AppRevealPreset } from './presetTypes';

/**
 * 現在のアプリ状態から AppRevealPreset オブジェクトを構築
 * （※画像データは含めない）
 */
export function createPresetFromState(
  name: string,
  canvasSettings: CanvasSettings,
  effectState: EffectState,
  exportSettings?: ExportSettings,
  description?: string
): AppRevealPreset {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: `custom-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: name.trim() || '無題のプリセット',
    description: description?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    isBuiltin: false,
    canvas: {
      aspectRatio: canvasSettings.aspectRatio,
      fit: canvasSettings.fit,
      positionOffset: { ...canvasSettings.positionOffset },
      backgroundColor: canvasSettings.backgroundColor,
      transparent: Boolean(canvasSettings.transparent),
    },
    animation: {
      mode: effectState.mode,
      duration: effectState.common.duration,
      startDelay: effectState.common.startDelay,
      holdTime: effectState.common.holdTime,
      mosaicSize: effectState.common.mosaicSize,
      feather: effectState.common.feather,
      easing: effectState.common.easing,
      loop: effectState.common.loop,
      seed: effectState.block.seed,
      gridSize: effectState.block.gridCount,
      noiseStrength: effectState.block.noiseStrength,
      lodSteps: effectState.lod.steps,
      lodSmooth: effectState.lod.smooth,
    },
    exportSettings: {
      resolutionPreset: exportSettings?.resolution || '720p',
      fps: exportSettings?.fps || 30,
      format: exportSettings?.format || 'mp4',
      gifPaletteMode: exportSettings?.gifPaletteMode || 'per-frame',
    },
  };
}

/**
 * プリセットをJSONファイルとしてブラウザからダウンロード
 */
export function exportPresetAsJSON(preset: AppRevealPreset): void {
  const jsonString = JSON.stringify(preset, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = preset.name.replace(/[^a-zA-Z0-9_\u3040-\u30FF\u4E00-\u9FFF-]/g, '_');
  a.href = url;
  a.download = `app-reveal-preset-${safeName}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const VALID_ASPECT_RATIOS = ['9:16', '1:1', '16:9', '4:5', 'original'] as const;
const VALID_FIT_MODES = ['contain', 'cover'] as const;
const VALID_EFFECT_MODES = ['radial_out', 'radial_in', 'linear_scan', 'block_scan', 'random_reveal', 'multi_step_lod'] as const;
const VALID_EASINGS = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'cubic'] as const;
const VALID_RESOLUTIONS = ['720p', '1080p'] as const;
const VALID_FORMATS = ['mp4', 'webm', 'gif', 'png'] as const;
const VALID_PALETTE_MODES = ['per-frame', 'global'] as const;

const VALID_FPS = [15, 24, 30, 60] as const;

function parseFiniteNumber(val: any, fallback: number, min?: number, max?: number): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return fallback;
  let clamped = n;
  if (min !== undefined) clamped = Math.max(min, clamped);
  if (max !== undefined) clamped = Math.min(max, clamped);
  return clamped;
}

function parseStrictBoolean(val: any, fallback: boolean): boolean;
function parseStrictBoolean(val: any, fallback: undefined): boolean | undefined;
function parseStrictBoolean(val: any, fallback?: boolean): boolean | undefined {
  if (typeof val === 'boolean') return val;
  if (val === 'true' || val === 1) return true;
  if (val === 'false' || val === 0) return false;
  return fallback;
}

/**
 * インポートされたJSON文字列をパースし、スキーマを検証
 */
export function parseAndValidatePresetJSON(jsonContent: string): AppRevealPreset {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (err: any) {
    throw new Error('無効なJSONファイルです: ' + err.message);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('プリセットのデータ形式が不正です。');
  }

  if (parsed.schemaVersion !== 1) {
    throw new Error(`非対応のスキーマバージョンです（対応バージョン: 1, 検出: ${parsed.schemaVersion}）。`);
  }

  if (!parsed.canvas || !parsed.animation) {
    throw new Error('プリセットに必須の設定項目（canvas または animation）が含まれていません。');
  }

  // 必須フィールドの存在確認、NaNチェック、ホワイトリスト検証（0値消失防止のため parseFiniteNumber / ?? を使用）
  const preset: AppRevealPreset = {
    schemaVersion: 1,
    id: parsed.id || `imported-${Date.now()}`,
    name: parsed.name ? String(parsed.name).slice(0, 50) : 'インポートされたプリセット',
    description: parsed.description ? String(parsed.description).slice(0, 200) : undefined,
    createdAt: parsed.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isBuiltin: false,
    canvas: {
      aspectRatio: VALID_ASPECT_RATIOS.includes(parsed.canvas.aspectRatio) ? parsed.canvas.aspectRatio : '1:1',
      fit: VALID_FIT_MODES.includes(parsed.canvas.fit) ? parsed.canvas.fit : 'contain',
      positionOffset: {
        x: parseFiniteNumber(parsed.canvas.positionOffset?.x, 0, -4096, 4096),
        y: parseFiniteNumber(parsed.canvas.positionOffset?.y, 0, -4096, 4096),
      },
      backgroundColor: typeof parsed.canvas.backgroundColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.canvas.backgroundColor)
        ? parsed.canvas.backgroundColor
        : '#000000',
      transparent: parseStrictBoolean(parsed.canvas.transparent, false),
    },
    animation: {
      mode: VALID_EFFECT_MODES.includes(parsed.animation.mode) ? parsed.animation.mode : 'radial_out',
      duration: parseFiniteNumber(parsed.animation.duration, 3.0, 0.5, 10.0),
      startDelay: parseFiniteNumber(parsed.animation.startDelay, 0.5, 0.0, 5.0),
      holdTime: parseFiniteNumber(parsed.animation.holdTime, 1.0, 0.0, 5.0),
      mosaicSize: Math.round(parseFiniteNumber(parsed.animation.mosaicSize, 48, 4, 128)),
      feather: parseFiniteNumber(parsed.animation.feather, 0.15, 0.0, 1.0),
      easing: VALID_EASINGS.includes(parsed.animation.easing) ? parsed.animation.easing : 'cubic',
      loop: parseStrictBoolean(parsed.animation.loop, true),
      seed: Math.round(parseFiniteNumber(parsed.animation.seed, 12345, 0, 999999)),
      gridSize: parsed.animation.gridSize !== undefined ? Math.round(parseFiniteNumber(parsed.animation.gridSize, 16, 4, 64)) : undefined,
      noiseStrength: parsed.animation.noiseStrength !== undefined ? parseFiniteNumber(parsed.animation.noiseStrength, 0.5, 0.0, 1.0) : undefined,
      lodSteps: parsed.animation.lodSteps !== undefined ? Math.round(parseFiniteNumber(parsed.animation.lodSteps, 4, 2, 8)) : undefined,
      lodSmooth: parsed.animation.lodSmooth !== undefined ? parseStrictBoolean(parsed.animation.lodSmooth, undefined) : undefined,
    },
    exportSettings: {
      resolutionPreset: VALID_RESOLUTIONS.includes(parsed.exportSettings?.resolutionPreset) ? parsed.exportSettings.resolutionPreset : '720p',
      fps: VALID_FPS.includes(Number(parsed.exportSettings?.fps) as any) ? (Number(parsed.exportSettings.fps) as (15 | 24 | 30 | 60)) : 30,
      format: VALID_FORMATS.includes(parsed.exportSettings?.format) ? parsed.exportSettings.format : 'mp4',
      gifPaletteMode: VALID_PALETTE_MODES.includes(parsed.exportSettings?.gifPaletteMode) ? parsed.exportSettings.gifPaletteMode : 'per-frame',
    },
  };

  return preset;
}
