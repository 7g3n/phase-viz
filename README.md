# Audio Reactive 3D Visualizer

音源をブラウザ上で解析し、音声に反応する3Dビジュアル、波形、画像エフェクトをリアルタイムに生成するオープンソースのWebアプリです。作成した映像は1920x1080のMP4として書き出せます。

デモ: https://waveform.tranjectories.xyz/

## 主な機能

- Web Audio APIによる音量・周波数・波形解析
- Three.js / WebGLを使った音声反応型3Dビジュアライザー
- Wave Visualizer Mode
- 画像と2Dエフェクトで構成するImage FX Mode
- フルスクリーン、UI非表示、キーボード操作に対応したLive / VJ Mode
- パーティクル数、サイズ、形状、カメラ距離、モーフ強度の調整
- 背景、粒子、3Dオブジェクト、波形、各種エフェクトのレイヤー順変更
- WebCodecsおよびffmpeg.wasmを利用したMP4書き出し

## 使用技術

- React
- TypeScript
- Vite
- Three.js / WebGL
- Web Audio API
- Material UI / Emotion
- Zustand
- Cloudflare Workers Static Assets

## ローカルでの起動

```bash
npm install
npm run dev
```

本番ビルド:

```bash
npm run build
```

## MP4書き出しについて

対応ブラウザではWebCodecsを優先し、利用できない場合はffmpeg.wasmへフォールバックします。ffmpegのローカルアセットが利用できないデプロイ環境では、jsDelivrから読み込みます。

音声ファイルや背景画像の処理、映像の生成はブラウザ内で行われます。

## GitHub Packagesの依存関係

このリポジトリでは、`@7g3n/*` スコープのnpmパッケージをGitHub Packagesから取得するように `.npmrc` を設定しています。

GitHubでPersonal Access Tokenを作成し、`read:packages` 権限を付与してください。非公開リポジトリに関連付けられたパッケージを使う場合は、リポジトリを読み取れる権限も必要です。

PowerShellでトークンをユーザーのnpm設定へ登録します。

```powershell
$env:NODE_AUTH_TOKEN = "YOUR_GITHUB_TOKEN"
npm config set "//npm.pkg.github.com/:_authToken" "$env:NODE_AUTH_TOKEN" --location=user
```

パッケージは通常のnpm依存関係と同様に追加できます。

```bash
npm install @7g3n/PACKAGE_NAME
```

トークンはリポジトリ内の `.npmrc` や `package.json` に直接記載しないでください。

---

## English

An open-source browser-based Audio Reactive 3D Visualizer for musicians, vocal synth producers, and independent creators.

This project allows users to generate MV-style audio-reactive visuals from their own music and artwork using modern web technologies such as React, TypeScript, Three.js, WebGL, Web Audio API, and Cloudflare Workers Static Assets.

## Overview

Audio Reactive 3D Visualizer is a creative web tool built to help independent musicians create visual content for their music without needing expensive music video production resources.

The tool analyzes audio in real time and reflects the sound into 3D objects, waveforms, glitch effects, image effects, and other visual modes. It is designed for use cases such as:

* Music visualizers
* MV-style promotional videos
* Short-form social media clips
* Vocal synth / Vocaloid original song visuals
* Audio-reactive artwork
* Visual direction mockups for music videos

This project was created from a real problem I faced as an independent musician: producing music videos can be expensive, and communicating detailed visual ideas to another creator can be difficult.
I wanted a tool that allows musicians to create visual content directly from their own songs and artwork.

## Features

* Audio-reactive 3D visualization
* Real-time audio analysis using Web Audio API
* Three.js / WebGL-based visual rendering
* Waveform-style visual modes
* Image FX modes using uploaded artwork
* Glitch / noise / experimental visual effects
* Live / VJ mode with fullscreen and keyboard controls
* Browser-based 1920x1080 MP4 export
* Adjustable particles, camera distance, morphing, and layer order
* Designed for independent music creators

## Tech Stack

* React
* TypeScript
* Vite
* Three.js
* WebGL
* Web Audio API
* Canvas
* Material UI / Emotion
* Zustand
* WebCodecs
* ffmpeg.wasm
* Cloudflare Workers Static Assets
* Git / GitHub

## Motivation

As an independent musician, I often felt that creating a full music video was difficult because of cost, communication, and production barriers.

Even when working with other creators, it can be hard to explain the exact visual atmosphere, timing, or emotional tone I want for a song.

This project was built to lower that barrier.

The goal is not to replace full music video production, but to provide a practical creative tool that helps artists quickly create:

* Simple MV-style videos
* Audio-reactive visuals
* Promotional clips
* Visual references
* Demo visuals for unreleased songs

## Real-world Usage

This visualizer has already been used in an actual creative workflow.

I used it to create and publish a music video for an original vocal synth song featuring Kasane Teto SV.

Related posts about the project have received a cumulative total of over 2,067 likes on X, showing clear public interest in accessible audio-reactive visual tools for music creators.

## Use Cases

This project may be useful for:

* Independent musicians
* Vocaloid / Vocal synth producers
* Electronic music producers
* Video creators
* Creative coders
* Music visual designers
* Artists who need quick promotional visuals
* Developers interested in Web Audio API and WebGL

## Project Goals

The long-term goals of this project are:

* Improve audio analysis accuracy
* Add more visual modes and presets
* Improve rendering performance
* Improve UI/UX for musicians
* Add better export workflows
* Improve documentation
* Make the project easier for contributors to join
* Support more creative workflows for independent artists

## Roadmap

Planned improvements include:

* More audio-reactive visual presets
* Better waveform and spectrum visualization
* Improved 3D object customization
* Image-based visual effects
* Better performance optimization
* Export workflow improvements
* Preset saving / loading
* Documentation for contributors
* Example projects and templates

## Why Open Source?

This project is open source because audio-reactive visual creation should be more accessible to independent creators.

Many musicians do not have the budget to commission full-scale music videos for every release.
By making this tool open source, other creators and developers can improve it, adapt it, and use it for their own creative workflows.

Open-source collaboration can help improve:

* Audio analysis
* Rendering performance
* Visual design
* UI/UX
* Accessibility
* Documentation
* Deployment
* Export features

## Development

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

### GitHub Packages dependencies

The project-level `.npmrc` resolves packages under the `@7g3n/*` scope from GitHub Packages.

Create a GitHub Personal Access Token with `read:packages`, then store it in your user-level npm configuration:

```powershell
$env:NODE_AUTH_TOKEN = "YOUR_GITHUB_TOKEN"
npm config set "//npm.pkg.github.com/:_authToken" "$env:NODE_AUTH_TOKEN" --location=user
```

Install a package normally:

```bash
npm install @7g3n/PACKAGE_NAME
```

Never commit an authentication token to the repository.

Deploy with Cloudflare Workers Static Assets or another static hosting platform.

## Contributing

Contributions are welcome.

Possible contribution areas:

* New visual modes
* UI/UX improvements
* Performance optimization
* Bug fixes
* Documentation
* Accessibility improvements
* Audio analysis improvements
* Export workflow improvements

Before making large changes, please open an issue or discussion first.

## License

This project is licensed under the MIT License.

## Author

Created by Nagisa Dozono (TRAJECTORIES).

Music producer / independent creator exploring the intersection of music production, audio-reactive visuals, Web Audio API, Three.js, and creative web tools.

## Links

* Demo: https://waveform.tranjectories.xyz/
* Music Video Example: https://www.youtube.com/watch?v=R8ItWr2V_ZA
* X / Twitter:
  * https://x.com/nagisa7g/status/2061390154967978117
  * https://x.com/nagisa7g/status/2059545274310344726
* Repository: https://github.com/7g3n/phase-viz/
