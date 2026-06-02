import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import Box from '@mui/material/Box';
import { type AudioAnalysis, type EffectSettings, type ImageFxSettings, useStore } from '../store';
import { type ExportFrameRenderer } from '../export/recorder';
import { canUseWebCodecsMP4, exportToMP4WithWebCodecs } from '../export/webcodecs';
import { exportToMP4WithFFmpegFrames } from '../export/ffmpeg';

interface Props {
  exportRendererRef: MutableRefObject<ExportFrameRenderer | null>;
}

interface ImageFxFrame {
  spectrum: Float32Array;
  volume: number;
  bass: number;
  mid: number;
  high: number;
  transient: number;
}

interface CoverRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

const RENDER_FPS_LIMIT = 30;
const RENDER_FRAME_INTERVAL_MS = 1000 / RENDER_FPS_LIMIT;
const EXPORT_WIDTH = 1920;
const EXPORT_HEIGHT = 1080;
const SPECTRUM_POINTS = 128;
const NOISE_WIDTH = 180;
const NOISE_HEIGHT = 102;

export default function ImageFXVisualizer({ exportRendererRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);
  const noiseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const postCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const feedbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioStartedRef = useRef(0);
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
    analyser.smoothingTimeConstant = 0.74;
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
      source.onended = null;
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

    let frame: ImageFxFrame | null = null;
    if (analyserRef.current && state.isPlaying) {
      frame = sampleAnalyserFrame(analyserRef.current, timeDomainRef, frequencyRef);
      if (audioCtxRef.current) {
        setCurrentTime(audioCtxRef.current.currentTime - audioStartedRef.current);
      }
    } else if (state.audioBuffer && state.analysis) {
      frame = sampleAudioBufferFrame(state.audioBuffer, state.analysis, state.currentTime);
    }

    drawImageFxFrame(
      canvas,
      applyLiveImageFxBoost(frame ?? createEmptyFrame()),
      state.imageFxSettings,
      state.effects,
      backgroundImageRef.current,
      renderTimestamp / 1000,
      getNoiseCanvas(noiseCanvasRef),
      getEffectCanvas(postCanvasRef, canvas.width, canvas.height),
      getEffectCanvas(feedbackCanvasRef, canvas.width, canvas.height),
    );
  }, [setCurrentTime, setFps]);

  useEffect(() => {
    lastRenderTimeRef.current = performance.now();
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
        imageFxSettings,
        effects,
        backgroundImageUrl: exportBackgroundImageUrl,
      } = useStore.getState();
      if (!canvas || !exportAudioBuffer || !exportAnalysis) {
        throw new Error('Image FX visualizer is not ready for export');
      }

      throwIfAborted(signal);
      const previousWidth = canvas.width;
      const previousHeight = canvas.height;
      canvas.width = EXPORT_WIDTH;
      canvas.height = EXPORT_HEIGHT;

      let exportBackgroundImage: HTMLImageElement | null = null;
      if (exportBackgroundImageUrl) {
        exportBackgroundImage = backgroundImageRef.current ?? await loadImage(exportBackgroundImageUrl, signal);
        backgroundImageRef.current = exportBackgroundImage;
      }

      const fps = RENDER_FPS_LIMIT;
      const noiseCanvas = getNoiseCanvas(noiseCanvasRef);
      const postCanvas = getEffectCanvas(postCanvasRef, EXPORT_WIDTH, EXPORT_HEIGHT);
      const feedbackCanvas = getEffectCanvas(feedbackCanvasRef, EXPORT_WIDTH, EXPORT_HEIGHT);
      clearEffectCanvas(feedbackCanvas);
      const drawFrame = (time: number, frame: number) => {
        const fxFrame = sampleAudioBufferFrame(exportAudioBuffer, exportAnalysis, time);
        drawImageFxFrame(
          canvas,
          fxFrame,
          imageFxSettings,
          effects,
          exportBackgroundImage,
          time + frame * 0.017,
          noiseCanvas,
          postCanvas,
          feedbackCanvas,
        );
      };

      try {
        let fastExportError: Error | null = null;
        if (canUseWebCodecsMP4()) {
          try {
            onStatus?.('Rendering Image FX MP4...');
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
            console.warn('Fast WebCodecs Image FX export failed, falling back to ffmpeg.wasm:', err);
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
): ImageFxFrame {
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

  let rms = 0;
  for (let i = 0; i < timeDomain.length; i++) {
    const value = (timeDomain[i] - 128) / 128;
    rms += value * value;
  }

  const spectrum = new Float32Array(SPECTRUM_POINTS);
  for (let i = 0; i < SPECTRUM_POINTS; i++) {
    const sourceIndex = frequencyIndexForBar(i, SPECTRUM_POINTS, frequency.length);
    spectrum[i] = frequency[sourceIndex] / 255;
  }

  const bands = computeBands(spectrum);
  return {
    spectrum,
    volume: Math.min(1, Math.sqrt(rms / timeDomain.length) * 3),
    bass: bands.bass,
    mid: bands.mid,
    high: bands.high,
    transient: Math.max(0, bands.bass - 0.34) * 1.9,
  };
}

function sampleAudioBufferFrame(audioBuffer: AudioBuffer, analysis: AudioAnalysis, time: number): ImageFxFrame {
  const channel = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const windowSamples = Math.max(1024, Math.floor(sampleRate * 0.06));
  const centerSample = Math.floor(clamp(time, 0, audioBuffer.duration) * sampleRate);
  const maxStart = Math.max(0, channel.length - windowSamples - 1);
  const start = Math.min(maxStart, Math.max(0, centerSample - Math.floor(windowSamples / 2)));

  let rms = 0;
  for (let i = 0; i < windowSamples; i++) {
    const value = channel[start + i] ?? 0;
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
    spectrum,
    volume: Math.min(1, Math.sqrt(rms / windowSamples) * 3.2),
    bass: bands.bass,
    mid: bands.mid,
    high: bands.high,
    transient: analysis.transientMap[spectrumIndex] ?? 0,
  };
}

function drawImageFxFrame(
  canvas: HTMLCanvasElement,
  frame: ImageFxFrame,
  settings: ImageFxSettings,
  effects: EffectSettings,
  backgroundImage: HTMLImageElement | null,
  time: number,
  noiseCanvas: HTMLCanvasElement,
  postCanvas: HTMLCanvasElement,
  feedbackCanvas: HTMLCanvasElement,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  if (width <= 0 || height <= 0) return;

  ctx.clearRect(0, 0, width, height);
  if (backgroundImage?.complete && backgroundImage.naturalWidth > 0) {
    drawReactiveImage(ctx, backgroundImage, width, height, frame, settings, time);
  } else {
    drawSolidFallback(ctx, width, height, frame, settings, time);
  }

  drawLightLeak(ctx, width, height, frame, settings, time);
  drawPulseOverlay(ctx, width, height, frame, settings, time);
  drawNoise(ctx, width, height, frame, settings, time, noiseCanvas);
  drawScanlines(ctx, width, height, frame, settings);
  drawVignette(ctx, width, height, frame, settings);
  drawToggleEffects(canvas, ctx, width, height, frame, effects, time, postCanvas, feedbackCanvas);
}

function drawReactiveImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  frame: ImageFxFrame,
  settings: ImageFxSettings,
  time: number,
) {
  const beat = Math.max(frame.volume, frame.transient);
  const zoom = 1 + settings.pulse * (frame.volume * 0.035 + frame.transient * 0.045);
  const shake = settings.pulse * frame.transient;
  const shakeX = (Math.sin(time * 21.7) + Math.sin(time * 7.1) * 0.5) * shake * width * 0.012;
  const shakeY = (Math.cos(time * 18.4) + Math.sin(time * 5.3) * 0.4) * shake * height * 0.01;
  const blurPx = settings.blur * (1 + frame.high * 2.4) * 9;
  const saturation = 1 + frame.mid * 0.55 + settings.glow * 0.42;
  const contrast = 1 + frame.bass * 0.26 + settings.distortion * 0.16;
  const brightness = 0.92 + beat * 0.24 + settings.glow * 0.12;
  const hue = (frame.high - frame.bass) * settings.rgbShift * 18;

  ctx.save();
  ctx.filter = `blur(${blurPx.toFixed(2)}px) saturate(${saturation.toFixed(3)}) contrast(${contrast.toFixed(3)}) brightness(${brightness.toFixed(3)}) hue-rotate(${hue.toFixed(2)}deg)`;
  ctx.translate(width / 2 + shakeX, height / 2 + shakeY);
  ctx.scale(zoom, zoom);
  ctx.translate(-width / 2, -height / 2);
  drawImageCover(ctx, image, width, height);
  ctx.restore();

  drawDistortedStrips(ctx, image, width, height, frame, settings, time);
  drawRgbShift(ctx, image, width, height, frame, settings, time);
}

function drawSolidFallback(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: ImageFxFrame,
  settings: ImageFxSettings,
  time: number,
) {
  const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.62);
  gradient.addColorStop(0, `rgba(${Math.round(8 + frame.high * 42)}, ${Math.round(24 + frame.mid * 40)}, ${Math.round(34 + frame.bass * 50)}, 1)`);
  gradient.addColorStop(1, '#050508');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = settings.distortion * 0.22 + frame.volume * 0.08;
  ctx.translate(Math.sin(time) * width * 0.01, Math.cos(time * 1.3) * height * 0.01);
  ctx.fillStyle = 'rgba(0, 229, 238, 0.18)';
  ctx.fillRect(width * 0.14, height * 0.34, width * 0.72, height * 0.32);
  ctx.restore();
}

function drawDistortedStrips(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  frame: ImageFxFrame,
  settings: ImageFxSettings,
  time: number,
) {
  const amount = settings.distortion * (0.22 + frame.mid * 0.55 + frame.transient * 0.35);
  if (amount <= 0.01) return;

  const cover = getCoverRect(image, width, height);
  const strips = 34;
  ctx.save();
  ctx.globalAlpha = Math.min(0.46, amount * 0.9);
  ctx.filter = `contrast(${(1.05 + settings.distortion * 0.18).toFixed(3)})`;
  for (let i = 0; i < strips; i++) {
    const y = i / strips * height;
    const stripHeight = Math.ceil(height / strips) + 1;
    const sourceY = cover.sy + (y / height) * cover.sh;
    const sourceHeight = (stripHeight / height) * cover.sh;
    const bandEnergy = frame.spectrum[Math.floor(i / strips * frame.spectrum.length)] ?? 0;
    const offset = (
      Math.sin(time * 4.5 + i * 1.73) * 0.5
      + Math.sin(time * 13.1 + i * 0.37) * frame.transient
      + (bandEnergy - 0.5) * frame.mid
    ) * amount * width * 0.07;
    ctx.drawImage(image, cover.sx, sourceY, cover.sw, sourceHeight, offset, y, width, stripHeight);
  }
  ctx.restore();
}

function drawRgbShift(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  frame: ImageFxFrame,
  settings: ImageFxSettings,
  time: number,
) {
  const amount = settings.rgbShift * (0.24 + frame.high * 0.5 + frame.transient * 0.26);
  if (amount <= 0.01) return;

  const offset = amount * width * 0.018;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = Math.min(0.38, amount * 0.62);
  ctx.filter = 'saturate(1.45) contrast(1.08)';
  ctx.translate(Math.sin(time * 8.2) * offset + offset, 0);
  drawImageCover(ctx, image, width, height);
  ctx.translate(-offset * 2.1, Math.cos(time * 6.7) * offset * 0.34);
  drawImageCover(ctx, image, width, height);
  ctx.globalAlpha = Math.min(0.22, amount * 0.36);
  ctx.fillStyle = 'rgba(255, 20, 80, 1)';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(0, 220, 255, 1)';
  ctx.fillRect(-offset * 1.5, 0, width, height);
  ctx.restore();
}

function drawLightLeak(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: ImageFxFrame,
  settings: ImageFxSettings,
  time: number,
) {
  const strength = settings.glow * (0.18 + frame.volume * 0.38 + frame.bass * 0.2);
  if (strength <= 0.01) return;

  const x = width * (0.18 + Math.sin(time * 0.41) * 0.08);
  const y = height * (0.12 + Math.cos(time * 0.31) * 0.05);
  const radius = Math.max(width, height) * (0.32 + frame.volume * 0.18);
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(0, 229, 238, ${Math.min(0.38, strength)})`);
  gradient.addColorStop(0.42, `rgba(255, 64, 160, ${Math.min(0.18, strength * 0.45)})`);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawPulseOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: ImageFxFrame,
  settings: ImageFxSettings,
  time: number,
) {
  const pulse = settings.pulse * (frame.volume * 0.2 + frame.transient * 0.32 + frame.bass * 0.12);
  if (pulse <= 0.01) return;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = Math.min(0.28, pulse);
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, 'rgba(0, 229, 238, 0.42)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.14)');
  gradient.addColorStop(1, 'rgba(255, 48, 160, 0.34)');
  ctx.fillStyle = gradient;
  ctx.translate(Math.sin(time * 2.7) * width * 0.03, 0);
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawNoise(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: ImageFxFrame,
  settings: ImageFxSettings,
  time: number,
  noiseCanvas: HTMLCanvasElement,
) {
  const strength = settings.noise * (0.18 + frame.high * 0.4 + frame.transient * 0.22);
  if (strength <= 0.01) return;

  const noiseCtx = noiseCanvas.getContext('2d');
  if (!noiseCtx) return;
  const imageData = noiseCtx.createImageData(NOISE_WIDTH, NOISE_HEIGHT);
  const seed = Math.floor(time * 60);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const value = hashNoise(i + seed) * 255;
    imageData.data[i] = value;
    imageData.data[i + 1] = value;
    imageData.data[i + 2] = value;
    imageData.data[i + 3] = 255;
  }
  noiseCtx.putImageData(imageData, 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = Math.min(0.36, strength);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(noiseCanvas, 0, 0, width, height);
  ctx.restore();
}

function drawScanlines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: ImageFxFrame,
  settings: ImageFxSettings,
) {
  const alpha = Math.min(0.2, settings.noise * 0.12 + settings.rgbShift * 0.07 + frame.high * 0.04);
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  const gap = Math.max(3, Math.floor(height / 180));
  for (let y = 0; y < height; y += gap * 2) {
    ctx.fillRect(0, y, width, gap);
  }
  ctx.restore();
}

function drawVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: ImageFxFrame,
  settings: ImageFxSettings,
) {
  const gradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.25, width / 2, height / 2, Math.max(width, height) * 0.68);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, `rgba(0, 0, 0, ${0.42 + settings.blur * 0.18 + frame.bass * 0.08})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawToggleEffects(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: ImageFxFrame,
  effects: EffectSettings,
  time: number,
  postCanvas: HTMLCanvasElement,
  feedbackCanvas: HTMLCanvasElement,
) {
  const hasDatamosh = effects.datamosh
    || effects.strongDatamosh
    || effects.blockDatamosh
    || effects.glitchDatamosh
    || effects.meltingDatamosh;

  if (hasDatamosh) {
    copyCanvas(postCanvas, canvas, width, height);
    drawDatamoshFeedback(ctx, postCanvas, feedbackCanvas, width, height, frame, effects, time);
  }

  if (effects.blockDatamosh) {
    copyCanvas(postCanvas, canvas, width, height);
    drawBlockDatamosh(ctx, postCanvas, width, height, frame, time);
  }

  if (effects.glitchDatamosh) {
    copyCanvas(postCanvas, canvas, width, height);
    drawGlitchDatamosh(ctx, postCanvas, width, height, frame, time);
  }

  if (effects.meltingDatamosh) {
    copyCanvas(postCanvas, canvas, width, height);
    drawMeltDatamosh(ctx, postCanvas, width, height, frame, time);
  }

  if (effects.rgbSplit || effects.chromaticAberration) {
    copyCanvas(postCanvas, canvas, width, height);
    drawToggleRgbSplit(ctx, postCanvas, width, height, frame, effects, time);
  }

  if (effects.glitchNoise) {
    drawToggleGlitchNoise(ctx, width, height, frame, time);
  }

  if (effects.cameraShake) {
    copyCanvas(postCanvas, canvas, width, height);
    drawCameraShake(ctx, postCanvas, width, height, frame, time);
  }

  copyCanvas(feedbackCanvas, canvas, width, height);
}

function drawDatamoshFeedback(
  ctx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  feedbackCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  frame: ImageFxFrame,
  effects: EffectSettings,
  time: number,
) {
  const level = getDatamoshLevel(effects);
  if (level <= 0) return;

  const beat = Math.max(frame.bass, frame.transient);
  const feedbackAlpha = Math.min(0.28, 0.08 + level * 0.12 + beat * 0.08);
  const shiftX = Math.sin(time * 3.1 + frame.mid * 4) * width * (0.004 + level * 0.006);
  const shiftY = Math.cos(time * 2.4 + frame.high * 3) * height * (0.003 + level * 0.004);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = feedbackAlpha;
  ctx.drawImage(feedbackCanvas, shiftX, shiftY, width, height);
  ctx.restore();

  const stripCount = Math.floor(12 + level * 24 + frame.mid * 16);
  ctx.save();
  ctx.globalAlpha = Math.min(0.34, 0.12 + level * 0.16);
  for (let i = 0; i < stripCount; i++) {
    const band = frame.spectrum[Math.floor((i / Math.max(1, stripCount - 1)) * frame.spectrum.length)] ?? 0;
    const y = Math.floor((i / stripCount) * height);
    const stripHeight = Math.max(2, Math.ceil(height / stripCount) + 1);
    const offset = (
      Math.sin(time * 5.7 + i * 1.91)
      + (seededNoise(time, i) - 0.5) * 1.8
      + band * frame.transient * 1.6
    ) * width * (0.004 + level * 0.012);
    ctx.drawImage(sourceCanvas, 0, y, width, stripHeight, offset, y, width, stripHeight);
  }
  ctx.restore();
}

function drawBlockDatamosh(
  ctx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  frame: ImageFxFrame,
  time: number,
) {
  const blockCount = Math.floor(10 + frame.bass * 18 + frame.mid * 12);
  const minSize = Math.max(12, Math.floor(Math.min(width, height) * 0.026));
  const maxSize = Math.max(minSize + 1, Math.floor(Math.min(width, height) * 0.105));

  ctx.save();
  ctx.globalAlpha = Math.min(0.48, 0.22 + frame.transient * 0.22);
  for (let i = 0; i < blockCount; i++) {
    const sizeNoise = seededNoise(time, i * 9 + 2);
    const blockW = Math.floor(minSize + sizeNoise * (maxSize - minSize));
    const blockH = Math.floor(blockW * (0.55 + seededNoise(time, i * 9 + 3) * 1.15));
    const sx = Math.floor(seededNoise(time, i * 9 + 4) * Math.max(1, width - blockW));
    const sy = Math.floor(seededNoise(time, i * 9 + 5) * Math.max(1, height - blockH));
    const band = frame.spectrum[Math.floor((i / Math.max(1, blockCount - 1)) * frame.spectrum.length)] ?? 0;
    const dx = clamp(sx + (seededNoise(time, i * 9 + 6) - 0.5) * width * (0.035 + band * 0.05), -blockW, width);
    const dy = clamp(sy + (seededNoise(time, i * 9 + 7) - 0.5) * height * (0.02 + frame.transient * 0.035), -blockH, height);
    ctx.drawImage(sourceCanvas, sx, sy, blockW, blockH, dx, dy, blockW, blockH);
  }
  ctx.restore();
}

function drawGlitchDatamosh(
  ctx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  frame: ImageFxFrame,
  time: number,
) {
  const slices = Math.floor(8 + frame.high * 18 + frame.transient * 10);
  ctx.save();
  ctx.globalAlpha = Math.min(0.42, 0.2 + frame.high * 0.24);
  for (let i = 0; i < slices; i++) {
    const y = Math.floor(seededNoise(time, i * 17 + 1) * height);
    const sliceHeight = Math.max(2, Math.floor((0.006 + seededNoise(time, i * 17 + 2) * 0.026) * height));
    const offset = (seededNoise(time, i * 17 + 3) - 0.5) * width * (0.05 + frame.transient * 0.08);
    ctx.drawImage(sourceCanvas, 0, y, width, sliceHeight, offset, y, width, sliceHeight);
  }

  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < Math.floor(3 + frame.transient * 8); i++) {
    const y = seededNoise(time, i * 23 + 4) * height;
    const h = Math.max(1, height * (0.003 + seededNoise(time, i * 23 + 5) * 0.008));
    ctx.fillStyle = i % 2 === 0 ? 'rgba(0, 229, 238, 0.22)' : 'rgba(255, 48, 160, 0.2)';
    ctx.fillRect(0, y, width, h);
  }
  ctx.restore();
}

function drawMeltDatamosh(
  ctx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  frame: ImageFxFrame,
  time: number,
) {
  const columns = 30;
  const columnWidth = Math.ceil(width / columns);
  ctx.save();
  ctx.globalAlpha = Math.min(0.32, 0.14 + frame.bass * 0.16 + frame.transient * 0.08);
  for (let i = 0; i < columns; i++) {
    const x = i * columnWidth;
    const energy = frame.spectrum[Math.floor((i / Math.max(1, columns - 1)) * frame.spectrum.length)] ?? 0;
    const pull = (0.025 + energy * 0.09 + frame.bass * 0.04) * height;
    const drift = Math.sin(time * 1.8 + i * 0.7) * columnWidth * 0.55;
    const sourceY = Math.max(0, Math.sin(time * 0.9 + i) * height * 0.025);
    ctx.drawImage(
      sourceCanvas,
      x,
      sourceY,
      Math.min(columnWidth + 1, width - x),
      height - sourceY,
      x + drift,
      sourceY + pull * 0.18,
      Math.min(columnWidth + 1, width - x),
      height - sourceY + pull,
    );
  }
  ctx.restore();
}

function drawToggleRgbSplit(
  ctx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  frame: ImageFxFrame,
  effects: EffectSettings,
  time: number,
) {
  const chroma = effects.chromaticAberration ? 0.75 : 0;
  const split = effects.rgbSplit ? 1 : 0;
  const amount = (chroma + split) * (0.26 + frame.high * 0.32 + frame.transient * 0.16);
  if (amount <= 0.01) return;

  const offsetX = amount * width * 0.014;
  const offsetY = Math.sin(time * 4.3) * amount * height * 0.004;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = Math.min(0.28, amount * 0.22);
  ctx.filter = 'sepia(1) saturate(2.4) hue-rotate(295deg)';
  ctx.drawImage(sourceCanvas, offsetX, offsetY, width, height);
  ctx.filter = 'sepia(1) saturate(2.1) hue-rotate(135deg)';
  ctx.drawImage(sourceCanvas, -offsetX * 0.9, -offsetY, width, height);
  ctx.restore();
}

function drawToggleGlitchNoise(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: ImageFxFrame,
  time: number,
) {
  const amount = 0.16 + frame.high * 0.22 + frame.transient * 0.24;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 18; i++) {
    const alpha = amount * (0.18 + seededNoise(time, i * 31) * 0.28);
    const w = width * (0.02 + seededNoise(time, i * 31 + 1) * 0.18);
    const h = Math.max(1, height * (0.002 + seededNoise(time, i * 31 + 2) * 0.008));
    const x = seededNoise(time, i * 31 + 3) * width;
    const y = seededNoise(time, i * 31 + 4) * height;
    ctx.fillStyle = i % 3 === 0
      ? `rgba(0, 229, 238, ${alpha})`
      : i % 3 === 1
        ? `rgba(255, 64, 160, ${alpha})`
        : `rgba(255, 255, 255, ${alpha * 0.72})`;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

function drawCameraShake(
  ctx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  frame: ImageFxFrame,
  time: number,
) {
  const strength = 0.004 + frame.transient * 0.014 + frame.bass * 0.006;
  const shakeX = (Math.sin(time * 19.3) + Math.sin(time * 7.7) * 0.45) * width * strength;
  const shakeY = (Math.cos(time * 17.1) + Math.sin(time * 6.1) * 0.4) * height * strength;
  const pad = Math.ceil(Math.max(width, height) * 0.025);

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(sourceCanvas, -pad + shakeX, -pad + shakeY, width + pad * 2, height + pad * 2);
  ctx.restore();
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const cover = getCoverRect(image, width, height);
  ctx.drawImage(image, cover.sx, cover.sy, cover.sw, cover.sh, 0, 0, width, height);
}

function getCoverRect(image: HTMLImageElement, width: number, height: number): CoverRect {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const canvasRatio = width / height;
  let sw = image.naturalWidth;
  let sh = image.naturalHeight;
  let sx = 0;
  let sy = 0;

  if (imageRatio > canvasRatio) {
    sw = image.naturalHeight * canvasRatio;
    sx = (image.naturalWidth - sw) / 2;
  } else {
    sh = image.naturalWidth / canvasRatio;
    sy = (image.naturalHeight - sh) / 2;
  }

  return { sx, sy, sw, sh };
}

function frequencyIndexForBar(index: number, total: number, sourceLength: number) {
  const normalized = index / Math.max(1, total - 1);
  return Math.min(sourceLength - 1, Math.floor(Math.pow(normalized, 1.72) * (sourceLength - 1)));
}

function computeBands(spectrum: Float32Array) {
  const bassEnd = Math.max(1, Math.floor(spectrum.length * 0.12));
  const midEnd = Math.max(bassEnd + 1, Math.floor(spectrum.length * 0.48));
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

function getNoiseCanvas(noiseCanvasRef: MutableRefObject<HTMLCanvasElement | null>) {
  if (!noiseCanvasRef.current) {
    const canvas = document.createElement('canvas');
    canvas.width = NOISE_WIDTH;
    canvas.height = NOISE_HEIGHT;
    noiseCanvasRef.current = canvas;
  }
  return noiseCanvasRef.current;
}

function getEffectCanvas(
  canvasRef: MutableRefObject<HTMLCanvasElement | null>,
  width: number,
  height: number,
) {
  if (!canvasRef.current) {
    canvasRef.current = document.createElement('canvas');
  }
  const canvas = canvasRef.current;
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  if (canvas.width !== safeWidth || canvas.height !== safeHeight) {
    canvas.width = safeWidth;
    canvas.height = safeHeight;
  }
  return canvas;
}

function clearEffectCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  ctx?.clearRect(0, 0, canvas.width, canvas.height);
}

function copyCanvas(
  targetCanvas: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement,
  width: number,
  height: number,
) {
  if (targetCanvas.width !== width || targetCanvas.height !== height) {
    targetCanvas.width = width;
    targetCanvas.height = height;
  }
  const targetCtx = targetCanvas.getContext('2d');
  if (!targetCtx) return;
  targetCtx.clearRect(0, 0, width, height);
  targetCtx.drawImage(sourceCanvas, 0, 0, width, height);
}

function getDatamoshLevel(effects: EffectSettings) {
  let level = effects.datamosh ? 0.38 : 0;
  if (effects.strongDatamosh) level = Math.max(level, 0.7);
  if (effects.blockDatamosh) level = Math.max(level, 0.52);
  if (effects.glitchDatamosh) level = Math.max(level, 0.58);
  if (effects.meltingDatamosh) level = Math.max(level, 0.54);
  return level;
}

function seededNoise(time: number, index: number) {
  return hashNoise(Math.floor(time * 30) * 131 + index * 17);
}

function hashNoise(value: number) {
  const x = Math.sin(value * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function createEmptyFrame(): ImageFxFrame {
  return {
    spectrum: new Float32Array(SPECTRUM_POINTS),
    volume: 0,
    bass: 0,
    mid: 0,
    high: 0,
    transient: 0,
  };
}

function applyLiveImageFxBoost(frame: ImageFxFrame): ImageFxFrame {
  const { isLiveMode, liveIntensity, liveBoost } = useStore.getState();
  if (!isLiveMode) return frame;
  const multiplier = liveIntensity * (liveBoost ? 1.45 : 1);
  return {
    ...frame,
    spectrum: scaleFloatArray(frame.spectrum, multiplier),
    volume: clamp01(frame.volume * multiplier),
    bass: clamp01(frame.bass * multiplier),
    mid: clamp01(frame.mid * multiplier),
    high: clamp01(frame.high * multiplier),
    transient: clamp01(frame.transient * multiplier),
  };
}

function scaleFloatArray(values: Float32Array, multiplier: number) {
  const next = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    next[i] = clamp01(values[i] * multiplier);
  }
  return next;
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

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
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
