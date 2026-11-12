import { useMemo, useState } from "react";
import { animateAppended, animateBlock, appendLayout, uniformDuration } from "../../core/animation";
import { join, dirname } from "../../core/path";
import type { TiledFrame, TiledTileset } from "../../core/tiled";
import { setAnimation, tileAnimation, tilesetForImage, withImageHeight } from "../../core/tileset";
import * as api from "../api";
import { sheetTiles } from "../helpers";
import { Modal, NumberField } from "../Modal";
import { useStore } from "../store";
import { Thumb } from "../Thumb";

/** Builds tile animations: a frame timeline, auto-fill from a strip, strip import. */
export function Animation() {
    const state = useStore();
    const { activeTileset, catalog, sheetSel, framePick } = state;
    const [duration, setDuration] = useState(150);
    const [count, setCount] = useState(4);
    const [stride, setStride] = useState<{ x: number; y: number } | null>(null);
    const [importing, setImporting] = useState(false);
    const entry = activeTileset ? catalog[activeTileset] : undefined;
    const sel = entry && sheetSel?.tileset === entry.name ? sheetSel : null;

    const previewLayers = useMemo(() => {
        if (!entry || !sel) return [];
        return [
            {
                name: "preview",
                grid: sheetTiles(entry.def, sel).map((tile) => ({ tileset: entry.name, tile })),
            },
        ];
    }, [entry, sel]);

    if (!entry) return null;
    const { def } = entry;
    const base = sel ? sel.y * def.columns + sel.x : undefined;
    const frames = base !== undefined ? (tileAnimation(def, base) ?? []) : [];
    const block = !!sel && sel.w * sel.h > 1;
    const strideX = stride?.x ?? sel?.w ?? 1;
    const strideY = stride?.y ?? 0;
    const apply = (next: TiledTileset) => state.setDef(entry.name, next);
    const setFrames = (next: TiledFrame[]) =>
        base !== undefined && apply(setAnimation(def, base, next));

    return (
        <div className="animation" data-testid="animation">
            {entry.readOnly && (
                <p className="notice">
                    This sheet's animations come from its host map and can't be edited here.
                </p>
            )}
            {!sel ? (
                <p className="hint">
                    Select the tile (or block of tiles) to animate: the first frame.
                </p>
            ) : (
                <fieldset disabled={entry.readOnly} className="plain">
                    <div className="anim-preview">
                        <Thumb
                            layers={previewLayers}
                            width={sel.w}
                            height={sel.h}
                            scale={sel.w > 3 || sel.h > 3 ? 3 : 5}
                            animate
                            background="#23262b"
                        />
                        <p className="hint">
                            {block ? `Block ${sel.w}×${sel.h} from tile ${base}` : `Tile ${base}`}
                            <br />
                            {frames.length
                                ? `${frames.length} frames, ${frames.reduce((s, f) => s + f.duration, 0)} ms loop`
                                : "Not animated"}
                        </p>
                    </div>

                    <h3>Auto-fill from a strip</h3>
                    <p className="hint">
                        Frames sit at a fixed step from the first.{" "}
                        {block ? "Every tile of the block is animated in sync." : ""}
                    </p>
                    <div className="grid-4">
                        <NumberField
                            label="Frames"
                            min={2}
                            max={64}
                            value={count}
                            onChange={setCount}
                        />
                        <NumberField
                            label="Step →"
                            min={-64}
                            max={64}
                            value={strideX}
                            onChange={(x) => setStride({ x, y: strideY })}
                            title="Tiles across from one frame to the next"
                        />
                        <NumberField
                            label="Step ↓"
                            min={-64}
                            max={64}
                            value={strideY}
                            onChange={(y) => setStride({ x: strideX, y })}
                            title="Tiles down from one frame to the next"
                        />
                        <NumberField
                            label="ms"
                            min={10}
                            max={10000}
                            step={10}
                            value={duration}
                            onChange={setDuration}
                        />
                    </div>
                    <div className="row">
                        <button
                            className="primary"
                            data-testid="anim-fill"
                            onClick={() =>
                                apply(
                                    animateBlock(def, {
                                        col: sel.x,
                                        row: sel.y,
                                        w: sel.w,
                                        h: sel.h,
                                        count,
                                        strideX,
                                        strideY,
                                        duration,
                                    }),
                                )
                            }
                        >
                            Fill {block ? "block" : "frames"}
                        </button>
                        <button
                            onClick={() => {
                                let next = def;
                                for (const tile of sheetTiles(def, sel))
                                    next = setAnimation(next, tile, undefined);
                                apply(next);
                            }}
                        >
                            Remove animation
                        </button>
                    </div>

                    <h3>Timeline{block ? " (top-left tile)" : ""}</h3>
                    <ol className="timeline">
                        {frames.map((frame, i) => (
                            <li key={i}>
                                <Thumb
                                    layers={[
                                        {
                                            name: "f",
                                            grid: [{ tileset: entry.name, tile: frame.tileid }],
                                        },
                                    ]}
                                    width={1}
                                    height={1}
                                    scale={2}
                                    background="#23262b"
                                />
                                <code>{frame.tileid}</code>
                                <input
                                    type="number"
                                    min={10}
                                    step={10}
                                    value={frame.duration}
                                    onChange={(e) =>
                                        setFrames(
                                            frames.map((f, j) =>
                                                j === i
                                                    ? {
                                                          ...f,
                                                          duration: Math.max(
                                                              1,
                                                              Number(e.target.value) || 1,
                                                          ),
                                                      }
                                                    : f,
                                            ),
                                        )
                                    }
                                    aria-label="Duration in ms"
                                />
                                <span className="unit">ms</span>
                                <button
                                    className="ghost"
                                    disabled={i === 0}
                                    onClick={() =>
                                        setFrames(
                                            frames.map((f, j) =>
                                                j === i - 1
                                                    ? frames[i]!
                                                    : j === i
                                                      ? frames[i - 1]!
                                                      : f,
                                            ),
                                        )
                                    }
                                    aria-label="Move earlier"
                                >
                                    ↑
                                </button>
                                <button
                                    className="ghost"
                                    disabled={i === frames.length - 1}
                                    onClick={() =>
                                        setFrames(
                                            frames.map((f, j) =>
                                                j === i + 1
                                                    ? frames[i]!
                                                    : j === i
                                                      ? frames[i + 1]!
                                                      : f,
                                            ),
                                        )
                                    }
                                    aria-label="Move later"
                                >
                                    ↓
                                </button>
                                <button
                                    className="ghost"
                                    onClick={() => setFrames(frames.filter((_, j) => j !== i))}
                                    aria-label="Remove frame"
                                >
                                    ✕
                                </button>
                            </li>
                        ))}
                        {!frames.length && <li className="hint">No frames yet.</li>}
                    </ol>
                    <div className="row">
                        <button
                            className={framePick ? "active" : ""}
                            onClick={() => state.set({ framePick: !framePick })}
                            data-testid="frame-pick"
                        >
                            {framePick ? "Done adding" : "Add frames by clicking the sheet"}
                        </button>
                        <button
                            disabled={!frames.length}
                            onClick={() => setFrames(uniformDuration(frames, duration))}
                        >
                            Set all to {duration} ms
                        </button>
                    </div>
                </fieldset>
            )}
            <h3>Import a strip</h3>
            <p className="hint">
                Slice a separate animation image into frames and add them to a sheet.
            </p>
            <button onClick={() => setImporting(true)}>Import strip PNG…</button>
            {importing && (
                <StripImport onClose={() => setImporting(false)} defaultDuration={duration} />
            )}
        </div>
    );
}

/** The frame the frame-pick click adds, starting the animation with the tile itself. */
export function addFrame(
    def: TiledTileset,
    base: number,
    tile: number,
    duration: number,
): TiledTileset {
    const frames = tileAnimation(def, base) ?? [];
    const start = frames.length || tile === base ? frames : [{ duration, tileid: base }];
    return setAnimation(def, base, [...start, { duration, tileid: tile }]);
}

function StripImport({
    onClose,
    defaultDuration,
}: {
    onClose: () => void;
    defaultDuration: number;
}) {
    const state = useStore();
    const { profile, activeTileset, catalog } = state;
    const tile = profile.tileSize;
    const current = activeTileset ? catalog[activeTileset] : undefined;
    const canAppend = !!current && !current.readOnly;
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [fileName, setFileName] = useState("");
    const [fw, setFw] = useState(1);
    const [fh, setFh] = useState(1);
    const [duration, setDuration] = useState(defaultDuration);
    const [target, setTarget] = useState<"append" | "new">(canAppend ? "append" : "new");
    const [name, setName] = useState("");
    const [folder, setFolder] = useState(
        current ? dirname(current.imagePath).slice(profile.roots.tilesets.length + 1) : "",
    );
    const [busy, setBusy] = useState(false);

    const cols = image ? Math.floor(image.naturalWidth / (fw * tile)) : 0;
    const rows = image ? Math.floor(image.naturalHeight / (fh * tile)) : 0;
    const frames = cols * rows;

    const choose = (file: File | undefined) => {
        if (!file) return;
        const img = new Image();
        img.onload = () => setImage(img);
        img.src = URL.createObjectURL(file);
        setFileName(file.name);
        if (!name) setName(file.name.replace(/\.png$/i, ""));
    };

    const run = async () => {
        if (!image || frames < 1) return;
        setBusy(true);
        try {
            const appending = target === "append" && current;
            const sheetName = name.trim() || "strip";
            const perRow = Math.min(frames, 8);
            const def = appending
                ? current.def
                : {
                      ...tilesetForImage(
                          sheetName,
                          `${sheetName}.png`,
                          perRow * fw * tile,
                          0,
                          tile,
                      ),
                      columns: perRow * fw,
                  };
            const layout = appendLayout(def, frames, fw, fh);
            const canvas = document.createElement("canvas");
            canvas.width = def.columns * tile;
            canvas.height = (layout.rowsBefore + layout.addedRows) * tile;
            const ctx = canvas.getContext("2d")!;
            const existing = appending ? state.images[current.name] : undefined;
            if (appending && typeof existing !== "object")
                throw new Error("The sheet image hasn't loaded yet");
            if (typeof existing === "object") ctx.drawImage(existing.image, 0, 0);
            layout.cells.forEach((cell, i) => {
                ctx.drawImage(
                    image,
                    (i % cols) * fw * tile,
                    Math.floor(i / cols) * fh * tile,
                    fw * tile,
                    fh * tile,
                    cell.col * tile,
                    cell.row * tile,
                    fw * tile,
                    fh * tile,
                );
            });
            const png = await new Promise<Blob>((done, fail) =>
                canvas.toBlob(
                    (blob) => (blob ? done(blob) : fail(new Error("Could not encode PNG"))),
                    "image/png",
                ),
            );
            const imagePath = appending
                ? current.imagePath
                : join(profile.roots.tilesets, folder.trim(), `${sheetName}.png`);
            await api.write("project", imagePath, png);
            let tileset = appending ? current.name : null;
            if (!appending) tileset = await state.addSheet(imagePath);
            if (!tileset) throw new Error("Could not add the new sheet");
            const grown = withImageHeight(useStore.getState().catalog[tileset]!.def, canvas.height);
            state.setDef(
                tileset,
                animateAppended(grown, layout.cells, fw, fh, duration),
                !appending,
            );
            state.reloadImage(tileset);
            const first = layout.cells[0]!;
            state.set({
                sheetSel: { tileset, x: first.col, y: first.row, w: fw, h: fh },
                tilesetTab: "anim",
            });
            state.notify(`Added ${frames} frames to ${tileset}. Save to write its .tsj.`);
            onClose();
        } catch (error) {
            state.notify((error as Error).message, "error");
        }
        setBusy(false);
    };

    return (
        <Modal title="Import a strip" onClose={onClose}>
            <label className="field">
                <span>Strip image</span>
                <input
                    type="file"
                    accept="image/png"
                    onChange={(event) => choose(event.target.files?.[0])}
                    data-testid="strip-file"
                />
            </label>
            <div className="grid-4">
                <NumberField
                    label="Frame W"
                    min={1}
                    max={16}
                    value={fw}
                    onChange={setFw}
                    title="Frame width in tiles"
                />
                <NumberField
                    label="Frame H"
                    min={1}
                    max={16}
                    value={fh}
                    onChange={setFh}
                    title="Frame height in tiles"
                />
                <NumberField
                    label="ms"
                    min={10}
                    max={10000}
                    step={10}
                    value={duration}
                    onChange={setDuration}
                />
            </div>
            <p className="hint">
                {image
                    ? `${fileName}: ${image.naturalWidth}×${image.naturalHeight}px → ${frames} frame${frames === 1 ? "" : "s"} of ${fw}×${fh} tiles.`
                    : `Frame size is in ${tile}px tiles.`}
            </p>
            <div className="row">
                <label className="check">
                    <input
                        type="radio"
                        checked={target === "append"}
                        disabled={!canAppend}
                        onChange={() => setTarget("append")}
                    />
                    Append to {current?.name ?? "current sheet"}
                </label>
                <label className="check">
                    <input
                        type="radio"
                        checked={target === "new"}
                        onChange={() => setTarget("new")}
                    />
                    New sheet
                </label>
            </div>
            {target === "append" ? (
                <p className="hint">
                    Frames are added as new rows at the bottom, so no existing tile id moves. The
                    image is rewritten now.
                </p>
            ) : (
                <div className="grid-2">
                    <label className="field">
                        <span>Sheet name</span>
                        <input value={name} onChange={(event) => setName(event.target.value)} />
                    </label>
                    <label className="field">
                        <span>Folder in {profile.roots.tilesets}</span>
                        <input value={folder} onChange={(event) => setFolder(event.target.value)} />
                    </label>
                </div>
            )}
            <footer>
                <button onClick={onClose}>Cancel</button>
                <button
                    className="primary"
                    disabled={busy || frames < 1}
                    onClick={run}
                    data-testid="strip-import"
                >
                    Import {frames || ""} frames
                </button>
            </footer>
        </Modal>
    );
}
