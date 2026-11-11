import { describe, expect, it } from "vitest";
import { generatedWith, resultToMap } from "./build";
import { readMapTilesets, mapCells, type Catalog } from "./doc";
import { clampSize, generate, generateValid, themesOf, walkable, type GenContext, type GenParams } from "./generator";
import { RECIPES, recipeById } from "./recipes";
import { sheet, testLibrary, testSolid } from "./testing";

const ctx: GenContext = {
    prefabs: testLibrary(),
    layers: ["terrain", "paths", "structure", "structure props"],
    solid: testSolid,
};
const params: GenParams = { width: 10, height: 10, seed: 7, themes: [], symmetry: true, density: 1 };
const entrance = recipeById("entrance")!;

describe("generator", () => {
    it("is deterministic for a seed and differs between seeds", () => {
        const a = generate(entrance, params, ctx);
        const b = generate(entrance, params, ctx);
        const c = generate(entrance, { ...params, seed: 8 }, ctx);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        expect(JSON.stringify(a.layers)).not.toBe(JSON.stringify(c.layers));
    });

    it("builds an entrance: ridge, arch in the ridge, zone at the doorstep, soil everywhere", () => {
        const result = generate(entrance, params, ctx);
        expect(result.problems).toEqual([]);
        const structure = result.layers.structure!;
        // Ridge caps in the top corners.
        expect(structure[0]).toEqual({ tileset: "t", tile: 10 });
        expect(structure[9]).toEqual({ tileset: "t", tile: 12 });
        const focal = result.placements.find((p) => p.step === "focal")!;
        expect(focal).toMatchObject({ prefab: "arch", y: 1 });
        expect(result.objects).toEqual([
            { name: "dungeon-entrance", x: focal.x, y: 3, w: 3, h: 1 },
        ]);
        expect(result.layers.paths!.every((cell) => cell && [1, 2].includes(cell.tile))).toBe(true);
    });

    it.each(RECIPES.map((recipe) => [recipe.id, recipe] as const))(
        "%s keeps every zone reachable across 40 seeds",
        (_id, recipe) => {
            for (let seed = 1; seed <= 40; seed++) {
                const size = clampSize(recipe, recipe.size.w[2], recipe.size.h[2]);
                const result = generateValid(recipe, { ...params, ...size, seed, symmetry: seed % 2 === 0 }, ctx);
                expect(result.problems, `${recipe.id} seed ${seed}`).toEqual([]);
                expect(result.notes, `${recipe.id} seed ${seed}`).toEqual([]);
                const reach = walkable(result.layers, result.width, result.height, ctx.solid);
                for (const zone of result.objects) {
                    expect(reach[zone.y * result.width + zone.x], `${recipe.id} seed ${seed}`).toBe(1);
                }
            }
        }
    );

    it("never stands a solid prop in the lane", () => {
        for (let seed = 1; seed <= 30; seed++) {
            const result = generate(entrance, { ...params, seed, density: 2 }, ctx);
            const [zone] = result.objects;
            for (let y = zone!.y; y < result.height; y++) {
                for (let x = zone!.x; x < zone!.x + zone!.w; x++) {
                    const cell = result.layers.structure![y * result.width + x];
                    expect(!cell || !testSolid(cell, "structure"), `seed ${seed} at ${x},${y}`).toBe(true);
                }
            }
        }
    });

    it("mirrors scatter when symmetry is on", () => {
        const result = generate(entrance, { ...params, width: 11, seed: 3 }, ctx);
        const pairs = result.placements.filter((p) => p.step === "flank");
        expect(pairs.length).toBeGreaterThan(0);
        expect(pairs.length % 2).toBe(0);
    });

    it("scales scatter with density", () => {
        const count = (density: number) =>
            Array.from({ length: 20 }, (_, seed) =>
                generate(entrance, { ...params, seed, density }, ctx).placements.filter((p) => p.step === "scatter").length
            ).reduce((a, b) => a + b, 0);
        expect(count(0)).toBe(0);
        expect(count(2)).toBeGreaterThan(count(0.5));
    });

    it("keeps locked cells and places nothing on them", () => {
        const lock = { x: 0, y: 9, cells: { paths: null, structure: { tileset: "t", tile: 99 } } };
        for (let seed = 1; seed <= 10; seed++) {
            const result = generate(entrance, { ...params, seed, density: 2 }, { ...ctx, locks: [lock] });
            expect(result.layers.structure![90]).toEqual({ tileset: "t", tile: 99 });
            expect(result.layers.paths![90]).toBeNull();
        }
    });

    it("filters prefabs by theme", () => {
        const themed = ctx.prefabs.map((p) => (p.id === "arch" ? { ...p, themes: ["cave"] } : p));
        const result = generate(entrance, { ...params, themes: ["desert"] }, { ...ctx, prefabs: themed });
        expect(result.placements.some((p) => p.step === "focal")).toBe(false);
        expect(result.notes).toContain("focal: no prefab tagged entrance");
        expect(themesOf(themed)).toEqual(["cave"]);
    });

    it("reports when nothing matches at all", () => {
        expect(generate(entrance, params, { ...ctx, prefabs: [] }).problems).toContain("No prefab matched any step");
    });

    it("clamps size to the recipe", () => {
        expect(clampSize(entrance, 3, 99)).toEqual({ width: 8, height: 16 });
    });
});

describe("result to map", () => {
    const catalog: Catalog = {
        t: { name: "t", def: sheet(10, 10, "t"), path: "tilesets/t.tsj", imagePath: "tilesets/t.png", origin: "tsj", readOnly: false },
    };

    it("writes a Tiled map that reads back as the same cells", () => {
        const result = generate(entrance, params, ctx);
        const { map, sets } = resultToMap(result, {
            mapPath: "maps/new.tmj",
            catalog,
            embed: () => false,
            tileSize: 16,
            tileLayers: ctx.layers,
            objectLayer: "POI",
        });
        expect(map.tilesets).toEqual([{ firstgid: 1, source: "../tilesets/t.tsj" }]);
        expect(map.layers.map((layer) => layer.name)).toEqual([...ctx.layers, "POI"]);
        expect(readMapTilesets(map, "maps/new.tmj", catalog).sets).toEqual(sets);
        expect(mapCells(map, sets).structure).toEqual(result.layers.structure);
        expect(map.layers.at(-1)!.objects![0]).toMatchObject({ name: "dungeon-entrance", y: 48, width: 48, height: 16 });
        expect(generatedWith(map)).toEqual({ recipe: "entrance", params });
        expect(Object.keys(map)).toEqual(Object.keys(map).slice().sort());
    });
});
