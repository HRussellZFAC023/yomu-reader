import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

// Follow local static imports from the docs theme/config. This keeps an
// unrelated Reader edit out of the docs render key while including transitive
// shared modules. Data read through fs is declared separately by the stage.
export function dependencyInputs(root, entries) {
    const visited = new Set();
    const pending = [...entries];
    while (pending.length) {
        const file = pending.pop();
        if (visited.has(file)) continue;
        visited.add(file);
        if (!/\.(?:[cm]?[jt]s|vue)$/.test(file)) continue;
        const source = readFileSync(join(root, file), 'utf8');
        const imports = source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"](\.[^'"]+)['"]/g);
        for (const [, specifier] of imports) {
            const base = resolve(root, dirname(file), specifier);
            const target = [base, ...['.ts', '.mts', '.js', '.mjs', '.cjs', '.json', '.vue', '/index.ts', '/index.js'].map(suffix => base + suffix)]
                .find(path => existsSync(path) && statSync(path).isFile());
            if (!target) continue; // Types and virtual imports need no runtime bytes.
            const path = relative(root, target);
            if (path.startsWith('../') || /(^|\/)\.env(?:\.|$)/.test(path)) throw new Error(`Docs dependency outside declared sources: ${specifier}`);
            pending.push(path);
        }
    }
    return [...visited].sort();
}
