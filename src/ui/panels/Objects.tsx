import { findObject, updateObject } from "../../core/doc";
import type { TiledObject, TiledProperty } from "../../core/tiled";
import { NumberField } from "../Modal";
import { useStore } from "../store";

const TYPES = ["string", "int", "float", "bool"];

function coerce(type: string, value: unknown): unknown {
    if (type === "bool") return value === true || value === "true";
    if (type === "int") return Math.round(Number(value) || 0);
    if (type === "float") return Number(value) || 0;
    return String(value ?? "");
}

/** Lists the map's objects and edits the selected one. */
export function Objects() {
    const state = useStore();
    const { map, selectedObject } = state;
    if (!map) return null;
    const tile = map.tilewidth;
    const found = selectedObject !== null ? findObject(map, selectedObject) : undefined;
    const layers = map.layers.filter((layer) => layer.type === "objectgroup");

    const edit = (change: (object: TiledObject) => TiledObject | null) => {
        if (selectedObject !== null) state.setMap(updateObject(map, selectedObject, change));
    };
    const setProps = (properties: TiledProperty[]) =>
        edit((object) => {
            const { properties: _old, ...rest } = object;
            if (!properties.length) return rest as TiledObject;
            // Keep keys in Tiled's alphabetical order.
            const entries = Object.entries({ ...rest, properties }).sort(([a], [b]) =>
                a.localeCompare(b),
            );
            return Object.fromEntries(entries) as TiledObject;
        });

    return (
        <section className="panel objects" data-testid="objects-panel">
            <h3>Objects</h3>
            <p className="hint">
                Drag on the map to add a zone to <b>{state.activeObjectLayer}</b>. Alt+click adds a
                point. Drag an object to move it.
            </p>
            <ul className="object-list">
                {layers.flatMap((layer) =>
                    (layer.objects ?? []).map((object) => (
                        <li
                            key={object.id}
                            className={object.id === selectedObject ? "active" : ""}
                        >
                            <button
                                className="layer"
                                onClick={() =>
                                    state.set({
                                        selectedObject: object.id,
                                        activeObjectLayer: layer.name,
                                    })
                                }
                            >
                                <span className="dot" />
                                {object.name || `#${object.id}`} <em>{layer.name}</em>
                            </button>
                        </li>
                    )),
                )}
                {!layers.some((layer) => layer.objects?.length) && (
                    <li className="hint">No objects yet.</li>
                )}
            </ul>
            {found && (
                <div className="object-editor">
                    <label className="field">
                        <span>Name</span>
                        <input
                            value={found.object.name}
                            onChange={(event) =>
                                edit((object) => ({ ...object, name: event.target.value }))
                            }
                            data-testid="object-name"
                        />
                    </label>
                    <div className="grid-4">
                        <NumberField
                            label="X"
                            step={0.5}
                            value={found.object.x / tile}
                            onChange={(v) => edit((o) => ({ ...o, x: v * tile }))}
                        />
                        <NumberField
                            label="Y"
                            step={0.5}
                            value={found.object.y / tile}
                            onChange={(v) => edit((o) => ({ ...o, y: v * tile }))}
                        />
                        {!found.object.point && (
                            <>
                                <NumberField
                                    label="W"
                                    min={0.5}
                                    step={0.5}
                                    value={found.object.width / tile}
                                    onChange={(v) => edit((o) => ({ ...o, width: v * tile }))}
                                />
                                <NumberField
                                    label="H"
                                    min={0.5}
                                    step={0.5}
                                    value={found.object.height / tile}
                                    onChange={(v) => edit((o) => ({ ...o, height: v * tile }))}
                                />
                            </>
                        )}
                    </div>
                    <p className="hint">Position and size in tiles.</p>
                    <h3>Custom properties</h3>
                    {(found.object.properties ?? []).map((prop, i) => {
                        const props = found.object.properties!;
                        const replace = (next: TiledProperty) =>
                            setProps(props.map((p, j) => (j === i ? next : p)));
                        return (
                            <div className="prop-row" key={i}>
                                <input
                                    value={prop.name}
                                    placeholder="name"
                                    onChange={(e) => replace({ ...prop, name: e.target.value })}
                                />
                                <select
                                    value={prop.type}
                                    onChange={(e) =>
                                        replace({
                                            ...prop,
                                            type: e.target.value,
                                            value: coerce(e.target.value, prop.value),
                                        })
                                    }
                                >
                                    {TYPES.map((type) => (
                                        <option key={type}>{type}</option>
                                    ))}
                                </select>
                                {prop.type === "bool" ? (
                                    <input
                                        type="checkbox"
                                        checked={prop.value === true}
                                        onChange={(e) =>
                                            replace({ ...prop, value: e.target.checked })
                                        }
                                    />
                                ) : (
                                    <input
                                        value={String(prop.value ?? "")}
                                        placeholder="value"
                                        onChange={(e) =>
                                            replace({
                                                ...prop,
                                                value:
                                                    prop.type === "string"
                                                        ? e.target.value
                                                        : coerce(prop.type, e.target.value),
                                            })
                                        }
                                    />
                                )}
                                <button
                                    className="ghost"
                                    onClick={() => setProps(props.filter((_, j) => j !== i))}
                                    aria-label="Remove property"
                                >
                                    ✕
                                </button>
                            </div>
                        );
                    })}
                    <div className="row">
                        <button
                            onClick={() =>
                                setProps([
                                    ...(found.object.properties ?? []),
                                    { name: "", type: "string", value: "" },
                                ])
                            }
                        >
                            Add property
                        </button>
                        <button
                            className="danger"
                            onClick={() => {
                                edit(() => null);
                                state.set({ selectedObject: null });
                            }}
                        >
                            Delete object
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
