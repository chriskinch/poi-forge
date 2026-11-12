import { useEffect, useMemo, useRef } from "react";
import type { Catalog, Grid } from "../core/doc";
import type { ContextResult, Profile } from "../core/profile";
import { drawList, withContext, type RenderLayer } from "../core/render";
import { tileProps } from "../core/tileset";
import { blit } from "./draw";
import { useGrids, useImages, useStore } from "./store";

function contextFor(
    profile: Profile,
    width: number,
    height: number,
    variant: string,
    catalog: Catalog,
): ContextResult | null {
    if (!variant || !profile.context) return null;
    return profile.context({ width, height } as never, variant, catalog);
}

/**
 * The live preview: the map as it will look in place, animations running.
 * In Generate mode it shows the highlighted candidate instead.
 */
export function Preview() {
    const ref = useRef<HTMLCanvasElement>(null);
    const wrap = useRef<HTMLDivElement>(null);
    const state = useStore();
    const mapGrids = useGrids();
    const { profile, catalog, map, previewContext, previewOverlay } = state;

    const candidate =
        state.mode === "generate" && state.candidate !== null
            ? state.candidates[state.candidate]
            : undefined;
    const width = candidate?.width ?? map?.width ?? 0;
    const height = candidate?.height ?? map?.height ?? 0;
    const grids: Record<string, Grid> = candidate?.layers ?? mapGrids;
    const order = useMemo(
        () =>
            map && !candidate
                ? map.layers.filter((l) => l.type === "tilelayer").map((l) => l.name)
                : [...profile.tileLayers],
        [map, candidate, profile],
    );

    const scene = useMemo(() => {
        const context = contextFor(profile, width, height, previewContext, catalog);
        if (context) return { ...withContext(grids, width, height, context, order), context };
        const layers: RenderLayer[] = order.flatMap((name) =>
            grids[name] ? [{ name, grid: grids[name]! }] : [],
        );
        return { layers, width, height, context: null };
    }, [profile, width, height, previewContext, catalog, grids, order]);

    const names = useMemo(
        () => [
            ...new Set(scene.layers.flatMap((l) => l.grid.flatMap((c) => (c ? [c.tileset] : [])))),
        ],
        [scene],
    );
    const images = useImages(names);
    const zones = useMemo(() => {
        if (candidate) {
            return candidate.objects.map((o) => ({
                name: o.name,
                x: o.x,
                y: o.y,
                w: o.w,
                h: o.h,
                point: false,
            }));
        }
        const tile = map?.tilewidth ?? 16;
        return (map?.layers ?? []).flatMap((layer) =>
            (layer.objects ?? []).map((o) => ({
                name: o.name,
                x: o.x / tile,
                y: o.y / tile,
                w: o.width / tile,
                h: o.height / tile,
                point: !!o.point,
            })),
        );
    }, [candidate, map]);

    const frame = useRef({ scene, images, catalog, profile, previewOverlay, zones });
    frame.current = { scene, images, catalog, profile, previewOverlay, zones };

    useEffect(() => {
        let raf = 0;
        const draw = (time: number) => {
            raf = requestAnimationFrame(draw);
            const canvas = ref.current;
            const box = wrap.current;
            const now = frame.current;
            if (!canvas || !box || !now.scene.width) return;
            const tile = now.profile.tileSize;
            const pw = now.scene.width * tile;
            const ph = now.scene.height * tile;
            const fit = Math.min((box.clientWidth - 8) / pw, (box.clientHeight - 8) / ph);
            // Whole or half steps keep the pixels close to even.
            const scale = fit >= 1 ? Math.floor(fit * 2) / 2 : Math.max(0.25, fit);
            const w = Math.round(pw * scale);
            const h = Math.round(ph * scale);
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }
            const ctx = canvas.getContext("2d")!;
            ctx.fillStyle = now.scene.context?.background ?? "#23262b";
            ctx.fillRect(0, 0, w, h);
            blit(
                ctx,
                drawList(now.scene.layers, now.scene.width, tile, tile, now.catalog, time),
                now.images,
                scale,
            );

            if (!now.previewOverlay) return;
            const cell = tile * scale;
            const m = now.scene.context?.margin ?? 0;
            ctx.fillStyle = "rgba(255,60,60,.4)";
            for (const layer of now.scene.layers) {
                layer.grid.forEach((found, i) => {
                    const def = found && now.catalog[found.tileset]?.def;
                    if (!found || !def) return;
                    if (!now.profile.isSolid(tileProps(def, found.tile), layer.name)) return;
                    ctx.fillRect(
                        (i % now.scene.width) * cell,
                        Math.floor(i / now.scene.width) * cell,
                        cell,
                        cell,
                    );
                });
            }
            ctx.strokeStyle = "#7fd6ff";
            ctx.fillStyle = "rgba(127,214,255,.2)";
            ctx.lineWidth = 2;
            for (const zone of now.zones) {
                const x = (zone.x + m) * cell;
                const y = (zone.y + m) * cell;
                if (zone.point) {
                    ctx.beginPath();
                    ctx.arc(x, y, 4, 0, Math.PI * 2);
                    ctx.stroke();
                } else {
                    ctx.fillRect(x, y, zone.w * cell, zone.h * cell);
                    ctx.strokeRect(x, y, zone.w * cell, zone.h * cell);
                }
            }
        };
        raf = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(raf);
    }, []);

    const contexts = profile.contexts(catalog);

    return (
        <section className="preview">
            <header>
                <h2>Live preview</h2>
                {contexts.length > 0 && (
                    <select
                        value={previewContext}
                        onChange={(event) => state.set({ previewContext: event.target.value })}
                        title="Surroundings to preview the POI in"
                        data-testid="preview-context"
                    >
                        <option value="">No surroundings</option>
                        {contexts.map((name) => (
                            <option key={name} value={name}>
                                In {name}
                            </option>
                        ))}
                    </select>
                )}
                <label className="check" title="Tint tiles that block movement and outline zones">
                    <input
                        type="checkbox"
                        checked={previewOverlay}
                        onChange={(event) => state.set({ previewOverlay: event.target.checked })}
                    />
                    Collision
                </label>
                <button
                    className="ghost"
                    onClick={() => state.set({ previewLarge: !state.previewLarge })}
                    title={state.previewLarge ? "Shrink the preview" : "Enlarge the preview"}
                    data-testid="preview-size"
                >
                    {state.previewLarge ? "▾" : "▴"}
                </button>
            </header>
            <div className="preview-stage" ref={wrap}>
                {width ? (
                    <canvas ref={ref} data-testid="preview" />
                ) : (
                    <div className="empty">Nothing to preview</div>
                )}
            </div>
        </section>
    );
}
