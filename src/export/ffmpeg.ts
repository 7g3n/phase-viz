import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { FrameRecorder } from './recorder';

let ffmpegInstance: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;

  const ffmpeg = new FFmpeg();
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

export async function exportToMP4(
  recorder: FrameRecorder,
  audioBuffer: AudioBuffer,
  fps: number,
  onProgress: (p: number) => void,
): Promise<void> {
  const ffmpeg = await getFFmpeg();
  const frames = recorder.getFrames();

  if (frames.length === 0) throw new Error('No frames to export');

  onProgress(0.05);

  // Write frames
  for (let i = 0; i < frames.length; i++) {
    const arr = await frames[i].blob.arrayBuffer();
    await ffmpeg.writeFile(`frame${String(i).padStart(6, '0')}.jpg`, new Uint8Array(arr));
    onProgress(0.05 + (i / frames.length) * 0.4);
  }

  // Write audio
  const wavData = audioBufferToWav(audioBuffer);
  await ffmpeg.writeFile('audio.wav', new Uint8Array(wavData));
  onProgress(0.5);

  // Encode
  ffmpeg.on('progress', ({ progress }) => {
    onProgress(0.5 + progress * 0.45);
  });

  await ffmpeg.exec([
    '-framerate', String(fps),
    '-i', 'frame%06d.jpg',
    '-i', 'audio.wav',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    '-shortest',
    '-y',
    'output.mp4',
  ]);

  onProgress(0.98);

  const rawData = await ffmpeg.readFile('output.mp4');
  // Copy to a plain ArrayBuffer to satisfy Blob constructor typing
  const uint8 = rawData instanceof Uint8Array ? rawData : new Uint8Array(rawData as unknown as ArrayBuffer);
  const plain = new Uint8Array(uint8.length);
  plain.set(uint8);
  const blob = new Blob([plain.buffer], { type: 'video/mp4' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'audio-visualizer.mp4';
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 5000);
  onProgress(1.0);
}

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const arrayBuffer = new ArrayBuffer(44 + length * numChannels * 2);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * numChannels * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length * numChannels * 2, true);

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample * 0x7fff, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

// Suppress unused import warning
void fetchFile;
