import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const FFMPEG_CORE_VERSION = '0.12.10';
const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js'];
// Prefer UMD variants first for worker importScripts compatibility
const CDN_BASES = [
  `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`,
  `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`,
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`,
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`,
  `https://app.unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/files/dist/umd`,
  `https://app.unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/files/dist/esm`,
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const destDir = path.join(root, 'public', 'vendor');

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  const buffer = await res.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buffer));
}

async function main() {
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of files) {
    const dest = path.join(destDir, file);
    let saved = false;
    for (const base of CDN_BASES) {
      const url = `${base}/${file}`;
      try {
        console.log(`Trying ${url}`);
        await download(url, dest);
        console.log(`Saved ${file} from ${url}`);
        saved = true;
        break;
      } catch (err) {
        console.warn(`Failed from ${url}: ${err.message}`);
      }
    }
    if (!saved) console.error(`Failed to download ${file} from known CDNs`);
  }
}

main().catch((err) => {
  console.error('Download failed:', err);
  process.exitCode = 1;
});
