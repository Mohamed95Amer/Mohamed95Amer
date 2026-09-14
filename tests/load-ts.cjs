// Small test-only TS loader using the compiler already installed in this repo.
// Tests execute the actual source and can replace external service boundaries.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function createLoader(overrides = {}) {
  const cache = new Map();
  function load(filename) {
    const absolute = path.resolve(root, filename);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const module = { exports: {} };
    cache.set(absolute, module);
    const nativeRequire = createRequire(absolute);
    function localRequire(id) {
      if (Object.hasOwn(overrides, id)) return overrides[id];
      if (id.startsWith('@/') || id.startsWith('.')) {
        const resolved = id.startsWith('@/')
          ? path.join(root, 'src', id.slice(2))
          : path.resolve(path.dirname(absolute), id);
        for (const candidate of [resolved, `${resolved}.ts`, `${resolved}.tsx`]) {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return load(candidate);
        }
      }
      return nativeRequire(id);
    }
    const { outputText } = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: absolute,
    });
    const run = vm.runInThisContext(`(function(require, module, exports) { ${outputText}\n})`, { filename: absolute });
    run(localRequire, module, module.exports);
    return module.exports;
  }
  return load;
}

module.exports = { createLoader };
