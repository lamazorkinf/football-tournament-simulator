// Genera los íconos PWA pixel-art (trofeo retro) sin dependencias externas.
// Uso: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const NIGHT = [10, 12, 18];
const PALETTE = {
  '.': NIGHT,            // fondo
  G: [255, 210, 63],     // gold
  D: [122, 43, 14],      // sombra
  W: [255, 255, 255],    // blanco
  L: [47, 191, 95],      // line
};

// Trofeo 16x16
const ART = [
  '................',
  '..WWWWWWWWWWWW..',
  '..WGGGGGGGGGGW..',
  '.LWGGGGGGGGGGWL.',
  '.LWGGGGGGGGGGWL.',
  '..WGGGGGGGGGGW..',
  '..WGGGGGGGGGGW..',
  '...WGGGGGGGGW...',
  '....WGGGGGGW....',
  '.....WGGGGW.....',
  '......WGGW......',
  '......WGGW......',
  '.....WGGGGW.....',
  '....WGGGGGGW....',
  '...WGGDDDDGGW...',
  '................',
];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixelAt) {
  // pixelAt(x, y) -> [r, g, b]
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filtro None
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixelAt(x, y);
      const off = y * (size * 3 + 1) + 1 + x * 3;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function renderIcon(size, artScaleRatio) {
  // artScaleRatio: fracción del lado que ocupa el arte (1 = borde a borde)
  const artPx = Math.floor((size * artScaleRatio) / 16) * 16;
  const scale = artPx / 16;
  const offset = Math.floor((size - artPx) / 2);
  return encodePng(size, (x, y) => {
    const ax = Math.floor((x - offset) / scale);
    const ay = Math.floor((y - offset) / scale);
    if (ax < 0 || ax > 15 || ay < 0 || ay > 15) return NIGHT;
    return PALETTE[ART[ay][ax]];
  });
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', renderIcon(192, 1));
writeFileSync('public/icons/icon-512.png', renderIcon(512, 1));
// maskable: el arte ocupa el 60% central (zona segura del 80%)
writeFileSync('public/icons/icon-maskable-512.png', renderIcon(512, 0.6));
writeFileSync('public/icons/apple-touch-icon.png', renderIcon(180, 0.85));
console.log('✅ Íconos generados en public/icons/');
