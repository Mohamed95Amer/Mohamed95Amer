/**
 * The alias loader, plus substitution of specific modules for test stubs.
 * Used by the route tests so a handler can run without a database.
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const scripts = dirname(fileURLToPath(import.meta.url));
const root = join(scripts, "..");

const SUBSTITUTE = {
  "@/lib/supabase/server": join(scripts, "stubs", "supabase.ts"),
};

export function resolve(specifier, context, next) {
  // Next ships these as ESM without extensionless entry points, which plain
  // node will not resolve the way the bundler does.
  if (specifier === "next/server") return next("next/server.js", context);

  const substitute = SUBSTITUTE[specifier];
  if (substitute) return next(pathToFileURL(substitute).href, context);

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
