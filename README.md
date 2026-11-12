# POI Forge

Generate, edit, animate and preview tile-map points of interest (POIs): cave entrances,
shrines, camps, ruins. It works like a small, focused Tiled and saves Tiled's own
`.tmj` / `.tsj` files, so a game's existing map pipeline keeps working.

- **Generate** a POI from a tileset: seeded recipes compose tagged prefabs.
- **Edit** every tile: paint, erase, fill, pick, select, swap a tile or a whole prefab.
- **Animate** tiles without the fiddling: timeline, strip auto-fill, multi-tile blocks,
  strip import.
- **Preview** live while you work, in the map's surroundings where the profile knows them.

## Run it

Needs Node 22+.

```sh
npm install
npm start            # http://localhost:5199, opens the bundled forest example
```

To work on a real project, point the tool at its folder and pick a profile:

```sh
POI_PROJECT=../phasercraft POI_PROFILE=phasercraft npm start
```

or copy `poi.config.example.json` to `poi.config.json` (git-ignored).

### Hosted build

`npm run build` makes a static site (deployed on Vercel from `main`). With no file
server it opens the bundled demo, where saves stay in the tab. **Open folder…** picks a
project folder on your computer (Chrome or Edge) and reads and writes it directly;
nothing is uploaded. Prefab library edits are kept in that browser, on top of the
libraries shipped with the build, so curate libraries from a local `npm start` to commit
them.

The tool reads the project folder and writes only map files (`.tmj`), tileset files
(`.tsj`) and sheet images (`.png`), only inside the folders the profile names, and only
when you save or import. It never deletes anything.

## The example project

`demo/` is a small project built on the forest pack of the `fantasy_` series
(analogStudios): terrain with a plateau and cave mouth, paths, resources, fences and
walls, an animated fountain. `npm run demo:build` derives everything else from the
sheets: collision and animations in each `.tsj`, the prefab libraries in
`libraries/generic/`, and one generated map per recipe.

The sheets are licensed art, included here as the example. Keep this repository and its
deployment private, or swap the sheets out, before sharing either.

## The three tabs

### Map

| Tool   | Key | Does                                                                        |
| ------ | --- | --------------------------------------------------------------------------- |
| Brush  | B   | Paints the tiles selected on the sheet, or a prefab.                        |
| Erase  | E   | Clears cells on the active layer. Shift: every layer.                       |
| Fill   | R   | Drag a rectangle to fill it.                                                |
| Pick   | I   | Picks the tile under the cursor, and its layer.                             |
| Select | S   | Drag a region: copy as a stamp, clear, lock, or save as a prefab.           |
| Swap   | W   | Click a tile, then any sheet tile to replace it. On a prefab: swap the lot. |
| Object | O   | Drag to add a zone, Alt+click for a point, drag to move. Edit in the panel. |
| Lock   | L   | Marks cells the generator must keep when re-rolling.                        |

`1`–`9` pick a tile layer. Ctrl+Z / Ctrl+Shift+Z undo and redo (map, tileset and prefab
edits share one history). Ctrl+S saves everything that changed.

Blank tiles can't be painted: clear cells with the eraser instead. The **Problems** list
at the bottom shows the profile's validation live; click an entry to jump to the cell.

### Tileset

- **Properties.** Select tiles on the sheet and set the profile's properties. Overlays
  show them on the sheet and, with _Tile properties_ on, on the map.
- **Animation.** Select the first frame (one tile or a block).
    - _Auto-fill_: frame count, step between frames, duration. A block animates every
      tile in sync.
    - _Timeline_: reorder, retime or remove frames; add frames by clicking the sheet.
    - _Import strip_: slice a separate strip PNG and append its frames as new rows at the
      bottom of a sheet (no existing tile id moves), or make a new sheet.
- **Prefabs.** _Auto-detect_ proposes one prefab per connected piece of art; name and tag
  the ones worth keeping. _New from selection_ makes one by hand. Kinds:
    - `fixed`: placed as is (a rock, an arch).
    - `stretch`: cap columns at the ends, the middle repeats to any width (a cliff run).
    - `decal`: flat ground art; never blocks.

_Add sheet…_ turns any PNG into a tileset (its `.tsj` is written next to it on save) and
can copy one in from the project's source-art folder.

### Generate

Pick a recipe, size, seed, density, symmetry and themes, then **Generate** for a gallery
of candidates. Hover one to see it in the live preview; **Use** puts it in the open map
(undoable) or a new one. The recipe and settings are stored on the map as custom
properties, so it can be re-rolled later.

Lock cells on the map first and the generator keeps them and builds around them.

Every candidate is checked: each zone must be reachable on foot from the south edge.
Prefabs that wouldn't work in a map yet (a sheet not added, a tile with no depth role)
are left out and listed under the Generate button.

## Tags the recipes use

| Recipe   | Looks for                                                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------- |
| Entrance | `soil` / `grass`, `soil-deco` / `grass-deco`, `backdrop` (stretch), `entrance`, `apron`, `light`, `rock`, |
|          | `rock-small`, `plant`, `bones`, `ground-deco`                                                             |
| Shrine   | `shrine` / `fountain` / `statue`, `light`, `pillar` / `wall`, `plant`, `rock-small`                       |
| Camp     | `fire` / `light`, `tent` / `seat`, `clutter` / `sign`, `rock`, `plant`, `tree`                            |
| Ruin     | `wall` / `pillar` / `fence` / `grave`, `statue` / `shrine` / `fountain` / `clutter`,                      |
|          | `rock`, `rock-small`, `plant`, `bones`                                                                    |
| Grove    | `tree`, `shrine` / `statue` / `rock` / `fountain`, `plant`, `rock-small`                                  |

Every recipe first fills the ground with one `soil` or `grass` tile (grove: `grass`), varied
with that ground's own `-deco` tiles.

Recipes are JSON in `recipes/`; they name tags, never tile ids, so they work with any
tileset. Step types are documented in `src/core/generator.ts`.

A sheet's **themes** (set in the Prefabs tab) keep packs apart: the generator only
mixes sheets whose themes are switched on.

## Profiles

Everything project-specific lives in a profile (`src/profiles/`): folders, layer names,
tile properties, validation rules and the preview's surroundings.

- `generic`: `maps/` and `tilesets/`, four layers, one `collides` flag.
- `phasercraft`: the conventions in that game's `docs/map-poi.md`. POIs in
  `assets/maps/poi/`, the five biome layers, `collides` / `sortBase` / `ground` /
  `solidCorners`, the depth-role rules, and a preview on the biome's soil pad. Biome
  sheets are read from the generated biome maps and are read-only.

Prefab libraries are tool data, not game data: `libraries/<profile>/<tileset>.prefabs.json`.

### Using a POI in Phasercraft

The tool stops at the files. Placing the POI is still the game's
`docs/map-poi.md` checklist: add `{ file, x, y }` to the biome's `pois`, wire any new
sheet in `biomes.ts` and `LoadScene`, run `npm run maps:biomes`.

## Develop

```sh
npm run check        # typecheck, lint, format, unit tests, build
npm test             # unit tests (Vitest)
npm run e2e          # browser smoke test on a copy of the demo (needs Playwright)
npm run demo:build   # regenerate the example's .tsj files, libraries and maps
```

```
src/core/      pure TypeScript, no DOM: Tiled IO, editing, prefabs, generator, animation
src/profiles/  the Profile implementations
src/ui/        React app (Canvas 2D), state in one zustand store
server/        Vite plugin: the file API
recipes/       generator recipes
libraries/     prefab libraries per profile
demo/          example project: forest sheets + generated .tsj and maps (generic profile)
fixtures/      map and tileset JSON from Phasercraft, for tests (no art)
```

Design notes and decisions: [docs/design.md](docs/design.md).
