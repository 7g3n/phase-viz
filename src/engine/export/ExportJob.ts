import type { ExportOverlaySettings, ExportPreset } from '../../state';
import type { ExportFrameRenderer } from '../../export/recorder';

export type ExportJob = {
  duration: number;
  startTime?: number;
  overlay?: ExportOverlaySettings | null;
  preset: ExportPreset;
  renderer: ExportFrameRenderer;
  signal?: AbortSignal;
  onProgress: (progress: number) => void;
  onStatus?: (status: string) => void;
};

export type ExportResult = {
  blob: Blob;
  fileName: string;
};
