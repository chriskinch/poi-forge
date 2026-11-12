import { useStore, type Tool } from "../store";

export const TOOLS: { id: Tool; label: string; key: string; help: string }[] = [
    { id: "brush", label: "Brush", key: "B", help: "Paint the selected tiles or prefab" },
    {
        id: "erase",
        label: "Erase",
        key: "E",
        help: "Clear cells on the active layer. Shift: every layer",
    },
    { id: "rect", label: "Fill", key: "R", help: "Drag a rectangle to fill it with the selection" },
    { id: "pick", label: "Pick", key: "I", help: "Pick the tile under the cursor" },
    {
        id: "select",
        label: "Select",
        key: "S",
        help: "Drag to select. Delete clears, Ctrl+C copies as a stamp",
    },
    {
        id: "swap",
        label: "Swap",
        key: "W",
        help: "Click a tile or prefab to replace it with another",
    },
    {
        id: "object",
        label: "Object",
        key: "O",
        help: "Drag to add a zone, Alt+click a point, drag to move",
    },
    { id: "lock", label: "Lock", key: "L", help: "Mark cells the generator must keep" },
];

export function Tools({ zoom, setZoom }: { zoom: number; setZoom: (zoom: number) => void }) {
    const tool = useStore((state) => state.tool);
    const overlays = useStore((state) => state.overlays);
    const set = useStore((state) => state.set);
    const toggles: [keyof typeof overlays, string][] = [
        ["grid", "Grid"],
        ["props", "Tile properties"],
        ["objects", "Objects"],
        ["issues", "Problems"],
    ];
    return (
        <section className="panel tools">
            <h3>Tools</h3>
            <div className="tool-grid">
                {TOOLS.map((item) => (
                    <button
                        key={item.id}
                        className={tool === item.id ? "active" : ""}
                        onClick={() => set({ tool: item.id })}
                        title={`${item.help} (${item.key})`}
                        data-testid={`tool-${item.id}`}
                    >
                        {item.label}
                        <kbd>{item.key}</kbd>
                    </button>
                ))}
            </div>
            <h3>Show</h3>
            {toggles.map(([key, label]) => (
                <label className="check" key={key}>
                    <input
                        type="checkbox"
                        checked={overlays[key]}
                        onChange={(event) =>
                            set({ overlays: { ...overlays, [key]: event.target.checked } })
                        }
                    />
                    {label}
                </label>
            ))}
            <h3>Zoom</h3>
            <div className="row">
                <button onClick={() => setZoom(Math.max(1, zoom - 1))} aria-label="Zoom out">
                    −
                </button>
                <span className="zoom">{zoom}×</span>
                <button onClick={() => setZoom(Math.min(8, zoom + 1))} aria-label="Zoom in">
                    +
                </button>
            </div>
        </section>
    );
}
