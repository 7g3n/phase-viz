import type { StateCreator } from 'zustand';
import type { AppState, ExportSlice } from './types';

export const createExportSlice: StateCreator<AppState, [], [], ExportSlice> = (set) => ({
  exportPreset: 'high1080p',
  isExporting: false,
  exportProgress: 0,
  exportError: null,
  exportStatus: null,
  exportDownloadUrl: null,
  exportDownloadName: 'audio-visualizer.mp4',
  exportClip: {
    enabled: false,
    start: 0,
    length: 30,
    autoStart: true,
  },
  exportOverlay: {
    title: '',
    artist: '',
    showCredit: true,
  },
  setExportPreset: (exportPreset) => set({ exportPreset }),
  setExportClip: (clip) => set((state) => ({ exportClip: { ...state.exportClip, ...clip } })),
  setExportOverlay: (overlay) => set((state) => ({ exportOverlay: { ...state.exportOverlay, ...overlay } })),
  setIsExporting: (isExporting) => set({ isExporting }),
  setExportProgress: (exportProgress) => set({ exportProgress }),
  setExportError: (exportError) => set({ exportError }),
  setExportStatus: (exportStatus) => set({ exportStatus }),
  setExportDownload: (exportDownloadUrl, exportDownloadName = 'audio-visualizer.mp4') =>
    set({ exportDownloadUrl, exportDownloadName }),
});
