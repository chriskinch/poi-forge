import { describe, expect, it } from "vitest";
import { PathError, resolveForWrite, resolveIn, type Roots } from "./paths";

const roots: Roots = {
    project: "/game",
    lib: "/tool/libraries/x",
    writable: ["assets/maps/poi", "public/tilesets"],
};

describe("file API paths", () => {
    it("resolves inside a root", () => {
        expect(resolveIn(roots, "project", "public/tilesets/a.png")).toBe(
            "/game/public/tilesets/a.png",
        );
        expect(resolveIn(roots, "lib", "cave.prefabs.json")).toBe(
            "/tool/libraries/x/cave.prefabs.json",
        );
    });

    it("refuses to leave the root", () => {
        expect(() => resolveIn(roots, "project", "../etc/passwd")).toThrow(PathError);
        expect(() => resolveIn(roots, "project", "/etc/passwd")).toThrow(PathError);
        expect(() => resolveIn(roots, "project", "a/../../game2/x")).toThrow(PathError);
        expect(() => resolveIn(roots, "nope", "a")).toThrow(PathError);
    });

    it("writes only map, tileset and image files into the profile's folders", () => {
        expect(resolveForWrite(roots, "project", "assets/maps/poi/new.tmj")).toBe(
            "/game/assets/maps/poi/new.tmj",
        );
        expect(resolveForWrite(roots, "project", "public/tilesets/p/s.tsj")).toBe(
            "/game/public/tilesets/p/s.tsj",
        );
        expect(() => resolveForWrite(roots, "project", "src/index.ts")).toThrow(PathError);
        expect(() => resolveForWrite(roots, "project", "assets/maps/poi/x.js")).toThrow(PathError);
        expect(() => resolveForWrite(roots, "project", "package.tmj")).toThrow(PathError);
        expect(() => resolveForWrite(roots, "project", "assets/maps/poi-evil/x.tmj")).toThrow(
            PathError,
        );
    });

    it("writes only JSON into the library", () => {
        expect(resolveForWrite(roots, "lib", "a.prefabs.json")).toBe(
            "/tool/libraries/x/a.prefabs.json",
        );
        expect(() => resolveForWrite(roots, "lib", "a.sh")).toThrow(PathError);
    });
});
