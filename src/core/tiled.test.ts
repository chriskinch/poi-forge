import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CAVE_DIR, CAVE_POI, FIXTURES, readFixture } from "./testing";
import {
    detectFormat,
    gidFlags,
    gidId,
    newMap,
    parse,
    stringify,
    withMapProperty,
    FLIP_H,
} from "./tiled";

describe("Tiled JSON", () => {
    const files = [
        CAVE_POI,
        ...readdirSync(resolve(FIXTURES, CAVE_DIR)).map((file) => `${CAVE_DIR}/${file}`),
    ];

    it.each(files)("round-trips %s byte for byte", (file) => {
        const text = readFixture(file);
        const { value, format } = parse(text);
        expect(stringify(value, format)).toBe(text);
    });

    it("detects indent and trailing newline", () => {
        expect(detectFormat('{\n "a": 1\n}\n')).toEqual({ indent: 1, newline: true });
        expect(detectFormat('{\n    "a": 1\n}')).toEqual({ indent: 4, newline: false });
        expect(detectFormat('{"a":1}\n')).toEqual({ indent: 0, newline: true });
    });

    it("splits flip flags from the tile id", () => {
        const gid = (FLIP_H | 42) >>> 0;
        expect(gidId(gid)).toBe(42);
        expect(gidFlags(gid)).toBe(FLIP_H);
    });

    it("writes new maps with alphabetical keys, like Tiled", () => {
        const map = withMapProperty(newMap(4, 3, 16, ["a"]), "poiForge.recipe", "string", "x");
        const keys = Object.keys(map);
        expect(keys).toEqual(keys.slice().sort());
        expect(map.layers[0]!.data).toHaveLength(12);
    });
});
