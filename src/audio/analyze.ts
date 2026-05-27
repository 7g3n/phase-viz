import type { AudioAnalysis, EnergyLevel, MoodId } from '../store';
import { detectBPM } from './bpm';
import { computeSpectrogram, computeWaveform } from './fft';

export async function analyzeAudio(buffer: AudioBuffer): Promise<AudioAnalysis> {
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  const sampleRate = buffer.sampleRate;

  // BPM
  const bpm = detectBPM(left, sampleRate);

  // RMS / LUFS approximation
  let rmsSum = 0;
  for (let i = 0; i < left.length; i++) {
    rmsSum += left[i] ** 2;
  }
  const rms = Math.sqrt(rmsSum / left.length);
  const lufs = 20 * Math.log10(Math.max(rms, 1e-10));

  // Waveform
  const waveform = computeWaveform(left, 512);

  // Spectrum (sampled at 30fps intervals)
  const spectrum = computeSpectrogram(left, sampleRate);

  // Transient detection (simple energy derivative)
  const transientMap = detectTransients(left, sampleRate);

  // Stereo width (cross-correlation of L/R)
  const stereoWidth = computeStereoWidth(left, right);

  // Mood & energy
  const energy = classifyEnergy(rms);
  const mood = classifyMood(bpm, rms, stereoWidth);

  return {
    bpm,
    loudness: lufs,
    waveform,
    spectrum,
    transientMap,
    stereoWidth,
    mood,
    energy,
    duration: buffer.duration,
  };
}

function detectTransients(channelData: Float32Array, sampleRate: number): number[] {
  const frameSize = Math.floor(sampleRate / 30);
  const numFrames = Math.floor(channelData.length / frameSize);
  const energies = new Float32Array(numFrames);

  for (let i = 0; i < numFrames; i++) {
    let e = 0;
    for (let j = 0; j < frameSize; j++) {
      e += channelData[i * frameSize + j] ** 2;
    }
    energies[i] = e / frameSize;
  }

  const transients: number[] = [];
  for (let i = 1; i < numFrames; i++) {
    const delta = energies[i] - energies[i - 1];
    transients.push(Math.max(0, delta * 20));
  }
  transients.unshift(0);

  // Normalize
  const max = Math.max(...transients, 0.001);
  return transients.map((v) => v / max);
}

function computeStereoWidth(left: Float32Array, right: Float32Array): number {
  const len = Math.min(left.length, right.length, 44100); // analyze first second
  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += Math.abs(left[i] - right[i]);
  }
  return Math.min(1, sum / len / 0.5);
}

function classifyEnergy(rms: number): EnergyLevel {
  if (rms < 0.05) return 'low';
  if (rms < 0.2) return 'medium';
  return 'high';
}

function classifyMood(bpm: number, rms: number, stereoWidth: number): MoodId {
  if (bpm > 140 && rms > 0.15) return 'aggressive';
  if (bpm < 90 && rms < 0.08) return 'calm';
  if (stereoWidth > 0.7 && bpm > 100) return 'bright';
  if (bpm < 100 && rms < 0.12) return 'emotional';
  return 'dark';
}
