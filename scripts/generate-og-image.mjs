import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function generateOgImage() {
  const svgPath = path.resolve('public/og-image.svg');
  const pngPath = path.resolve('public/og-image.png');
  const svgBuffer = fs.readFileSync(svgPath);

  await sharp(svgBuffer, { density: 150 })
    .resize(1200, 630, {
      fit: 'cover',
      position: 'center',
    })
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      quality: 90,
    })
    .toFile(pngPath);

  const stats = fs.statSync(pngPath);
  const metadata = await sharp(pngPath).metadata();
  console.log(`Generated ${pngPath}`);
  console.log(`Dimensions: ${metadata.width}x${metadata.height}`);
  console.log(`Format: ${metadata.format}`);
  console.log(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
}

generateOgImage().catch((err) => {
  console.error('Error generating OG image:', err);
  process.exit(1);
});
