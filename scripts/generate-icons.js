import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

/**
 * Creates a valid uncompressed/compressed PNG image buffer with custom pixel drawing
 */
function createPng(width, height, drawFn) {
  // RGBA buffer: (width * 4 + 1 filter byte) per row
  const rowBytes = width * 4 + 1;
  const rawData = Buffer.alloc(rowBytes * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    rawData[rowOffset] = 0; // Filter type 0 (None)

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth: 8
  ihdrData[9] = 6; // Color type: 6 (RGBA)
  ihdrData[10] = 0; // Compression: 0
  ihdrData[11] = 0; // Filter: 0
  ihdrData[12] = 0; // Interlace: 0

  const ihdrChunk = createChunk('IHDR', ihdrData);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = data.length;
  const buffer = Buffer.alloc(8 + length + 4);
  buffer.writeUInt32BE(length, 0);
  buffer.write(type, 4, 4, 'ascii');
  data.copy(buffer, 8);

  const crc = crc32(buffer.subarray(4, 8 + length));
  buffer.writeUInt32BE(crc >>> 0, 8 + length);
  return buffer;
}

// Standard CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Distance helper
function dist(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

// Line segment distance helper
function distToSegment(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return dist(px, py, x1, y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, x1 + t * (x2 - x1), y1 + t * (y2 - y1));
}

function drawBrandIcon(isMaskable) {
  return (x, y, w, h) => {
    const scale = w / 512;
    const cx = w / 2;
    const cy = h / 2;

    // Background
    let bgR = 15, bgG = 23, bgB = 42, bgA = 255; // #0f172a Dark Slate

    if (!isMaskable) {
      // Rounded corner squircle
      const r = 110 * scale;
      const dx = Math.max(Math.abs(x - cx) - (cx - r), 0);
      const dy = Math.max(Math.abs(y - cy) - (cy - r), 0);
      const dCorner = Math.hypot(dx, dy);
      if (dCorner > r) {
        return [0, 0, 0, 0]; // Transparent outside squircle
      }
    }

    // Nodes definition: 3 share nodes
    // Center node 1: top-right, Node 2: left-center, Node 3: bottom-right
    const n1 = { x: cx + 70 * scale, y: cy - 90 * scale, r: 42 * scale };
    const n2 = { x: cx - 110 * scale, y: cy, r: 42 * scale };
    const n3 = { x: cx + 70 * scale, y: cy + 90 * scale, r: 42 * scale };

    const lineThick = 24 * scale;

    // Distance to lines
    const dLine1 = distToSegment(x, y, n2.x, n2.y, n1.x, n1.y);
    const dLine2 = distToSegment(x, y, n2.x, n2.y, n3.x, n3.y);

    const dNode1 = dist(x, y, n1.x, n1.y);
    const dNode2 = dist(x, y, n2.x, n2.y);
    const dNode3 = dist(x, y, n3.x, n3.y);

    const isInsideLine = dLine1 <= lineThick / 2 || dLine2 <= lineThick / 2;
    const isInsideNode = dNode1 <= n1.r || dNode2 <= n2.r || dNode3 <= n3.r;

    // Soft glow effect around nodes
    const minGlowDist = Math.min(
      Math.max(0, dNode1 - n1.r),
      Math.max(0, dNode2 - n2.r),
      Math.max(0, dNode3 - n3.r)
    );

    if (isInsideNode || isInsideLine) {
      // Rose Vibrant gradient (#f43f5e to #e11d48)
      const gradT = y / h;
      const r = Math.round(244 * (1 - gradT) + 225 * gradT);
      const g = Math.round(63 * (1 - gradT) + 29 * gradT);
      const b = Math.round(94 * (1 - gradT) + 72 * gradT);
      return [r, g, b, 255];
    }

    if (minGlowDist < 60 * scale) {
      const glowAlpha = (1 - minGlowDist / (60 * scale)) * 0.35;
      const r = Math.round(bgR + (244 - bgR) * glowAlpha);
      const g = Math.round(bgG + (63 - bgG) * glowAlpha);
      const b = Math.round(bgB + (94 - bgB) * glowAlpha);
      return [r, g, b, 255];
    }

    return [bgR, bgG, bgB, bgA];
  };
}

const publicDir = path.resolve(process.cwd(), 'public');

// 1. pwa-192x192.png
const pwa192 = createPng(192, 192, drawBrandIcon(false));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), pwa192);

// 2. pwa-512x512.png
const pwa512 = createPng(512, 512, drawBrandIcon(false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), pwa512);

// 3. pwa-maskable-512x512.png
const pwaMaskable512 = createPng(512, 512, drawBrandIcon(true));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), pwaMaskable512);

// 4. apple-touch-icon.png (180x180)
const appleIcon = createPng(180, 180, drawBrandIcon(false));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), appleIcon);

console.log('All PWA PNG icons generated successfully!');
