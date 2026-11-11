/** Pure edits and queries on a tileset definition (.tsj content). */
import {
    propsToRecord,
    withProperty,
    type TiledFrame,
    type TiledTile,
    type TiledTileset,
} from "./tiled";

export type PropertyType = "bool" | "int" | "float" | "string";

export function getTile(def: TiledTileset, id: number): TiledTile | undefined {
    return def.tiles?.find((tile) => tile.id === id);
}

export function tileProps(def: TiledTileset, id: number): Record<string, unknown> {
    return propsToRecord(getTile(def, id)?.properties);
}

export function tileAnimation(def: TiledTileset, id: number): TiledFrame[] | undefined {
    return getTile(def, id)?.animation;
}

export function tileRect(def: TiledTileset, id: number) {
    const col = id % def.columns;
    const row = Math.floor(id / def.columns);
    return {
        x: def.margin + col * (def.tilewidth + def.spacing),
        y: def.margin + row * (def.tileheight + def.spacing),
        w: def.tilewidth,
        h: def.tileheight,
    };
}

export const tileRows = (def: TiledTileset): number => Math.ceil(def.tilecount / def.columns);

/** A tile entry with nothing on it is dropped, as Tiled does. */
const isEmpty = (tile: TiledTile): boolean => Object.keys(tile).every((key) => key === "id");

function updateTiles(
    def: TiledTileset,
    ids: readonly number[],
    edit: (tile: TiledTile) => TiledTile
): TiledTileset {
    const byId = new Map((def.tiles ?? []).map((tile) => [tile.id, tile]));
    for (const id of ids) {
        const next = edit(byId.get(id) ?? { id });
        if (isEmpty(next)) byId.delete(id);
        else byId.set(id, next);
    }
    const tiles = [...byId.values()].sort((a, b) => a.id - b.id);
    const next: TiledTileset = { ...def, tiles };
    if (!tiles.length && !def.tiles) delete next.tiles;
    return orderTilesetKeys(next);
}

/** New keys land where Tiled would put them; existing order is untouched. */
function orderTilesetKeys(def: TiledTileset): TiledTileset {
    const keys = Object.keys(def);
    const sorted = keys.slice().sort();
    if (keys.every((key, i) => key === sorted[i])) return def;
    const out: Record<string, unknown> = {};
    for (const key of sorted) out[key] = def[key];
    return out as TiledTileset;
}

function orderTileKeys(tile: TiledTile): TiledTile {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(tile).sort()) if (tile[key] !== undefined) out[key] = tile[key];
    return out as TiledTile;
}

/** Sets a property on every listed tile; `undefined` removes it. */
export function setTileProperty(
    def: TiledTileset,
    ids: readonly number[],
    name: string,
    type: PropertyType,
    value: unknown
): TiledTileset {
    return updateTiles(def, ids, (tile) =>
        orderTileKeys({ ...tile, properties: withProperty(tile.properties, name, type, value) })
    );
}

/** Sets a tile's animation; `undefined` or no frames removes it. */
export function setAnimation(
    def: TiledTileset,
    id: number,
    frames: readonly TiledFrame[] | undefined
): TiledTileset {
    return updateTiles(def, [id], (tile) =>
        orderTileKeys({
            ...tile,
            animation: frames?.length
                ? frames.map(({ duration, tileid }) => ({ duration, tileid }))
                : undefined,
        })
    );
}

/** Ids used as a later frame of some animation: not tiles in their own right. */
export function frameOnlyTiles(def: TiledTileset): Set<number> {
    const out = new Set<number>();
    for (const tile of def.tiles ?? []) {
        for (const frame of tile.animation ?? []) if (frame.tileid !== tile.id) out.add(frame.tileid);
    }
    return out;
}

/** A definition for a plain grid sheet with no .tsj yet. */
export function tilesetForImage(
    name: string,
    image: string,
    imagewidth: number,
    imageheight: number,
    tileSize: number
): TiledTileset {
    const columns = Math.floor(imagewidth / tileSize);
    return {
        columns,
        image,
        imageheight,
        imagewidth,
        margin: 0,
        name,
        spacing: 0,
        tilecount: columns * Math.floor(imageheight / tileSize),
        tiledversion: "1.12.2",
        tileheight: tileSize,
        tilewidth: tileSize,
        type: "tileset",
        version: "1.10",
    };
}

/** Grows a sheet by whole rows at the bottom, so no existing tile id moves. */
export function withImageHeight(def: TiledTileset, imageheight: number): TiledTileset {
    const rows = Math.floor(
        (imageheight - 2 * def.margin + def.spacing) / (def.tileheight + def.spacing)
    );
    return { ...def, imageheight, tilecount: rows * def.columns };
}
