/** Builds the list of tiles to draw. Pure: the canvas code just blits it. */
import { animatedTile } from "./animation";
import type { Catalog, Grid } from "./doc";
import type { ContextResult } from "./profile";
import { tileRect } from "./tileset";

export interface DrawOp {
    tileset: string;
    /** Source rectangle on the sheet. */
    sx: number;
    sy: number;
    sw: number;
    sh: number;
    /** Destination, in map pixels. */
    x: number;
    y: number;
    flags: number;
    layer: string;
}

export interface RenderLayer {
    name: string;
    grid: Grid;
}

export function drawList(
    layers: readonly RenderLayer[],
    width: number,
    tileWidth: number,
    tileHeight: number,
    catalog: Catalog,
    time: number,
): DrawOp[] {
    const ops: DrawOp[] = [];
    for (const layer of layers) {
        layer.grid.forEach((cell, i) => {
            if (!cell) return;
            const entry = catalog[cell.tileset];
            if (!entry || cell.tile >= entry.def.tilecount) return;
            const rect = tileRect(entry.def, animatedTile(entry.def, cell.tile, time));
            ops.push({
                tileset: cell.tileset,
                sx: rect.x,
                sy: rect.y,
                sw: rect.w,
                sh: rect.h,
                x: (i % width) * tileWidth,
                // Tiled anchors oversized tiles at the cell's bottom-left.
                y: (Math.floor(i / width) + 1) * tileHeight - rect.h,
                flags: cell.flags ?? 0,
                layer: layer.name,
            });
        });
    }
    return ops;
}

/**
 * Lays the map into its surroundings the way a stamp would: per layer, the
 * map's own cell wins and empty cells let the surroundings show.
 */
export function withContext(
    grids: Record<string, Grid>,
    width: number,
    height: number,
    context: ContextResult,
    order: readonly string[],
): { layers: RenderLayer[]; width: number; height: number } {
    const m = context.margin;
    const W = width + m * 2;
    const H = height + m * 2;
    const names = [...order, ...Object.keys(grids).filter((name) => !order.includes(name))];
    const layers = names.map((name) => {
        const grid: Grid = (context.layers[name] ?? new Array(W * H).fill(null)).slice();
        const own = grids[name];
        if (own) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const cell = own[y * width + x];
                    if (cell) grid[(y + m) * W + x + m] = cell;
                }
            }
        }
        return { name, grid };
    });
    return { layers, width: W, height: H };
}
