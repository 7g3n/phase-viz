import { create } from 'zustand';

export type PresetId = 'minimal' | 'neon' | 'glitch' | 'organic';
export type MoodId = 'calm' | 'aggressive' | 'emotional' | 'dark' | 'bright';
export type EnergyLevel = 'low' | 'medium' | 'high';
export type DisplayMode = 'visualizer3d' | 'wave';
export type WaveVisualizerType = 'horizontal' | 'circular' | 'bars';
export type WaveBackgroundMode = 'solid' | 'image';

export interface AudioAnalysis {
  bpm: number;
  loudness: number;
  waveform: Float32Array;
  spectrum: Float32Array[];
  transientMap: number[];
  stereoWidth: number;
  mood: MoodId;
  energy: EnergyLevel;
  duration: number;
}

export interface EffectSettings {
  bloom: boolean;
  chromaticAberration: boolean;
  rgbSplit: boolean;
  datamosh: boolean;
  strongDatamosh: boolean;
  blockDatamosh: boolean;
  glitchDatamosh: boolean;
  meltingDatamosh: boolean;
  glitchNoise: boolean;
  cameraShake: boolean;
}

export interface ParticleSettings {
  countScale: number;
  sizeScale: number;
}

export interface WaveVisualizerSettings {
  type: WaveVisualizerType;
  backgroundMode: WaveBackgroundMode;
}

export interface AppState {
  audioFile: File | null;
  audioBuffer: AudioBuffer | null;
  analysis: AudioAnalysis | null;
  backgroundImageUrl: string | null;
  isAnalyzing: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  displayMode: DisplayMode;
  preset: PresetId;
  presetRevision: number;
  effects: EffectSettings;
  particleSettings: ParticleSettings;
  waveSettings: WaveVisualizerSettings;
  isExporting: boolean;
  exportProgress: number;
  exportError: string | null;
  exportStatus: string | null;
  exportDownloadUrl: string | null;
  exportDownloadName: string;
  fps: number;
  isFullscreen: boolean;

  setAudioFile: (file: File) => void;
  setAudioBuffer: (buf: AudioBuffer) => void;
  setAnalysis: (a: AudioAnalysis) => void;
  setBackgroundImageUrl: (url: string | null) => void;
  setIsAnalyzing: (v: boolean) => void;
  setIsPlaying: (v: boolean) => void;
  setCurrentTime: (t: number) => void;
  setDuration: (d: number) => void;
  setDisplayMode: (mode: DisplayMode) => void;
  setPreset: (p: PresetId) => void;
  toggleEffect: (e: keyof EffectSettings) => void;
  setParticleCountScale: (value: number) => void;
  setParticleSizeScale: (value: number) => void;
  setWaveType: (type: WaveVisualizerType) => void;
  setWaveBackgroundMode: (mode: WaveBackgroundMode) => void;
  setIsExporting: (v: boolean) => void;
  setExportProgress: (p: number) => void;
  setExportError: (message: string | null) => void;
  setExportStatus: (message: string | null) => void;
  setExportDownload: (url: string | null, fileName?: string) => void;
  setFps: (f: number) => void;
  setIsFullscreen: (v: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  audioFile: null,
  audioBuffer: null,
  analysis: null,
  backgroundImageUrl: null,
  isAnalyzing: false,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  displayMode: 'visualizer3d',
  preset: 'neon',
  presetRevision: 0,
  effects: {
    bloom: false,
    chromaticAberration: false,
    rgbSplit: false,
    datamosh: false,
    strongDatamosh: false,
    blockDatamosh: false,
    glitchDatamosh: false,
    meltingDatamosh: false,
    glitchNoise: false,
    cameraShake: false,
  },
  particleSettings: {
    countScale: 1,
    sizeScale: 1,
  },
  waveSettings: {
    type: 'horizontal',
    backgroundMode: 'solid',
  },
  isExporting: false,
  exportProgress: 0,
  exportError: null,
  exportStatus: null,
  exportDownloadUrl: null,
  exportDownloadName: 'audio-visualizer.mp4',
  fps: 30,
  isFullscreen: false,

  setAudioFile: (file) => set({ audioFile: file }),
  setAudioBuffer: (audioBuffer) => set({ audioBuffer }),
  setAnalysis: (analysis) => set({ analysis }),
  setBackgroundImageUrl: (backgroundImageUrl) => set({ backgroundImageUrl }),
  setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setDisplayMode: (displayMode) => set({ displayMode }),
  setPreset: (preset) => set((s) => ({ preset, presetRevision: s.presetRevision + 1 })),
  toggleEffect: (e) =>
    set((s) => ({ effects: { ...s.effects, [e]: !s.effects[e] } })),
  setParticleCountScale: (countScale) =>
    set((s) => ({ particleSettings: { ...s.particleSettings, countScale } })),
  setParticleSizeScale: (sizeScale) =>
    set((s) => ({ particleSettings: { ...s.particleSettings, sizeScale } })),
  setWaveType: (type) =>
    set((s) => ({ waveSettings: { ...s.waveSettings, type } })),
  setWaveBackgroundMode: (backgroundMode) =>
    set((s) => ({ waveSettings: { ...s.waveSettings, backgroundMode } })),
  setIsExporting: (isExporting) => set({ isExporting }),
  setExportProgress: (exportProgress) => set({ exportProgress }),
  setExportError: (exportError) => set({ exportError }),
  setExportStatus: (exportStatus) => set({ exportStatus }),
  setExportDownload: (exportDownloadUrl, exportDownloadName = 'audio-visualizer.mp4') =>
    set({ exportDownloadUrl, exportDownloadName }),
  setFps: (fps) => set({ fps }),
  setIsFullscreen: (isFullscreen) => set({ isFullscreen }),
}));
