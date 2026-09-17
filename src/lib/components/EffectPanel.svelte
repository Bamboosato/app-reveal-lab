<script lang="ts">
  import type { EffectState, EffectMode, EasingType } from '../core/types';

  interface Props {
    state: EffectState;
  }

  let { state = $bindable() }: Props = $props();

  const effectModes: { id: EffectMode; label: string; icon: string; desc: string }[] = [
    { id: 'radial_out', label: '中心→外側', icon: '🎯', desc: '同心円状に拡大' },
    { id: 'radial_in', label: '外側→中心', icon: '🌀', desc: '中心へ収束' },
    { id: 'linear_scan', label: '上→下スキャン', icon: '⏬', desc: 'プログレッシブ走査' },
    { id: 'block_scan', label: 'ブロックノイズ', icon: '📶', desc: '先行出現ノイズ' },
    { id: 'random_reveal', label: 'ランダムブロック', icon: '🎲', desc: 'パズル状解像' },
    { id: 'multi_step_lod', label: '多段階LOD', icon: '🪜', desc: '解像度ステップ変化' },
  ];

  const easings: { id: EasingType; label: string }[] = [
    { id: 'cubic', label: 'Cubic EaseInOut (推奨)' },
    { id: 'easeInOut', label: 'Quad EaseInOut' },
    { id: 'easeOut', label: 'EaseOut' },
    { id: 'easeIn', label: 'EaseIn' },
    { id: 'linear', label: 'Linear' },
  ];

  function randomizeSeed() {
    state.block.seed = Math.floor(Math.random() * 100000);
  }

  function resetEffectParams() {
    state.common.duration = 3.0;
    state.common.startDelay = 0.5;
    state.common.holdTime = 1.0;
    state.common.mosaicSize = 48;
    state.common.feather = 0.15;
    state.common.easing = 'cubic';
    state.block.gridCount = 16;
    state.block.noiseStrength = 0.5;
    state.block.seed = 12345;
    state.lod.steps = 4;
    state.lod.smooth = false;
  }
</script>

<div style="background: #1f2937; border-radius: 8px; padding: 1rem; border: 1px solid #374151; display: flex; flex-direction: column; gap: 1rem;">
  <div style="display: flex; justify-content: space-between; align-items: center;">
    <h2 style="font-size: 0.95rem; font-weight: 600; margin: 0; color: #60a5fa; display: flex; align-items: center; gap: 0.4rem;">
      <span>✨</span> 演出モード＆パラメータ
    </h2>
    <button
      onclick={resetEffectParams}
      style="padding: 0.2rem 0.6rem; background: #374151; color: #d1d5db; border: 1px solid #4b5563; border-radius: 4px; font-size: 0.75rem; cursor: pointer;"
      title="演出パラメータを初期値にリセット"
    >
      演出リセット
    </button>
  </div>

  <!-- 6演出モード選択グリッド -->
  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem;">
    {#each effectModes as m}
      <button
        onclick={() => { state.mode = m.id; }}
        style="padding: 0.6rem 0.4rem; background: {state.mode === m.id ? '#2563eb' : '#111827'}; color: white; border: 1px solid {state.mode === m.id ? '#60a5fa' : '#374151'}; border-radius: 6px; font-size: 0.8rem; cursor: pointer; text-align: center; transition: all 0.15s;"
      >
        <div style="font-size: 1.1rem; margin-bottom: 0.2rem;">{m.icon}</div>
        <div style="font-weight: 600;">{m.label}</div>
        <div style="font-size: 0.65rem; color: {state.mode === m.id ? '#dbeafe' : '#9ca3af'}; margin-top: 0.15rem;">
          {m.desc}
        </div>
      </button>
    {/each}
  </div>

  <!-- 共通パラメータスライダー -->
  <div style="background: #111827; padding: 0.75rem; border-radius: 6px; border: 1px solid #374151; display: flex; flex-direction: column; gap: 0.6rem; font-size: 0.8rem;">
    <div style="font-weight: 600; color: #e5e7eb; margin-bottom: 0.2rem;">
      ⏱ 時間＆タイミング
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span>演出本編時間: {state.common.duration.toFixed(1)} 秒</span>
      <input
        type="range"
        min="1.0"
        max="10.0"
        step="0.5"
        bind:value={state.common.duration}
        style="width: 55%; accent-color: #3b82f6;"
      />
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span>開始待機時間: {state.common.startDelay.toFixed(1)} 秒</span>
      <input
        type="range"
        min="0.0"
        max="3.0"
        step="0.25"
        bind:value={state.common.startDelay}
        style="width: 55%; accent-color: #3b82f6;"
      />
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span>完成保持時間: {state.common.holdTime.toFixed(1)} 秒</span>
      <input
        type="range"
        min="0.0"
        max="3.0"
        step="0.25"
        bind:value={state.common.holdTime}
        style="width: 55%; accent-color: #3b82f6;"
      />
    </div>

    <div style="border-top: 1px solid #374151; padding-top: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
      <span>初期モザイク粗さ: {state.common.mosaicSize}px</span>
      <input
        type="range"
        min="8"
        max="128"
        step="4"
        bind:value={state.common.mosaicSize}
        style="width: 55%; accent-color: #3b82f6;"
      />
    </div>

    {#if state.mode !== 'random_reveal' && state.mode !== 'multi_step_lod'}
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span>境界ぼかし幅: {(state.common.feather * 100).toFixed(0)}%</span>
        <input
          type="range"
          min="0.01"
          max="0.4"
          step="0.01"
          bind:value={state.common.feather}
          style="width: 55%; accent-color: #3b82f6;"
        />
      </div>
    {/if}

    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span>イージング:</span>
      <select
        bind:value={state.common.easing}
        style="background: #374151; color: white; border: 1px solid #4b5563; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem;"
      >
        {#each easings as e}
          <option value={e.id}>{e.label}</option>
        {/each}
      </select>
    </div>

    {#if state.mode !== 'multi_step_lod'}
      <div style="border-top: 1px solid #374151; padding-top: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="font-weight: 500;">段階的ランダム解像:</span>
          <p style="font-size: 0.7rem; color: #9ca3af; margin: 0.1rem 0 0 0;">粗モザイクから段階的に高精細化</p>
        </div>
        <button
          onclick={() => { state.common.stagedReveal = state.common.stagedReveal === false ? true : false; }}
          style="padding: 0.25rem 0.6rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold; cursor: pointer; border: 1px solid {state.common.stagedReveal !== false ? '#3b82f6' : '#4b5563'}; background: {state.common.stagedReveal !== false ? '#2563eb' : '#374151'}; color: white;"
        >
          {state.common.stagedReveal !== false ? 'ON (多段階)' : 'OFF (2値)'}
        </button>
      </div>
    {/if}
  </div>

  <!-- 演出モード固有パラメータ -->
  {#if state.mode === 'block_scan' || state.mode === 'random_reveal'}
    <div style="background: #111827; padding: 0.75rem; border-radius: 6px; border: 1px solid #374151; display: flex; flex-direction: column; gap: 0.6rem; font-size: 0.8rem;">
      <div style="font-weight: 600; color: #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
        <span>🧩 ブロック固有設定</span>
        <button
          onclick={randomizeSeed}
          style="padding: 0.2rem 0.5rem; background: #374151; color: #93c5fd; border: 1px solid #4b5563; border-radius: 4px; font-size: 0.7rem; cursor: pointer;"
        >
          🎲 シード変更
        </button>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span>グリッド分割数: {state.block.gridCount} × {state.block.gridCount}</span>
        <div style="display: flex; gap: 0.25rem;">
          {#each [8, 16, 32, 64] as g}
            <button
              onclick={() => { state.block.gridCount = g; }}
              style="padding: 0.2rem 0.45rem; background: {state.block.gridCount === g ? '#3b82f6' : '#374151'}; color: white; border: none; border-radius: 3px; font-size: 0.75rem; cursor: pointer;"
            >
              {g}
            </button>
          {/each}
        </div>
      </div>

      {#if state.mode === 'block_scan'}
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span>ノイズ先行出現率: {(state.block.noiseStrength * 100).toFixed(0)}%</span>
          <input
            type="range"
            min="0.0"
            max="1.0"
            step="0.05"
            bind:value={state.block.noiseStrength}
            style="width: 55%; accent-color: #3b82f6;"
          />
        </div>
      {/if}

      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: #9ca3af;">
        <span>乱数シード値:</span>
        <input
          type="number"
          bind:value={state.block.seed}
          style="width: 80px; background: #374151; color: white; border: 1px solid #4b5563; padding: 0.15rem 0.3rem; border-radius: 4px; font-family: monospace;"
        />
      </div>
    </div>
  {/if}

  {#if state.mode === 'multi_step_lod'}
    <div style="background: #111827; padding: 0.75rem; border-radius: 6px; border: 1px solid #374151; display: flex; flex-direction: column; gap: 0.6rem; font-size: 0.8rem;">
      <div style="font-weight: 600; color: #e5e7eb;">
        🪜 多段階解像度 (LOD) 設定
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span>解像度段階数: {state.lod.steps} 段階</span>
        <input
          type="range"
          min="3"
          max="8"
          step="1"
          bind:value={state.lod.steps}
          style="width: 55%; accent-color: #3b82f6;"
        />
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span>変化方式:</span>
        <div style="display: flex; gap: 0.25rem;">
          <button
            onclick={() => { state.lod.smooth = false; }}
            style="padding: 0.25rem 0.5rem; background: {!state.lod.smooth ? '#3b82f6' : '#374151'}; color: white; border: none; border-radius: 3px; font-size: 0.75rem; cursor: pointer;"
          >
            階段状 (Stepped)
          </button>
          <button
            onclick={() => { state.lod.smooth = true; }}
            style="padding: 0.25rem 0.5rem; background: {state.lod.smooth ? '#3b82f6' : '#374151'}; color: white; border: none; border-radius: 3px; font-size: 0.75rem; cursor: pointer;"
          >
            連続 (Smooth)
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
