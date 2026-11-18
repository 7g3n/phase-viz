# Contributing

Thank you for helping improve phase-viz.

## Before You Start

- Search existing issues before opening a new one.
- Use the issue templates for bug reports and feature requests.
- Open an issue before starting a large behavioral or architectural change.
- Keep changes focused and avoid unrelated refactors.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Local Development

Prerequisites: a current Node.js LTS release and npm.

```bash
git clone https://github.com/7g3n/phase-viz.git
cd phase-viz
npm ci
npm run dev
```

The project-level `.npmrc` reserves the `@7g3n` scope for GitHub Packages. The current dependency set is public and does not require a repository token.

## Validation

Run the checks that apply to your change:

```bash
npm run lint
npm test
npm run build
```

The build command runs the TypeScript project build before creating the Vite production bundle.

`npm test` runs the audio-analysis and export-utility unit tests once without watch mode, so it is suitable for CI. For visual or interaction changes, describe the browsers, modes, and files you tested manually in the pull request.

## Architecture Contributions

phase-viz is moving toward a reusable browser-native audio visual engine. The current app remains the compatibility layer, so architectural contributions should be incremental and easy to review.

- Add new visual experiments under `src/modes/<modeName>/`.
- Use `VisualModeDefinition` and `RenderContext` from `src/engine/visual/` for new mode contracts.
- Consume normalized `AudioFrame` data from `src/engine/audio/` instead of coupling new render code directly to global app state.
- Keep JSON-shareable preset data aligned with `PhaseVizPreset` in `src/engine/preset/`.
- Keep Zustand changes inside the relevant `src/state/*Slice.ts` file and preserve the compatibility exports from `src/store.ts`.
- Keep export behavior browser-native and cancellation-aware.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [src/modes/exampleMinimal](src/modes/exampleMinimal/README.md) for the current direction.

## Pull Requests

1. Create a branch from `main`.
2. Make a focused change with clear commit messages.
3. Run lint and build locally.
4. Update documentation when behavior or contributor workflows change.
5. Complete the pull request template, including validation and screenshots for visual changes.

By submitting a contribution, you agree that it will be licensed under the project's MIT License.

## Reporting Security Issues

Do not disclose a vulnerability in a public issue. Follow [SECURITY.md](SECURITY.md) instead.
