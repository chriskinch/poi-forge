import { describe, expect, it } from "vitest";
import type { Grid } from "./doc";
import {
    detectPrefabs,
    expand,
    findInstances,
    instanceAt,
    placement,
    prefabFromRegion,
    swapCandidates,
    swapChanges,
    uniqueId,
    upsertPrefab,
    emptyLibrary,
    type LibPrefab,
} from "./prefab";
import { isBlankTile, tileCoverage, touches } from "./raster";
import { blankRaster, paintRect, sheet, testLibrary } from "./testing";

const layerFor = (_tile: number, rowFromBottom: number) => (rowFromBottom === 0 ? "base" : "top");

describe("raster", () => {
    const def = sheet(4, 4);
    const raster = blankRaster(64, 64);
    paintRect(raster, 4, 4, 24, 8); // spans tiles 0 and 1
    paintRect(raster, 40, 20, 4, 4); // inside tile 6

    it("counts coverage and spots blank tiles", () => {
        expect(tileCoverage(raster, def, 0)).toBe(12 * 8);
        expect(isBlankTile(raster, def, 2)).toBe(true);
        expect(isBlankTile(raster, def, 6)).toBe(false);
    });

    it("sees art running across a tile edge", () => {
        expect(touches(raster, def, 0, 1, 0)).toBe(true);
        expect(touches(raster, def, 0, 0, 1)).toBe(false);
        expect(touches(raster, def, 1, 1, 0)).toBe(false);
    });
});

describe("detection", () => {
    const def = sheet(6, 6);
    const raster = blankRaster(96, 96);
    paintRect(raster, 2, 2, 28, 28); // a 2×2 prop at tiles 0,1,6,7
    paintRect(raster, 52, 4, 8, 8); // a lone tile at 3
    paintRect(raster, 4, 52, 8, 40); // a 1×3 column at 18,24,30
    paintRect(raster, 68, 68, 8, 8); // tile 28, an animation frame

    it("groups touching tiles into prefabs", () => {
        const { prefabs, skipped } = detectPrefabs(raster, def, { layerFor, skip: new Set([28]) });
        expect(skipped).toBe(0);
        expect(prefabs.map((p) => [p.w, p.h, p.cells.map((c) => c.tile)])).toEqual([
            [2, 2, [0, 1, 6, 7]],
            [1, 1, [3]],
            [1, 3, [18, 24, 30]],
        ]);
        expect(prefabs[0]!.cells.map((c) => c.layer)).toEqual(["top", "top", "base", "base"]);
        expect(prefabs[0]!.id).toBe("sheet-0-0");
    });

    it("leaves oversized groups to manual selection", () => {
        const big = blankRaster(96, 96);
        paintRect(big, 0, 0, 96, 96);
        expect(detectPrefabs(big, def, { layerFor, maxTiles: 20 })).toEqual({
            prefabs: [],
            skipped: 1,
        });
    });
});

describe("stretch", () => {
    const [, , cliff] = testLibrary() as [LibPrefab, LibPrefab, LibPrefab];

    it("repeats the middle and keeps the caps", () => {
        const row = (width: number) =>
            expand(cliff, width)
                .filter((c) => c.dy === 0)
                .sort((a, b) => a.dx - b.dx)
                .map((c) => c.cell.tile);
        expect(row(3)).toEqual([10, 11, 12]);
        expect(row(6)).toEqual([10, 11, 11, 11, 11, 12]);
        expect(row(2)).toEqual([10, 12]);
    });
});

describe("instances", () => {
    const library = testLibrary();
    const rock = library.find((p) => p.id === "rock")!;
    const width = 6;
    const height = 5;
    const grids: Record<string, Grid> = {
        structure: new Array(30).fill(null),
        "structure props": new Array(30).fill(null),
    };
    for (const change of placement(rock, 2, 1)) {
        grids[change.layer]![change.y * width + change.x] = change.cell;
    }
    grids.structure![4 * width + 5] = { tileset: "t", tile: 51 };

    it("finds prefabs by their tiles, across layers", () => {
        const found = findInstances(grids, width, height, library);
        expect(found.map((i) => [i.prefab.id, i.x, i.y])).toEqual([
            ["rock", 2, 1],
            ["pebble", 5, 4],
        ]);
        expect(instanceAt(found, 3, 2)?.prefab.id).toBe("rock");
        expect(instanceAt(found, 3, 2, "structure props")).toBeUndefined();
        expect(instanceAt(found, 0, 0)).toBeUndefined();
    });

    it("offers same-tag prefabs and swaps on the same base", () => {
        const tall: LibPrefab = {
            ...rock,
            id: "tall-rock",
            h: 3,
            w: 1,
            cells: [
                { dx: 0, dy: 0, layer: "structure props", tile: 80 },
                { dx: 0, dy: 1, layer: "structure props", tile: 81 },
                { dx: 0, dy: 2, layer: "structure", tile: 82 },
            ],
        };
        const twin: LibPrefab = { ...rock, id: "twin" };
        expect(swapCandidates(rock, [...library, tall, twin]).map((p) => p.id)).toEqual([
            "twin",
            "tall-rock",
        ]);
        const [instance] = findInstances(grids, width, height, library);
        const changes = swapChanges(instance!, tall);
        expect(changes.filter((c) => !c.cell)).toHaveLength(4);
        expect(changes.filter((c) => c.cell).map((c) => [c.x, c.y])).toEqual([
            [2, 0],
            [2, 1],
            [2, 2],
        ]);
    });

    it("lifts a prefab out of a map region", () => {
        const prefab = prefabFromRegion(grids, width, { x: 1, y: 0, w: 4, h: 4 }, "t", "lifted")!;
        expect([prefab.w, prefab.h, prefab.cells.length]).toEqual([2, 2, 4]);
        expect(prefab.cells.every((c) => c.tileset === undefined)).toBe(true);
        expect(prefabFromRegion(grids, width, { x: 0, y: 0, w: 1, h: 1 }, "t", "none")).toBeNull();
    });

    it("keeps library ids unique", () => {
        let library2 = emptyLibrary("t");
        library2 = upsertPrefab(library2, rock);
        expect(uniqueId(library2, "rock")).toBe("rock-2");
        expect(upsertPrefab(library2, { ...rock, name: "renamed" }).prefabs).toHaveLength(1);
    });
});
