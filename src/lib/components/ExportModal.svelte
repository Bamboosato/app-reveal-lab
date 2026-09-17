<script lang="ts">
  import type { ExportFormat, ExportSettings, ExportResult } from '../export/exportTypes';
  import { estimateFileSize } from '../export/fileSizeEstimator';
  import type { RevealRenderer } from '../core/renderer';
  import type { EffectState, CanvasSettings } from '../core/types';
  import { ExportPipeline } from '../export/exportPipeline';
  import { checkVideoConfigSupported } from '../spike/capabilities';
  import { calculateCanvasDimensions } from '../core/imageLoader';

  interface Props {
    isOpen: boolean;
    renderer: RevealRenderer | null;
    effectState: EffectState;
    canvasSettings: CanvasSettings;
    exportSettings: ExportSettings;
    currentPreviewTime?: number;
    onClose: () => void;
  }

  let {
    isOpen,
    renderer,
    effectState,
    canvasSettings,
    exportSettings = $bindable(),
    currentPreviewTime = 0,
    onClose,
  }: Props = $props();

  let isExporting = $state(false);
  let isCanceling = $state(false);
  let progressPercent = $state(0);
  let statusText = $state('');
  let currentFrame = $state(0);
  let totalFrames = $state(0);
  let result = $state<ExportResult | null>(null);
  let errorMsg = $state<string | null>(null);

  // コーデック動的能力判定状態
  let codecSupport = $state<{
    mp4Supported: boolean;
    webmSupported: boolean;
    currentSupported: boolean;
    errorReason?: string;
  }>({
    mp4Supported: true,
    webmSupported: true,
    currentSupported: true,
  });

  let activePipeline: ExportPipeline | null = null;

  // 成果物Blob URLの破棄ヘルパー
  function cleanupBlobUrl() {
    if (result?.url) {
      URL.revokeObjectURL(result.url);
    }
  }

  let totalDuration = $derived(
    effectState.common.startDelay + effectState.common.duration + effectState.common.holdTime
  );

  let targetDimensions = $derived(
    calculateCanvasDimensions(
      canvasSettings.aspectRatio,
      exportSettings.resolution,
      renderer?.imageWidth || 1280,
      renderer?.imageHeight || 720
    )
  );

  let estimatedSize = $derived(
    estimateFileSize(
      exportSettings.format,
      exportSettings.resolution,
      exportSettings.fps,
      totalDuration
    )
  );

  // GIFの150フレーム制限警告チェック
  let gifFrames = $derived(Math.ceil(totalDuration * exportSettings.fps));
  let isGifOverLimit = $derived(exportSettings.format === 'gif' && gifFrames > 150);

  // 設定変更時のリアルタイム動的コーデック検証
  $effect(() => {
    if (!isOpen) return;

    const w = targetDimensions.width;
    const h = targetDimensions.height;
    const fps = exportSettings.fps;

    let isSubscribed = true;

    async function check() {
      if (exportSettings.format === 'gif' || exportSettings.format === 'png') {
        if (isSubscribed) {
          codecSupport.currentSupported = true;
          codecSupport.errorReason = undefined;
        }
        return;
      }

      const res = await checkVideoConfigSupported(exportSettings.format, w, h, fps);
      if (isSubscribed) {
        codecSupport.currentSupported = res.supported;
        codecSupport.errorReason = res.error;
      }
    }

    check();

    return () => {
      isSubscribed = false;
    };
  });

  // モーダルオープン時の全体コーデック能力判定
  $effect(() => {
    if (!isOpen) return;

    const w = targetDimensions.width;
    const h = targetDimensions.height;
    const fps = exportSettings.fps;

    let isSubscribed = true;

    async function checkAll() {
      const [mp4, webm] = await Promise.all([
        checkVideoConfigSupported('mp4', w, h, fps),
        checkVideoConfigSupported('webm', w, h, fps),
      ]);

      if (isSubscribed) {
        codecSupport.mp4Supported = mp4.supported;
        codecSupport.webmSupported = webm.supported;
      }
    }

    checkAll();

    return () => {
      isSubscribed = false;
    };
  });

  function handleCloseModal() {
    cleanupBlobUrl();
    result = null;
    onClose();
  }

  // フォーマット切り替え時のfps自動調整
  function handleFormatChange(fmt: ExportFormat) {
    exportSettings.format = fmt;
    if (fmt === 'gif' && exportSettings.fps > 30) {
      exportSettings.fps = 15;
    }
  }

  async function startExport() {
    if (!renderer) return;
    cleanupBlobUrl();
    isExporting = true;
    isCanceling = false;
    progressPercent = 0;
    statusText = 'エクスポート準備中...';
    result = null;
    errorMsg = null;

    activePipeline = new ExportPipeline();

    try {
      const res = await activePipeline.run(
        renderer,
        effectState,
        canvasSettings,
        exportSettings,
        (pct, frame, total, text) => {
          progressPercent = pct;
          currentFrame = frame;
          totalFrames = total;
          statusText = text;
        },
        currentPreviewTime
      );
      result = res;
    } catch (err: any) {
      errorMsg = err?.message || 'エクスポート中にエラーが発生しました。';
    } finally {
      isExporting = false;
      isCanceling = false;
      activePipeline = null;
    }
  }

  async function handleCancel() {
    if (activePipeline && !isCanceling) {
      isCanceling = true;
      statusText = 'キャンセル処理中...';
      try {
        await activePipeline.cancel();
      } catch {
        // ignore
      }
    }
  }

  async function handleShare() {
    if (!result) return;
    const fileName = `app-reveal-${effectState.mode}.${result.format}`;
    const file = new File([result.blob], fileName, { type: result.mimeType });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'App Reveal Lab',
          text: 'App Reveal Lab で作成したプログレッシブ画像演出',
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          alert('共有エラー: ' + err.message);
        }
      }
    } else {
      alert('お使いの環境はファイルの直接共有に対応していません。ダウンロードをご利用ください。');
    }
  }
</script>

{#if isOpen}
  <!-- モーダル背景オーバーレイ -->
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    style="position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); z-index: 50; display: flex; align-items: center; justify-content: center; padding: 1rem;"
  >
    <div
      style="background: #1f2937; border-radius: 12px; border: 1px solid #374151; width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto; color: #f3f4f6; padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);"
    >
      <!-- モーダルヘッダー -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #374151; padding-bottom: 0.75rem;">
        <h2 id="modal-title" style="font-size: 1.1rem; font-weight: 700; margin: 0; color: #60a5fa; display: flex; align-items: center; gap: 0.4rem;">
          <span>🚀</span> エクスポート（書き出し）
        </h2>
        <button
          onclick={handleCloseModal}
          disabled={isExporting}
          style="background: transparent; border: none; color: #9ca3af; font-size: 1.25rem; cursor: pointer; padding: 0.2rem 0.5rem; line-height: 1;"
        >
          ✕
        </button>
      </div>

      {#if !result}
        <!-- 出力設定セクション -->
        <!-- 1. フォーマット選択タブ -->
        <div>
          <div style="font-size: 0.8rem; color: #9ca3af; margin-bottom: 0.4rem;">出力形式:</div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.4rem;">
            {#each [
              { id: 'mp4', label: 'MP4 (標準)', icon: '📹', disabled: !codecSupport.mp4Supported },
              { id: 'webm', label: 'WebM (Web)', icon: '🌐', disabled: !codecSupport.webmSupported },
              { id: 'gif', label: 'GIF (アニメ)', icon: '🖼️', disabled: false },
              { id: 'png', label: 'PNG (静止画)', icon: '📷', disabled: false }
            ] as f}
              <button
                onclick={() => handleFormatChange(f.id as ExportFormat)}
                disabled={isExporting || f.disabled}
                style="padding: 0.5rem 0.2rem; background: {exportSettings.format === f.id ? '#2563eb' : '#111827'}; color: white; border: 1px solid {exportSettings.format === f.id ? '#60a5fa' : '#374151'}; border-radius: 6px; font-size: 0.75rem; cursor: {f.disabled ? 'not-allowed' : 'pointer'}; text-align: center; opacity: {f.disabled ? 0.35 : 1};"
              >
                <div>{f.icon}</div>
                <div style="font-weight: 600; margin-top: 0.2rem;">{f.label}</div>
              </button>
            {/each}
          </div>
        </div>

        <!-- 2. 解像度＆フレームレート設定 -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
          <div>
            <div style="font-size: 0.8rem; color: #9ca3af; margin-bottom: 0.35rem;">解像度プリセット:</div>
            <div style="display: flex; gap: 0.3rem;">
              <button
                onclick={() => { exportSettings.resolution = '720p'; }}
                disabled={isExporting}
                style="flex: 1; padding: 0.4rem; background: {exportSettings.resolution === '720p' ? '#3b82f6' : '#111827'}; color: white; border: 1px solid #374151; border-radius: 4px; font-size: 0.8rem; cursor: pointer;"
              >
                720p相当
              </button>
              <button
                onclick={() => { exportSettings.resolution = '1080p'; }}
                disabled={isExporting || exportSettings.format === 'gif'}
                style="flex: 1; padding: 0.4rem; background: {exportSettings.resolution === '1080p' ? '#3b82f6' : '#111827'}; color: white; border: 1px solid #374151; border-radius: 4px; font-size: 0.8rem; cursor: pointer; opacity: {exportSettings.format === 'gif' ? 0.4 : 1};"
              >
                1080p相当
              </button>
            </div>
          </div>

          <div>
            <div style="font-size: 0.8rem; color: #9ca3af; margin-bottom: 0.35rem;">フレームレート (fps):</div>
            <select
              bind:value={exportSettings.fps}
              disabled={isExporting || exportSettings.format === 'png'}
              style="width: 100%; background: #111827; color: white; border: 1px solid #374151; padding: 0.4rem; border-radius: 4px; font-size: 0.8rem;"
            >
              <option value={15}>15 fps (軽量)</option>
              <option value={24} disabled={exportSettings.format === 'gif'}>24 fps (映画風)</option>
              <option value={30}>30 fps (標準)</option>
              <option value={60} disabled={exportSettings.format === 'gif'}>60 fps (高滑らか)</option>
            </select>
          </div>
        </div>

        <!-- GIF固有設定 -->
        {#if exportSettings.format === 'gif'}
          <div style="background: #111827; padding: 0.6rem; border-radius: 6px; border: 1px solid #374151;">
            <div style="font-size: 0.75rem; color: #9ca3af; margin-bottom: 0.35rem;">GIF パレット方式:</div>
            <div style="display: flex; gap: 0.5rem; font-size: 0.75rem;">
              <label style="display: flex; align-items: center; gap: 0.25rem; cursor: pointer;">
                <input type="radio" bind:group={exportSettings.gifPaletteMode} value="per-frame" />
                フレーム別 (高品質)
              </label>
              <label style="display: flex; align-items: center; gap: 0.25rem; cursor: pointer;">
                <input type="radio" bind:group={exportSettings.gifPaletteMode} value="global" />
                グローバル (高速)
              </label>
            </div>
          </div>
        {/if}

        <!-- 情報バッジ（推定サイズ & 時間） -->
        <div style="background: #111827; padding: 0.6rem 0.8rem; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
          <div>
            <span style="color: #9ca3af;">総出力時間:</span>
            <strong> {totalDuration.toFixed(1)} 秒</strong>
          </div>
          <div>
            <span style="color: #9ca3af;">推定ファイルサイズ:</span>
            <strong style="color: #34d399;"> {estimatedSize}</strong>
          </div>
        </div>

        <!-- コーデック非対応警告 -->
        {#if !codecSupport.currentSupported && (exportSettings.format === 'mp4' || exportSettings.format === 'webm')}
          <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 6px; padding: 0.6rem; font-size: 0.75rem; color: #fca5a5;">
            ⚠️ <strong>非対応設定:</strong> {codecSupport.errorReason || 'お使いの環境はこの設定での動画出力に対応していません。解像度やfpsを下げるか、WebM/GIFをお試しください。'}
          </div>
        {/if}

        <!-- GIF制限警告 -->
        {#if isGifOverLimit}
          <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 6px; padding: 0.6rem; font-size: 0.75rem; color: #fca5a5;">
            ⚠️ <strong>GIFフレーム数上限超過:</strong> 現在の設定では {gifFrames} フレーム（上限: 150フレーム）になります。演出時間を短くするか、15fpsを選択してください。
          </div>
        {/if}

        <!-- エラー表示 -->
        {#if errorMsg}
          <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 6px; padding: 0.6rem; font-size: 0.75rem; color: #fca5a5;">
            ❌ {errorMsg}
          </div>
        {/if}

        <!-- 進捗プログレスバー（生成中のみ表示） -->
        {#if isExporting}
          <div style="background: #111827; padding: 0.75rem; border-radius: 6px; border: 1px solid #2563eb;">
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.4rem;">
              <span>{statusText}</span>
              <strong style="color: #60a5fa;">{progressPercent}%</strong>
            </div>
            <div style="width: 100%; height: 8px; background: #374151; border-radius: 4px; overflow: hidden;">
              <div style="width: {progressPercent}%; height: 100%; background: #2563eb; transition: width 0.1s;"></div>
            </div>
            <button
              onclick={handleCancel}
              disabled={isCanceling}
              style="margin-top: 0.6rem; width: 100%; padding: 0.35rem; background: {isCanceling ? '#4b5563' : '#ef4444'}; color: white; border: none; border-radius: 4px; font-size: 0.75rem; cursor: {isCanceling ? 'not-allowed' : 'pointer'};"
            >
              {isCanceling ? '⏳ キャンセル処理中...' : '❌ 生成を中止する'}
            </button>
          </div>
        {:else}
          <!-- アクションボタン -->
          {@const isActionDisabled = isGifOverLimit || !codecSupport.currentSupported}
          <button
            onclick={startExport}
            disabled={isActionDisabled}
            style="width: 100%; padding: 0.75rem; background: {isActionDisabled ? '#4b5563' : '#2563eb'}; color: white; border: none; border-radius: 8px; font-weight: 700; font-size: 0.95rem; cursor: {isActionDisabled ? 'not-allowed' : 'pointer'}; display: flex; align-items: center; justify-content: center; gap: 0.4rem;"
          >
            <span>🚀</span> {exportSettings.format.toUpperCase()} を生成する
          </button>
        {/if}

      {:else}
        <!-- 生成完了画面 -->
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; border-radius: 6px; padding: 0.6rem; display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
            <span style="font-weight: 600; color: #34d399;">✅ 生成が完了しました！</span>
            <span style="font-size: 0.75rem; color: #9ca3af;">{result.elapsedTimeMs} ms</span>
          </div>

          <!-- 成果物情報 -->
          <div style="font-size: 0.8rem; color: #d1d5db; display: flex; justify-content: space-between; background: #111827; padding: 0.5rem 0.75rem; border-radius: 6px;">
            <span>解像度: <strong>{result.width} × {result.height}</strong></span>
            <span>ファイルサイズ: <strong style="color: #34d399;">{(result.fileSizeBytes / 1024).toFixed(1)} KB</strong></span>
            <span>総フレーム: <strong>{result.totalFrames}</strong></span>
          </div>

          <!-- 成果物プレビュー -->
          <div style="background: #000; border-radius: 6px; overflow: hidden; max-height: 240px; display: flex; align-items: center; justify-content: center;">
            {#if result.format === 'mp4' || result.format === 'webm'}
              <video
                src={result.url}
                controls
                autoplay
                loop
                muted
                style="width: 100%; max-height: 240px; object-fit: contain;"
              ></video>
            {:else}
              <img
                src={result.url}
                alt="エクスポート成果物プレビュー"
                style="width: 100%; max-height: 240px; object-fit: contain;"
              />
            {/if}
          </div>

          <!-- アクションボタン群 -->
          <div style="display: flex; gap: 0.5rem; margin-top: 0.25rem;">
            <a
              href={result.url}
              download="app-reveal-{effectState.mode}.{result.format}"
              style="flex: 1; text-align: center; padding: 0.6rem; background: #374151; color: white; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 0.85rem;"
            >
              💾 ダウンロード
            </a>
            <button
              onclick={handleShare}
              style="flex: 1; padding: 0.6rem; background: #059669; color: white; border: none; border-radius: 6px; font-weight: 600; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.3rem;"
            >
              <span>📱</span> 共有シート
            </button>
          </div>

          <button
            onclick={() => { cleanupBlobUrl(); result = null; }}
            style="padding: 0.4rem; background: transparent; border: 1px solid #4b5563; color: #9ca3af; border-radius: 6px; font-size: 0.8rem; cursor: pointer;"
          >
            ← 設定に戻る
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
