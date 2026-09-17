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

// 段階的ランダム解像パラメータ
uniform int u_stagedReveal;  // 0: 無効(2値解像), 1: 有効(段階的ランダムLOD解像)

// 疑似乱数ハッシュ関数 (シード付き)
float hash21(vec2 p, float seed) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973) + seed * 0.1337);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// キャンバスUVから画像UVへのマッピング関数
vec2 canvasToImageUv(vec2 cUv, float canvasAspect, float imageAspect) {
  vec2 imgUv = cUv;
  if (u_fitMode == 0) {
    if (canvasAspect > imageAspect) {
      float scale = imageAspect / canvasAspect;
      imgUv.x = (cUv.x - 0.5) / scale + 0.5;
    } else {
      float scale = canvasAspect / imageAspect;
      imgUv.y = (cUv.y - 0.5) / scale + 0.5;
    }
  } else {
    vec2 scale = vec2(1.0);
    if (canvasAspect > imageAspect) {
      scale.y = canvasAspect / imageAspect;
    } else {
      scale.x = imageAspect / canvasAspect;
    }
    vec2 offset = u_panOffset * 0.5 * (scale - 1.0);
    imgUv = (cUv - 0.5) * scale + 0.5 + offset;
  }
  return clamp(imgUv, 0.0, 1.0);
}

// 段階的ランダム解像 (Staged Reveal) 用サンプリング関数
// localProgress (0.0=初期モザイク, 1.0=完全原画) とブロック固有乱数から段階的なモザイク色を算出
vec4 sampleStagedColor(vec2 cUv, float localProgress, float rnd, float canvasAspect, float imageAspect) {
  if (localProgress >= 1.0) {
    return texture(u_texture, canvasToImageUv(cUv, canvasAspect, imageAspect));
  }
  if (localProgress <= 0.0) {
    vec2 grid = u_canvasRes / max(1.0, u_mosaicSize);
    vec2 mUv = (floor(cUv * grid) + 0.5) / grid;
    return texture(u_texture, canvasToImageUv(mUv, canvasAspect, imageAspect));
  }

  // ブロック固有のランダムな段階数 (3 〜 6 段階)
  float steps = floor(3.0 + 4.0 * rnd);
  float stepIdx = floor(clamp(localProgress, 0.0, 0.9999) * steps);
  float t = stepIdx / max(1.0, steps - 1.0);

  // 初期モザイクサイズから 1.0px へ指数関数的に縮小
  float bSize = max(1.0, u_mosaicSize * pow(1.0 / u_mosaicSize, t));
  if (bSize <= 1.5) {
    return texture(u_texture, canvasToImageUv(cUv, canvasAspect, imageAspect));
  }

  vec2 grid = u_canvasRes / bSize;
  vec2 sUv = (floor(cUv * grid) + 0.5) / grid;
  return texture(u_texture, canvasToImageUv(sUv, canvasAspect, imageAspect));
}

void main() {
  vec2 canvasUv = v_canvasUv;
  float canvasAspect = u_canvasRes.x / u_canvasRes.y;
  float imageAspect = u_imageRes.x / u_imageRes.y;

  // 1. contain 時の余白判定
  bool isOutOfBounds = false;
  if (u_fitMode == 0) {
    if (canvasAspect > imageAspect) {
      float scale = imageAspect / canvasAspect;
      float minX = 0.5 - 0.5 * scale;
      float maxX = 0.5 + 0.5 * scale;
      if (canvasUv.x < minX || canvasUv.x > maxX) isOutOfBounds = true;
    } else {
      float scale = canvasAspect / imageAspect;
      float minY = 0.5 - 0.5 * scale;
      float maxY = 0.5 + 0.5 * scale;
      if (canvasUv.y < minY || canvasUv.y > maxY) isOutOfBounds = true;
    }
  }

  // contain の余白部分は背景色を描画
  if (isOutOfBounds) {
    fragColor = u_bgColor;
    return;
  }

  vec2 imageUv = canvasToImageUv(canvasUv, canvasAspect, imageAspect);
  vec4 fullResColor = texture(u_texture, imageUv);

  // 2. モザイク色の算出
  vec2 mosaicGrid = u_canvasRes / max(1.0, u_mosaicSize);
  vec2 mosaicCanvasUv = (floor(canvasUv * mosaicGrid) + 0.5) / mosaicGrid;
  vec4 mosaicColor = texture(u_texture, canvasToImageUv(mosaicCanvasUv, canvasAspect, imageAspect));

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

    if (u_stagedReveal == 1) {
      vec2 blockCoord = floor(canvasUv * vec2(u_gridCount * canvasAspect, u_gridCount));
      float rnd = hash21(blockCoord, u_seed);
      float band = max(0.1, feather * 2.0);
      float localProg = clamp((currentRadius - dist) / band + (rnd - 0.5) * 0.2, 0.0, 1.0);
      fragColor = sampleStagedColor(canvasUv, localProg, rnd, canvasAspect, imageAspect);
      return;
    }

    reveal = 1.0 - smoothstep(max(0.0, currentRadius - feather), currentRadius, dist);
  }
  else if (u_mode == 1) {
    // Mode 1: 外側から中心へ (Radial In)
    vec2 diff = canvasUv - vec2(0.5);
    diff.x *= canvasAspect;
    float dist = length(diff);
    float maxDist = length(vec2(0.5 * canvasAspect, 0.5));
    float currentRadius = (1.0 - u_progress) * (maxDist + feather);

    if (u_stagedReveal == 1) {
      vec2 blockCoord = floor(canvasUv * vec2(u_gridCount * canvasAspect, u_gridCount));
      float rnd = hash21(blockCoord, u_seed);
      float band = max(0.1, feather * 2.0);
      float localProg = clamp((dist - (currentRadius - feather)) / band + (rnd - 0.5) * 0.2, 0.0, 1.0);
      fragColor = sampleStagedColor(canvasUv, localProg, rnd, canvasAspect, imageAspect);
      return;
    }

    reveal = smoothstep(max(0.0, currentRadius - feather), currentRadius, dist);
  }
  else if (u_mode == 2) {
    // Mode 2: 上から下へ (Linear Scan) - 上端(y=0)から下端(y=1)へ進行
    float currentY = u_progress * (1.0 + feather);

    if (u_stagedReveal == 1) {
      vec2 blockCoord = floor(canvasUv * vec2(u_gridCount * canvasAspect, u_gridCount));
      float rnd = hash21(blockCoord, u_seed);
      float band = max(0.1, feather * 2.0);
      float localProg = clamp((currentY - canvasUv.y) / band + (rnd - 0.5) * 0.2, 0.0, 1.0);
      fragColor = sampleStagedColor(canvasUv, localProg, rnd, canvasAspect, imageAspect);
      return;
    }

    reveal = 1.0 - smoothstep(max(0.0, currentY - feather), currentY, canvasUv.y);
  }
  else if (u_mode == 3) {
    // Mode 3: ブロックノイズスキャン (Block Scan) - 上端行(y=0)から下端行(y=grid-1)へ進行
    vec2 blockCoord = floor(canvasUv * vec2(u_gridCount * canvasAspect, u_gridCount));
    float rnd = hash21(blockCoord, u_seed);
    
    // 行ベースの進行 (最上行0.0 -> 最下行1.0)
    float rowProgress = blockCoord.y / max(1.0, u_gridCount - 1.0);
    // 進行境界付近に乱数による先行出現オフセット
    float noiseOffset = (rnd - 0.5) * u_noiseStrength * 0.4;
    float effectiveRowProgress = rowProgress + noiseOffset;

    if (u_stagedReveal == 1) {
      float tStart = effectiveRowProgress * 0.8;
      float span = 0.25;
      float localProg = clamp((u_progress - tStart) / span, 0.0, 1.0);
      fragColor = sampleStagedColor(canvasUv, localProg, rnd, canvasAspect, imageAspect);
      return;
    }
    
    reveal = step(effectiveRowProgress, u_progress);
  }
  else if (u_mode == 4) {
    // Mode 4: ランダムブロック (Random Reveal)
    vec2 blockCoord = floor(canvasUv * vec2(u_gridCount * canvasAspect, u_gridCount));
    float rnd = hash21(blockCoord, u_seed);

    if (u_stagedReveal == 1) {
      float rnd2 = hash21(blockCoord + vec2(17.3, 31.7), u_seed);
      float tStart = rnd * 0.65;
      float span = 0.2 + 0.15 * rnd2;
      float localProg = clamp((u_progress - tStart) / span, 0.0, 1.0);
      fragColor = sampleStagedColor(canvasUv, localProg, rnd2, canvasAspect, imageAspect);
      return;
    }

    reveal = step(rnd, u_progress);
  }
  else if (u_mode == 5) {
    // Mode 5: 多段階解像度 (Multi-Step LOD)
    if (u_progress >= 1.0) {
      fragColor = fullResColor;
      return;
    }

    float steps = float(max(2, u_lodSteps));

    if (u_lodSmooth == 0) {
      // 階段状（Stepped）
      float stepIdx = floor(clamp(u_progress, 0.0, 0.9999) * steps);
      float t = stepIdx / (steps - 1.0);
      float lodBlockSize = max(1.0, u_mosaicSize * pow(1.0 / u_mosaicSize, t));
      if (lodBlockSize <= 1.5) {
        fragColor = fullResColor;
        return;
      }
      vec2 lodGrid = u_canvasRes / lodBlockSize;
      vec2 lodCanvasUv = (floor(canvasUv * lodGrid) + 0.5) / lodGrid;
      fragColor = texture(u_texture, canvasToImageUv(lodCanvasUv, canvasAspect, imageAspect));
      return;
    } else {
      // 連続フェード（Smooth）
      float p = clamp(u_progress, 0.0, 0.9999) * (steps - 1.0);
      float currentStep = floor(p);
      float nextStep = min(steps - 1.0, currentStep + 1.0);
      float stepFrac = fract(p);

      float t0 = currentStep / (steps - 1.0);
      float t1 = nextStep / (steps - 1.0);

      float bs0 = max(1.0, u_mosaicSize * pow(1.0 / u_mosaicSize, t0));
      float bs1 = max(1.0, u_mosaicSize * pow(1.0 / u_mosaicSize, t1));

      vec4 c0;
      if (bs0 <= 1.5) {
        c0 = fullResColor;
      } else {
        vec2 grid0 = u_canvasRes / bs0;
        vec2 uv0 = (floor(canvasUv * grid0) + 0.5) / grid0;
        c0 = texture(u_texture, canvasToImageUv(uv0, canvasAspect, imageAspect));
      }

      vec4 c1;
      if (bs1 <= 1.5) {
        c1 = fullResColor;
      } else {
        vec2 grid1 = u_canvasRes / bs1;
        vec2 uv1 = (floor(canvasUv * grid1) + 0.5) / grid1;
        c1 = texture(u_texture, canvasToImageUv(uv1, canvasAspect, imageAspect));
      }

      fragColor = mix(c0, c1, stepFrac);
      return;
    }
  }

  if (u_progress >= 1.0) {
    reveal = 1.0;
  }

  fragColor = mix(mosaicColor, fullResColor, reveal);
}
`;
