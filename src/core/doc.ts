/**
 * Map editing on top of the Tiled types: tilesets resolved to catalog entries,
 * cells addressed by tileset name + tile id rather than raw gid. Every edit
 * returns a new map; nothing is mutated.
 */
import { dirname, join } from "./path";
import {
    gidFlags,
    gidId,
    isRef,
    newObjectLayer,
    newTileLayer,
    refTo,
    resolveRef,
    type JsonFormat,
    type MapTileset,
    type TiledLayer,
    type TiledMap,
    type TiledObject,
    type TiledProperty,
    type TiledTileset,
} from "./tiled";

export interface TilesetEntry {
    /** Unique tileset name: the key everywhere. */
    name: string;
    def: TiledTileset;
    /** Project-relative .tsj path, when the tileset is an external file. */
    path?: string;
    /** Project-relative image path. */
    imagePath: string;
    /** `tsj` external file, `map` embedded in some map, `raw` a bare PNG. */
    origin: "tsj" | "map" | "raw";
    /** Properties and animations can't be edited here. */
    readOnly: boolean;
    /** Group label for sets harvested from a host map (e.g. a biome). */
    variant?: string;
    format?: JsonFormat;
}

export type Catalog = Record<string, TilesetEntry>;

export interface Cell {
    tileset: string;
    tile: number;
    flags?: number;
}

export type Grid = (Cell | null)[];

export interface ResolvedSet {
    firstgid: number;
    name: string;
    tilecount: number;
}

export const sameCell = (a: Cell | null | undefined, b: Cell | null | undefined): boolean =>
    (!a && !b) || (!!a && !!b && a.tileset === b.tileset && a.tile === b.tile);

/** Strips the map-only keys from an embedded tileset. */
function embeddedDef(set: MapTileset): TiledTileset {
    const { firstgid: _firstgid, ...def } = set as TiledTileset & { firstgid: number };
    return def as TiledTileset;
}

export interface MapTilesets {
    sets: ResolvedSet[];
    /** Embedded tilesets the catalog didn't know about. */
    discovered: TilesetEntry[];
    /** References that point at files not in the catalog. */
    missing: string[];
}

/** Matches a map's tilesets to catalog entries. */
export function readMapTilesets(map: TiledMap, mapPath: string, catalog: Catalog): MapTilesets {
    const byPath = new Map(
        Object.values(catalog)
            .filter((entry) => entry.path)
            .map((entry) => [entry.path!, entry]),
    );
    const sets: ResolvedSet[] = [];
    const discovered: TilesetEntry[] = [];
    const missing: string[] = [];
    for (const set of map.tilesets) {
        if (isRef(set)) {
            const entry = byPath.get(resolveRef(mapPath, set.source));
            if (!entry) {
                missing.push(set.source);
                continue;
            }
            sets.push({
                firstgid: set.firstgid,
                name: entry.name,
                tilecount: entry.def.tilecount,
            });
            continue;
        }
        const known = catalog[set.name];
        if (!known) {
            discovered.push({
                name: set.name,
                def: embeddedDef(set),
                imagePath: join(dirname(mapPath), set.image),
                origin: "map",
                readOnly: true,
            });
        }
        sets.push({
            firstgid: set.firstgid,
            name: set.name,
            tilecount: known?.def.tilecount ?? set.tilecount,
        });
    }
    return { sets, discovered, missing };
}

export function cellOf(gid: number, sets: readonly ResolvedSet[]): Cell | null {
    const id = gidId(gid);
    if (!id) return null;
    let found: ResolvedSet | undefined;
    for (const set of sets) if (set.firstgid <= id) found = set;
    if (!found) return null;
    const flags = gidFlags(gid);
    const cell: Cell = { tileset: found.name, tile: id - found.firstgid };
    if (flags) cell.flags = flags;
    return cell;
}

export function gidOf(cell: Cell | null, sets: readonly ResolvedSet[]): number | undefined {
    if (!cell) return 0;
    const set = sets.find((s) => s.name === cell.tileset);
    if (!set) return undefined;
    return ((set.firstgid + cell.tile) | (cell.flags ?? 0)) >>> 0;
}

export function layerCells(layer: TiledLayer, sets: readonly ResolvedSet[]): Grid {
    return (layer.data ?? []).map((gid) => cellOf(gid, sets));
}

/** Every tile layer as cells, keyed by layer name. */
export function mapCells(map: TiledMap, sets: readonly ResolvedSet[]): Record<string, Grid> {
    const out: Record<string, Grid> = {};
    for (const layer of map.layers) {
        if (layer.type === "tilelayer") out[layer.name] = layerCells(layer, sets);
    }
    return out;
}

/** How a tileset is written into a map: embedded with a relative image, or a .tsj reference. */
export function tilesetForMap(
    entry: TilesetEntry,
    mapPath: string,
    firstgid: number,
    embed: boolean,
): MapTileset {
    if (!embed && entry.path) return { firstgid, source: refTo(mapPath, entry.path) };
    const { def } = entry;
    return {
        columns: def.columns,
        firstgid,
        image: refTo(mapPath, entry.imagePath),
        imageheight: def.imageheight,
        imagewidth: def.imagewidth,
        margin: def.margin,
        name: def.name,
        spacing: def.spacing,
        tilecount: def.tilecount,
        tileheight: def.tileheight,
        tilewidth: def.tilewidth,
    };
}

/** Adds the tileset to the map if it isn't there, after the last one. */
export function ensureTileset(
    map: TiledMap,
    sets: readonly ResolvedSet[],
    entry: TilesetEntry,
    mapPath: string,
    embed: boolean,
): { map: TiledMap; sets: ResolvedSet[] } {
    if (sets.some((set) => set.name === entry.name)) return { map, sets: sets.slice() };
    const firstgid = sets.reduce((max, set) => Math.max(max, set.firstgid + set.tilecount), 1);
    return {
        map: {
            ...map,
            tilesets: [...map.tilesets, tilesetForMap(entry, mapPath, firstgid, embed)],
        },
        sets: [...sets, { firstgid, name: entry.name, tilecount: entry.def.tilecount }],
    };
}

export interface LayerOrder {
    tileLayers: readonly string[];
    objectLayers: readonly string[];
}

/** Adds a missing layer where the profile's order puts it. */
export function ensureLayer(
    map: TiledMap,
    name: string,
    type: "tilelayer" | "objectgroup",
    order?: LayerOrder,
): TiledMap {
    if (map.layers.some((layer) => layer.name === name)) return map;
    const layer =
        type === "tilelayer"
            ? newTileLayer(map.nextlayerid, name, map.width, map.height)
            : newObjectLayer(map.nextlayerid, name);
    const wanted = order ? [...order.tileLayers, ...order.objectLayers] : [];
    const layers = map.layers.slice();
    let at = layers.length;
    const rank = wanted.indexOf(name);
    if (rank >= 0) {
        // Before the first layer the profile orders after this one; layers
        // the profile doesn't know stay where they are.
        const next = layers.findIndex((other) => wanted.indexOf(other.name) > rank);
        if (next >= 0) at = next;
    }
    layers.splice(at, 0, layer);
    return { ...map, layers, nextlayerid: map.nextlayerid + 1 };
}

export interface CellChange {
    layer: string;
    x: number;
    y: number;
    cell: Cell | null;
}

export interface EditContext {
    mapPath: string;
    catalog: Catalog;
    /** Whether this tileset is embedded in the map rather than referenced. */
    embed: (entry: TilesetEntry) => boolean;
    order?: LayerOrder;
}

/** Applies cell changes, adding tilesets and layers the map lacks. */
export function applyCells(
    map: TiledMap,
    sets: readonly ResolvedSet[],
    changes: readonly CellChange[],
    ctx: EditContext,
): { map: TiledMap; sets: ResolvedSet[] } {
    let next = map;
    let resolved = sets.slice();
    for (const { cell, layer } of changes) {
        next = ensureLayer(next, layer, "tilelayer", ctx.order);
        if (!cell) continue;
        const entry = ctx.catalog[cell.tileset];
        if (!entry) throw new Error(`Unknown tileset "${cell.tileset}"`);
        ({ map: next, sets: resolved } = ensureTileset(
            next,
            resolved,
            entry,
            ctx.mapPath,
            ctx.embed(entry),
        ));
    }
    const data = new Map<string, number[]>();
    for (const { layer, x, y, cell } of changes) {
        if (x < 0 || y < 0 || x >= next.width || y >= next.height) continue;
        let cells = data.get(layer);
        if (!cells) {
            cells = (next.layers.find((l) => l.name === layer)!.data ?? []).slice();
            data.set(layer, cells);
        }
        cells[y * next.width + x] = gidOf(cell, resolved) ?? 0;
    }
    if (!data.size) return { map: next, sets: resolved };
    return {
        map: {
            ...next,
            layers: next.layers.map((layer) =>
                data.has(layer.name) ? { ...layer, data: data.get(layer.name)! } : layer,
            ),
        },
        sets: resolved,
    };
}

/** Resizes the map, keeping content anchored by `dx`,`dy` tiles from the old origin. */
export function resizeMap(map: TiledMap, width: number, height: number, dx = 0, dy = 0): TiledMap {
    const layers = map.layers.map((layer) => {
        if (layer.type === "tilelayer") {
            const data = new Array<number>(width * height).fill(0);
            for (let y = 0; y < map.height; y++) {
                for (let x = 0; x < map.width; x++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                    data[ny * width + nx] = layer.data?.[y * map.width + x] ?? 0;
                }
            }
            return { ...layer, data, width, height };
        }
        if (layer.type === "objectgroup" && (dx || dy)) {
            return {
                ...layer,
                objects: (layer.objects ?? []).map((object) => ({
                    ...object,
                    x: object.x + dx * map.tilewidth,
                    y: object.y + dy * map.tileheight,
                })),
            };
        }
        return layer;
    });
    return { ...map, width, height, layers };
}

// ── objects ──────────────────────────────────────────────────────────────────

export interface ObjectInput {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    point?: boolean;
    type?: string;
    properties?: TiledProperty[];
}

export function addObject(
    map: TiledMap,
    layerName: string,
    input: ObjectInput,
    order?: LayerOrder,
): { map: TiledMap; id: number } {
    const withLayer = ensureLayer(map, layerName, "objectgroup", order);
    const id = withLayer.nextobjectid;
    const object: TiledObject = {
        height: input.point ? 0 : input.height,
        id,
        name: input.name,
        opacity: 1,
        ...(input.point ? { point: true } : {}),
        ...(input.properties?.length ? { properties: input.properties } : {}),
        rotation: 0,
        type: input.type ?? "",
        visible: true,
        width: input.point ? 0 : input.width,
        x: input.x,
        y: input.y,
    };
    return {
        id,
        map: {
            ...withLayer,
            nextobjectid: id + 1,
            layers: withLayer.layers.map((layer) =>
                layer.name === layerName
                    ? { ...layer, objects: [...(layer.objects ?? []), object] }
                    : layer,
            ),
        },
    };
}

export function updateObject(
    map: TiledMap,
    id: number,
    edit: (object: TiledObject) => TiledObject | null,
): TiledMap {
    return {
        ...map,
        layers: map.layers.map((layer) => {
            if (!layer.objects?.some((object) => object.id === id)) return layer;
            return {
                ...layer,
                objects: layer.objects.flatMap((object) => {
                    if (object.id !== id) return [object];
                    const next = edit(object);
                    return next ? [next] : [];
                }),
            };
        }),
    };
}

export function findObject(map: TiledMap, id: number) {
    for (const layer of map.layers) {
        const object = layer.objects?.find((o) => o.id === id);
        if (object) return { layer, object };
    }
    return undefined;
}

/** Topmost object under a pixel position. */
export function objectAt(map: TiledMap, px: number, py: number, hidden?: ReadonlySet<string>) {
    const slack = map.tilewidth / 2;
    for (const layer of map.layers.slice().reverse()) {
        if (layer.type !== "objectgroup" || hidden?.has(layer.name)) continue;
        for (const object of (layer.objects ?? []).slice().reverse()) {
            const inside = object.point
                ? Math.abs(px - object.x) <= slack && Math.abs(py - object.y) <= slack
                : px >= object.x &&
                  py >= object.y &&
                  px < object.x + object.width &&
                  py < object.y + object.height;
            if (inside) return { layer, object };
        }
    }
    return undefined;
}

/** Tilesets no cell uses any more. */
export function unusedTilesets(map: TiledMap, sets: readonly ResolvedSet[]): string[] {
    const used = new Set<string>();
    for (const layer of map.layers) {
        for (const gid of layer.data ?? []) {
            const cell = cellOf(gid, sets);
            if (cell) used.add(cell.tileset);
        }
    }
    return sets.filter((set) => !used.has(set.name)).map((set) => set.name);
}
