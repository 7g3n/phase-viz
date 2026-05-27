export interface RecorderFrame {
  blob: Blob;
  timeMs: number;
}

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
        'image/jpeg',
        0.92,
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
