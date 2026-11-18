import { DEFAULT_EXPORT_FILE_NAME } from '../../export/download';
import type { ExportJob, ExportResult } from './ExportJob';

export class ExportEngine {
  async render(job: ExportJob): Promise<ExportResult> {
    const { preset, renderer, duration, startTime, overlay, signal, onProgress, onStatus } = job;
    onStatus?.(`Preparing ${preset.label} export...`);

    const blob = await renderer({
      duration,
      startTime,
      overlay,
      fps: preset.fps,
      width: preset.width,
      height: preset.height,
      signal,
      onProgress: createThrottledProgressReporter(onProgress),
      onStatus,
    });

    if (blob.size < 1024) {
      throw new Error('Export finished without a valid MP4 payload');
    }

    return {
      blob,
      fileName: getExportFileName(preset, startTime !== undefined),
    };
  }
}

function createThrottledProgressReporter(onProgress: (progress: number) => void) {
  let lastProgress = 0;
  let lastProgressAt = 0;
  return (progress: number) => {
    const now = performance.now();
    if (progress <= 0 || progress >= 1 || progress - lastProgress >= 0.01 || now - lastProgressAt >= 120) {
      lastProgress = progress;
      lastProgressAt = now;
      onProgress(progress);
    }
  };
}

function getExportFileName(preset: { width: number; height: number }, isClip: boolean) {
  if (preset.height > preset.width) {
    return `audio-visualizer-shorts-${preset.width}x${preset.height}.mp4`;
  }
  if (isClip) {
    return `audio-visualizer-clip-${preset.height}p.mp4`;
  }
  return preset.height === 1080
    ? DEFAULT_EXPORT_FILE_NAME
    : `audio-visualizer-${preset.height}p.mp4`;
}
