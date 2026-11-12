import { useStore } from "../store";

/** Tile and object layers: pick the one edits go to, show or hide each. */
export function Layers() {
    const map = useStore((state) => state.map);
    const profile = useStore((state) => state.profile);
    const activeLayer = useStore((state) => state.activeLayer);
    const activeObjectLayer = useStore((state) => state.activeObjectLayer);
    const hidden = useStore((state) => state.hiddenLayers);
    const set = useStore((state) => state.set);

    const present = new Set(map?.layers.map((layer) => layer.name));
    const tileLayers = [
        ...profile.tileLayers,
        ...(map?.layers
            .filter((l) => l.type === "tilelayer" && !profile.tileLayers.includes(l.name))
            .map((l) => l.name) ?? []),
    ];
    const objectLayers = [
        ...profile.objectLayers,
        ...(map?.layers
            .filter((l) => l.type === "objectgroup" && !profile.objectLayers.includes(l.name))
            .map((l) => l.name) ?? []),
    ];
    const toggle = (name: string) =>
        set({
            hiddenLayers: hidden.includes(name)
                ? hidden.filter((n) => n !== name)
                : [...hidden, name],
        });

    const row = (name: string, active: boolean, select: () => void, index?: number) => (
        <li key={name} className={active ? "active" : ""}>
            <button
                className="layer"
                onClick={select}
                title={index ? `Shortcut: ${index}` : undefined}
            >
                <span className="dot" />
                {name}
                {!present.has(name) && <em> (empty)</em>}
            </button>
            <button
                className={`ghost eye${hidden.includes(name) ? " off" : ""}`}
                onClick={() => toggle(name)}
                title={hidden.includes(name) ? "Show layer" : "Hide layer"}
            >
                {hidden.includes(name) ? "○" : "●"}
            </button>
        </li>
    );

    return (
        <section className="panel layers">
            <h3>Tile layers</h3>
            <ul>
                {tileLayers
                    .slice()
                    .reverse()
                    .map((name) =>
                        row(
                            name,
                            name === activeLayer,
                            () => set({ activeLayer: name }),
                            tileLayers.indexOf(name) + 1,
                        ),
                    )}
            </ul>
            <h3>Object layers</h3>
            <ul>
                {objectLayers.map((name) =>
                    row(name, name === activeObjectLayer, () =>
                        set({ activeObjectLayer: name, tool: "object" }),
                    ),
                )}
            </ul>
        </section>
    );
}
