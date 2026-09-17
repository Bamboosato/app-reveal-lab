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

  // 必須フィールドの存在確認とフォールバック（0値の消失を防ぐため ?? を使用）
  const preset: AppRevealPreset = {
    schemaVersion: 1,
    id: parsed.id || `imported-${Date.now()}`,
    name: parsed.name ? String(parsed.name).slice(0, 50) : 'インポートされたプリセット',
    description: parsed.description ? String(parsed.description).slice(0, 200) : undefined,
    createdAt: parsed.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isBuiltin: false,
    canvas: {
      aspectRatio: parsed.canvas.aspectRatio || '1:1',
      fit: parsed.canvas.fit || 'contain',
      positionOffset: {
        x: Number(parsed.canvas.positionOffset?.x ?? 0),
        y: Number(parsed.canvas.positionOffset?.y ?? 0),
      },
      backgroundColor: parsed.canvas.backgroundColor || '#000000',
      transparent: Boolean(parsed.canvas.transparent),
    },
    animation: {
      mode: parsed.animation.mode || 'radial_out',
      duration: Math.max(0.5, Math.min(10.0, Number(parsed.animation.duration ?? 3.0))),
      startDelay: Math.max(0.0, Math.min(5.0, Number(parsed.animation.startDelay ?? 0.5))),
      holdTime: Math.max(0.0, Math.min(5.0, Number(parsed.animation.holdTime ?? 1.0))),
      mosaicSize: Math.max(4, Math.min(128, Number(parsed.animation.mosaicSize ?? 48))),
      feather: Math.max(0.0, Math.min(1.0, Number(parsed.animation.feather ?? 0.15))),
      easing: parsed.animation.easing || 'cubic',
      loop: parsed.animation.loop !== undefined ? Boolean(parsed.animation.loop) : true,
      seed: Number(parsed.animation.seed ?? 12345),
      gridSize: parsed.animation.gridSize !== undefined ? Number(parsed.animation.gridSize) : undefined,
      noiseStrength: parsed.animation.noiseStrength !== undefined ? Number(parsed.animation.noiseStrength) : undefined,
      lodSteps: parsed.animation.lodSteps !== undefined ? Number(parsed.animation.lodSteps) : undefined,
      lodSmooth: parsed.animation.lodSmooth !== undefined ? Boolean(parsed.animation.lodSmooth) : undefined,
    },
    exportSettings: {
      resolutionPreset: parsed.exportSettings?.resolutionPreset || '720p',
      fps: parsed.exportSettings?.fps || 30,
      format: parsed.exportSettings?.format || 'mp4',
      gifPaletteMode: parsed.exportSettings?.gifPaletteMode || 'per-frame',
    },
  };

  return preset;
}
