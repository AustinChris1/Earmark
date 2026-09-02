import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base = process.env.SHOT_BASE ?? "http://localhost:3010";
const out = process.env.SHOT_DIR ?? "shots";
const pages = [
  { name: "landing", path: "/", width: 1200, height: 900 },
  { name: "drive", path: "/d/1", width: 430, height: 932 },
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
  for (const p of pages) {
    const ctx = await browser.newContext({
      colorScheme: theme,
      reducedMotion: "reduce",
      viewport: { width: p.width, height: p.height },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${base}${p.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${p.name}-${theme}.png`, fullPage: true });
    console.log(`${p.name}-${theme}: ${errors.length ? `CONSOLE ERRORS: ${errors.join(" | ")}` : "clean"}`);
    await ctx.close();
  }
}
await browser.close();
