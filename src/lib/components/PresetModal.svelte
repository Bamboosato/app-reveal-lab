<script lang="ts">
  import { onMount } from 'svelte';
  import type { AppRevealPreset } from '../preset/presetTypes';
  import { getAllPresets, saveCustomPreset, deleteCustomPreset } from '../preset/presetStorage';
  import { createPresetFromState, exportPresetAsJSON, parseAndValidatePresetJSON } from '../preset/presetSerializer';
  import type { CanvasSettings, EffectState } from '../core/types';
  import type { ExportSettings } from '../export/exportTypes';

  interface Props {
    isOpen: boolean;
    canvasSettings: CanvasSettings;
    effectState: EffectState;
    exportSettings?: ExportSettings;
    onClose: () => void;
    onApplyPreset: (preset: AppRevealPreset) => void;
  }

  let { isOpen, canvasSettings, effectState, exportSettings, onClose, onApplyPreset }: Props = $props();

  let activeTab = $state<'builtin' | 'custom'>('builtin');
  let builtinPresets = $state<AppRevealPreset[]>([]);
  let customPresets = $state<AppRevealPreset[]>([]);

  let newPresetName = $state('');
  let newPresetDesc = $state('');
  let statusMessage = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);

  let fileInputEl = $state<HTMLInputElement | null>(null);

  async function loadPresets() {
    try {
      const { builtins, custom } = await getAllPresets();
      builtinPresets = builtins;
      customPresets = custom;
    } catch (err: any) {
      errorMessage = 'プリセットの読み込みに失敗しました: ' + err.message;
    }
  }

  $effect(() => {
    if (isOpen) {
      loadPresets();
      statusMessage = null;
      errorMessage = null;
    }
  });

  async function handleSaveNewPreset() {
    if (!newPresetName.trim()) {
      errorMessage = 'プリセット名を入力してください。';
      return;
    }

    try {
      const preset = createPresetFromState(
        newPresetName,
        canvasSettings,
        effectState,
        exportSettings,
        newPresetDesc
      );
      await saveCustomPreset(preset);
      newPresetName = '';
      newPresetDesc = '';
      statusMessage = 'マイプリセットに保存しました！';
      errorMessage = null;
      await loadPresets();
      activeTab = 'custom';
    } catch (err: any) {
      errorMessage = '保存に失敗しました: ' + err.message;
    }
  }

  async function handleDelete(id: string) {
    if (confirm('このプリセットを削除してもよろしいですか？')) {
      try {
        await deleteCustomPreset(id);
        await loadPresets();
        statusMessage = 'プリセットを削除しました。';
      } catch (err: any) {
        errorMessage = '削除に失敗しました: ' + err.message;
      }
    }
  }

  function handleApply(preset: AppRevealPreset) {
    onApplyPreset(preset);
    onClose();
  }

  function handleExportJSON(preset: AppRevealPreset) {
    exportPresetAsJSON(preset);
  }

  function triggerImportJSON() {
    fileInputEl?.click();
  }

  async function handleFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    try {
      const text = await file.text();
      const preset = parseAndValidatePresetJSON(text);
      await saveCustomPreset(preset);
      await loadPresets();
      activeTab = 'custom';
      statusMessage = `「${preset.name}」をインポートして保存しました！`;
      errorMessage = null;
    } catch (err: any) {
      errorMessage = 'インポートエラー: ' + err.message;
    } finally {
      input.value = '';
    }
  }
</script>

{#if isOpen}
  <!-- モーダル背景オーバーレイ -->
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="preset-modal-title"
    style="position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); z-index: 50; display: flex; align-items: center; justify-content: center; padding: 1rem;"
  >
    <div
      style="background: #1f2937; border-radius: 12px; border: 1px solid #374151; width: 100%; max-width: 580px; max-height: 88vh; overflow-y: auto; color: #f3f4f6; padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);"
    >
      <!-- ヘッダー -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #374151; padding-bottom: 0.75rem;">
        <h2 id="preset-modal-title" style="font-size: 1.15rem; font-weight: 700; margin: 0; color: #60a5fa; display: flex; align-items: center; gap: 0.4rem;">
          <span>📂</span> プリセット管理
        </h2>
        <button
          onclick={onClose}
          style="background: transparent; border: none; color: #9ca3af; font-size: 1.25rem; cursor: pointer; padding: 0.2rem 0.5rem;"
        >
          ✕
        </button>
      </div>

      <!-- メッセージ表示 -->
      {#if statusMessage}
        <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; border-radius: 6px; padding: 0.5rem 0.75rem; font-size: 0.8rem; color: #34d399;">
          ✅ {statusMessage}
        </div>
      {/if}
      {#if errorMessage}
        <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 6px; padding: 0.5rem 0.75rem; font-size: 0.8rem; color: #fca5a5;">
          ❌ {errorMessage}
        </div>
      {/if}

      <!-- タブ切り替えバー ＆ JSON操作ボタン -->
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
        <div style="display: flex; gap: 0.4rem;">
          <button
            onclick={() => { activeTab = 'builtin'; }}
            style="padding: 0.4rem 0.8rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer; border: 1px solid #374151; background: {activeTab === 'builtin' ? '#2563eb' : '#111827'}; color: white;"
          >
            公式ビルトイン ({builtinPresets.length})
          </button>
          <button
            onclick={() => { activeTab = 'custom'; }}
            style="padding: 0.4rem 0.8rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer; border: 1px solid #374151; background: {activeTab === 'custom' ? '#2563eb' : '#111827'}; color: white;"
          >
            マイプリセット ({customPresets.length})
          </button>
        </div>

        <div style="display: flex; gap: 0.4rem;">
          <input
            type="file"
            accept=".json"
            bind:this={fileInputEl}
            onchange={handleFileSelected}
            style="display: none;"
          />
          <button
            onclick={triggerImportJSON}
            style="padding: 0.4rem 0.65rem; background: #374151; color: #e5e7eb; border: 1px solid #4b5563; border-radius: 6px; font-size: 0.75rem; cursor: pointer; display: flex; align-items: center; gap: 0.25rem;"
          >
            <span>📥</span> JSON読込
          </button>
        </div>
      </div>

      <!-- 現在の設定を新規保存セクション -->
      <div style="background: #111827; border: 1px solid #374151; border-radius: 8px; padding: 0.75rem;">
        <div style="font-size: 0.8rem; font-weight: 600; color: #9ca3af; margin-bottom: 0.4rem;">
          現在の編集状態を保存:
        </div>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <input
            type="text"
            placeholder="プリセット名（例: My Shorts Impact）"
            bind:value={newPresetName}
            style="flex: 2; min-width: 180px; background: #1f2937; border: 1px solid #4b5563; border-radius: 4px; padding: 0.4rem 0.6rem; color: white; font-size: 0.8rem;"
          />
          <input
            type="text"
            placeholder="メモ（任意）"
            bind:value={newPresetDesc}
            style="flex: 2; min-width: 140px; background: #1f2937; border: 1px solid #4b5563; border-radius: 4px; padding: 0.4rem 0.6rem; color: white; font-size: 0.8rem;"
          />
          <button
            onclick={handleSaveCurrent}
            style="padding: 0.4rem 0.85rem; background: #059669; color: white; border: none; border-radius: 4px; font-size: 0.8rem; font-weight: 600; cursor: pointer; white-space: nowrap;"
          >
            💾 保存
          </button>
        </div>
      </div>

      <!-- プリセット一覧 -->
      <div style="display: flex; flex-direction: column; gap: 0.6rem; max-height: 44vh; overflow-y: auto; padding-right: 0.25rem;">
        {#if activeTab === 'builtin'}
          {#each builtinPresets as p}
            <div style="background: #111827; border: 1px solid #374151; border-radius: 8px; padding: 0.75rem; display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;">
              <div style="flex: 1;">
                <div style="font-weight: 600; font-size: 0.9rem; color: #f3f4f6;">{p.name}</div>
                {#if p.description}
                  <div style="font-size: 0.75rem; color: #9ca3af; margin-top: 0.2rem;">{p.description}</div>
                {/if}
                <div style="display: flex; gap: 0.4rem; margin-top: 0.4rem; font-size: 0.7rem;">
                  <span style="background: #374151; padding: 0.15rem 0.4rem; border-radius: 3px; color: #60a5fa;">比率: {p.canvas.aspectRatio}</span>
                  <span style="background: #374151; padding: 0.15rem 0.4rem; border-radius: 3px; color: #34d399;">演出: {p.animation.mode}</span>
                  <span style="background: #374151; padding: 0.15rem 0.4rem; border-radius: 3px; color: #fbbf24;">{p.animation.duration}s</span>
                </div>
              </div>

              <div style="display: flex; gap: 0.35rem;">
                <button
                  onclick={() => handleExportJSON(p)}
                  title="JSONファイルとして保存"
                  style="padding: 0.4rem 0.5rem; background: #374151; color: #d1d5db; border: none; border-radius: 4px; font-size: 0.75rem; cursor: pointer;"
                >
                  JSON
                </button>
                <button
                  onclick={() => handleApply(p)}
                  style="padding: 0.4rem 0.8rem; background: #2563eb; color: white; border: none; border-radius: 4px; font-weight: 600; font-size: 0.8rem; cursor: pointer;"
                >
                  適用
                </button>
              </div>
            </div>
          {/each}
        {:else}
          {#if customPresets.length === 0}
            <div style="text-align: center; color: #9ca3af; padding: 2rem; font-size: 0.85rem;">
              保存されたマイプリセットはありません。<br />
              上のフォームから現在の設定を保存するか、JSONファイルを読み込んでください。
            </div>
          {:else}
            {#each customPresets as p}
              <div style="background: #111827; border: 1px solid #374151; border-radius: 8px; padding: 0.75rem; display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;">
                <div style="flex: 1;">
                  <div style="font-weight: 600; font-size: 0.9rem; color: #f3f4f6;">{p.name}</div>
                  {#if p.description}
                    <div style="font-size: 0.75rem; color: #9ca3af; margin-top: 0.2rem;">{p.description}</div>
                  {/if}
                  <div style="display: flex; gap: 0.4rem; margin-top: 0.4rem; font-size: 0.7rem;">
                    <span style="background: #374151; padding: 0.15rem 0.4rem; border-radius: 3px; color: #60a5fa;">比率: {p.canvas.aspectRatio}</span>
                    <span style="background: #374151; padding: 0.15rem 0.4rem; border-radius: 3px; color: #34d399;">演出: {p.animation.mode}</span>
                    <span style="background: #374151; padding: 0.15rem 0.4rem; border-radius: 3px; color: #fbbf24;">{p.animation.duration}s</span>
                  </div>
                </div>

                <div style="display: flex; gap: 0.35rem;">
                  <button
                    onclick={() => handleExportJSON(p)}
                    title="JSONファイルとして保存"
                    style="padding: 0.4rem 0.5rem; background: #374151; color: #d1d5db; border: none; border-radius: 4px; font-size: 0.75rem; cursor: pointer;"
                  >
                    JSON
                  </button>
                  <button
                    onclick={() => handleDelete(p.id)}
                    title="削除"
                    style="padding: 0.4rem 0.5rem; background: #ef4444; color: white; border: none; border-radius: 4px; font-size: 0.75rem; cursor: pointer;"
                  >
                    🗑
                  </button>
                  <button
                    onclick={() => handleApply(p)}
                    style="padding: 0.4rem 0.8rem; background: #2563eb; color: white; border: none; border-radius: 4px; font-weight: 600; font-size: 0.8rem; cursor: pointer;"
                  >
                    適用
                  </button>
                </div>
              </div>
            {/each}
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}
