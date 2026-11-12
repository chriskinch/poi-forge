# Design

## Decisions

| Topic        | Decision                                                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Form         | Local Vite app: React + Canvas 2D, no game engine. A dev-server plugin reads and writes project files.                                                            |
| Hosting      | The same app as a static build: bundled demo, or a folder picked through the File System Access API. One file-access interface, three backends (`src/ui/api.ts`). |
| Coupling     | Generic core + swappable profile. The tool lives in its own repo and never changes a game's code.                                                                 |
| Format       | Tiled-native `.tmj` / `.tsj`. Files still open in Tiled.                                                                                                          |
| Byte-stable  | Loading and saving an untouched file changes nothing; a save after undo restores the original bytes. New objects are written with Tiled's alphabetical keys.      |
| Generation   | Seeded recipes that compose prefabs by tag. Deterministic. No AI, no example-learning.                                                                            |
| Recipes      | Built-in archetypes as JSON (entrance, shrine, camp, ruin, grove), driven by sliders. No visual recipe editor.                                                    |
| Tile meaning | Auto-detect prefabs from the sheet's pixels, then confirm and tag by hand. Stretch sets are manual.                                                               |
| Prefabs      | Stored per tileset in the tool repo, not in `.tsj` (Tiled drops unknown keys) and not in the game.                                                                |
| Instances    | Not stored. Prefabs are found in a map by matching tiles, so prefab swap works on hand-made maps too.                                                             |
| Preview      | Live and animated, in the map's surroundings when the profile provides them. Not playable.                                                                        |
| Surroundings | The Phasercraft profile re-implements the game generator's soil pad (same geometry and autotile table) rather than importing game code.                           |
| Undo         | One history of immutable snapshots covering the map, tileset definitions and prefab libraries.                                                                    |
| Out of scope | Placing a POI in a host map, running the game's generator, wiring new sheets into the game, a playable walk-test, an AI prompt layer, a visual recipe editor.     |

## Data flow

```
project folder ──(file API)──► catalog of tilesets ─┐
                               map (.tmj)          ─┼─► store ─► canvases
libraries/<profile>/*.json ──► prefab libraries    ─┘      │
                                                           └─► save: only what changed
```

- **Catalog.** Every `.tsj` under the profile's tileset root, plus (when the profile
  asks) the tilesets embedded in host maps, read-only. Tilesets are keyed by name.
- **Cells.** The core addresses tiles as `{ tileset, tile }`, not gids. A map's gids are
  resolved against the catalog on load; painting a sheet the map lacks appends it with
  the next free `firstgid`, embedded or as a `.tsj` reference as the profile decides.
- **Edits** are pure functions returning new objects (`src/core/doc.ts`,
  `src/core/tileset.ts`), which is what makes snapshot undo and byte-stable saves cheap.

## Generator

`generate(recipe, params, ctx)` in `src/core/generator.ts`. A recipe is a list of steps:

| Step       | Places                                                                                |
| ---------- | ------------------------------------------------------------------------------------- |
| `fill`     | A 1×1 ground prefab everywhere, with occasional variants.                             |
| `backdrop` | A `stretch` prefab across the top.                                                    |
| `focal`    | The centrepiece, set into the backdrop or centred. Reserves a lane to the south edge. |
| `apron`    | Ground art in front of the focal prefab.                                              |
| `flank`    | Mirrored pairs either side of the lane.                                               |
| `ring`     | Items around the focal point, south side open.                                        |
| `outline`  | Items along an inset rectangle, with gaps.                                            |
| `scatter`  | Loose items, clustered, by zone.                                                      |
| `decal`    | Flat 1×1 art on free cells.                                                           |

Rules that make results usable rather than random:

- Nothing solid goes in the lane; every zone must be reachable from the south edge
  (`walkable`), or the candidate is discarded and the next derived seed tried.
- Symmetry mirrors built things (flanks, rings, outlines) exactly. Loose scatter is
  balanced instead: each item is answered across the lane by a different pick, a row or
  so off.
- Items cluster, so they read as deliberate.
- Locked cells are kept and count as occupied.
- The profile filters out prefabs whose tiles would fail validation.

## Phasercraft specifics

- Layers `terrain`, `terrain props`, `paths`, `structure`, `structure props`; object
  layers `POI`, `spawn`, `collision map`.
- Every tile on a prop layer needs a depth role (`collides`, `sortBase`, `ground` or
  `solidCorners`); `solidCorners` needs `ground`. Missing roles on the POI's own sheets
  are errors; on biome sheets they are warnings, since those roles are set by the game's
  generator and can't be fixed from a POI.
- `terrain props` draws under `paths`, so tiles there are hidden on the soil pad: warned.
- Biome sheets are embedded by name and keep the biome's own definition; other sheets
  are shared external `.tsj` files.
- The prefab libraries in `libraries/phasercraft/` were authored with
  `scripts/annotate-phasercraft.py` from a read of each sheet. The biome packs share one
  slot layout, so one spec serves forest, desert, tundra, swamp, taiga and cave; slots a
  biome leaves blank are dropped. They are a starting point: fix them in the app.
