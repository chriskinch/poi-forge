/** Minimal PNG reader: 8-bit RGB or RGBA, no interlace. Enough for tile sheets. */
import { inflateSync } from "node:zlib";
import type { Raster } from "../src/core/raster";

export function decodePng(file: Buffer): Raster {
    if (file.readUInt32BE(0) !== 0x89504e47) throw new Error("Not a PNG");
    let width = 0;
    let height = 0;
    let channels = 4;
    const data: Buffer[] = [];
    for (let at = 8; at + 12 <= file.length;) {
        const length = file.readUInt32BE(at);
        const type = file.toString("ascii", at + 4, at + 8);
        const body = file.subarray(at + 8, at + 8 + length);
        if (type === "IHDR") {
            width = body.readUInt32BE(0);
            height = body.readUInt32BE(4);
            const [depth, color, , , interlace] = body.subarray(8);
            if (depth !== 8 || (color !== 6 && color !== 2) || interlace) {
                throw new Error("Only 8-bit RGB(A), non-interlaced PNGs are supported");
            }
            channels = color === 6 ? 4 : 3;
        } else if (type === "IDAT") data.push(body);
        else if (type === "IEND") break;
        at += 12 + length;
    }
    const raw = inflateSync(Buffer.concat(data));
    const stride = width * channels;
    const pixels = new Uint8Array(height * stride);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)]!;
        const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        for (let x = 0; x < stride; x++) {
            const left = x >= channels ? pixels[y * stride + x - channels]! : 0;
            const up = y ? pixels[(y - 1) * stride + x]! : 0;
            const corner = y && x >= channels ? pixels[(y - 1) * stride + x - channels]! : 0;
            let predicted = 0;
            if (filter === 1) predicted = left;
            else if (filter === 2) predicted = up;
            else if (filter === 3) predicted = (left + up) >> 1;
            else if (filter === 4) {
                const p = left + up - corner;
                const pa = Math.abs(p - left);
                const pb = Math.abs(p - up);
                const pc = Math.abs(p - corner);
                predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
            }
            pixels[y * stride + x] = (line[x]! + predicted) & 255;
        }
    }
    if (channels === 4) return { width, height, data: pixels };
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        rgba.set(pixels.subarray(i * 3, i * 3 + 3), i * 4);
        rgba[i * 4 + 3] = 255;
    }
    return { width, height, data: rgba };
}
