import { useEffect, useState } from "react";
import { resizeMap } from "../core/doc";
import { basename } from "../core/path";
import { GeneratePanel, GenerateStage } from "./GenerateWorkspace";
import { MapCanvas } from "./MapCanvas";
import { Modal, NumberField } from "./Modal";
import { Layers } from "./panels/Layers";
import { Objects } from "./panels/Objects";
import { Palette } from "./panels/Palette";
import { Problems } from "./panels/Problems";
import { Selection } from "./panels/Selection";
import { TOOLS, Tools } from "./panels/Tools";
import { Preview } from "./Preview";
import { isDirty, useStore, type Mode } from "./store";
import { TilesetPanel, TilesetStage } from "./TilesetWorkspace";

const MODES: [Mode, string, string][] = [
    ["map", "Map", "Paint, swap and arrange tiles"],
    ["tileset", "Tileset", "Tile properties, animations and prefabs"],
    ["generate", "Generate", "Compose a POI from prefabs"],
];

function NewMap({ onClose }: { onClose: () => void }) {
    const createMap = useStore((state) => state.createMap);
    const context = useStore((state) => state.previewContext);
    const [name, setName] = useState(context ? `${context}-` : "");
    const [width, setWidth] = useState(10);
    const [height, setHeight] = useState(10);
    return (
        <Modal title="New map" onClose={onClose}>
            <label className="field">
                <span>File name</span>
                <input
                    autoFocus
                    value={name}
                    placeholder="forest-shrine"
                    onChange={(event) => setName(event.target.value)}
                    data-testid="new-name"
                />
            </label>
            <div className="grid-2">
                <NumberField
                    label="Width (tiles)"
                    min={2}
                    max={64}
                    value={width}
                    onChange={setWidth}
                />
                <NumberField
                    label="Height (tiles)"
                    min={2}
                    max={64}
                    value={height}
                    onChange={setHeight}
                />
            </div>
            <footer>
                <button onClick={onClose}>Cancel</button>
                <button
                    className="primary"
                    disabled={!name.trim()}
                    onClick={() => {
                        createMap(name.trim(), width, height);
                        onClose();
                    }}
                    data-testid="new-create"
                >
                    Create
                </button>
            </footer>
        </Modal>
    );
}

function Resize({ onClose }: { onClose: () => void }) {
    const map = useStore((state) => state.map)!;
    const setMap = useStore((state) => state.setMap);
    const [width, setWidth] = useState(map.width);
    const [height, setHeight] = useState(map.height);
    const [dx, setDx] = useState(0);
    const [dy, setDy] = useState(0);
    return (
        <Modal title="Resize map" onClose={onClose}>
            <div className="grid-2">
                <NumberField
                    label="Width (tiles)"
                    min={2}
                    max={64}
                    value={width}
                    onChange={setWidth}
                />
                <NumberField
                    label="Height (tiles)"
                    min={2}
                    max={64}
                    value={height}
                    onChange={setHeight}
                />
                <NumberField
                    label="Shift content →"
                    min={-64}
                    max={64}
                    value={dx}
                    onChange={setDx}
                />
                <NumberField
                    label="Shift content ↓"
                    min={-64}
                    max={64}
                    value={dy}
                    onChange={setDy}
                />
            </div>
            <p className="hint">Content that falls outside the new size is dropped.</p>
            <footer>
                <button onClick={onClose}>Cancel</button>
                <button
                    className="primary"
                    onClick={() => {
                        setMap(resizeMap(map, width, height, dx, dy));
                        useStore.getState().set({ locks: [], mapSel: null });
                        onClose();
                    }}
                >
                    Resize
                </button>
            </footer>
        </Modal>
    );
}

function useShortcuts() {
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const state = useStore.getState();
            const target = event.target as HTMLElement;
            const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
            const mod = event.ctrlKey || event.metaKey;
            const key = event.key.toLowerCase();
            if (mod && key === "s") {
                event.preventDefault();
                void state.saveAll();
                return;
            }
            if (typing) return;
            if (mod && key === "z") {
                event.preventDefault();
                if (event.shiftKey) state.redo();
                else state.undo();
                return;
            }
            if (mod && key === "y") {
                event.preventDefault();
                state.redo();
                return;
            }
            if (state.mode !== "map") return;
            if (mod && key === "c" && state.mapSel) {
                document.querySelector<HTMLButtonElement>(".selection button")?.click();
                return;
            }
            if (mod) return;
            const tool = TOOLS.find((item) => item.key.toLowerCase() === key);
            if (tool) return state.set({ tool: tool.id });
            const layer = state.profile.tileLayers[Number(event.key) - 1];
            if (layer) return state.set({ activeLayer: layer });
            if (key === "escape")
                state.set({ mapSel: null, swapTarget: null, selectedObject: null });
            if ((key === "delete" || key === "backspace") && state.map) {
                if (state.tool === "select" && state.mapSel) {
                    const { mapSel, map } = state;
                    const layers = event.shiftKey
                        ? map.layers.filter((l) => l.type === "tilelayer").map((l) => l.name)
                        : [state.activeLayer];
                    const changes = [];
                    for (const layer of layers) {
                        for (let y = mapSel.y; y < mapSel.y + mapSel.h; y++) {
                            for (let x = mapSel.x; x < mapSel.x + mapSel.w; x++)
                                changes.push({ layer, x, y, cell: null });
                        }
                    }
                    state.paint(changes);
                }
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);
}

export function App() {
    const state = useStore();
    const [zoom, setZoom] = useState(3);
    const [dialog, setDialog] = useState<"new" | "resize" | null>(null);
    const init = useStore((s) => s.init);
    useShortcuts();

    useEffect(() => {
        void init();
    }, [init]);

    const dirty = isDirty(state);
    useEffect(() => {
        const warn = (event: BeforeUnloadEvent) => {
            if (dirty) event.preventDefault();
        };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);

    if (state.fatal) {
        return (
            <div className="fatal">
                <h1>POI Forge can't start</h1>
                <p>{state.fatal}</p>
                <p className="hint">
                    Point the tool at a project with <code>POI_PROJECT</code> and{" "}
                    <code>POI_PROFILE</code>, or a <code>poi.config.json</code> next to
                    package.json. See the README.
                </p>
            </div>
        );
    }
    if (!state.ready) return <div className="fatal">Loading project…</div>;

    const { mode, map, docPath, mapFiles, tool } = state;
    const open = (path: string) => {
        if (
            state.map !== state.savedMap &&
            !window.confirm("Discard unsaved changes to the current map?")
        )
            return;
        void state.openMap(path);
    };

    return (
        <div className={`app mode-${mode}`}>
            <header className="topbar">
                <strong className="brand">POI Forge</strong>
                <span className="project" title={state.project?.project}>
                    {state.project?.name} · {state.profile.label}
                </span>
                <select
                    value={docPath ?? ""}
                    onChange={(event) => open(event.target.value)}
                    title="Open a map"
                    data-testid="map-select"
                >
                    {!docPath && <option value="">No map open</option>}
                    {docPath && !mapFiles.includes(docPath) && (
                        <option value={docPath}>{basename(docPath)}</option>
                    )}
                    {mapFiles.map((path) => (
                        <option key={path} value={path}>
                            {basename(path)}
                        </option>
                    ))}
                </select>
                <button onClick={() => setDialog("new")} data-testid="new-map">
                    New…
                </button>
                <button disabled={!map} onClick={() => setDialog("resize")}>
                    Resize…
                </button>
                <button
                    className={dirty ? "primary" : ""}
                    onClick={() => void state.saveAll()}
                    title="Ctrl+S"
                    data-testid="save"
                >
                    Save{dirty ? " •" : ""}
                </button>
                <button
                    disabled={!state.past.length}
                    onClick={state.undo}
                    title="Ctrl+Z"
                    data-testid="undo"
                >
                    Undo
                </button>
                <button
                    disabled={!state.future.length}
                    onClick={state.redo}
                    title="Ctrl+Shift+Z"
                    data-testid="redo"
                >
                    Redo
                </button>
                <span className="spacer" />
                <nav className="modes">
                    {MODES.map(([id, label, help]) => (
                        <button
                            key={id}
                            className={mode === id ? "active" : ""}
                            onClick={() => state.set({ mode: id, framePick: false })}
                            title={help}
                            data-testid={`mode-${id}`}
                        >
                            {label}
                        </button>
                    ))}
                </nav>
            </header>

            <aside className="left">
                {mode === "map" && <Tools zoom={zoom} setZoom={setZoom} />}
                <Layers />
            </aside>

            <main className="center">
                {mode === "map" && (
                    <div className="stage">
                        <MapCanvas zoom={zoom} />
                    </div>
                )}
                {mode === "tileset" && <TilesetStage />}
                {mode === "generate" && <GenerateStage />}
            </main>

            <aside className={`right${state.previewLarge ? " large-preview" : ""}`}>
                <div className="right-panel">
                    {mode === "map" && tool === "object" && <Objects />}
                    {mode === "map" && tool === "select" && (
                        <section className="panel">
                            <h3>Selection</h3>
                            <Selection />
                        </section>
                    )}
                    {mode === "map" && tool === "lock" && (
                        <section className="panel">
                            <h3>Locks</h3>
                            <p className="hint">
                                Paint over cells the generator must keep. {state.locks.length}{" "}
                                locked. Then generate with the same map size.
                            </p>
                            <button
                                disabled={!state.locks.length}
                                onClick={() => state.set({ locks: [] })}
                            >
                                Clear locks
                            </button>
                        </section>
                    )}
                    {mode === "map" && tool !== "object" && <Palette />}
                    {mode === "tileset" && <TilesetPanel />}
                    {mode === "generate" && <GeneratePanel />}
                </div>
                <Preview />
            </aside>

            <footer className="statusbar">
                <Problems />
                <span className="spacer" />
                {map && (
                    <span className="hint">
                        {map.width}×{map.height} tiles · {docPath}
                    </span>
                )}
            </footer>

            {state.toast && <div className={`toast ${state.toast.kind}`}>{state.toast.text}</div>}
            {dialog === "new" && <NewMap onClose={() => setDialog(null)} />}
            {dialog === "resize" && map && <Resize onClose={() => setDialog(null)} />}
        </div>
    );
}
