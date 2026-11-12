import { useEffect, useRef, useState } from "react";
import { tileRows } from "../core/tileset";
import { tileProps } from "../core/tileset";
import { checker, grid, outline, propertyMarks } from "./draw";
import { useImages, useStore, type Rect } from "./store";

interface Props {
    tileset: string;
    zoom: number;
    selection: Rect | null;
    onSelect: (rect: Rect) => void;
    /** Called instead of selecting, when set (e.g. to add animation frames). */
    onPick?: (tile: number) => void;
    showProps?: boolean;
    /** Tiles to ring, with a colour. */
    marks?: { tiles: readonly number[]; color: string }[];
}

/** A tileset sheet you can drag-select tiles on. */
export function SheetCanvas({
    tileset,
    zoom,
    selection,
    onSelect,
    onPick,
    showProps,
    marks,
}: Props) {
    const ref = useRef<HTMLCanvasElement>(null);
    const entry = useStore((state) => state.catalog[tileset]);
    const schemas = useStore((state) => state.profile.tileProperties);
    const images = useImages([tileset]);
    const loaded = images[tileset];
    const [drag, setDrag] = useState<{ col: number; row: number } | null>(null);

    const def = entry?.def;
    const cell = def ? def.tilewidth * zoom : 16;
    const rows = def ? tileRows(def) : 0;

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas || !def) return;
        canvas.width = def.columns * cell;
        canvas.height = rows * cell;
        const ctx = canvas.getContext("2d")!;
        checker(ctx, canvas.width, canvas.height);
        if (typeof loaded === "object") {
            ctx.imageSmoothingEnabled = false;
            const step = def.tilewidth + def.spacing;
            for (let id = 0; id < def.tilecount; id++) {
                const col = id % def.columns;
                const row = Math.floor(id / def.columns);
                ctx.drawImage(
                    loaded.image,
                    def.margin + col * step,
                    def.margin + row * (def.tileheight + def.spacing),
                    def.tilewidth,
                    def.tileheight,
                    col * cell,
                    row * cell,
                    cell,
                    cell,
                );
            }
        }
        grid(ctx, def.columns, rows, cell, "rgba(255,255,255,.07)");
        for (const tile of def.tiles ?? []) {
            const x = (tile.id % def.columns) * cell;
            const y = Math.floor(tile.id / def.columns) * cell;
            if (showProps) propertyMarks(ctx, tileProps(def, tile.id), schemas, x, y, cell);
            if (tile.animation?.length) {
                ctx.fillStyle = "#ffd84d";
                ctx.beginPath();
                ctx.moveTo(x + cell - 9, y + 3);
                ctx.lineTo(x + cell - 3, y + 6.5);
                ctx.lineTo(x + cell - 9, y + 10);
                ctx.fill();
            }
        }
        for (const mark of marks ?? []) {
            for (const id of mark.tiles) {
                outline(
                    ctx,
                    (id % def.columns) * cell,
                    Math.floor(id / def.columns) * cell,
                    cell,
                    cell,
                    mark.color,
                );
            }
        }
        if (selection) {
            outline(
                ctx,
                selection.x * cell,
                selection.y * cell,
                selection.w * cell,
                selection.h * cell,
                "#ffe14d",
            );
        }
    }, [def, loaded, cell, rows, selection, showProps, marks, schemas]);

    if (!def) return <div className="empty">No tileset selected</div>;
    if (loaded === "error") return <div className="empty">Could not load {entry.imagePath}</div>;

    const at = (event: React.PointerEvent) => {
        const box = event.currentTarget.getBoundingClientRect();
        return {
            col: Math.max(
                0,
                Math.min(def.columns - 1, Math.floor((event.clientX - box.left) / cell)),
            ),
            row: Math.max(0, Math.min(rows - 1, Math.floor((event.clientY - box.top) / cell))),
        };
    };
    const span = (a: { col: number; row: number }, b: { col: number; row: number }): Rect => ({
        x: Math.min(a.col, b.col),
        y: Math.min(a.row, b.row),
        w: Math.abs(a.col - b.col) + 1,
        h: Math.abs(a.row - b.row) + 1,
    });

    return (
        <canvas
            ref={ref}
            className="sheet"
            data-testid="sheet"
            onPointerDown={(event) => {
                const start = at(event);
                if (onPick) return onPick(start.row * def.columns + start.col);
                event.currentTarget.setPointerCapture(event.pointerId);
                setDrag(start);
                onSelect(span(start, start));
            }}
            onPointerMove={(event) => drag && onSelect(span(drag, at(event)))}
            onPointerUp={() => setDrag(null)}
        />
    );
}
