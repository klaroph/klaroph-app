/**
 * Extract the hand-only icon from the KlaroPH logo (left portion of the image).
 * The full logo is [hand | text]; this crops the left square for icon use.
 *
 * Usage: node scripts/export-hand-icon.mjs
 * Output: public/logo-klaroph-hand.png
 */

import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcPath = path.join(root, 'public', 'logo-klaroph-blue.png');
const outPath = path.join(root, 'public', 'logo-klaroph-hand.png');

if (!fs.existsSync(srcPath)) {
  console.error('Source logo not found: public/logo-klaroph-blue.png');
  process.exit(1);
}

const meta = await sharp(srcPath).metadata();
const w = meta.width ?? 1;
const h = meta.height ?? 1;
// Hand only: take left portion (no K). Wide enough for full hand (fingertips + OK circle), not so wide we get the K.
const handWidth = Math.round(h * 0.72);
const handHeight = h;

const handBuffer = await sharp(srcPath)
  .extract({ left: 0, top: 0, width: handWidth, height: handHeight })
  .png()
  .toBuffer();

// Center hand on a square canvas (transparent background)
const size = handHeight;
const canvas = sharp({
  create: {
    width: size,
    height: size,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .png()
  .composite([{ input: handBuffer, gravity: 'center' }]);

await canvas.toFile(outPath);

console.log(`Written: public/logo-klaroph-hand.png (${size}x${size}, hand only)`);
