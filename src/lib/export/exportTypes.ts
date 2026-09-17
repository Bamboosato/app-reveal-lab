export type ExportFormat = 'mp4' | 'webm' | 'gif' | 'png';

export type ResolutionPreset = '720p' | '1080p';

export interface ExportSettings {
  format: ExportFormat;
  resolution: ResolutionPreset;
  fps: 15 | 24 | 30 | 60;
  gifPaletteMode: 'per-frame' | 'global';
}

export interface ExportResult {
  format: ExportFormat;
  blob: Blob;
  url: string;
  fileSizeBytes: number;
  elapsedTimeMs: number;
  realtimeRatio: number; // 実時間に対する比率
  totalFrames: number;
  mimeType: string;
  width: number;
  height: number;
}
