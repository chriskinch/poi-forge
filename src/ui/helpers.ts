import type { Grid } from "../core/doc";
import { expand, type LibPrefab } from "../core/prefab";
import type { RenderLayer } from "../core/render";
import type { TiledTileset } from "../core/tiled";
import type { Rect, Stamp } from "./store";

/** A stamp from a rectangle of the sheet. Blank tiles are left out: erase, don't paint blanks. */
export function sheetStamp(
    tileset: string,
    def: TiledTileset,
    sel: Rect,
    coverage?: Uint16Array,
): Stamp | null {
    const cells = [];
    for (let dy = 0; dy < sel.h; dy++) {
        for (let dx = 0; dx < sel.w; dx++) {
            const tile = (sel.y + dy) * def.columns + sel.x + dx;
            if (tile >= def.tilecount || (coverage && coverage[tile] === 0)) continue;
            cells.push({ dx, dy, cell: { tileset, tile } });
        }
    }
    if (!cells.length) return null;
    const label =
        sel.w * sel.h === 1
            ? `${tileset}:${cells[0]!.cell.tile}`
            : `${sel.w}×${sel.h} from ${tileset}`;
    return { w: sel.w, h: sel.h, cells, label };
}

export function prefabStamp(prefab: LibPrefab): Stamp {
    return { w: prefab.w, h: prefab.h, cells: expand(prefab), label: prefab.name };
}

/** A prefab as layers for a thumbnail, in the profile's layer order. */
export function prefabThumb(prefab: LibPrefab, order: readonly string[], width = prefab.w) {
    const byLayer = new Map<string, Grid>();
    for (const placed of expand(prefab, width)) {
        let grid = byLayer.get(placed.layer);
        if (!grid) byLayer.set(placed.layer, (grid = new Array(width * prefab.h).fill(null)));
        grid[placed.dy * width + placed.dx] = placed.cell;
    }
    const names = [
        ...order.filter((name) => byLayer.has(name)),
        ...[...byLayer.keys()].filter((n) => !order.includes(n)),
    ];
    const layers: RenderLayer[] = names.map((name) => ({ name, grid: byLayer.get(name)! }));
    return { layers, width, height: prefab.h };
}

export const sheetTiles = (def: TiledTileset, sel: Rect): number[] => {
    const out: number[] = [];
    for (let dy = 0; dy < sel.h; dy++) {
        for (let dx = 0; dx < sel.w; dx++) {
            const tile = (sel.y + dy) * def.columns + sel.x + dx;
            if (tile < def.tilecount) out.push(tile);
        }
    }
    return out;
};

export const parseTags = (text: string): string[] => [
    ...new Set(
        text
            .split(/[,\s]+/)
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean),
    ),
];
