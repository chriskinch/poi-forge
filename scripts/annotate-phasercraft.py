"""One-off authoring of the Phasercraft prefab libraries from hand-read sheets."""
import json, os, re, sys
from PIL import Image

GAME, OUT = sys.argv[1], sys.argv[2]
T = f"{GAME}/public/graphics/tilesets"
os.makedirs(OUT, exist_ok=True)

def occupancy(path):
    im = Image.open(path).convert("RGBA"); a = im.getchannel("A"); cols = im.width // 16
    return {i for i in range(cols * (im.height // 16))
            if a.crop(((i % cols) * 16, (i // cols) * 16, (i % cols) * 16 + 16, (i // cols) * 16 + 16)).getextrema()[1] > 8}

def P(id, name, tags, rows, kind="fixed", layer=None, stretch=None, weight=None):
    return dict(id=id, name=name, tags=tags, rows=rows, kind=kind, layer=layer, stretch=stretch, weight=weight)

def build(tileset, image, themes, specs):
    occ = occupancy(image)
    prefabs = []
    for s in specs:
        h = len(s["rows"])
        cells = []
        for dy, row in enumerate(s["rows"]):
            for dx, tile in enumerate(row):
                if tile is None or tile not in occ: continue
                layer = s["layer"] or ("structure" if dy == h - 1 else "structure props")
                cells.append(dict(dx=dx, dy=dy, layer=layer, tile=tile))
        if not cells: continue
        if s["kind"] != "stretch":
            # A stretch template keeps its shape; anything else shrinks to its art.
            x0 = min(c["dx"] for c in cells); y0 = min(c["dy"] for c in cells)
            for c in cells: c["dx"] -= x0; c["dy"] -= y0
            if not s["layer"]:
                hh = max(c["dy"] for c in cells) + 1
                for c in cells: c["layer"] = "structure" if c["dy"] == hh - 1 else "structure props"
        w = max(c["dx"] for c in cells) + 1 if s["kind"] != "stretch" else len(s["rows"][0])
        hh = max(c["dy"] for c in cells) + 1
        p = dict(id=s["id"], name=s["name"], tags=s["tags"], kind=s["kind"], w=w, h=hh, cells=cells)
        if s["stretch"]: p["stretch"] = dict(left=s["stretch"][0], right=s["stretch"][1])
        if s["weight"]: p["weight"] = s["weight"]
        prefabs.append(p)
    name = re.sub(r'[\\/:*?"<>|]', "-", tileset)
    with open(f"{OUT}/{name}.prefabs.json", "w") as f:
        json.dump(dict(version=1, tileset=tileset, themes=themes, prefabs=prefabs), f, indent=4); f.write("\n")
    print(f"{tileset}: {len(prefabs)} prefabs")

def singles(prefix, name, tags, tiles, **kw):
    return [P(f"{prefix}-{t}", f"{name} {t}", tags, [[t]], **kw) for t in tiles]

# ── cave ──
build("cave_ [cliff]", f"{T}/cave_/cave_ [cliff].png", ["cave"], [
    P("ridge", "Cliff ridge", ["backdrop"], [[47, 49, None, 50, 49], [93, 141, None, 142, 95], [323, 324, 324, 324, 325],
      [369, 370, 370, 370, 371], [415, 416, 416, 416, 417]], kind="stretch", layer="structure", stretch=(2, 2)),
    P("arch-stone", "Stone arch", ["entrance"], [[338, 339, 340], [384, 385, 386], [430, 431, 432]], layer="structure"),
    P("mine-entrance", "Mine entrance", ["entrance"], [[200, 201, 202], [246, 247, 248], [292, 293, 294]], layer="structure"),
    P("cave-mouth", "Cave mouth", ["entrance"], [[62, 63, 64], [108, 109, 110], [154, 155, 156]], layer="structure"),
    *singles("soil-deco", "Pebbled soil", ["soil-deco"], [282, 283, 328, 329, 374, 375, 376, 377, 420, 421, 422, 423],
             kind="decal", layer="paths", weight=0.5),
])
build("caveObjects_", f"{T}/cave_/caveObjects_.png", ["cave"], [
    P("mushroom-brown-tall", "Tall brown mushroom", ["plant"], [[12], [23]]),
    P("mushroom-orange-tall", "Tall orange mushroom", ["plant"], [[13], [24]]),
    *singles("mushroom", "Mushroom", ["plant"], [17, 18, 19, 20, 28, 29, 30, 31, 41, 42, 52, 53], layer="structure", weight=0.4),
    P("rock-big", "Big rock", ["rock"], [[35, 36], [46, 47]]),
    *singles("rock", "Rock", ["rock-small"], [48, 49], layer="structure"),
    *singles("ore", "Ore rock", ["rock-small", "ore"], [39, 40, 50, 51], layer="structure", weight=0.5),
    P("grave-a", "Gravestone A", ["grave"], [[56], [67]]),
    P("grave-b", "Gravestone B", ["grave"], [[57], [68]]),
    P("grave-c", "Gravestone C", ["grave"], [[58], [69]]),
    P("chest", "Chest", ["clutter"], [[59], [70]]),
    P("chest-open", "Open chest", ["clutter"], [[60], [71]]),
    P("chest-big", "Big chest", ["clutter"], [[79, 80], [90, 91]]),
    P("chest-big-open", "Big open chest", ["clutter"], [[81, 82], [92, 93]]),
    P("sign", "Sign", ["sign"], [[78], [89]]),
    P("campfire-unlit", "Unlit campfire", ["clutter"], [[111]], layer="structure"),
    P("campfire", "Campfire", ["fire", "light"], [[112]], layer="structure"),
])
build("caveStructures_ [fountainPortalBridge]", f"{T}/cave_/caveStructures_ [fountainPortalBridge].png", ["cave"], [
    P("brazier-lit", "Lit brazier", ["light"], [[21, 22], [39, 40]], layer="structure"),
    P("brazier", "Unlit brazier", ["clutter"], [[19, 20], [37, 38]], layer="structure"),
    P("rubble", "Rubble block", ["clutter", "wall"], [[33, 34], [51, 52]], layer="structure"),
    P("fountain", "Fountain", ["fountain", "shrine"], [[73, 74, 75, 76], [91, 92, 93, 94], [109, 110, 111, 112], [127, 128, 129, 130]], layer="structure"),
    P("pool", "Small pool", ["fountain"], [[173, 174], [191, 192]], layer="structure"),
    P("portal", "Portal", ["shrine", "portal"], [[217, 218, 219], [235, 236, 237]]),
    P("ruined-arch", "Ruined arch", ["wall"], [[163, 164, 165], [181, 182, 183]]),
    P("pillar-left", "Broken pillar (left)", ["pillar"], [[166], [184]]),
    P("pillar-right", "Broken pillar (right)", ["pillar"], [[168], [186]]),
    P("stone-deck", "Stone deck", ["apron"], [[321], [339]], kind="decal", layer="structure"),
])
build("skulls_", f"{T}/cave_/skulls_.png", ["cave"], singles("skull", "Skull", ["bones"], [0, 1, 2, 3], kind="decal", layer="structure"))

# ── biome packs: one layout, each biome fills a subset of the slots ──
RESOURCES = [
    P("tree-a", "Tree A", ["tree"], [[13], [25]]),
    P("tree-b", "Tree B", ["tree"], [[14], [26]]),
    P("tree-c", "Tree C", ["tree"], [[15], [27]]),
    P("tree-d", "Tree D", ["tree"], [[16, 17], [28, 29]]),
    P("tree-e", "Tree E", ["tree"], [[18], [30]]),
    *singles("sprout", "Small plant", ["plant"], [19, 20, 21, 22, 31, 32, 33, 34], layer="structure", weight=0.4),
    P("bush", "Bush", ["plant"], [[37]], layer="structure"),
    P("bushes", "Bushes", ["plant"], [[49]], layer="structure"),
    P("rock-big", "Big rock", ["rock"], [[38, 39], [50, 51]]),
    P("rock", "Rock", ["rock-small"], [[40]], layer="structure"),
    P("rocks", "Rocks", ["rock-small"], [[52]], layer="structure"),
    *singles("ore", "Ore rock", ["rock-small", "ore"], [41, 42, 53, 54], layer="structure", weight=0.5),
    *singles("flower", "Flower", ["plant", "flower"], [43, 44, 45, 46, 55, 56, 57, 58, 67, 68, 69, 70, 79, 80, 81, 82], layer="structure", weight=0.3),
    P("chest", "Chest", ["clutter"], [[61], [73]]),
    P("chest-open", "Open chest", ["clutter"], [[62], [74]]),
    P("chest-big", "Big chest", ["clutter"], [[63, 64], [75, 76]]),
    P("chest-big-open", "Big open chest", ["clutter"], [[65, 66], [77, 78]]),
    P("sign", "Sign", ["sign"], [[85], [97]]),
    P("grave-a", "Gravestone A", ["grave"], [[86], [98]]),
    P("grave-b", "Gravestone B", ["grave"], [[87], [99]]),
    P("grave-c", "Gravestone C", ["grave"], [[88], [100]]),
    P("campfire-unlit", "Unlit campfire", ["clutter"], [[102]], layer="structure"),
    P("campfire", "Campfire", ["fire", "light"], [[91], [103]]),
]
FENCES = [
    P("fence", "Wooden fence", ["fence"], [[61, 62, 63]], kind="stretch", layer="structure", stretch=(1, 1)),
    P("wall", "Stone wall", ["wall"], [[77, 78, 79], [92, 93, 94]]),
    P("pillar", "Stone pillar", ["pillar"], [[76], [91]]),
    *singles("block", "Stone block", ["pillar", "clutter"], [107, 122, 124], layer="structure"),
    P("lantern", "Lantern", ["light"], [[108]], layer="structure"),
    P("ruined-arch", "Ruined arch", ["wall"], [[128, 129, 130], [143, 144, 145]]),
    P("pillar-left", "Broken pillar (left)", ["pillar"], [[131], [146]]),
    P("pillar-right", "Broken pillar (right)", ["pillar"], [[133], [148]]),
]
SOIL = [
    P("soil", "Soil", ["soil"], [[28]], kind="decal", layer="paths"),
    *singles("soil-deco", "Worn soil", ["soil-deco"], [14, 22, 29, 30], kind="decal", layer="paths"),
]
for biome in ["forest", "desert", "tundra", "swamp", "taiga", "cave"]:
    d = f"{T}/fantasy/{biome}_"
    for sheet, specs in [(f"{biome}_ [resources]", RESOURCES), (f"{biome}_ [fencesAndWalls]", FENCES), (f"{biome}Path_", SOIL)]:
        if os.path.exists(f"{d}/{sheet}.png"): build(sheet, f"{d}/{sheet}.png", [biome], specs)
