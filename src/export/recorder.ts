export interface RecorderFrame {
  blob: Blob;
  timeMs: number;
}

export interface ExportRenderOptions {
  duration: number;
  fps: number;
  onProgress: (progress: number) => void;
  signal?: AbortSignal;
}

export type ExportFrameRenderer = (options: ExportRenderOptions) => Promise<void>;

export class FrameRecorder {
  private frames: RecorderFrame[] = [];
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  captureFrame(timeMs: number): Promise<void> {
    return new Promise((resolve) => {
      this.canvas.toBlob(
        (blob) => {
          if (blob) this.frames.push({ blob, timeMs });
          resolve();
        },
        'image/webp',
        0.8,
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
