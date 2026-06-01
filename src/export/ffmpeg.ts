import type { FFmpeg as FFmpegType } from '@ffmpeg/ffmpeg';
import { FrameRecorder } from './recorder';

const FFMPEG_CORE_VERSION = '0.12.10';
const LOCAL_CORE = '/vendor/ffmpeg-core.js';
const LOCAL_WASM = '/vendor/ffmpeg-core.wasm';
// ESM build is more compatible with Worker contexts than UMD
const CDN_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`;
const R2_ASSET_BASE_URL = import.meta.env.VITE_FFMPEG_ASSET_BASE_URL?.replace(/\/+$/, '');

interface CoreURLs {
  coreURL: string;
  wasmURL: string;
  workerURL?: string;
}

function createCoreURLs(baseURL: string): CoreURLs {
  return {
    coreURL: `${baseURL}/ffmpeg-core.js`,
    wasmURL: `${baseURL}/ffmpeg-core.wasm`,
    // workerURL is only needed for UMD; ESM doesn't use it
  };
}

async function resolveCoreURLs(signal?: AbortSignal): Promise<CoreURLs> {
  if (R2_ASSET_BASE_URL) {
    return createCoreURLs(R2_ASSET_BASE_URL);
  }

  try {
    // Some proxies/networks behave differently for HEAD requests.
    // Use GET to avoid Cloudflare 522/timeout edge cases.
    const res = await fetch(LOCAL_CORE, { method: 'GET', signal });
    if (res.ok) {
      // Convert relative URLs to absolute for Web Worker compatibility
      const baseUrl = `${window.location.protocol}//${window.location.host}`;
      return {
        coreURL: `${baseUrl}${LOCAL_CORE}`,
        wasmURL: `${baseUrl}${LOCAL_WASM}`,
      };
    }
  } catch {
    // ignore and fallback to remote sources
  }


  return createCoreURLs(CDN_BASE);
}

interface FFmpegFrameExportOptions {
  canvas: HTMLCanvasElement;
  audioBuffer: AudioBuffer;
  duration: number;
  fps: number;
  renderFrame: (time: number, frame: number) => void;
  onProgress: (progress: number) => void;
  onStatus?: (status: string) => void;
  signal?: AbortSignal;
}

let ffmpegInstance: FFmpegType | null = null;
let ffmpegLoadPromise: Promise<FFmpegType> | null = null;

async function getFFmpeg(signal?: AbortSignal): Promise<FFmpegType> {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  // Dynamically import `@ffmpeg/ffmpeg` at runtime so it is not bundled
  // into the main application chunk during build.
  ffmpegLoadPromise = (async () => {
    throwIfAborted(signal);
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const ffmpeg = new FFmpeg();
    const urls = await resolveCoreURLs(signal);

    // NOTE: Do not run verbose network/debug checks in production.
    // These can increase load and trigger Cloudflare 522 timeouts.
    if (import.meta.env.DEV) {
      try {
        console.log('[ffmpeg] resolved URLs', urls);
        const r = await fetch(urls.coreURL, { method: 'GET' });
        console.log('[ffmpeg] core GET', r.status);
        const r2 = await fetch(urls.wasmURL, { method: 'GET' });
        console.log('[ffmpeg] wasm GET', r2.status);
      } catch (e) {
        console.warn('[ffmpeg] pre-load checks failed', e);
      }
    }


    try {
      await ffmpeg.load(
        { coreURL: urls.coreURL, wasmURL: urls.wasmURL, workerURL: urls.workerURL },
        { signal }
      );
    } catch (err) {
      console.error('[ffmpeg] load failed', { coreURL: urls.coreURL, wasmURL: urls.wasmURL, workerURL: urls.workerURL, err });
      throw err;
    }
    ffmpegInstance = ffmpeg as unknown as FFmpegType;
    return ffmpeg as unknown as FFmpegType;
  })();

  try {
    return await ffmpegLoadPromise;
  } catch (err) {
    const created = await ffmpegLoadPromise!.catch(() => null);
    if (created) {
      try { created.terminate(); } catch { /* ignore */ }
      if (ffmpegInstance === created) ffmpegInstance = null;
    }
    ffmpegLoadPromise = null;
    throw err;
  }
}

export async function preloadFFmpeg(signal?: AbortSignal) {
  await getFFmpeg(signal);
}

export async function exportToMP4WithFFmpegFrames({
  canvas,
  audioBuffer,
  duration,
  fps,
  renderFrame,
  onProgress,
  onStatus,
  signal,
}: FFmpegFrameExportOptions): Promise<Blob> {
  const ffmpegPromise = getFFmpeg(signal);
  const exportId = `export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const totalFrames = Math.max(1, Math.ceil(duration * fps));
  const frameFiles = Array.from(
    { length: totalFrames },
    (_, i) => `${exportId}-${String(i).padStart(6, '0')}.jpg`,
  );
  const audioFile = `${exportId}-audio.wav`;
  const outputFile = `${exportId}-output.mp4`;
  const pendingWrites: Promise<void>[] = [];

  const terminateOnAbort = async () => {
    const ffmpeg = await ffmpegPromise.catch(() => null);
    if (ffmpeg) {
      ffmpeg.terminate();
      if (ffmpegInstance === ffmpeg) {
        ffmpegInstance = null;
      }
      ffmpegLoadPromise = null;
    }
  };
  signal?.addEventListener('abort', terminateOnAbort, { once: true });

  try {
    onStatus?.('Rendering fallback frames...');
    for (let frame = 0; frame < totalFrames; frame++) {
      throwIfAborted(signal);
      const time = frame / fps;
      renderFrame(time, frame);
      const bytes = await captureCanvasJpeg(canvas, time * 1000);
      throwIfAborted(signal);

      const frameFile = frameFiles[frame];
      pendingWrites.push(ffmpegPromise.then(async (ffmpeg) => {
        await ffmpeg.writeFile(frameFile, bytes, { signal });
      }));

      if (pendingWrites.length > 16) {
        await pendingWrites.shift();
      }

      if (frame % 12 === 0 || frame === totalFrames - 1) {
        onProgress((frame + 1) / totalFrames * 0.34);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    await Promise.all(pendingWrites);
    const ffmpeg = await ffmpegPromise;

    throwIfAborted(signal);
    onStatus?.('Preparing audio...');
    const wavData = audioBufferToWav(audioBuffer);
    throwIfAborted(signal);
    await ffmpeg.writeFile(audioFile, new Uint8Array(wavData), { signal });
    onProgress(0.4);

    const onFfmpegProgress = ({ progress }: { progress: number }) => {
      onProgress(0.4 + progress * 0.56);
    };
    ffmpeg.on('progress', onFfmpegProgress);

    try {
      onStatus?.('Encoding MP4 fallback...');
      await ffmpeg.exec([
        '-framerate', String(fps),
        '-i', `${exportId}-%06d.jpg`,
        '-i', audioFile,
        '-frames:v', String(totalFrames),
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-c:a', 'aac',
        '-b:a', '160k',
        '-pix_fmt', 'yuv420p',
        '-shortest',
        '-y',
        outputFile,
      ], -1, { signal });
    } finally {
      ffmpeg.off('progress', onFfmpegProgress);
    }

    throwIfAborted(signal);
    onProgress(0.98);

    const rawData = await ffmpeg.readFile(outputFile, 'binary', { signal });
    throwIfAborted(signal);
    const blob = makeMP4Blob(rawData);
    if (blob.size < 1024) {
      throw new Error('FFmpeg finished without a valid MP4 payload');
    }
    onProgress(1);
    return blob;
  } finally {
    signal?.removeEventListener('abort', terminateOnAbort);
    const ffmpeg = await ffmpegPromise.catch(() => null);
    if (ffmpeg) {
      await Promise.allSettled([
        ...frameFiles.map((file) => ffmpeg.deleteFile(file)),
        ffmpeg.deleteFile(audioFile),
        ffmpeg.deleteFile(outputFile),
      ]);
    }
  }
}

export async function exportToMP4(
  recorder: FrameRecorder,
  audioBuffer: AudioBuffer,
  fps: number,
  onProgress: (p: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const ffmpeg = await getFFmpeg(signal);
  const frames = recorder.getFrames();
  const exportId = `export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const frameFiles = frames.map((_, i) => `${exportId}-${String(i).padStart(6, '0')}.jpg`);
  const audioFile = `${exportId}-audio.wav`;
  const outputFile = `${exportId}-output.mp4`;

  if (frames.length === 0) throw new Error('No frames to export');

  const terminateOnAbort = () => {
    ffmpeg.terminate();
    if (ffmpegInstance === ffmpeg) {
      ffmpegInstance = null;
    }
    ffmpegLoadPromise = null;
  };
  signal?.addEventListener('abort', terminateOnAbort, { once: true });
  let outputBlob: Blob | null = null;

  try {
    throwIfAborted(signal);
    onProgress(0.05);

    // Write frames
    for (let i = 0; i < frames.length; i++) {
      throwIfAborted(signal);
      const arr = await frames[i].blob.arrayBuffer();
      throwIfAborted(signal);
      await ffmpeg.writeFile(frameFiles[i], new Uint8Array(arr), { signal });
      onProgress(0.05 + (i / frames.length) * 0.4);
    }

    // Write audio
    throwIfAborted(signal);
    const wavData = audioBufferToWav(audioBuffer);
    throwIfAborted(signal);
    await ffmpeg.writeFile(audioFile, new Uint8Array(wavData), { signal });
    onProgress(0.5);

    // Encode
    const onFfmpegProgress = ({ progress }: { progress: number }) => {
      onProgress(0.5 + progress * 0.45);
    };
    ffmpeg.on('progress', onFfmpegProgress);

    try {
      await ffmpeg.exec([
        '-framerate', String(fps),
        '-i', `${exportId}-%06d.jpg`,
        '-i', audioFile,
        '-frames:v', String(frames.length),
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-c:a', 'aac',
        '-b:a', '160k',
        '-pix_fmt', 'yuv420p',
        '-shortest',
        '-y',
        outputFile,
      ], -1, { signal });
    } finally {
      ffmpeg.off('progress', onFfmpegProgress);
    }

    throwIfAborted(signal);
    onProgress(0.98);

    const rawData = await ffmpeg.readFile(outputFile, 'binary', { signal });
    throwIfAborted(signal);
    const blob = makeMP4Blob(rawData);
    if (blob.size < 1024) {
      throw new Error('FFmpeg finished without a valid MP4 payload');
    }
    outputBlob = blob;
  } finally {
    signal?.removeEventListener('abort', terminateOnAbort);
    await Promise.allSettled([
      ...frameFiles.map((file) => ffmpeg.deleteFile(file)),
      ffmpeg.deleteFile(audioFile),
      ffmpeg.deleteFile(outputFile),
    ]);
  }
  onProgress(1.0);
  if (!outputBlob) {
    throw new Error('FFmpeg finished without a downloadable MP4');
  }
  return outputBlob;
}

function captureCanvasJpeg(canvas: HTMLCanvasElement, timeMs: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(`Could not capture export frame at ${Math.round(timeMs)}ms`));
        return;
      }
      blob.arrayBuffer()
        .then((buffer) => resolve(new Uint8Array(buffer)))
        .catch(reject);
    }, 'image/jpeg', 0.64);
  });
}

function makeMP4Blob(rawData: Uint8Array | string) {
  const uint8 = rawData instanceof Uint8Array
    ? rawData
    : new TextEncoder().encode(rawData);
  return new Blob([toArrayBuffer(uint8)], { type: 'video/mp4' });
}

function toArrayBuffer(uint8: Uint8Array): ArrayBuffer {
  if (uint8.buffer instanceof ArrayBuffer) {
    if (uint8.byteOffset === 0 && uint8.byteLength === uint8.buffer.byteLength) {
      return uint8.buffer;
    }
    return uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);
  }
  const copy = new Uint8Array(uint8.byteLength);
  copy.set(uint8);
  return copy.buffer;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Export was canceled', 'AbortError');
  }
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
