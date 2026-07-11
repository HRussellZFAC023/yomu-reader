// Shared loader: bundles the pure-data Academy modules with esbuild and imports them.
// No source bytes are copied; this only reads the typed data graphs the app ships.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const REPO_ROOT = resolve(new URL('../../../', import.meta.url).pathname);

export async function loadAcademyModules(names) {
  const tmp = mkdtempSync(join(tmpdir(), 'acad-audit-'));
  const loaded = {};
  try {
    for (const name of names) {
      const out = join(tmp, `${name}.mjs`);
      await build({
        entryPoints: [join(REPO_ROOT, `src/academy/${name}.ts`)],
        bundle: true,
        format: 'esm',
        platform: 'node',
        outfile: out,
        logLevel: 'silent',
        loader: { '.css': 'empty' },
      });
      loaded[name] = await import(pathToFileURL(out).href);
    }
  } finally {
    // keep tmp until process exit so dynamic imports resolve; cleanup best-effort
    process.on('exit', () => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* noop */ } });
  }
  return loaded;
}

// Deterministic JSON: sorted keys, stable ordering, no timestamps injected by us.
export function stableStringify(value) {
  return JSON.stringify(sortDeep(value), null, 2) + '\n';
}
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
    return out;
  }
  return v;
}
