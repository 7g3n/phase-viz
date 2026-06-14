# Contributing

Thank you for helping improve Audio Reactive 3D Visualizer.

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
npm run build
```

The build command runs the TypeScript project build before creating the Vite production bundle.

There is not yet an automated test suite. For visual or interaction changes, describe the browsers, modes, and files you tested manually in the pull request.

## Pull Requests

1. Create a branch from `main`.
2. Make a focused change with clear commit messages.
3. Run lint and build locally.
4. Update documentation when behavior or contributor workflows change.
5. Complete the pull request template, including validation and screenshots for visual changes.

By submitting a contribution, you agree that it will be licensed under the project's MIT License.

## Reporting Security Issues

Do not disclose a vulnerability in a public issue. Follow [SECURITY.md](SECURITY.md) instead.
