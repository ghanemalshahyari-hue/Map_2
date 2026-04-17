/**
 * Generates build/icon.ico and build/icon.png from a source image.
 * Usage: node scripts/make-icon.js <path-to-source-image>
 */
const Jimp = require('jimp');
const pngToIco = require('png-to-ico');
const path = require('path');
const fs = require('fs');

const SIZES = [16, 32, 48, 64, 128, 256];
const BUILD_DIR = path.join(__dirname, '..', 'build');

async function main() {
  const src = process.argv[2];
  if (!src) {
    console.error('Usage: node scripts/make-icon.js <source-image>');
    process.exit(1);
  }

  const srcPath = path.resolve(src);
  if (!fs.existsSync(srcPath)) {
    console.error('Source image not found:', srcPath);
    process.exit(1);
  }

  console.log('Reading source:', srcPath);
  const image = await Jimp.read(srcPath);
  const { width, height } = image.bitmap;
  console.log(`Source size: ${width}x${height}`);

  // Center-crop to square
  const side = Math.min(width, height);
  const offsetX = Math.floor((width - side) / 2);
  const offsetY = Math.floor((height - side) / 2);
  if (width !== height) {
    console.log(`Cropping to ${side}x${side} (offset ${offsetX},${offsetY})`);
    image.crop(offsetX, offsetY, side, side);
  }

  // Ensure build/ exists
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  // Generate PNG buffers at each size
  const buffers = [];
  for (const size of SIZES) {
    const resized = image.clone().resize(size, size, Jimp.RESIZE_BICUBIC);
    const buf = await resized.getBufferAsync(Jimp.MIME_PNG);
    buffers.push(buf);
    console.log(`  Generated ${size}x${size} PNG (${buf.length} bytes)`);
  }

  // Write 256x256 PNG
  const png256 = buffers[buffers.length - 1];
  const pngPath = path.join(BUILD_DIR, 'icon.png');
  fs.writeFileSync(pngPath, png256);
  console.log('Wrote:', pngPath);

  // Combine into ICO
  const icoBuffer = await pngToIco(buffers);
  const icoPath = path.join(BUILD_DIR, 'icon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  console.log('Wrote:', icoPath);

  console.log('Done!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
