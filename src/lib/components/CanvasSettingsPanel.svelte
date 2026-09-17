<script lang="ts">
  import type { CanvasSettings, AspectRatioPreset, FitMode } from '../core/types';
  import { loadImageFromFile } from '../core/imageLoader';

  interface Props {
    settings: CanvasSettings;
    onUpdateImage: (img: HTMLImageElement | HTMLCanvasElement) => void;
    onResetToSample: () => void;
  }

  let { settings = $bindable(), onUpdateImage, onResetToSample }: Props = $props();

  let isDragging = $state(false);

  const aspectPresets: { id: AspectRatioPreset; label: string; desc: string }[] = [
    { id: '9:16', label: '9:16', desc: 'Shorts / Reels' },
    { id: '1:1', label: '1:1', desc: 'Instagram' },
    { id: '16:9', label: '16:9', desc: 'YouTube / X' },
    { id: '4:5', label: '4:5', desc: 'Portrait' },
    { id: 'original', label: '元画像', desc: 'Original' },
  ];

  async function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      try {
        const img = await loadImageFromFile(input.files[0]);
        onUpdateImage(img);
      } catch (err: any) {
        alert(err.message);
      }
    }
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
      try {
        const img = await loadImageFromFile(e.dataTransfer.files[0]);
        onUpdateImage(img);
      } catch (err: any) {
        alert(err.message);
      }
    }
  }
</script>

<div style="background: #1f2937; border-radius: 8px; padding: 1rem; border: 1px solid #374151; display: flex; flex-direction: column; gap: 1rem;">
  <h2 style="font-size: 0.95rem; font-weight: 600; margin: 0; color: #60a5fa; display: flex; align-items: center; gap: 0.4rem;">
    <span>🖼️</span> 画像＆キャンバス設定
  </h2>

  <!-- 画像入力ドロップゾーン -->
  <div
    role="region"
    aria-label="画像ドロップエリア"
    ondragover={(e) => { e.preventDefault(); isDragging = true; }}
    ondragleave={() => { isDragging = false; }}
    ondrop={handleDrop}
    style="border: 2px dashed {isDragging ? '#3b82f6' : '#4b5563'}; border-radius: 6px; padding: 0.75rem; text-align: center; background: {isDragging ? 'rgba(59, 130, 246, 0.1)' : '#111827'}; transition: border 0.15s;"
  >
    <div style="font-size: 0.8rem; color: #9ca3af; margin-bottom: 0.5rem;">
      画像をドラッグ＆ドロップ、または
    </div>
    <div style="display: flex; justify-content: center; gap: 0.5rem;">
      <label style="padding: 0.35rem 0.75rem; background: #374151; color: white; border-radius: 4px; font-size: 0.8rem; cursor: pointer; border: 1px solid #4b5563;">
        ファイル選択
        <input type="file" accept="image/jpeg,image/png,image/webp" onchange={handleFileSelect} style="display: none;" />
      </label>
      <button
        onclick={onResetToSample}
        style="padding: 0.35rem 0.75rem; background: #1e3a8a; color: #93c5fd; border: 1px solid #1d4ed8; border-radius: 4px; font-size: 0.8rem; cursor: pointer;"
      >
        サンプル画像
      </button>
    </div>
  </div>

  <!-- アスペクト比プリセット -->
  <div>
    <div style="font-size: 0.8rem; color: #9ca3af; margin-bottom: 0.4rem;">
      出力アスペクト比:
    </div>
    <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.35rem;">
      {#each aspectPresets as p}
        <button
          onclick={() => { settings.aspectRatio = p.id; }}
          style="padding: 0.4rem 0.2rem; background: {settings.aspectRatio === p.id ? '#2563eb' : '#374151'}; color: white; border: none; border-radius: 4px; font-size: 0.75rem; cursor: pointer; text-align: center;"
        >
          <div style="font-weight: 600;">{p.label}</div>
          <div style="font-size: 0.65rem; color: {settings.aspectRatio === p.id ? '#dbeafe' : '#9ca3af'};">
            {p.desc}
          </div>
        </button>
      {/each}
    </div>
  </div>

  <!-- フィット方式 & 余白設定 -->
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
    <div>
      <div style="font-size: 0.8rem; color: #9ca3af; margin-bottom: 0.35rem;">配置方式:</div>
      <div style="display: flex; gap: 0.25rem;">
        <button
          onclick={() => { settings.fit = 'contain'; }}
          style="flex: 1; padding: 0.35rem; background: {settings.fit === 'contain' ? '#3b82f6' : '#374151'}; color: white; border: none; border-radius: 4px; font-size: 0.8rem; cursor: pointer;"
        >
          全体 (contain)
        </button>
        <button
          onclick={() => { settings.fit = 'cover'; }}
          style="flex: 1; padding: 0.35rem; background: {settings.fit === 'cover' ? '#3b82f6' : '#374151'}; color: white; border: none; border-radius: 4px; font-size: 0.8rem; cursor: pointer;"
        >
          全画面 (cover)
        </button>
      </div>
    </div>

    <div>
      <div style="font-size: 0.8rem; color: #9ca3af; margin-bottom: 0.35rem;">余白背景色:</div>
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <input
          type="color"
          bind:value={settings.backgroundColor}
          disabled={settings.fit === 'cover'}
          style="width: 36px; height: 32px; border: none; border-radius: 4px; background: transparent; cursor: pointer;"
        />
        <span style="font-size: 0.8rem; font-family: monospace; color: {settings.fit === 'cover' ? '#6b7280' : '#e5e7eb'};">
          {settings.backgroundColor}
        </span>
      </div>
    </div>
  </div>

  <!-- cover時のパン移動スライダー -->
  {#if settings.fit === 'cover'}
    <div style="background: #111827; padding: 0.6rem; border-radius: 6px; border: 1px solid #374151;">
      <div style="font-size: 0.75rem; color: #9ca3af; margin-bottom: 0.35rem;">
        画像表示位置（パン調整）:
      </div>
      <div style="display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.75rem;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span>水平 X: {settings.positionOffset.x.toFixed(2)}</span>
          <input
            type="range"
            min="-1.0"
            max="1.0"
            step="0.05"
            bind:value={settings.positionOffset.x}
            style="width: 60%; accent-color: #3b82f6;"
          />
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span>垂直 Y: {settings.positionOffset.y.toFixed(2)}</span>
          <input
            type="range"
            min="-1.0"
            max="1.0"
            step="0.05"
            bind:value={settings.positionOffset.y}
            style="width: 60%; accent-color: #3b82f6;"
          />
        </div>
      </div>
    </div>
  {/if}
</div>
