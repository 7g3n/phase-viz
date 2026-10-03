import { describe, expect, it } from 'vitest';
import { detectBPM } from './bpm';

describe('detectBPM', () => {
  it('detects a regular 120 BPM pulse train', () => {
    const sampleRate = 1000;
    const samples = new Float32Array(6000);
    for (let start = 500; start < samples.length; start += 500) {
      samples.fill(1, start, start + 10);
    }

    expect(detectBPM(samples, sampleRate)).toBe(120);
  });

  it('uses its default tempo when there are too few onsets', () => {
    expect(detectBPM(new Float32Array(2000), 1000)).toBe(120);
    const isolatedPulse = new Float32Array(2000);
    isolatedPulse.fill(1, 500, 510);
    expect(detectBPM(isolatedPulse, 1000)).toBe(120);
  });
});
