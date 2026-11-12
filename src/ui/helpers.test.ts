import { describe, expect, it } from "vitest";
import { sheet, testLibrary } from "../core/testing";
import { parseTags, prefabStamp, prefabThumb, sheetStamp, sheetTiles } from "./helpers";

describe("stamps", () => {
    const def = sheet(4, 4);

    it("builds a stamp from a sheet selection", () => {
        const stamp = sheetStamp("s", def, { x: 1, y: 1, w: 2, h: 1 })!;
        expect(stamp.cells.map((c) => [c.dx, c.cell.tile])).toEqual([
            [0, 5],
            [1, 6],
        ]);
        expect(sheetStamp("s", def, { x: 0, y: 0, w: 1, h: 1 })!.label).toBe("s:0");
    });

    it("leaves blank tiles out, and gives nothing for an all-blank selection", () => {
        const coverage = new Uint16Array(16);
        coverage[5] = 12;
        expect(sheetStamp("s", def, { x: 1, y: 1, w: 2, h: 1 }, coverage)!.cells).toHaveLength(1);
        expect(sheetStamp("s", def, { x: 2, y: 2, w: 2, h: 2 }, coverage)).toBeNull();
    });

    it("lists the tiles in a selection", () => {
        expect(sheetTiles(def, { x: 2, y: 3, w: 2, h: 2 })).toEqual([14, 15]);
    });

    it("turns a prefab into a multi-layer stamp and a thumbnail", () => {
        const rock = testLibrary().find((p) => p.id === "rock")!;
        expect(prefabStamp(rock).cells.map((c) => c.layer)).toEqual([
            "structure props",
            "structure props",
            "structure",
            "structure",
        ]);
        const thumb = prefabThumb(rock, ["structure", "structure props"]);
        expect(thumb.layers.map((l) => l.name)).toEqual(["structure", "structure props"]);
        expect(thumb.layers[0]!.grid).toEqual([
            null,
            null,
            { tileset: "t", tile: 42 },
            { tileset: "t", tile: 43 },
        ]);
    });

    it("parses tags", () => {
        expect(parseTags(" Rock,  plant rock\tTREE ")).toEqual(["rock", "plant", "tree"]);
    });
});
