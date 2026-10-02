// Build the published preview: same page, fonts inlined as data URIs because
// the artifact viewer only loads fonts from Google Fonts or data: URIs.
// Scripts and the brand photo are published alongside it unchanged.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./common.mjs";

const OUT = path.join(ROOT, "build", "artifact");
fs.mkdirSync(OUT, { recursive: true });
let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
html = html.replace(/url\("(assets\/fonts\/[^"]+\.woff2)"\)/g, (_, rel) => {
  const b64 = fs.readFileSync(path.join(ROOT, rel)).toString("base64");
  return `url("data:font/woff2;base64,${b64}")`;
});
fs.writeFileSync(path.join(OUT, "index.html"), html);
console.log("wrote", path.relative(ROOT, path.join(OUT, "index.html")), (html.length / 1024).toFixed(0) + " KB");
