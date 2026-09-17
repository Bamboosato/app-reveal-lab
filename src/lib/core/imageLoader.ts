import type { AspectRatioPreset, ResolutionDimension } from './types';

/**
 * アスペクト比プリセットに応じたキャンバス寸法を計算（幅・高さ共に偶数化）
 */
export function calculateCanvasDimensions(
  preset: AspectRatioPreset,
  baseResolution: '720p' | '1080p' = '720p',
  imageWidth = 1280,
  imageHeight = 720
): ResolutionDimension {
  const is1080p = baseResolution === '1080p';

  let w = 720;
  let h = 720;

  switch (preset) {
    case '16:9':
      w = is1080p ? 1920 : 1280;
      h = is1080p ? 1080 : 720;
      break;
    case '9:16':
      w = is1080p ? 1080 : 720;
      h = is1080p ? 1920 : 1280;
      break;
    case '1:1':
      w = is1080p ? 1080 : 720;
      h = is1080p ? 1080 : 720;
      break;
    case '4:5':
      w = is1080p ? 1080 : 720;
      h = is1080p ? 1350 : 900;
      break;
    case 'original': {
      const targetShort = is1080p ? 1080 : 720;
      const aspect = imageWidth / imageHeight;
      if (aspect >= 1.0) {
        // 横長
        h = targetShort;
        w = Math.round(targetShort * aspect);
      } else {
        // 縦長
        w = targetShort;
        h = Math.round(targetShort / aspect);
      }
      break;
    }
  }

  // 偶数化アライメント
  return {
    width: w - (w % 2),
    height: h - (h % 2),
  };
}

/**
 * 初期テスト用サンプル画像の生成
 */
export function generateSampleImage(width = 1280, height = 1280): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // 鮮やかなサンセットグラデーション背景
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#0f2027');
  grad.addColorStop(0.3, '#203a43');
  grad.addColorStop(0.6, '#2c5364');
  grad.addColorStop(0.8, '#f39c12');
  grad.addColorStop(1, '#e74c3c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // 太陽モチーフ
  ctx.fillStyle = '#f1c40f';
  ctx.beginPath();
  ctx.arc(width * 0.5, height * 0.45, width * 0.18, 0, Math.PI * 2);
  ctx.fill();

  // 山のシルエット
  ctx.fillStyle = 'rgba(15, 32, 39, 0.9)';
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(width * 0.25, height * 0.65);
  ctx.lineTo(width * 0.55, height * 0.8);
  ctx.lineTo(width * 0.85, height * 0.6);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();

  // 近景の山
  ctx.fillStyle = '#0a141a';
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(width * 0.4, height * 0.75);
  ctx.lineTo(width * 0.7, height * 0.85);
  ctx.lineTo(width, height * 0.78);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();

  // グリッド装飾ライン（解像度変化がわかりやすい幾何学模様）
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;
  for (let y = 0; y < height; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  for (let x = 0; x < width; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // 中央タイポグラフィ
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 16;
  ctx.fillText('App Reveal Lab', width / 2, height * 0.35);

  ctx.font = '500 28px system-ui, sans-serif';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText('Progressive Transition Engine', width / 2, height * 0.35 + 50);

  return canvas;
}

/**
 * ファイルから画像を安全に読み込む（長辺4096px超は自動縮小）
 */
export async function loadImageFromFile(
  file: File,
  onResizeWarning?: (msg: string) => void
): Promise<HTMLImageElement | HTMLCanvasElement> {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    throw new Error(`サポートされていない画像形式です: ${file.type || file.name}`);
  }

  const rawImg = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像の読み込みに失敗しました。'));
    };
    img.src = url;
  });

  const maxSide = 4096;
  const w = rawImg.naturalWidth;
  const h = rawImg.naturalHeight;

  if (w > maxSide || h > maxSide) {
    let targetW = w;
    let targetH = h;
    if (w >= h) {
      targetW = maxSide;
      targetH = Math.round(h * (maxSide / w));
    } else {
      targetH = maxSide;
      targetW = Math.round(w * (maxSide / h));
    }
    const msg = `画像サイズ (${w}×${h}) が上限の${maxSide}pxを超えているため、${targetW}×${targetH} に自動縮小しました。`;
    console.warn(msg);
    onResizeWarning?.(msg);

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(rawImg, 0, 0, targetW, targetH);
    return canvas;
  }

  return rawImg;
}
