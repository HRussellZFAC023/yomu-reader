/**
 * `injectedPagePreferenceSource` builds a page-realm `<script>` by
 * `.toString()`-ing a list of module functions. Those functions execute in the
 * PAGE realm with only the prelude the builder emits — so a reference to
 * anything this module imported is a guaranteed ReferenceError over there.
 *
 * The failure is close to invisible. Adding one helper call inside
 * `restoreJapanesePreferences` produced
 * `ReferenceError: __vite_ssr_import_5__ is not defined` from jsdom's script
 * evaluator, which Vitest reports as an *unhandled error* rather than a test
 * failure: all 524 test files passed, tests/reader/preferred-site-language.test.ts
 * stayed green, and only the process exit code (1, under an all-passing summary)
 * gave it away.
 *
 * So the invariant gets a static guard: no serialized function may name an
 * imported binding.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SOURCE_PATH = path.join(ROOT, 'src/reader/app/preferred-site-language-impl.ts');
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');
const CANVAS_MIRROR_PATH = path.join(ROOT, 'src/reader/ocr/canvas-mirror.ts');
const CANVAS_MIRROR = readFileSync(CANVAS_MIRROR_PATH, 'utf8');

/** Named bindings imported at the top of the module, which the page realm lacks. */
function importedBindings(source: string): string[] {
    const names = new Set<string>();
    for (const match of source.matchAll(/^import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'[^']+';/gm)) {
        for (const clause of match[1].split(',')) {
            const name = clause.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim();
            if (name) names.add(name);
        }
    }
    for (const match of source.matchAll(/^import\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s+from\s+'[^']+';/gm)) {
        names.add(match[1]);
    }
    return [...names];
}

/** Function names the injected-source builder serializes with `.toString()`. */
function serializedFunctionNames(source: string): string[] {
    const builder = functionBody(source, 'injectedPagePreferenceSource');
    return [...builder.matchAll(/\$\{([A-Za-z_$][\w$]*)\.toString\(\)\}/g)].map(match => match[1]);
}

function functionBody(source: string, name: string): string {
    const signature = new RegExp(`function ${name}\\s*[(<]`).exec(source);
    if (!signature) throw new Error(`${name} not found in ${SOURCE_PATH}`);
    const open = source.indexOf('{', source.indexOf(')', signature.index));
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        else if (source[index] === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(open + 1, index);
        }
    }
    throw new Error(`Unbalanced braces in ${name}`);
}

describe('page-realm injected source', () => {
    const imported = importedBindings(SOURCE);
    const serialized = serializedFunctionNames(SOURCE);

    it('serializes the expected set of page-realm functions', () => {
        // A guard over the guard: if the builder stops serializing functions the
        // rest of this file silently passes on an empty set.
        expect(serialized.length).toBeGreaterThanOrEqual(8);
        expect(serialized).toContain('applyJapanesePreferencesInPage');
        expect(serialized).toContain('restoreJapanesePreferences');
        expect(imported.length).toBeGreaterThan(0);
    });

    // The one sanctioned way to name a module import inside a serialized
    // function is behind a `typeof binding === 'function'` guard wrapped in
    // try/catch — see crossRealmDescriptor. `typeof` on a free identifier does
    // not throw, and the catch covers the bundled form where the reference
    // becomes a property read on an undefined import namespace.
    it.each(serialized)('%s references no unguarded imported binding', name => {
        const body = functionBody(SOURCE, name);
        const unguarded = imported.filter(binding => new RegExp(`\\b${binding}\\s*[(.]`).test(body)
            && !new RegExp(`typeof\\s+${binding}\\b`).test(body));
        expect(unguarded).toEqual([]);
    });

    // recorderBootstrap in canvas-mirror.ts is the OTHER .toString()-serialized
    // page-realm function ("Must reference ONLY its parameters"). The nightly
    // BookWalker smoke caught six helper calls shipping inside it as
    // `ReferenceError: attemptVoid is not defined` in every engine.
    it('recorderBootstrap references no unguarded imported binding', () => {
        expect(CANVAS_MIRROR).toMatch(/recorderBootstrap\.toString\(\)/);
        const body = functionBody(CANVAS_MIRROR, 'recorderBootstrap');
        const unguarded = importedBindings(CANVAS_MIRROR)
            .filter(binding => new RegExp(`\\b${binding}\\s*[(.]`).test(body)
                && !new RegExp(`typeof\\s+${binding}\\b`).test(body));
        expect(unguarded).toEqual([]);
    });
});
