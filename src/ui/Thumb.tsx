import { useEffect, useMemo, useRef } from "react";
import type { Grid } from "../core/doc";
import { drawList, type RenderLayer } from "../core/render";
import { blit } from "./draw";
import { useImages, useStore } from "./store";

interface Props {
    layers: readonly RenderLayer[];
    width: number;
    height: number;
    scale: number;
    background?: string;
    className?: string;
    /** Run tile animations. */
    animate?: boolean;
}

const tilesetsIn = (layers: readonly { grid: Grid }[]): string[] => [
    ...new Set(
        layers.flatMap((layer) => layer.grid.flatMap((cell) => (cell ? [cell.tileset] : []))),
    ),
];

/** A static picture of some tile layers: prefab swatches, generator candidates. */
export function Thumb({ layers, width, height, scale, background, className, animate }: Props) {
    const ref = useRef<HTMLCanvasElement>(null);
    const catalog = useStore((state) => state.catalog);
    const tile = useStore((state) => state.profile.tileSize);
    const names = useMemo(() => tilesetsIn(layers), [layers]);
    const images = useImages(names);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        canvas.width = width * tile * scale;
        canvas.height = height * tile * scale;
        const ctx = canvas.getContext("2d")!;
        let raf = 0;
        const draw = (time: number) => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (background) {
                ctx.fillStyle = background;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            blit(ctx, drawList(layers, width, tile, tile, catalog, time), images, scale);
            if (animate) raf = requestAnimationFrame(draw);
        };
        draw(animate ? performance.now() : 0);
        return () => cancelAnimationFrame(raf);
    }, [layers, width, height, scale, background, catalog, images, tile, animate]);

    return <canvas ref={ref} className={className} />;
}
