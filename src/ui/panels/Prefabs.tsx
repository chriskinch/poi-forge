import { storedType } from "../../core/profile";
import {
    detectPrefabs,
    emptyLibrary,
    prefabFromTiles,
    removePrefab,
    uniqueId,
    upsertPrefab,
    type Prefab,
    type PrefabKind,
} from "../../core/prefab";
import { frameOnlyTiles, setTileProperty, tileProps } from "../../core/tileset";
import { parseTags, prefabStamp, sheetTiles } from "../helpers";
import { NumberField } from "../Modal";
import { useStore } from "../store";
import { PrefabButton } from "./Palette";

/** Tags the built-in recipes look for. */
export const TAGS = [
    "soil",
    "soil-deco",
    "backdrop",
    "entrance",
    "apron",
    "light",
    "rock",
    "rock-small",
    "plant",
    "tree",
    "bones",
    "grave",
    "ground-deco",
    "shrine",
    "fountain",
    "statue",
    "pillar",
    "wall",
    "fence",
    "fire",
    "tent",
    "seat",
    "clutter",
    "sign",
];

const LAYER_COLORS = ["#6b8f71", "#8fb08a", "#b08d57", "#c9705a", "#7d8fd1", "#b07dd1", "#d1c77d"];

/** Defines and tags the prefabs of one tileset. */
export function Prefabs() {
    const state = useStore();
    const { activeTileset, catalog, sheetSel, profile, selectedPrefab } = state;
    const entry = activeTileset ? catalog[activeTileset] : undefined;
    if (!entry) return null;
    const { def } = entry;
    const library = state.libraries[entry.name] ?? emptyLibrary(entry.name);
    const loaded = state.images[entry.name];
    const prefab = library.prefabs.find((p) => p.id === selectedPrefab);
    const layerFor = (tile: number, rowFromBottom: number, height: number) =>
        profile.layerFor(tileProps(def, tile), rowFromBottom, height);
    const save = (next: Prefab) => state.setLibrary(upsertPrefab(library, next));

    const detect = () => {
        if (typeof loaded !== "object")
            return state.notify("The sheet image hasn't loaded yet", "error");
        const { prefabs, skipped } = detectPrefabs(loaded.raster, def, {
            skip: frameOnlyTiles(def),
            layerFor,
        });
        const covered = new Set(
            library.prefabs.flatMap((p) => p.cells.filter((c) => !c.tileset).map((c) => c.tile)),
        );
        const fresh = prefabs.filter((p) => !p.cells.every((cell) => covered.has(cell.tile)));
        let next = library;
        for (const found of fresh)
            next = upsertPrefab(next, { ...found, id: uniqueId(next, found.id) });
        if (fresh.length) state.setLibrary(next);
        state.notify(
            `${fresh.length} new prefab${fresh.length === 1 ? "" : "s"} proposed` +
                (skipped
                    ? `, ${skipped} large group${skipped === 1 ? "" : "s"} left for manual selection`
                    : "") +
                ". Name and tag the ones worth keeping.",
        );
    };

    const fromSelection = () => {
        if (!sheetSel || sheetSel.tileset !== entry.name)
            return state.notify("Select the prefab's tiles on the sheet first");
        const coverage = typeof loaded === "object" ? loaded.coverage : undefined;
        const tiles = sheetTiles(def, sheetSel).filter((tile) => !coverage || coverage[tile]! > 0);
        if (!tiles.length) return state.notify("That selection is blank");
        const made = prefabFromTiles(def, tiles, layerFor);
        const id = uniqueId(library, made.id);
        state.setLibrary(upsertPrefab(library, { ...made, id }));
        state.set({ selectedPrefab: id });
    };

    const applyRoles = (target: Prefab) => {
        let next = def;
        for (const cell of target.cells) {
            if (cell.tileset || !profile.propLayers.includes(cell.layer)) continue;
            const rowFromBottom = target.h - 1 - cell.dy;
            for (const schema of profile.tileProperties) {
                next = setTileProperty(
                    next,
                    [cell.tile],
                    schema.name,
                    storedType(schema),
                    undefined,
                );
            }
            for (const role of profile.depthRole(rowFromBottom, target.h)) {
                next = setTileProperty(next, [cell.tile], role.name, role.type, role.value);
            }
        }
        state.setDef(entry.name, next);
    };

    return (
        <div className="prefabs" data-testid="prefabs">
            <label className="field">
                <span>Themes for this sheet</span>
                <input
                    defaultValue={library.themes.join(", ")}
                    key={`${entry.name}:${library.themes.join(",")}`}
                    placeholder="e.g. cave, forest"
                    onBlur={(event) => {
                        const themes = parseTags(event.target.value);
                        if (themes.join() !== library.themes.join())
                            state.setLibrary({ ...library, themes });
                    }}
                    data-testid="library-themes"
                />
            </label>
            <p className="hint">The generator only mixes sheets whose themes are switched on.</p>
            <div className="row">
                <button className="primary" onClick={detect} data-testid="detect">
                    Auto-detect
                </button>
                <button onClick={fromSelection} data-testid="prefab-new">
                    New from selection
                </button>
            </div>
            <div className="prefab-list tall">
                {library.prefabs.map((p) => (
                    <PrefabButton
                        key={p.id}
                        prefab={{ ...p, tileset: entry.name, themes: library.themes }}
                        active={p.id === selectedPrefab}
                        onClick={() => state.set({ selectedPrefab: p.id })}
                    />
                ))}
                {!library.prefabs.length && <p className="hint">No prefabs on this sheet yet.</p>}
            </div>
            {prefab && (
                <div className="prefab-editor" data-testid="prefab-editor">
                    <label className="field">
                        <span>Name</span>
                        <input
                            value={prefab.name}
                            onChange={(event) => save({ ...prefab, name: event.target.value })}
                            data-testid="prefab-name"
                        />
                    </label>
                    <label className="field">
                        <span>Tags</span>
                        <input
                            key={`${prefab.id}:${prefab.tags.join(",")}`}
                            defaultValue={prefab.tags.join(", ")}
                            placeholder="rock, plant…"
                            onBlur={(event) =>
                                save({ ...prefab, tags: parseTags(event.target.value) })
                            }
                            data-testid="prefab-tags"
                        />
                    </label>
                    <div className="chips">
                        {TAGS.map((tag) => (
                            <button
                                key={tag}
                                className={`chip${prefab.tags.includes(tag) ? " active" : ""}`}
                                onClick={() =>
                                    save({
                                        ...prefab,
                                        tags: prefab.tags.includes(tag)
                                            ? prefab.tags.filter((t) => t !== tag)
                                            : [...prefab.tags, tag],
                                    })
                                }
                            >
                                {tag}
                            </button>
                        ))}
                    </div>
                    <div className="grid-4">
                        <label className="field">
                            <span>Kind</span>
                            <select
                                value={prefab.kind}
                                onChange={(event) => {
                                    const kind = event.target.value as PrefabKind;
                                    const { stretch: _stretch, ...rest } = prefab;
                                    save(
                                        kind === "stretch"
                                            ? {
                                                  ...rest,
                                                  kind,
                                                  stretch: prefab.stretch ?? { left: 1, right: 1 },
                                              }
                                            : { ...rest, kind },
                                    );
                                }}
                            >
                                <option value="fixed">Fixed</option>
                                <option value="stretch">Stretch</option>
                                <option value="decal">Decal</option>
                            </select>
                        </label>
                        <NumberField
                            label="Weight"
                            min={0.1}
                            max={20}
                            step={0.1}
                            value={prefab.weight ?? 1}
                            onChange={(weight) => save({ ...prefab, weight })}
                            title="Relative chance the generator picks it"
                        />
                        {prefab.kind === "stretch" && prefab.stretch && (
                            <>
                                <NumberField
                                    label="Left cap"
                                    min={0}
                                    max={prefab.w - 1}
                                    value={prefab.stretch.left}
                                    onChange={(left) =>
                                        save({ ...prefab, stretch: { ...prefab.stretch!, left } })
                                    }
                                />
                                <NumberField
                                    label="Right cap"
                                    min={0}
                                    max={prefab.w - 1}
                                    value={prefab.stretch.right}
                                    onChange={(right) =>
                                        save({ ...prefab, stretch: { ...prefab.stretch!, right } })
                                    }
                                />
                            </>
                        )}
                    </div>
                    <p className="hint">
                        {prefab.kind === "fixed" && "Placed as is."}
                        {prefab.kind === "stretch" &&
                            "Cap columns stay at the ends; the columns between repeat to any width."}
                        {prefab.kind === "decal" &&
                            "Flat ground art: never blocks, may sit in the lane."}
                    </p>
                    <h3>Layer of each cell</h3>
                    <div
                        className="cell-layers"
                        style={{ gridTemplateColumns: `repeat(${prefab.w}, 34px)` }}
                    >
                        {Array.from({ length: prefab.w * prefab.h }, (_, i) => {
                            const dx = i % prefab.w;
                            const dy = Math.floor(i / prefab.w);
                            const cell = prefab.cells.find((c) => c.dx === dx && c.dy === dy);
                            if (!cell) return <span key={i} className="gap" />;
                            const at = profile.tileLayers.indexOf(cell.layer);
                            return (
                                <button
                                    key={i}
                                    style={{
                                        background:
                                            LAYER_COLORS[Math.max(0, at) % LAYER_COLORS.length],
                                    }}
                                    title={`${cell.layer} — click for the next layer`}
                                    onClick={() => {
                                        const layer =
                                            profile.tileLayers[
                                                (at + 1) % profile.tileLayers.length
                                            ]!;
                                        save({
                                            ...prefab,
                                            cells: prefab.cells.map((c) =>
                                                c === cell ? { ...c, layer } : c,
                                            ),
                                        });
                                    }}
                                >
                                    {at + 1}
                                </button>
                            );
                        })}
                    </div>
                    <p className="hint legend">
                        {profile.tileLayers.map((name, i) => (
                            <span key={name}>
                                <span
                                    className="swatch"
                                    style={{ background: LAYER_COLORS[i % LAYER_COLORS.length] }}
                                />
                                {i + 1} {name}
                            </span>
                        ))}
                    </p>
                    <div className="row wrap">
                        <button
                            onClick={() => {
                                state.set({
                                    stamp: prefabStamp({
                                        ...prefab,
                                        tileset: entry.name,
                                        themes: library.themes,
                                    }),
                                    mode: "map",
                                    tool: "brush",
                                });
                            }}
                        >
                            Paint with it
                        </button>
                        <button
                            disabled={entry.readOnly}
                            onClick={() => applyRoles(prefab)}
                            title="Base row solid, rows above sorted to the base"
                        >
                            Set depth roles on its tiles
                        </button>
                        <button
                            className="danger"
                            onClick={() => {
                                state.setLibrary(removePrefab(library, prefab.id));
                                state.set({ selectedPrefab: null });
                            }}
                            data-testid="prefab-delete"
                        >
                            Delete
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
