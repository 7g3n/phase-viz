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

const VIDEO_CODEC = 'avc1.42001f';
const AUDIO_CODEC = 'mp4a.40.2';
const AUDIO_CHUNK_SIZE = 2048;

export function canUseWebCodecsMP4() {
  return typeof VideoEncoder !== 'undefined'
    && typeof VideoFrame !== 'undefined'
    && typeof AudioEncoder !== 'undefined'
    && typeof AudioData !== 'undefined';
}

export async function exportToMP4WithWebCodecs({
  canvas,
  audioBuffer,
  duration,
  fps,
  renderFrame,
  onProgress,
  signal,
}: WebCodecsExportOptions): Promise<void> {
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
      expectedAudioChunks: Math.ceil(audioBuffer.length / AUDIO_CHUNK_SIZE),
    },
  });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      throw err;
    },
  });
  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (err) => {
      throw err;
    },
  });

  const abortEncoding = () => {
    videoEncoder.close();
    audioEncoder.close();
  };
  signal?.addEventListener('abort', abortEncoding, { once: true });

  try {
    await configureEncoders(videoEncoder, audioEncoder, width, height, fps, audioBuffer);

    for (let frame = 0; frame < totalFrames; frame++) {
      throwIfAborted(signal);
      const time = frame / fps;
      renderFrame(time, frame);

      const videoFrame = new VideoFrame(canvas, {
        visibleRect: { x: 0, y: 0, width, height },
        displayWidth: width,
        displayHeight: height,
        timestamp: Math.round(time * 1_000_000),
        duration: Math.round(1_000_000 / fps),
      });
      videoEncoder.encode(videoFrame, { keyFrame: frame % (fps * 2) === 0 });
      videoFrame.close();

      if (frame % 10 === 0 || frame === totalFrames - 1) {
        onProgress((frame + 1) / totalFrames * 0.68);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    await videoEncoder.flush();
    onProgress(0.72);

    await encodeAudio(audioEncoder, audioBuffer, (p) => {
      onProgress(0.72 + p * 0.22);
    }, signal);
    await audioEncoder.flush();

    throwIfAborted(signal);
    muxer.finalize();
    onProgress(0.97);

    downloadBlob(new Blob([target.buffer], { type: 'video/mp4' }), 'audio-visualizer.mp4');
    onProgress(1);
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
  const videoConfig: VideoEncoderConfig = {
    codec: VIDEO_CODEC,
    width,
    height,
    bitrate: Math.min(16_000_000, Math.max(4_000_000, width * height * fps * 0.16)),
    framerate: fps,
    avc: { format: 'avc' },
    latencyMode: 'quality',
  };
  const audioConfig: AudioEncoderConfig = {
    codec: AUDIO_CODEC,
    sampleRate: audioBuffer.sampleRate,
    numberOfChannels: audioBuffer.numberOfChannels,
    bitrate: 192_000,
  };

  const [videoSupport, audioSupport] = await Promise.all([
    VideoEncoder.isConfigSupported(videoConfig),
    AudioEncoder.isConfigSupported(audioConfig),
  ]);

  if (!videoSupport.supported || !audioSupport.supported) {
    throw new Error('WebCodecs MP4 export is not supported in this browser');
  }

  videoEncoder.configure(videoSupport.config ?? videoConfig);
  audioEncoder.configure(audioSupport.config ?? audioConfig);
}

async function encodeAudio(
  encoder: AudioEncoder,
  buffer: AudioBuffer,
  onProgress: (progress: number) => void,
  signal?: AbortSignal,
) {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const channelData = Array.from({ length: channels }, (_, ch) => buffer.getChannelData(ch));

  for (let start = 0; start < buffer.length; start += AUDIO_CHUNK_SIZE) {
    throwIfAborted(signal);
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

    if (encoder.encodeQueueSize > 16) {
      await encoder.flush();
    }
    if (start % (AUDIO_CHUNK_SIZE * 16) === 0 || start + frames >= buffer.length) {
      onProgress((start + frames) / buffer.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

function closeEncoder(encoder: VideoEncoder | AudioEncoder) {
  if (encoder.state !== 'closed') {
    encoder.close();
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function makeEven(value: number) {
  return Math.max(2, Math.floor(value / 2) * 2);
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Export was canceled', 'AbortError');
  }
}
