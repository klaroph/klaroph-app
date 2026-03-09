/**
 * Generate PWA app icons: yellow hand (from white logo) on KlaroPH blue.
 * Outputs 192x192 and 512x512 for manifest; centered, strong contrast.
 *
 * Usage: node scripts/export-pwa-icons.mjs
 * Output: public/icon-192.png, public/icon-512.png
 */

import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');

// Use white logo (yellow/light hand) for contrast on blue; fallback to blue logo hand
const whitePath = path.join(publicDir, 'logo-klaroph-white.png');
const bluePath = path.join(publicDir, 'logo-klaroph-blue.png');
const srcPath = fs.existsSync(whitePath) ? whitePath : bluePath;

const KLAROPH_BLUE = { r: 0, g: 56, b: 168 };
const HAND_WIDTH_RATIO = 0.72;

if (!fs.existsSync(srcPath)) {
  console.error('Source logo not found: public/logo-klaroph-white.png or logo-klaroph-blue.png');
  process.exit(1);
}

const meta = await sharp(srcPath).metadata();
const w = meta.width ?? 1;
const h = meta.height ?? 1;
const handWidth = Math.round(h * HAND_WIDTH_RATIO);

const handBuffer = await sharp(srcPath)
  .extract({ left: 0, top: 0, width: handWidth, height: h })
  .png()
  .toBuffer();

async function writeIcon(size) {
  const resized = await sharp(handBuffer)
    .resize(size, size, { fit: 'contain' })
    .png()
    .toBuffer();

  const outPath = path.join(publicDir, `icon-${size}.png`);
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: KLAROPH_BLUE,
    },
  })
    .png()
    .composite([{ input: resized, gravity: 'center' }])
    .toFile(outPath);
  console.log(`Written: public/icon-${size}.png`);
}

await writeIcon(192);
await writeIcon(512);
console.log('PWA icons ready (hand on KlaroPH blue).');
