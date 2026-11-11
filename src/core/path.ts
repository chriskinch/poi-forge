/** POSIX path helpers that run in the browser. Paths are project-relative. */

export function normalize(path: string): string {
    const out: string[] = [];
    for (const part of path.split("/")) {
        if (!part || part === ".") continue;
        if (part === "..") {
            if (out.length && out[out.length - 1] !== "..") out.pop();
            else out.push("..");
        } else out.push(part);
    }
    return out.join("/");
}

export function dirname(path: string): string {
    const i = path.lastIndexOf("/");
    return i < 0 ? "" : path.slice(0, i);
}

export function basename(path: string, ext = ""): string {
    const base = path.slice(path.lastIndexOf("/") + 1);
    return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
}

export function join(...parts: string[]): string {
    return normalize(parts.filter(Boolean).join("/"));
}

/** Path of `to` as written from inside directory `fromDir`. */
export function relative(fromDir: string, to: string): string {
    const a = normalize(fromDir).split("/").filter(Boolean);
    const b = normalize(to).split("/").filter(Boolean);
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return [...a.slice(i).map(() => ".."), ...b.slice(i)].join("/");
}
