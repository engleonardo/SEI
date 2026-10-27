import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const publicDir = path.join(root, 'public');
const source = path.join(root, 'docs', 'brand', 'sei-flow.svg');
const sizes = [16, 32, 48, 128];

const logo = await readFile(source);

await mkdir(publicDir, { recursive: true });
for (const size of sizes) {
  const buffer = await sharp(logo, { density: 384 })
    .resize(size, size)
    .png()
    .toBuffer();
  await sharp(buffer).toFile(path.join(publicDir, `icon-${size}.png`));
  console.log(`generated public/icon-${size}.png from docs/brand/sei-flow.svg`);
}
