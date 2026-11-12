/**
 * Build-only: ships the demo project and the prefab libraries with the static
 * build, plus a manifest listing them, so the app works where there is no
 * file server (e.g. on Vercel).
 */
import { cpSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Plugin } from "vite";

function filesIn(dir: string, base = dir): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
        .flatMap((entry) =>
            entry.isDirectory()
                ? filesIn(join(dir, entry.name), base)
                : [relative(base, join(dir, entry.name)).split("\\").join("/")],
        )
        .sort();
}

export function staticBundle(): Plugin {
    let root = process.cwd();
    let outDir = "dist";
    return {
        name: "poi-forge-static-bundle",
        apply: "build",
        configResolved(config) {
            root = config.root;
            outDir = resolve(config.root, config.build.outDir);
        },
        closeBundle() {
            const demo = resolve(root, "demo");
            const libraries = resolve(root, "libraries");
            cpSync(demo, join(outDir, "bundle/demo"), { recursive: true });
            cpSync(libraries, join(outDir, "bundle/libraries"), { recursive: true });
            const manifest = {
                demo: { profile: "generic", files: filesIn(demo) },
                libraries: Object.fromEntries(
                    readdirSync(libraries, { withFileTypes: true })
                        .filter((entry) => entry.isDirectory())
                        .map((entry) => [entry.name, filesIn(join(libraries, entry.name))]),
                ),
            };
            writeFileSync(join(outDir, "bundle.json"), JSON.stringify(manifest));
        },
    };
}
