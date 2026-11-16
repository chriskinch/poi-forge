/**
 * Builds the bundled example project from the cave pack sheets in
 * demo/tilesets/cave_/: a .tsj per sheet (collision and animations), the
 * prefab libraries, and one generated map per recipe.
 *
 *   npm run demo:build
 *
 * The sheets themselves are committed art; everything else here is derived,
 * and CI checks it is up to date.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { animateBlock } from "../src/core/animation";
import { resultToMap } from "../src/core/build";
import type { Catalog } from "../src/core/doc";
import { generateValid } from "../src/core/generator";
import { flatten, type Prefab, type PrefabLibrary } from "../src/core/prefab";
import { coverageMap } from "../src/core/raster";
import { recipeById } from "../src/core/recipes";
import { stringify, type TiledTileset } from "../src/core/tiled";
import { setTileProperty, tileProps, tilesetForImage } from "../src/core/tileset";
import { generic } from "../src/profiles/generic";
import { decodePng } from "./png";

const ROOT = resolve(import.meta.dirname, "..");
const DIR = "tilesets/cave_";
const THEME = "cave";
const [GROUND, DETAILS, STRUCTURES, OVERHEAD] = generic.tileLayers as [
    string,
    string,
    string,
    string,
];

interface Spec {
    id: string;
    name: string;
    tags: string[];
    /** Tile ids as they sit on the sheet; null for a gap. */
    rows: (number | null)[][];
    kind?: Prefab["kind"];
    /** One layer for every cell. Default: base row on structures, rows above overhead. */
    layer?: string;
    /** Rows from the top that go on the overhead layer when `layer` is set. */
    overheadRows?: number;
    stretch?: [number, number];
    weight?: number;
    /** Default: cells on the structures layer block movement. */
    solid?: boolean;
    /** Tiles that are plain walkable ground inside the prefab: details layer, never solid. */
    flat?: number[];
}

const many = (prefix: string, name: string, tags: string[], tiles: number[], rest: Partial<Spec>) =>
    tiles.map((tile): Spec => ({
        id: `${prefix}-${tile}`,
        name: `${name} ${tile}`,
        tags,
        rows: [[tile]],
        ...rest,
    }));

interface Sheet {
    name: string;
    specs: Spec[];
    /** Blocks whose tiles animate through frames laid out at a fixed step. */
    animations?: {
        col: number;
        row: number;
        w: number;
        h: number;
        strideX: number;
        duration: number;
    }[];
}

const SHEETS: Sheet[] = [
    {
        name: "cave_",
        specs: [
            {
                id: "floor",
                name: "Cave floor",
                tags: ["soil"],
                rows: [[46]],
                kind: "decal",
                layer: GROUND,
            },
            ...many(
                "floor-deco",
                "Worn floor",
                ["soil-deco"],
                [30, 31, 52, 53, 72, 73, 74, 75, 94, 95, 96, 97],
                {
                    kind: "decal",
                    layer: GROUND,
                },
            ),
            {
                id: "mound",
                name: "Mound",
                tags: ["mound"],
                rows: [
                    [28, 29],
                    [50, 51],
                ],
                layer: STRUCTURES,
            },
            {
                id: "stone-circle",
                name: "Stone circle",
                tags: ["shrine", "stone-circle"],
                rows: [
                    [38, 39, 40],
                    [60, 61, 62],
                    [82, 83, 84],
                ],
                layer: DETAILS,
            },
            {
                id: "rubble",
                name: "Rubble",
                tags: ["rubble"],
                rows: [
                    [41, 42],
                    [63, 64],
                    [85, 86],
                ],
                layer: DETAILS,
            },
            {
                id: "pond",
                name: "Pond",
                tags: ["fountain", "pond"],
                rows: [
                    [114, 115],
                    [136, 137],
                ],
                layer: DETAILS,
                solid: true,
            },
            {
                id: "lava-pool",
                name: "Lava pool",
                tags: ["fountain", "lava"],
                rows: [
                    [180, 181],
                    [202, 203],
                ],
                layer: DETAILS,
                solid: true,
                weight: 0.6,
            },
        ],
        animations: [
            { col: 4, row: 5, w: 2, h: 2, strideX: 5, duration: 220 },
            { col: 4, row: 8, w: 2, h: 2, strideX: 5, duration: 220 },
        ],
    },
    {
        name: "cave_ [cliff]",
        specs: [
            {
                id: "ridge",
                name: "Cliff ridge",
                tags: ["backdrop"],
                rows: [
                    [47, 49, null, 50, 49],
                    [93, 141, null, 142, 95],
                    [323, 324, 324, 324, 325],
                    [369, 370, 370, 370, 371],
                    [415, 416, 416, 416, 417],
                ],
                kind: "stretch",
                layer: STRUCTURES,
                stretch: [2, 2],
                // The plateau's top is ordinary cave floor.
                flat: [141, 142],
            },
            {
                id: "arch-stone",
                name: "Stone arch",
                tags: ["entrance"],
                rows: [
                    [338, 339, 340],
                    [384, 385, 386],
                    [430, 431, 432],
                ],
                layer: STRUCTURES,
            },
            {
                id: "mine-entrance",
                name: "Mine entrance",
                tags: ["entrance"],
                rows: [
                    [200, 201, 202],
                    [246, 247, 248],
                    [292, 293, 294],
                ],
                layer: STRUCTURES,
            },
            {
                id: "cave-mouth",
                name: "Cave mouth",
                tags: ["entrance"],
                rows: [
                    [62, 63, 64],
                    [108, 109, 110],
                    [154, 155, 156],
                ],
                layer: STRUCTURES,
            },
            ...many(
                "pebbles",
                "Pebbled floor",
                ["soil-deco"],
                [282, 283, 328, 329, 374, 375, 376, 377, 420, 421, 422, 423],
                {
                    kind: "decal",
                    layer: GROUND,
                    weight: 0.5,
                },
            ),
        ],
    },
    {
        name: "caveObjects_",
        specs: [
            {
                id: "mushroom-brown-tall",
                name: "Tall brown mushroom",
                tags: ["plant", "tree"],
                rows: [[12], [23]],
            },
            {
                id: "mushroom-orange-tall",
                name: "Tall orange mushroom",
                tags: ["plant", "tree"],
                rows: [[13], [24]],
            },
            ...many(
                "mushroom",
                "Mushroom",
                ["plant"],
                [17, 18, 19, 20, 28, 29, 30, 31, 41, 42, 52, 53],
                { layer: STRUCTURES, weight: 0.3 },
            ),
            {
                id: "rock-big",
                name: "Big rock",
                tags: ["rock"],
                rows: [
                    [35, 36],
                    [46, 47],
                ],
            },
            ...many("rock", "Rock", ["rock-small"], [48, 49], { layer: STRUCTURES }),
            ...many("ore", "Ore rock", ["rock-small", "ore"], [39, 40, 50, 51], {
                layer: STRUCTURES,
                weight: 0.4,
            }),
            { id: "grave-a", name: "Gravestone A", tags: ["grave"], rows: [[56], [67]] },
            { id: "grave-b", name: "Gravestone B", tags: ["grave"], rows: [[57], [68]] },
            { id: "grave-c", name: "Gravestone C", tags: ["grave"], rows: [[58], [69]] },
            { id: "chest", name: "Chest", tags: ["clutter"], rows: [[59], [70]] },
            {
                id: "chest-open",
                name: "Open chest",
                tags: ["clutter"],
                rows: [[60], [71]],
                weight: 0.5,
            },
            {
                id: "chest-big",
                name: "Big chest",
                tags: ["clutter"],
                rows: [
                    [79, 80],
                    [90, 91],
                ],
                weight: 0.5,
            },
            {
                id: "chest-big-open",
                name: "Big open chest",
                tags: ["clutter"],
                rows: [
                    [81, 82],
                    [92, 93],
                ],
                weight: 0.3,
            },
            { id: "sign", name: "Sign", tags: ["sign"], rows: [[78], [89]] },
            {
                id: "campfire-unlit",
                name: "Unlit campfire",
                tags: ["clutter"],
                rows: [[100], [111]],
                weight: 0.5,
            },
            { id: "campfire", name: "Campfire", tags: ["fire"], rows: [[101], [112]], weight: 4 },
        ],
        animations: [{ col: 2, row: 9, w: 1, h: 2, strideX: 1, duration: 140 }],
    },
    {
        name: "caveStructures_ [fountainPortalBridge]",
        specs: [
            {
                id: "brazier-lit",
                name: "Lit brazier",
                tags: ["light"],
                rows: [
                    [21, 22],
                    [39, 40],
                ],
                layer: STRUCTURES,
            },
            {
                id: "brazier",
                name: "Unlit brazier",
                tags: ["clutter"],
                rows: [
                    [19, 20],
                    [37, 38],
                ],
                layer: STRUCTURES,
                weight: 0.5,
            },
            {
                id: "rubble-block",
                name: "Rubble block",
                tags: ["wall", "clutter"],
                rows: [
                    [33, 34],
                    [51, 52],
                ],
                layer: STRUCTURES,
                weight: 0.5,
            },
            {
                id: "fountain",
                name: "Fountain",
                tags: ["fountain", "shrine"],
                rows: [
                    [55, 56, 57, 58],
                    [73, 74, 75, 76],
                    [91, 92, 93, 94],
                    [109, 110, 111, 112],
                    [127, 128, 129, 130],
                ],
                layer: STRUCTURES,
                overheadRows: 1,
            },
            {
                id: "pool",
                name: "Small pool",
                tags: ["fountain"],
                rows: [
                    [155, 156],
                    [173, 174],
                    [191, 192],
                ],
                layer: STRUCTURES,
                overheadRows: 1,
            },
            {
                id: "portal",
                name: "Portal",
                tags: ["shrine", "portal"],
                rows: [
                    [199, 200, 201],
                    [217, 218, 219],
                    [235, 236, 237],
                ],
            },
            {
                id: "ruined-arch",
                name: "Ruined arch",
                tags: ["wall", "arch"],
                rows: [
                    [145, 146, 147],
                    [163, 164, 165],
                    [181, 182, 183],
                ],
                weight: 0.4,
            },
            {
                id: "pillar-left",
                name: "Broken pillar (left)",
                tags: ["pillar"],
                rows: [[148], [166], [184]],
            },
            {
                id: "pillar-right",
                name: "Broken pillar (right)",
                tags: ["pillar"],
                rows: [[150], [168], [186]],
            },
            {
                id: "stone-deck",
                name: "Stone deck",
                tags: ["apron"],
                rows: [[321], [339]],
                kind: "decal",
                layer: DETAILS,
            },
        ],
        animations: [
            { col: 3, row: 1, w: 2, h: 2, strideX: 2, duration: 150 },
            { col: 1, row: 3, w: 4, h: 5, strideX: 4, duration: 180 },
            { col: 1, row: 11, w: 3, h: 3, strideX: 3, duration: 160 },
        ],
    },
    {
        name: "caveStructures_ [wall]",
        specs: [
            {
                id: "wall",
                name: "Stone wall",
                tags: ["wall"],
                rows: [
                    [17, 18, 19],
                    [32, 33, 34],
                ],
                weight: 0.5,
            },
            {
                id: "wall-long",
                name: "Long stone wall",
                tags: ["wall"],
                rows: [
                    [23, 24, 25, 26, 27],
                    [38, 39, 40, 41, 42],
                ],
                weight: 0.3,
            },
            { id: "pillar", name: "Stone pillar", tags: ["pillar"], rows: [[16], [31]] },
            ...many("block", "Stone block", ["pillar", "seat"], [47, 62, 64], {
                layer: STRUCTURES,
            }),
            {
                id: "lantern",
                name: "Lantern",
                tags: ["light"],
                rows: [[48]],
                layer: STRUCTURES,
                weight: 0.5,
            },
            {
                id: "ruined-arch",
                name: "Ruined arch",
                tags: ["wall", "arch"],
                rows: [
                    [53, 54, 55],
                    [68, 69, 70],
                    [83, 84, 85],
                ],
                weight: 0.4,
            },
            {
                id: "pillar-left",
                name: "Broken pillar (left)",
                tags: ["pillar"],
                rows: [[56], [71], [86]],
            },
            {
                id: "pillar-right",
                name: "Broken pillar (right)",
                tags: ["pillar"],
                rows: [[58], [73], [88]],
            },
        ],
    },
    {
        name: "railway_",
        specs: [
            {
                id: "minecart",
                name: "Minecart",
                tags: ["clutter", "minecart"],
                rows: [[22], [30]],
                weight: 0.6,
            },
            {
                id: "rail",
                name: "Rail",
                tags: ["rail"],
                rows: [[10, 11, 12]],
                kind: "stretch",
                layer: DETAILS,
                stretch: [1, 1],
            },
        ],
    },
    { name: "caveStructures_ [bridgeAnimations]", specs: [] },
];

function write(path: string, data: string) {
    const full = resolve(ROOT, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, data);
}

const catalog: Catalog = {};
const libraries: PrefabLibrary[] = [];

for (const sheet of SHEETS) {
    const image = `${DIR}/${sheet.name}.png`;
    const raster = decodePng(readFileSync(resolve(ROOT, "demo", image)));
    let def: TiledTileset = tilesetForImage(
        sheet.name,
        `${sheet.name}.png`,
        raster.width,
        raster.height,
        generic.tileSize,
    );
    const coverage = coverageMap(raster, def);

    const prefabs: Prefab[] = [];
    for (const spec of sheet.specs) {
        const kind = spec.kind ?? "fixed";
        const height = spec.rows.length;
        const cells = spec.rows.flatMap((row, dy) =>
            row.flatMap((tile, dx) => {
                // Slots the art leaves empty are simply not part of the prefab.
                if (tile === null || !coverage[tile]) return [];
                const layer = spec.flat?.includes(tile)
                    ? DETAILS
                    : spec.layer
                      ? dy < (spec.overheadRows ?? 0)
                          ? OVERHEAD
                          : spec.layer
                      : dy === height - 1
                        ? STRUCTURES
                        : OVERHEAD;
                return [{ dx, dy, layer, tile }];
            }),
        );
        if (!cells.length) throw new Error(`${sheet.name}: prefab "${spec.id}" has no art`);
        // Rows listed in case the art spills into them, but empty on this sheet.
        const top = Math.min(...cells.map((cell) => cell.dy));
        for (const cell of cells) cell.dy -= top;
        const solid = cells.filter(
            (cell) =>
                !spec.flat?.includes(cell.tile) &&
                (spec.solid ?? (cell.layer === STRUCTURES && kind !== "decal")),
        );
        def = setTileProperty(
            def,
            solid.map((cell) => cell.tile),
            "collides",
            "bool",
            true,
        );
        prefabs.push({
            id: spec.id,
            name: spec.name,
            tags: spec.tags,
            kind,
            w: spec.rows[0]!.length,
            h: height - top,
            cells,
            ...(spec.stretch ? { stretch: { left: spec.stretch[0], right: spec.stretch[1] } } : {}),
            ...(spec.weight ? { weight: spec.weight } : {}),
        });
    }
    for (const block of sheet.animations ?? []) {
        def = animateBlock(def, { ...block, count: 4, strideY: 0 });
    }

    write(`demo/${DIR}/${sheet.name}.tsj`, stringify(def));
    catalog[sheet.name] = {
        name: sheet.name,
        def,
        path: `${DIR}/${sheet.name}.tsj`,
        imagePath: image,
        origin: "tsj",
        readOnly: false,
    };
    if (prefabs.length) {
        const library: PrefabLibrary = {
            version: 1,
            tileset: sheet.name,
            themes: [THEME],
            prefabs,
        };
        libraries.push(library);
        write(
            `libraries/generic/${sheet.name}.prefabs.json`,
            JSON.stringify(library, null, 4) + "\n",
        );
    }
}

/** One example map per recipe: [recipe, width, height, seed]. */
const MAPS: [string, number, number, number][] = [
    ["entrance", 12, 10, 3],
    ["shrine", 11, 11, 2],
    ["camp", 11, 9, 5],
    ["ruin", 12, 10, 4],
    ["grove", 12, 11, 1],
];
const seeds = process.env.DEMO_SEEDS?.split(",").map(Number);

MAPS.forEach(([recipeId, width, height, seed], i) => {
    const result = generateValid(
        recipeById(recipeId)!,
        { width, height, seed: seeds?.[i] ?? seed, themes: [THEME], symmetry: true, density: 1 },
        {
            prefabs: flatten(libraries),
            layers: generic.tileLayers,
            solid: (cell, layer) =>
                generic.isSolid(tileProps(catalog[cell.tileset]!.def, cell.tile), layer),
        },
    );
    if (result.problems.length) throw new Error(`${recipeId}: ${result.problems.join("; ")}`);
    const mapPath = `maps/cave-${recipeId}.tmj`;
    const { map } = resultToMap(result, {
        mapPath,
        catalog,
        embed: generic.embed,
        order: { tileLayers: generic.tileLayers, objectLayers: generic.objectLayers },
        tileSize: generic.tileSize,
        tileLayers: generic.tileLayers,
        objectLayer: generic.defaultObjectLayer,
    });
    write(`demo/${mapPath}`, stringify(map));
    console.log(
        `${mapPath}: ${result.placements.length} placements${result.notes.length ? ` (${result.notes.join("; ")})` : ""}`,
    );
});
console.log(
    `demo: ${SHEETS.length} sheets, ${libraries.reduce((n, l) => n + l.prefabs.length, 0)} prefabs`,
);
