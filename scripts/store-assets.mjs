import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const sourceDir = path.join(root, 'docs', 'screenshots');
const outputDir = path.join(root, 'docs', 'store', 'screenshots-1280x800');

const screenshots = ['list', 'filter', 'process', 'link-dialog', 'bulk', 'options'];

await mkdir(outputDir, { recursive: true });

for (const name of screenshots) {
  const source = path.join(sourceDir, `${name}.png`);
  const output = path.join(outputDir, `${name}-1280x800.png`);
  await sharp(source)
    .resize(1280, 800, { fit: 'cover', position: 'top' })
    .png()
    .toFile(output);
  console.log(`store screenshot: ${path.relative(root, output)}`);
}

const popup = await sharp(path.join(sourceDir, 'popup.png')).resize({ width: 380 }).png().toBuffer();
const popupBackground = sharp({
  create: { width: 1280, height: 800, channels: 3, background: '#eef4fb' },
}).png();
await popupBackground
  .composite([{ input: popup, left: 450, top: 80 }])
  .png()
  .toFile(path.join(outputDir, 'popup-1280x800.png'));

const icon = await readFile(path.join(root, 'public', 'icon-128.png'));
const iconData = icon.toString('base64');
const bannerSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0ea5e9"/>
      <stop offset="1" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect width="440" height="280" rx="18" fill="url(#bg)"/>
  <image href="data:image/png;base64,${iconData}" x="34" y="74" width="132" height="132"/>
  <text x="188" y="126" font-family="Segoe UI, Arial, sans-serif" font-size="35" font-weight="700" fill="#ffffff">SEI Flow</text>
  <text x="190" y="158" font-family="Segoe UI, Arial, sans-serif" font-size="17" fill="#dbeafe">Trello dentro do SEI</text>
  <text x="190" y="184" font-family="Segoe UI, Arial, sans-serif" font-size="13" fill="#bfdbfe">Prazos, etiquetas e checklist</text>
</svg>`;
await sharp(Buffer.from(bannerSvg))
  .png()
  .toFile(path.join(root, 'docs', 'store', 'banner-440x280.png'));
console.log('store banner: docs/store/banner-440x280.png');
