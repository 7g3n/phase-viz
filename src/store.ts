import { create } from 'zustand';

export type PresetId = 'minimal' | 'neon' | 'glitch' | 'organic';
export type MoodId = 'calm' | 'aggressive' | 'emotional' | 'dark' | 'bright';
export type EnergyLevel = 'low' | 'medium' | 'high';

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
  blockStrongDatamosh: boolean;
  meltingDatamosh: boolean;
  glitchNoise: boolean;
  cameraShake: boolean;
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
  preset: PresetId;
  presetRevision: number;
  effects: EffectSettings;
  isExporting: boolean;
  exportProgress: number;
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
  setPreset: (p: PresetId) => void;
  toggleEffect: (e: keyof EffectSettings) => void;
  setIsExporting: (v: boolean) => void;
  setExportProgress: (p: number) => void;
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
  preset: 'neon',
  presetRevision: 0,
  effects: {
    bloom: true,
    chromaticAberration: false,
    rgbSplit: false,
    datamosh: false,
    strongDatamosh: false,
    blockStrongDatamosh: false,
    meltingDatamosh: false,
    glitchNoise: false,
    cameraShake: false,
  },
  isExporting: false,
  exportProgress: 0,
  fps: 60,
  isFullscreen: false,

  setAudioFile: (file) => set({ audioFile: file }),
  setAudioBuffer: (audioBuffer) => set({ audioBuffer }),
  setAnalysis: (analysis) => set({ analysis }),
  setBackgroundImageUrl: (backgroundImageUrl) => set({ backgroundImageUrl }),
  setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setPreset: (preset) => set((s) => ({ preset, presetRevision: s.presetRevision + 1 })),
  toggleEffect: (e) =>
    set((s) => ({ effects: { ...s.effects, [e]: !s.effects[e] } })),
  setIsExporting: (isExporting) => set({ isExporting }),
  setExportProgress: (exportProgress) => set({ exportProgress }),
  setFps: (fps) => set({ fps }),
  setIsFullscreen: (isFullscreen) => set({ isFullscreen }),
}));
