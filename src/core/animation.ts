/** Tile animation helpers. Output is Tiled's per-tile `animation` frame list. */
import { setAnimation, tileAnimation } from "./tileset";
import type { TiledFrame, TiledTileset } from "./tiled";

/** The tile id an animated tile shows at `time` ms. */
export function frameAt(frames: readonly TiledFrame[] | undefined, time: number, fallback: number) {
    if (!frames?.length) return fallback;
    const total = frames.reduce((sum, frame) => sum + frame.duration, 0);
    if (total <= 0) return frames[0]!.tileid;
    let t = time % total;
    for (const frame of frames) {
        if (t < frame.duration) return frame.tileid;
        t -= frame.duration;
    }
    return frames[frames.length - 1]!.tileid;
}

export const animatedTile = (def: TiledTileset, id: number, time: number): number =>
    frameAt(tileAnimation(def, id), time, id);

export interface Strip {
    /** First frame's tile id. */
    first: number;
    count: number;
    /** Tiles between one frame and the next, across and down. */
    strideX: number;
    strideY: number;
    duration: number;
}

/** Frames laid out at a fixed stride from `first`. Frames off the sheet are dropped. */
export function stripFrames(def: TiledTileset, strip: Strip): TiledFrame[] {
    const col = strip.first % def.columns;
    const row = Math.floor(strip.first / def.columns);
    const rows = Math.ceil(def.tilecount / def.columns);
    const frames: TiledFrame[] = [];
    for (let i = 0; i < strip.count; i++) {
        const x = col + i * strip.strideX;
        const y = row + i * strip.strideY;
        if (x < 0 || y < 0 || x >= def.columns || y >= rows) break;
        frames.push({ duration: strip.duration, tileid: y * def.columns + x });
    }
    return frames;
}

export interface BlockAnimation {
    /** Top-left tile of the block's first frame, and its size in tiles. */
    col: number;
    row: number;
    w: number;
    h: number;
    count: number;
    strideX: number;
    strideY: number;
    duration: number;
}

/**
 * Animates a multi-tile block in one go: every tile of the first frame gets
 * the same-length animation through its counterparts in the later frames, so
 * the whole block changes together.
 */
export function animateBlock(def: TiledTileset, block: BlockAnimation): TiledTileset {
    let next = def;
    for (let dy = 0; dy < block.h; dy++) {
        for (let dx = 0; dx < block.w; dx++) {
            const first = (block.row + dy) * def.columns + block.col + dx;
            const frames = stripFrames(def, { ...block, first });
            if (frames.length > 1) next = setAnimation(next, first, frames);
        }
    }
    return next;
}

export const uniformDuration = (frames: readonly TiledFrame[], duration: number): TiledFrame[] =>
    frames.map((frame) => ({ duration, tileid: frame.tileid }));

/**
 * Where the frames of an imported strip land when appended as new rows.
 * Frames are `w`×`h` tiles and are packed left to right, wrapping.
 */
export function appendLayout(def: TiledTileset, frames: number, w: number, h: number) {
    const rowsBefore = Math.ceil(def.tilecount / def.columns);
    const perRow = Math.max(1, Math.floor(def.columns / w));
    const addedRows = Math.ceil(frames / perRow) * h;
    const cells = Array.from({ length: frames }, (_, i) => ({
        col: (i % perRow) * w,
        row: rowsBefore + Math.floor(i / perRow) * h,
    }));
    return { rowsBefore, addedRows, perRow, cells };
}

/** Animations for an appended strip: one synced animation per tile of the frame. */
export function animateAppended(
    def: TiledTileset,
    cells: readonly { col: number; row: number }[],
    w: number,
    h: number,
    duration: number
): TiledTileset {
    let next = def;
    const [first] = cells;
    if (!first || cells.length < 2) return def;
    for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
            const frames = cells.map((cell) => ({
                duration,
                tileid: (cell.row + dy) * def.columns + cell.col + dx,
            }));
            next = setAnimation(next, frames[0]!.tileid, frames);
        }
    }
    return next;
}
