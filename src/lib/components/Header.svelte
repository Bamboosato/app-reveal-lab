<script lang="ts">
  interface Props {
    onSavePNG: () => void;
    onReset: () => void;
    onOpenExport: () => void;
    onOpenPreset: () => void;
  }

  const { onSavePNG, onReset, onOpenExport, onOpenPreset }: Props = $props();
</script>

<header style="border-bottom: 1px solid #374151; padding-bottom: 0.75rem; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
  <div>
    <div style="display: flex; align-items: center; gap: 0.6rem;">
      <img
        src="/pwa-192x192.png"
        alt="App Reveal Lab Icon"
        style="width: 36px; height: 36px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.15); flex-shrink: 0;"
      />
      <div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <h1 style="font-size: 1.35rem; font-weight: 700; margin: 0; color: #60a5fa; letter-spacing: -0.02em;">
            App Reveal Lab
          </h1>
          <span style="font-size: 0.7rem; background: #2563eb; color: white; padding: 0.15rem 0.4rem; border-radius: 4px; font-weight: 600;">
            MVP-3
          </span>
        </div>
        <p style="font-size: 0.8rem; color: #9ca3af; margin: 0.1rem 0 0;">
          プログレッシブ画像トランジション・スタジオ
        </p>
      </div>
    </div>
  </div>

  <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
    <button
      id="btn-open-preset"
      onclick={onOpenPreset}
      style="padding: 0.45rem 0.75rem; background: #374151; color: #d1d5db; border: 1px solid #4b5563; border-radius: 6px; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; gap: 0.25rem;"
    >
      <span>📂</span> プリセット
    </button>
    <button
      onclick={onReset}
      style="padding: 0.45rem 0.75rem; background: #374151; color: #d1d5db; border: 1px solid #4b5563; border-radius: 6px; font-size: 0.8rem; cursor: pointer;"
    >
      ↺ 初期値
    </button>
    <button
      onclick={onSavePNG}
      style="padding: 0.45rem 0.75rem; background: #374151; color: #d1d5db; border: 1px solid #4b5563; border-radius: 6px; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; gap: 0.25rem;"
    >
      <span>📷</span> 静止画
    </button>
    <button
      id="btn-open-export"
      onclick={onOpenExport}
      style="padding: 0.45rem 0.85rem; background: #2563eb; color: white; border: none; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 0.35rem;"
    >
      <span>🚀</span> エクスポート
    </button>
  </div>
</header>
