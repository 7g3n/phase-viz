import { useCallback, useEffect, useRef } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../theme';
import AppLayout from './AppLayout';
import { EXPORT_PRESETS, useStore } from '../store';
import type { ExportClipSettings, ImageFxPreset, PresetId, WaveVisualizerType } from '../store';
import type { ExportFrameRenderer, FrameRecorder } from '../export/recorder';
import { triggerBlobDownload } from '../export/download';
import { ExportEngine } from '../engine/export/ExportEngine';
import { IMAGE_FX_PRESETS } from '../visual/imageFxPresets';
import { PRESETS } from '../visual/presets';

const PRESET_IDS = Object.keys(PRESETS) as PresetId[];
const WAVE_TYPES: WaveVisualizerType[] = ['horizontal', 'circular', 'bars'];
const IMAGE_FX_PRESET_IDS: ImageFxPreset[] = ['clean', 'glitch', 'dreamy', 'dark', 'vhs'];
const LIVE_INTENSITY_STEP = 0.1;
const LIVE_INTENSITY_MIN = 0.5;
const LIVE_INTENSITY_MAX = 1.8;

export default function AppShell() {
  const recorderRef = useRef<FrameRecorder | null>(null);
  const exportRendererRef = useRef<ExportFrameRenderer | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const exportEngineRef = useRef(new ExportEngine());
  const lastExportUrlRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const {
    audioBuffer,
    analysis,
    displayMode,
    isExporting,
    isFullscreen,
    isLiveMode,
    liveUiVisible,
    liveHelpOpen,
    liveHelpLanguage,
    liveIntensity,
    liveBoost,
    exportPreset,
    setIsFullscreen,
    setIsExporting,
    setExportProgress,
    setExportError,
    setExportStatus,
    setExportDownload,
    setIsLiveMode,
    setLiveUiVisible,
    setLiveHelpOpen,
    setLiveHelpLanguage,
  } = useStore();
  const showChrome = !isLiveMode || liveUiVisible;

  useEffect(() => () => {
    if (lastExportUrlRef.current) {
      URL.revokeObjectURL(lastExportUrlRef.current);
    }
  }, []);

  const handleExport = async () => {
    if (isExporting || !audioBuffer || !analysis || !exportRendererRef.current) return;

    const abortController = new AbortController();
    exportAbortRef.current = abortController;
    setIsExporting(true);
    setExportProgress(0);
    setExportError(null);
    const selectedExportPreset = EXPORT_PRESETS[exportPreset];
    if (lastExportUrlRef.current) {
      URL.revokeObjectURL(lastExportUrlRef.current);
      lastExportUrlRef.current = null;
    }
    setExportDownload(null);

    const { exportClip, exportOverlay } = useStore.getState();
    const range = getExportRange(analysis.duration, exportClip);

    try {
      const { blob, fileName } = await exportEngineRef.current.render({
        duration: range.duration,
        startTime: range.startTime,
        overlay: exportClip.enabled ? exportOverlay : null,
        preset: selectedExportPreset,
        renderer: exportRendererRef.current,
        signal: abortController.signal,
        onProgress: setExportProgress,
        onStatus: setExportStatus,
      });

      const url = URL.createObjectURL(blob);
      lastExportUrlRef.current = url;
      setExportDownload(url, fileName);
      setExportStatus('Download ready');
      triggerBlobDownload(url, fileName);
      setExportProgress(1);
    } catch (err) {
      if (!abortController.signal.aborted && !isAbortError(err)) {
        setExportError(getErrorMessage(err));
        console.error('Export failed:', err);
      }
    } finally {
      if (exportAbortRef.current === abortController) {
        exportAbortRef.current = null;
      }
      setIsExporting(false);
      setExportProgress(0);
      setExportStatus(null);
    }
  };

  const handleCancelExport = () => {
    exportAbortRef.current?.abort();
  };

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  }, [setIsFullscreen]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [setIsFullscreen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = useStore.getState();
      if (!state.isLiveMode || state.isExporting || isEditableTarget(event.target)) return;

      const key = event.key;
      if (key === '?' || (key === '/' && event.shiftKey)) {
        event.preventDefault();
        state.setLiveHelpOpen(true);
        return;
      }
      if (key === 'Escape') {
        if (state.liveHelpOpen) {
          event.preventDefault();
          state.setLiveHelpOpen(false);
        } else if (document.fullscreenElement) {
          event.preventDefault();
          document.exitFullscreen();
        }
        return;
      }
      if (key.toLowerCase() === 'h') {
        event.preventDefault();
        if (state.liveHelpOpen) {
          state.setLiveHelpOpen(false);
        } else {
          state.setLiveUiVisible(!state.liveUiVisible);
        }
        return;
      }
      if (key.toLowerCase() === 'f') {
        event.preventDefault();
        toggleFullscreen();
        return;
      }
      if (key === ' ') {
        event.preventDefault();
        state.setLiveBoost(true);
        return;
      }
      if (key === 'ArrowUp') {
        event.preventDefault();
        state.setLiveIntensity(clamp(state.liveIntensity + LIVE_INTENSITY_STEP, LIVE_INTENSITY_MIN, LIVE_INTENSITY_MAX));
        return;
      }
      if (key === 'ArrowDown') {
        event.preventDefault();
        state.setLiveIntensity(clamp(state.liveIntensity - LIVE_INTENSITY_STEP, LIVE_INTENSITY_MIN, LIVE_INTENSITY_MAX));
        return;
      }
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        event.preventDefault();
        moveLiveSelection(key === 'ArrowRight' ? 1 : -1);
        return;
      }
      if (/^[1-5]$/.test(key)) {
        event.preventDefault();
        applyLivePresetNumber(Number(key) - 1);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ') {
        useStore.getState().setLiveBoost(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [toggleFullscreen]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppLayout
        analysis={analysis}
        containerRef={containerRef}
        displayMode={displayMode}
        exportRendererRef={exportRendererRef}
        recorderRef={recorderRef}
        isFullscreen={isFullscreen}
        isLiveMode={isLiveMode}
        liveUiVisible={liveUiVisible}
        liveHelpOpen={liveHelpOpen}
        liveHelpLanguage={liveHelpLanguage}
        liveIntensity={liveIntensity}
        liveBoost={liveBoost}
        showChrome={showChrome}
        onExport={handleExport}
        onCancelExport={handleCancelExport}
        onToggleFullscreen={toggleFullscreen}
        onExitLiveMode={() => setIsLiveMode(false)}
        onHideLiveUi={() => setLiveUiVisible(false)}
        onOpenLiveHelp={() => setLiveHelpOpen(true)}
        onCloseLiveHelp={() => setLiveHelpOpen(false)}
        onLiveHelpLanguageChange={setLiveHelpLanguage}
      />
    </ThemeProvider>
  );
}

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : 'Export failed unexpectedly';
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

function applyLivePresetNumber(index: number) {
  const state = useStore.getState();
  if (state.displayMode === 'visualizer3d') {
    const preset = PRESET_IDS[index];
    if (preset) state.setPreset(preset);
    return;
  }
  if (state.displayMode === 'wave') {
    const waveType = WAVE_TYPES[index];
    if (waveType) state.setWaveType(waveType);
    return;
  }

  const imageFxPreset = IMAGE_FX_PRESET_IDS[index];
  if (imageFxPreset) {
    state.setImageFxPreset(imageFxPreset, IMAGE_FX_PRESETS[imageFxPreset]);
  }
}

function moveLiveSelection(direction: 1 | -1) {
  const state = useStore.getState();
  if (state.displayMode === 'visualizer3d') {
    const index = PRESET_IDS.indexOf(state.preset);
    state.setPreset(cycleValue(PRESET_IDS, index, direction));
    return;
  }
  if (state.displayMode === 'wave') {
    const index = WAVE_TYPES.indexOf(state.waveSettings.type);
    state.setWaveType(cycleValue(WAVE_TYPES, index, direction));
    return;
  }

  const index = IMAGE_FX_PRESET_IDS.indexOf(state.imageFxSettings.preset);
  const preset = cycleValue(IMAGE_FX_PRESET_IDS, index, direction);
  state.setImageFxPreset(preset, IMAGE_FX_PRESETS[preset]);
}

function cycleValue<T>(values: T[], currentIndex: number, direction: 1 | -1): T {
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = (safeIndex + direction + values.length) % values.length;
  return values[nextIndex];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getExportRange(trackDuration: number, clip: ExportClipSettings) {
  if (!clip.enabled) {
    return { startTime: undefined, duration: trackDuration };
  }
  const length = Math.min(clip.length, trackDuration);
  const startTime = Math.min(Math.max(0, clip.start), Math.max(0, trackDuration - length));
  return { startTime, duration: Math.min(length, trackDuration - startTime) };
}
