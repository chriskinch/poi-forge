/** Pixel queries on a decoded sheet image. No DOM: works on raw RGBA. */
import { tileRect } from "./tileset";
import type { TiledTileset } from "./tiled";

export interface Raster {
    width: number;
    height: number;
    /** RGBA, row-major. */
    data: Uint8ClampedArray | Uint8Array;
}

const ALPHA_MIN = 8;

export const alphaAt = (raster: Raster, x: number, y: number): number =>
    x < 0 || y < 0 || x >= raster.width || y >= raster.height
        ? 0
        : raster.data[(y * raster.width + x) * 4 + 3]!;

export const opaque = (raster: Raster, x: number, y: number): boolean =>
    alphaAt(raster, x, y) >= ALPHA_MIN;

/** Number of visible pixels in a tile. */
export function tileCoverage(raster: Raster, def: TiledTileset, id: number): number {
    const { x, y, w, h } = tileRect(def, id);
    let count = 0;
    for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) if (opaque(raster, px, py)) count++;
    }
    return count;
}

export const isBlankTile = (raster: Raster, def: TiledTileset, id: number): boolean =>
    tileCoverage(raster, def, id) === 0;

/** Every tile's coverage, indexed by tile id. */
export function coverageMap(raster: Raster, def: TiledTileset): Uint16Array {
    const out = new Uint16Array(def.tilecount);
    for (let id = 0; id < def.tilecount; id++) out[id] = tileCoverage(raster, def, id);
    return out;
}

/**
 * Whether the art of tile `id` runs into its right (`dx` 1) or lower (`dy` 1)
 * neighbour: some visible pixel on the shared edge faces a visible pixel
 * (straight or diagonal) on the other side.
 */
export function touches(raster: Raster, def: TiledTileset, id: number, dx: 0 | 1, dy: 0 | 1) {
    const { x, y, w, h } = tileRect(def, id);
    if (dx) {
        const ex = x + w - 1;
        const nx = x + w + def.spacing;
        for (let py = y; py < y + h; py++) {
            if (!opaque(raster, ex, py)) continue;
            for (let d = -1; d <= 1; d++) {
                const ny = py + d;
                if (ny >= y && ny < y + h && opaque(raster, nx, ny)) return true;
            }
        }
        return false;
    }
    if (dy) {
        const ey = y + h - 1;
        const ny = y + h + def.spacing;
        for (let px = x; px < x + w; px++) {
            if (!opaque(raster, px, ey)) continue;
            for (let d = -1; d <= 1; d++) {
                const nx = px + d;
                if (nx >= x && nx < x + w && opaque(raster, nx, ny)) return true;
            }
        }
    }
    return false;
}
