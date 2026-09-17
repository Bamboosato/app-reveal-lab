export const VERTEX_SHADER = `#version 300 es
in vec2 position;
out vec2 v_canvasUv;

void main() {
  // スクリーン座標 [-1, 1] を UV 座標 [0, 1] に変換
  v_canvasUv = (position + 1.0) * 0.5;
  // WebGLのY軸反転補正
  v_canvasUv.y = 1.0 - v_canvasUv.y;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_canvasUv;
out vec4 fragColor;

// テクスチャと寸法
uniform sampler2D u_texture;
uniform vec2 u_canvasRes;    // キャンバス解像度 (width, height)
uniform vec2 u_imageRes;     // 入力画像の解像度 (width, height)
uniform int u_fitMode;       // 0: contain, 1: cover
uniform vec2 u_panOffset;    // -1.0 ~ 1.0
uniform vec4 u_bgColor;      // 余白背景色 (RGBA)

// 演出パラメータ
uniform int u_mode;          // 0: radial_out, 1: radial_in, 2: linear_scan, 3: block_scan, 4: random_reveal, 5: multi_step_lod
uniform float u_progress;    // 0.0 ~ 1.0
uniform float u_mosaicSize;  // 開始時モザイクサイズ（ピクセル）
uniform float u_feather;     // 境界ぼかし幅 (0.01 ~ 0.5)

// ブロック系固有パラメータ
uniform float u_gridCount;   // 分割数 (8, 16, 32, 64)
uniform float u_noiseStrength; // 先行ブロック出現率 (0.0 ~ 1.0)
uniform float u_seed;        // 乱数シード

// LOD固有パラメータ
uniform int u_lodSteps;      // 段階数 (3 ~ 8)
uniform int u_lodSmooth;     // 0: 階段状, 1: 連続フェード

// 疑似乱数ハッシュ関数 (シード付き)
float hash21(vec2 p, float seed) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973) + seed * 0.1337);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 canvasUv = v_canvasUv;
  float canvasAspect = u_canvasRes.x / u_canvasRes.y;
  float imageAspect = u_imageRes.x / u_imageRes.y;

  // 1. contain / cover による画像UVへのマッピング変換
  vec2 imageUv = canvasUv;
  bool isOutOfBounds = false;

  if (u_fitMode == 0) {
    // contain (全体表示・余白背景)
    if (canvasAspect > imageAspect) {
      // キャンバスの方が横長 -> 左右に余白
      float scale = imageAspect / canvasAspect;
      imageUv.x = (canvasUv.x - 0.5) / scale + 0.5;
      if (imageUv.x < 0.0 || imageUv.x > 1.0) {
        isOutOfBounds = true;
      }
    } else {
      // キャンバスの方が縦長 -> 上下に余白
      float scale = canvasAspect / imageAspect;
      imageUv.y = (canvasUv.y - 0.5) / scale + 0.5;
      if (imageUv.y < 0.0 || imageUv.y > 1.0) {
        isOutOfBounds = true;
      }
    }
  } else {
    // cover (全画面フィット・トリミング & パン移動)
    vec2 scale = vec2(1.0);
    if (canvasAspect > imageAspect) {
      // キャンバスの方が横長 -> 上下をトリミング
      scale.y = canvasAspect / imageAspect;
    } else {
      // キャンバスの方が縦長 -> 左右をトリミング
      scale.x = imageAspect / canvasAspect;
    }
    // パンオフセットを適用 (オフセット範囲をスケールに合わせる)
    vec2 offset = u_panOffset * 0.5 * (scale - 1.0);
    imageUv = (canvasUv - 0.5) * scale + 0.5 + offset;
  }

  // contain の余白部分は背景色を描画
  if (isOutOfBounds) {
    fragColor = u_bgColor;
    return;
  }

  // 2. モザイク色の算出
  float currentBlockSize = max(1.0, mix(u_mosaicSize, 1.0, u_progress));
  vec2 mosaicGrid = u_canvasRes / currentBlockSize;
  vec2 mosaicCanvasUv = floor(canvasUv * mosaicGrid) / mosaicGrid;

  // モザイクUVに対応する画像UVを算出
  vec2 mosaicImageUv = imageUv;
  if (u_fitMode == 0) {
    if (canvasAspect > imageAspect) {
      float scale = imageAspect / canvasAspect;
      mosaicImageUv.x = (mosaicCanvasUv.x - 0.5) / scale + 0.5;
    } else {
      float scale = canvasAspect / imageAspect;
      mosaicImageUv.y = (mosaicCanvasUv.y - 0.5) / scale + 0.5;
    }
  } else {
    vec2 scale = vec2(1.0);
    if (canvasAspect > imageAspect) {
      scale.y = canvasAspect / imageAspect;
    } else {
      scale.x = imageAspect / canvasAspect;
    }
    vec2 offset = u_panOffset * 0.5 * (scale - 1.0);
    mosaicImageUv = (mosaicCanvasUv - 0.5) * scale + 0.5 + offset;
  }
  mosaicImageUv = clamp(mosaicImageUv, 0.0, 1.0);

  vec4 fullResColor = texture(u_texture, clamp(imageUv, 0.0, 1.0));
  vec4 mosaicColor = texture(u_texture, mosaicImageUv);

  // 3. 演出モード別の進行マスク計算
  float reveal = 0.0;
  float feather = max(0.001, u_feather);

  if (u_mode == 0) {
    // Mode 0: 中心から外側へ (Radial Out)
    vec2 diff = canvasUv - vec2(0.5);
    diff.x *= canvasAspect;
    float dist = length(diff);
    float maxDist = length(vec2(0.5 * canvasAspect, 0.5));
    float currentRadius = u_progress * (maxDist + feather);
    reveal = 1.0 - smoothstep(max(0.0, currentRadius - feather), currentRadius, dist);
  }
  else if (u_mode == 1) {
    // Mode 1: 外側から中心へ (Radial In)
    vec2 diff = canvasUv - vec2(0.5);
    diff.x *= canvasAspect;
    float dist = length(diff);
    float maxDist = length(vec2(0.5 * canvasAspect, 0.5));
    float currentRadius = (1.0 - u_progress) * (maxDist + feather);
    reveal = smoothstep(max(0.0, currentRadius - feather), currentRadius, dist);
  }
  else if (u_mode == 2) {
    // Mode 2: 上から下へ (Linear Scan)
    float currentY = u_progress * (1.0 + feather);
    reveal = smoothstep(currentY - feather, currentY, 1.0 - canvasUv.y);
  }
  else if (u_mode == 3) {
    // Mode 3: ブロックノイズスキャン (Block Scan)
    vec2 blockCoord = floor(canvasUv * vec2(u_gridCount * canvasAspect, u_gridCount));
    float rnd = hash21(blockCoord, u_seed);
    
    // 行ベースの進行 (上から下)
    float rowProgress = (u_gridCount - 1.0 - blockCoord.y) / u_gridCount;
    // 進行境界付近に乱数による先行出現オフセット
    float noiseOffset = (rnd - 0.5) * u_noiseStrength * 0.4;
    float effectiveRowProgress = rowProgress + noiseOffset;
    
    reveal = step(effectiveRowProgress, u_progress);
  }
  else if (u_mode == 4) {
    // Mode 4: ランダムブロック (Random Reveal)
    vec2 blockCoord = floor(canvasUv * vec2(u_gridCount * canvasAspect, u_gridCount));
    float rnd = hash21(blockCoord, u_seed);
    reveal = step(rnd, u_progress);
  }
  else if (u_mode == 5) {
    // Mode 5: 多段階解像度 (Multi-Step LOD)
    float stepsF = float(max(2, u_lodSteps));
    if (u_lodSmooth == 0) {
      // 階段状ステップ
      float stepIndex = floor(u_progress * stepsF);
      float lodFactor = 1.0 - (stepIndex / stepsF);
      float lodBlockSize = max(1.0, u_mosaicSize * lodFactor);
      vec2 lodGrid = u_canvasRes / lodBlockSize;
      vec2 lodUv = floor(canvasUv * lodGrid) / lodGrid;
      // imageUv換算
      vec2 finalUv = mix(mosaicImageUv, imageUv, 1.0 - lodFactor);
      fragColor = texture(u_texture, clamp(finalUv, 0.0, 1.0));
      return;
    } else {
      // 連続スムーズフェード
      float lodFactor = 1.0 - u_progress;
      float lodBlockSize = max(1.0, u_mosaicSize * lodFactor);
      vec2 lodGrid = u_canvasRes / lodBlockSize;
      vec2 lodUv = floor(canvasUv * lodGrid) / lodGrid;
      vec4 lodColor = texture(u_texture, clamp(imageUv, 0.0, 1.0));
      fragColor = mix(mosaicColor, fullResColor, u_progress);
      return;
    }
  }

  if (u_progress >= 1.0) {
    reveal = 1.0;
  }

  fragColor = mix(mosaicColor, fullResColor, reveal);
}
`;
