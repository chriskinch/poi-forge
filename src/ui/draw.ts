/** Canvas helpers shared by the editor, the preview and thumbnails. */
import type { DrawOp } from "../core/render";
import { FLIP_H, FLIP_V } from "../core/tiled";
import type { State } from "./store";

type Ctx = CanvasRenderingContext2D;

export function blit(
    ctx: Ctx,
    ops: readonly DrawOp[],
    images: State["images"],
    scale: number,
    ox = 0,
    oy = 0,
) {
    ctx.imageSmoothingEnabled = false;
    for (const op of ops) {
        const loaded = images[op.tileset];
        if (typeof loaded !== "object") continue;
        const dx = ox + op.x * scale;
        const dy = oy + op.y * scale;
        const dw = op.sw * scale;
        const dh = op.sh * scale;
        if (op.flags & (FLIP_H | FLIP_V)) {
            const fh = op.flags & FLIP_H ? -1 : 1;
            const fv = op.flags & FLIP_V ? -1 : 1;
            ctx.save();
            ctx.translate(dx + dw / 2, dy + dh / 2);
            ctx.scale(fh, fv);
            ctx.drawImage(loaded.image, op.sx, op.sy, op.sw, op.sh, -dw / 2, -dh / 2, dw, dh);
            ctx.restore();
        } else {
            ctx.drawImage(loaded.image, op.sx, op.sy, op.sw, op.sh, dx, dy, dw, dh);
        }
    }
}

export function checker(ctx: Ctx, width: number, height: number, size = 8) {
    ctx.fillStyle = "#2a2d33";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#30343b";
    for (let y = 0; y < height; y += size) {
        for (let x = (y / size) % 2 ? size : 0; x < width; x += size * 2) {
            ctx.fillRect(x, y, size, size);
        }
    }
}

export function grid(ctx: Ctx, cols: number, rows: number, cell: number, color: string) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= cols; x++) {
        ctx.moveTo(x * cell + 0.5, 0);
        ctx.lineTo(x * cell + 0.5, rows * cell);
    }
    for (let y = 0; y <= rows; y++) {
        ctx.moveTo(0, y * cell + 0.5);
        ctx.lineTo(cols * cell, y * cell + 0.5);
    }
    ctx.stroke();
}

export function outline(
    ctx: Ctx,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    dash?: number[],
) {
    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash(dash ?? []);
    ctx.strokeStyle = "rgba(0,0,0,.7)";
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    ctx.restore();
}

export interface PropertyColors {
    name: string;
    type: "bool" | "int" | "corners";
    color: string;
}

/** Marks a tile's properties on top of it: tint, number, quadrants or underline. */
export function propertyMarks(
    ctx: Ctx,
    props: Record<string, unknown>,
    schemas: readonly PropertyColors[],
    x: number,
    y: number,
    size: number,
) {
    let bar = 0;
    for (const schema of schemas) {
        const value = props[schema.name];
        if (value === undefined || value === false) continue;
        ctx.fillStyle = schema.color;
        if (schema.type === "corners") {
            const mask = Number(value);
            const half = size / 2;
            ctx.globalAlpha = 0.5;
            if (mask & 1) ctx.fillRect(x, y, half, half);
            if (mask & 2) ctx.fillRect(x + half, y, half, half);
            if (mask & 4) ctx.fillRect(x, y + half, half, half);
            if (mask & 8) ctx.fillRect(x + half, y + half, half, half);
            ctx.globalAlpha = 1;
        } else if (schema.type === "int") {
            ctx.font = `bold ${Math.max(9, Math.floor(size / 2.2))}px system-ui, sans-serif`;
            ctx.textBaseline = "top";
            ctx.strokeStyle = "rgba(0,0,0,.8)";
            ctx.lineWidth = 3;
            ctx.strokeText(String(value), x + 3, y + 2);
            ctx.fillText(String(value), x + 3, y + 2);
        } else if (bar === 0) {
            ctx.globalAlpha = 0.38;
            ctx.fillRect(x, y, size, size);
            ctx.globalAlpha = 1;
            bar++;
        } else {
            ctx.fillRect(x + 2, y + size - 3 - (bar - 1) * 4, size - 4, 3);
            bar++;
        }
    }
}
