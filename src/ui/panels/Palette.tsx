import { instanceAt, swapCandidates, swapChanges, type LibPrefab } from "../../core/prefab";
import { prefabStamp, prefabThumb, sheetStamp } from "../helpers";
import { SheetCanvas } from "../SheetCanvas";
import {
    useGrids,
    useInstances,
    usePrefabs,
    useStore,
    useUsablePrefabs,
    type Rect,
} from "../store";
import { Thumb } from "../Thumb";
import { TilesetPicker } from "./TilesetPicker";

/** The tile a swap acts on: the topmost visible one under the target. */
function useSwapCell() {
    const map = useStore((state) => state.map);
    const target = useStore((state) => state.swapTarget);
    const hidden = useStore((state) => state.hiddenLayers);
    const grids = useGrids();
    if (!map || !target) return null;
    const layers = map.layers
        .filter((l) => l.type === "tilelayer" && !hidden.includes(l.name))
        .reverse();
    for (const layer of layers) {
        const cell = grids[layer.name]?.[target.y * map.width + target.x];
        if (cell) return { layer: layer.name, cell, ...target };
    }
    return null;
}

export function PrefabButton({
    prefab,
    onClick,
    active,
    showSheet,
}: {
    prefab: LibPrefab;
    onClick: () => void;
    active?: boolean;
    showSheet?: boolean;
}) {
    const order = useStore((state) => state.profile.tileLayers);
    const thumb = prefabThumb(
        prefab,
        order,
        prefab.kind === "stretch" ? Math.max(prefab.w, 5) : prefab.w,
    );
    return (
        <button
            className={`prefab${active ? " active" : ""}`}
            onClick={onClick}
            title={`${prefab.name} — ${prefab.tags.join(", ") || "no tags"}`}
        >
            <Thumb layers={thumb.layers} width={thumb.width} height={thumb.height} scale={2} />
            <span>{prefab.name}</span>
            {showSheet && <span>{prefab.tileset}</span>}
        </button>
    );
}

/** Map mode's right panel: pick tiles or prefabs to paint with, or swap replacements. */
export function Palette() {
    const state = useStore();
    const prefabs = usePrefabs();
    const instances = useInstances();
    const swapCell = useSwapCell();
    const { activeTileset, catalog, sheetSel, tool, swapTarget } = state;
    const entry = activeTileset ? catalog[activeTileset] : undefined;
    const swapping = tool === "swap";

    const onSelect = (rect: Rect) => {
        if (!entry) return;
        const loaded = state.images[entry.name];
        const stamp = sheetStamp(
            entry.name,
            entry.def,
            rect,
            typeof loaded === "object" ? loaded.coverage : undefined,
        );
        if (swapping && swapCell && stamp?.cells.length === 1) {
            state.paint([
                { layer: swapCell.layer, x: swapCell.x, y: swapCell.y, cell: stamp.cells[0]!.cell },
            ]);
            state.set({ sheetSel: { tileset: entry.name, ...rect } });
            return;
        }
        state.set({
            sheetSel: { tileset: entry.name, ...rect },
            stamp,
            ...(tool === "brush" || tool === "rect" || swapping ? {} : { tool: "brush" as const }),
        });
        if (!stamp)
            state.notify("Those tiles are blank: nothing to paint. Use the eraser to clear cells.");
    };

    const instance = swapTarget ? instanceAt(instances, swapTarget.x, swapTarget.y) : undefined;
    const { usable } = useUsablePrefabs();
    // Sheets the map already uses come first: they are the ones that fit it.
    const inMap = new Set(state.sets.map((set) => set.name));
    const candidates = instance
        ? swapCandidates(instance.prefab, usable).sort(
              (a, b) => Number(inMap.has(b.tileset)) - Number(inMap.has(a.tileset)),
          )
        : [];
    const mine = prefabs.filter((prefab) => prefab.tileset === activeTileset);

    return (
        <section className="panel palette">
            {swapping && (
                <div className="swap" data-testid="swap-panel">
                    <h3>Swap</h3>
                    {!swapTarget && <p className="hint">Click a tile or prefab on the map.</p>}
                    {swapTarget && !swapCell && <p className="hint">Nothing there to swap.</p>}
                    {swapCell && (
                        <p className="hint">
                            <b>
                                {swapCell.cell.tileset}:{swapCell.cell.tile}
                            </b>{" "}
                            on {swapCell.layer}. Click any tile on the sheet below to replace it.
                        </p>
                    )}
                    {instance && (
                        <>
                            <p className="hint">
                                Part of prefab <b>{instance.prefab.name}</b>
                                {candidates.length
                                    ? ". Replace the whole thing with:"
                                    : ". No other prefab shares its tags."}
                            </p>
                            <div className="prefab-list">
                                {candidates.map((prefab) => (
                                    <PrefabButton
                                        key={`${prefab.tileset}/${prefab.id}`}
                                        prefab={prefab}
                                        showSheet
                                        onClick={() => state.paint(swapChanges(instance, prefab))}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}
            <h3>Tiles</h3>
            <TilesetPicker />
            {state.stamp && !swapping && (
                <p className="hint stamp">Painting: {state.stamp.label}</p>
            )}
            <div className="sheet-scroll">
                {entry && (
                    <SheetCanvas
                        tileset={entry.name}
                        zoom={2}
                        selection={sheetSel?.tileset === entry.name ? sheetSel : null}
                        onSelect={onSelect}
                        showProps={state.overlays.props}
                    />
                )}
            </div>
            <h3>Prefabs on this sheet</h3>
            {mine.length ? (
                <div className="prefab-list">
                    {mine.map((prefab) => (
                        <PrefabButton
                            key={prefab.id}
                            prefab={prefab}
                            onClick={() =>
                                state.set({
                                    stamp: prefabStamp(prefab),
                                    tool: "brush",
                                    sheetSel: null,
                                })
                            }
                        />
                    ))}
                </div>
            ) : (
                <p className="hint">None yet. Define them in the Tileset tab.</p>
            )}
        </section>
    );
}
