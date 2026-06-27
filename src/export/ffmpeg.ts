import type { FFmpeg as FFmpegType } from '@ffmpeg/ffmpeg';
import { FrameRecorder } from './recorder';

const FFMPEG_CORE_VERSION = '0.12.10';
const FALLBACK_FRAME_JPEG_QUALITY = 0.86;
const LOCAL_CORE = '/vendor/ffmpeg-core.js';
const LOCAL_WASM = '/vendor/ffmpeg-core.wasm';
// ESM build is more compatible with Worker contexts than UMD
const CDN_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`;

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

function createLocalCoreURLs(): CoreURLs {
  const baseUrl = `${window.location.protocol}//${window.location.host}`;
  return {
    coreURL: `${baseUrl}${LOCAL_CORE}`,
    wasmURL: `${baseUrl}${LOCAL_WASM}`,
  };
}

async function hasUsableLocalCore(signal?: AbortSignal): Promise<boolean> {
  const [coreRes, wasmHeadRes] = await Promise.all([
    fetch(LOCAL_CORE, { method: 'GET', signal }),
    fetch(LOCAL_WASM, { method: 'HEAD', signal }),
  ]);

  if (!coreRes.ok || !wasmHeadRes.ok) return false;

  const coreType = coreRes.headers.get('Content-Type')?.toLowerCase() ?? '';
  const wasmType = wasmHeadRes.headers.get('Content-Type')?.toLowerCase() ?? '';
  if (coreType.includes('text/html') || wasmType.includes('text/html')) {
    return false;
  }
  if (wasmType.includes('application/wasm')) {
    return true;
  }

  const wasmProbeRes = await fetch(LOCAL_WASM, {
    headers: { Range: 'bytes=0-3' },
    signal,
  });
  if (!wasmProbeRes.ok && wasmProbeRes.status !== 206) return false;

  const bytes = new Uint8Array(await wasmProbeRes.arrayBuffer());
  return bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d;
}

async function resolveCoreURLs(signal?: AbortSignal): Promise<CoreURLs> {
  try {
    // Prefer same-origin bundled assets when both files are deployable. The wasm
    // file exceeds Cloudflare Workers Static Assets' 25 MiB per-file limit, so
    // production builds may serve index.html for that path via SPA fallback.
    if (await hasUsableLocalCore(signal)) {
      return createLocalCoreURLs();
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

interface EncodeOptions {
  exportId: string;
  audioFile: string;
  outputFile: string;
  totalFrames: number;
  fps: number;
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
        const wasmResponse = await fetch(urls.wasmURL, { method: 'GET' });
        console.log('[ffmpeg] wasm GET', wasmResponse.status);
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
  const captureCanvas = document.createElement('canvas');

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
      const bytes = await captureCanvasJpeg(canvas, time * 1000, captureCanvas);
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
      await encodeMP4WithFallbacks(ffmpeg, {
        exportId,
        audioFile,
        outputFile,
        totalFrames,
        fps,
        signal,
      });
    } finally {
      ffmpeg.off('progress', onFfmpegProgress);
    }

    throwIfAborted(signal);
    onProgress(0.98);

    const rawData = await ffmpeg.readFile(outputFile, 'binary', { signal });
    throwIfAborted(signal);
    const blob = makeMP4Blob(rawData);
    assertValidMP4(rawData);
    onProgress(1);
    return blob;
  } finally {
    signal?.removeEventListener('abort', terminateOnAbort);
    await Promise.allSettled(pendingWrites);
    const ffmpeg = await ffmpegPromise.catch(() => null);
    if (ffmpeg) {
      await deleteFilesSettled(ffmpeg, [...frameFiles, audioFile, outputFile]);
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
      await encodeMP4WithFallbacks(ffmpeg, {
        exportId,
        audioFile,
        outputFile,
        totalFrames: frames.length,
        fps,
        signal,
      });
    } finally {
      ffmpeg.off('progress', onFfmpegProgress);
    }

    throwIfAborted(signal);
    onProgress(0.98);

    const rawData = await ffmpeg.readFile(outputFile, 'binary', { signal });
    throwIfAborted(signal);
    const blob = makeMP4Blob(rawData);
    assertValidMP4(rawData);
    outputBlob = blob;
  } finally {
    signal?.removeEventListener('abort', terminateOnAbort);
    await deleteFilesSettled(ffmpeg, [...frameFiles, audioFile, outputFile]);
  }
  onProgress(1.0);
  if (!outputBlob) {
    throw new Error('FFmpeg finished without a downloadable MP4');
  }
  return outputBlob;
}

function captureCanvasJpeg(
  sourceCanvas: HTMLCanvasElement,
  timeMs: number,
  captureCanvas: HTMLCanvasElement,
): Promise<Uint8Array> {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  if (width <= 0 || height <= 0) {
    return Promise.reject(new Error(
      `Could not capture export frame at ${Math.round(timeMs)}ms: canvas backing buffer is empty`,
    ));
  }

  if (captureCanvas.width !== width || captureCanvas.height !== height) {
    captureCanvas.width = width;
    captureCanvas.height = height;
  }

  const ctx = captureCanvas.getContext('2d', { alpha: false });
  if (!ctx) {
    return Promise.reject(new Error('Could not create export capture context'));
  }

  try {
    ctx.drawImage(sourceCanvas, 0, 0, width, height);
  } catch (err) {
    return Promise.reject(new Error(`Could not capture export frame at ${Math.round(timeMs)}ms: ${getErrorMessage(err)}`));
  }

  return new Promise((resolve, reject) => {
    const finish = (blob: Blob | null) => {
      if (!blob) {
        try {
          resolve(dataURLToBytes(captureCanvas.toDataURL('image/jpeg', FALLBACK_FRAME_JPEG_QUALITY)));
        } catch (err) {
          reject(new Error(`Could not capture export frame at ${Math.round(timeMs)}ms: ${getErrorMessage(err)}`));
        }
        return;
      }
      blob.arrayBuffer()
        .then((buffer) => resolve(new Uint8Array(buffer)))
        .catch(reject);
    };

    try {
      captureCanvas.toBlob(finish, 'image/jpeg', FALLBACK_FRAME_JPEG_QUALITY);
    } catch (err) {
      reject(new Error(`Could not capture export frame at ${Math.round(timeMs)}ms: ${getErrorMessage(err)}`));
    }
  });
}

function makeMP4Blob(rawData: Uint8Array | string) {
  const uint8 = toUint8Array(rawData);
  return new Blob([toArrayBuffer(uint8)], { type: 'video/mp4' });
}

async function encodeMP4WithFallbacks(
  ffmpeg: FFmpegType,
  options: EncodeOptions,
) {
  const attempts = [
    {
      label: 'h264',
      args: createEncodeArgs(options, [
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
      ]),
    },
    {
      label: 'mpeg4',
      args: createEncodeArgs(options, [
        '-c:v', 'mpeg4',
        '-q:v', '3',
      ]),
    },
  ];

  let lastError: Error | null = null;
  for (const attempt of attempts) {
    try {
      await ffmpeg.deleteFile(options.outputFile, { signal: options.signal }).catch(() => false);
      await execFFmpeg(ffmpeg, attempt.args, attempt.label, options.signal);
      return;
    } catch (err) {
      if (options.signal?.aborted) throw err;
      lastError = toError(err);
    }
  }

  throw lastError ?? new Error('FFmpeg failed to encode MP4');
}

function createEncodeArgs(
  { exportId, audioFile, outputFile, totalFrames, fps }: EncodeOptions,
  videoCodecArgs: string[],
) {
  return [
    '-hide_banner',
    '-loglevel', 'warning',
    '-framerate', String(fps),
    '-start_number', '0',
    '-i', `${exportId}-%06d.jpg`,
    '-i', audioFile,
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
    '-frames:v', String(totalFrames),
    ...videoCodecArgs,
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    '-y',
    outputFile,
  ];
}

async function execFFmpeg(
  ffmpeg: FFmpegType,
  args: string[],
  label: string,
  signal?: AbortSignal,
) {
  const logs: string[] = [];
  const onLog = ({ type, message }: { type: string; message: string }) => {
    if (!message) return;
    logs.push(`[${type}] ${message}`);
    if (logs.length > 80) logs.shift();
  };

  ffmpeg.on('log', onLog);
  try {
    const exitCode = await ffmpeg.exec(args, -1, { signal });
    if (exitCode !== 0) {
      throw new Error(`exited with code ${exitCode}`);
    }
  } catch (err) {
    const detail = formatFFmpegLogDetail(logs);
    throw new Error(`FFmpeg ${label} encode failed: ${getErrorMessage(err)}${detail}`);
  } finally {
    ffmpeg.off('log', onLog);
  }
}

async function deleteFilesSettled(ffmpeg: FFmpegType, files: string[]) {
  const chunkSize = 64;
  for (let start = 0; start < files.length; start += chunkSize) {
    await Promise.allSettled(
      files.slice(start, start + chunkSize).map((file) => ffmpeg.deleteFile(file)),
    );
  }
}

function formatFFmpegLogDetail(logs: string[]) {
  return logs.length ? `:\n${logs.slice(-12).join('\n')}` : '';
}

function assertValidMP4(rawData: Uint8Array | string) {
  const uint8 = toUint8Array(rawData);
  if (
    uint8.byteLength < 12 ||
    uint8[4] !== 0x66 ||
    uint8[5] !== 0x74 ||
    uint8[6] !== 0x79 ||
    uint8[7] !== 0x70
  ) {
    throw new Error(`FFmpeg finished without a valid MP4 payload (${uint8.byteLength} bytes)`);
  }
}

function toUint8Array(rawData: Uint8Array | string) {
  return rawData instanceof Uint8Array
    ? rawData
    : Uint8Array.from(rawData, (char) => char.charCodeAt(0) & 0xff);
}

function toError(err: unknown) {
  return err instanceof Error ? err : new Error(String(err));
}

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function dataURLToBytes(dataURL: string) {
  const commaIndex = dataURL.indexOf(',');
  if (commaIndex < 0) {
    throw new Error('Invalid image data URL');
  }

  const binary = atob(dataURL.slice(commaIndex + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
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
  const channelData = Array.from({ length: numChannels }, (_, ch) => buffer.getChannelData(ch));
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
  if (numChannels === 1) {
    const mono = channelData[0];
    for (let i = 0; i < length; i++) {
      view.setInt16(offset, floatToInt16(mono[i] ?? 0), true);
      offset += 2;
    }
  } else if (numChannels === 2) {
    const left = channelData[0];
    const right = channelData[1];
    for (let i = 0; i < length; i++) {
      view.setInt16(offset, floatToInt16(left[i] ?? 0), true);
      view.setInt16(offset + 2, floatToInt16(right[i] ?? 0), true);
      offset += 4;
    }
  } else {
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        view.setInt16(offset, floatToInt16(channelData[ch][i] ?? 0), true);
        offset += 2;
      }
    }
  }

  return arrayBuffer;
}

function floatToInt16(value: number) {
  const sample = Math.max(-1, Math.min(1, value));
  return sample < 0 ? sample * 0x8000 : sample * 0x7fff;
}
