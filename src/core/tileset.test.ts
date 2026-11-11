import { describe, expect, it } from "vitest";
import {
    animateAppended,
    animateBlock,
    appendLayout,
    frameAt,
    stripFrames,
    uniformDuration,
} from "./animation";
import { fixtureCatalog, sheet } from "./testing";
import { stringify } from "./tiled";
import {
    frameOnlyTiles,
    getTile,
    setAnimation,
    setTileProperty,
    tileProps,
    tileRect,
    tilesetForImage,
    withImageHeight,
} from "./tileset";

const catalog = fixtureCatalog();
const structures = catalog["caveStructures_ [fountainPortalBridge]"]!;
const objects = catalog["caveObjects_"]!;

describe("tile properties", () => {
    it("reads properties", () => {
        expect(tileProps(objects.def, 12)).toEqual({ sortBase: 1 });
        expect(tileProps(objects.def, 0)).toEqual({});
    });

    it("sets a property on several tiles, keeping tiles sorted by id", () => {
        const next = setTileProperty(sheet(4, 4), [9, 2], "collides", "bool", true);
        expect(next.tiles).toEqual([
            { id: 2, properties: [{ name: "collides", type: "bool", value: true }] },
            { id: 9, properties: [{ name: "collides", type: "bool", value: true }] },
        ]);
        expect(Object.keys(next)).toEqual(Object.keys(next).slice().sort());
    });

    it("drops the tile entry when its last property goes", () => {
        const set = setTileProperty(sheet(4, 4), [3], "ground", "bool", true);
        expect(setTileProperty(set, [3], "ground", "bool", undefined).tiles).toEqual([]);
    });

    it("changes a value in place and leaves the rest of the file byte-identical", () => {
        const next = setTileProperty(objects.def, [12], "sortBase", "int", 2);
        expect(tileProps(next, 12)).toEqual({ sortBase: 2 });
        const back = setTileProperty(next, [12], "sortBase", "int", 1);
        expect(stringify(back, objects.format)).toBe(stringify(objects.def, objects.format));
    });

    it("keeps a tile's animation when its properties change", () => {
        const next = setTileProperty(structures.def, [21], "ground", "bool", true);
        expect(getTile(next, 21)?.animation).toHaveLength(4);
        expect(Object.keys(getTile(next, 21)!)).toEqual(["animation", "id", "properties"]);
    });

    it("locates tiles on the sheet, with margin and spacing", () => {
        expect(tileRect(sheet(4, 4), 6)).toEqual({ x: 32, y: 16, w: 16, h: 16 });
        expect(tileRect({ ...sheet(4, 4), margin: 1, spacing: 2 }, 5)).toEqual({ x: 19, y: 19, w: 16, h: 16 });
    });

    it("describes a bare image and grows it by rows", () => {
        const def = tilesetForImage("new", "new.png", 70, 40, 16);
        expect(def).toMatchObject({ columns: 4, tilecount: 8 });
        expect(withImageHeight(def, 64).tilecount).toBe(16);
    });
});

describe("animation", () => {
    it("picks the frame for a time, looping", () => {
        const frames = [
            { duration: 100, tileid: 1 },
            { duration: 50, tileid: 2 },
        ];
        expect(frameAt(frames, 0, 9)).toBe(1);
        expect(frameAt(frames, 120, 9)).toBe(2);
        expect(frameAt(frames, 150, 9)).toBe(1);
        expect(frameAt(undefined, 10, 9)).toBe(9);
    });

    it("fills a strip at a stride and stops at the sheet's edge", () => {
        const def = sheet(6, 2);
        expect(stripFrames(def, { first: 1, count: 3, strideX: 2, strideY: 0, duration: 80 })).toEqual([
            { duration: 80, tileid: 1 },
            { duration: 80, tileid: 3 },
            { duration: 80, tileid: 5 },
        ]);
        expect(stripFrames(def, { first: 4, count: 4, strideX: 1, strideY: 0, duration: 80 })).toHaveLength(2);
    });

    it("rebuilds the cave brazier animation exactly as committed", () => {
        const committed = getTile(objects.def, 112)!.animation!;
        const cleared = setAnimation(objects.def, 112, undefined);
        expect(getTile(cleared, 112)?.animation).toBeUndefined();
        const rebuilt = setAnimation(
            cleared,
            112,
            stripFrames(cleared, { first: 112, count: 4, strideX: 1, strideY: 0, duration: 150 })
        );
        expect(getTile(rebuilt, 112)!.animation).toEqual(committed);
        expect(stringify(rebuilt, objects.format)).toBe(stringify(objects.def, objects.format));
    });

    it("animates a multi-tile block in sync", () => {
        const next = animateBlock(sheet(8, 4), { col: 0, row: 1, w: 2, h: 2, count: 3, strideX: 2, strideY: 0, duration: 120 });
        expect(next.tiles!.map((tile) => tile.id)).toEqual([8, 9, 16, 17]);
        expect(getTile(next, 17)!.animation).toEqual([
            { duration: 120, tileid: 17 },
            { duration: 120, tileid: 19 },
            { duration: 120, tileid: 21 },
        ]);
    });

    it("knows which tiles are only animation frames", () => {
        expect([...frameOnlyTiles(objects.def)].sort()).toEqual(
            expect.arrayContaining([113, 114, 115])
        );
        expect(frameOnlyTiles(objects.def).has(112)).toBe(false);
    });

    it("lays an imported strip out as new rows and animates it", () => {
        const def = sheet(4, 2);
        const layout = appendLayout(def, 3, 2, 2);
        expect(layout).toMatchObject({ rowsBefore: 2, addedRows: 4, perRow: 2 });
        expect(layout.cells).toEqual([
            { col: 0, row: 2 },
            { col: 2, row: 2 },
            { col: 0, row: 4 },
        ]);
        const grown = withImageHeight(def, (2 + layout.addedRows) * 16);
        const next = animateAppended(grown, layout.cells, 2, 2, 100);
        expect(getTile(next, 8)!.animation!.map((f) => f.tileid)).toEqual([8, 10, 16]);
        expect(getTile(next, 13)!.animation!.map((f) => f.tileid)).toEqual([13, 15, 21]);
    });

    it("applies one duration to every frame", () => {
        expect(uniformDuration([{ duration: 1, tileid: 4 }], 90)).toEqual([{ duration: 90, tileid: 4 }]);
    });
});
