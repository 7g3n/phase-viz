import React, { useRef, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import { type AudioAnalysis, useStore } from '../store';
import { VisualizerScene } from '../visual/scene';
import { PRESETS } from '../visual/presets';
import { type ExportFrameRenderer, FrameRecorder } from '../export/recorder';
import { exportToMP4 } from '../export/ffmpeg';
import { canUseWebCodecsMP4, exportToMP4WithWebCodecs } from '../export/webcodecs';

interface Props {
  recorderRef: React.MutableRefObject<FrameRecorder | null>;
  exportRendererRef: React.MutableRefObject<ExportFrameRenderer | null>;
}

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
  const fpsCountRef = useRef<number[]>([]);

  const {
    analysis,
    audioBuffer,
    isPlaying,
    preset,
    effects,
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
      const el = canvas.parentElement;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      canvas.width = w;
      canvas.height = h;
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
    sceneRef.current.applyPreset(PRESETS[preset]);
  }, [preset]);

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

      const dt = Math.min((timestamp - lastFrameTime.current) / 1000, 0.05);
      lastFrameTime.current = timestamp;

      // FPS tracking
      fpsCountRef.current.push(timestamp);
      fpsCountRef.current = fpsCountRef.current.filter((t) => timestamp - t < 1000);
      if (fpsCountRef.current.length % 30 === 0) {
        setFps(fpsCountRef.current.length);
      }

      // Get audio data
      let bass = 0, mid = 0, high = 0, transient = 0;
      const waveformL = new Float32Array(256);
      const waveformR = new Float32Array(256);

      if (analyserRef.current && isPlaying) {
        const analyser = analyserRef.current;
        const freqData = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freqData);

        const binCount = freqData.length;
        const bassEnd = Math.floor(binCount * 0.05);
        const midEnd = Math.floor(binCount * 0.35);

        for (let i = 0; i < bassEnd; i++) bass += freqData[i];
        bass = bass / bassEnd / 255;

        for (let i = bassEnd; i < midEnd; i++) mid += freqData[i];
        mid = mid / (midEnd - bassEnd) / 255;

        for (let i = midEnd; i < binCount; i++) high += freqData[i];
        high = high / (binCount - midEnd) / 255;

        analyser.getByteTimeDomainData(new Uint8Array(waveformL.length));
        // Convert to float
        const timeDomain = new Uint8Array(waveformL.length);
        analyser.getByteTimeDomainData(timeDomain);
        for (let i = 0; i < waveformL.length; i++) {
          waveformL[i] = (timeDomain[i] / 128 - 1);
          waveformR[i] = waveformL[i] * (0.8 + Math.random() * 0.2);
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
        const t = (timestamp / 1000) % (analysis.duration || 60);
        const frame = Math.floor((t / analysis.duration) * analysis.spectrum.length);
        const spectrum = analysis.spectrum[Math.min(frame, analysis.spectrum.length - 1)];
        if (spectrum) {
          const binCount = spectrum.length;
          const bassEnd = Math.floor(binCount * 0.05);
          const midEnd = Math.floor(binCount * 0.35);
          for (let i = 0; i < bassEnd; i++) bass += spectrum[i];
          bass = Math.min(1, (bass / bassEnd) * 200);
          for (let i = bassEnd; i < midEnd; i++) mid += spectrum[i];
          mid = Math.min(1, (mid / (midEnd - bassEnd)) * 200);
          for (let i = midEnd; i < binCount; i++) high += spectrum[i];
          high = Math.min(1, (high / (binCount - midEnd)) * 200);
          transient = analysis.transientMap[Math.min(frame, analysis.transientMap.length - 1)] ?? 0;

          const wf = analysis.waveform;
          const wfLen = wf.length;
          for (let i = 0; i < waveformL.length; i++) {
            const idx = Math.floor(((t / analysis.duration) * wfLen + i) % wfLen);
            waveformL[i] = wf[idx] ?? 0;
            waveformR[i] = (wf[(idx + Math.floor(wfLen * 0.1)) % wfLen] ?? 0);
          }
        }
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
          meltingDatamosh: effects.meltingDatamosh,
          bloom: effects.bloom,
          scanlines: presetConfig.useScanlines,
        },
        effects.bloom ? presetConfig.bloomStrength : 0,
      );
      scene.render();

    },
    [analysis, isPlaying, preset, effects, setFps, setCurrentTime],
  );

  const renderExportFrames = useCallback<ExportFrameRenderer>(
    async ({ duration, fps, onProgress, signal }) => {
      const scene = sceneRef.current;
      const recorder = recorderRef.current;
      const canvas = canvasRef.current;
      if (!scene || !recorder || !analysis || !canvas) {
        throw new Error('Visualizer is not ready for export');
      }

      throwIfAborted(signal);
      const drawFrame = (time: number, frame: number) => {
        const data = sampleAnalysisFrame(analysis, time);
        renderAnalyzedFrame(scene, analysis, preset, effects, data, frame === 0 ? 0 : 1 / fps);
      };

      if (audioBuffer && canUseWebCodecsMP4()) {
        try {
          await exportToMP4WithWebCodecs({
            canvas,
            audioBuffer,
            duration,
            fps,
            renderFrame: drawFrame,
            onProgress,
            signal,
          });
          return;
        } catch (err) {
          if (signal?.aborted) throw err;
          console.warn('Fast WebCodecs export unavailable, falling back to ffmpeg.wasm:', err);
          onProgress(0);
        }
      }

      recorder.clear();
      const totalFrames = Math.max(1, Math.ceil(duration * fps));

      for (let frame = 0; frame < totalFrames; frame++) {
        throwIfAborted(signal);
        const t = frame / fps;
        drawFrame(t, frame);
        await recorder.captureFrame(t * 1000);
        throwIfAborted(signal);

        if (frame % 5 === 0 || frame === totalFrames - 1) {
          onProgress((frame + 1) / totalFrames * 0.3);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      if (!audioBuffer) {
        throw new Error('Audio is not ready for export');
      }
      await exportToMP4(recorder, audioBuffer, fps, (p) => {
        onProgress(0.3 + p * 0.7);
      }, signal);
    },
    [analysis, audioBuffer, effects, preset, recorderRef],
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
    lastFrameTime.current = performance.now();
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

type AnalysisFrame = ReturnType<typeof sampleAnalysisFrame>;

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

function sampleAnalysisFrame(analysis: AudioAnalysis, time: number) {
  let bass = 0;
  let mid = 0;
  let high = 0;
  const waveformL = new Float32Array(256);
  const waveformR = new Float32Array(256);
  const progress = analysis.duration > 0 ? Math.min(time / analysis.duration, 0.999999) : 0;
  const spectrumIndex = Math.min(
    Math.floor(progress * analysis.spectrum.length),
    Math.max(analysis.spectrum.length - 1, 0),
  );
  const spectrum = analysis.spectrum[spectrumIndex];

  if (spectrum) {
    const binCount = spectrum.length;
    const bassEnd = Math.max(1, Math.floor(binCount * 0.05));
    const midEnd = Math.max(bassEnd + 1, Math.floor(binCount * 0.35));

    for (let i = 0; i < bassEnd; i++) bass += spectrum[i];
    bass = Math.min(1, (bass / bassEnd) * 200);

    for (let i = bassEnd; i < midEnd; i++) mid += spectrum[i];
    mid = Math.min(1, (mid / (midEnd - bassEnd)) * 200);

    for (let i = midEnd; i < binCount; i++) high += spectrum[i];
    high = Math.min(1, (high / Math.max(1, binCount - midEnd)) * 200);
  }

  const wf = analysis.waveform;
  const wfLen = wf.length;
  if (wfLen > 0) {
    for (let i = 0; i < waveformL.length; i++) {
      const idx = Math.floor((progress * wfLen + i) % wfLen);
      waveformL[i] = wf[idx] ?? 0;
      waveformR[i] = wf[(idx + Math.floor(wfLen * 0.1)) % wfLen] ?? 0;
    }
  }

  return {
    bass,
    mid,
    high,
    transient: analysis.transientMap[spectrumIndex] ?? 0,
    waveformL,
    waveformR,
  };
}
