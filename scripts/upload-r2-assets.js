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

const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js'];

async function upload(fileName) {
  const key = prefix ? `${prefix}/${fileName}` : fileName;
  const filePath = path.join(vendorDir, fileName);
  
  // Verify file exists
  if (!fs.existsSync(filePath)) {
    fail(`Missing local asset: ${filePath}`);
  }

  // Get file stats
  const stats = fs.statSync(filePath);
  console.log(`Uploading ${fileName} (${stats.size} bytes) -> ${bucket}/${key}`);

  try {
    const body = fs.createReadStream(filePath);
    const contentType = fileName.endsWith('.wasm') 
      ? 'application/wasm' 
      : 'application/javascript';

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    });

    const result = await client.send(command);
    console.log(`✓ Uploaded ${fileName}`);
    console.log(`  ETag: ${result.ETag}`);
    console.log(`  Location: s3://${bucket}/${key}`);
    return true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`✗ Upload failed for ${fileName}: ${errorMsg}`);
    throw err;
  }
}

async function verifyUpload(fileName) {
  const key = prefix ? `${prefix}/${fileName}` : fileName;
  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    const result = await client.send(command);
    const size = result.ContentLength;
    console.log(`✓ Verified ${fileName} (${size} bytes)`);
    return true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn(`⚠ Verification failed for ${fileName}: ${errorMsg}`);
    return false;
  }
}

(async () => {
  try {
    console.log(`\n📦 Uploading FFmpeg assets to R2`);
    console.log(`   Bucket: ${bucket}`);
    console.log(`   Prefix: ${prefix || '(root)'}`);
    console.log(`   Endpoint: ${accountId}.r2.cloudflarestorage.com\n`);

    // Upload files
    for (const file of files) {
      await upload(file);
    }

    // Verify uploads
    console.log(`\n✔ Verifying uploads...\n`);
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    let allVerified = true;
    for (const file of files) {
      const verified = await verifyUpload(file);
      allVerified = allVerified && verified;
    }

    if (allVerified) {
      console.log(`\n✅ R2 upload and verification complete!`);
    } else {
      console.log(`\n⚠️  Upload complete but some verifications failed.`);
    }
  } catch (err) {
    fail(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
  }
})();
