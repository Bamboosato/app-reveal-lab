import { canEncodeVideo } from 'mediabunny';

export interface CodecSupportResult {
  codec: string;
  label: string;
  supported: boolean;
  error?: string;
}

export interface SystemCapabilities {
  webgl2: boolean;
  videoEncoder: boolean;
  codecs: CodecSupportResult[];
  webShare: boolean;
  mediabunnyAvc: boolean;
  mediabunnyVp9: boolean;
  mediabunnyVp8: boolean;
  recommendedVideoFormat: 'mp4' | 'webm' | 'gif';
}

export async function detectCapabilities(): Promise<SystemCapabilities> {
  // 1. WebGL 2 判定
  let webgl2 = false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    webgl2 = !!gl;
  } catch (e) {
    webgl2 = false;
  }

  // 2. VideoEncoder 存在確認
  const videoEncoder = typeof window !== 'undefined' && typeof window.VideoEncoder !== 'undefined';

  // 3. 各コーデックの isConfigSupported 判定
  const targetCodecs = [
    { codec: 'avc1.42001f', label: 'H.264 Baseline L3.1 (720p@30)' },
    { codec: 'avc1.4d0028', label: 'H.264 Main L4.0 (1080p@30)' },
    { codec: 'vp09.00.10.08', label: 'VP9 Profile 0 (720p)' },
    { codec: 'vp09.00.31.08', label: 'VP9 Profile 0 L3.1 (1080p)' },
    { codec: 'vp8', label: 'VP8' },
  ];

  const codecs: CodecSupportResult[] = [];

  if (videoEncoder) {
    for (const item of targetCodecs) {
      try {
        const result = await VideoEncoder.isConfigSupported({
          codec: item.codec,
          width: 1280,
          height: 720,
          bitrate: 5_000_000,
          framerate: 30,
        });
        codecs.push({
          codec: item.codec,
          label: item.label,
          supported: !!result.supported,
        });
      } catch (err: any) {
        codecs.push({
          codec: item.codec,
          label: item.label,
          supported: false,
          error: err?.message || 'Config not supported or error thrown',
        });
      }
    }
  } else {
    for (const item of targetCodecs) {
      codecs.push({
        codec: item.codec,
        label: item.label,
        supported: false,
        error: 'VideoEncoder API is not supported in this browser',
      });
    }
  }

  // 4. Web Share API 判定
  let webShare = false;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
      const testFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      webShare = navigator.canShare({ files: [testFile] });
    }
  } catch (e) {
    webShare = false;
  }

  // 5. Mediabunny コーデック判定
  let mediabunnyAvc = false;
  let mediabunnyVp9 = false;
  let mediabunnyVp8 = false;
  try {
    mediabunnyAvc = await canEncodeVideo('avc');
    mediabunnyVp9 = await canEncodeVideo('vp9');
    mediabunnyVp8 = await canEncodeVideo('vp8');
  } catch (e) {
    console.warn('Mediabunny check error:', e);
  }

  // 推奨フォーマット決定
  let recommendedVideoFormat: 'mp4' | 'webm' | 'gif' = 'gif';
  const hasH264 = codecs.some(c => c.codec.startsWith('avc1') && c.supported) || mediabunnyAvc;
  const hasVp = codecs.some(c => (c.codec.startsWith('vp09') || c.codec === 'vp8') && c.supported) || mediabunnyVp9 || mediabunnyVp8;

  if (hasH264) {
    recommendedVideoFormat = 'mp4';
  } else if (hasVp) {
    recommendedVideoFormat = 'webm';
  } else {
    recommendedVideoFormat = 'gif';
  }

  return {
    webgl2,
    videoEncoder,
    codecs,
    webShare,
    mediabunnyAvc,
    mediabunnyVp9,
    mediabunnyVp8,
    recommendedVideoFormat,
  };
}

/**
 * 指定された解像度・fps・フォーマットで VideoEncoder が対応しているかを動的に判定
 */
export async function checkVideoConfigSupported(
  format: 'mp4' | 'webm',
  width: number,
  height: number,
  fps: number
): Promise<{ supported: boolean; codec: string; error?: string }> {
  if (typeof window === 'undefined' || typeof window.VideoEncoder === 'undefined') {
    return { supported: false, codec: '', error: 'VideoEncoder API未対応' };
  }

  const evenW = width - (width % 2);
  const evenH = height - (height % 2);
  const is1080pOrHigher = Math.max(evenW, evenH) >= 1080;
  const isHighFps = fps >= 60;

  let candidateCodecs: string[] = [];

  if (format === 'mp4') {
    if (is1080pOrHigher || isHighFps) {
      candidateCodecs = ['avc1.64002a', 'avc1.4d0028', 'avc1.420028', 'avc1.42001f'];
    } else {
      candidateCodecs = ['avc1.42001f', 'avc1.4d0028', 'avc1.640028'];
    }
  } else {
    // webm
    if (is1080pOrHigher || isHighFps) {
      candidateCodecs = ['vp09.00.40.08', 'vp09.00.31.08', 'vp09.00.10.08', 'vp8'];
    } else {
      candidateCodecs = ['vp09.00.10.08', 'vp09.00.31.08', 'vp8'];
    }
  }

  for (const codec of candidateCodecs) {
    try {
      const res = await VideoEncoder.isConfigSupported({
        codec,
        width: evenW,
        height: evenH,
        bitrate: is1080pOrHigher ? 8_000_000 : 5_000_000,
        framerate: fps,
      });
      if (res.supported) {
        return { supported: true, codec };
      }
    } catch (e: any) {
      // 候補を次へ
    }
  }

  return {
    supported: false,
    codec: candidateCodecs[0],
    error: `指定された設定 (${evenW}x${evenH} @ ${fps}fps) に対応するコーデックが見つかりません。`,
  };
}
