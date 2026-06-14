# Audio Reactive 3D Visualizer

Open-source audio-reactive 3D visuals for musicians and creative coders, built with Three.js, WebGL, and the Web Audio API.

[Live demo](https://waveform.tranjectories.xyz/) · [Contributing](CONTRIBUTING.md) · [MIT License](LICENSE)

![Audio Reactive 3D Visualizer interface](docs/assets/hero.webp)

If this project is useful to you, consider starring the repository or contributing an issue or pull request.

## Overview

Audio Reactive 3D Visualizer is a browser-based creative tool for turning music and artwork into real-time visuals. It analyzes an audio file locally, drives 3D objects, particles, waveforms, and image effects from the result, and can export the composition as a 1920x1080 MP4.

The project is aimed at independent musicians, vocal synth producers, VJs, video creators, and developers exploring audio-reactive graphics on the web.

## Highlights

- Three visual modes: 3D Visualizer, Wave Visualizer, and Image FX
- Real-time volume, frequency, and waveform analysis with the Web Audio API
- Four 3D presets plus configurable particles, camera distance, morphing, and effects
- Horizontal, circular, and bar waveform styles
- Image FX presets with glow, blur, RGB shift, noise, distortion, and pulse controls
- Live / VJ mode with fullscreen, hidden UI, keyboard shortcuts, and effect boost
- Reorderable visual layers
- Browser-based 1080p MP4 export using WebCodecs with an ffmpeg.wasm fallback

## Use Cases

- Music visualizers and lyric-video backgrounds
- Promotional clips for music releases
- Vocal synth and electronic music visuals
- Live performance and VJ experiments
- Audio-reactive artwork
- Music video direction mockups
- Three.js, WebGL, and Web Audio API learning projects

## Tech Stack

- React 19 and TypeScript
- Vite
- Three.js, React Three Fiber, and React Three Drei
- WebGL and Canvas 2D
- Web Audio API
- Material UI and Emotion
- Zustand
- WebCodecs, mp4-muxer, and ffmpeg.wasm
- Cloudflare Workers Static Assets

## Quick Start

Prerequisites: a current Node.js LTS release and npm.

```bash
git clone https://github.com/7g3n/phase-viz.git
cd phase-viz
npm ci
npm run dev
```

Open the local URL printed by Vite, then drop in a supported audio file (`wav`, `mp3`, `flac`, `ogg`, or `aac`). A background image can be added as JPEG, PNG, WebP, or GIF.

Create a production build with:

```bash
npm run build
```

## MP4 Export

The Export MP4 action renders a 1920x1080 video at 30 FPS.

1. The app uses WebCodecs when the browser exposes compatible video and audio encoders.
2. If fast export is unavailable or fails, the app retries with ffmpeg.wasm.
3. ffmpeg core assets are loaded from `/vendor` when deployed locally and fall back to jsDelivr when those assets are unavailable.
4. The completed MP4 is generated as a browser blob and downloaded locally.

Long tracks and complex scenes can require substantial memory and processing time. Keep the tab open while an export is running.

## Privacy

Selected audio files and background images are read and processed in the browser. The application does not upload selected media to an application backend, and MP4 rendering also happens locally.

Normal web requests are still made to load the application. When local ffmpeg core assets are unavailable, the fallback exporter downloads those runtime assets from jsDelivr.

## Browser Compatibility

A current desktop Chromium-based browser is recommended for the fastest WebCodecs export path. The app checks encoder support at runtime and can fall back to ffmpeg.wasm in browsers that support the required WebAssembly features.

Exact codec, fullscreen, performance, and file-decoding support varies by browser and device. There is not yet a maintained compatibility matrix, and the fixed desktop workspace is not optimized for small screens.

## Architecture Overview

| Area | Location | Responsibility |
| --- | --- | --- |
| Application shell | `src/App.tsx` | Layout, visual mode selection, live controls, and export orchestration |
| State | `src/store.ts` | Shared visualizer, playback, effect, and export state |
| Audio analysis | `src/audio/` | Audio decoding inputs, FFT/spectrogram data, waveform sampling, and BPM detection |
| Visualizers | `src/ui/VisualizerCanvas.tsx`, `WaveVisualizer.tsx`, `ImageFXVisualizer.tsx` | Real-time rendering and export frame generation |
| 3D rendering | `src/visual/` | Three.js scene, particles, presets, shaders, and post-processing |
| MP4 export | `src/export/` | WebCodecs encoding, MP4 muxing, ffmpeg.wasm fallback, and downloads |
| Deployment | `vite.config.ts`, `wrangler.toml` | Vite build and Cloudflare static asset hosting |

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), review the [Code of Conduct](CODE_OF_CONDUCT.md), and use the issue templates when reporting a bug or proposing an improvement.

Please open an issue before beginning a large behavioral or architectural change. Security reports should follow [SECURITY.md](SECURITY.md).

## Roadmap

- Improve keyboard and screen-reader accessibility throughout the workspace
- Add responsive layouts for narrower screens
- Add automated tests for audio analysis, state transitions, and export utilities
- Add saveable and shareable visual presets
- Improve long-duration export performance and resource guidance
- Publish a tested browser compatibility matrix

## 日本語

Audio Reactive 3D Visualizerは、音源をブラウザ内で解析し、音声に反応する3Dビジュアル、波形、画像エフェクトを生成するオープンソースのWebアプリです。3D Visualizer、Wave Visualizer、Image FXの3モードを備え、作成した映像を1920x1080・30 FPSのMP4として書き出せます。

- デモ: [waveform.tranjectories.xyz](https://waveform.tranjectories.xyz/)
- 音声解析・画像処理・MP4生成はブラウザ内で行われます
- WebCodecsが利用できない場合はffmpeg.wasmへフォールバックします
- 開発を始めるには`npm ci`と`npm run dev`を実行してください
- バグ報告や機能提案はGitHub Issues、コードの改善はPull Requestから歓迎します

詳しい開発手順は[CONTRIBUTING.md](CONTRIBUTING.md)を参照してください。

## License

Licensed under the [MIT License](LICENSE).

## Author

Created by **Nagisa Dozono (TRAJECTORIES)**.

- [GitHub: @7g3n](https://github.com/7g3n)
- [X: @nagisa7g](https://x.com/nagisa7g)
- [Live demo](https://waveform.tranjectories.xyz/)
- [Music video created with the visualizer](https://www.youtube.com/watch?v=R8ItWr2V_ZA)
