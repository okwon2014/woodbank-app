// 외부 의존성 없이 단색 + 가운데 흰 "W" 글자 PWA 아이콘을 만든다.
// PNG 구조: signature + IHDR + IDAT(zlib deflate) + IEND.
// 베타 잠시 쓰기 위한 임시 아이콘 — 디자이너 리소스가 준비되면 교체.
//
// 사용: node scripts/make-pwa-icons.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "..", "public", "icons");
mkdirSync(OUT_DIR, { recursive: true });

// 브랜드 컬러 (manifest theme_color 와 동일)
const BG = [0x23, 0x5a, 0x3f];
const FG = [0xff, 0xff, 0xff];

// 5x7 도트 폰트의 "W" — 가운데 안전 영역(80%) 안에 넉넉히 들어가도록 8x bold.
// 1 = FG (흰색), 0 = BG (브랜드 그린).
const W_GLYPH = [
  "1 0 0 0 0 0 1",
  "1 0 0 0 0 0 1",
  "1 0 0 0 0 0 1",
  "1 0 0 1 0 0 1",
  "1 0 1 0 1 0 1",
  "1 1 0 0 0 1 1",
  "1 0 0 0 0 0 1",
].map((r) => r.split(" ").map(Number));
const GW = W_GLYPH[0].length; // 7
const GH = W_GLYPH.length;    // 7

function crc32(buf) {
  let c;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function makePng(size) {
  // 가운데에 글자를 그릴 셀 크기 — 안전영역(80%) 안에서 가장 큰 정수 셀
  const safe = Math.floor(size * 0.6);
  const cell = Math.max(1, Math.floor(safe / Math.max(GW, GH)));
  const glyphW = cell * GW;
  const glyphH = cell * GH;
  const xStart = Math.floor((size - glyphW) / 2);
  const yStart = Math.floor((size - glyphH) / 2);

  // 이미지 raw: 각 scanline 앞에 filter byte(0) + RGB 픽셀
  const stride = 1 + size * 3;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter None
    for (let x = 0; x < size; x++) {
      let r = BG[0],
        g = BG[1],
        b = BG[2];
      // 글자 영역?
      if (x >= xStart && x < xStart + glyphW && y >= yStart && y < yStart + glyphH) {
        const gx = Math.floor((x - xStart) / cell);
        const gy = Math.floor((y - yStart) / cell);
        if (W_GLYPH[gy] && W_GLYPH[gy][gx] === 1) {
          r = FG[0];
          g = FG[1];
          b = FG[2];
        }
      }
      const off = rowStart + 1 + x * 3;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
    }
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw);

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

for (const size of [192, 512]) {
  const out = resolve(OUT_DIR, `icon-${size}.png`);
  writeFileSync(out, makePng(size));
  console.log(`✓ ${out}`);
}
