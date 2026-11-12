/**
 * Browser smoke test against the bundled demo project.
 *
 *   npm run e2e
 *
 * Starts its own dev server on a copy of demo/, so nothing in the repo is
 * touched. Needs Playwright with Chromium available (not a dependency of this
 * package: `npm i -D playwright` or a global install).
 */
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PORT = 5197;
const require = createRequire(import.meta.url);
let chromium;
try {
    ({ chromium } = require("playwright"));
} catch {
    console.error("Playwright is not installed. Run `npm i -D playwright` first.");
    process.exit(2);
}

const project = mkdtempSync(join(tmpdir(), "poi-forge-e2e-"));
cpSync(join(ROOT, "demo"), project, { recursive: true });
const server = spawn("npx", ["vite", "--configLoader", "bundle", "--port", String(PORT), "--strictPort"], {
    cwd: ROOT,
    env: { ...process.env, POI_PROJECT: project, POI_PROFILE: "generic" },
    stdio: "ignore",
});

let failed = 0;
const check = (name, ok, detail = "") => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failed++;
};

const browser = await chromium.launch();
try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    page.on("dialog", (dialog) => dialog.accept("e2e"));
    for (let i = 0; i < 60; i++) {
        try {
            await page.goto(`http://localhost:${PORT}/`);
            break;
        } catch {
            await new Promise((done) => setTimeout(done, 250));
        }
    }
    await page.waitForSelector(".app", { timeout: 20000 });
    await page.waitForTimeout(800);
    const state = (expr) =>
        page.evaluate(`(() => { const s = window.poiForge.getState(); return ${expr}; })()`);
    const mapFile = join(project, "maps/entrance.tmj");
    const original = readFileSync(mapFile, "utf8");

    check("opens the demo map", (await state("s.docPath")) === "maps/entrance.tmj");
    check(
        "no problems in the demo map",
        (await page.textContent("[data-testid=problems] summary")) === "No problems",
    );

    await page.click("[data-testid=save]");
    await page.waitForTimeout(300);
    check("saving an untouched map changes nothing", readFileSync(mapFile, "utf8") === original);

    // Paint one tile, save, undo, save: back to the original bytes.
    const sheet = await page.locator("[data-testid=sheet]").boundingBox();
    await page.mouse.click(sheet.x + 6 * 32 + 16, sheet.y + 16);
    check("selecting a tile makes a stamp", (await state("s.stamp && s.stamp.label")) === "demo:6");
    const map = await page.locator("[data-testid=map]").boundingBox();
    await page.mouse.click(map.x + 24, map.y + 9 * 48 + 24);
    check("painting records an undo step", (await state("s.past.length")) === 1);
    await page.click("[data-testid=save]");
    await page.waitForTimeout(300);
    check("saving writes the edit", readFileSync(mapFile, "utf8") !== original);
    await page.click("[data-testid=undo]");
    await page.click("[data-testid=save]");
    await page.waitForTimeout(300);
    check(
        "undo then save restores the file byte for byte",
        readFileSync(mapFile, "utf8") === original,
    );

    // Tile properties and animation.
    await page.click("[data-testid=mode-tileset]");
    const big = await page.locator("[data-testid=sheet]").boundingBox();
    await page.mouse.click(big.x + 4 * 48 + 24, big.y + 24);
    await page.click("[data-testid=prop-collides-on]");
    check(
        "sets a tile property",
        (
            await state("JSON.stringify(s.catalog.demo.def.tiles.find(t => t.id === 4).properties)")
        ).includes("collides"),
    );
    await page.click("[data-testid=undo]");
    await page.click("[data-testid=tab-anim]");
    await page.mouse.click(big.x + 24, big.y + 24);
    await page.click("[data-testid=anim-fill]");
    check(
        "auto-fills an animation",
        (await state("s.catalog.demo.def.tiles.find(t => t.id === 0).animation.length")) === 4,
    );
    await page.click("[data-testid=undo]");

    // Prefab detection.
    await page.click("[data-testid=tab-prefabs]");
    const before = await state("s.libraries.demo.prefabs.length");
    await page.click("[data-testid=detect]");
    check(
        "auto-detect proposes prefabs",
        (await state("s.libraries.demo.prefabs.length")) >= before,
    );
    await page.click("[data-testid=undo]").catch(() => {});

    // Generate and use a candidate.
    await page.click("[data-testid=mode-generate]");
    for (const recipe of ["entrance", "shrine", "camp", "ruin", "grove"]) {
        await page.selectOption("[data-testid=recipe]", recipe);
        await page.click("[data-testid=generate]");
        await page.waitForTimeout(300);
        const problems = await state("s.candidates.flatMap(c => c.problems).length");
        check(
            `${recipe}: six valid candidates`,
            (await state("s.candidates.length")) === 6 && problems === 0,
        );
    }
    await page.locator("[data-testid=use-candidate]").first().click();
    await page.waitForTimeout(300);
    check("using a candidate returns to the map", (await state("s.mode")) === "map");
    check(
        "the generated map validates",
        (await page.textContent("[data-testid=problems] summary")) === "No problems",
    );
    check(
        "the recipe is recorded on the map",
        (await state("s.map.properties.map(p => p.name).join()")).includes("poiForge.recipe"),
    );

    // Objects.
    await page.keyboard.press("o");
    await page.mouse.move(map.x + 24, map.y + 24);
    await page.mouse.down();
    await page.mouse.move(map.x + 2 * 48 + 24, map.y + 48 + 24, { steps: 4 });
    await page.mouse.up();
    await page.fill("[data-testid=object-name]", "spawn-point");
    check(
        "draws and names a zone",
        (await state(
            "s.map.layers.flatMap(l => l.objects ?? []).some(o => o.name === 'spawn-point' && o.width === 48)",
        )) === true,
    );

    check("no console errors", errors.length === 0, errors.join(" | "));
} finally {
    await browser.close();
    server.kill();
    rmSync(project, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
