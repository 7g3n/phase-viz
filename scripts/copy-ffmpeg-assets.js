import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const FFMPEG_CORE_PACKAGE = '@ffmpeg/core';
const requiredFiles = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];
const optionalFiles = ['ffmpeg-core.worker.js'];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
// @ffmpeg/ffmpeg loads core from a module worker, so the ESM build is required.
let srcDir = path.join(root, 'node_modules', FFMPEG_CORE_PACKAGE, 'dist', 'esm');
if (!fs.existsSync(srcDir)) {
  srcDir = path.join(root, 'node_modules', FFMPEG_CORE_PACKAGE, 'dist', 'umd');
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
  for (const file of requiredFiles) {
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

  for (const file of optionalFiles) {
    const src = path.join(srcDir, file);
    const dest = path.join(destDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`Copied ${file} -> public/vendor/${file}`);
    } else if (fs.existsSync(dest)) {
      fs.unlinkSync(dest);
      console.log(`Removed stale public/vendor/${file}`);
    }
  }

  if (missing) fail('Some files were missing and were not copied.');
} catch (err) {
  fail(`Error copying ffmpeg assets: ${err.message}`);
}
