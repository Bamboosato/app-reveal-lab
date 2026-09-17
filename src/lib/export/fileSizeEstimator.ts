import type { ExportFormat, ResolutionPreset } from './exportTypes';

export function estimateFileSize(
  format: ExportFormat,
  resolution: ResolutionPreset,
  fps: number,
  totalDurationSeconds: number
): string {
  if (format === 'png') {
    return resolution === '1080p' ? '~350 KB' : '~180 KB';
  }

  if (format === 'gif') {
    // 480px前後で1フレームあたり約 15KB ~ 25KB
    const frames = Math.ceil(totalDurationSeconds * fps);
    const bytes = frames * 22 * 1024;
    if (bytes > 1024 * 1024) {
      return `~${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `~${Math.round(bytes / 1024)} KB`;
  }

  // 動画 (MP4 / WebM)
  let bps = 5_000_000; // 5 Mbps (720p MP4)
  if (format === 'mp4') {
    bps = resolution === '1080p' ? 8_000_000 : 5_000_000;
  } else if (format === 'webm') {
    bps = resolution === '1080p' ? 6_000_000 : 3_500_000;
  }

  const bytes = (bps / 8) * totalDurationSeconds;
  if (bytes > 1024 * 1024) {
    return `~${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `~${Math.round(bytes / 1024)} KB`;
}
