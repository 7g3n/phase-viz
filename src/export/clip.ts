import type { ExportOverlaySettings } from '../state/types';
import { drawExportOverlay, hasVisibleOverlay } from './overlay';

const CLIP_FADE_IN_SECONDS = 0.02;
const CLIP_FADE_OUT_MAX_SECONDS = 0.6;

export interface PrepareExportClipOptions {
  /** Canvas the visual mode renders into, already resized to the export size. */
  sourceCanvas: HTMLCanvasElement;
  audioBuffer: AudioBuffer;
  startTime?: number;
  duration: number;
  overlay?: ExportOverlaySettings | null;
}

export interface ExportClip {
  /** Canvas the encoder should read frames from. */
  canvas: HTMLCanvasElement;
  /** Audio for the exported range only. */
  audioBuffer: AudioBuffer;
  /** Track time (seconds) that export time 0 maps to. */
  startTime: number;
  /** Call after the source canvas has been drawn for the current frame. */
  compose: () => void;
}

/**
 * Adapts an existing full-track export renderer to a clip export:
 * offsets track time, slices the audio with short fades, and composites an
 * optional text overlay on top of the rendered frame.
 *
 * With no start offset, a full-length duration and no overlay this returns the
 * original canvas and audio buffer untouched, so full-track exports behave exactly
 * as before.
 */
export function prepareExportClip({
  sourceCanvas,
  audioBuffer,
  startTime = 0,
  duration,
  overlay,
}: PrepareExportClipOptions): ExportClip {
  const start = clamp(startTime, 0, Math.max(0, audioBuffer.duration - 1 / audioBuffer.sampleRate));
  const clipAudio = sliceAudioBuffer(audioBuffer, start, duration);

  if (!hasVisibleOverlay(overlay)) {
    return { canvas: sourceCanvas, audioBuffer: clipAudio, startTime: start, compose: () => {} };
  }

  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create overlay canvas for export');
  }

  return {
    canvas,
    audioBuffer: clipAudio,
    startTime: start,
    compose: () => {
      // Must run in the same task as the WebGL render so the drawing buffer is still valid.
      ctx.drawImage(sourceCanvas, 0, 0, width, height);
      drawExportOverlay(ctx, width, height, overlay);
    },
  };
}

export function sliceAudioBuffer(buffer: AudioBuffer, startTime: number, duration: number): AudioBuffer {
  const sampleRate = buffer.sampleRate;
  const startSample = Math.max(0, Math.min(buffer.length, Math.round(startTime * sampleRate)));
  const endSample = Math.max(startSample, Math.min(buffer.length, Math.round((startTime + duration) * sampleRate)));
  const length = endSample - startSample;

  if (startSample === 0 && endSample >= buffer.length) {
    return buffer;
  }
  if (length <= 0) {
    throw new Error('Export clip is empty');
  }

  const sliced = new AudioBuffer({
    length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate,
  });

  const fadeInSamples = startSample > 0 ? Math.min(length, Math.round(CLIP_FADE_IN_SECONDS * sampleRate)) : 0;
  const fadeOutSamples = endSample < buffer.length
    ? Math.min(length, Math.round(Math.min(CLIP_FADE_OUT_MAX_SECONDS, duration * 0.05) * sampleRate))
    : 0;

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel).slice(startSample, endSample);
    for (let i = 0; i < fadeInSamples; i++) {
      data[i] *= i / fadeInSamples;
    }
    for (let i = 0; i < fadeOutSamples; i++) {
      // Equal-power style curve sounds less abrupt than a linear ramp at the tail.
      const t = i / fadeOutSamples;
      data[length - 1 - i] *= Math.sin(t * Math.PI * 0.5);
    }
    sliced.copyToChannel(data, channel);
  }

  return sliced;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
