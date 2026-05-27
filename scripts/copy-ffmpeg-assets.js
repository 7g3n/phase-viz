import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const FFMPEG_CORE_PACKAGE = '@ffmpeg/core';
const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
// Prefer UMD build for worker importScripts compatibility, fallback to ESM if UMD missing
let srcDir = path.join(root, 'node_modules', FFMPEG_CORE_PACKAGE, 'dist', 'umd');
if (!fs.existsSync(srcDir)) {
  srcDir = path.join(root, 'node_modules', FFMPEG_CORE_PACKAGE, 'dist', 'esm');
}
const destDir = path.join(root, 'public', 'vendor');

function fail(msg) {
  console.error(msg);
  process.exitCode = 1;
}

try {
  if (!fs.existsSync(srcDir)) fail(`Source directory not found: ${srcDir}`);
  fs.mkdirSync(destDir, { recursive: true });

  let missing = false;
  for (const file of files) {
    const src = path.join(srcDir, file);
    const dest = path.join(destDir, file);
    if (!fs.existsSync(src)) {
      console.error(`Missing file in ${srcDir}: ${file}`);
      missing = true;
      continue;
    }
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file} -> public/vendor/${file}`);
  }

  if (missing) fail('Some files were missing and were not copied.');
} catch (err) {
  fail(`Error copying ffmpeg assets: ${err.message}`);
}
