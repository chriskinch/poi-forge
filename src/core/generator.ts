/**
 * Recipe-driven POI generator. A recipe is a list of steps that place prefabs
 * picked by tag; the same recipe, parameters, library and seed always give the
 * same result.
 */
import type { Cell, Grid } from "./doc";
import { expand, minWidth, type LibPrefab, type PlacedCell } from "./prefab";
import { int, rng, shuffle, weighted, type Rng } from "./rng";

type Range = [number, number];

interface StepBase {
    /** Prefabs must carry every one of these tags… */
    tags?: string[];
    /** …and at least one of these, when given. */
    any?: string[];
    /** A missing prefab for an optional step is not reported. */
    optional?: boolean;
    /** Chance the step runs at all. Default 1. */
    chance?: number;
}

export type Zone = "field" | "edges" | "back" | "front" | "corners";

export type Step =
    /** Covers the whole map with a 1×1 ground prefab, with occasional variants. */
    | (StepBase & { type: "fill"; decoTags?: string[]; decoChance?: number })
    /** A `stretch` prefab across the full width at the top. */
    | (StepBase & { type: "backdrop" })
    /**
     * The centrepiece. `backdrop` sets it into the backdrop's bottom rows,
     * `center` in the middle of the map. A lane from it to the south edge is
     * kept clear. `zone` adds a named object at its doorstep.
     */
    | (StepBase & {
          type: "focal";
          anchor: "backdrop" | "center";
          zone?: { name: string; properties?: Record<string, string | number | boolean> };
      })
    /** Ground art in front of the focal prefab, `depth` rows deep. */
    | (StepBase & { type: "apron"; depth: Range; pad?: Range })
    /** Mirrored pairs either side of the lane. `gap` is tiles from the lane. */
    | (StepBase & { type: "flank"; pairs: Range; gap: Range; row?: Range })
    /** Items spaced around the focal point, leaving the south side open. */
    | (StepBase & { type: "ring"; count: Range; radius: Range })
    /** Items along an inset rectangle, with gaps: ruined walls, fences. */
    | (StepBase & { type: "outline"; inset: Range; fill: number })
    /** Loose items. `per100` is the count per 100 tiles before the density slider. */
    | (StepBase & { type: "scatter"; per100: Range; zone?: Zone; cluster?: number })
    /** Flat 1×1 ground art on free cells. */
    | (StepBase & { type: "decal"; chance: number; zone?: Zone });

export interface Recipe {
    id: string;
    name: string;
    description: string;
    /** Width and height: [min, max, default]. */
    size: { w: [number, number, number]; h: [number, number, number] };
    steps: Step[];
}

export interface GenParams {
    width: number;
    height: number;
    seed: number;
    /** Only prefabs sharing one of these themes (or with none) are used. */
    themes: string[];
    symmetry: boolean;
    /** Multiplier on scatter counts and decal chances. 1 is the recipe's own. */
    density: number;
}

export interface GenContext {
    prefabs: readonly LibPrefab[];
    /** Tile layers, bottom to top. */
    layers: readonly string[];
    /** Whether a tile blocks movement on a layer. */
    solid: (cell: Cell, layer: string) => boolean;
    /** Cells to keep exactly as they are: nothing is placed on them. */
    locks?: readonly { x: number; y: number; cells: Record<string, Cell | null> }[];
}

export interface GenObject {
    name: string;
    /** In tiles. */
    x: number;
    y: number;
    w: number;
    h: number;
    properties?: Record<string, string | number | boolean>;
}

export interface GenPlacement {
    step: string;
    prefab: string;
    tileset: string;
    x: number;
    y: number;
    width: number;
}

export interface GenResult {
    recipe: string;
    params: GenParams;
    width: number;
    height: number;
    layers: Record<string, Grid>;
    objects: GenObject[];
    placements: GenPlacement[];
    /** Why the result is not usable. Empty means valid. */
    problems: string[];
    /** Steps that found no matching prefab. */
    notes: string[];
}

interface State {
    w: number;
    h: number;
    random: Rng;
    params: GenParams;
    ctx: GenContext;
    layers: Record<string, Grid>;
    /** A prop already stands here. */
    taken: Uint8Array;
    /** Must stay walkable: nothing solid may go here. */
    reserved: Uint8Array;
    /** Rows covered by the backdrop. */
    backRows: number;
    focal?: { x: number; y: number; w: number; h: number };
    lane?: { x0: number; x1: number; y0: number };
    objects: GenObject[];
    placements: GenPlacement[];
    notes: string[];
}

const between = (random: Rng, [min, max]: Range): number => int(random, min, max);

function eligible(state: State, step: StepBase, kind?: (prefab: LibPrefab) => boolean) {
    const { themes } = state.params;
    return state.ctx.prefabs.filter(
        (prefab) =>
            (step.tags ?? []).every((tag) => prefab.tags.includes(tag)) &&
            (!step.any?.length || step.any.some((tag) => prefab.tags.includes(tag))) &&
            (step.tags?.length || step.any?.length) &&
            (!themes.length ||
                !prefab.themes.length ||
                prefab.themes.some((theme) => themes.includes(theme))) &&
            (!kind || kind(prefab)),
    );
}

const choose = (state: State, prefabs: readonly LibPrefab[]): LibPrefab =>
    weighted(state.random, prefabs, (prefab) => prefab.weight ?? 1);

const isSolidCell = (state: State, placed: PlacedCell): boolean =>
    state.ctx.solid(placed.cell, placed.layer);

function fits(state: State, cells: readonly PlacedCell[], x: number, y: number): boolean {
    for (const placed of cells) {
        const cx = x + placed.dx;
        const cy = y + placed.dy;
        if (cx < 0 || cy < 0 || cx >= state.w || cy >= state.h) return false;
        const i = cy * state.w + cx;
        if (state.taken[i]) return false;
        if (state.reserved[i] && isSolidCell(state, placed)) return false;
    }
    return true;
}

function put(
    state: State,
    step: string,
    prefab: LibPrefab,
    x: number,
    y: number,
    width = prefab.w,
    claim = true,
) {
    for (const placed of expand(prefab, width)) {
        const cx = x + placed.dx;
        const cy = y + placed.dy;
        if (cx < 0 || cy < 0 || cx >= state.w || cy >= state.h) continue;
        const grid = (state.layers[placed.layer] ??= new Array(state.w * state.h).fill(null));
        grid[cy * state.w + cx] = placed.cell;
        if (claim) state.taken[cy * state.w + cx] = 1;
    }
    state.placements.push({ step, prefab: prefab.id, tileset: prefab.tileset, x, y, width });
}

/** Places with its bottom-centre near (cx, by), trying neighbours when blocked. */
function putNear(state: State, step: string, prefab: LibPrefab, cx: number, by: number): boolean {
    const cells = expand(prefab);
    const offsets = [
        [0, 0],
        [-1, 0],
        [1, 0],
        [0, 1],
        [0, -1],
        [-1, 1],
        [1, 1],
        [-1, -1],
        [1, -1],
    ];
    for (const [ox, oy] of offsets) {
        const x = Math.round(cx - prefab.w / 2) + ox!;
        const y = by - prefab.h + 1 + oy!;
        if (fits(state, cells, x, y)) {
            put(state, step, prefab, x, y);
            return true;
        }
    }
    return false;
}

function inZone(state: State, zone: Zone | undefined, x: number, y: number): boolean {
    const { w, h, backRows } = state;
    if (y < backRows) return false;
    const side = Math.min(x, w - 1 - x);
    switch (zone) {
        case "edges":
            return side <= 1 || y >= h - 2;
        case "back":
            return y <= backRows + 1;
        case "front":
            return y >= Math.floor((backRows + h) / 2);
        case "corners":
            return side <= 2 && (y <= backRows + 1 || y >= h - 3);
        default:
            return true;
    }
}

function skip(state: State, step: Step, what: string) {
    if (!step.optional) state.notes.push(`${step.type}: no prefab tagged ${what}`);
}

const describe = (step: StepBase): string =>
    [...(step.tags ?? []), ...(step.any?.length ? [`(${step.any.join(" | ")})`] : [])].join(" + ");

// ── steps ────────────────────────────────────────────────────────────────────

function fill(state: State, step: Extract<Step, { type: "fill" }>) {
    const base = eligible(state, step, (p) => p.w === 1 && p.h === 1);
    if (!base.length) return skip(state, step, describe(step));
    const deco = step.decoTags
        ? eligible(state, { tags: step.decoTags }, (p) => p.w === 1 && p.h === 1)
        : [];
    const ground = choose(state, base);
    const chance = (step.decoChance ?? 0) * state.params.density;
    for (let y = 0; y < state.h; y++) {
        for (let x = 0; x < state.w; x++) {
            const prefab = deco.length && state.random() < chance ? choose(state, deco) : ground;
            for (const placed of expand(prefab)) {
                const grid = (state.layers[placed.layer] ??= new Array(state.w * state.h).fill(
                    null,
                ));
                grid[y * state.w + x] = placed.cell;
            }
        }
    }
    state.placements.push({
        step: "fill",
        prefab: ground.id,
        tileset: ground.tileset,
        x: 0,
        y: 0,
        width: state.w,
    });
}

function backdrop(state: State, step: Extract<Step, { type: "backdrop" }>) {
    const options = eligible(
        state,
        step,
        (p) => p.kind === "stretch" && minWidth(p) <= state.w && p.h < state.h - 2,
    );
    if (!options.length) return skip(state, step, describe(step));
    const prefab = choose(state, options);
    put(state, "backdrop", prefab, 0, 0, state.w);
    state.backRows = prefab.h;
    // Nothing else stands on the backdrop's rows, filled or not.
    state.taken.fill(1, 0, prefab.h * state.w);
}

function focal(state: State, step: Extract<Step, { type: "focal" }>) {
    const options = eligible(
        state,
        step,
        (p) => p.kind !== "stretch" && p.w <= state.w - 2 && p.h <= state.h - 2,
    );
    if (!options.length) return skip(state, step, describe(step));
    const prefab = choose(state, options);
    const slack = state.w - prefab.w;
    // An odd gap can't centre exactly: lean either way.
    const x = Math.floor(slack / 2) + (slack % 2 ? int(state.random, 0, 1) : 0);
    const inBackdrop = step.anchor === "backdrop" && state.backRows >= prefab.h;
    const y = inBackdrop
        ? state.backRows - prefab.h
        : step.anchor === "backdrop"
          ? 0
          : Math.max(state.backRows, Math.floor((state.h - prefab.h) / 2));
    put(state, "focal", prefab, x, y);
    state.focal = { x, y, w: prefab.w, h: prefab.h };

    // The lane: the doorstep and everything south of it.
    const doorW = Math.min(prefab.w, 3);
    const x0 = x + Math.floor((prefab.w - doorW) / 2);
    const y0 = y + prefab.h;
    state.lane = { x0, x1: x0 + doorW - 1, y0 };
    for (let ly = y0; ly < state.h; ly++) {
        for (let lx = x0; lx < x0 + doorW; lx++) state.reserved[ly * state.w + lx] = 1;
    }
    if (step.zone && y0 < state.h) {
        state.objects.push({
            name: step.zone.name,
            x: x0,
            y: y0,
            w: doorW,
            h: 1,
            ...(step.zone.properties ? { properties: step.zone.properties } : {}),
        });
    }
}

function apron(state: State, step: Extract<Step, { type: "apron" }>) {
    const { lane } = state;
    if (!lane) return;
    const options = eligible(state, step);
    if (!options.length) return skip(state, step, describe(step));
    const prefab = choose(state, options);
    const cells = expand(prefab);
    const depth = between(state.random, step.depth);
    const pad = between(state.random, step.pad ?? [0, 0]);
    const x0 = Math.max(0, lane.x0 - pad);
    const x1 = Math.min(state.w - 1, lane.x1 + pad);
    for (let y = lane.y0; y + prefab.h <= Math.min(state.h, lane.y0 + depth); y += prefab.h) {
        for (let x = x0; x + prefab.w - 1 <= x1; x += prefab.w) {
            if (fits(state, cells, x, y)) put(state, "apron", prefab, x, y);
        }
    }
}

function flank(state: State, step: Extract<Step, { type: "flank" }>) {
    const lane = state.lane ?? {
        x0: Math.floor(state.w / 2),
        x1: Math.floor((state.w - 1) / 2),
        y0: state.backRows,
    };
    const options = eligible(state, step, (p) => p.kind !== "stretch");
    if (!options.length) return skip(state, step, describe(step));
    const pairs = between(state.random, step.pairs);
    for (let n = 0; n < pairs; n++) {
        const prefab = choose(state, options);
        const other = state.params.symmetry ? prefab : choose(state, options);
        const gap = between(state.random, step.gap) + n;
        const row = lane.y0 + between(state.random, step.row ?? [0, 0]) + n;
        for (let tries = 0; tries < 3; tries++) {
            const by = row + tries;
            const leftX = lane.x0 - gap - prefab.w;
            const rightX = lane.x1 + 1 + gap;
            const ly = by - prefab.h + 1;
            const ry = by - other.h + 1;
            if (fits(state, expand(prefab), leftX, ly) && fits(state, expand(other), rightX, ry)) {
                put(state, "flank", prefab, leftX, ly);
                put(state, "flank", other, rightX, ry);
                break;
            }
        }
    }
}

function ring(state: State, step: Extract<Step, { type: "ring" }>) {
    const options = eligible(state, step, (p) => p.kind !== "stretch");
    if (!options.length) return skip(state, step, describe(step));
    const centre = state.focal
        ? { x: state.focal.x + state.focal.w / 2, y: state.focal.y + state.focal.h - 0.5 }
        : { x: state.w / 2, y: (state.backRows + state.h) / 2 };
    const count = between(state.random, step.count);
    const radius = between(state.random, step.radius);
    // Leave the south open: spread over the other 260 degrees.
    const open = (100 * Math.PI) / 180;
    const start = Math.PI / 2 + open / 2;
    const sweep = Math.PI * 2 - open;
    const same = state.params.symmetry ? choose(state, options) : undefined;
    for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const angle =
            start + sweep * t + (state.params.symmetry ? 0 : (state.random() - 0.5) * 0.4);
        const prefab = same ?? choose(state, options);
        const px = centre.x + Math.cos(angle) * radius;
        const py = centre.y + Math.sin(angle) * radius * 0.8;
        putNear(state, "ring", prefab, px, Math.round(py));
    }
}

function outline(state: State, step: Extract<Step, { type: "outline" }>) {
    const options = eligible(state, step, (p) => p.kind !== "stretch");
    if (!options.length) return skip(state, step, describe(step));
    const inset = between(state.random, step.inset);
    const x0 = inset;
    const x1 = state.w - 1 - inset;
    const y0 = state.backRows + inset;
    const y1 = state.h - 1 - inset;
    if (x1 - x0 < 3 || y1 - y0 < 3) return;
    const spots: [number, number][] = [];
    for (let x = x0; x <= x1; x++) spots.push([x, y0], [x, y1]);
    for (let y = y0 + 1; y < y1; y++) spots.push([x0, y], [x1, y]);
    const half = state.params.symmetry;
    for (const [x, y] of spots) {
        if (half && x > (state.w - 1) / 2) continue;
        if (state.random() > step.fill) continue;
        const prefab = choose(state, options);
        const placed = putNearExact(state, "outline", prefab, x, y);
        if (placed && half) {
            const mx = state.w - 1 - x - (prefab.w - 1);
            if (mx !== x) putNearExact(state, "outline", prefab, mx, y);
        }
    }
}

/** Places with its bottom-left at (x, by) or not at all. */
function putNearExact(state: State, step: string, prefab: LibPrefab, x: number, by: number) {
    const y = by - prefab.h + 1;
    if (!fits(state, expand(prefab), x, y)) return false;
    put(state, step, prefab, x, y);
    return true;
}

function scatter(state: State, step: Extract<Step, { type: "scatter" }>) {
    const options = eligible(state, step, (p) => p.kind !== "stretch");
    if (!options.length) return skip(state, step, describe(step));
    const spots: [number, number][] = [];
    for (let y = 0; y < state.h; y++) {
        for (let x = 0; x < state.w; x++) if (inZone(state, step.zone, x, y)) spots.push([x, y]);
    }
    if (!spots.length) return;
    const rate = step.per100[0] + state.random() * (step.per100[1] - step.per100[0]);
    let count = Math.round(((rate * state.w * state.h) / 100) * state.params.density);
    const order = shuffle(state.random, spots);
    let last: [number, number] | undefined;
    for (let i = 0; i < order.length && count > 0; i++) {
        let [x, y] = order[i]!;
        // Clusters read as deliberate; lone items dotted about read as noise.
        if (last && state.random() < (step.cluster ?? 0)) {
            x = last[0] + int(state.random, -2, 2);
            y = last[1] + int(state.random, -1, 1);
            if (!inZone(state, step.zone, x, y)) continue;
        }
        const prefab = choose(state, options);
        if (!putNearExact(state, "scatter", prefab, x, y)) continue;
        count--;
        last = [x, y];
        if (state.params.symmetry) {
            const mx = state.w - x - prefab.w;
            if (mx !== x && putNearExact(state, "scatter", prefab, mx, y)) count--;
        }
    }
}

function decal(state: State, step: Extract<Step, { type: "decal" }>) {
    const options = eligible(state, step, (p) => p.w === 1 && p.h === 1);
    if (!options.length) return skip(state, step, describe(step));
    const chance = step.chance * state.params.density;
    for (let y = 0; y < state.h; y++) {
        for (let x = 0; x < state.w; x++) {
            const i = y * state.w + x;
            if (state.taken[i] || !inZone(state, step.zone, x, y)) continue;
            if (state.random() >= chance) continue;
            const prefab = choose(state, options);
            const [placed] = expand(prefab);
            if (!placed || state.layers[placed.layer]?.[i]) continue;
            if (state.reserved[i] && isSolidCell(state, placed)) continue;
            // A decal sits on the ground: later decals may not stack on it,
            // but it does not count as a standing prop.
            put(state, "decal", prefab, x, y, 1, false);
        }
    }
}

// ── driver ───────────────────────────────────────────────────────────────────

/** Tiles reachable on foot from the south edge. */
export function walkable(
    layers: Record<string, Grid>,
    w: number,
    h: number,
    solid: GenContext["solid"],
): Uint8Array {
    const blocked = new Uint8Array(w * h);
    for (const [layer, grid] of Object.entries(layers)) {
        grid.forEach((cell, i) => {
            if (cell && solid(cell, layer)) blocked[i] = 1;
        });
    }
    const seen = new Uint8Array(w * h);
    const queue: number[] = [];
    for (let x = 0; x < w; x++) {
        const i = (h - 1) * w + x;
        if (!blocked[i]) {
            seen[i] = 1;
            queue.push(i);
        }
    }
    while (queue.length) {
        const i = queue.pop()!;
        const x = i % w;
        const y = Math.floor(i / w);
        for (const [nx, ny] of [
            [x + 1, y],
            [x - 1, y],
            [x, y + 1],
            [x, y - 1],
        ]) {
            if (nx! < 0 || ny! < 0 || nx! >= w || ny! >= h) continue;
            const n = ny! * w + nx!;
            if (blocked[n] || seen[n]) continue;
            seen[n] = 1;
            queue.push(n);
        }
    }
    return seen;
}

export function generate(recipe: Recipe, params: GenParams, ctx: GenContext): GenResult {
    const w = params.width;
    const h = params.height;
    const state: State = {
        w,
        h,
        random: rng(params.seed),
        params,
        ctx,
        layers: Object.fromEntries(ctx.layers.map((name) => [name, new Array(w * h).fill(null)])),
        taken: new Uint8Array(w * h),
        reserved: new Uint8Array(w * h),
        backRows: 0,
        objects: [],
        placements: [],
        notes: [],
    };
    for (const lock of ctx.locks ?? []) {
        if (lock.x >= 0 && lock.y >= 0 && lock.x < w && lock.y < h) {
            state.taken[lock.y * w + lock.x] = 1;
        }
    }

    for (const step of recipe.steps) {
        // Always draw, so skipping a step doesn't shift every later roll.
        const roll = state.random();
        if (step.chance !== undefined && roll >= step.chance) continue;
        switch (step.type) {
            case "fill":
                fill(state, step);
                break;
            case "backdrop":
                backdrop(state, step);
                break;
            case "focal":
                focal(state, step);
                break;
            case "apron":
                apron(state, step);
                break;
            case "flank":
                flank(state, step);
                break;
            case "ring":
                ring(state, step);
                break;
            case "outline":
                outline(state, step);
                break;
            case "scatter":
                scatter(state, step);
                break;
            case "decal":
                decal(state, step);
                break;
        }
    }

    for (const lock of ctx.locks ?? []) {
        if (lock.x < 0 || lock.y < 0 || lock.x >= w || lock.y >= h) continue;
        for (const [layer, cell] of Object.entries(lock.cells)) {
            const grid = (state.layers[layer] ??= new Array(w * h).fill(null));
            grid[lock.y * w + lock.x] = cell;
        }
    }

    const problems: string[] = [];
    const reach = walkable(state.layers, w, h, ctx.solid);
    for (const object of state.objects) {
        let reached = false;
        for (let y = object.y; y < object.y + object.h; y++) {
            for (let x = object.x; x < object.x + object.w; x++) {
                if (reach[y * w + x]) reached = true;
            }
        }
        if (!reached) problems.push(`"${object.name}" can't be reached from the south edge`);
    }
    if (!state.placements.length) problems.push("No prefab matched any step");

    return {
        recipe: recipe.id,
        params,
        width: w,
        height: h,
        layers: state.layers,
        objects: state.objects,
        placements: state.placements,
        problems,
        notes: state.notes,
    };
}

/**
 * Generates until a valid result turns up, walking a fixed sequence of seeds
 * derived from the one given, so the outcome is still a function of the seed.
 */
export function generateValid(
    recipe: Recipe,
    params: GenParams,
    ctx: GenContext,
    attempts = 12,
): GenResult {
    let result = generate(recipe, params, ctx);
    for (let n = 1; n < attempts && result.problems.length; n++) {
        const seed = (Math.imul(params.seed, 0x9e3779b1) + n * 0x85ebca6b) >>> 0;
        const next = generate(recipe, { ...params, seed }, ctx);
        if (next.problems.length < result.problems.length) result = { ...next, params };
    }
    return result;
}

export function clampSize(recipe: Recipe, width: number, height: number) {
    const clamp = (value: number, [min, max]: [number, number, number]) =>
        Math.max(min, Math.min(max, Math.round(value)));
    return { width: clamp(width, recipe.size.w), height: clamp(height, recipe.size.h) };
}

/** Every theme the library offers, for the UI's filter. */
export function themesOf(prefabs: readonly LibPrefab[]): string[] {
    return [...new Set(prefabs.flatMap((prefab) => prefab.themes))].sort();
}
