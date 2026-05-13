import { readFile, writeFile } from "node:fs/promises";
import { deflateSync, inflateSync } from "node:zlib";

const target = new URL("../assets/noda-player.png", import.meta.url);

function crc32(buffer) {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }

  let c = 0xffffffff;
  for (const byte of buffer) {
    c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return output;
}

function parsePng(buffer) {
  let position = 8;
  const chunks = [];
  while (position < buffer.length) {
    const length = buffer.readUInt32BE(position);
    const type = buffer.slice(position + 4, position + 8).toString("ascii");
    const data = buffer.slice(position + 8, position + 8 + length);
    chunks.push({ type, data });
    position += 12 + length;
    if (type === "IEND") break;
  }
  return chunks;
}

function unfilter(raw, width, height, bytesPerPixel) {
  const stride = width * bytesPerPixel;
  const output = Buffer.alloc(stride * height);
  let position = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[position];
    position += 1;
    const rowStart = y * stride;
    const prevStart = rowStart - stride;

    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? output[rowStart + x - bytesPerPixel] : 0;
      const up = y > 0 ? output[prevStart + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? output[prevStart + x - bytesPerPixel] : 0;
      let predict = 0;

      if (filter === 1) predict = left;
      else if (filter === 2) predict = up;
      else if (filter === 3) predict = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const pa = Math.abs(up - upLeft);
        const pb = Math.abs(left - upLeft);
        const pc = Math.abs(left + up - 2 * upLeft);
        predict = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG filter: ${filter}`);
      }

      output[rowStart + x] = (raw[position] + predict) & 0xff;
      position += 1;
    }
  }

  return output;
}

function filterNone(rgba, width, height) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return raw;
}

const input = await readFile(target);
const chunks = parsePng(input);
const ihdr = Buffer.from(chunks.find((entry) => entry.type === "IHDR").data);
const width = ihdr.readUInt32BE(0);
const height = ihdr.readUInt32BE(4);
const bitDepth = ihdr[8];
const colorType = ihdr[9];

if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
  throw new Error(`Unsupported PNG: bitDepth=${bitDepth}, colorType=${colorType}`);
}

const bytesPerPixel = colorType === 6 ? 4 : 3;
const idat = Buffer.concat(chunks.filter((entry) => entry.type === "IDAT").map((entry) => entry.data));
const decoded = unfilter(inflateSync(idat), width, height, bytesPerPixel);
const rgba = Buffer.alloc(width * height * 4);

for (let pixel = 0; pixel < width * height; pixel += 1) {
  const sourceIndex = pixel * bytesPerPixel;
  const targetIndex = pixel * 4;
  rgba[targetIndex] = decoded[sourceIndex];
  rgba[targetIndex + 1] = decoded[sourceIndex + 1];
  rgba[targetIndex + 2] = decoded[sourceIndex + 2];
  rgba[targetIndex + 3] = colorType === 6 ? decoded[sourceIndex + 3] : 255;
}

function isBackgroundLike(pixel) {
  const index = pixel * 4;
  const r = rgba[index];
  const g = rgba[index + 1];
  const b = rgba[index + 2];
  const a = rgba[index + 3];
  if (a === 0) return true;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const neutral = max - min < 22;
  const nearWhite = r > 236 && g > 236 && b > 236;
  const nearGray = r > 210 && g > 210 && b > 210 && r < 246 && g < 246 && b < 246;
  return a > 230 && neutral && (nearWhite || nearGray);
}

const totalPixels = width * height;
const visited = new Uint8Array(totalPixels);
const queue = [];

function enqueue(x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const pixel = y * width + x;
  if (visited[pixel] || !isBackgroundLike(pixel)) return;
  visited[pixel] = 1;
  queue.push(pixel);
}

for (let x = 0; x < width; x += 1) {
  enqueue(x, 0);
  enqueue(x, height - 1);
}
for (let y = 0; y < height; y += 1) {
  enqueue(0, y);
  enqueue(width - 1, y);
}

for (let index = 0; index < queue.length; index += 1) {
  const pixel = queue[index];
  const x = pixel % width;
  const y = Math.floor(pixel / width);
  enqueue(x + 1, y);
  enqueue(x - 1, y);
  enqueue(x, y + 1);
  enqueue(x, y - 1);
}

let transparentPixels = 0;
for (let pixel = 0; pixel < totalPixels; pixel += 1) {
  if (!visited[pixel]) continue;
  rgba[pixel * 4 + 3] = 0;
  transparentPixels += 1;
}

ihdr[9] = 6;
const output = Buffer.concat([
  input.slice(0, 8),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(filterNone(rgba, width, height), { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

await writeFile(target, output);
console.log(JSON.stringify({ width, height, transparentPixels, outputBytes: output.length }, null, 2));
