import { emptyLibrary, prefabFromRegion, uniqueId, upsertPrefab } from "../../core/prefab";
import { useGrids, useStore, type Stamp } from "../store";

/** Shown with the Select tool: what to do with the selected region. */
export function Selection() {
    const state = useStore();
    const grids = useGrids();
    const { map, mapSel, hiddenLayers, activeLayer } = state;
    if (!map || !mapSel) return <p className="hint">Drag on the map to select a region.</p>;

    const visible = Object.keys(grids).filter((name) => !hiddenLayers.includes(name));
    const cellsIn = (layers: string[]) =>
        layers.flatMap((layer) => {
            const out = [];
            for (let dy = 0; dy < mapSel.h; dy++) {
                for (let dx = 0; dx < mapSel.w; dx++) {
                    const cell = grids[layer]?.[(mapSel.y + dy) * map.width + mapSel.x + dx];
                    if (cell) out.push({ dx, dy, cell, layer });
                }
            }
            return out;
        });

    const copy = () => {
        const cells = cellsIn(visible);
        if (!cells.length) return state.notify("The selection is empty");
        const stamp: Stamp = {
            w: mapSel.w,
            h: mapSel.h,
            cells,
            label: `${mapSel.w}×${mapSel.h} copied region`,
        };
        state.set({ stamp, tool: "brush" });
    };

    const clear = (layers: string[]) => {
        const changes = [];
        for (const layer of layers) {
            for (let dy = 0; dy < mapSel.h; dy++) {
                for (let dx = 0; dx < mapSel.w; dx++)
                    changes.push({ layer, x: mapSel.x + dx, y: mapSel.y + dy, cell: null });
            }
        }
        state.paint(changes);
    };

    const toPrefab = () => {
        const cells = cellsIn(visible);
        if (!cells.length) return state.notify("The selection is empty");
        const counts = new Map<string, number>();
        for (const { cell } of cells) counts.set(cell.tileset, (counts.get(cell.tileset) ?? 0) + 1);
        const tileset = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
        const name = window.prompt("Name for the prefab", "new prefab");
        if (!name) return;
        const library = state.libraries[tileset] ?? emptyLibrary(tileset);
        const id = uniqueId(
            library,
            name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "") || "prefab",
        );
        const picked = Object.fromEntries(visible.map((layer) => [layer, grids[layer]!]));
        const prefab = prefabFromRegion(picked, map.width, mapSel, tileset, id);
        if (!prefab) return;
        state.setLibrary(upsertPrefab(library, { ...prefab, name }));
        state.set({
            mode: "tileset",
            tilesetTab: "prefabs",
            activeTileset: tileset,
            selectedPrefab: id,
            sheetSel: null,
        });
        state.notify(`Saved "${name}" to ${tileset}. Tag it so the generator can use it.`);
    };

    return (
        <div className="selection" data-testid="selection-panel">
            <p className="hint">
                {mapSel.w}×{mapSel.h} at {mapSel.x},{mapSel.y}
            </p>
            <div className="row wrap">
                <button onClick={copy} title="Ctrl+C">
                    Copy as stamp
                </button>
                <button onClick={() => clear([activeLayer])} title="Delete">
                    Clear on {activeLayer}
                </button>
                <button onClick={() => clear(visible)} title="Shift+Delete">
                    Clear all layers
                </button>
                <button onClick={toPrefab} data-testid="selection-prefab">
                    Save as prefab…
                </button>
                <button
                    onClick={() => {
                        const locks = new Set(state.locks);
                        for (let dy = 0; dy < mapSel.h; dy++) {
                            for (let dx = 0; dx < mapSel.w; dx++)
                                locks.add((mapSel.y + dy) * map.width + mapSel.x + dx);
                        }
                        state.set({ locks: [...locks] });
                    }}
                    title="Keep these cells when generating"
                >
                    Lock for generator
                </button>
            </div>
        </div>
    );
}
