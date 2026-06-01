import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import Box from '@mui/material/Box';
import { type AudioAnalysis, type WaveVisualizerSettings, useStore } from '../store';
import { type ExportFrameRenderer } from '../export/recorder';
import { canUseWebCodecsMP4, exportToMP4WithWebCodecs } from '../export/webcodecs';
import { exportToMP4WithFFmpegFrames } from '../export/ffmpeg';

interface Props {
  exportRendererRef: MutableRefObject<ExportFrameRenderer | null>;
}

interface WaveFrame {
  waveform: Float32Array;
  spectrum: Float32Array;
  volume: number;
  bass: number;
  mid: number;
  high: number;
  transient: number;
}

const RENDER_FPS_LIMIT = 30;
const RENDER_FRAME_INTERVAL_MS = 1000 / RENDER_FPS_LIMIT;
const EXPORT_WIDTH = 1920;
const EXPORT_HEIGHT = 1080;
const WAVEFORM_POINTS = 1024;
const SPECTRUM_POINTS = 128;

export default function WaveVisualizer({ exportRendererRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioStartedRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const lastRenderTimeRef = useRef(0);
  const lastFpsReportRef = useRef(0);
  const fpsSamplesRef = useRef<number[]>([]);
  const timeDomainRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const frequencyRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const {
    audioBuffer,
    isPlaying,
    isExporting,
    backgroundImageUrl,
    setCurrentTime,
    setFps,
  } = useStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onResize = () => {
      if (useStore.getState().isExporting) return;
      resizeCanvasToParent(canvas);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let cancelled = false;
    backgroundImageRef.current = null;
    if (!backgroundImageUrl) return undefined;

    const image = new Image();
    image.onload = () => {
      if (!cancelled) {
        backgroundImageRef.current = image;
      }
    };
    image.src = backgroundImageUrl;

    return () => {
      cancelled = true;
      if (backgroundImageRef.current === image) {
        backgroundImageRef.current = null;
      }
    };
  }, [backgroundImageUrl]);

  useEffect(() => {
    if (!audioBuffer || !isPlaying) return undefined;

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.78;
    analyser.connect(ctx.destination);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);
    source.start(0, useStore.getState().currentTime);

    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    sourceRef.current = source;
    audioStartedRef.current = ctx.currentTime - useStore.getState().currentTime;

    source.onended = () => {
      useStore.getState().setIsPlaying(false);
    };

    return () => {
      try {
        source.stop();
      } catch {
        // Source may already have ended.
      }
      source.disconnect();
      ctx.close();
      audioCtxRef.current = null;
      analyserRef.current = null;
      sourceRef.current = null;
    };
  }, [audioBuffer, isPlaying]);

  const renderLiveFrame = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    const state = useStore.getState();
    if (!canvas || state.isExporting) return;

    const elapsedSinceRender = timestamp - lastRenderTimeRef.current;
    if (elapsedSinceRender < RENDER_FRAME_INTERVAL_MS) {
      return;
    }

    const renderTimestamp = timestamp - (elapsedSinceRender % RENDER_FRAME_INTERVAL_MS);
    lastFrameTimeRef.current = renderTimestamp;
    lastRenderTimeRef.current = renderTimestamp;

    const fpsSamples = fpsSamplesRef.current;
    fpsSamples.push(renderTimestamp);
    while (fpsSamples.length > 0 && renderTimestamp - fpsSamples[0] >= 1000) {
      fpsSamples.shift();
    }
    if (renderTimestamp - lastFpsReportRef.current >= 500) {
      lastFpsReportRef.current = renderTimestamp;
      setFps(fpsSamples.length);
    }

    let frame: WaveFrame | null = null;
    if (analyserRef.current && state.isPlaying) {
      frame = sampleAnalyserFrame(analyserRef.current, timeDomainRef, frequencyRef);
      if (audioCtxRef.current) {
        setCurrentTime(audioCtxRef.current.currentTime - audioStartedRef.current);
      }
    } else if (state.audioBuffer && state.analysis) {
      frame = sampleAudioBufferFrame(state.audioBuffer, state.analysis, state.currentTime);
    }

    if (frame) {
      drawWaveFrame(
        canvas,
        frame,
        state.waveSettings,
        state.waveSettings.backgroundMode === 'image' ? backgroundImageRef.current : null,
        renderTimestamp / 1000,
      );
    } else {
      drawEmptyWaveCanvas(canvas, state.waveSettings, backgroundImageRef.current);
    }
  }, [setCurrentTime, setFps]);

  useEffect(() => {
    const now = performance.now();
    lastFrameTimeRef.current = now;
    lastRenderTimeRef.current = now;

    const tick = (timestamp: number) => {
      renderLiveFrame(timestamp);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [renderLiveFrame]);

  const renderExportFrames = useCallback<ExportFrameRenderer>(
    async ({ duration, onProgress, onStatus, signal }) => {
      const canvas = canvasRef.current;
      const {
        audioBuffer: exportAudioBuffer,
        analysis: exportAnalysis,
        waveSettings,
        backgroundImageUrl: exportBackgroundImageUrl,
      } = useStore.getState();
      if (!canvas || !exportAudioBuffer || !exportAnalysis) {
        throw new Error('Wave visualizer is not ready for export');
      }

      throwIfAborted(signal);
      const previousWidth = canvas.width;
      const previousHeight = canvas.height;
      canvas.width = EXPORT_WIDTH;
      canvas.height = EXPORT_HEIGHT;

      let exportBackgroundImage: HTMLImageElement | null = null;
      if (waveSettings.backgroundMode === 'image' && exportBackgroundImageUrl) {
        exportBackgroundImage = backgroundImageRef.current ?? await loadImage(exportBackgroundImageUrl, signal);
        backgroundImageRef.current = exportBackgroundImage;
      }

      const fps = RENDER_FPS_LIMIT;
      const drawFrame = (time: number, frame: number) => {
        const waveFrame = sampleAudioBufferFrame(exportAudioBuffer, exportAnalysis, time);
        drawWaveFrame(canvas, waveFrame, waveSettings, exportBackgroundImage, time + frame * 0.001);
      };

      try {
        let fastExportError: Error | null = null;
        if (canUseWebCodecsMP4()) {
          try {
            onStatus?.('Rendering wave MP4...');
            const blob = await exportToMP4WithWebCodecs({
              canvas,
              audioBuffer: exportAudioBuffer,
              duration,
              fps,
              renderFrame: drawFrame,
              onProgress,
              signal,
            });
            return blob;
          } catch (err) {
            if (signal?.aborted) throw err;
            fastExportError = toError(err);
            console.warn('Fast WebCodecs wave export failed, falling back to ffmpeg.wasm:', err);
            onStatus?.('Fast export failed. Retrying fallback...');
            onProgress(0);
          }
        }

        try {
          return await exportToMP4WithFFmpegFrames({
            canvas,
            audioBuffer: exportAudioBuffer,
            duration,
            fps,
            renderFrame: drawFrame,
            onProgress,
            onStatus,
            signal,
          });
        } catch (err) {
          if (fastExportError && !signal?.aborted) {
            throw new Error(
              `Fast export failed (${fastExportError.message}); fallback also failed (${getErrorMessage(err)})`,
            );
          }
          throw err;
        }
      } finally {
        canvas.width = previousWidth;
        canvas.height = previousHeight;
        resizeCanvasToParent(canvas);
      }
    },
    [],
  );

  useEffect(() => {
    exportRendererRef.current = renderExportFrames;
    return () => {
      if (exportRendererRef.current === renderExportFrames) {
        exportRendererRef.current = null;
      }
    };
  }, [exportRendererRef, renderExportFrames]);

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        position: 'relative',
        bgcolor: 'background.default',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
      {isExporting && (
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            bgcolor: 'rgba(0,0,0,0.7)',
            color: 'error.main',
            px: 1,
            py: 0.25,
            borderRadius: 1,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          REC
        </Box>
      )}
    </Box>
  );
}

function resizeCanvasToParent(canvas: HTMLCanvasElement) {
  const parent = canvas.parentElement;
  const width = Math.max(1, Math.floor(parent?.clientWidth || canvas.clientWidth || 1));
  const height = Math.max(1, Math.floor(parent?.clientHeight || canvas.clientHeight || 1));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function sampleAnalyserFrame(
  analyser: AnalyserNode,
  timeDomainRef: MutableRefObject<Uint8Array<ArrayBuffer> | null>,
  frequencyRef: MutableRefObject<Uint8Array<ArrayBuffer> | null>,
): WaveFrame {
  let timeDomain = timeDomainRef.current;
  if (!timeDomain || timeDomain.length !== analyser.fftSize) {
    timeDomain = new Uint8Array(analyser.fftSize);
    timeDomainRef.current = timeDomain;
  }
  let frequency = frequencyRef.current;
  if (!frequency || frequency.length !== analyser.frequencyBinCount) {
    frequency = new Uint8Array(analyser.frequencyBinCount);
    frequencyRef.current = frequency;
  }

  analyser.getByteTimeDomainData(timeDomain);
  analyser.getByteFrequencyData(frequency);

  const waveform = new Float32Array(WAVEFORM_POINTS);
  let rms = 0;
  for (let i = 0; i < WAVEFORM_POINTS; i++) {
    const sampleIndex = Math.min(timeDomain.length - 1, Math.floor(i / WAVEFORM_POINTS * timeDomain.length));
    const value = (timeDomain[sampleIndex] - 128) / 128;
    waveform[i] = value;
    rms += value * value;
  }

  const spectrum = new Float32Array(SPECTRUM_POINTS);
  for (let i = 0; i < SPECTRUM_POINTS; i++) {
    const sourceIndex = frequencyIndexForBar(i, SPECTRUM_POINTS, frequency.length);
    spectrum[i] = frequency[sourceIndex] / 255;
  }

  const bands = computeBands(spectrum);
  return {
    waveform,
    spectrum,
    volume: Math.min(1, Math.sqrt(rms / WAVEFORM_POINTS) * 2.8),
    bass: bands.bass,
    mid: bands.mid,
    high: bands.high,
    transient: Math.max(0, bands.bass - 0.35) * 1.8,
  };
}

function sampleAudioBufferFrame(audioBuffer: AudioBuffer, analysis: AudioAnalysis, time: number): WaveFrame {
  const channel = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const windowSamples = Math.max(WAVEFORM_POINTS, Math.floor(sampleRate * 0.09));
  const centerSample = Math.floor(clamp(time, 0, audioBuffer.duration) * sampleRate);
  const maxStart = Math.max(0, channel.length - windowSamples - 1);
  const start = Math.min(maxStart, Math.max(0, centerSample - Math.floor(windowSamples / 2)));
  const waveform = new Float32Array(WAVEFORM_POINTS);

  let rms = 0;
  for (let i = 0; i < WAVEFORM_POINTS; i++) {
    const sampleIndex = start + Math.floor(i / Math.max(1, WAVEFORM_POINTS - 1) * windowSamples);
    const value = channel[Math.min(channel.length - 1, sampleIndex)] ?? 0;
    waveform[i] = value;
    rms += value * value;
  }

  const spectrum = new Float32Array(SPECTRUM_POINTS);
  const spectrumIndex = Math.min(
    Math.floor((analysis.duration > 0 ? time / analysis.duration : 0) * analysis.spectrum.length),
    Math.max(analysis.spectrum.length - 1, 0),
  );
  const rawSpectrum = analysis.spectrum[spectrumIndex];
  if (rawSpectrum) {
    for (let i = 0; i < SPECTRUM_POINTS; i++) {
      const sourceIndex = frequencyIndexForBar(i, SPECTRUM_POINTS, rawSpectrum.length);
      spectrum[i] = Math.min(1, Math.sqrt(Math.max(0, rawSpectrum[sourceIndex])) * 24);
    }
  }

  const bands = computeBands(spectrum);
  return {
    waveform,
    spectrum,
    volume: Math.min(1, Math.sqrt(rms / WAVEFORM_POINTS) * 3.2),
    bass: bands.bass,
    mid: bands.mid,
    high: bands.high,
    transient: analysis.transientMap[spectrumIndex] ?? 0,
  };
}

function drawEmptyWaveCanvas(
  canvas: HTMLCanvasElement,
  settings: WaveVisualizerSettings,
  backgroundImage: HTMLImageElement | null,
) {
  const emptyFrame: WaveFrame = {
    waveform: new Float32Array(WAVEFORM_POINTS),
    spectrum: new Float32Array(SPECTRUM_POINTS),
    volume: 0,
    bass: 0,
    mid: 0,
    high: 0,
    transient: 0,
  };
  drawWaveFrame(canvas, emptyFrame, settings, settings.backgroundMode === 'image' ? backgroundImage : null, 0);
}

function drawWaveFrame(
  canvas: HTMLCanvasElement,
  frame: WaveFrame,
  settings: WaveVisualizerSettings,
  backgroundImage: HTMLImageElement | null,
  time: number,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  if (width <= 0 || height <= 0) return;

  drawBackground(ctx, width, height, settings, backgroundImage);

  if (settings.type === 'circular') {
    drawCircularWave(ctx, width, height, frame, time);
  } else if (settings.type === 'bars') {
    drawSpectrumBars(ctx, width, height, frame);
  } else {
    drawHorizontalWave(ctx, width, height, frame, time);
  }
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: WaveVisualizerSettings,
  backgroundImage: HTMLImageElement | null,
) {
  ctx.clearRect(0, 0, width, height);
  if (settings.backgroundMode === 'image' && backgroundImage?.complete) {
    drawImageCover(ctx, backgroundImage, width, height);
    ctx.fillStyle = 'rgba(3, 5, 10, 0.42)';
    ctx.fillRect(0, 0, width, height);
    return;
  }

  ctx.fillStyle = '#050508';
  ctx.fillRect(0, 0, width, height);
}

function drawHorizontalWave(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: WaveFrame,
  time: number,
) {
  const centerY = height / 2;
  const startX = width * 0.14;
  const endX = width * 0.86;
  const drawWidth = endX - startX;
  const amplitude = height * (0.12 + frame.volume * 0.22 + frame.bass * 0.04);
  const drift = Math.sin(time * 1.6) * height * 0.01;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0, 229, 238, 0.92)';
  ctx.lineWidth = Math.max(2, width * 0.002 + frame.volume * 5);
  ctx.beginPath();
  for (let i = 0; i < frame.waveform.length; i++) {
    const x = startX + (i / Math.max(1, frame.waveform.length - 1)) * drawWidth;
    const y = centerY + frame.waveform[i] * amplitude + drift;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(128, 255, 210, 0.38)';
  ctx.lineWidth = Math.max(1, width * 0.0012);
  ctx.beginPath();
  for (let i = 0; i < frame.waveform.length; i++) {
    const x = startX + (i / Math.max(1, frame.waveform.length - 1)) * drawWidth;
    const y = centerY - frame.waveform[i] * amplitude * 0.64 - drift;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawCircularWave(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: WaveFrame,
  time: number,
) {
  const cx = width / 2;
  const cy = height / 2;
  const minSide = Math.min(width, height);
  const baseRadius = minSide * (0.18 + frame.volume * 0.035);
  const amplitude = minSide * (0.07 + frame.volume * 0.11);
  const points = 384;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0, 229, 238, 0.9)';
  ctx.lineWidth = Math.max(2, minSide * 0.003);
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const p = i / points;
    const angle = p * Math.PI * 2 - Math.PI / 2;
    const wave = frame.waveform[Math.floor(p * (frame.waveform.length - 1))] ?? 0;
    const spec = frame.spectrum[Math.floor(p * (frame.spectrum.length - 1))] ?? 0;
    const pulse = Math.sin(time * 2.2 + p * Math.PI * 10) * frame.high * minSide * 0.012;
    const radius = baseRadius + Math.abs(wave) * amplitude + spec * minSide * 0.065 + pulse;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(128, 255, 210, 0.34)';
  ctx.lineWidth = Math.max(1, minSide * 0.0014);
  ctx.beginPath();
  ctx.arc(cx, cy, baseRadius * (0.72 + frame.mid * 0.08), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawSpectrumBars(ctx: CanvasRenderingContext2D, width: number, height: number, frame: WaveFrame) {
  const barCount = 96;
  const centerY = height / 2;
  const totalWidth = width * 0.68;
  const startX = width / 2 - totalWidth / 2;
  const spacing = totalWidth / barCount;
  const barWidth = Math.max(2, spacing * 0.54);
  const gradient = ctx.createLinearGradient(0, centerY - height * 0.28, 0, centerY + height * 0.28);
  gradient.addColorStop(0, 'rgba(128, 255, 210, 0.88)');
  gradient.addColorStop(0.5, 'rgba(0, 229, 238, 0.96)');
  gradient.addColorStop(1, 'rgba(128, 255, 210, 0.55)');

  ctx.save();
  ctx.fillStyle = gradient;
  for (let i = 0; i < barCount; i++) {
    const spec = frame.spectrum[Math.floor(i / barCount * frame.spectrum.length)] ?? 0;
    const wave = Math.abs(frame.waveform[Math.floor(i / barCount * frame.waveform.length)] ?? 0);
    const energy = Math.min(1, spec * 0.86 + wave * 0.28 + frame.volume * 0.28 + frame.transient * 0.16);
    const barHeight = Math.max(height * 0.018, energy * height * 0.34);
    const x = startX + i * spacing + (spacing - barWidth) / 2;
    ctx.fillRect(x, centerY - barHeight, barWidth, barHeight * 2);
  }
  ctx.restore();
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const canvasRatio = width / height;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;

  if (imageRatio > canvasRatio) {
    sourceWidth = image.naturalHeight * canvasRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / canvasRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
}

function frequencyIndexForBar(index: number, total: number, sourceLength: number) {
  const normalized = index / Math.max(1, total - 1);
  return Math.min(sourceLength - 1, Math.floor(Math.pow(normalized, 1.75) * (sourceLength - 1)));
}

function computeBands(spectrum: Float32Array) {
  const bassEnd = Math.max(1, Math.floor(spectrum.length * 0.12));
  const midEnd = Math.max(bassEnd + 1, Math.floor(spectrum.length * 0.46));
  return {
    bass: averageRange(spectrum, 0, bassEnd),
    mid: averageRange(spectrum, bassEnd, midEnd),
    high: averageRange(spectrum, midEnd, spectrum.length),
  };
}

function averageRange(data: Float32Array, start: number, end: number) {
  let sum = 0;
  const safeEnd = Math.max(start + 1, end);
  for (let i = start; i < safeEnd; i++) {
    sum += data[i] ?? 0;
  }
  return sum / (safeEnd - start);
}

function loadImage(src: string, signal?: AbortSignal) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    throwIfAborted(signal);
    const image = new Image();
    const abort = () => reject(new DOMException('Export was canceled', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    image.onload = () => {
      signal?.removeEventListener('abort', abort);
      resolve(image);
    };
    image.onerror = () => {
      signal?.removeEventListener('abort', abort);
      reject(new Error('Could not load background image for export'));
    };
    image.src = src;
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Export was canceled', 'AbortError');
  }
}

function toError(err: unknown) {
  return err instanceof Error ? err : new Error(String(err));
}

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}
