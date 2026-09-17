import { get, set, del } from 'idb-keyval';
import type { AppRevealPreset } from './presetTypes';
import { BUILTIN_PRESETS } from './builtins';

const STORAGE_KEY_CUSTOM_PRESETS = 'app_reveal_custom_presets_v1';

/**
 * 保存されたカスタムプリセット一覧を取得
 */
export async function getCustomPresets(): Promise<AppRevealPreset[]> {
  try {
    const list = await get<AppRevealPreset[]>(STORAGE_KEY_CUSTOM_PRESETS);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error('Failed to load custom presets from IndexedDB:', err);
    return [];
  }
}

/**
 * 全プリセット（ビルトイン + カスタム）を取得
 */
export async function getAllPresets(): Promise<{ builtins: AppRevealPreset[]; custom: AppRevealPreset[] }> {
  const custom = await getCustomPresets();
  return {
    builtins: BUILTIN_PRESETS,
    custom,
  };
}

/**
 * カスタムプリセットを保存（新規または上書き）
 */
export async function saveCustomPreset(preset: AppRevealPreset): Promise<void> {
  const list = await getCustomPresets();
  const existingIdx = list.findIndex(p => p.id === preset.id);

  if (existingIdx >= 0) {
    list[existingIdx] = { ...preset, updatedAt: new Date().toISOString() };
  } else {
    list.unshift({ ...preset, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }

  await set(STORAGE_KEY_CUSTOM_PRESETS, list);
}

/**
 * カスタムプリセットを削除
 */
export async function deleteCustomPreset(id: string): Promise<void> {
  const list = await getCustomPresets();
  const filtered = list.filter(p => p.id !== id);
  await set(STORAGE_KEY_CUSTOM_PRESETS, filtered);
}

/**
 * 全カスタムプリセットをクリア
 */
export async function clearAllCustomPresets(): Promise<void> {
  await del(STORAGE_KEY_CUSTOM_PRESETS);
}
