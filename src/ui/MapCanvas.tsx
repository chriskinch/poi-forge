import { useEffect, useRef, useState } from "react";
import { addObject, findObject, objectAt, updateObject, type CellChange } from "../core/doc";
import { instanceAt } from "../core/prefab";
import { drawList } from "../core/render";
import { tileProps } from "../core/tileset";
import { blit, checker, grid, outline, propertyMarks } from "./draw";
import {
    editContext,
    useGrids,
    useImages,
    useInstances,
    useIssues,
    useStore,
    type Rect,
    type Stamp,
} from "./store";

interface Point {
    x: number;
    y: number;
}

interface Drag {
    start: Point;
    last: Point;
    /** Object being moved, with the grab offset in pixels. */
    object?: { id: number; dx: number; dy: number };
    /** Lock tool: whether this drag locks or unlocks. */
    locking?: boolean;
}

const rectOf = (a: Point, b: Point): Rect => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x) + 1,
    h: Math.abs(a.y - b.y) + 1,
});

function stampChanges(stamp: Stamp, at: Point, layer: string): CellChange[] {
    return stamp.cells.map((cell) => ({
        layer: cell.layer ?? layer,
        x: at.x + cell.dx,
        y: at.y + cell.dy,
        cell: cell.cell,
    }));
}

/** The editing surface: draws the map and turns pointer input into edits. */
export function MapCanvas({ zoom }: { zoom: number }) {
    const ref = useRef<HTMLCanvasElement>(null);
    const state = useStore();
    const grids = useGrids();
    const issues = useIssues();
    const instances = useInstances();
    const [hover, setHover] = useState<Point | null>(null);
    const [drag, setDrag] = useState<Drag | null>(null);

    const { map, sets, catalog } = state;
    const images = useImages([
        ...new Set([
            ...sets.map((set) => set.name),
            ...(state.stamp?.cells.map((c) => c.cell.tileset) ?? []),
        ]),
    ]);
    const tw = map?.tilewidth ?? 16;
    const cell = tw * zoom;

    // Everything the frame loop reads, refreshed every render.
    const frame = useRef({ state, grids, issues, instances, images, hover, drag, cell, zoom });
    frame.current = { state, grids, issues, instances, images, hover, drag, cell, zoom };

    useEffect(() => {
        let raf = 0;
        const draw = (time: number) => {
            raf = requestAnimationFrame(draw);
            const canvas = ref.current;
            const now = frame.current;
            const { map } = now.state;
            if (!canvas || !map) return;
            const width = map.width * now.cell;
            const height = map.height * now.cell;
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }
            const ctx = canvas.getContext("2d")!;
            paint(ctx, time, now);
        };
        raf = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(raf);
    }, []);

    if (!map) return <div className="empty">Open or create a map to start.</div>;

    const tileAt = (event: React.PointerEvent): Point => {
        const box = event.currentTarget.getBoundingClientRect();
        return {
            x: Math.floor((event.clientX - box.left) / cell),
            y: Math.floor((event.clientY - box.top) / cell),
        };
    };
    const pixelAt = (event: React.PointerEvent): Point => {
        const box = event.currentTarget.getBoundingClientRect();
        return { x: (event.clientX - box.left) / zoom, y: (event.clientY - box.top) / zoom };
    };
    const inside = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height;

    const apply = (at: Point, merge: boolean, event: React.PointerEvent) => {
        const { tool, stamp, activeLayer } = state;
        if (tool === "brush" && stamp) state.paint(stampChanges(stamp, at, activeLayer), merge);
        if (tool === "erase") {
            const layers = event.shiftKey ? Object.keys(grids) : [activeLayer];
            state.paint(
                layers.map((layer) => ({ layer, ...at, cell: null })),
                merge,
            );
        }
    };

    const pick = (at: Point) => {
        const visible = map.layers
            .filter(
                (layer) => layer.type === "tilelayer" && !state.hiddenLayers.includes(layer.name),
            )
            .reverse();
        for (const layer of visible) {
            const found = grids[layer.name]?.[at.y * map.width + at.x];
            if (!found) continue;
            const def = catalog[found.tileset]?.def;
            state.set({
                stamp: {
                    w: 1,
                    h: 1,
                    cells: [{ dx: 0, dy: 0, cell: found }],
                    label: `${found.tileset}:${found.tile}`,
                },
                activeLayer: layer.name,
                activeTileset: found.tileset,
                sheetSel: def
                    ? {
                          tileset: found.tileset,
                          x: found.tile % def.columns,
                          y: Math.floor(found.tile / def.columns),
                          w: 1,
                          h: 1,
                      }
                    : null,
                tool: "brush",
            });
            return;
        }
    };

    const onDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (event.button !== 0) return;
        const at = tileAt(event);
        if (!inside(at)) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const next: Drag = { start: at, last: at };
        switch (state.tool) {
            case "brush":
            case "erase":
                apply(at, false, event);
                break;
            case "pick":
                pick(at);
                return;
            case "swap":
                state.set({ swapTarget: at });
                return;
            case "select":
                state.set({ mapSel: rectOf(at, at) });
                break;
            case "lock": {
                const index = at.y * map.width + at.x;
                next.locking = !state.locks.includes(index);
                state.set({
                    locks: next.locking
                        ? [...state.locks, index]
                        : state.locks.filter((i) => i !== index),
                });
                break;
            }
            case "object": {
                const px = pixelAt(event);
                const hit = objectAt(map, px.x, px.y, new Set(state.hiddenLayers));
                if (hit) {
                    next.object = {
                        id: hit.object.id,
                        dx: px.x - hit.object.x,
                        dy: px.y - hit.object.y,
                    };
                    state.set({ selectedObject: hit.object.id, activeObjectLayer: hit.layer.name });
                } else if (event.altKey) {
                    const { map: withPoint, id } = addObject(
                        map,
                        state.activeObjectLayer,
                        {
                            name: "point",
                            x: at.x * tw + tw / 2,
                            y: at.y * tw + tw / 2,
                            width: 0,
                            height: 0,
                            point: true,
                        },
                        editContext(state).order,
                    );
                    state.setMap(withPoint);
                    state.set({ selectedObject: id });
                    return;
                } else {
                    state.set({ selectedObject: null });
                }
                break;
            }
        }
        setDrag(next);
    };

    const onMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const at = tileAt(event);
        if (!hover || hover.x !== at.x || hover.y !== at.y) setHover(inside(at) ? at : null);
        if (!drag) return;
        const clamped = {
            x: Math.max(0, Math.min(map.width - 1, at.x)),
            y: Math.max(0, Math.min(map.height - 1, at.y)),
        };
        if (drag.object) {
            const px = pixelAt(event);
            const snap = (value: number) =>
                event.altKey ? Math.round(value) : Math.round(value / tw) * tw;
            const x = snap(px.x - drag.object.dx);
            const y = snap(px.y - drag.object.dy);
            const current = findObject(map, drag.object.id)?.object;
            if (!current || (current.x === x && current.y === y)) return;
            // One undo step per drag: later moves merge into the first.
            state.setMap(
                updateObject(map, drag.object.id, (object) => ({ ...object, x, y })),
                drag.last !== drag.start,
            );
            setDrag({ ...drag, last: { x: -1, y: -1 } });
            return;
        }
        if (clamped.x === drag.last.x && clamped.y === drag.last.y) return;
        switch (state.tool) {
            case "brush": {
                const w = state.stamp?.w ?? 1;
                const h = state.stamp?.h ?? 1;
                // Big stamps tile from where the stroke began rather than smearing.
                if ((clamped.x - drag.start.x) % w === 0 && (clamped.y - drag.start.y) % h === 0) {
                    apply(clamped, true, event);
                }
                break;
            }
            case "erase":
                apply(clamped, true, event);
                break;
            case "select":
                state.set({ mapSel: rectOf(drag.start, clamped) });
                break;
            case "lock": {
                const index = clamped.y * map.width + clamped.x;
                const has = state.locks.includes(index);
                if (drag.locking && !has) state.set({ locks: [...state.locks, index] });
                if (!drag.locking && has)
                    state.set({ locks: state.locks.filter((i) => i !== index) });
                break;
            }
        }
        setDrag({ ...drag, last: clamped });
    };

    const onUp = () => {
        if (!drag) return;
        const area = rectOf(drag.start, drag.last);
        if (state.tool === "rect" && state.stamp) {
            const { stamp } = state;
            const changes: CellChange[] = [];
            for (let y = 0; y < area.h; y += stamp.h) {
                for (let x = 0; x < area.w; x += stamp.w) {
                    for (const change of stampChanges(
                        stamp,
                        { x: area.x + x, y: area.y + y },
                        state.activeLayer,
                    )) {
                        if (change.x < area.x + area.w && change.y < area.y + area.h)
                            changes.push(change);
                    }
                }
            }
            state.paint(changes);
        }
        if (
            state.tool === "object" &&
            !drag.object &&
            (area.w > 1 || area.h > 1 || drag.last !== drag.start)
        ) {
            const { map: withZone, id } = addObject(
                map,
                state.activeObjectLayer,
                {
                    name: "zone",
                    x: area.x * tw,
                    y: area.y * tw,
                    width: area.w * tw,
                    height: area.h * tw,
                },
                editContext(state).order,
            );
            state.setMap(withZone);
            state.set({ selectedObject: id });
        }
        setDrag(null);
    };

    return (
        <canvas
            ref={ref}
            className={`map tool-${state.tool}`}
            data-testid="map"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={() => setHover(null)}
        />
    );

    function paint(ctx: CanvasRenderingContext2D, time: number, now: typeof frame.current) {
        const { state, grids, images, cell, zoom, hover, drag } = now;
        const map = state.map!;
        const W = map.width * cell;
        const H = map.height * cell;
        const tileSize = map.tilewidth;
        checker(ctx, W, H);

        for (const layer of map.layers) {
            if (layer.type !== "tilelayer" || state.hiddenLayers.includes(layer.name)) continue;
            const grid = grids[layer.name];
            if (!grid) continue;
            ctx.globalAlpha = layer.opacity ?? 1;
            blit(
                ctx,
                drawList(
                    [{ name: layer.name, grid }],
                    map.width,
                    tileSize,
                    map.tileheight,
                    state.catalog,
                    time,
                ),
                images,
                zoom,
            );
            ctx.globalAlpha = 1;
        }

        if (state.overlays.props) {
            for (const layer of map.layers) {
                if (layer.type !== "tilelayer" || state.hiddenLayers.includes(layer.name)) continue;
                grids[layer.name]?.forEach((found, i) => {
                    const def = found && state.catalog[found.tileset]?.def;
                    if (!found || !def) return;
                    propertyMarks(
                        ctx,
                        tileProps(def, found.tile),
                        state.profile.tileProperties,
                        (i % map.width) * cell,
                        Math.floor(i / map.width) * cell,
                        cell,
                    );
                });
            }
        }

        if (state.overlays.grid) grid(ctx, map.width, map.height, cell, "rgba(255,255,255,.09)");

        if (state.locks.length) {
            ctx.fillStyle = "rgba(77,166,255,.28)";
            for (const index of state.locks) {
                ctx.fillRect(
                    (index % map.width) * cell,
                    Math.floor(index / map.width) * cell,
                    cell,
                    cell,
                );
            }
        }

        if (state.overlays.issues) {
            for (const issue of now.issues) {
                if (issue.x === undefined || issue.y === undefined) continue;
                outline(
                    ctx,
                    issue.x * cell,
                    issue.y * cell,
                    cell,
                    cell,
                    issue.level === "error" ? "#ff5a5a" : "#ffc04d",
                    [4, 3],
                );
            }
        }

        if (state.overlays.objects) {
            ctx.font = "11px system-ui, sans-serif";
            ctx.textBaseline = "bottom";
            for (const layer of map.layers) {
                if (layer.type !== "objectgroup" || state.hiddenLayers.includes(layer.name))
                    continue;
                for (const object of layer.objects ?? []) {
                    const selected = object.id === state.selectedObject;
                    const color = selected ? "#ffe14d" : "#7fd6ff";
                    const x = object.x * zoom;
                    const y = object.y * zoom;
                    if (object.point) {
                        ctx.fillStyle = color;
                        ctx.beginPath();
                        ctx.arc(x, y, 5, 0, Math.PI * 2);
                        ctx.fill();
                    } else {
                        ctx.fillStyle = selected ? "rgba(255,225,77,.18)" : "rgba(127,214,255,.14)";
                        ctx.fillRect(x, y, object.width * zoom, object.height * zoom);
                        outline(ctx, x, y, object.width * zoom, object.height * zoom, color);
                    }
                    ctx.fillStyle = "rgba(0,0,0,.7)";
                    const label = object.name || `#${object.id}`;
                    const width = ctx.measureText(label).width + 6;
                    ctx.fillRect(x, y - 14, width, 14);
                    ctx.fillStyle = color;
                    ctx.fillText(label, x + 3, y - 1);
                }
            }
        }

        if (state.mapSel && state.tool === "select") {
            const s = state.mapSel;
            outline(ctx, s.x * cell, s.y * cell, s.w * cell, s.h * cell, "#ffe14d", [6, 4]);
        }

        if (state.swapTarget && state.tool === "swap") {
            const target = state.swapTarget;
            const found = instanceAt(now.instances, target.x, target.y);
            if (found) {
                outline(
                    ctx,
                    found.x * cell,
                    found.y * cell,
                    found.prefab.w * cell,
                    found.prefab.h * cell,
                    "#c58cff",
                );
            }
            outline(ctx, target.x * cell, target.y * cell, cell, cell, "#ffe14d");
        }

        if (!hover) return;
        if (drag && (state.tool === "rect" || (state.tool === "object" && !drag.object))) {
            const area = rectOf(drag.start, drag.last);
            outline(
                ctx,
                area.x * cell,
                area.y * cell,
                area.w * cell,
                area.h * cell,
                "#ffe14d",
                [4, 3],
            );
            return;
        }
        if ((state.tool === "brush" || state.tool === "rect") && state.stamp) {
            const ghost = state.stamp.cells.map((c) => ({
                name: c.layer ?? "",
                grid: [c.cell],
                dx: c.dx,
                dy: c.dy,
            }));
            ctx.globalAlpha = 0.65;
            for (const piece of ghost) {
                blit(
                    ctx,
                    drawList([piece], 1, tileSize, map.tileheight, state.catalog, time),
                    images,
                    zoom,
                    (hover.x + piece.dx) * cell,
                    (hover.y + piece.dy) * cell,
                );
            }
            ctx.globalAlpha = 1;
            outline(
                ctx,
                hover.x * cell,
                hover.y * cell,
                state.stamp.w * cell,
                state.stamp.h * cell,
                "rgba(255,255,255,.7)",
            );
        } else {
            const color = state.tool === "erase" ? "#ff5a5a" : "rgba(255,255,255,.8)";
            outline(ctx, hover.x * cell, hover.y * cell, cell, cell, color);
        }
    }
}
