/** Turns a generator result into a Tiled map. */
import { addObject, applyCells, type CellChange, type EditContext, type ResolvedSet } from "./doc";
import type { GenResult } from "./generator";
import { newMap, propsToRecord, withMapProperty, type TiledMap, type TiledProperty } from "./tiled";

export const RECIPE_PROPERTY = "poiForge.recipe";
export const PARAMS_PROPERTY = "poiForge.params";

export interface BuildOptions extends EditContext {
    tileSize: number;
    tileLayers: readonly string[];
    objectLayer: string;
}

function toProperties(record: Record<string, string | number | boolean>): TiledProperty[] {
    return Object.entries(record)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) => ({
            name,
            type:
                typeof value === "boolean"
                    ? "bool"
                    : typeof value === "number"
                      ? Number.isInteger(value)
                          ? "int"
                          : "float"
                      : "string",
            value,
        }));
}

export function resultToMap(
    result: GenResult,
    options: BuildOptions,
): { map: TiledMap; sets: ResolvedSet[] } {
    const { tileSize, tileLayers, objectLayer } = options;
    const names = [
        ...tileLayers,
        ...Object.keys(result.layers).filter((n) => !tileLayers.includes(n)),
    ];
    const changes: CellChange[] = [];
    for (const layer of names) {
        (result.layers[layer] ?? []).forEach((cell, i) => {
            if (cell)
                changes.push({ layer, x: i % result.width, y: Math.floor(i / result.width), cell });
        });
    }
    const built = applyCells(
        newMap(result.width, result.height, tileSize, tileLayers),
        [],
        changes,
        options,
    );
    const { sets } = built;
    let { map } = built;
    for (const object of result.objects) {
        ({ map } = addObject(
            map,
            objectLayer,
            {
                name: object.name,
                x: object.x * tileSize,
                y: object.y * tileSize,
                width: object.w * tileSize,
                height: object.h * tileSize,
                properties: object.properties ? toProperties(object.properties) : undefined,
            },
            options.order,
        ));
    }
    // Recorded so the POI can be re-rolled later. Tiled keeps custom properties.
    map = withMapProperty(map, RECIPE_PROPERTY, "string", result.recipe);
    map = withMapProperty(map, PARAMS_PROPERTY, "string", JSON.stringify(result.params));
    return { map, sets };
}

/** The recipe and parameters a map was generated with, if it was. */
export function generatedWith(map: TiledMap): { recipe: string; params: unknown } | null {
    const props = propsToRecord(map.properties);
    const recipe = props[RECIPE_PROPERTY];
    if (typeof recipe !== "string") return null;
    try {
        return { recipe, params: JSON.parse(String(props[PARAMS_PROPERTY])) };
    } catch {
        return { recipe, params: null };
    }
}
