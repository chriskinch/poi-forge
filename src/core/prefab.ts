/**
 * Prefabs: named, tagged groups of tiles that belong together (a rock, an
 * arch, a cliff run). They are what the generator composes and what
 * prefab-aware swap replaces. Stored per tileset in a sidecar library file.
 */
import type { Cell, CellChange, Grid } from "./doc";
import { coverageMap, touches, type Raster } from "./raster";
import type { TiledTileset } from "./tiled";

export interface PrefabCell {
    dx: number;
    dy: number;
    layer: string;
    tile: number;
    /** Only for the rare prefab that mixes sheets; defaults to the library's tileset. */
    tileset?: string;
}

export type PrefabKind = "fixed" | "stretch" | "decal";

export interface Prefab {
    id: string;
    name: string;
    tags: string[];
    /**
     * `fixed`: placed as is. `stretch`: left and right cap columns with a
     * repeating middle, any width. `decal`: flat ground art that never blocks.
     */
    kind: PrefabKind;
    w: number;
    h: number;
    cells: PrefabCell[];
    stretch?: { left: number; right: number };
    /** Relative pick chance in the generator. Default 1. */
    weight?: number;
}

export interface PrefabLibrary {
    version: 1;
    tileset: string;
    /** Themes every prefab in this file belongs to (e.g. `cave`, `forest`). */
    themes: string[];
    prefabs: Prefab[];
}

/** A prefab with its library's tileset and themes attached. */
export interface LibPrefab extends Prefab {
    tileset: string;
    themes: string[];
}

export function flatten(libraries: readonly PrefabLibrary[]): LibPrefab[] {
    return libraries.flatMap((library) =>
        library.prefabs.map((prefab) => ({
            ...prefab,
            tileset: library.tileset,
            themes: library.themes,
        })),
    );
}

export const emptyLibrary = (tileset: string): PrefabLibrary => ({
    version: 1,
    tileset,
    themes: [],
    prefabs: [],
});

export interface PlacedCell {
    dx: number;
    dy: number;
    layer: string;
    cell: Cell;
}

export const minWidth = (prefab: Prefab): number =>
    prefab.kind === "stretch" && prefab.stretch
        ? prefab.stretch.left + prefab.stretch.right
        : prefab.w;

/** The prefab's cells at a given width (only `stretch` prefabs change width). */
export function expand(prefab: LibPrefab, width = prefab.w): PlacedCell[] {
    const place = (cell: PrefabCell, dx: number): PlacedCell => ({
        dx,
        dy: cell.dy,
        layer: cell.layer,
        cell: { tileset: cell.tileset ?? prefab.tileset, tile: cell.tile },
    });
    if (prefab.kind !== "stretch" || !prefab.stretch || width === prefab.w) {
        return prefab.cells.map((cell) => place(cell, cell.dx));
    }
    const { left, right } = prefab.stretch;
    const middle = prefab.w - left - right;
    const out: PlacedCell[] = [];
    for (let x = 0; x < width; x++) {
        let source: number;
        if (x < left) source = x;
        else if (x >= width - right) source = prefab.w - (width - x);
        else if (middle > 0) source = left + ((x - left) % middle);
        else continue;
        for (const cell of prefab.cells) if (cell.dx === source) out.push(place(cell, x));
    }
    return out;
}

export function placement(prefab: LibPrefab, x: number, y: number, width?: number): CellChange[] {
    return expand(prefab, width).map(({ dx, dy, layer, cell }) => ({
        layer,
        x: x + dx,
        y: y + dy,
        cell,
    }));
}

// ── detection ────────────────────────────────────────────────────────────────

export interface DetectOptions {
    /** Tile ids to leave out (e.g. later animation frames). */
    skip?: ReadonlySet<number>;
    /** Layer for a cell, from its tile id, rows above the prefab's bottom and prefab height. */
    layerFor: (tile: number, rowFromBottom: number, height: number) => string;
    /** Groups with more tiles than this are terrain sets, not props. Default 30. */
    maxTiles?: number;
}

const slug = (text: string): string =>
    text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

/**
 * Proposes one prefab per connected piece of art: tiles whose pixels run into
 * each other across a tile edge are grouped. Tightly packed sheets merge
 * neighbours and terrain sets come out as one huge group; those are skipped
 * and left to manual selection.
 */
export function detectPrefabs(raster: Raster, def: TiledTileset, options: DetectOptions) {
    const { skip, layerFor, maxTiles = 30 } = options;
    const coverage = coverageMap(raster, def);
    const rows = Math.ceil(def.tilecount / def.columns);
    const parent = Array.from({ length: def.tilecount }, (_, i) => i);
    const find = (i: number): number => {
        while (parent[i] !== i) {
            parent[i] = parent[parent[i]!]!;
            i = parent[i]!;
        }
        return i;
    };
    const live = (id: number) => id < def.tilecount && coverage[id]! > 0 && !skip?.has(id);

    for (let id = 0; id < def.tilecount; id++) {
        if (!live(id)) continue;
        const col = id % def.columns;
        const row = Math.floor(id / def.columns);
        if (col + 1 < def.columns && live(id + 1) && touches(raster, def, id, 1, 0)) {
            parent[find(id)] = find(id + 1);
        }
        if (row + 1 < rows && live(id + def.columns) && touches(raster, def, id, 0, 1)) {
            parent[find(id)] = find(id + def.columns);
        }
    }

    const groups = new Map<number, number[]>();
    for (let id = 0; id < def.tilecount; id++) {
        if (!live(id)) continue;
        const root = find(id);
        groups.set(root, [...(groups.get(root) ?? []), id]);
    }

    const prefabs: Prefab[] = [];
    let skipped = 0;
    for (const tiles of groups.values()) {
        if (tiles.length > maxTiles) {
            skipped++;
            continue;
        }
        prefabs.push(prefabFromTiles(def, tiles, layerFor));
    }
    prefabs.sort((a, b) => a.cells[0]!.tile - b.cells[0]!.tile);
    return { prefabs, skipped };
}

/** A prefab from a set of tiles on one sheet, laid out as they sit on the sheet. */
export function prefabFromTiles(
    def: TiledTileset,
    tiles: readonly number[],
    layerFor: DetectOptions["layerFor"],
): Prefab {
    const cols = tiles.map((id) => id % def.columns);
    const rws = tiles.map((id) => Math.floor(id / def.columns));
    const left = Math.min(...cols);
    const top = Math.min(...rws);
    const w = Math.max(...cols) - left + 1;
    const h = Math.max(...rws) - top + 1;
    const cells = tiles
        .slice()
        .sort((a, b) => a - b)
        .map((tile) => {
            const dx = (tile % def.columns) - left;
            const dy = Math.floor(tile / def.columns) - top;
            return { dx, dy, layer: layerFor(tile, h - 1 - dy, h), tile };
        });
    return {
        id: `${slug(def.name)}-${left}-${top}`,
        name: `${w}×${h} at ${left},${top}`,
        tags: [],
        kind: "fixed",
        w,
        h,
        cells,
    };
}

/** A prefab from a region of a map: keeps each cell's own layer and sheet. */
export function prefabFromRegion(
    grids: Record<string, Grid>,
    mapWidth: number,
    rect: { x: number; y: number; w: number; h: number },
    tileset: string,
    id: string,
): Prefab | null {
    const found: { x: number; y: number; layer: string; cell: Cell }[] = [];
    for (const [layer, grid] of Object.entries(grids)) {
        for (let y = rect.y; y < rect.y + rect.h; y++) {
            for (let x = rect.x; x < rect.x + rect.w; x++) {
                const cell = grid[y * mapWidth + x];
                if (cell) found.push({ x, y, layer, cell });
            }
        }
    }
    if (!found.length) return null;
    const left = Math.min(...found.map((f) => f.x));
    const top = Math.min(...found.map((f) => f.y));
    const w = Math.max(...found.map((f) => f.x)) - left + 1;
    const h = Math.max(...found.map((f) => f.y)) - top + 1;
    return {
        id,
        name: id,
        tags: [],
        kind: "fixed",
        w,
        h,
        cells: found.map(({ x, y, layer, cell }) => ({
            dx: x - left,
            dy: y - top,
            layer,
            tile: cell.tile,
            ...(cell.tileset !== tileset ? { tileset: cell.tileset } : {}),
        })),
    };
}

// ── matching ─────────────────────────────────────────────────────────────────

export interface Instance {
    prefab: LibPrefab;
    x: number;
    y: number;
}

/**
 * Finds prefabs in a map by matching tiles, so prefabs need not be recorded
 * in the map file and hand-made maps work too. Larger prefabs win.
 */
export function findInstances(
    grids: Record<string, Grid>,
    width: number,
    height: number,
    prefabs: readonly LibPrefab[],
): Instance[] {
    const out: Instance[] = [];
    for (const prefab of prefabs) {
        if (prefab.kind === "stretch" || !prefab.cells.length) continue;
        const [first, ...rest] = prefab.cells;
        const grid = grids[first!.layer];
        if (!grid) continue;
        const tileset = first!.tileset ?? prefab.tileset;
        for (let i = 0; i < grid.length; i++) {
            const cell = grid[i];
            if (!cell || cell.tile !== first!.tile || cell.tileset !== tileset) continue;
            const x = (i % width) - first!.dx;
            const y = Math.floor(i / width) - first!.dy;
            if (x < 0 || y < 0 || x + prefab.w > width || y + prefab.h > height) continue;
            const all = rest.every((c) => {
                const other = grids[c.layer]?.[(y + c.dy) * width + x + c.dx];
                return (
                    !!other &&
                    other.tile === c.tile &&
                    other.tileset === (c.tileset ?? prefab.tileset)
                );
            });
            if (all) out.push({ prefab, x, y });
        }
    }
    return out.sort((a, b) => b.prefab.cells.length - a.prefab.cells.length);
}

export function instanceAt(
    instances: readonly Instance[],
    x: number,
    y: number,
    layer?: string,
): Instance | undefined {
    return instances.find(({ prefab, x: px, y: py }) =>
        prefab.cells.some(
            (cell) => px + cell.dx === x && py + cell.dy === y && (!layer || cell.layer === layer),
        ),
    );
}

/** Other prefabs that could stand in for this one: shared tag, same footprint first. */
export function swapCandidates(target: LibPrefab, prefabs: readonly LibPrefab[]): LibPrefab[] {
    const shares = (other: LibPrefab) => other.tags.some((tag) => target.tags.includes(tag));
    const same = (other: LibPrefab) => other.w === target.w && other.h === target.h;
    return prefabs
        .filter(
            (other) =>
                !(other.id === target.id && other.tileset === target.tileset) &&
                other.kind === target.kind &&
                shares(other),
        )
        .sort((a, b) => Number(same(b)) - Number(same(a)));
}

/** Changes that replace a placed prefab with another, standing on the same base. */
export function swapChanges(instance: Instance, next: LibPrefab): CellChange[] {
    const clear: CellChange[] = instance.prefab.cells.map((cell) => ({
        layer: cell.layer,
        x: instance.x + cell.dx,
        y: instance.y + cell.dy,
        cell: null,
    }));
    const x = instance.x + Math.floor((instance.prefab.w - next.w) / 2);
    const y = instance.y + instance.prefab.h - next.h;
    return [...clear, ...placement(next, x, y)];
}

export function upsertPrefab(library: PrefabLibrary, prefab: Prefab): PrefabLibrary {
    const exists = library.prefabs.some((p) => p.id === prefab.id);
    return {
        ...library,
        prefabs: exists
            ? library.prefabs.map((p) => (p.id === prefab.id ? prefab : p))
            : [...library.prefabs, prefab],
    };
}

export function removePrefab(library: PrefabLibrary, id: string): PrefabLibrary {
    return { ...library, prefabs: library.prefabs.filter((p) => p.id !== id) };
}

export function uniqueId(library: PrefabLibrary, base: string): string {
    const taken = new Set(library.prefabs.map((p) => p.id));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/**
 * Splits prefabs into those a map can use and those it can't: a sheet the
 * project lacks, or a tile the profile says doesn't belong on its layer.
 */
export function usablePrefabs(
    prefabs: readonly LibPrefab[],
    problem: (tileset: string, tile: number, layer: string) => string | null,
): { usable: LibPrefab[]; rejected: { prefab: LibPrefab; reason: string }[] } {
    const usable: LibPrefab[] = [];
    const rejected: { prefab: LibPrefab; reason: string }[] = [];
    for (const prefab of prefabs) {
        let reason: string | null = null;
        for (const cell of prefab.cells) {
            reason = problem(cell.tileset ?? prefab.tileset, cell.tile, cell.layer);
            if (reason) break;
        }
        if (reason) rejected.push({ prefab, reason });
        else usable.push(prefab);
    }
    return { usable, rejected };
}
