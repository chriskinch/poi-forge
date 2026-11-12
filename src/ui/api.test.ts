import { describe, expect, it } from "vitest";
import { writable } from "./api";

const folders = ["assets/maps/poi", "public/tilesets/"];

describe("browser write guard", () => {
    it("allows map, tileset and image files in the profile's folders", () => {
        expect(writable("assets/maps/poi/new.tmj", folders)).toBe(true);
        expect(writable("public/tilesets/pack/sheet.tsj", folders)).toBe(true);
        expect(writable("public/tilesets/pack/sheet.PNG", folders)).toBe(true);
    });

    it("refuses other folders, other types and path tricks", () => {
        expect(writable("src/index.ts", folders)).toBe(false);
        expect(writable("assets/maps/poi/x.js", folders)).toBe(false);
        expect(writable("assets/maps/poi-evil/x.tmj", folders)).toBe(false);
        expect(writable("assets/maps/poi/../../../x.tmj", folders)).toBe(false);
        expect(writable("/assets/maps/poi/x.tmj", folders)).toBe(false);
        expect(writable("x.tmj", folders)).toBe(false);
    });
});
