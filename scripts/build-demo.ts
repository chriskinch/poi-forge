/**
 * Builds the bundled example project from the forest sheets in
 * demo/tilesets/forest_/: a .tsj per sheet (collision and animations), the
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
const DIR = "tilesets/forest_";
const THEME = "forest";
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
        name: "forest_",
        specs: [
            {
                id: "grass",
                name: "Grass",
                tags: ["grass"],
                rows: [[46]],
                kind: "decal",
                layer: GROUND,
            },
            ...many(
                "grass-deco",
                "Grass detail",
                ["grass-deco"],
                [30, 31, 32, 33, 52, 53, 54, 55, 76, 77, 98, 99],
                {
                    kind: "decal",
                    layer: GROUND,
                },
            ),
            {
                id: "plateau",
                name: "Plateau",
                tags: ["backdrop"],
                rows: [
                    [23, 24, 27],
                    [45, 46, 49],
                    [67, 68, 71],
                    [89, 90, 93],
                ],
                kind: "stretch",
                layer: STRUCTURES,
                stretch: [1, 1],
                // The plateau's top is the ordinary grass tile.
                flat: [46, 68],
            },
            {
                id: "cave-mouth",
                name: "Cave mouth",
                tags: ["entrance"],
                rows: [
                    [72, 73, 74, 75],
                    [94, 95, 96, 97],
                ],
                layer: STRUCTURES,
            },
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
        ],
        animations: [{ col: 4, row: 5, w: 2, h: 2, strideX: 5, duration: 220 }],
    },
    {
        name: "forestPath_",
        specs: [
            {
                id: "soil",
                name: "Soil",
                tags: ["soil"],
                rows: [[28]],
                kind: "decal",
                layer: GROUND,
            },
            ...many("soil-deco", "Worn soil", ["soil-deco"], [14, 22, 29, 30], {
                kind: "decal",
                layer: GROUND,
            }),
        ],
    },
    {
        name: "forest_ [resources]",
        specs: [
            { id: "tree-olive", name: "Olive tree", tags: ["tree"], rows: [[13], [25]] },
            { id: "tree-autumn", name: "Autumn tree", tags: ["tree"], rows: [[14], [26]] },
            {
                id: "tree-blossom",
                name: "Blossom tree",
                tags: ["tree"],
                rows: [
                    [16, 17],
                    [28, 29],
                ],
                weight: 0.6,
            },
            { id: "tree-pine", name: "Pine", tags: ["tree"], rows: [[18], [30]] },
            ...many("mushroom", "Mushroom", ["plant"], [19, 20, 21, 22, 31, 32, 33, 34], {
                layer: STRUCTURES,
                weight: 0.3,
            }),
            { id: "bush", name: "Bush", tags: ["plant"], rows: [[37]], layer: STRUCTURES },
            { id: "bushes", name: "Bushes", tags: ["plant"], rows: [[49]], layer: STRUCTURES },
            {
                id: "rock-big",
                name: "Big rock",
                tags: ["rock"],
                rows: [
                    [38, 39],
                    [50, 51],
                ],
            },
            { id: "rock", name: "Rock", tags: ["rock-small"], rows: [[40]], layer: STRUCTURES },
            { id: "rocks", name: "Rocks", tags: ["rock-small"], rows: [[52]], layer: STRUCTURES },
            ...many("ore", "Ore rock", ["rock-small", "ore"], [41, 42, 53, 54], {
                layer: STRUCTURES,
                weight: 0.4,
            }),
            ...many(
                "flower",
                "Flowers",
                ["ground-deco", "flower"],
                [43, 44, 45, 46, 55, 56, 57, 58, 67, 68, 69, 70, 79, 80, 81, 82],
                {
                    kind: "decal",
                    layer: DETAILS,
                },
            ),
            { id: "chest", name: "Chest", tags: ["clutter"], rows: [[61], [73]] },
            {
                id: "chest-open",
                name: "Open chest",
                tags: ["clutter"],
                rows: [[62], [74]],
                weight: 0.5,
            },
            {
                id: "chest-big",
                name: "Big chest",
                tags: ["clutter"],
                rows: [
                    [63, 64],
                    [75, 76],
                ],
                weight: 0.5,
            },
            {
                id: "chest-big-open",
                name: "Big open chest",
                tags: ["clutter"],
                rows: [
                    [65, 66],
                    [77, 78],
                ],
                weight: 0.3,
            },
            { id: "sign", name: "Sign", tags: ["sign"], rows: [[85], [97]] },
            { id: "grave-a", name: "Gravestone A", tags: ["grave"], rows: [[86], [98]] },
            { id: "grave-b", name: "Gravestone B", tags: ["grave"], rows: [[87], [99]] },
            { id: "grave-c", name: "Gravestone C", tags: ["grave"], rows: [[88], [100]] },
            {
                id: "campfire-unlit",
                name: "Unlit campfire",
                tags: ["clutter"],
                rows: [[102]],
                layer: STRUCTURES,
                weight: 0.5,
            },
            { id: "campfire", name: "Campfire", tags: ["fire"], rows: [[91], [103]], weight: 4 },
        ],
        animations: [{ col: 7, row: 7, w: 1, h: 2, strideX: 1, duration: 140 }],
    },
    {
        name: "forest_ [fencesAndWalls]",
        specs: [
            {
                id: "fence",
                name: "Wooden fence",
                tags: ["fence"],
                rows: [[61, 62, 63]],
                kind: "stretch",
                layer: STRUCTURES,
                stretch: [1, 1],
            },
            {
                id: "wall",
                name: "Stone wall",
                tags: ["wall"],
                rows: [
                    [77, 78, 79],
                    [92, 93, 94],
                ],
                weight: 0.5,
            },
            { id: "pillar", name: "Stone pillar", tags: ["pillar"], rows: [[76], [91]] },
            ...many("block", "Stone block", ["pillar", "seat"], [107, 122, 124], {
                layer: STRUCTURES,
            }),
            { id: "lantern", name: "Lantern", tags: ["light"], rows: [[108]], layer: STRUCTURES },
            {
                id: "ruined-arch",
                name: "Ruined arch",
                tags: ["wall", "arch"],
                rows: [
                    [128, 129, 130],
                    [143, 144, 145],
                ],
                weight: 0.4,
            },
            {
                id: "pillar-left",
                name: "Broken pillar (left)",
                tags: ["pillar"],
                rows: [[131], [146]],
            },
            {
                id: "pillar-right",
                name: "Broken pillar (right)",
                tags: ["pillar"],
                rows: [[133], [148]],
            },
        ],
    },
    {
        name: "forest_ [fountain]",
        specs: [
            {
                id: "fountain",
                name: "Fountain",
                tags: ["fountain", "shrine"],
                rows: [
                    [1, 2, 3, 4],
                    [19, 20, 21, 22],
                    [37, 38, 39, 40],
                    [55, 56, 57, 58],
                    [73, 74, 75, 76],
                ],
                layer: STRUCTURES,
                overheadRows: 1,
            },
        ],
        animations: [{ col: 1, row: 0, w: 4, h: 5, strideX: 4, duration: 180 }],
    },
    { name: "forest_ [bridgeAnimatedTiles]", specs: [] },
    { name: "forest_ [bridgeHorizontal]", specs: [] },
    { name: "forest_ [bridgeVertical]", specs: [] },
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
            h: height,
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
    const mapPath = `maps/forest-${recipeId}.tmj`;
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
