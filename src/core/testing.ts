/** Test helpers: load the JSON fixtures the way the app's catalog would. */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Catalog, TilesetEntry } from "./doc";
import { join } from "./path";
import type { LibPrefab } from "./prefab";
import type { Raster } from "./raster";
import { parse, type TiledMap, type TiledTileset } from "./tiled";

export const FIXTURES = resolve(import.meta.dirname, "../../fixtures/phasercraft");
export const CAVE_DIR = "public/graphics/tilesets/cave_";
export const CAVE_POI = "assets/maps/poi/forest-cave-entrance.tmj";

export const readFixture = (path: string): string => readFileSync(resolve(FIXTURES, path), "utf8");

/** The cave .tsj files plus the embedded forest path sheet, as a catalog. */
export function fixtureCatalog(): Catalog {
    const catalog: Catalog = {};
    for (const file of readdirSync(resolve(FIXTURES, CAVE_DIR))) {
        if (!file.endsWith(".tsj")) continue;
        const path = join(CAVE_DIR, file);
        const { value, format } = parse<TiledTileset>(readFixture(path));
        catalog[value.name] = {
            name: value.name,
            def: value,
            path,
            imagePath: join(CAVE_DIR, value.image),
            origin: "tsj",
            readOnly: false,
            format,
        };
    }
    const forestPath: TilesetEntry = {
        name: "forestPath_",
        def: {
            columns: 8,
            image: "../fantasy/forest_/forestPath_.png",
            imageheight: 80,
            imagewidth: 128,
            margin: 0,
            name: "forestPath_",
            spacing: 0,
            tilecount: 40,
            tileheight: 16,
            tilewidth: 16,
        },
        imagePath: "public/graphics/tilesets/fantasy/forest_/forestPath_.png",
        origin: "map",
        readOnly: true,
        variant: "forest",
    };
    catalog[forestPath.name] = forestPath;
    return catalog;
}

export const cavePoi = () => parse<TiledMap>(readFixture(CAVE_POI));

/** A blank sheet to paint test art on. */
export function blankRaster(width: number, height: number): Raster {
    return { width, height, data: new Uint8Array(width * height * 4) };
}

export function paintRect(raster: Raster, x: number, y: number, w: number, h: number) {
    for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) raster.data[(py * raster.width + px) * 4 + 3] = 255;
    }
}

export function sheet(columns: number, rows: number, name = "sheet"): TiledTileset {
    return {
        columns,
        image: `${name}.png`,
        imageheight: rows * 16,
        imagewidth: columns * 16,
        margin: 0,
        name,
        spacing: 0,
        tilecount: columns * rows,
        tileheight: 16,
        tilewidth: 16,
    };
}

/** A small hand-built library covering every tag the recipes ask for. */
export function testLibrary(): LibPrefab[] {
    const one = (id: string, tags: string[], layer: string, tile: number, kind: LibPrefab["kind"] = "fixed"): LibPrefab => ({
        id,
        name: id,
        tags,
        kind,
        w: 1,
        h: 1,
        cells: [{ dx: 0, dy: 0, layer, tile }],
        tileset: "t",
        themes: [],
    });
    const cliff: LibPrefab = {
        id: "cliff",
        name: "cliff",
        tags: ["backdrop"],
        kind: "stretch",
        w: 3,
        h: 3,
        stretch: { left: 1, right: 1 },
        cells: [0, 1, 2].flatMap((dy) =>
            [0, 1, 2].map((dx) => ({ dx, dy, layer: "structure", tile: 10 + dy * 3 + dx }))
        ),
        tileset: "t",
        themes: [],
    };
    const arch: LibPrefab = {
        id: "arch",
        name: "arch",
        tags: ["entrance"],
        kind: "fixed",
        w: 3,
        h: 2,
        cells: [0, 1].flatMap((dy) =>
            [0, 1, 2].map((dx) => ({ dx, dy, layer: "structure", tile: 30 + dy * 3 + dx }))
        ),
        tileset: "t",
        themes: [],
    };
    const rock: LibPrefab = {
        id: "rock",
        name: "rock",
        tags: ["rock"],
        kind: "fixed",
        w: 2,
        h: 2,
        cells: [
            { dx: 0, dy: 0, layer: "structure props", tile: 40 },
            { dx: 1, dy: 0, layer: "structure props", tile: 41 },
            { dx: 0, dy: 1, layer: "structure", tile: 42 },
            { dx: 1, dy: 1, layer: "structure", tile: 43 },
        ],
        tileset: "t",
        themes: [],
    };
    return [
        one("soil", ["soil"], "paths", 1, "decal"),
        one("soil-deco", ["soil-deco"], "paths", 2, "decal"),
        cliff,
        arch,
        rock,
        one("brazier", ["light"], "structure", 50),
        one("pebble", ["rock-small"], "structure", 51),
        one("mushroom", ["plant"], "structure", 52),
        one("skull", ["bones"], "structure", 60, "decal"),
        one("statue", ["statue"], "structure", 70),
        one("pillar", ["pillar"], "structure", 71),
        one("fire", ["fire"], "structure", 72),
        one("tent", ["tent"], "structure", 73),
        one("tree", ["tree"], "structure", 74),
    ];
}

/** In the test library, everything on `structure` blocks except the skull. */
export const testSolid = (cell: { tile: number }, layer: string) =>
    layer === "structure" && cell.tile !== 60;
