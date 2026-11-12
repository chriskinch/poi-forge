/** Client for the dev-server file API. */
export type Root = "project" | "lib";

export interface ServerConfig {
    project: string;
    name: string;
    profile: string;
    exists: boolean;
}

const url = (endpoint: string, root: Root, path: string, extra = "") =>
    `/api/${endpoint}?root=${root}&path=${encodeURIComponent(path)}${extra}`;

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

export const fileUrl = (root: Root, path: string, bust = 0) =>
    url("file", root, path, bust ? `&v=${bust}` : "");

export async function config(): Promise<ServerConfig> {
    return (await check(await fetch("/api/config"))).json() as Promise<ServerConfig>;
}

export async function list(root: Root, dir: string, extensions: string[]): Promise<string[]> {
    const response = await check(
        await fetch(url("list", root, dir, `&ext=${extensions.join(",")}`)),
    );
    return ((await response.json()) as { files: string[] }).files;
}

export async function text(root: Root, path: string): Promise<string> {
    return (await check(await fetch(fileUrl(root, path)))).text();
}

export async function blob(root: Root, path: string): Promise<Blob> {
    return (await check(await fetch(fileUrl(root, path)))).blob();
}

export async function write(root: Root, path: string, body: string | Blob): Promise<void> {
    await check(await fetch(fileUrl(root, path), { method: "PUT", body }));
}
