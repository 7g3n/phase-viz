export interface RecorderFrame {
  blob: Blob;
  timeMs: number;
}

import type { ExportOverlaySettings } from '../state/types';

export interface ExportRenderOptions {
  duration: number;
  /** Track time (seconds) where the export starts. Defaults to 0. */
  startTime?: number;
  /** Text burned into every frame. Omit for a clean full-track export. */
  overlay?: ExportOverlaySettings | null;
  fps: number;
  width: number;
  height: number;
  onProgress: (progress: number) => void;
  onStatus?: (status: string) => void;
  signal?: AbortSignal;
}

export type ExportFrameRenderer = (options: ExportRenderOptions) => Promise<Blob>;

export class FrameRecorder {
  private frames: RecorderFrame[] = [];
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {

    this.canvas = canvas;
  }

  captureFrame(timeMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error(`Could not capture export frame at ${Math.round(timeMs)}ms`));
            return;
          }
          this.frames.push({ blob, timeMs });
          resolve();
        },
        'image/jpeg',
        0.72,
      );
    });
  }

  getFrames(): RecorderFrame[] {
    return this.frames;
  }

  clear() {
    this.frames = [];
  }

  getFrameCount(): number {
    return this.frames.length;
  }
}
