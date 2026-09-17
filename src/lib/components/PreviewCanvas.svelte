<script lang="ts">
  import type { AspectRatioPreset, ResolutionDimension } from '../core/types';

  interface Props {
    canvasEl: HTMLCanvasElement | null;
    currentTime: number;
    totalDuration: number;
    isPlaying: boolean;
    aspectRatio: AspectRatioPreset;
    dimensions: ResolutionDimension;
    loop: boolean;
    onTogglePlay: () => void;
    onSeek: (time: number) => void;
    onRewind: () => void;
    onToggleLoop: () => void;
    bindCanvas: (el: HTMLCanvasElement) => void;
  }

  let {
    canvasEl = $bindable(null),
    currentTime,
    totalDuration,
    isPlaying,
    aspectRatio,
    dimensions,
    loop,
    onTogglePlay,
    onSeek,
    onRewind,
    onToggleLoop,
    bindCanvas,
  }: Props = $props();

  let containerEl = $state<HTMLDivElement | null>(null);

  // フルスクリーン切り替え
  function toggleFullScreen() {
    if (!containerEl) return;
    if (!document.fullscreenElement) {
      containerEl.requestFullscreen().catch((err) => alert(err.message));
    } else {
      document.exitFullscreen();
    }
  }

  function handleSliderInput(e: Event) {
    const val = parseFloat((e.target as HTMLInputElement).value);
    onSeek(val);
  }

  // アスペクト比のCSS計算
  const cssAspectRatio = $derived.by(() => {
    return `${dimensions.width} / ${dimensions.height}`;
  });
</script>

<div
  bind:this={containerEl}
  style="background: #1f2937; border-radius: 8px; padding: 1rem; border: 1px solid #374151; display: flex; flex-direction: column; gap: 0.75rem;"
>
  <!-- プレビューヘッダー情報 -->
  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #9ca3af;">
    <div style="display: flex; align-items: center; gap: 0.5rem;">
      <span style="font-weight: 600; color: #e5e7eb;">リアルタイムプレビュー</span>
      <span style="background: #374151; padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.75rem;">
        {dimensions.width} × {dimensions.height}
      </span>
    </div>
    <button
      onclick={toggleFullScreen}
      title="全画面表示"
      style="background: transparent; border: none; color: #9ca3af; cursor: pointer; font-size: 1rem; padding: 0.2rem;"
    >
      ⛶
    </button>
  </div>

  <!-- Canvasコンテナ (アスペクト比維持) -->
  <div
    style="position: relative; width: 100%; max-height: 480px; aspect-ratio: {cssAspectRatio}; margin: 0 auto; background: #000000; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; box-shadow: inset 0 0 20px rgba(0,0,0,0.5);"
  >
    <canvas
      use:bindCanvas
      style="width: 100%; height: 100%; object-fit: contain; display: block;"
    ></canvas>
  </div>

  <!-- シークバー & タイムコード -->
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; margin-bottom: 0.25rem;">
      <span style="font-family: monospace; font-weight: 600; color: #60a5fa;">
        {currentTime.toFixed(2)}s / {totalDuration.toFixed(2)}s
      </span>
      <span style="font-size: 0.75rem; color: #9ca3af;">
        {((currentTime / (totalDuration || 1)) * 100).toFixed(0)}%
      </span>
    </div>

    <input
      type="range"
      min="0"
      max={totalDuration}
      step="0.01"
      value={currentTime}
      oninput={handleSliderInput}
      style="width: 100%; accent-color: #3b82f6; cursor: pointer;"
    />
  </div>

  <!-- コントロールボタン列 -->
  <div style="display: flex; gap: 0.5rem; align-items: center;">
    <button
      onclick={onTogglePlay}
      style="flex: 2; padding: 0.6rem; background: #2563eb; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.4rem;"
    >
      {#if isPlaying}
        <span>⏸</span> 一時停止
      {:else}
        <span>▶</span> 再生
      {/if}
    </button>

    <button
      onclick={onRewind}
      title="先頭へ巻き戻し"
      style="flex: 1; padding: 0.6rem; background: #374151; color: white; border: none; border-radius: 6px; cursor: pointer;"
    >
      ⏮ 先頭へ
    </button>

    <button
      onclick={onToggleLoop}
      style="padding: 0.6rem 0.8rem; background: {loop ? '#3b82f6' : '#374151'}; color: white; border: none; border-radius: 6px; font-size: 0.8rem; cursor: pointer;"
    >
      🔁 {loop ? 'ループON' : 'ループOFF'}
    </button>
  </div>
</div>
