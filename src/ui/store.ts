/** App state. One undo stack covers the map, tileset definitions and prefab libraries. */
import { create } from "zustand";
import { generatedWith } from "../core/build";
import {
    applyCells,
    mapCells,
    readMapTilesets,
    type Catalog,
    type Cell,
    type CellChange,
    type EditContext,
    type Grid,
    type ResolvedSet,
    type TilesetEntry,
} from "../core/doc";
import type { GenParams, GenResult } from "../core/generator";
import { basename, dirname, join } from "../core/path";
import {
    findInstances,
    flatten,
    usablePrefabs,
    type Instance,
    type LibPrefab,
    type PrefabLibrary,
} from "../core/prefab";
import type { Issue, Profile } from "../core/profile";
import { coverageMap, type Raster } from "../core/raster";
import {
    TILED_FORMAT,
    isRef,
    newMap,
    parse,
    stringify,
    type JsonFormat,
    type TiledMap,
    type TiledTileset,
} from "../core/tiled";
import { tilesetForImage } from "../core/tileset";
import { profileById } from "../profiles";
import { generic } from "../profiles/generic";
import * as api from "./api";

export interface LoadedImage {
    image: HTMLImageElement;
    raster: Raster;
    /** Visible pixel count per tile id. */
    coverage: Uint16Array;
}

export interface StampCell {
    dx: number;
    dy: number;
    cell: Cell;
    /** Unset: goes on the active layer. */
    layer?: string;
}

export interface Stamp {
    w: number;
    h: number;
    cells: StampCell[];
    label: string;
}

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface SheetSelection extends Rect {
    tileset: string;
}

export type Tool = "brush" | "erase" | "rect" | "pick" | "select" | "swap" | "object" | "lock";
export type Mode = "map" | "tileset" | "generate";

interface Snapshot {
    map: TiledMap | null;
    sets: ResolvedSet[];
    catalog: Catalog;
    libraries: Record<string, PrefabLibrary>;
}

export interface State extends Snapshot {
    ready: boolean;
    fatal: string | null;
    project: api.ServerConfig | null;
    profile: Profile;
    savedDefs: Record<string, TiledTileset>;
    savedLibraries: Record<string, PrefabLibrary>;
    savedMap: TiledMap | null;
    images: Record<string, LoadedImage | "loading" | "error">;
    imageVersion: number;
    rawImages: string[];
    mapFiles: string[];
    docPath: string | null;
    mapFormat: JsonFormat;
    past: Snapshot[];
    future: Snapshot[];

    mode: Mode;
    tool: Tool;
    activeLayer: string;
    activeObjectLayer: string;
    hiddenLayers: string[];
    activeTileset: string | null;
    sheetSel: SheetSelection | null;
    stamp: Stamp | null;
    mapSel: Rect | null;
    selectedObject: number | null;
    swapTarget: { x: number; y: number } | null;
    locks: number[];
    selectedPrefab: string | null;
    tilesetTab: "props" | "anim" | "prefabs";
    /** Clicking the sheet adds animation frames instead of selecting. */
    framePick: boolean;
    overlays: { grid: boolean; props: boolean; objects: boolean; issues: boolean };
    previewContext: string;
    previewOverlay: boolean;
    previewLarge: boolean;
    candidates: GenResult[];
    candidate: number | null;
    genParams: GenParams & { recipe: string; count: number; keepLocks: boolean };
    toast: { text: string; kind: "info" | "error" } | null;

    init: () => Promise<void>;
    set: (partial: Partial<State>) => void;
    notify: (text: string, kind?: "info" | "error") => void;
    loadImage: (name: string) => void;
    openMap: (path: string) => Promise<void>;
    createMap: (name: string, width: number, height: number) => void;
    saveAll: () => Promise<void>;
    /** Replaces undoable state, recording an undo step unless `merge`. */
    commit: (next: Partial<Snapshot>, merge?: boolean) => void;
    paint: (changes: CellChange[], merge?: boolean) => void;
    setMap: (map: TiledMap, merge?: boolean) => void;
    setDef: (name: string, def: TiledTileset, merge?: boolean) => void;
    setLibrary: (library: PrefabLibrary, merge?: boolean) => void;
    addSheet: (imagePath: string) => Promise<string | null>;
    reloadImage: (name: string) => void;
    undo: () => void;
    redo: () => void;
}

const HISTORY = 200;

export const editContext = (
    state: Pick<State, "docPath" | "catalog" | "profile">,
): EditContext => ({
    mapPath: state.docPath ?? join(state.profile.roots.maps, "untitled.tmj"),
    catalog: state.catalog,
    embed: state.profile.embed,
    order: { tileLayers: state.profile.tileLayers, objectLayers: state.profile.objectLayers },
});

function decode(image: HTMLImageElement): Raster {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { data, width, height };
}

const libraryFile = (tileset: string) => `${tileset.replace(/[\\/:*?"<>|]/g, "-")}.prefabs.json`;

export const useStore = create<State>((set, get) => ({
    ready: false,
    fatal: null,
    project: null,
    profile: generic,
    map: null,
    sets: [],
    catalog: {},
    libraries: {},
    savedDefs: {},
    savedLibraries: {},
    savedMap: null,
    images: {},
    imageVersion: 1,
    rawImages: [],
    mapFiles: [],
    docPath: null,
    mapFormat: TILED_FORMAT,
    past: [],
    future: [],

    mode: "map",
    tool: "brush",
    activeLayer: "",
    activeObjectLayer: "",
    hiddenLayers: [],
    activeTileset: null,
    sheetSel: null,
    stamp: null,
    mapSel: null,
    selectedObject: null,
    swapTarget: null,
    locks: [],
    selectedPrefab: null,
    tilesetTab: "props",
    framePick: false,
    overlays: { grid: true, props: false, objects: true, issues: true },
    previewContext: "",
    previewOverlay: false,
    previewLarge: false,
    candidates: [],
    candidate: null,
    genParams: {
        recipe: "entrance",
        width: 10,
        height: 10,
        seed: 1,
        themes: [],
        symmetry: true,
        density: 1,
        count: 6,
        keepLocks: true,
    },
    toast: null,

    set: (partial) => set(partial),

    notify: (text, kind = "info") => {
        const toast = { text, kind };
        set({ toast });
        setTimeout(
            () => get().toast === toast && set({ toast: null }),
            kind === "error" ? 8000 : 3000,
        );
    },

    async init() {
        try {
            const project = await api.config();
            const profile = profileById(project.profile);
            if (!project.exists) {
                set({ project, profile, fatal: `Project folder not found: ${project.project}` });
                return;
            }
            const catalog: Catalog = {};
            const tsjFiles = await api.list("project", profile.roots.tilesets, [".tsj"]);
            await Promise.all(
                tsjFiles.map(async (path) => {
                    const { value, format } = parse<TiledTileset>(await api.text("project", path));
                    if (!value.image || catalog[value.name]) return;
                    catalog[value.name] = {
                        name: value.name,
                        def: value,
                        path,
                        imagePath: join(dirname(path), value.image),
                        origin: "tsj",
                        readOnly: false,
                        format,
                    };
                }),
            );
            if (profile.harvest) {
                const { dir, suffix } = profile.harvest;
                const hosts = await api.list("project", dir, [suffix]);
                for (const path of hosts) {
                    const host = JSON.parse(await api.text("project", path)) as TiledMap;
                    for (const tileset of host.tilesets) {
                        if (isRef(tileset) || catalog[tileset.name]) continue;
                        const { firstgid: _firstgid, ...def } = tileset;
                        catalog[tileset.name] = {
                            name: tileset.name,
                            def: def as TiledTileset,
                            imagePath: join(dirname(path), tileset.image),
                            origin: "map",
                            readOnly: true,
                            variant: basename(path, suffix),
                        };
                    }
                }
            }
            const used = new Set(Object.values(catalog).map((entry) => entry.imagePath));
            const pngs = await api.list("project", profile.roots.tilesets, [".png"]);
            const mapFiles = await api.list("project", profile.roots.maps, [".tmj"]);
            const libraries: Record<string, PrefabLibrary> = {};
            for (const path of await api.list("lib", "", [".prefabs.json"])) {
                const library = JSON.parse(await api.text("lib", path)) as PrefabLibrary;
                libraries[library.tileset] = library;
            }
            const contexts = profile.contexts(catalog);
            set({
                ready: true,
                project,
                profile,
                catalog,
                savedDefs: Object.fromEntries(Object.values(catalog).map((e) => [e.name, e.def])),
                libraries,
                savedLibraries: libraries,
                rawImages: pngs.filter((path) => !used.has(path)),
                mapFiles,
                activeLayer:
                    profile.tileLayers[profile.tileLayers.length - 2] ?? profile.tileLayers[0]!,
                activeObjectLayer: profile.defaultObjectLayer,
                activeTileset:
                    Object.values(catalog)
                        .filter((e) => e.origin === "tsj")
                        .map((e) => e.name)
                        .sort()[0] ?? null,
                previewContext: contexts[0] ?? "",
            });
            if (mapFiles[0]) await get().openMap(mapFiles[0]);
        } catch (error) {
            set({ fatal: (error as Error).message });
        }
    },

    loadImage(name) {
        const state = get();
        const entry = state.catalog[name];
        if (!entry || state.images[name]) return;
        set({ images: { ...state.images, [name]: "loading" } });
        const image = new Image();
        image.onload = () => {
            const raster = decode(image);
            const def = get().catalog[name]?.def ?? entry.def;
            set({
                images: {
                    ...get().images,
                    [name]: { image, raster, coverage: coverageMap(raster, def) },
                },
            });
        };
        image.onerror = () => set({ images: { ...get().images, [name]: "error" } });
        image.src = api.fileUrl("project", entry.imagePath, state.imageVersion);
    },

    reloadImage(name) {
        const { [name]: _dropped, ...images } = get().images;
        set({ images, imageVersion: get().imageVersion + 1 });
        get().loadImage(name);
    },

    async openMap(path) {
        try {
            const { value: map, format } = parse<TiledMap>(await api.text("project", path));
            const state = get();
            const { sets, discovered, missing } = readMapTilesets(map, path, state.catalog);
            const catalog = { ...state.catalog };
            for (const entry of discovered) catalog[entry.name] = entry;
            const generated = generatedWith(map);
            // Preview the map in the surroundings whose sheets it already uses.
            const home = sets.map((s) => catalog[s.name]?.variant).find(Boolean);
            const contexts = state.profile.contexts(catalog);
            set({
                previewContext: home && contexts.includes(home) ? home : state.previewContext,
                map,
                sets,
                catalog,
                savedMap: map,
                docPath: path,
                mapFormat: format,
                past: [],
                future: [],
                mapSel: null,
                selectedObject: null,
                swapTarget: null,
                locks: [],
                candidates: [],
                candidate: null,
                genParams: {
                    ...state.genParams,
                    width: map.width,
                    height: map.height,
                    ...(generated?.params ? (generated.params as GenParams) : {}),
                    ...(generated ? { recipe: generated.recipe } : {}),
                },
            });
            if (missing.length) {
                get().notify(`Tilesets not found: ${missing.join(", ")}`, "error");
            }
        } catch (error) {
            get().notify(`Could not open ${path}: ${(error as Error).message}`, "error");
        }
    },

    createMap(name, width, height) {
        const { profile, mapFiles } = get();
        const file = name.endsWith(".tmj") ? name : `${name}.tmj`;
        const path = join(profile.roots.maps, file);
        set({
            map: newMap(width, height, profile.tileSize, profile.tileLayers),
            sets: [],
            savedMap: null,
            docPath: path,
            mapFormat: TILED_FORMAT,
            mapFiles: mapFiles.includes(path) ? mapFiles : [...mapFiles, path].sort(),
            past: [],
            future: [],
            mapSel: null,
            selectedObject: null,
            swapTarget: null,
            locks: [],
        });
    },

    async saveAll() {
        const state = get();
        try {
            let count = 0;
            const savedDefs = { ...state.savedDefs };
            for (const entry of Object.values(state.catalog)) {
                if (!entry.path || entry.readOnly || savedDefs[entry.name] === entry.def) continue;
                await api.write(
                    "project",
                    entry.path,
                    stringify(entry.def, entry.format ?? TILED_FORMAT),
                );
                savedDefs[entry.name] = entry.def;
                count++;
            }
            for (const library of Object.values(state.libraries)) {
                if (state.savedLibraries[library.tileset] === library) continue;
                await api.write(
                    "lib",
                    libraryFile(library.tileset),
                    JSON.stringify(library, null, 4) + "\n",
                );
                count++;
            }
            if (state.map && state.docPath && state.map !== state.savedMap) {
                await api.write("project", state.docPath, stringify(state.map, state.mapFormat));
                count++;
            }
            set({ savedDefs, savedLibraries: state.libraries, savedMap: state.map });
            get().notify(
                count ? `Saved ${count} file${count === 1 ? "" : "s"}` : "Nothing to save",
            );
        } catch (error) {
            get().notify(`Save failed: ${(error as Error).message}`, "error");
        }
    },

    commit(next, merge = false) {
        const state = get();
        const snapshot: Snapshot = {
            map: state.map,
            sets: state.sets,
            catalog: state.catalog,
            libraries: state.libraries,
        };
        set({
            ...next,
            past: merge ? state.past : [...state.past.slice(-HISTORY + 1), snapshot],
            future: merge ? state.future : [],
        });
    },

    paint(changes, merge = false) {
        const state = get();
        if (!state.map || !changes.length) return;
        try {
            const { map, sets } = applyCells(state.map, state.sets, changes, editContext(state));
            if (map !== state.map) state.commit({ map, sets }, merge);
        } catch (error) {
            state.notify((error as Error).message, "error");
        }
    },

    setMap(map, merge = false) {
        get().commit({ map }, merge);
    },

    setDef(name, def, merge = false) {
        const state = get();
        const entry = state.catalog[name];
        if (!entry || entry.readOnly || entry.def === def) return;
        state.commit({ catalog: { ...state.catalog, [name]: { ...entry, def } } }, merge);
    },

    setLibrary(library, merge = false) {
        const state = get();
        state.commit({ libraries: { ...state.libraries, [library.tileset]: library } }, merge);
    },

    async addSheet(imagePath) {
        const state = get();
        const name = basename(imagePath, ".png");
        if (state.catalog[name]) {
            state.notify(`A tileset named "${name}" already exists`, "error");
            return null;
        }
        const image = new Image();
        image.src = api.fileUrl("project", imagePath, state.imageVersion);
        try {
            await image.decode();
        } catch {
            state.notify(`Could not read ${imagePath}`, "error");
            return null;
        }
        const def = tilesetForImage(
            name,
            basename(imagePath),
            image.naturalWidth,
            image.naturalHeight,
            state.profile.tileSize,
        );
        // The .tsj is written next to the image on the next save.
        const entry: TilesetEntry = {
            name,
            def,
            path: imagePath.replace(/\.png$/i, ".tsj"),
            imagePath,
            origin: "tsj",
            readOnly: false,
            format: TILED_FORMAT,
        };
        state.commit({ catalog: { ...state.catalog, [name]: entry } });
        set({
            rawImages: get().rawImages.filter((path) => path !== imagePath),
            activeTileset: name,
            sheetSel: null,
        });
        return name;
    },

    undo() {
        const state = get();
        const previous = state.past[state.past.length - 1];
        if (!previous) return;
        set({
            ...previous,
            past: state.past.slice(0, -1),
            future: [
                {
                    map: state.map,
                    sets: state.sets,
                    catalog: state.catalog,
                    libraries: state.libraries,
                },
                ...state.future,
            ],
        });
    },

    redo() {
        const state = get();
        const [next, ...future] = state.future;
        if (!next) return;
        set({
            ...next,
            future,
            past: [
                ...state.past,
                {
                    map: state.map,
                    sets: state.sets,
                    catalog: state.catalog,
                    libraries: state.libraries,
                },
            ],
        });
    },
}));

// ── derived state ────────────────────────────────────────────────────────────

function memo<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    let lastArgs: A | undefined;
    let last: R;
    return (...args) => {
        if (!lastArgs || args.some((arg, i) => arg !== lastArgs![i])) {
            last = fn(...args);
            lastArgs = args;
        }
        return last;
    };
}

const EMPTY: Record<string, Grid> = {};

const gridsOf = memo((map: TiledMap | null, sets: ResolvedSet[]) =>
    map ? mapCells(map, sets) : EMPTY,
);
export const useGrids = () => useStore((state) => gridsOf(state.map, state.sets));

const prefabsOf = memo((libraries: Record<string, PrefabLibrary>) =>
    flatten(Object.values(libraries)),
);
export const usePrefabs = (): LibPrefab[] => useStore((state) => prefabsOf(state.libraries));

const usableOf = memo(
    (libraries: Record<string, PrefabLibrary>, catalog: Catalog, profile: Profile) =>
        usablePrefabs(prefabsOf(libraries), (tileset, tile, layer) => {
            const entry = catalog[tileset];
            if (!entry) return `Sheet "${tileset}" isn't in this project yet`;
            if (tile >= entry.def.tilecount)
                return `${tileset}:${tile} is past the end of the sheet`;
            return profile.tileProblem(entry, tile, layer);
        }),
);
/** Prefabs split into those that work in a map now and those that don't, with why. */
export const useUsablePrefabs = () =>
    useStore((state) => usableOf(state.libraries, state.catalog, state.profile));

const instancesOf = memo(
    (
        map: TiledMap | null,
        sets: ResolvedSet[],
        libraries: Record<string, PrefabLibrary>,
    ): Instance[] =>
        map ? findInstances(gridsOf(map, sets), map.width, map.height, prefabsOf(libraries)) : [],
);
export const useInstances = () =>
    useStore((state) => instancesOf(state.map, state.sets, state.libraries));

const issuesOf = memo(
    (
        map: TiledMap | null,
        sets: ResolvedSet[],
        catalog: Catalog,
        images: State["images"],
        profile: Profile,
    ): Issue[] => {
        if (!map) return [];
        return profile.validate({
            map,
            sets,
            catalog,
            blank: (tileset, tile) => {
                const loaded = images[tileset];
                return typeof loaded === "object" && loaded.coverage[tile] === 0;
            },
        });
    },
);
export const useIssues = () =>
    useStore((state) =>
        issuesOf(state.map, state.sets, state.catalog, state.images, state.profile),
    );

export function isDirty(state: State): boolean {
    return (
        state.map !== state.savedMap ||
        state.libraries !== state.savedLibraries ||
        Object.values(state.catalog).some(
            (entry) => entry.path && !entry.readOnly && state.savedDefs[entry.name] !== entry.def,
        )
    );
}

/** The images for these tilesets, kicking off any that haven't loaded. */
export function useImages(names: readonly string[]): State["images"] {
    const images = useStore((state) => state.images);
    const loadImage = useStore((state) => state.loadImage);
    for (const name of names) if (!images[name]) queueMicrotask(() => loadImage(name));
    return images;
}
