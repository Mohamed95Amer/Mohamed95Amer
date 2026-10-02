// Shared helpers for preview.mjs, qa.mjs and export.mjs.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// index.html is authored as page content (the published artifact wraps it the
// same way), so the local server adds the same minimal document skeleton.
const HEAD =
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
  "<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}" +
  "body{margin:0;font:14px system-ui,sans-serif;background:#fafaf8}img{max-width:100%}[hidden]{display:none!important}</style>" +
  "</head><body>";
const TAIL = "</body></html>";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
};

export function serve(port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/") rel = "/index.html";
    // The published page carries the export under downloads/; locally it is in dist/.
    const file = rel.startsWith("/downloads/")
      ? path.join(ROOT, "dist", rel.slice("/downloads/".length))
      : path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.setHeader("Content-Type", TYPES[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    if (rel === "/index.html") {
      res.end(HEAD + fs.readFileSync(file, "utf8") + TAIL);
    } else {
      fs.createReadStream(file).pipe(res);
    }
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

export function loadPlaywright() {
  const tries = [ROOT, process.cwd()];
  try {
    tries.push(path.join(execSync("npm root -g").toString().trim(), "_"));
  } catch {}
  for (const base of tries) {
    try {
      return createRequire(path.join(base, "noop.js"))("playwright");
    } catch {}
  }
  throw new Error("Playwright not found. Run `npm install` in this folder (it installs playwright).");
}

export async function openReel({ width = 1080, height = 1920, render = true } = {}) {
  const { chromium } = loadPlaywright();
  const { server, port } = await serve();
  const launch = { args: ["--autoplay-policy=no-user-gesture-required", "--font-render-hinting=none"] };
  if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`http://127.0.0.1:${port}/index.html${render ? "?render=1" : ""}`);
  await page.waitForFunction(() => window.__reelReady || window.__reelError, null, { timeout: 60000 });
  const err = await page.evaluate(() => window.__reelError);
  if (err) throw new Error(err);
  return {
    page,
    errors,
    async close() {
      await browser.close();
      server.close();
    },
  };
}
