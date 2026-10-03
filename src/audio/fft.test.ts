import { describe, expect, it } from 'vitest';
import { computeSpectrogram, computeWaveform, FFT_SIZE } from './fft';

describe('computeWaveform', () => {
  it('uses absolute peaks, including samples in a final partial block', () => {
    const waveform = computeWaveform(Float32Array.from([0.1, -0.2, 0.3, -0.4, 0.9]), 2);

    expect(waveform[0]).toBeCloseTo(0.2);
    expect(waveform[1]).toBeCloseTo(0.9);
  });

  it('retains peaks when a short clip has fewer samples than display points', () => {
    const waveform = computeWaveform(Float32Array.from([0.25, -0.75]), 4);

    expect(Array.from(waveform)).toEqual([0.25, 0.25, 0.75, 0.75]);
  });

  it('returns silence for an empty clip', () => {
    expect(Array.from(computeWaveform(new Float32Array(), 3))).toEqual([0, 0, 0]);
  });
});

describe('computeSpectrogram', () => {
  it('produces one frame for exactly one FFT window and identifies a sine-wave bin', () => {
    const bin = 64;
    const samples = Float32Array.from({ length: FFT_SIZE }, (_, i) => Math.sin((2 * Math.PI * bin * i) / FFT_SIZE));

    const frames = computeSpectrogram(samples, 8192);

    expect(frames).toHaveLength(1);
    expect(frames[0]).toHaveLength(FFT_SIZE / 2);
    expect(frames[0].indexOf(Math.max(...frames[0]))).toBe(bin);
  });

  it('returns no frames for a clip shorter than one FFT window', () => {
    expect(computeSpectrogram(new Float32Array(FFT_SIZE - 1), 8192)).toEqual([]);
  });
});
