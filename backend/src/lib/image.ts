export function readImageSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 30) return null;

  // PNG: 8-byte signature, IHDR at offset 16 (big-endian width/height)
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  // JPEG: scan for a start-of-frame marker
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      const length = buffer.readUInt16BE(offset + 2);
      offset += 2 + (length || 1);
    }
    return null;
  }

  // WebP: RIFF container with VP8 / VP8L / VP8X chunk
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    const chunk = buffer.subarray(12, 16).toString("ascii");
    if (chunk === "VP8 ") {
      const width = buffer.readUInt16LE(26) & 0x3fff;
      const height = buffer.readUInt16LE(28) & 0x3fff;
      if (!width || !height) return null;
      return { width, height };
    }
    if (chunk === "VP8L") {
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") {
      return {
        width: 1 + ((buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)) >>> 0),
        height: 1 + ((buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)) >>> 0),
      };
    }
  }

  return null;
}
