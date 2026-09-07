// Renders icon.html to a 1024x1024 PNG with headless Chromium.
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(here, "AppIcon-1024.png");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
await page.goto("file:///" + path.join(here, "icon.html").replace(/\\/g, "/"));
await page.evaluate(async () => { await document.fonts.load("900 600px Fraunces"); await document.fonts.ready; });
await page.waitForTimeout(300);
await page.locator("#icon").screenshot({ path: out, omitBackground: false });
await browser.close();
console.log("wrote", out);
