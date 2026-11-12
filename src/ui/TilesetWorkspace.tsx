import { useMemo, useState } from "react";
import { tileAnimation } from "../core/tileset";
import { Animation, addFrame } from "./panels/Animation";
import { Prefabs } from "./panels/Prefabs";
import { TileProps } from "./panels/TileProps";
import { TilesetPicker } from "./panels/TilesetPicker";
import { SheetCanvas } from "./SheetCanvas";
import { useStore } from "./store";

/** Tileset mode's centre: the sheet at working size. */
export function TilesetStage() {
    const state = useStore();
    const [zoom, setZoom] = useState(3);
    const { activeTileset, catalog, sheetSel, framePick, tilesetTab, selectedPrefab } = state;
    const entry = activeTileset ? catalog[activeTileset] : undefined;
    const sel = entry && sheetSel?.tileset === entry.name ? sheetSel : null;
    const base = entry && sel ? sel.y * entry.def.columns + sel.x : undefined;

    const marks = useMemo(() => {
        if (!entry) return [];
        const out: { tiles: number[]; color: string }[] = [];
        if (tilesetTab === "anim" && base !== undefined) {
            out.push({
                tiles: (tileAnimation(entry.def, base) ?? []).map((f) => f.tileid),
                color: "#ffb84d",
            });
        }
        if (tilesetTab === "prefabs") {
            const prefab = state.libraries[entry.name]?.prefabs.find(
                (p) => p.id === selectedPrefab,
            );
            if (prefab)
                out.push({
                    tiles: prefab.cells.filter((c) => !c.tileset).map((c) => c.tile),
                    color: "#c58cff",
                });
        }
        return out;
    }, [entry, tilesetTab, base, selectedPrefab, state.libraries]);

    const picking =
        framePick && tilesetTab === "anim" && base !== undefined && entry && !entry.readOnly;

    return (
        <div className="stage-column">
            <div className="stage-bar">
                <TilesetPicker />
                <span className="spacer" />
                {entry && (
                    <span className="hint">
                        {entry.def.columns}×{Math.ceil(entry.def.tilecount / entry.def.columns)}{" "}
                        tiles
                        {entry.path ? ` · ${entry.path}` : ""}
                        {state.savedDefs[entry.name] !== entry.def && !entry.readOnly
                            ? " · unsaved"
                            : ""}
                    </span>
                )}
                <button onClick={() => setZoom(Math.max(1, zoom - 1))} aria-label="Zoom out">
                    −
                </button>
                <span className="zoom">{zoom}×</span>
                <button onClick={() => setZoom(Math.min(8, zoom + 1))} aria-label="Zoom in">
                    +
                </button>
            </div>
            {picking && (
                <p className="notice">
                    Click tiles to add them as frames. Press “Done adding” when finished.
                </p>
            )}
            <div className="stage">
                {entry && (
                    <SheetCanvas
                        tileset={entry.name}
                        zoom={zoom}
                        selection={sel}
                        onSelect={(rect) =>
                            state.set({ sheetSel: { tileset: entry.name, ...rect } })
                        }
                        onPick={
                            picking
                                ? (tile) =>
                                      state.setDef(entry.name, addFrame(entry.def, base, tile, 150))
                                : undefined
                        }
                        showProps
                        marks={marks}
                    />
                )}
            </div>
        </div>
    );
}

const TABS = [
    ["props", "Properties"],
    ["anim", "Animation"],
    ["prefabs", "Prefabs"],
] as const;

/** Tileset mode's right panel. */
export function TilesetPanel() {
    const tab = useStore((state) => state.tilesetTab);
    const set = useStore((state) => state.set);
    return (
        <section className="panel tileset-panel">
            <nav className="tabs">
                {TABS.map(([id, label]) => (
                    <button
                        key={id}
                        className={tab === id ? "active" : ""}
                        onClick={() => set({ tilesetTab: id, framePick: false })}
                        data-testid={`tab-${id}`}
                    >
                        {label}
                    </button>
                ))}
            </nav>
            {tab === "props" && <TileProps />}
            {tab === "anim" && <Animation />}
            {tab === "prefabs" && <Prefabs />}
        </section>
    );
}
