# App Reveal Lab

> **プログレッシブ画像トランジション・スタジオ (完全ローカル完結PWA)**  
> 1枚の画像をモザイク・低解像度から高解像度へ段階的に変化させる「プログレッシブ表示風」の演出を作成し、MP4動画やGIFアニメーションとして書き出せるWebアプリ。

---

## ✨ 主な機能

- **🚀 完全クライアントサイド完結**:
  - 利用者の画像・成果物は外部サーバーへ一切送信されず、端末内（GPU + WebAssembly + WebCodecs）で安全に高速処理。
  - PWA（Service Worker）により、ネットワーク切断状態（オフライン・機内モード）でも起動・描画・動画出力が完結。
- **🎨 6種類のGLSL演出シェーダー (WebGL 2 / twgl.js)**:
  1. `中心から外側へ (Radial Out)`: 同心円状に拡大するフォーカスイン
  2. `外側から中心へ (Radial In)`: 外周から被写体へ収束
  3. `上から下へ (Linear Scan)`: 古典的プログレッシブスキャンライン
  4. `ブロックノイズスキャン (Block Scan)`: 先行出現ノイズを伴うグリッド走査
  5. `ランダムブロック (Random Reveal)`: シード付き乱数でパズル状に解ける演出
  6. `多段階解像度 (Multi-Step LOD)`: 粗いモザイクから徐々に細密化するレトロゲーム調
- **📐 SNS向けアスペクト比プリセット**:
  - `9:16` (Shorts / Reels / TikTok)
  - `1:1` (Instagram / アイコン)
  - `16:9` (YouTube / X)
  - `4:5` (Portrait)
  - `元画像準拠 (Original)`
  - GPUによる `contain` / `cover` / パン位置オフセット / 背景色のネイティブ合成
- **📹 固定タイムライン（Fixed-Timestep）高画質エクスポート**:
  - **MP4**: WebCodecs `VideoEncoder` + `Mediabunny` による高速H.264エンコード（偶数ピクセル補正）
  - **WebM**: VP9による高画質Web向け動画エンコード
  - **GIF**: Web Worker 内での `gifenc` ストリーミング逐次量子化（最大150フレーム制限ガード）
  - **PNG**: 完成状態の高解像度スナップショット保存
  - **Web Share API**: スマートフォンOS共有シートへの直接引き渡し＆ダウンロード保存
- **📂 プリセット管理 & 設定JSON入出力**:
  - 5種類の公式ビルトインプリセット（SNSショート、シネマティック、レトロLOD等）
  - IndexedDB (`idb-keyval`) によるマイプリセット保存・即時復元
  - プライバシー保護に配慮した設定JSONエクスポート／インポート（schemaVersion: 1、画像非含有）
- **⌨️ キーボードショートカット**:
  - `Space`: 再生 / 一時停止
  - `←` / `→`: スクラブシーク（±0.1s）
  - `Home` / `R`: 先頭へ復帰

---

## 🛠️ 技術スタック

| 分類 | 採用技術 | 選定理由 |
|---|---|---|
| **UIフレームワーク** | **Svelte 5 (Runes) + Vite** | 超軽量・高速・仮想DOMなしによるWebGL直接制御 |
| **WebGLエンジン** | **twgl.js (WebGL 2 / GLSL ES 3.00)** | フルスクリーンシェーダーのオーバーヘッド最小化 |
| **動画エンコード** | **WebCodecs + Mediabunny** | ブラウザネイティブハードウェアアクセラレーション |
| **GIFエンコード** | **gifenc (Web Worker)** | メインスレッドをブロックしない逐次パレット量子化 |
| **ストレージ** | **idb-keyval (IndexedDB)** | クライアントローカルでのプリセット永続化 |
| **PWA / オフライン** | **vite-plugin-pwa** | 完全オフライン動作とアセットPrecaching |

---

## 🚀 クイックスタート

### 動作要件
- Node.js 18+ (推奨: v20+)
- npm または pnpm / yarn

### インストールと起動

```bash
# 依存関係のインストール
npm install

# 開発サーバー起動
npm run dev

# 本番ビルド
npm run build

# ビルド成果物のプレビュー（PWA・Service Worker確認）
npm run preview
```

---

## 📄 ライセンス

MIT License
