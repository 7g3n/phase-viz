export const FFT_SIZE = 2048;
export const HOP_SIZE = 512;

export function computeSpectrogram(
  channelData: Float32Array,
  sampleRate: number,
): Float32Array[] {
  const frames: Float32Array[] = [];
  const windowFn = hanningWindow(FFT_SIZE);
  const stepSamples = Math.floor(sampleRate / 30); // 30fps aligned

  for (let offset = 0; offset + FFT_SIZE < channelData.length; offset += stepSamples) {
    const frame = new Float32Array(FFT_SIZE / 2);
    const windowed = new Float32Array(FFT_SIZE);

    for (let i = 0; i < FFT_SIZE; i++) {
      windowed[i] = (channelData[offset + i] ?? 0) * windowFn[i];
    }

    // Simple DFT magnitude (using offline approach - real apps would use OfflineAudioContext)
    const magnitudes = simpleDFTMagnitude(windowed, FFT_SIZE / 2);
    for (let i = 0; i < FFT_SIZE / 2; i++) {
      frame[i] = magnitudes[i];
    }
    frames.push(frame);
  }

  return frames;
}

function hanningWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

function simpleDFTMagnitude(signal: Float32Array, numBins: number): Float32Array {
  // Cooley-Tukey FFT (radix-2)
  const n = signal.length;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);

  for (let i = 0; i < n; i++) real[i] = signal[i];

  // Bit-reversal permutation
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  // FFT butterfly
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI) / len;
    const wReal = Math.cos(ang);
    const wImag = -Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curReal = 1, curImag = 0;
      for (let k = 0; k < len / 2; k++) {
        const uR = real[i + k];
        const uI = imag[i + k];
        const vR = real[i + k + len / 2] * curReal - imag[i + k + len / 2] * curImag;
        const vI = real[i + k + len / 2] * curImag + imag[i + k + len / 2] * curReal;
        real[i + k] = uR + vR;
        imag[i + k] = uI + vI;
        real[i + k + len / 2] = uR - vR;
        imag[i + k + len / 2] = uI - vI;
        const newCurReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = newCurReal;
      }
    }
  }

  const mags = new Float32Array(numBins);
  for (let i = 0; i < numBins; i++) {
    mags[i] = Math.sqrt(real[i] ** 2 + imag[i] ** 2) / n;
  }
  return mags;
}

export function computeWaveform(channelData: Float32Array, points = 512): Float32Array {
  const waveform = new Float32Array(points);
  const blockSize = Math.floor(channelData.length / points);
  for (let i = 0; i < points; i++) {
    let peak = 0;
    for (let j = 0; j < blockSize; j++) {
      const v = Math.abs(channelData[i * blockSize + j]);
      if (v > peak) peak = v;
    }
    waveform[i] = peak;
  }
  return waveform;
}
