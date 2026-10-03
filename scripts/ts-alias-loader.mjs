/**
 * Resolves the "@/..." tsconfig path alias for scripts run directly by
 * `node --experimental-strip-types`, so a test can import application modules
 * written in the repo's normal style instead of reaching for relative paths.
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = join(root, "src", specifier.slice(2));
    for (const candidate of [base, base + ".ts", base + ".tsx", join(base, "index.ts")]) {
      if (existsSync(candidate) && !candidate.endsWith("/")) {
        return next(pathToFileURL(candidate).href, context);
      }
    }
  }
  return next(specifier, context);
}
