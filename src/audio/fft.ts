export const FFT_SIZE = 2048;
export const HOP_SIZE = 512;

export function computeSpectrogram(
  channelData: Float32Array,
  sampleRate: number,
): Float32Array[] {
  const frames: Float32Array[] = [];
  const windowFn = hanningWindow(FFT_SIZE);
  const stepSamples = Math.max(1, Math.floor(sampleRate / 30)); // 30fps aligned
  const bitReversal = createBitReversalTable(FFT_SIZE);
  const real = new Float32Array(FFT_SIZE);
  const imag = new Float32Array(FFT_SIZE);

  for (let offset = 0; offset + FFT_SIZE <= channelData.length; offset += stepSamples) {
    const frame = new Float32Array(FFT_SIZE / 2);

    for (let i = 0; i < FFT_SIZE; i++) {
      real[i] = (channelData[offset + i] ?? 0) * windowFn[i];
      imag[i] = 0;
    }

    fftInPlace(real, imag, bitReversal);

    for (let i = 0; i < FFT_SIZE / 2; i++) {
      const r = real[i];
      const im = imag[i];
      frame[i] = Math.sqrt(r * r + im * im) / FFT_SIZE;
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

function createBitReversalTable(size: number): Uint16Array {
  const table = new Uint16Array(size);
  let j = 0;
  for (let i = 0; i < size; i++) {
    table[i] = j;
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
  }
  return table;
}

function fftInPlace(real: Float32Array, imag: Float32Array, bitReversal: Uint16Array) {
  const n = real.length;

  for (let i = 0; i < n; i++) {
    const j = bitReversal[i];
    if (i < j) {
      const realTmp = real[i];
      real[i] = real[j];
      real[j] = realTmp;
      const imagTmp = imag[i];
      imag[i] = imag[j];
      imag[j] = imagTmp;
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
}

export function computeWaveform(channelData: Float32Array, points = 512): Float32Array {
  const waveform = new Float32Array(points);
  if (channelData.length === 0) return waveform;

  for (let i = 0; i < points; i++) {
    let peak = 0;
    const start = Math.floor((i * channelData.length) / points);
    const end = Math.max(start + 1, Math.floor(((i + 1) * channelData.length) / points));
    for (let j = start; j < end; j++) {
      const v = Math.abs(channelData[j]);
      if (v > peak) peak = v;
    }
    waveform[i] = peak;
  }
  return waveform;
}
