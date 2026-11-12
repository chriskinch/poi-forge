import { useMemo } from "react";
import { resultToMap } from "../core/build";
import {
    clampSize,
    generateValid,
    themesOf,
    type GenContext,
    type GenResult,
} from "../core/generator";
import { RECIPES, recipeById } from "../core/recipes";
import { tileProps } from "../core/tileset";
import { NumberField } from "./Modal";
import { editContext, useGrids, useStore, useUsablePrefabs } from "./store";
import { Thumb } from "./Thumb";

/** Themes on by default: the surroundings' own, plus every theme that isn't a surrounding. */
function defaultThemes(all: string[], contexts: string[], current: string): string[] {
    return all.filter((theme) => !contexts.includes(theme) || theme === current);
}

function useGenerator() {
    const state = useStore();
    const grids = useGrids();
    const { profile, catalog, genParams, map, locks } = state;
    const { usable: prefabs, rejected } = useUsablePrefabs();
    const allThemes = useMemo(() => themesOf(prefabs), [prefabs]);
    const contexts = useMemo(() => profile.contexts(catalog), [profile, catalog]);
    const themes = genParams.themes.length
        ? genParams.themes
        : defaultThemes(allThemes, contexts, state.previewContext);

    const run = (seed = genParams.seed) => {
        const recipe = recipeById(genParams.recipe);
        if (!recipe) return;
        const usable =
            genParams.keepLocks &&
            map &&
            map.width === genParams.width &&
            map.height === genParams.height;
        const ctx: GenContext = {
            prefabs,
            layers: profile.tileLayers,
            solid: (cell, layer) => {
                const def = catalog[cell.tileset]?.def;
                return !!def && profile.isSolid(tileProps(def, cell.tile), layer);
            },
            locks: usable
                ? locks.map((index) => ({
                      x: index % map.width,
                      y: Math.floor(index / map.width),
                      cells: Object.fromEntries(
                          Object.entries(grids).map(([layer, grid]) => [
                              layer,
                              grid[index] ?? null,
                          ]),
                      ),
                  }))
                : [],
        };
        const candidates = Array.from({ length: genParams.count }, (_, i) =>
            generateValid(
                recipe,
                {
                    width: genParams.width,
                    height: genParams.height,
                    seed: seed + i,
                    themes,
                    symmetry: genParams.symmetry,
                    density: genParams.density,
                },
                ctx,
            ),
        );
        state.set({
            candidates,
            candidate: candidates.length ? 0 : null,
            genParams: { ...genParams, seed },
        });
        if (!prefabs.length)
            state.notify("No prefabs defined yet. Add some in the Tileset tab first.", "error");
    };
    return { run, allThemes, themes, rejected };
}

/** Generate mode's right panel: recipe and sliders. */
export function GeneratePanel() {
    const state = useStore();
    const { genParams, map, locks } = state;
    const { run, allThemes, themes, rejected } = useGenerator();
    const skipped = rejected.filter(
        ({ prefab }) =>
            !prefab.themes.length || prefab.themes.some((theme) => themes.includes(theme)),
    );
    const recipe = recipeById(genParams.recipe) ?? RECIPES[0]!;
    const update = (partial: Partial<typeof genParams>) =>
        state.set({ genParams: { ...genParams, ...partial } });
    const locksFit = !!map && map.width === genParams.width && map.height === genParams.height;

    return (
        <section className="panel generate" data-testid="generate-panel">
            <h3>Recipe</h3>
            <select
                value={recipe.id}
                onChange={(event) => {
                    const next = recipeById(event.target.value)!;
                    update({
                        recipe: next.id,
                        ...clampSize(next, genParams.width, genParams.height),
                    });
                }}
                data-testid="recipe"
            >
                {RECIPES.map((r) => (
                    <option key={r.id} value={r.id}>
                        {r.name}
                    </option>
                ))}
            </select>
            <p className="hint">{recipe.description}</p>
            <div className="grid-4">
                <NumberField
                    label="Width"
                    min={recipe.size.w[0]}
                    max={recipe.size.w[1]}
                    value={genParams.width}
                    onChange={(width) => update({ width })}
                />
                <NumberField
                    label="Height"
                    min={recipe.size.h[0]}
                    max={recipe.size.h[1]}
                    value={genParams.height}
                    onChange={(height) => update({ height })}
                />
                <NumberField
                    label="Seed"
                    min={0}
                    max={999999999}
                    value={genParams.seed}
                    onChange={(seed) => update({ seed })}
                />
                <NumberField
                    label="Variants"
                    min={1}
                    max={12}
                    value={genParams.count}
                    onChange={(count) => update({ count })}
                />
            </div>
            <label className="field">
                <span>Density {genParams.density.toFixed(2)}×</span>
                <input
                    type="range"
                    min={0}
                    max={2.5}
                    step={0.05}
                    value={genParams.density}
                    onChange={(event) => update({ density: Number(event.target.value) })}
                />
            </label>
            <label className="check">
                <input
                    type="checkbox"
                    checked={genParams.symmetry}
                    onChange={(event) => update({ symmetry: event.target.checked })}
                />
                Symmetrical
            </label>
            <label
                className="check"
                title="Cells marked with the Lock tool are kept and nothing is placed on them"
            >
                <input
                    type="checkbox"
                    checked={genParams.keepLocks}
                    disabled={!locks.length}
                    onChange={(event) => update({ keepLocks: event.target.checked })}
                />
                Keep {locks.length} locked cell{locks.length === 1 ? "" : "s"}
                {locks.length > 0 && !locksFit && <em> (size differs from the open map)</em>}
            </label>
            <h3>Themes</h3>
            {allThemes.length ? (
                <div className="chips">
                    {allThemes.map((theme) => (
                        <button
                            key={theme}
                            className={`chip${themes.includes(theme) ? " active" : ""}`}
                            onClick={() =>
                                update({
                                    themes: themes.includes(theme)
                                        ? themes.filter((t) => t !== theme)
                                        : [...themes, theme],
                                })
                            }
                        >
                            {theme}
                        </button>
                    ))}
                </div>
            ) : (
                <p className="hint">Sheets have no themes yet: every prefab is used.</p>
            )}
            <div className="row">
                <button className="primary" onClick={() => run()} data-testid="generate">
                    Generate
                </button>
                <button
                    onClick={() => run(Math.floor(Math.random() * 1_000_000))}
                    data-testid="reroll"
                >
                    New seeds
                </button>
            </div>
            <p className="hint">Same recipe, settings and seed always give the same result.</p>
            {skipped.length > 0 && (
                <details className="skipped" data-testid="skipped">
                    <summary className="warn">
                        {skipped.length} prefab{skipped.length === 1 ? "" : "s"} left out
                    </summary>
                    <p className="hint">
                        These would not work in a map yet. Fix them in the Tileset tab.
                    </p>
                    <ul>
                        {skipped.slice(0, 60).map(({ prefab, reason }) => (
                            <li key={`${prefab.tileset}/${prefab.id}`}>
                                <b>{prefab.name}</b> <em>{reason}</em>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </section>
    );
}

/** Generate mode's centre: candidates to choose from. */
export function GenerateStage() {
    const state = useStore();
    const { candidates, candidate, profile, docPath } = state;
    const order = profile.tileLayers;

    const use = (result: GenResult, asNew: boolean) => {
        let fresh = false;
        if (asNew || !docPath) {
            const name = window.prompt(
                "File name for the new map",
                `${state.previewContext || "new"}-${result.recipe}`,
            );
            if (!name) return;
            state.createMap(name, result.width, result.height);
            fresh = true;
        }
        const now = useStore.getState();
        try {
            const { map, sets } = resultToMap(result, {
                ...editContext(now),
                tileSize: profile.tileSize,
                tileLayers: profile.tileLayers,
                objectLayer: profile.defaultObjectLayer,
            });
            now.commit({ map, sets }, fresh);
            now.set({
                mode: "map",
                locks: [],
                mapSel: null,
                swapTarget: null,
                selectedObject: null,
            });
        } catch (error) {
            now.notify((error as Error).message, "error");
        }
    };

    if (!candidates.length) {
        return (
            <div className="empty">
                <div>
                    <p>Pick a recipe and press Generate.</p>
                    <p className="hint">
                        The generator composes prefabs by their tags, so tag a few in the Tileset
                        tab first.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="gallery" data-testid="gallery">
            {candidates.map((result, i) => {
                const layers = order.flatMap((name) =>
                    result.layers[name] ? [{ name, grid: result.layers[name]! }] : [],
                );
                return (
                    <article
                        key={`${result.params.seed}-${i}`}
                        className={`candidate${i === candidate ? " active" : ""}`}
                        onPointerEnter={() => state.set({ candidate: i })}
                        onClick={() => state.set({ candidate: i })}
                        data-testid="candidate"
                    >
                        <Thumb
                            layers={layers}
                            width={result.width}
                            height={result.height}
                            scale={2}
                            background="#23262b"
                        />
                        <footer>
                            <span>Seed {result.params.seed}</span>
                            <button
                                className="primary"
                                onClick={() => use(result, false)}
                                data-testid="use-candidate"
                            >
                                {docPath ? "Use" : "Use as new map"}
                            </button>
                            {docPath && (
                                <button
                                    onClick={() => use(result, true)}
                                    title="Create a new map file from this candidate"
                                >
                                    New map
                                </button>
                            )}
                        </footer>
                        {result.problems.map((text) => (
                            <p key={text} className="bad">
                                {text}
                            </p>
                        ))}
                        {result.notes.map((text) => (
                            <p key={text} className="warn">
                                {text}
                            </p>
                        ))}
                    </article>
                );
            })}
        </div>
    );
}
