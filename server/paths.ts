/** Path rules for the file API. Kept free of IO so they can be tested. */
import { resolve, sep } from "node:path";

export type RootId = "project" | "lib";

export interface Roots {
    project: string;
    lib: string;
    /** Project-relative folders the API may write into. */
    writable: string[];
}

const WRITE_EXTENSIONS: Record<RootId, string[]> = {
    project: [".tmj", ".tsj", ".png"],
    lib: [".json"],
};

export class PathError extends Error {}

/** Absolute path for a root-relative one, refusing anything that escapes the root. */
export function resolveIn(roots: Roots, root: string, path: string): string {
    if (root !== "project" && root !== "lib") throw new PathError(`Unknown root "${root}"`);
    const base = resolve(roots[root]);
    const full = resolve(base, path);
    if (full !== base && !full.startsWith(base + sep)) {
        throw new PathError(`"${path}" is outside the ${root} root`);
    }
    return full;
}

/** As `resolveIn`, and the path must be one the tool is allowed to write. */
export function resolveForWrite(roots: Roots, root: string, path: string): string {
    const full = resolveIn(roots, root, path);
    const extensions = WRITE_EXTENSIONS[root as RootId];
    if (!extensions.some((ext) => full.toLowerCase().endsWith(ext))) {
        throw new PathError(`Only ${extensions.join(", ")} files can be written to ${root}`);
    }
    if (root === "project") {
        const allowed = roots.writable.some((dir) => {
            const base = resolve(roots.project, dir);
            return full.startsWith(base + sep);
        });
        if (!allowed) {
            throw new PathError(`"${path}" is outside the folders this profile writes to`);
        }
    }
    return full;
}
