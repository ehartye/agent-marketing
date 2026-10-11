import { crc32, deflateSync } from "node:zlib";

// Tiny, valid-enough image files built in memory, so tests need no binary fixtures. `seed` changes
// the pixels (and so the hash) without changing the size.
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
export function png(width = 4, height = 3, seed = 0) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  const rows = Buffer.alloc((width + 1) * height, seed & 0xff);
  for (let y = 0; y < height; y++) rows[y * (width + 1)] = 0; // filter type none
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
// SOI, a JFIF header, a start-of-frame segment with the size, EOI. Not decodable, but a real header.
export function jpeg(width = 5, height = 7, seed = 0) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x01, 0x01, 0x11, 0x00]);
  const comment = Buffer.from([0xff, 0xfe, 0x00, 0x03, seed & 0xff]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, comment, sof, Buffer.from([0xff, 0xd9])]);
}
export function gif(width = 6, height = 2, seed = 0) {
  const head = Buffer.alloc(13);
  head.write("GIF89a", 0, "latin1");
  head.writeUInt16LE(width, 6);
  head.writeUInt16LE(height, 8);
  return Buffer.concat([head, Buffer.from([seed & 0xff, 0x3b])]);
}
// A WebP in one of its three layouts: "VP8X" (extended), "VP8L" (lossless) or "VP8 " (lossy).
export function webp(width = 8, height = 9, layout = "VP8X", seed = 0) {
  let body;
  if (layout === "VP8X") {
    body = Buffer.alloc(10);
    body.writeUIntLE(width - 1, 4, 3);
    body.writeUIntLE(height - 1, 7, 3);
  } else if (layout === "VP8L") {
    body = Buffer.alloc(5);
    body[0] = 0x2f;
    body.writeUInt32LE((width - 1) | ((height - 1) << 14), 1);
  } else {
    body = Buffer.alloc(10);
    body.set([0x9d, 0x01, 0x2a], 3);
    body.writeUInt16LE(width, 6);
    body.writeUInt16LE(height, 8);
  }
  body = Buffer.concat([body, Buffer.from([seed & 0xff])]); // trailing byte: changes the hash, not the size
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length, 0);
  const inner = Buffer.concat([Buffer.from("WEBP" + layout, "latin1"), size, body]);
  const total = Buffer.alloc(4);
  total.writeUInt32LE(inner.length, 0);
  return Buffer.concat([Buffer.from("RIFF", "latin1"), total, inner]);
}
export const pdf = (seed = 0) => Buffer.from(`%PDF-1.4\n% ${seed}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);
export const mp4 = (seed = 0) => Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from("ftypisom", "latin1"), Buffer.from([0, 0, 2, 0]), Buffer.from("isom", "latin1"), Buffer.from([seed & 0xff])]);
export const webm = (seed = 0) => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x84, 0x42, 0x82, 0x84]), Buffer.from("webm", "latin1"), Buffer.from([seed & 0xff])]);
