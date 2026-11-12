import { describe, expect, it } from "vitest";
import {
    addObject,
    applyCells,
    cellOf,
    findObject,
    gidOf,
    mapCells,
    objectAt,
    readMapTilesets,
    resizeMap,
    unusedTilesets,
    updateObject,
    type EditContext,
} from "./doc";
import { CAVE_POI, cavePoi, fixtureCatalog } from "./testing";
import { isRef, newMap, stringify } from "./tiled";

const catalog = fixtureCatalog();
const ctx: EditContext = {
    mapPath: CAVE_POI,
    catalog,
    embed: (entry) => entry.origin === "map",
    order: { tileLayers: ["terrain", "paths", "structure"], objectLayers: ["POI", "spawn"] },
};

describe("map tilesets", () => {
    it("matches the forest cave's tilesets to the catalog", () => {
        const { sets, missing, discovered } = readMapTilesets(cavePoi().value, CAVE_POI, catalog);
        expect(missing).toEqual([]);
        expect(discovered).toEqual([]);
        expect(sets.map((set) => [set.firstgid, set.name])).toEqual([
            [1, "forestPath_"],
            [41, "cave_ [cliff]"],
            [1191, "caveObjects_"],
            [1323, "caveStructures_ [fountainPortalBridge]"],
            [1683, "skulls_"],
        ]);
    });

    it("reports references it can't find and adopts unknown embedded sets", () => {
        const { missing, discovered } = readMapTilesets(cavePoi().value, CAVE_POI, {});
        expect(missing).toHaveLength(4);
        expect(discovered.map((entry) => entry.imagePath)).toEqual([
            "public/graphics/tilesets/fantasy/forest_/forestPath_.png",
        ]);
    });

    it("converts gids to cells and back", () => {
        const { sets } = readMapTilesets(cavePoi().value, CAVE_POI, catalog);
        expect(cellOf(29, sets)).toEqual({ tileset: "forestPath_", tile: 28 });
        expect(cellOf(1191 + 69, sets)).toEqual({ tileset: "caveObjects_", tile: 69 });
        expect(cellOf(0, sets)).toBeNull();
        expect(gidOf({ tileset: "skulls_", tile: 2 }, sets)).toBe(1685);
        expect(gidOf({ tileset: "nope", tile: 0 }, sets)).toBeUndefined();
    });
});

describe("editing", () => {
    it("leaves the map untouched when nothing changes", () => {
        const { value, format } = cavePoi();
        const { sets } = readMapTilesets(value, CAVE_POI, catalog);
        const { map } = applyCells(value, sets, [], ctx);
        expect(stringify(map, format)).toBe(stringify(value, format));
    });

    it("paints and erases without mutating the source", () => {
        const { value } = cavePoi();
        const { sets } = readMapTilesets(value, CAVE_POI, catalog);
        const before = JSON.stringify(value);
        const { map } = applyCells(
            value,
            sets,
            [
                { layer: "structure", x: 5, y: 9, cell: { tileset: "skulls_", tile: 1 } },
                { layer: "paths", x: 0, y: 0, cell: null },
            ],
            ctx,
        );
        expect(JSON.stringify(value)).toBe(before);
        const cells = mapCells(map, sets);
        expect(cells.structure![95]).toEqual({ tileset: "skulls_", tile: 1 });
        expect(cells.paths![0]).toBeNull();
    });

    it("adds a tileset after the last one, as a reference or embedded", () => {
        const blank = newMap(4, 4, 16, ["paths", "structure"]);
        const first = applyCells(
            blank,
            [],
            [{ layer: "paths", x: 0, y: 0, cell: { tileset: "forestPath_", tile: 28 } }],
            ctx,
        );
        const second = applyCells(
            first.map,
            first.sets,
            [{ layer: "structure", x: 1, y: 1, cell: { tileset: "skulls_", tile: 3 } }],
            ctx,
        );
        const [path, skulls] = second.map.tilesets;
        expect(isRef(path!)).toBe(false);
        expect(path).toMatchObject({
            firstgid: 1,
            name: "forestPath_",
            image: "../../../public/graphics/tilesets/fantasy/forest_/forestPath_.png",
        });
        expect(skulls).toEqual({
            firstgid: 41,
            source: "../../../public/graphics/tilesets/cave_/skulls_.tsj",
        });
        expect(second.map.layers[1]!.data![5]).toBe(44);
    });

    it("creates a missing layer in profile order", () => {
        const blank = newMap(2, 2, 16, ["terrain", "structure"]);
        const { map } = applyCells(
            blank,
            [],
            [{ layer: "paths", x: 0, y: 0, cell: { tileset: "forestPath_", tile: 28 } }],
            ctx,
        );
        expect(map.layers.map((layer) => layer.name)).toEqual(["terrain", "paths", "structure"]);
        expect(map.nextlayerid).toBe(4);
    });

    it("resizes, keeping content and shifting objects", () => {
        const { value } = cavePoi();
        const grown = resizeMap(value, 12, 11, 1, 1);
        expect(grown.layers[2]!.data).toHaveLength(132);
        expect(grown.layers[2]!.data![1 * 12 + 1]).toBe(value.layers[2]!.data![0]);
        expect(grown.layers[5]!.objects![0]).toMatchObject({ x: 80, y: 96 });
        const shrunk = resizeMap(value, 5, 5);
        expect(shrunk.layers[3]!.data![4]).toBe(value.layers[3]!.data![4]);
    });

    it("lists tilesets nothing uses", () => {
        const { value } = cavePoi();
        const { sets } = readMapTilesets(value, CAVE_POI, catalog);
        expect(unusedTilesets(value, sets)).toEqual([]);
        const emptied = {
            ...value,
            layers: value.layers.map((l) =>
                l.name === "structure" ? { ...l, data: l.data!.map(() => 0) } : l,
            ),
        };
        expect(unusedTilesets(emptied, sets)).toContain("skulls_");
    });
});

describe("objects", () => {
    it("adds, finds, edits and removes objects", () => {
        const { value } = cavePoi();
        const { map, id } = addObject(
            value,
            "spawn",
            { name: "boss", x: 32, y: 48, width: 0, height: 0, point: true },
            ctx.order,
        );
        expect(id).toBe(2);
        expect(map.nextobjectid).toBe(3);
        expect(map.layers.map((layer) => layer.name).slice(-2)).toEqual(["POI", "spawn"]);
        expect(findObject(map, id)?.object).toMatchObject({ name: "boss", point: true });
        expect(Object.keys(findObject(map, id)!.object)).toEqual(
            Object.keys(findObject(map, id)!.object).slice().sort(),
        );
        expect(objectAt(map, 70, 85)?.object.name).toBe("dungeon-entrance");
        expect(objectAt(map, 34, 50)?.object.name).toBe("boss");
        const renamed = updateObject(map, id, (object) => ({ ...object, name: "chief" }));
        expect(findObject(renamed, id)?.object.name).toBe("chief");
        expect(
            findObject(
                updateObject(renamed, id, () => null),
                id,
            ),
        ).toBeUndefined();
    });
});
