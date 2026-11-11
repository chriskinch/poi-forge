import { describe, expect, it } from "vitest";
import { applyCells, readMapTilesets } from "../core/doc";
import { CAVE_POI, cavePoi, fixtureCatalog, sheet } from "../core/testing";
import { phasercraft } from "./phasercraft";

const catalog = fixtureCatalog();
catalog["forest_"] = {
    name: "forest_",
    def: sheet(22, 9, "forest_"),
    imagePath: "public/graphics/tilesets/fantasy/forest_/forest_.png",
    origin: "map",
    readOnly: true,
    variant: "forest",
};

function validate(edit?: (ctx: ReturnType<typeof setup>) => ReturnType<typeof applyCells>) {
    const base = setup();
    const { map, sets } = edit ? edit(base) : base;
    return phasercraft.validate({ map, sets, catalog });
}

function setup() {
    const map = cavePoi().value;
    return { map, sets: readMapTilesets(map, CAVE_POI, catalog).sets };
}

const ctx = { mapPath: CAVE_POI, catalog, embed: phasercraft.embed };

describe("phasercraft profile", () => {
    it("passes the shipped forest cave", () => {
        expect(validate()).toEqual([]);
    });

    it("flags a prop tile with no depth role", () => {
        const issues = validate(({ map, sets }) =>
            applyCells(map, sets, [{ layer: "structure", x: 4, y: 8, cell: { tileset: "caveObjects_", tile: 0 } }], ctx)
        );
        expect(issues).toEqual([
            expect.objectContaining({ level: "error", layer: "structure", x: 4, y: 8, tile: 0 }),
        ]);
    });

    it("flags blank tiles when pixels are known", () => {
        const { map, sets } = setup();
        const issues = phasercraft.validate({ map, sets, catalog, blank: (name, tile) => name === "skulls_" && tile === 0 });
        expect(issues.map((issue) => issue.message)).toEqual([
            "skulls_:0 is a blank tile. Erase the cell instead.",
        ]);
    });

    it("warns about terrain props and unknown layers", () => {
        const issues = validate(({ map, sets }) => {
            const next = applyCells(map, sets, [{ layer: "terrain props", x: 0, y: 9, cell: { tileset: "skulls_", tile: 1 } }], ctx);
            return { ...next, map: { ...next.map, layers: [...next.map.layers, { ...next.map.layers[0]!, id: 99, name: "extra" }] } };
        });
        expect(issues.map((issue) => issue.level).sort()).toEqual(["error", "warning"]);
    });

    it("treats collides and solid corners as blocking on collision layers only", () => {
        expect(phasercraft.isSolid({ collides: true }, "structure")).toBe(true);
        expect(phasercraft.isSolid({ collides: true }, "structure props")).toBe(false);
        expect(phasercraft.isSolid({ solidCorners: 8, ground: true }, "structure")).toBe(true);
        expect(phasercraft.isSolid({ ground: true }, "structure")).toBe(false);
    });

    it("embeds biome sheets and references shared ones", () => {
        expect(phasercraft.embed(catalog["forestPath_"]!)).toBe(true);
        expect(phasercraft.embed(catalog["skulls_"]!)).toBe(false);
    });

    it("lays a rounded soil pad two tiles wider than the POI", () => {
        expect(phasercraft.contexts(catalog)).toEqual(["forest"]);
        const context = phasercraft.context!(cavePoi().value, "forest", catalog)!;
        const size = 10 + context.margin * 2;
        const at = (x: number, y: number) => context.layers.paths![(y + context.margin) * size + x + context.margin];
        expect(context.layers.terrain!.every((cell) => cell?.tile === 46)).toBe(true);
        // Solid soil under the POI and across the 2-tile margin's straight edges.
        expect([28, 14, 22, 29, 30]).toContain(at(0, 0)!.tile);
        expect([28, 14, 22, 29, 30]).toContain(at(5, -2)!.tile);
        // The row above is the path autotile's "path to the south" edge piece.
        expect(at(5, -3)?.tile).toBe(26);
        expect(at(-3, 4)?.tile).toBe(19);
        expect(at(5, -4)).toBeNull();
        // Corners are rounded off, and grass shows beyond the pad.
        expect(at(-2, -2)?.tile).toBe(12);
        expect(at(-4, 4)).toBeNull();
        expect(phasercraft.context!(cavePoi().value, "desert", catalog)).toBeNull();
    });
});
