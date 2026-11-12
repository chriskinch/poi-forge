import { storedType, type PropertySchema } from "../../core/profile";
import { setTileProperty, tileProps } from "../../core/tileset";
import type { TiledTileset } from "../../core/tiled";
import { sheetTiles } from "../helpers";
import { useStore } from "../store";

const CORNERS: [number, string][] = [
    [1, "NW"],
    [2, "NE"],
    [4, "SW"],
    [8, "SE"],
];

/** Edits tile properties for the tiles selected on the sheet. */
export function TileProps() {
    const state = useStore();
    const { activeTileset, catalog, sheetSel, profile } = state;
    const entry = activeTileset ? catalog[activeTileset] : undefined;
    if (!entry) return null;
    const sel = sheetSel?.tileset === entry.name ? sheetSel : null;
    const loaded = state.images[entry.name];
    const coverage = typeof loaded === "object" ? loaded.coverage : undefined;
    const tiles = sel
        ? sheetTiles(entry.def, sel).filter((tile) => !coverage || coverage[tile]! > 0)
        : [];
    const { def } = entry;

    const apply = (next: TiledTileset) => state.setDef(entry.name, next);
    const common = (schema: PropertySchema): unknown => {
        const values = tiles.map((tile) => tileProps(def, tile)[schema.name]);
        return values.every((value) => value === values[0]) ? values[0] : "mixed";
    };

    const standing = () => {
        if (!sel) return;
        let next = def;
        for (const tile of tiles) {
            const rowFromBottom = sel.y + sel.h - 1 - Math.floor(tile / def.columns);
            for (const schema of profile.tileProperties) {
                next = setTileProperty(next, [tile], schema.name, storedType(schema), undefined);
            }
            for (const role of profile.depthRole(rowFromBottom, sel.h)) {
                next = setTileProperty(next, [tile], role.name, role.type, role.value);
            }
        }
        apply(next);
    };

    return (
        <div className="tile-props" data-testid="tile-props">
            {entry.readOnly && (
                <p className="notice">
                    This sheet is defined by{" "}
                    {entry.variant ? `the ${entry.variant} map` : "its host map"}: its properties
                    are shown but can't be edited here.
                </p>
            )}
            {!tiles.length ? (
                <p className="hint">Select tiles on the sheet. Drag to select several.</p>
            ) : (
                <>
                    <p className="hint">
                        {tiles.length === 1
                            ? `Tile ${tiles[0]}`
                            : `${tiles.length} tiles (${tiles[0]}–${tiles[tiles.length - 1]})`}
                    </p>
                    {profile.tileProperties.map((schema) => {
                        const value = common(schema);
                        const set = (next: unknown) =>
                            apply(
                                setTileProperty(def, tiles, schema.name, storedType(schema), next),
                            );
                        return (
                            <fieldset key={schema.name} disabled={entry.readOnly} className="prop">
                                <legend>
                                    <span className="swatch" style={{ background: schema.color }} />
                                    {schema.label}
                                    {value === "mixed" && <em> (mixed)</em>}
                                </legend>
                                {schema.type === "bool" && (
                                    <div className="row">
                                        <button
                                            className={value === true ? "active" : ""}
                                            onClick={() => set(true)}
                                            data-testid={`prop-${schema.name}-on`}
                                        >
                                            On
                                        </button>
                                        <button
                                            className={value === undefined ? "active" : ""}
                                            onClick={() => set(undefined)}
                                        >
                                            Off
                                        </button>
                                    </div>
                                )}
                                {schema.type === "int" && (
                                    <div className="row">
                                        <input
                                            type="number"
                                            min={0}
                                            value={typeof value === "number" ? value : ""}
                                            placeholder={value === "mixed" ? "mixed" : "none"}
                                            onChange={(event) =>
                                                event.target.value !== "" &&
                                                set(Math.round(Number(event.target.value)))
                                            }
                                            data-testid={`prop-${schema.name}`}
                                        />
                                        <button onClick={() => set(undefined)}>Clear</button>
                                    </div>
                                )}
                                {schema.type === "corners" && (
                                    <div className="row">
                                        <div className="corners">
                                            {CORNERS.map(([bit, label]) => {
                                                const mask = typeof value === "number" ? value : 0;
                                                return (
                                                    <button
                                                        key={bit}
                                                        className={mask & bit ? "active" : ""}
                                                        onClick={() => set(mask ^ bit || undefined)}
                                                    >
                                                        {label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <button onClick={() => set(undefined)}>Clear</button>
                                    </div>
                                )}
                                <p className="hint">{schema.help}</p>
                            </fieldset>
                        );
                    })}
                    <div className="row">
                        <button
                            disabled={entry.readOnly}
                            onClick={standing}
                            title="Bottom row solid, rows above sorted to the base"
                        >
                            Mark as standing prop
                        </button>
                        <button
                            disabled={entry.readOnly}
                            onClick={() => {
                                let next = def;
                                for (const schema of profile.tileProperties) {
                                    next = setTileProperty(
                                        next,
                                        tiles,
                                        schema.name,
                                        storedType(schema),
                                        undefined,
                                    );
                                }
                                apply(next);
                            }}
                        >
                            Clear all
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
