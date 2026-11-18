import type { AudioAnalysis } from '../state/types';

export interface HookWindow {
  start: number;
  end: number;
}

/** Seconds compared before/after a candidate start to reward drops and entrances. */
const CONTRAST_SECONDS = 2;
const ONSET_THRESHOLD = 0.2;
const PUNCH_WEIGHT = 0.25;
const CONTRAST_WEIGHT = 0.6;

/**
 * Finds the most "hook-like" window of `length` seconds in an analyzed track.
 *
 * Scores each candidate start by the mean spectral energy of the window, its
 * transient density, and how much louder it is than the seconds just before it
 * (so the clip tends to start on a drop or chorus entrance rather than mid-phrase).
 * Candidates are restricted to transient onsets so the clip begins on an attack;
 * this stays usable even when the BPM estimate is off by a factor of two.
 */
export function findHookWindow(analysis: AudioAnalysis, length: number): HookWindow {
  const duration = analysis.duration;
  if (!(duration > 0)) return { start: 0, end: 0 };

  const clipLength = Math.min(Math.max(1, length), duration);
  if (duration - clipLength < 1) return { start: 0, end: clipLength };

  const frameCount = analysis.spectrum.length;
  if (frameCount < 2) return { start: 0, end: clipLength };

  const frameSeconds = duration / frameCount;
  const windowFrames = Math.max(1, Math.round(clipLength / frameSeconds));
  const lastStart = frameCount - windowFrames;
  if (lastStart <= 0) return { start: 0, end: clipLength };

  const energy = computeFrameEnergy(analysis.spectrum);
  const transient = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    transient[i] = analysis.transientMap[i] ?? 0;
  }

  const energySum = prefixSum(energy);
  const transientSum = prefixSum(transient);
  const contrastFrames = Math.max(1, Math.round(CONTRAST_SECONDS / frameSeconds));

  const scoreAt = (start: number) => {
    const end = start + windowFrames;
    const body = (energySum[end] - energySum[start]) / windowFrames;
    const punch = (transientSum[end] - transientSum[start]) / windowFrames;

    const afterEnd = Math.min(frameCount, start + contrastFrames);
    const beforeStart = Math.max(0, start - contrastFrames);
    const after = (energySum[afterEnd] - energySum[start]) / Math.max(1, afterEnd - start);
    const before = start > 0
      ? (energySum[start] - energySum[beforeStart]) / Math.max(1, start - beforeStart)
      : after;
    const contrast = Math.max(0, after - before);

    return body + punch * PUNCH_WEIGHT + contrast * CONTRAST_WEIGHT;
  };

  let bestStart = -1;
  let bestScore = -Infinity;
  for (let i = 1; i <= lastStart; i++) {
    if (!isOnset(transient, i)) continue;
    const score = scoreAt(i);
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }

  // No usable onsets (pads, ambient, drones): fall back to every frame.
  if (bestStart < 0) {
    for (let i = 0; i <= lastStart; i++) {
      const score = scoreAt(i);
      if (score > bestScore) {
        bestScore = score;
        bestStart = i;
      }
    }
  }

  // Back off one analysis frame so the attack itself is not trimmed by the fade-in.
  const start = roundTime(Math.max(0, (bestStart - 1) * frameSeconds));
  return { start, end: roundTime(Math.min(duration, start + clipLength)) };
}

function computeFrameEnergy(spectrum: Float32Array[]) {
  const energy = new Float32Array(spectrum.length);
  let max = 0;
  for (let frame = 0; frame < spectrum.length; frame++) {
    const bins = spectrum[frame];
    let sum = 0;
    for (let i = 0; i < bins.length; i++) sum += bins[i];
    const value = bins.length > 0 ? sum / bins.length : 0;
    energy[frame] = value;
    if (value > max) max = value;
  }
  if (max > 0) {
    for (let i = 0; i < energy.length; i++) energy[i] /= max;
  }
  return energy;
}

function prefixSum(values: Float32Array) {
  const sums = new Float64Array(values.length + 1);
  for (let i = 0; i < values.length; i++) sums[i + 1] = sums[i] + values[i];
  return sums;
}

function isOnset(transient: Float32Array, index: number) {
  const value = transient[index];
  if (value < ONSET_THRESHOLD) return false;
  const prev = transient[index - 1] ?? 0;
  const next = transient[index + 1] ?? 0;
  return value >= prev && value >= next;
}

function roundTime(seconds: number) {
  return Math.round(seconds * 100) / 100;
}
