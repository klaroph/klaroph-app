/**
 * Export KlaroPH logo as a square PNG for Google OAuth branding.
 * Uses public/logo-klaroph-blue.png (exact brand colors), centers it on a
 * square canvas with white or transparent background.
 *
 * Usage: node scripts/export-oauth-logo.mjs [--transparent]
 * Output: public/logo-klaroph-oauth.png (512x512, ≥120px minimum)
 */

import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcPath = path.join(root, 'public', 'logo-klaroph-blue.png');
const outPath = path.join(root, 'public', 'logo-klaroph-oauth.png');

const SIZE = 512;
const LOGO_MAX = 400; // logo fits inside this (padding)

const transparent = process.argv.includes('--transparent');

if (!fs.existsSync(srcPath)) {
  console.error('Source logo not found: public/logo-klaroph-blue.png');
  console.error('Add the KlaroPH blue logo to public/ and run again.');
  process.exit(1);
}

const logo = sharp(srcPath);
const meta = await logo.metadata();
const w = meta.width ?? 1;
const h = meta.height ?? 1;
const scale = Math.min(LOGO_MAX / w, LOGO_MAX / h, 1);
const targetW = Math.round(w * scale);
const targetH = Math.round(h * scale);

const resizedLogo = await sharp(srcPath)
  .resize(targetW, targetH, { fit: 'inside' })
  .png()
  .toBuffer();

const background = transparent
  ? { r: 0, g: 0, b: 0, alpha: 0 }
  : { r: 255, g: 255, b: 255, alpha: 1 };

const canvas = sharp({
  create: {
    width: SIZE,
    height: SIZE,
    channels: transparent ? 4 : 3,
    background,
  },
})
  .png()
  .composite([{ input: resizedLogo, gravity: 'center' }]);

await canvas.toFile(outPath);

console.log(`Written: public/logo-klaroph-oauth.png (${SIZE}x${SIZE}, ${transparent ? 'transparent' : 'white'} background)`);
