/**
 * Tiled JSON (.tmj / .tsj) types and byte-stable IO.
 *
 * Tiled writes keys alphabetically. We never re-sort what we read; objects we
 * create are built with alphabetical keys, so a file saved here diffs the way
 * one saved by Tiled would.
 */
import { dirname, join, relative } from "./path";

export interface TiledProperty {
    name: string;
    type: string;
    value: unknown;
    propertytype?: string;
}

export interface TiledFrame {
    duration: number;
    tileid: number;
}

export interface TiledTile {
    animation?: TiledFrame[];
    id: number;
    properties?: TiledProperty[];
    [key: string]: unknown;
}

export interface TiledTileset {
    columns: number;
    firstgid?: number;
    image: string;
    imageheight: number;
    imagewidth: number;
    margin: number;
    name: string;
    spacing: number;
    tilecount: number;
    tiledversion?: string;
    tileheight: number;
    tiles?: TiledTile[];
    tilewidth: number;
    type?: string;
    version?: string;
    [key: string]: unknown;
}

export interface TilesetRef {
    firstgid: number;
    source: string;
}

export type MapTileset = (TiledTileset & { firstgid: number }) | TilesetRef;

export interface TiledObject {
    height: number;
    id: number;
    name: string;
    opacity?: number;
    point?: boolean;
    properties?: TiledProperty[];
    rotation: number;
    type: string;
    visible: boolean;
    width: number;
    x: number;
    y: number;
    [key: string]: unknown;
}

export interface TiledLayer {
    data?: number[];
    draworder?: string;
    height?: number;
    id: number;
    name: string;
    objects?: TiledObject[];
    opacity: number;
    properties?: TiledProperty[];
    type: "tilelayer" | "objectgroup" | string;
    visible: boolean;
    width?: number;
    x: number;
    y: number;
    [key: string]: unknown;
}

export interface TiledMap {
    compressionlevel: number;
    height: number;
    infinite: boolean;
    layers: TiledLayer[];
    nextlayerid: number;
    nextobjectid: number;
    orientation: string;
    properties?: TiledProperty[];
    renderorder: string;
    tiledversion: string;
    tileheight: number;
    tilesets: MapTileset[];
    tilewidth: number;
    type: string;
    version: string;
    width: number;
    [key: string]: unknown;
}

// ── byte-stable JSON ─────────────────────────────────────────────────────────

export interface JsonFormat {
    indent: number;
    newline: boolean;
}

/** Tiled's own output: one-space indent and a trailing newline. */
export const TILED_FORMAT: JsonFormat = { indent: 1, newline: true };

export function detectFormat(text: string): JsonFormat {
    const newline = text.endsWith("\n");
    const match = /^[[{]\n( +)\S/.exec(text);
    return { indent: match ? match[1]!.length : 0, newline };
}

export function stringify(value: unknown, format: JsonFormat = TILED_FORMAT): string {
    return JSON.stringify(value, null, format.indent || undefined) + (format.newline ? "\n" : "");
}

export function parse<T>(text: string): { value: T; format: JsonFormat } {
    return { value: JSON.parse(text) as T, format: detectFormat(text) };
}

/** Rebuilds an object with its keys in alphabetical order, as Tiled writes them. */
export function sortKeys<T extends object>(value: T): T {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) out[key] = (value as Record<string, unknown>)[key];
    return out as T;
}

// ── gids ─────────────────────────────────────────────────────────────────────

export const FLIP_H = 0x80000000;
export const FLIP_V = 0x40000000;
export const FLIP_D = 0x20000000;
const FLAG_MASK = 0xe0000000;

export const gidId = (gid: number): number => (gid & ~FLAG_MASK) >>> 0;
export const gidFlags = (gid: number): number => (gid & FLAG_MASK) >>> 0;

export const isRef = (set: MapTileset): set is TilesetRef => "source" in set && !("image" in set);

// ── layers ───────────────────────────────────────────────────────────────────

export const tileLayers = (map: TiledMap): TiledLayer[] =>
    map.layers.filter((layer) => layer.type === "tilelayer");

export const objectLayers = (map: TiledMap): TiledLayer[] =>
    map.layers.filter((layer) => layer.type === "objectgroup");

export const findLayer = (map: TiledMap, name: string): TiledLayer | undefined =>
    map.layers.find((layer) => layer.name === name);

export function newTileLayer(id: number, name: string, width: number, height: number): TiledLayer {
    return {
        data: new Array<number>(width * height).fill(0),
        height,
        id,
        name,
        opacity: 1,
        type: "tilelayer",
        visible: true,
        width,
        x: 0,
        y: 0,
    };
}

export function newObjectLayer(id: number, name: string): TiledLayer {
    return {
        draworder: "topdown",
        id,
        name,
        objects: [],
        opacity: 1,
        type: "objectgroup",
        visible: true,
        x: 0,
        y: 0,
    };
}

export function newMap(
    width: number,
    height: number,
    tileSize: number,
    layerNames: readonly string[]
): TiledMap {
    return {
        compressionlevel: -1,
        height,
        infinite: false,
        layers: layerNames.map((name, i) => newTileLayer(i + 1, name, width, height)),
        nextlayerid: layerNames.length + 1,
        nextobjectid: 1,
        orientation: "orthogonal",
        renderorder: "right-down",
        tiledversion: "1.12.2",
        tileheight: tileSize,
        tilesets: [],
        tilewidth: tileSize,
        type: "map",
        version: "1.10",
        width,
    };
}

// ── properties ───────────────────────────────────────────────────────────────

export function propsToRecord(props: TiledProperty[] | undefined): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const prop of props ?? []) out[prop.name] = prop.value;
    return out;
}

/** Sets (or, with `undefined`, removes) one property, keeping the others in place. */
export function withProperty(
    props: TiledProperty[] | undefined,
    name: string,
    type: string,
    value: unknown
): TiledProperty[] | undefined {
    const rest = (props ?? []).filter((prop) => prop.name !== name);
    if (value === undefined) return rest.length ? rest : undefined;
    const next = { name, type, value };
    const at = (props ?? []).findIndex((prop) => prop.name === name);
    if (at < 0) return [...rest, next];
    return (props ?? []).map((prop) => (prop.name === name ? next : prop));
}

/** Map-level custom property, inserted where Tiled would write it. */
export function withMapProperty(map: TiledMap, name: string, type: string, value: unknown): TiledMap {
    const properties = withProperty(map.properties, name, type, value);
    const next: TiledMap = { ...map };
    if (properties) next.properties = properties.slice().sort((a, b) => a.name.localeCompare(b.name));
    else delete next.properties;
    return sortKeys(next);
}

// ── tileset references ───────────────────────────────────────────────────────

/** Where a map's tileset reference points, as a project-relative path. */
export function resolveRef(mapPath: string, source: string): string {
    return join(dirname(mapPath), source);
}

export function refTo(mapPath: string, target: string): string {
    return relative(dirname(mapPath), target);
}

export function tilesetAt(
    sets: readonly { firstgid: number }[],
    gid: number
): number {
    const id = gidId(gid);
    let found = -1;
    for (let i = 0; i < sets.length; i++) if (sets[i]!.firstgid <= id) found = i;
    return found;
}
