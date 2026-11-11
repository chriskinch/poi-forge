/**
 * A profile is everything project-specific: where files live, which layers a
 * map has, which tile properties mean something and what makes a map valid.
 * The core and the UI only ever talk to this interface.
 */
import type { Catalog, Cell, Grid, ResolvedSet, TilesetEntry } from "./doc";
import type { PropertyType } from "./tileset";
import type { TiledMap } from "./tiled";

export interface PropertySchema {
    name: string;
    /** `corners` is an int bitmask of tile quadrants: NW=1 NE=2 SW=4 SE=8. */
    type: "bool" | "int" | "corners";
    label: string;
    /** Overlay colour. */
    color: string;
    help: string;
}

export const storedType = (schema: PropertySchema): PropertyType =>
    schema.type === "bool" ? "bool" : "int";

export interface Issue {
    level: "error" | "warning";
    message: string;
    layer?: string;
    x?: number;
    y?: number;
    tileset?: string;
    tile?: number;
}

export interface ValidateInput {
    map: TiledMap;
    sets: readonly ResolvedSet[];
    catalog: Catalog;
    /** True when the tile's art is fully transparent. Absent until images load. */
    blank?: (tileset: string, tile: number) => boolean;
}

export interface ContextResult {
    /** Tiles of surroundings on every side of the map. */
    margin: number;
    background: string;
    /** Full-size grids, (width + 2·margin) × (height + 2·margin), keyed by layer. */
    layers: Record<string, Grid>;
}

export interface Profile {
    id: string;
    label: string;
    tileSize: number;
    roots: {
        /** Where map files are read and written. */
        maps: string;
        /** Where tileset .tsj files and their images live. */
        tilesets: string;
        /** Optional folder of source art to import sheets from. */
        sources?: string;
    };
    tileLayers: readonly string[];
    objectLayers: readonly string[];
    /** Layers that hold standing props (as opposed to flat ground). */
    propLayers: readonly string[];
    /** Layer new objects go on. */
    defaultObjectLayer: string;
    tileProperties: readonly PropertySchema[];
    /**
     * Host maps whose embedded tilesets join the catalog read-only: every file
     * in `dir` ending in `suffix`. The rest of the file name is the variant.
     */
    harvest?: { dir: string; suffix: string };
    /** Whether a tileset is embedded in maps rather than referenced as a .tsj. */
    embed: (entry: TilesetEntry) => boolean;
    /** Layer for one cell of a prefab, from its row above the prefab's base. */
    layerFor: (props: Record<string, unknown>, rowFromBottom: number, height: number) => string;
    /** Properties a prefab piece should carry, by its row above the base. */
    depthRole: (
        rowFromBottom: number,
        height: number
    ) => { name: string; type: PropertyType; value: unknown }[];
    /** Whether a tile with these properties blocks movement on this layer. */
    isSolid: (props: Record<string, unknown>, layer: string) => boolean;
    validate: (input: ValidateInput) => Issue[];
    /** Surroundings the preview can show the map in. */
    contexts: (catalog: Catalog) => string[];
    context?: (map: TiledMap, variant: string, catalog: Catalog) => ContextResult | null;
    /** Themes to preselect when generating for a context variant. */
    themesFor?: (variant: string) => string[];
}

/** Issues every profile shares: tiles that point nowhere, blank tiles painted in. */
export function baseIssues(
    input: ValidateInput,
    cellAt: (gid: number) => Cell | null
): Issue[] {
    const { map, catalog, blank } = input;
    const issues: Issue[] = [];
    for (const layer of map.layers) {
        if (layer.type !== "tilelayer") continue;
        (layer.data ?? []).forEach((gid, i) => {
            if (!gid) return;
            const x = i % map.width;
            const y = Math.floor(i / map.width);
            const cell = cellAt(gid);
            if (!cell || !catalog[cell.tileset]) {
                issues.push({
                    level: "error",
                    message: `Tile ${gid} belongs to no known tileset`,
                    layer: layer.name,
                    x,
                    y,
                });
                return;
            }
            if (cell.tile >= catalog[cell.tileset]!.def.tilecount) {
                issues.push({
                    level: "error",
                    message: `${cell.tileset}:${cell.tile} is past the end of the sheet`,
                    layer: layer.name,
                    x,
                    y,
                });
            } else if (blank?.(cell.tileset, cell.tile)) {
                issues.push({
                    level: "error",
                    message: `${cell.tileset}:${cell.tile} is a blank tile. Erase the cell instead.`,
                    layer: layer.name,
                    x,
                    y,
                    ...cell,
                });
            }
        });
    }
    return issues;
}
