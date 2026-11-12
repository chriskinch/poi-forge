/** Minimal PNG writer: 8-bit RGBA, no interlace. Enough for generated sheets. */
import { crc32, deflateSync } from "node:zlib";

function chunk(type: string, data: Buffer): Buffer {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header.set([8, 6, 0, 0, 0], 8);
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 4 + 1)] = 0;
        raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", header),
        chunk("IDAT", deflateSync(raw, { level: 9 })),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}
