/**
 * Builds the bundled demo project: a small hand-drawn sheet, its .tsj, a
 * prefab library and a generated map. It lets the tool run with no game
 * checkout, and gives the docs and smoke test something to show.
 *
 *   npm run demo:build
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { animateBlock } from "../src/core/animation";
import { resultToMap } from "../src/core/build";
import type { Catalog } from "../src/core/doc";
import { generateValid } from "../src/core/generator";
import { flatten, type Prefab, type PrefabLibrary } from "../src/core/prefab";
import { recipeById } from "../src/core/recipes";
import { stringify } from "../src/core/tiled";
import { setTileProperty, tileProps, tilesetForImage } from "../src/core/tileset";
import { generic } from "../src/profiles/generic";
import { encodePng } from "./png";

const ROOT = resolve(import.meta.dirname, "..");
const T = 16;
const COLS = 8;
const ROWS = 5;
const W = COLS * T;
const H = ROWS * T;
const pixels = new Uint8Array(W * H * 4);

type Color = [number, number, number];
const INK: Color = [38, 34, 46];
const GRASS: Color = [96, 148, 78];
const GRASS_D: Color = [78, 126, 66];
const SOIL: Color = [150, 112, 78];
const SOIL_D: Color = [128, 94, 66];
const STONE: Color = [158, 160, 170];
const STONE_L: Color = [200, 202, 210];
const STONE_D: Color = [112, 114, 126];
const WOOD: Color = [124, 84, 52];
const LEAF: Color = [62, 132, 84];
const LEAF_L: Color = [98, 168, 104];
const FIRE: Color = [240, 120, 48];
const FIRE_L: Color = [252, 208, 92];
const BONE: Color = [232, 226, 208];
const CLOTH: Color = [188, 76, 70];
const DARK: Color = [44, 40, 56];

/** Draws into one tile; coordinates are tile-local. */
function tile(id: number) {
    const ox = (id % COLS) * T;
    const oy = Math.floor(id / COLS) * T;
    const px = (x: number, y: number, c: Color) => {
        if (x < 0 || y < 0 || x >= T || y >= T) return;
        const i = ((oy + y) * W + ox + x) * 4;
        pixels.set([c[0], c[1], c[2], 255], i);
    };
    const rect = (x: number, y: number, w: number, h: number, c: Color) => {
        for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) px(x + dx, y + dy, c);
    };
    /** A filled box with a one-pixel ink outline. */
    const box = (x: number, y: number, w: number, h: number, c: Color) => {
        rect(x, y, w, h, INK);
        rect(x + 1, y + 1, w - 2, h - 2, c);
    };
    const disc = (cx: number, cy: number, r: number, c: Color) => {
        for (let y = -r; y <= r; y++) {
            for (let x = -r; x <= r; x++) {
                const d = x * x + y * y;
                if (d <= r * r) px(cx + x, cy + y, d > (r - 1) * (r - 1) ? INK : c);
            }
        }
    };
    const dots = (c: Color, spots: [number, number][]) => spots.forEach(([x, y]) => px(x, y, c));
    return { px, rect, box, disc, dots };
}

// Row 0: ground and flat details.
tile(0).rect(0, 0, T, T, GRASS);
tile(0).dots(GRASS_D, [
    [3, 4],
    [4, 4],
    [10, 9],
    [11, 9],
    [6, 13],
    [13, 2],
]);
tile(1).rect(0, 0, T, T, SOIL);
tile(2).rect(0, 0, T, T, SOIL);
tile(2).dots(SOIL_D, [
    [3, 3],
    [4, 3],
    [4, 4],
    [11, 10],
    [12, 10],
    [7, 12],
]);
tile(3).rect(0, 0, T, T, SOIL);
tile(3).dots(SOIL_D, [
    [5, 6],
    [6, 6],
    [5, 7],
    [10, 3],
    [12, 12],
    [13, 12],
]);
{
    const t = tile(4); // skull
    t.box(5, 6, 7, 6, BONE);
    t.dots(INK, [
        [7, 8],
        [9, 8],
        [8, 10],
    ]);
}
{
    const t = tile(5); // flowers
    t.dots(LEAF, [
        [4, 10],
        [4, 11],
        [10, 8],
        [10, 9],
    ]);
    t.dots(FIRE_L, [
        [4, 9],
        [10, 7],
    ]);
    t.dots(CLOTH, [
        [3, 9],
        [5, 9],
        [9, 7],
        [11, 7],
    ]);
}
tile(6).disc(8, 11, 3, STONE); // pebble
tile(6).dots(STONE_L, [[7, 10]]);
tile(7).disc(8, 10, 5, LEAF); // bush
tile(7).dots(LEAF_L, [
    [6, 8],
    [7, 8],
    [9, 10],
]);

// Rows 1-2: the ridge (3 wide), the door (2 wide), tree, statue, pillar.
for (const [id, edgeL, edgeR] of [
    [8, true, false],
    [9, false, false],
    [10, false, true],
] as const) {
    const top = tile(id);
    top.rect(0, 2, T, 14, STONE_D);
    top.rect(0, 2, T, 3, STONE_L);
    top.rect(0, 1, T, 1, INK);
    top.dots(STONE, [
        [3, 9],
        [4, 9],
        [11, 12],
        [12, 12],
    ]);
    const face = tile(id + COLS);
    face.rect(0, 0, T, 13, STONE_D);
    face.rect(0, 13, T, 1, INK);
    face.dots(STONE, [
        [5, 3],
        [6, 3],
        [10, 8],
        [11, 8],
        [3, 10],
    ]);
    if (edgeL) [top, face].forEach((t, i) => t.rect(0, i ? 0 : 1, 1, i ? 14 : 15, INK));
    if (edgeR) [top, face].forEach((t, i) => t.rect(T - 1, i ? 0 : 1, 1, i ? 14 : 15, INK));
}
for (const [id, left] of [
    [11, true],
    [12, false],
] as const) {
    const top = tile(id);
    top.rect(0, 2, T, 14, STONE_D);
    top.rect(0, 2, T, 3, STONE_L);
    top.rect(0, 1, T, 1, INK);
    top.rect(left ? 5 : 0, 8, 11, 8, INK);
    top.rect(left ? 6 : 0, 9, 10, 7, WOOD);
    top.rect(left ? 8 : 0, 11, 8, 5, DARK);
    const base = tile(id + COLS);
    base.rect(0, 0, T, 13, STONE_D);
    base.rect(0, 13, T, 1, INK);
    base.rect(left ? 5 : 0, 0, 11, 14, INK);
    base.rect(left ? 6 : 0, 0, 10, 13, WOOD);
    base.rect(left ? 8 : 0, 0, 8, 13, DARK);
}
tile(13).disc(8, 9, 6, LEAF); // tree canopy
tile(13).dots(LEAF_L, [
    [6, 6],
    [7, 6],
    [10, 9],
    [5, 10],
]);
tile(21).box(6, 0, 4, 12, WOOD);
tile(21).disc(8, 0, 3, LEAF);
tile(14).box(5, 4, 6, 12, STONE_L); // statue
tile(14).disc(8, 4, 3, STONE_L);
tile(22).box(5, 0, 6, 8, STONE_L);
tile(22).box(3, 7, 10, 6, STONE);
tile(15).box(4, 6, 8, 10, STONE); // pillar
tile(15).box(3, 4, 10, 4, STONE_L);
tile(23).box(4, 0, 8, 10, STONE);
tile(23).box(3, 9, 10, 4, STONE_D);

// Row 3: torch and fire frames, tent.
for (let f = 0; f < 3; f++) {
    const torch = tile(24 + f);
    torch.box(7, 7, 3, 8, WOOD);
    torch.disc(8, 5 - (f === 1 ? 1 : 0), 3 - (f === 2 ? 1 : 0), FIRE);
    torch.dots(FIRE_L, [
        [8, 5],
        [8 + (f - 1), 4],
    ]);
    const fire = tile(27 + f);
    fire.box(3, 11, 10, 3, WOOD);
    fire.disc(8, 8 - (f === 1 ? 1 : 0), 4 - (f === 2 ? 1 : 0), FIRE);
    fire.dots(FIRE_L, [
        [8, 8],
        [7 + f, 7],
        [8, 9],
    ]);
}
for (const [id, left] of [
    [30, true],
    [31, false],
] as const) {
    const t = tile(id);
    for (let y = 3; y < 14; y++) {
        const span = y - 2;
        const x0 = left ? T - span : 0;
        t.rect(x0, y, Math.min(span, T), 1, CLOTH);
        t.px(left ? x0 : Math.min(span, T) - 1, y, INK);
    }
    t.rect(0, 14, T, 1, INK);
    t.rect(left ? 13 : 0, 8, 3, 6, DARK);
}

// Row 4: big rock, crate, wall block, fence, stone deck.
tile(32).disc(9, 9, 6, STONE);
tile(32).dots(STONE_L, [
    [7, 6],
    [8, 6],
    [6, 8],
]);
tile(33).disc(5, 10, 5, STONE);
tile(33).dots(STONE_L, [
    [4, 8],
    [5, 8],
]);
tile(34).box(3, 5, 10, 9, WOOD);
tile(34).rect(4, 9, 8, 1, INK);
tile(35).box(1, 4, 14, 10, STONE);
tile(35).rect(2, 8, 12, 1, STONE_D);
for (const id of [36, 37, 38]) {
    const t = tile(id);
    t.rect(0, 8, T, 2, WOOD);
    t.rect(0, 7, T, 1, INK);
    t.rect(0, 10, T, 1, INK);
    if (id !== 37) t.box(id === 36 ? 2 : 11, 4, 3, 10, WOOD);
    else t.box(6, 4, 3, 10, WOOD);
}
tile(39).rect(0, 0, T, T, STONE);
tile(39).rect(0, 0, T, 1, STONE_L);
tile(39).rect(0, 15, T, 1, STONE_D);
tile(39).rect(7, 0, 1, T, STONE_D);

// ── files ────────────────────────────────────────────────────────────────────

function write(path: string, data: string | Buffer) {
    const full = resolve(ROOT, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, data);
}

const SHEET = "tilesets/demo.png";
write(`demo/${SHEET}`, encodePng(W, H, pixels));

let def = tilesetForImage("demo", "demo.png", W, H, T);
const solid = [
    8, 9, 10, 16, 17, 18, 11, 12, 19, 20, 21, 22, 23, 6, 7, 24, 27, 30, 31, 32, 33, 34, 35, 36, 37,
    38,
];
def = setTileProperty(def, solid, "collides", "bool", true);
def = animateBlock(def, {
    col: 0,
    row: 3,
    w: 1,
    h: 1,
    count: 3,
    strideX: 1,
    strideY: 0,
    duration: 140,
});
def = animateBlock(def, {
    col: 3,
    row: 3,
    w: 1,
    h: 1,
    count: 3,
    strideX: 1,
    strideY: 0,
    duration: 120,
});
write("demo/tilesets/demo.tsj", stringify(def));

const one = (
    id: string,
    name: string,
    tags: string[],
    layer: string,
    t: number,
    kind: Prefab["kind"] = "fixed",
): Prefab => ({
    id,
    name,
    tags,
    kind,
    w: 1,
    h: 1,
    cells: [{ dx: 0, dy: 0, layer, tile: t }],
});
const tall = (id: string, name: string, tags: string[], top: number): Prefab => ({
    id,
    name,
    tags,
    kind: "fixed",
    w: 1,
    h: 2,
    cells: [
        { dx: 0, dy: 0, layer: "overhead", tile: top },
        { dx: 0, dy: 1, layer: "structures", tile: top + COLS },
    ],
});
const block = (
    id: string,
    name: string,
    tags: string[],
    tiles: number[][],
    kind: Prefab["kind"] = "fixed",
): Prefab => ({
    id,
    name,
    tags,
    kind,
    w: tiles[0]!.length,
    h: tiles.length,
    cells: tiles.flatMap((row, dy) =>
        row.map((t, dx) => ({ dx, dy, layer: "structures", tile: t })),
    ),
});

const library: PrefabLibrary = {
    version: 1,
    tileset: "demo",
    themes: [],
    prefabs: [
        one("soil", "Soil", ["soil"], "ground", 1, "decal"),
        one("soil-a", "Worn soil A", ["soil-deco"], "ground", 2, "decal"),
        one("soil-b", "Worn soil B", ["soil-deco"], "ground", 3, "decal"),
        one("skull", "Skull", ["bones"], "details", 4, "decal"),
        one("flowers", "Flowers", ["ground-deco"], "details", 5, "decal"),
        one("pebble", "Pebble", ["rock-small"], "structures", 6),
        one("bush", "Bush", ["plant"], "structures", 7),
        {
            ...block(
                "ridge",
                "Ridge",
                ["backdrop"],
                [
                    [8, 9, 10],
                    [16, 17, 18],
                ],
                "stretch",
            ),
            stretch: { left: 1, right: 1 },
        },
        block(
            "door",
            "Door",
            ["entrance"],
            [
                [11, 12],
                [19, 20],
            ],
        ),
        tall("tree", "Tree", ["tree"], 13),
        tall("statue", "Statue", ["statue", "shrine"], 14),
        tall("pillar", "Pillar", ["pillar"], 15),
        one("torch", "Torch", ["light"], "structures", 24),
        one("campfire", "Campfire", ["fire"], "structures", 27),
        block("tent", "Tent", ["tent"], [[30, 31]]),
        block("rock", "Big rock", ["rock"], [[32, 33]]),
        one("crate", "Crate", ["clutter"], "structures", 34),
        one("wall", "Wall block", ["wall"], "structures", 35),
        {
            ...block("fence", "Fence", ["fence"], [[36, 37, 38]], "stretch"),
            stretch: { left: 1, right: 1 },
        },
        one("deck", "Stone deck", ["apron"], "details", 39, "decal"),
    ],
};
write("libraries/generic/demo.prefabs.json", JSON.stringify(library, null, 4) + "\n");

const catalog: Catalog = {
    demo: {
        name: "demo",
        def,
        path: "tilesets/demo.tsj",
        imagePath: SHEET,
        origin: "tsj",
        readOnly: false,
    },
};
const result = generateValid(
    recipeById("entrance")!,
    { width: 12, height: 10, seed: 7, themes: [], symmetry: true, density: 1 },
    {
        prefabs: flatten([library]),
        layers: generic.tileLayers,
        solid: (cell, layer) => generic.isSolid(tileProps(def, cell.tile), layer),
    },
);
if (result.problems.length) throw new Error(result.problems.join("; "));
const { map } = resultToMap(result, {
    mapPath: "maps/entrance.tmj",
    catalog,
    embed: generic.embed,
    order: { tileLayers: generic.tileLayers, objectLayers: generic.objectLayers },
    tileSize: T,
    tileLayers: generic.tileLayers,
    objectLayer: generic.defaultObjectLayer,
});
write("demo/maps/entrance.tmj", stringify(map));
console.log(
    `demo: ${W}x${H} sheet, ${library.prefabs.length} prefabs, ${result.placements.length} placements`,
);
