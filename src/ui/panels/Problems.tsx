import { useIssues, useStore } from "../store";

/** The profile's validation results, live. */
export function Problems() {
    const issues = useIssues();
    const set = useStore((state) => state.set);
    const errors = issues.filter((issue) => issue.level === "error").length;
    return (
        <details className="problems" data-testid="problems">
            <summary className={errors ? "bad" : issues.length ? "warn" : "ok"}>
                {issues.length
                    ? `${errors} error${errors === 1 ? "" : "s"}, ${issues.length - errors} warning${issues.length - errors === 1 ? "" : "s"}`
                    : "No problems"}
            </summary>
            <ul>
                {issues.slice(0, 100).map((issue, i) => (
                    <li key={i} className={issue.level}>
                        <button
                            className="link"
                            disabled={issue.x === undefined}
                            onClick={() =>
                                issue.x !== undefined &&
                                set({
                                    mode: "map",
                                    tool: "swap",
                                    swapTarget: { x: issue.x, y: issue.y! },
                                    ...(issue.layer ? { activeLayer: issue.layer } : {}),
                                    ...(issue.tileset ? { activeTileset: issue.tileset } : {}),
                                })
                            }
                        >
                            {issue.x !== undefined && (
                                <code>
                                    {issue.layer} {issue.x},{issue.y}
                                </code>
                            )}{" "}
                            {issue.message}
                        </button>
                    </li>
                ))}
            </ul>
        </details>
    );
}
