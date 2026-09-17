<script lang="ts">
  import { onMount } from 'svelte';
  import Header from './lib/components/Header.svelte';
  import PreviewCanvas from './lib/components/PreviewCanvas.svelte';
  import CanvasSettingsPanel from './lib/components/CanvasSettingsPanel.svelte';
  import EffectPanel from './lib/components/EffectPanel.svelte';
  import ExportModal from './lib/components/ExportModal.svelte';
  import PresetModal from './lib/components/PresetModal.svelte';
  import { RevealRenderer } from './lib/core/renderer';
  import { calculateCanvasDimensions, generateSampleImage, loadImageFromFile } from './lib/core/imageLoader';
  import type { CanvasSettings, EffectState, ResolutionDimension } from './lib/core/types';
  import type { ExportSettings } from './lib/export/exportTypes';
  import type { AppRevealPreset } from './lib/preset/presetTypes';

  // 1. キャンバス初期設定
  function getDefaultCanvasSettings(): CanvasSettings {
    return {
      aspectRatio: '1:1',
      fit: 'contain',
      positionOffset: { x: 0, y: 0 },
      backgroundColor: '#000000',
    };
  }

  // 2. 演出初期設定
  function getDefaultEffectState(): EffectState {
    return {
      mode: 'radial_out',
      common: {
        duration: 6.0,
        startDelay: 0.5,
        holdTime: 1.5,
        mosaicSize: 64,
        feather: 0.15,
        easing: 'easeOut',
        loop: false,
        stagedReveal: true,
      },
      block: {
        gridCount: 16,
        noiseStrength: 0.5,
        seed: 12345,
      },
      lod: {
        steps: 6,
        smooth: false,
      },
    };
  }

  let canvasSettings = $state<CanvasSettings>(getDefaultCanvasSettings());
  let effectState = $state<EffectState>(getDefaultEffectState());
  let exportSettings = $state<ExportSettings>({
    format: 'mp4',
    resolution: '720p',
    fps: 30,
    gifPaletteMode: 'per-frame',
  });

  interface ToastData {
    message: string;
    type: 'warning' | 'info' | 'success' | 'update';
    actionText?: string;
    onAction?: () => void;
  }

  // トースト通知状態
  let toast = $state<ToastData | null>(null);
  let toastTimer: any = null;

  function showToast(msg: string, type: 'warning' | 'info' | 'success' = 'warning') {
    if (toastTimer) clearTimeout(toastTimer);
    toast = { message: msg, type };
    toastTimer = setTimeout(() => {
      toast = null;
    }, 4000);
  }

  function showUpdateToast(onUpdate: () => void) {
    if (toastTimer) clearTimeout(toastTimer);
    toast = {
      message: '新しいバージョンが利用可能です。',
      type: 'update',
      actionText: '再読み込み',
      onAction: onUpdate,
    };
  }

  // エクスポートモーダル状態
  let isExportModalOpen = $state(false);
  // プリセットモーダル状態
  let isPresetModalOpen = $state(false);

  // 再生制御状態
  let currentTime = $state(0);
  let isPlaying = $state(false);

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let renderer = $state<RevealRenderer | null>(null);
  let animFrameId: number | null = null;
  let lastFrameTime = 0;

  let imgWidth = $state(1280);
  let imgHeight = $state(720);

  // 計算プロパティ
  let totalDuration = $derived(
    effectState.common.startDelay + effectState.common.duration + effectState.common.holdTime
  );

  let dimensions = $derived<ResolutionDimension>(
    calculateCanvasDimensions(
      canvasSettings.aspectRatio,
      '720p',
      imgWidth,
      imgHeight
    )
  );

  // 寸法や設定変更時のレンダラーリサイズ＆再描画（再生中の二重描画は抑止）
  $effect(() => {
    if (renderer) {
      renderer.resize(dimensions.width, dimensions.height);
      if (!isPlaying) {
        renderCurrentFrame();
      }
    }
  });

  onMount(() => {
    if (canvasEl) {
      try {
        renderer = new RevealRenderer(canvasEl);
        renderer.resize(dimensions.width, dimensions.height);
        const sample = generateSampleImage(1280, 1280);
        renderer.setImage(sample, 1280, 1280);
        renderCurrentFrame();
      } catch (err: any) {
        alert('WebGL 2 初期化エラー: ' + err?.message);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      // 入力フォームフォーカス中は無視
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleSeek(Math.max(0, currentTime - 0.1));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleSeek(Math.min(totalDuration, currentTime + 0.1));
      } else if (e.code === 'KeyR' || e.code === 'Home') {
        e.preventDefault();
        handleRewind();
      }
    }

    async function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            try {
              const img = await loadImageFromFile(file, (msg) => showToast(msg));
              handleUpdateImage(img);
            } catch (err: any) {
              alert('クリップボード画像の読み込みに失敗しました: ' + err.message);
            }
            break;
          }
        }
      }
    }

    // PWA更新・オフライン準備イベントリスナー
    const handlePwaNeedRefresh = (e: Event) => {
      const customEvent = e as CustomEvent<{ updateSW: (reload?: boolean) => Promise<void> }>;
      showUpdateToast(async () => {
        if (customEvent.detail?.updateSW) {
          await customEvent.detail.updateSW(true);
        } else {
          window.location.reload();
        }
      });
    };

    const handlePwaOfflineReady = () => {
      showToast('オフラインで使用可能になりました。', 'success');
    };

    // prefers-reduced-motion 配慮: OSのアニメーション低減設定が有効な場合はループをオフ
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      effectState.common.loop = false;
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', handlePaste);
    window.addEventListener('pwa-need-refresh', handlePwaNeedRefresh);
    window.addEventListener('pwa-offline-ready', handlePwaOfflineReady);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste', handlePaste);
      window.removeEventListener('pwa-need-refresh', handlePwaNeedRefresh);
      window.removeEventListener('pwa-offline-ready', handlePwaOfflineReady);
      if (animFrameId) cancelAnimationFrame(animFrameId);
      renderer?.dispose();
    };
  });

  function renderCurrentFrame() {
    if (!renderer) return;
    renderer.renderAtTime(currentTime, effectState, canvasSettings);
  }

  // 再生ループ
  function startPlayback() {
    isPlaying = true;
    lastFrameTime = performance.now();

    function loop(now: number) {
      if (!isPlaying) return;
      const delta = (now - lastFrameTime) / 1000;
      lastFrameTime = now;

      currentTime += delta;
      if (currentTime >= totalDuration) {
        if (effectState.common.loop) {
          currentTime = 0;
        } else {
          currentTime = totalDuration;
          pausePlayback();
          renderCurrentFrame();
          return;
        }
      }

      renderCurrentFrame();
      animFrameId = requestAnimationFrame(loop);
    }

    animFrameId = requestAnimationFrame(loop);
  }

  function pausePlayback() {
    isPlaying = false;
    if (animFrameId) cancelAnimationFrame(animFrameId);
  }

  function togglePlay() {
    if (isPlaying) {
      pausePlayback();
    } else {
      if (currentTime >= totalDuration) {
        currentTime = 0;
      }
      startPlayback();
    }
  }

  function handleSeek(time: number) {
    pausePlayback();
    currentTime = time;
    renderCurrentFrame();
  }

  function handleRewind() {
    currentTime = 0;
    renderCurrentFrame();
  }

  function handleToggleLoop() {
    effectState.common.loop = !effectState.common.loop;
  }

  function handleUpdateImage(img: HTMLImageElement | HTMLCanvasElement) {
    const w = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
    const h = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
    imgWidth = w;
    imgHeight = h;
    if (renderer) {
      renderer.setImage(img, w, h);
      renderCurrentFrame();
    }
  }

  function handleResetToSample() {
    imgWidth = 1280;
    imgHeight = 1280;
    if (renderer) {
      const sample = generateSampleImage(1280, 1280);
      renderer.setImage(sample, 1280, 1280);
      renderCurrentFrame();
    }
  }

  function handleResetAll() {
    pausePlayback();
    canvasSettings = getDefaultCanvasSettings();
    effectState = getDefaultEffectState();
    exportSettings = {
      format: 'mp4',
      resolution: '720p',
      fps: 30,
      gifPaletteMode: 'per-frame',
    };
    currentTime = 0;
    handleResetToSample();
  }

  // プリセット適用
  function handleApplyPreset(preset: AppRevealPreset) {
    pausePlayback();
    // 1. キャンバス設定
    canvasSettings = {
      aspectRatio: preset.canvas.aspectRatio,
      fit: preset.canvas.fit,
      positionOffset: { ...preset.canvas.positionOffset },
      backgroundColor: preset.canvas.backgroundColor,
      transparent: Boolean(preset.canvas.transparent),
    };
    // 2. 演出設定（0値消失防止のため ?? を使用）
    effectState = {
      mode: preset.animation.mode,
      common: {
        duration: preset.animation.duration,
        startDelay: preset.animation.startDelay,
        holdTime: preset.animation.holdTime,
        mosaicSize: preset.animation.mosaicSize,
        feather: preset.animation.feather,
        easing: preset.animation.easing,
        loop: preset.animation.loop,
        stagedReveal: preset.animation.stagedReveal ?? true,
      },
      block: {
        gridCount: preset.animation.gridSize ?? 16,
        noiseStrength: preset.animation.noiseStrength ?? 0.5,
        seed: preset.animation.seed,
      },
      lod: {
        steps: preset.animation.lodSteps ?? 4,
        smooth: preset.animation.lodSmooth ?? false,
      },
    };
    // 3. 出力設定の反映（プリセット往復）
    if (preset.exportSettings) {
      exportSettings = {
        format: preset.exportSettings.format,
        resolution: preset.exportSettings.resolutionPreset,
        fps: preset.exportSettings.fps,
        gifPaletteMode: preset.exportSettings.gifPaletteMode ?? 'per-frame',
      };
    }
    currentTime = 0;
    renderCurrentFrame();
  }

  // PNGスナップショット保存
  async function handleSavePNG() {
    if (!renderer) return;
    try {
      const blob = await renderer.capturePNG(effectState, canvasSettings);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `app-reveal-${effectState.mode}-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      alert('PNG保存エラー: ' + err?.message);
    }
  }
</script>

<main style="max-width: 1280px; margin: 0 auto; padding: 1rem; font-family: system-ui, -apple-system, sans-serif; color: #f3f4f6; background: #111827; min-height: 100vh;">
  <!-- ヘッダー -->
  <Header
    onSavePNG={handleSavePNG}
    onReset={handleResetAll}
    onOpenExport={() => { isExportModalOpen = true; }}
    onOpenPreset={() => { isPresetModalOpen = true; }}
  />

  <!-- メインレイアウト: プレビュー (左) + 設定パネル群 (右) -->
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 1.5rem; align-items: start;">
    <!-- 左ペイン: プレビューCanvas -->
    <div>
      <PreviewCanvas
        bind:canvasEl
        {currentTime}
        {totalDuration}
        {isPlaying}
        aspectRatio={canvasSettings.aspectRatio}
        {dimensions}
        loop={effectState.common.loop}
        onTogglePlay={togglePlay}
        onSeek={handleSeek}
        onRewind={handleRewind}
        onToggleLoop={handleToggleLoop}
        bindCanvas={(el) => { canvasEl = el; }}
      />
    </div>

    <!-- 右ペイン: 各種設定パネル -->
    <div style="display: flex; flex-direction: column; gap: 1.25rem;">
      <!-- キャンバス＆画像設定 -->
      <CanvasSettingsPanel
        bind:settings={canvasSettings}
        onUpdateImage={handleUpdateImage}
        onResetToSample={handleResetToSample}
        onWarning={(msg) => showToast(msg)}
      />

      <!-- 演出モード＆パラメータ -->
      <EffectPanel bind:state={effectState} />
    </div>
  </div>

  <!-- エクスポートモーダル -->
  <ExportModal
    isOpen={isExportModalOpen}
    bind:exportSettings
    {renderer}
    {effectState}
    {canvasSettings}
    currentPreviewTime={currentTime}
    onClose={() => { isExportModalOpen = false; }}
  />

  <!-- プリセットモーダル -->
  <PresetModal
    isOpen={isPresetModalOpen}
    {canvasSettings}
    {effectState}
    {exportSettings}
    onClose={() => { isPresetModalOpen = false; }}
    onApplyPreset={handleApplyPreset}
  />

  <!-- トースト通知 -->
  {#if toast}
    <div
      role="status"
      style="position: fixed; bottom: 20px; right: 20px; background: #1f2937; color: {toast.type === 'warning' ? '#f59e0b' : toast.type === 'success' ? '#10b981' : '#60a5fa'}; border: 1px solid {toast.type === 'warning' ? '#f59e0b' : toast.type === 'success' ? '#10b981' : '#3b82f6'}; padding: 0.75rem 1.25rem; border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5); z-index: 100; font-size: 0.85rem; display: flex; align-items: center; gap: 0.75rem;"
    >
      <span>{toast.type === 'warning' ? '⚠️' : toast.type === 'success' ? '✅' : '🚀'}</span>
      <span>{toast.message}</span>
      {#if toast.actionText && toast.onAction}
        <button
          onclick={toast.onAction}
          style="background: #3b82f6; color: white; border: none; padding: 0.3rem 0.65rem; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 0.8rem;"
        >
          {toast.actionText}
        </button>
      {/if}
      <button
        onclick={() => { toast = null; }}
        style="background: transparent; border: none; color: #9ca3af; cursor: pointer; font-size: 1rem; margin-left: 0.25rem; line-height: 1;"
        title="閉じる"
      >
        ✕
      </button>
    </div>
  {/if}
</main>
