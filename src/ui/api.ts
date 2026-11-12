/**
 * File access for the app, behind one interface with three backends:
 *
 * - `server`: the dev server's file API. Reads and writes the project on disk.
 * - `demo`: the bundled demo project of a static build. Saves stay in memory.
 * - `folder`: a folder the user picked, through the browser's File System
 *   Access API. Reads and writes real files; prefab libraries are kept in
 *   this browser, on top of the ones bundled with the build.
 */
export type Root = "project" | "lib";
export type BackendKind = "server" | "demo" | "folder";

export interface ServerConfig {
    project: string;
    name: string;
    profile: string;
    exists: boolean;
}

interface Backend {
    kind: BackendKind;
    config: () => Promise<ServerConfig>;
    list: (root: Root, dir: string, extensions: string[]) => Promise<string[]>;
    blob: (root: Root, path: string) => Promise<Blob>;
    write: (root: Root, path: string, body: string | Blob) => Promise<void>;
    /** A URL an <img> can load, when the backend has one without reading the file. */
    directUrl?: (root: Root, path: string) => string;
}

/** What a static build ships: the demo project and every profile's prefab libraries. */
export interface Bundle {
    demo: { profile: string; files: string[] };
    libraries: Record<string, string[]>;
}

const WRITE_EXTENSIONS = [".tmj", ".tsj", ".png"];
const SKIP = new Set(["node_modules", ".git", "dist"]);

/** Whether a project-relative path is one the tool may write: right type, right folder. */
export function writable(path: string, folders: readonly string[]): boolean {
    const parts = path.split("/");
    if (parts.some((part) => !part || part === "." || part === "..")) return false;
    if (!WRITE_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext))) return false;
    return folders.some((folder) => path.startsWith(`${folder.replace(/\/+$/, "")}/`));
}

const matches = (path: string, dir: string, extensions: string[]) =>
    (!dir || path.startsWith(`${dir.replace(/\/+$/, "")}/`)) &&
    extensions.some((ext) => path.toLowerCase().endsWith(ext));

async function check(response: Response): Promise<Response> {
    if (response.ok) return response;
    let message = `${response.status} ${response.statusText}`;
    try {
        message = ((await response.json()) as { error?: string }).error ?? message;
    } catch {
        // Not JSON: keep the status line.
    }
    throw new Error(message);
}

// ── dev server ───────────────────────────────────────────────────────────────

function serverBackend(found: ServerConfig): Backend {
    const url = (endpoint: string, root: Root, path: string, extra = "") =>
        `/api/${endpoint}?root=${root}&path=${encodeURIComponent(path)}${extra}`;
    return {
        kind: "server",
        config: async () => found,
        async list(root, dir, extensions) {
            const response = await check(
                await fetch(url("list", root, dir, `&ext=${extensions.join(",")}`)),
            );
            return ((await response.json()) as { files: string[] }).files;
        },
        blob: async (root, path) => (await check(await fetch(url("file", root, path)))).blob(),
        async write(root, path, body) {
            await check(await fetch(url("file", root, path), { method: "PUT", body }));
        },
        directUrl: (root, path) => url("file", root, path, `&v=${Date.now()}`),
    };
}

// ── static build ─────────────────────────────────────────────────────────────

const BASE = import.meta.env?.BASE_URL ?? "/";
const encode = (path: string) => path.split("/").map(encodeURIComponent).join("/");
const fetchBundled = async (path: string) =>
    (await check(await fetch(`${BASE}bundle/${encode(path)}`))).blob();
const toBlob = (body: string | Blob) => (typeof body === "string" ? new Blob([body]) : body);

function demoBackend(bundle: Bundle): Backend {
    const profile = bundle.demo.profile;
    const saved = new Map<string, Blob>();
    const files = (root: Root) =>
        root === "project" ? bundle.demo.files : (bundle.libraries[profile] ?? []);
    return {
        kind: "demo",
        config: async () => ({ project: "demo", name: "demo", profile, exists: true }),
        async list(root, dir, extensions) {
            const mine = [...saved.keys()]
                .filter((key) => key.startsWith(`${root}:`))
                .map((key) => key.slice(root.length + 1));
            return [...new Set([...files(root), ...mine])]
                .filter((path) => matches(path, dir, extensions))
                .sort();
        },
        async blob(root, path) {
            return (
                saved.get(`${root}:${path}`) ??
                fetchBundled(root === "project" ? `demo/${path}` : `libraries/${profile}/${path}`)
            );
        },
        async write(root, path, body) {
            saved.set(`${root}:${path}`, toBlob(body));
        },
    };
}

// ── picked folder ────────────────────────────────────────────────────────────

/** The parts of the File System Access API this uses; not in TypeScript's DOM types. */
interface DirHandle {
    kind: "directory";
    name: string;
    values: () => AsyncIterable<DirHandle | FileHandle>;
    getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<DirHandle>;
    getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FileHandle>;
}
interface FileHandle {
    kind: "file";
    name: string;
    getFile: () => Promise<File>;
    createWritable: () => Promise<{
        write: (data: Blob) => Promise<void>;
        close: () => Promise<void>;
    }>;
}
type Picker = (options: { mode: "readwrite" }) => Promise<DirHandle>;

export const canOpenFolder = (): boolean =>
    typeof window !== "undefined" && "showDirectoryPicker" in window;

async function directory(root: DirHandle, path: string, create = false): Promise<DirHandle> {
    let dir = root;
    for (const part of path.split("/").filter(Boolean)) {
        dir = await dir.getDirectoryHandle(part, { create });
    }
    return dir;
}

async function walk(dir: DirHandle, prefix: string, extensions: string[], out: string[]) {
    for await (const entry of dir.values()) {
        if (out.length >= 20000) return;
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.kind === "directory") {
            if (!SKIP.has(entry.name)) await walk(entry, path, extensions, out);
        } else if (extensions.some((ext) => entry.name.toLowerCase().endsWith(ext))) {
            out.push(path);
        }
    }
}

const libraryKey = (profile: string, path: string) => `poiForge:lib:${profile}:${path}`;

function folderBackend(
    handle: DirHandle,
    profile: string,
    folders: readonly string[],
    bundle: Bundle | null,
): Backend {
    const bundled = bundle?.libraries[profile] ?? [];
    const stored = () => {
        const prefix = libraryKey(profile, "");
        return Object.keys(localStorage)
            .filter((key) => key.startsWith(prefix))
            .map((key) => key.slice(prefix.length));
    };
    return {
        kind: "folder",
        config: async () => ({ project: handle.name, name: handle.name, profile, exists: true }),
        async list(root, dir, extensions) {
            if (root === "lib") {
                return [...new Set([...bundled, ...stored()])]
                    .filter((path) => matches(path, dir, extensions))
                    .sort();
            }
            const out: string[] = [];
            try {
                await walk(await directory(handle, dir), dir.replace(/\/+$/, ""), extensions, out);
            } catch {
                // The folder doesn't exist in this project: nothing to list.
            }
            return out.sort();
        },
        async blob(root, path) {
            if (root === "lib") {
                const mine = localStorage.getItem(libraryKey(profile, path));
                return mine !== null
                    ? new Blob([mine])
                    : fetchBundled(`libraries/${profile}/${path}`);
            }
            const parts = path.split("/");
            const name = parts.pop()!;
            const dir = await directory(handle, parts.join("/"));
            return (await dir.getFileHandle(name)).getFile();
        },
        async write(root, path, body) {
            if (root === "lib") {
                localStorage.setItem(libraryKey(profile, path), await toBlob(body).text());
                return;
            }
            if (!writable(path, folders)) {
                throw new Error(`"${path}" is outside the folders this profile writes to`);
            }
            const parts = path.split("/");
            const name = parts.pop()!;
            const dir = await directory(handle, parts.join("/"), true);
            const stream = await (await dir.getFileHandle(name, { create: true })).createWritable();
            await stream.write(toBlob(body));
            await stream.close();
        },
    };
}

// ── the active backend ───────────────────────────────────────────────────────

let backend: Backend | null = null;
let bundle: Bundle | null = null;

const active = (): Backend => {
    if (!backend) throw new Error("No project is connected");
    return backend;
};

/** Connects to the dev server when there is one, else to the bundled demo. */
export async function connect(): Promise<BackendKind> {
    if (backend) return backend.kind;
    try {
        const response = await fetch("/api/config");
        if (response.ok && response.headers.get("content-type")?.includes("json")) {
            backend = serverBackend((await response.json()) as ServerConfig);
            return backend.kind;
        }
    } catch {
        // No dev server: fall through to the static bundle.
    }
    const response = await fetch(`${BASE}bundle.json`);
    if (!response.ok || !response.headers.get("content-type")?.includes("json")) {
        throw new Error("No file server and no bundled demo. Start the tool with `npm start`.");
    }
    bundle = (await response.json()) as Bundle;
    backend = demoBackend(bundle);
    return backend.kind;
}

/** Asks for a folder and makes it the project. Rejects if the user cancels. */
export async function openFolder(profile: string, folders: readonly string[]): Promise<void> {
    const pick = (window as unknown as { showDirectoryPicker: Picker }).showDirectoryPicker;
    const handle = await pick({ mode: "readwrite" });
    backend = folderBackend(handle, profile, folders, bundle);
}

export const config = () => active().config();
export const list = (root: Root, dir: string, extensions: string[]) =>
    active().list(root, dir, extensions);
export const blob = (root: Root, path: string) => active().blob(root, path);
export const text = async (root: Root, path: string) => (await active().blob(root, path)).text();
export const write = (root: Root, path: string, body: string | Blob) =>
    active().write(root, path, body);

/** A URL for an <img>. Fresh each call, so a rewritten image is never stale. */
export async function imageUrl(root: Root, path: string): Promise<string> {
    const current = active();
    return current.directUrl?.(root, path) ?? URL.createObjectURL(await current.blob(root, path));
}
