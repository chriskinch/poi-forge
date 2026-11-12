/**
 * Phasercraft conventions (the game's docs/map-poi.md and docs/world-depth.md).
 * POIs are small .tmj files stamped into generated biome maps.
 */
import { cellOf, type Catalog, type Grid, type TilesetEntry } from "../core/doc";
import { baseIssues, type Issue, type Profile } from "../core/profile";
import { rng } from "../core/rng";
import { tileProps } from "../core/tileset";

const TILE_LAYERS = ["terrain", "terrain props", "paths", "structure", "structure props"];
const OBJECT_LAYERS = ["POI", "spawn", "collision map"];
const PROP_LAYERS = ["structure", "structure props"];
const COLLISION_LAYERS = ["terrain", "structure"];
const DEPTH_ROLES = ["collides", "solidCorners", "sortBase", "ground"];

// Corner-mask autotiling, as in the game's scripts/generate-biome-maps.mjs.
const NW = 1;
const NE = 2;
const SW = 4;
const SE = 8;
const PATH_BY_MASK: Record<number, number> = {
    [SE]: 12,
    [SW]: 13,
    [NE]: 20,
    [NW]: 21,
    [NW | NE]: 10,
    [SW | SE]: 26,
    [NW | SW]: 17,
    [NE | SE]: 19,
    [NW | NE | SW]: 9,
    [NW | NE | SE]: 11,
    [NW | SW | SE]: 25,
    [NE | SW | SE]: 27,
    15: 28,
};
const PATH_DECO = [14, 22, 29, 30];
const PATH_DECO_CHANCE = 0.22;
const GROUND = 46;
const POI_MARGIN = 2;
const POI_PAD_RADIUS = 2;
const CONTEXT_MARGIN = 5;

const BACKGROUNDS: Record<string, string> = {
    forest: "#4a7c3f",
    desert: "#d9c06a",
    tundra: "#e8eef2",
};

/** Biomes are the harvested variants that have both a ground and a path sheet. */
function biomes(catalog: Catalog): string[] {
    const variants = new Set<string>();
    for (const entry of Object.values(catalog)) if (entry.variant) variants.add(entry.variant);
    return [...variants].filter((v) => catalog[`${v}_`] && catalog[`${v}Path_`]).sort();
}

/**
 * The soil pad the game's generator lays under a POI, plus the start of its
 * trail: a rounded clearing two tiles wider than the POI, edged with the path
 * autotile.
 */
function context(map: { width: number; height: number }, variant: string, catalog: Catalog) {
    const ground = `${variant}_`;
    const path = `${variant}Path_`;
    if (!catalog[ground] || !catalog[path]) return null;

    const m = CONTEXT_MARGIN;
    const W = map.width + m * 2;
    const H = map.height + m * 2;
    const CW = W + 1;
    const corners = new Uint8Array(CW * (H + 1));
    const left = m - POI_MARGIN;
    const top = m - POI_MARGIN;
    const right = m + map.width + POI_MARGIN;
    const bottom = m + map.height + POI_MARGIN;

    for (let cy = 0; cy <= H; cy++) {
        for (let cx = 0; cx <= W; cx++) {
            const dx = Math.max(left + POI_PAD_RADIUS - cx, 0, cx - (right - POI_PAD_RADIUS));
            const dy = Math.max(top + POI_PAD_RADIUS - cy, 0, cy - (bottom - POI_PAD_RADIUS));
            if (Math.hypot(dx, dy) <= POI_PAD_RADIUS) corners[cy * CW + cx] = 1;
        }
    }

    // The trail leaves the pad's south edge heading south-west, as in game.
    const random = rng(0x9015);
    let cx = m + map.width / 2;
    let cy = bottom;
    let heading = (Math.PI * 3) / 4;
    for (let step = 0; step < W + H; step++) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const px = Math.round(cx) + dx;
                const py = Math.round(cy) + dy;
                if (px >= 0 && py >= 0 && px <= W && py <= H) corners[py * CW + px] = 1;
            }
        }
        heading += (random() - 0.5) * 0.45;
        cx += Math.cos(heading);
        cy += Math.sin(heading);
        if (cx < -2 || cy > H + 2 || cx > W + 2) break;
    }

    const at = (x: number, y: number) => corners[y * CW + x]!;
    // No tile exists for the two diagonal masks: smooth them away.
    for (let pass = 0; pass < 12; pass++) {
        let changed = false;
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const nw = at(x, y);
                const ne = at(x + 1, y);
                const sw = at(x, y + 1);
                const se = at(x + 1, y + 1);
                if (nw && se && !ne && !sw) {
                    corners[(y + 1) * CW + x + 1] = 0;
                    changed = true;
                } else if (ne && sw && !nw && !se) {
                    corners[(y + 1) * CW + x] = 0;
                    changed = true;
                }
            }
        }
        if (!changed) break;
    }

    const terrain: Grid = new Array(W * H).fill(null);
    const paths: Grid = new Array(W * H).fill(null);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            terrain[y * W + x] = { tileset: ground, tile: GROUND };
            const mask =
                (at(x, y) ? NW : 0) |
                (at(x + 1, y) ? NE : 0) |
                (at(x, y + 1) ? SW : 0) |
                (at(x + 1, y + 1) ? SE : 0);
            if (!mask) continue;
            const tile =
                mask === 15 && random() < PATH_DECO_CHANCE
                    ? PATH_DECO[Math.floor(random() * PATH_DECO.length)]!
                    : PATH_BY_MASK[mask]!;
            paths[y * W + x] = { tileset: path, tile };
        }
    }
    return {
        margin: m,
        background: BACKGROUNDS[variant] ?? "#3a3a3a",
        layers: { terrain, paths },
    };
}

/**
 * Prop layers depth-sort against characters, so every tile on one needs a
 * role: solid, anchored to a base row, or flat ground.
 */
function tileProblem(entry: TilesetEntry, tile: number, layer: string): string | null {
    if (!PROP_LAYERS.includes(layer)) return null;
    const props = tileProps(entry.def, tile);
    if (DEPTH_ROLES.some((role) => role in props)) return null;
    return entry.variant
        ? `${entry.name}:${tile} has no depth role in the ${entry.variant} map: it won't collide or sort in game.`
        : `${entry.name}:${tile} has no depth role. Give it collides, sortBase or ground.`;
}

export const phasercraft: Profile = {
    id: "phasercraft",
    label: "Phasercraft",
    tileSize: 16,
    roots: {
        maps: "assets/maps/poi",
        tilesets: "public/graphics/tilesets",
        sources: "assets/source",
    },
    tileLayers: TILE_LAYERS,
    objectLayers: OBJECT_LAYERS,
    propLayers: PROP_LAYERS,
    defaultObjectLayer: "POI",
    tileProperties: [
        {
            name: "collides",
            type: "bool",
            label: "Collides",
            color: "#ff4d4d",
            help: "Blocks the player (whole tile) on terrain and structure.",
        },
        {
            name: "sortBase",
            type: "int",
            label: "Sort base",
            color: "#4da6ff",
            help: "Rows down to the prop's bottom row. Upper pieces of a standing prop.",
        },
        {
            name: "ground",
            type: "bool",
            label: "Ground",
            color: "#59d98e",
            help: "Flat walkable art on a prop layer; never drawn over characters.",
        },
        {
            name: "solidCorners",
            type: "corners",
            label: "Solid corners",
            color: "#ffb84d",
            help: "Blocks only the marked quadrants. Needs Ground too.",
        },
    ],
    harvest: { dir: "public/graphics/tilesets/biomes", suffix: "-map.tmj" },
    // Biome sheets keep the biome's own definition, so they are embedded by
    // name; everything else is a shared external .tsj.
    embed: (entry) => entry.origin === "map" || !entry.path,
    layerFor: (props, rowFromBottom) =>
        props.ground === true || rowFromBottom === 0 ? "structure" : "structure props",
    depthRole: (rowFromBottom) =>
        rowFromBottom === 0
            ? [{ name: "collides", type: "bool", value: true }]
            : [{ name: "sortBase", type: "int", value: rowFromBottom }],
    isSolid: (props, layer) =>
        COLLISION_LAYERS.includes(layer) &&
        (props.collides === true || Number(props.solidCorners ?? 0) > 0),
    tileProblem,
    contexts: biomes,
    context,
    themesFor: (variant) => [variant],
    validate(input) {
        const { map, sets, catalog } = input;
        const issues: Issue[] = baseIssues(input, (gid) => cellOf(gid, sets));
        const reported = new Set<string>();

        for (const layer of map.layers) {
            if (layer.type === "tilelayer" && !TILE_LAYERS.includes(layer.name)) {
                issues.push({
                    level: "error",
                    message: `Unknown tile layer "${layer.name}". The generator only stamps: ${TILE_LAYERS.join(", ")}.`,
                    layer: layer.name,
                });
            }
            if (layer.type === "objectgroup" && !OBJECT_LAYERS.includes(layer.name)) {
                issues.push({
                    level: "error",
                    message: `Unknown object layer "${layer.name}". Use: ${OBJECT_LAYERS.join(", ")}.`,
                    layer: layer.name,
                });
            }
            if (layer.type !== "tilelayer") continue;

            (layer.data ?? []).forEach((gid, i) => {
                const cell = cellOf(gid, sets);
                const entry = cell && catalog[cell.tileset];
                if (!cell || !entry) return;
                const props = tileProps(entry.def, cell.tile);
                const at = { layer: layer.name, x: i % map.width, y: Math.floor(i / map.width) };
                const key = `${layer.name}|${cell.tileset}|${cell.tile}`;

                const problem = tileProblem(entry, cell.tile, layer.name);
                if (problem) {
                    // Biome sheets get their roles from the game's generator,
                    // so the fix isn't in this map: a warning, not an error.
                    issues.push({
                        level: entry.variant ? "warning" : "error",
                        message: problem,
                        ...at,
                        ...cell,
                    });
                }
                if ("solidCorners" in props && props.ground !== true) {
                    if (!reported.has(`ground|${key}`)) {
                        issues.push({
                            level: "error",
                            message: `${cell.tileset}:${cell.tile} has solidCorners without ground: true.`,
                            ...at,
                            ...cell,
                        });
                    }
                    reported.add(`ground|${key}`);
                }
                if (layer.name === "terrain props") {
                    if (!reported.has("terrain props")) {
                        issues.push({
                            level: "warning",
                            message:
                                "terrain props draws under paths: on the soil pad these tiles are hidden. Use structure with ground: true.",
                            ...at,
                        });
                    }
                    reported.add("terrain props");
                }
            });
        }

        for (const layer of map.layers) {
            for (const object of layer.objects ?? []) {
                if (layer.name === "POI" && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(object.name)) {
                    issues.push({
                        level: "warning",
                        message: `POI zone "${object.name}" should be named in kebab-case.`,
                        layer: layer.name,
                    });
                }
            }
        }
        return issues;
    },
};
