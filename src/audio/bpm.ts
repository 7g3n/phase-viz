export function detectBPM(channelData: Float32Array, sampleRate: number): number {
  // Energy-based BPM detection using onset detection
  const windowSize = Math.floor(sampleRate * 0.01); // 10ms windows
  const energies: number[] = [];

  for (let i = 0; i < channelData.length - windowSize; i += windowSize) {
    let energy = 0;
    for (let j = 0; j < windowSize; j++) {
      energy += channelData[i + j] ** 2;
    }
    energies.push(energy / windowSize);
  }

  // Detect onsets by finding peaks above local average
  const onsets: number[] = [];
  const historyLen = 43;
  for (let i = historyLen; i < energies.length; i++) {
    let avg = 0;
    for (let k = i - historyLen; k < i; k++) avg += energies[k];
    avg /= historyLen;
    if (energies[i] > avg * 1.5 && energies[i] > 0.001) {
      onsets.push(i);
    }
  }

  if (onsets.length < 2) return 120;

  // Calculate inter-onset intervals
  const intervals: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    const diff = (onsets[i] - onsets[i - 1]) * windowSize / sampleRate;
    if (diff > 0.2 && diff < 2.0) intervals.push(diff);
  }

  if (intervals.length === 0) return 120;

  // Find median interval
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  const bpm = Math.round(60 / median);

  // Clamp to reasonable range and round to nearest multiple
  if (bpm < 60) return bpm * 2;
  if (bpm > 200) return Math.round(bpm / 2);
  return Math.max(60, Math.min(200, bpm));
}
