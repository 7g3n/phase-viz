import React, { useRef, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import { type AudioAnalysis, useStore } from '../store';
import { VisualizerScene } from '../visual/scene';
import { PRESETS, type PresetConfig } from '../visual/presets';
import { type ExportFrameRenderer, FrameRecorder } from '../export/recorder';
import { exportToMP4WithFFmpegFrames } from '../export/ffmpeg';
import { canUseWebCodecsMP4, exportToMP4WithWebCodecs } from '../export/webcodecs';

interface Props {
  recorderRef: React.MutableRefObject<FrameRecorder | null>;
  exportRendererRef: React.MutableRefObject<ExportFrameRenderer | null>;
}

const RENDER_FPS_LIMIT = 30;
const RENDER_FRAME_INTERVAL_MS = 1000 / RENDER_FPS_LIMIT;
const EXPORT_FPS_LIMIT = 30;
const EXPORT_WIDTH = 1920;
const EXPORT_HEIGHT = 1080;

export default function VisualizerCanvas({ recorderRef, exportRendererRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<VisualizerScene | null>(null);
  const rafRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const audioStartedRef = useRef<number>(0);
  const lastFrameTime = useRef<number>(0);
  const lastRenderTimeRef = useRef<number>(0);
  const lastFpsReportRef = useRef<number>(0);
  const fpsCountRef = useRef<number[]>([]);
  const liveFrameRef = useRef<AnalysisFrame | null>(null);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const timeDomainRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const particleSizeScaleRef = useRef(useStore.getState().particleSettings.sizeScale);

  const {
    analysis,
    audioBuffer,
    isPlaying,
    preset,
    presetRevision,
    effects,
    particleSettings,
    backgroundImageUrl,
    setFps,
    setCurrentTime,
    isExporting,
  } = useStore();

  // Init scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new VisualizerScene(canvas);
    sceneRef.current = scene;

    if (recorderRef) {
      recorderRef.current = new FrameRecorder(canvas);
    }

    const onResize = () => {
      if (useStore.getState().isExporting) return;
      const el = canvas.parentElement;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      scene.resize(w, h);
    };
    onResize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(rafRef.current);
      scene.dispose();
    };
  }, [recorderRef]);

  // Apply preset when it changes
  useEffect(() => {
    if (!sceneRef.current) return;
    sceneRef.current.applyPreset(
      createParticleAdjustedPreset(PRESETS[preset], particleSettings.countScale, particleSizeScaleRef.current),
    );
  }, [preset, presetRevision, particleSettings.countScale]);

  useEffect(() => {
    particleSizeScaleRef.current = particleSettings.sizeScale;
    sceneRef.current?.setParticleSize(getEffectiveParticleSize(PRESETS[preset], particleSettings.sizeScale));
  }, [preset, particleSettings.sizeScale]);

  // Apply background image when it changes
  useEffect(() => {
    if (!sceneRef.current) return;
    sceneRef.current.setBackgroundImage(backgroundImageUrl);
  }, [backgroundImageUrl]);

  // Setup audio analyzer
  useEffect(() => {
    if (!audioBuffer || !isPlaying) return;

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.75;
    analyser.connect(ctx.destination);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);
    source.start(0, useStore.getState().currentTime);

    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    sourceRef.current = source;
    audioStartedRef.current = ctx.currentTime - useStore.getState().currentTime;
    startTimeRef.current = performance.now();

    source.onended = () => {
      useStore.getState().setIsPlaying(false);
    };

    return () => {
      source.stop();
      source.disconnect();
      ctx.close();
      audioCtxRef.current = null;
      analyserRef.current = null;
      sourceRef.current = null;
    };
  }, [audioBuffer, isPlaying]);

  // Animation loop
  const renderFrame = useCallback(
    (timestamp: number) => {
      const scene = sceneRef.current;
      if (!scene) return;
      if (isExporting || useStore.getState().isExporting) {
        lastFrameTime.current = timestamp;
        lastRenderTimeRef.current = timestamp;
        return;
      }

      const elapsedSinceRender = timestamp - lastRenderTimeRef.current;
      if (elapsedSinceRender < RENDER_FRAME_INTERVAL_MS) {
        return;
      }

      const renderTimestamp = timestamp - (elapsedSinceRender % RENDER_FRAME_INTERVAL_MS);
      const dt = Math.min((renderTimestamp - lastFrameTime.current) / 1000, 0.05);
      lastFrameTime.current = renderTimestamp;
      lastRenderTimeRef.current = renderTimestamp;

      // FPS tracking
      const fpsSamples = fpsCountRef.current;
      fpsSamples.push(renderTimestamp);
      while (fpsSamples.length > 0 && renderTimestamp - fpsSamples[0] >= 1000) {
        fpsSamples.shift();
      }
      if (renderTimestamp - lastFpsReportRef.current >= 500) {
        lastFpsReportRef.current = renderTimestamp;
        setFps(fpsSamples.length);
      }

      // Get audio data
      let bass = 0, mid = 0, high = 0, transient = 0;
      const liveFrame = liveFrameRef.current ?? createReusableAnalysisFrame();
      liveFrameRef.current = liveFrame;
      const { waveformL, waveformR } = liveFrame;
      waveformL.fill(0);
      waveformR.fill(0);

      if (analyserRef.current && isPlaying) {
        const analyser = analyserRef.current;
        let freqData = freqDataRef.current;
        if (!freqData || freqData.length !== analyser.frequencyBinCount) {
          freqData = new Uint8Array(analyser.frequencyBinCount);
          freqDataRef.current = freqData;
        }
        analyser.getByteFrequencyData(freqData);

        const binCount = freqData.length;
        const bassEnd = Math.max(1, Math.floor(binCount * 0.05));
        const midEnd = Math.max(bassEnd + 1, Math.floor(binCount * 0.35));

        for (let i = 0; i < bassEnd; i++) bass += freqData[i];
        bass = bass / bassEnd / 255;

        for (let i = bassEnd; i < midEnd; i++) mid += freqData[i];
        mid = mid / (midEnd - bassEnd) / 255;

        for (let i = midEnd; i < binCount; i++) high += freqData[i];
        high = high / (binCount - midEnd) / 255;

        let timeDomain = timeDomainRef.current;
        if (!timeDomain || timeDomain.length !== waveformL.length) {
          timeDomain = new Uint8Array(waveformL.length);
          timeDomainRef.current = timeDomain;
        }
        analyser.getByteTimeDomainData(timeDomain);
        for (let i = 0; i < waveformL.length; i++) {
          waveformL[i] = (timeDomain[i] / 128 - 1);
          waveformR[i] = waveformL[i] * 0.9;
        }

        // Simple transient detection
        transient = Math.max(0, bass - 0.3) * 2;

        // Update current time
        if (audioCtxRef.current) {
          const elapsed = audioCtxRef.current.currentTime - audioStartedRef.current;
          setCurrentTime(elapsed);
        }
      } else if (analysis) {
        // Preview from analysis data when not playing
        const t = (renderTimestamp / 1000) % (analysis.duration || 60);
        sampleAnalysisFrameInto(analysis, t, liveFrame);
        bass = liveFrame.bass;
        mid = liveFrame.mid;
        high = liveFrame.high;
        transient = liveFrame.transient;
      }

      const presetConfig = PRESETS[preset];
      scene.update(
        dt,
        analysis?.bpm ?? 120,
        bass,
        mid,
        high,
        transient,
        waveformL,
        waveformR,
        {
          cameraShake: effects.cameraShake,
          rgbSplit: effects.rgbSplit || presetConfig.useRgbSplit,
          chromaticAberration: effects.chromaticAberration,
          glitchNoise: effects.glitchNoise || presetConfig.useGlitch,
          datamosh: effects.datamosh,
          strongDatamosh: effects.strongDatamosh,
          blockDatamosh: effects.blockDatamosh,
          glitchDatamosh: effects.glitchDatamosh,
          meltingDatamosh: effects.meltingDatamosh,
          bloom: effects.bloom,
          scanlines: presetConfig.useScanlines,
        },
        effects.bloom ? presetConfig.bloomStrength : 0,
      );
      scene.render();

    },
    [analysis, isPlaying, isExporting, preset, effects, setFps, setCurrentTime],
  );

  const renderExportFrames = useCallback<ExportFrameRenderer>(
    async ({ duration, onProgress, onStatus, signal }) => {
      const scene = sceneRef.current;
      const canvas = canvasRef.current;
      if (!scene || !analysis || !canvas) {
        throw new Error('Visualizer is not ready for export');
      }

      const fps = EXPORT_FPS_LIMIT;
      const previousPixelRatio = scene.getPixelRatio();
      throwIfAborted(signal);
      onStatus?.('Preparing 1080p export...');
      scene.setPixelRatio(1);
      scene.resize(EXPORT_WIDTH, EXPORT_HEIGHT);

      try {
        const exportFrame = createReusableAnalysisFrame();
        const exportLookup = createAnalysisLookup(analysis);
        const drawFrame = (time: number, frame: number) => {
          scene.resize(EXPORT_WIDTH, EXPORT_HEIGHT);
          sampleAnalysisFrameInto(analysis, time, exportFrame, exportLookup);
          renderAnalyzedFrame(scene, analysis, preset, effects, exportFrame, frame === 0 ? 0 : 1 / fps);
        };

        let fastExportError: Error | null = null;
        if (audioBuffer && canUseWebCodecsMP4()) {
          try {
            onStatus?.('Rendering fast MP4...');
            scene.resetExportState();
            const blob = await exportToMP4WithWebCodecs({
              canvas,
              audioBuffer,
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
            console.warn('Fast WebCodecs export failed, falling back to ffmpeg.wasm:', err);
            onStatus?.('Fast export failed. Retrying fallback...');
            onProgress(0);
          }
        }

        if (!audioBuffer) {
          throw new Error('Audio is not ready for export');
        }

        try {
          scene.resetExportState();
          return await exportToMP4WithFFmpegFrames({
            canvas,
            audioBuffer,
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
        scene.setPixelRatio(previousPixelRatio);
      }
    },
    [analysis, audioBuffer, effects, preset],
  );

  useEffect(() => {
    exportRendererRef.current = renderExportFrames;
    return () => {
      if (exportRendererRef.current === renderExportFrames) {
        exportRendererRef.current = null;
      }
    };
  }, [exportRendererRef, renderExportFrames]);

  useEffect(() => {
    const now = performance.now();
    lastFrameTime.current = now;
    lastRenderTimeRef.current = now;
    const tick = (timestamp: number) => {
      renderFrame(timestamp);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [renderFrame]);

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

function createParticleAdjustedPreset(
  preset: PresetConfig,
  countScale: number,
  sizeScale: number,
): PresetConfig {
  return {
    ...preset,
    particleCount: clampInteger(preset.particleCount * countScale, 500, 80000),
    particleSize: Math.max(0.04, preset.particleSize * sizeScale),
  };
}

function getEffectiveParticleSize(preset: PresetConfig, sizeScale: number) {
  const geometryScale = preset.geometryMode === 'particles' ? 1 : 0.7;
  return Math.max(0.04, preset.particleSize * sizeScale * geometryScale);
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

interface AnalysisFrame {
  bass: number;
  mid: number;
  high: number;
  transient: number;
  waveformL: Float32Array;
  waveformR: Float32Array;
}

interface AnalysisLookup {
  bass: Float32Array;
  mid: Float32Array;
  high: Float32Array;
  stereoOffset: number;
}

function renderAnalyzedFrame(
  scene: VisualizerScene,
  analysis: AudioAnalysis,
  preset: keyof typeof PRESETS,
  effects: ReturnType<typeof useStore.getState>['effects'],
  data: AnalysisFrame,
  dt: number,
) {
  const presetConfig = PRESETS[preset];
  scene.update(
    dt,
    analysis.bpm,
    data.bass,
    data.mid,
    data.high,
    data.transient,
    data.waveformL,
    data.waveformR,
    {
      cameraShake: effects.cameraShake,
      rgbSplit: effects.rgbSplit || presetConfig.useRgbSplit,
      chromaticAberration: effects.chromaticAberration,
      glitchNoise: effects.glitchNoise || presetConfig.useGlitch,
      datamosh: effects.datamosh,
      strongDatamosh: effects.strongDatamosh,
      blockDatamosh: effects.blockDatamosh,
      glitchDatamosh: effects.glitchDatamosh,
      meltingDatamosh: effects.meltingDatamosh,
      bloom: effects.bloom,
      scanlines: presetConfig.useScanlines,
    },
    effects.bloom ? presetConfig.bloomStrength : 0,
  );
  scene.render();
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Export was canceled', 'AbortError');
  }
}

function createReusableAnalysisFrame(): AnalysisFrame {
  return {
    bass: 0,
    mid: 0,
    high: 0,
    transient: 0,
    waveformL: new Float32Array(256),
    waveformR: new Float32Array(256),
  };
}

function toError(err: unknown) {
  return err instanceof Error ? err : new Error(String(err));
}

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function createAnalysisLookup(analysis: AudioAnalysis): AnalysisLookup {
  const frameCount = analysis.spectrum.length;
  const bass = new Float32Array(frameCount);
  const mid = new Float32Array(frameCount);
  const high = new Float32Array(frameCount);

  for (let frame = 0; frame < frameCount; frame++) {
    const bands = computeSpectrumBands(analysis.spectrum[frame]);
    bass[frame] = bands.bass;
    mid[frame] = bands.mid;
    high[frame] = bands.high;
  }

  return {
    bass,
    mid,
    high,
    stereoOffset: Math.floor(analysis.waveform.length * 0.1),
  };
}

function sampleAnalysisFrameInto(
  analysis: AudioAnalysis,
  time: number,
  out: AnalysisFrame,
  lookup?: AnalysisLookup,
) {
  let bass = 0;
  let mid = 0;
  let high = 0;
  const { waveformL, waveformR } = out;
  const progress = analysis.duration > 0 ? Math.min(time / analysis.duration, 0.999999) : 0;
  const spectrumIndex = Math.min(
    Math.floor(progress * analysis.spectrum.length),
    Math.max(analysis.spectrum.length - 1, 0),
  );
  const spectrum = analysis.spectrum[spectrumIndex];

  if (lookup && spectrumIndex < lookup.bass.length) {
    bass = lookup.bass[spectrumIndex];
    mid = lookup.mid[spectrumIndex];
    high = lookup.high[spectrumIndex];
  } else {
    const bands = computeSpectrumBands(spectrum);
    bass = bands.bass;
    mid = bands.mid;
    high = bands.high;
  }

  const wf = analysis.waveform;
  const wfLen = wf.length;
  if (wfLen > 0) {
    const baseIndex = Math.floor(progress * wfLen);
    const stereoOffset = lookup?.stereoOffset ?? Math.floor(wfLen * 0.1);
    for (let i = 0; i < waveformL.length; i++) {
      const idx = (baseIndex + i) % wfLen;
      waveformL[i] = wf[idx] ?? 0;
      waveformR[i] = wf[(idx + stereoOffset) % wfLen] ?? 0;
    }
  }

  out.bass = bass;
  out.mid = mid;
  out.high = high;
  out.transient = analysis.transientMap[spectrumIndex] ?? 0;
}

function computeSpectrumBands(spectrum: Float32Array | undefined) {
  let bass = 0;
  let mid = 0;
  let high = 0;
  if (!spectrum) return { bass, mid, high };

  const binCount = spectrum.length;
  const bassEnd = Math.max(1, Math.floor(binCount * 0.05));
  const midEnd = Math.max(bassEnd + 1, Math.floor(binCount * 0.35));

  for (let i = 0; i < bassEnd; i++) bass += spectrum[i];
  for (let i = bassEnd; i < midEnd; i++) mid += spectrum[i];
  for (let i = midEnd; i < binCount; i++) high += spectrum[i];

  return {
    bass: Math.min(1, (bass / bassEnd) * 200),
    mid: Math.min(1, (mid / (midEnd - bassEnd)) * 200),
    high: Math.min(1, (high / Math.max(1, binCount - midEnd)) * 200),
  };
}
