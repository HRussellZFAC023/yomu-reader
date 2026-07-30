// The dead-code detector's own suppression list, checked against the tree.
//
// .fallowrc.jsonc is where a module goes to stop being reported. That makes it
// the one file in the repo whose rot is invisible by construction: it declared
// scripts/bookwalker-canvas-probe.mjs as an entry point after the file was
// deleted (fallow ignores a missing entry silently), and parked
// src/academy/audio/voice-lines.ts as a not-yet-wired seam while five modules
// imported it normally. Both suppressions read as "known and deliberate".
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

interface FallowConfig {
    entry: string[];
    dynamicallyLoaded: string[];
    ignoreExports: { file: string; exports: string[] }[];
    ignorePatterns: string[];
}

function fallowConfig(): FallowConfig {
    // Line comments only, which is all this file uses.
    const source = readFileSync(path.join(ROOT, '.fallowrc.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gmu, '');
    return JSON.parse(source) as FallowConfig;
}

function typeScriptFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return typeScriptFiles(full);
        if (!/\.ts$/u.test(entry.name) || entry.name.endsWith('.d.ts')) return [];
        return [full];
    });
}

/** Absolute module path -> the files whose static imports resolve to it. */
function staticImporters(): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    for (const file of [...typeScriptFiles(path.join(ROOT, 'src')), ...typeScriptFiles(path.join(ROOT, 'tests'))]) {
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/gu)) {
            const base = path.resolve(path.dirname(file), match[1]);
            const resolved = [`${base}.ts`, path.join(base, 'index.ts'), base]
                .find(candidate => candidate.endsWith('.ts') && existsSync(candidate));
            if (!resolved) continue;
            graph.set(resolved, [...(graph.get(resolved) ?? []), path.relative(ROOT, file)]);
        }
    }
    return graph;
}

describe('.fallowrc.jsonc', () => {
    it('declares only paths that exist', () => {
        const config = fallowConfig();
        const declared = [
            ...config.entry,
            ...config.dynamicallyLoaded,
            ...config.ignoreExports.map(entry => entry.file),
        ].filter(declaredPath => !declaredPath.includes('*'));

        expect(declared.length).toBeGreaterThan(50);
        for (const declaredPath of declared) {
            expect(existsSync(path.join(ROOT, declaredPath)), `.fallowrc.jsonc declares ${declaredPath}, which does not exist`)
                .toBe(true);
        }
    });

    it('parks only modules no static import reaches', () => {
        // `dynamicallyLoaded` means "a real seam the import graph cannot see":
        // a Vite string alias, a service worker, a config-loaded setup file. A
        // module that is imported by name belongs in the graph, where fallow can
        // tell whether its exports are used.
        const importers = staticImporters();
        for (const parked of fallowConfig().dynamicallyLoaded) {
            if (!parked.endsWith('.ts')) continue;
            const named = (importers.get(path.join(ROOT, parked)) ?? []).filter(file => file !== parked);
            expect(named, `${parked} is parked as dynamically loaded, but ${named.length} module(s) import it by name`)
                .toEqual([]);
        }
    });
});
