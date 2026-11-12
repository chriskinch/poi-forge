import { useMemo, useState } from "react";
import { basename, dirname, join } from "../../core/path";
import * as api from "../api";
import { Modal } from "../Modal";
import { useStore } from "../store";

/** Chooses the working tileset, and brings new sheets into the project. */
export function TilesetPicker() {
    const catalog = useStore((state) => state.catalog);
    const active = useStore((state) => state.activeTileset);
    const set = useStore((state) => state.set);
    const [adding, setAdding] = useState(false);

    const groups = useMemo(() => {
        const out = new Map<string, string[]>();
        for (const entry of Object.values(catalog)) {
            const group = entry.variant ? `${entry.variant} (read-only)` : "Shared sheets";
            out.set(group, [...(out.get(group) ?? []), entry.name]);
        }
        return [...out.entries()].sort(([a], [b]) =>
            a === "Shared sheets" ? -1 : a.localeCompare(b),
        );
    }, [catalog]);

    return (
        <div className="row tileset-picker">
            <select
                value={active ?? ""}
                onChange={(event) =>
                    set({ activeTileset: event.target.value, sheetSel: null, selectedPrefab: null })
                }
                data-testid="tileset-select"
            >
                {groups.map(([group, names]) => (
                    <optgroup key={group} label={group}>
                        {names.sort().map((name) => (
                            <option key={name} value={name}>
                                {name}
                            </option>
                        ))}
                    </optgroup>
                ))}
            </select>
            <button onClick={() => setAdding(true)} title="Use another sheet image as a tileset">
                Add sheet…
            </button>
            {adding && <AddSheet onClose={() => setAdding(false)} />}
        </div>
    );
}

function AddSheet({ onClose }: { onClose: () => void }) {
    const state = useStore();
    const { profile, rawImages } = state;
    const [filter, setFilter] = useState("");
    const [sources, setSources] = useState<string[] | null>(null);
    const [target, setTarget] = useState("");
    const [busy, setBusy] = useState(false);

    const match = (path: string) => path.toLowerCase().includes(filter.toLowerCase());
    const inProject = rawImages.filter(match).slice(0, 200);
    const fromSources = (sources ?? []).filter(match).slice(0, 200);

    const loadSources = async () => {
        if (!profile.roots.sources) return;
        setBusy(true);
        try {
            setSources(await api.list("project", profile.roots.sources, [".png"]));
        } catch (error) {
            state.notify((error as Error).message, "error");
        }
        setBusy(false);
    };

    const use = async (path: string) => {
        if (await state.addSheet(path)) onClose();
    };

    const importSource = async (path: string) => {
        const folder = target.trim() || basename(dirname(path)).replace(/\s*\[.*$/, "");
        const copy = join(profile.roots.tilesets, folder, basename(path));
        setBusy(true);
        try {
            await api.write("project", copy, await api.blob("project", path));
            if (await state.addSheet(copy)) onClose();
        } catch (error) {
            state.notify((error as Error).message, "error");
        }
        setBusy(false);
    };

    return (
        <Modal title="Add a sheet" onClose={onClose} wide>
            <p className="hint">
                A sheet becomes a tileset with a .tsj next to its image, written on the next save.
                Tiles are {profile.tileSize}px.
            </p>
            <input
                autoFocus
                placeholder="Filter by name…"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
            />
            <h3>Images already in {profile.roots.tilesets}</h3>
            <ul className="file-list">
                {inProject.map((path) => (
                    <li key={path}>
                        <button className="link" disabled={busy} onClick={() => use(path)}>
                            {path.slice(profile.roots.tilesets.length + 1)}
                        </button>
                    </li>
                ))}
                {!inProject.length && <li className="hint">None match.</li>}
            </ul>
            {profile.roots.sources && (
                <>
                    <h3>Import from {profile.roots.sources}</h3>
                    {sources === null ? (
                        <button disabled={busy} onClick={loadSources}>
                            List source art
                        </button>
                    ) : (
                        <>
                            <label className="field">
                                <span>Copy into folder</span>
                                <input
                                    placeholder="pack folder (default: the image's own)"
                                    value={target}
                                    onChange={(event) => setTarget(event.target.value)}
                                />
                            </label>
                            <ul className="file-list">
                                {fromSources.map((path) => (
                                    <li key={path}>
                                        <button
                                            className="link"
                                            disabled={busy}
                                            onClick={() => importSource(path)}
                                        >
                                            {path.slice(profile.roots.sources!.length + 1)}
                                        </button>
                                    </li>
                                ))}
                                {!fromSources.length && <li className="hint">None match.</li>}
                            </ul>
                        </>
                    )}
                </>
            )}
        </Modal>
    );
}
