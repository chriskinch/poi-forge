/**
 * Dev-server file API: lets the app read a game project and write maps,
 * tilesets and images back into it. It never deletes, and only writes into
 * the folders the profile names.
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import type { Plugin } from "vite";
import { profileById } from "../src/profiles";
import { PathError, resolveForWrite, resolveIn, type Roots } from "./paths";

const TOOL_ROOT = resolve(import.meta.dirname, "..");

interface Config {
    project: string;
    profile: string;
}

/** `POI_PROJECT`/`POI_PROFILE`, then poi.config.json, then the bundled demo. */
export function loadConfig(): Config {
    const file = resolve(TOOL_ROOT, "poi.config.json");
    const fromFile: Partial<Config> = existsSync(file)
        ? (JSON.parse(readFileSync(file, "utf8")) as Partial<Config>)
        : {};
    const project = process.env.POI_PROJECT ?? fromFile.project ?? "demo";
    const profile = process.env.POI_PROFILE ?? fromFile.profile ?? "generic";
    return { project: resolve(TOOL_ROOT, project), profile };
}

const TYPES: Record<string, string> = {
    ".png": "image/png",
    ".json": "application/json",
    ".tmj": "application/json",
    ".tsj": "application/json",
};

const SKIP = new Set(["node_modules", ".git", "dist"]);

async function walk(base: string, dir: string, extensions: string[], out: string[]) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        if (out.length >= 20000) return;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!SKIP.has(entry.name)) await walk(base, full, extensions, out);
        } else if (extensions.some((ext) => entry.name.toLowerCase().endsWith(ext))) {
            out.push(relative(base, full).split("\\").join("/"));
        }
    }
}

function body(req: IncomingMessage): Promise<Buffer> {
    return new Promise((done, fail) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => done(Buffer.concat(chunks)));
        req.on("error", fail);
    });
}

function send(res: ServerResponse, status: number, value: unknown) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(value));
}

export function fileApi(): Plugin {
    return {
        name: "poi-forge-file-api",
        configureServer(server) {
            const config = loadConfig();
            const profile = profileById(config.profile);
            const roots: Roots = {
                project: config.project,
                lib: resolve(TOOL_ROOT, "libraries", profile.id),
                writable: [profile.roots.maps, profile.roots.tilesets],
            };
            server.config.logger.info(
                `  POI Forge: project ${config.project} (${profile.label} profile)`,
            );

            server.middlewares.use("/api", async (req, res) => {
                const url = new URL(req.url ?? "/", "http://localhost");
                const root = url.searchParams.get("root") ?? "project";
                const path = url.searchParams.get("path") ?? "";
                try {
                    if (url.pathname === "/config") {
                        return send(res, 200, {
                            project: config.project,
                            name: basename(config.project),
                            profile: profile.id,
                            exists: existsSync(config.project),
                        });
                    }
                    if (url.pathname === "/list") {
                        const extensions = (url.searchParams.get("ext") ?? "").split(",");
                        const dir = resolveIn(roots, root, path);
                        const files: string[] = [];
                        await walk(resolveIn(roots, root, ""), dir, extensions, files);
                        return send(res, 200, { files: files.sort() });
                    }
                    if (url.pathname === "/file" && req.method === "GET") {
                        const full = resolveIn(roots, root, path);
                        const data = await readFile(full);
                        res.statusCode = 200;
                        res.setHeader(
                            "Content-Type",
                            TYPES[extname(full).toLowerCase()] ?? "application/octet-stream",
                        );
                        res.setHeader("Cache-Control", "no-store");
                        return res.end(data);
                    }
                    if (url.pathname === "/file" && req.method === "PUT") {
                        const full = resolveForWrite(roots, root, path);
                        await mkdir(dirname(full), { recursive: true });
                        await writeFile(full, await body(req));
                        return send(res, 200, { ok: true });
                    }
                    send(res, 404, { error: "Not found" });
                } catch (error) {
                    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
                    send(res, error instanceof PathError ? 403 : missing ? 404 : 500, {
                        error: (error as Error).message,
                    });
                }
            });
        },
    };
}
