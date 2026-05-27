import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const vendorDir = path.join(root, 'public', 'vendor');

const accountId = process.env.R2_ACCOUNT_ID;
const bucket = process.env.R2_BUCKET;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const prefix = process.env.R2_PREFIX || '';

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
  fail(
    'Missing one or more required environment variables: R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY',
  );
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  forcePathStyle: false,
});

const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];

async function upload(fileName) {
  const key = path.posix.join(prefix, fileName);
  const filePath = path.join(vendorDir, fileName);
  if (!fs.existsSync(filePath)) {
    fail(`Missing local asset: ${filePath}`);
  }

  const body = fs.createReadStream(filePath);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: fileName.endsWith('.wasm') ? 'application/wasm' : 'application/javascript',
  });

  await client.send(command);
  console.log(`Uploaded ${fileName} -> ${bucket}/${key}`);
}

(async () => {
  try {
    for (const file of files) {
      await upload(file);
    }
    console.log('R2 upload complete.');
  } catch (err) {
    fail(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
  }
})();
