import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

interface WebCodecsExportOptions {
  canvas: HTMLCanvasElement;
  audioBuffer: AudioBuffer;
  duration: number;
  fps: number;
  renderFrame: (time: number, frame: number) => void;
  onProgress: (progress: number) => void;
  signal?: AbortSignal;
}

const AUDIO_CODEC = 'mp4a.40.2';
const AUDIO_CHUNK_SIZE = 65536;
const AAC_SAMPLES_PER_FRAME = 1024;
const AUDIO_CHUNK_HEADROOM = 8;
const MAX_VIDEO_QUEUE_SIZE = 96;
const PROGRESS_FRAME_INTERVAL = 45;

export function canUseWebCodecsMP4() {
  return typeof VideoEncoder !== 'undefined'
    && typeof VideoFrame !== 'undefined'
    && typeof AudioEncoder !== 'undefined'
    && typeof AudioData !== 'undefined'
    && typeof VideoEncoder.isConfigSupported === 'function'
    && typeof AudioEncoder.isConfigSupported === 'function';
}

export async function exportToMP4WithWebCodecs({
  canvas,
  audioBuffer,
  duration,
  fps,
  renderFrame,
  onProgress,
  signal,
}: WebCodecsExportOptions): Promise<Blob> {
  throwIfAborted(signal);

  const width = makeEven(canvas.width || canvas.clientWidth);
  const height = makeEven(canvas.height || canvas.clientHeight);
  const totalFrames = Math.max(1, Math.ceil(duration * fps));
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height, frameRate: fps },
    audio: {
      codec: 'aac',
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate,
    },
    fastStart: {
      expectedVideoChunks: totalFrames,
      expectedAudioChunks: getExpectedAudioChunks(audioBuffer),
    },
  });

  let videoChunkCount = 0;
  let audioChunkCount = 0;
  let encoderError: Error | null = null;
  const setEncoderError = (err: unknown) => {
    encoderError = toError(err);
  };
  const throwEncoderError = () => {
    if (encoderError) throw encoderError;
  };

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (encoderError) return;
      try {
        muxer.addVideoChunk(chunk, meta);
        videoChunkCount++;
      } catch (err) {
        setEncoderError(err);
      }
    },
    error: setEncoderError,
  });
  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => {
      if (encoderError) return;
      try {
        muxer.addAudioChunk(chunk, meta);
        audioChunkCount++;
      } catch (err) {
        setEncoderError(err);
      }
    },
    error: setEncoderError,
  });

  const abortEncoding = () => {
    closeEncoder(videoEncoder);
    closeEncoder(audioEncoder);
  };
  signal?.addEventListener('abort', abortEncoding, { once: true });

  try {
    await configureEncoders(videoEncoder, audioEncoder, width, height, fps, audioBuffer);

    let videoProgress = 0;
    let audioProgress = 0;
    let audioPromiseError: Error | null = null;
    const updateEncodeProgress = () => {
      onProgress(Math.min(0.94, videoProgress * 0.78 + audioProgress * 0.16));
    };
    const audioPromise = (async () => {
      await encodeAudio(audioEncoder, audioBuffer, (p) => {
        audioProgress = p;
        updateEncodeProgress();
      }, throwEncoderError, signal);
      await withTimeout(audioEncoder.flush(), 30_000, 'Audio encoder flush timed out');
      audioProgress = 1;
      updateEncodeProgress();
    })().catch((err) => {
      audioPromiseError = toError(err);
      setEncoderError(audioPromiseError);
    });

    for (let frame = 0; frame < totalFrames; frame++) {
      throwIfAborted(signal);
      throwEncoderError();
      const time = frame / fps;
      renderFrame(time, frame);

      const videoFrame = new VideoFrame(canvas, {
        visibleRect: { x: 0, y: 0, width, height },
        displayWidth: width,
        displayHeight: height,
        timestamp: Math.round(time * 1_000_000),
        duration: Math.round(1_000_000 / fps),
      });
      videoEncoder.encode(videoFrame, { keyFrame: frame === 0 || frame % (fps * 10) === 0 });
      videoFrame.close();

      if (videoEncoder.encodeQueueSize > MAX_VIDEO_QUEUE_SIZE) {
        await waitForVideoQueue(
          videoEncoder,
          Math.floor(MAX_VIDEO_QUEUE_SIZE * 0.65),
          throwEncoderError,
          signal,
        );
      }

      if (frame % PROGRESS_FRAME_INTERVAL === 0 || frame === totalFrames - 1) {
        videoProgress = (frame + 1) / totalFrames;
        updateEncodeProgress();
        await yieldToBrowser();
      }
    }

    await withTimeout(videoEncoder.flush(), 45_000, 'Video encoder flush timed out');
    throwEncoderError();
    videoProgress = 1;
    updateEncodeProgress();
    await audioPromise;
    if (audioPromiseError) throw audioPromiseError;
    throwEncoderError();

    if (videoChunkCount < totalFrames) {
      throw new Error(`Video encoder stopped early (${videoChunkCount}/${totalFrames} frames)`);
    }
    if (audioChunkCount === 0) {
      throw new Error('Audio encoder produced no chunks');
    }

    throwIfAborted(signal);
    muxer.finalize();
    onProgress(0.97);

    if (target.buffer.byteLength < 1024) {
      throw new Error('Export finished without a valid MP4 payload');
    }

    onProgress(1);
    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    signal?.removeEventListener('abort', abortEncoding);
    closeEncoder(videoEncoder);
    closeEncoder(audioEncoder);
  }
}

async function configureEncoders(
  videoEncoder: VideoEncoder,
  audioEncoder: AudioEncoder,
  width: number,
  height: number,
  fps: number,
  audioBuffer: AudioBuffer,
) {
  const videoBaseConfig: Omit<VideoEncoderConfig, 'codec'> = {
    width,
    height,
    bitrate: Math.min(12_000_000, Math.max(4_000_000, width * height * fps * 0.16)),
    framerate: fps,
    avc: { format: 'avc' },
  };
  const videoConfigs = createVideoConfigCandidates(videoBaseConfig, width, height, fps);
  const audioConfig: AudioEncoderConfig = {
    codec: AUDIO_CODEC,
    sampleRate: audioBuffer.sampleRate,
    numberOfChannels: audioBuffer.numberOfChannels,
    bitrate: 192_000,
  };

  const [supportedVideoConfig, audioSupport] = await Promise.all([
    getSupportedVideoConfig(videoConfigs),
    AudioEncoder.isConfigSupported(audioConfig),
  ]);

  if (!supportedVideoConfig || !audioSupport.supported) {
    throw new Error('WebCodecs MP4 export is not supported in this browser');
  }

  videoEncoder.configure(supportedVideoConfig);
  audioEncoder.configure(audioSupport.config ?? audioConfig);
}

function createVideoConfigCandidates(
  baseConfig: Omit<VideoEncoderConfig, 'codec'>,
  width: number,
  height: number,
  fps: number,
) {
  return getAvcCodecCandidates(width, height, fps).flatMap((codec): VideoEncoderConfig[] => [{
    ...baseConfig,
    codec,
    hardwareAcceleration: 'prefer-hardware',
    latencyMode: 'realtime',
  }, {
    ...baseConfig,
    codec,
    hardwareAcceleration: 'no-preference',
    latencyMode: 'realtime',
  }, {
    ...baseConfig,
    codec,
    latencyMode: 'quality',
  }]);
}

function getAvcCodecCandidates(width: number, height: number, fps: number) {
  const level = getAvcLevelHex(width, height, fps);
  const fallbackLevel = level === '1f' ? '28' : '1f';
  return [
    `avc1.4200${level}`,
    `avc1.4d00${level}`,
    `avc1.6400${level}`,
    `avc1.4200${fallbackLevel}`,
    `avc1.4d00${fallbackLevel}`,
    `avc1.6400${fallbackLevel}`,
  ];
}

function getAvcLevelHex(width: number, height: number, fps: number) {
  const macroblocksPerFrame = Math.ceil(width / 16) * Math.ceil(height / 16);
  const macroblocksPerSecond = macroblocksPerFrame * fps;
  const levels = [
    { hex: '1f', maxFrame: 3600, maxSecond: 108000 },
    { hex: '28', maxFrame: 8192, maxSecond: 245760 },
    { hex: '2a', maxFrame: 8704, maxSecond: 522240 },
    { hex: '32', maxFrame: 22080, maxSecond: 589824 },
    { hex: '33', maxFrame: 36864, maxSecond: 983040 },
    { hex: '34', maxFrame: 36864, maxSecond: 2073600 },
  ];
  return levels.find((level) =>
    macroblocksPerFrame <= level.maxFrame && macroblocksPerSecond <= level.maxSecond,
  )?.hex ?? '34';
}

function getExpectedAudioChunks(audioBuffer: AudioBuffer) {
  const inputChunks = Math.ceil(audioBuffer.length / AUDIO_CHUNK_SIZE);
  // AAC encoders may emit one chunk per 1024-sample AAC frame, plus a few
  // priming/drain chunks during flush. mp4-muxer expects an upper bound here.
  const aacFrames = Math.ceil(audioBuffer.length / AAC_SAMPLES_PER_FRAME);
  return Math.max(inputChunks, aacFrames) + AUDIO_CHUNK_HEADROOM;
}

async function getSupportedVideoConfig(configs: VideoEncoderConfig[]) {
  for (const config of configs) {
    const support = await VideoEncoder.isConfigSupported(config);
    if (support.supported) {
      return support.config ?? config;
    }
  }
  return null;
}

async function encodeAudio(
  encoder: AudioEncoder,
  buffer: AudioBuffer,
  onProgress: (progress: number) => void,
  throwEncoderError: () => void,
  signal?: AbortSignal,
) {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const channelData = Array.from({ length: channels }, (_, ch) => buffer.getChannelData(ch));

  for (let start = 0; start < buffer.length; start += AUDIO_CHUNK_SIZE) {
    throwIfAborted(signal);
    throwEncoderError();
    const frames = Math.min(AUDIO_CHUNK_SIZE, buffer.length - start);
    const data = new Float32Array(frames * channels);

    for (let ch = 0; ch < channels; ch++) {
      data.set(channelData[ch].subarray(start, start + frames), ch * frames);
    }

    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: frames,
      numberOfChannels: channels,
      timestamp: Math.round(start / sampleRate * 1_000_000),
      data,
    });
    encoder.encode(audioData);
    audioData.close();
    throwEncoderError();

    if (encoder.encodeQueueSize > 16) {
      await withTimeout(encoder.flush(), 30_000, 'Audio encoder stalled');
      throwEncoderError();
    }
    if (start % (AUDIO_CHUNK_SIZE * 16) === 0 || start + frames >= buffer.length) {
      onProgress((start + frames) / buffer.length);
      await yieldToBrowser();
    }
  }
}

async function waitForVideoQueue(
  encoder: VideoEncoder,
  targetSize: number,
  throwEncoderError: () => void,
  signal?: AbortSignal,
) {
  let lastQueueSize = encoder.encodeQueueSize;
  let lastQueueChangeAt = performance.now();
  while (encoder.encodeQueueSize > targetSize) {
    throwIfAborted(signal);
    throwEncoderError();
    if (encoder.encodeQueueSize < lastQueueSize) {
      lastQueueSize = encoder.encodeQueueSize;
      lastQueueChangeAt = performance.now();
    } else if (performance.now() - lastQueueChangeAt > 15_000) {
      throw new Error(`Video encoder stalled with ${encoder.encodeQueueSize} frames queued`);
    }
    await waitForEncoderDequeue(encoder, signal);
  }
}

function waitForEncoderDequeue(encoder: VideoEncoder, signal?: AbortSignal): Promise<void> {
  if (encoder.encodeQueueSize <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timeoutId = 0;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      encoder.removeEventListener('dequeue', onDequeue);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = () => {
      cleanup();
      resolve();
    };
    const onDequeue = () => finish();
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Export was canceled', 'AbortError'));
    };

    encoder.addEventListener('dequeue', onDequeue, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
    timeoutId = window.setTimeout(finish, 50);
  });
}

function yieldToBrowser(): Promise<void> {
  const scheduler = (globalThis as {
    scheduler?: { yield?: () => Promise<void> };
  }).scheduler;
  return scheduler?.yield?.() ?? new Promise((resolve) => setTimeout(resolve, 0));
}

function closeEncoder(encoder: VideoEncoder | AudioEncoder) {
  if (encoder.state !== 'closed') {
    encoder.close();
  }
}

function toError(err: unknown) {
  return err instanceof Error ? err : new Error(String(err));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId = 0;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function makeEven(value: number) {
  return Math.max(2, Math.floor(value / 2) * 2);
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Export was canceled', 'AbortError');
  }
}
