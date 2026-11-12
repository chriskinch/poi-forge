/** A neutral profile for any Tiled project: four layers, one `collides` flag. */
import { cellOf } from "../core/doc";
import { baseIssues, type Profile } from "../core/profile";
import ROOTS from "./roots.json";

export const generic: Profile = {
    id: "generic",
    label: ROOTS.generic.label,
    tileSize: 16,
    roots: ROOTS.generic.roots,
    tileLayers: ["ground", "details", "structures", "overhead"],
    objectLayers: ["objects"],
    propLayers: ["structures", "overhead"],
    defaultObjectLayer: "objects",
    tileProperties: [
        {
            name: "collides",
            type: "bool",
            label: "Collides",
            color: "#ff4d4d",
            help: "Blocks movement.",
        },
    ],
    embed: (entry) => !entry.path,
    layerFor: (_props, rowFromBottom) => (rowFromBottom === 0 ? "structures" : "overhead"),
    depthRole: (rowFromBottom) =>
        rowFromBottom === 0 ? [{ name: "collides", type: "bool", value: true }] : [],
    isSolid: (props, layer) => layer !== "overhead" && props.collides === true,
    tileProblem: () => null,
    contexts: () => [],
    validate: (input) => baseIssues(input, (gid) => cellOf(gid, input.sets)),
};
