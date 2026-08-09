// The hosted Academy shell busts its cache with a revision hashed from the
// bytes it publishes. Nothing verified that number until scripts/check-committed
// -artifacts.mjs learned to recompute it from the commit, and recomputing it is
// only possible because every input has a committed counterpart -- the property
// these tests pin, since it is one careless entry in the source list away from
// being false again.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .cjs script module without type declarations
import academyRevisionModule from '../../scripts/lib/academy-revision.cjs';

const {
    HOSTED_COUNTERPARTS,
    HOSTED_DEPENDENCIES,
    REVISION_PATTERN,
    TEMPLATES,
    academyRevision,
    academyRevisionSourcePaths,
} = academyRevisionModule as {
    HOSTED_COUNTERPARTS: Map<string, string>;
    HOSTED_DEPENDENCIES: string[];
    REVISION_PATTERN: RegExp;
    TEMPLATES: [string, string][];
    academyRevision: (sourcePaths: string[], entries: (source: string) => Iterable<[string, Buffer]>) => string;
    academyRevisionSourcePaths: (readJson: (path: string) => unknown) => string[];
};

const REPOSITORY_ROOT = process.cwd();

// The source list is built from the two voice catalogs; which revision of them
// is irrelevant here, so read the checked-out copy rather than shelling to git.
function readJson(path: string): unknown {
    return JSON.parse(readFileSync(join(REPOSITORY_ROOT, path), 'utf8'));
}

/** Hash a source set from a fixture, one file per source. */
function revisionOf(bytesBySource: Record<string, string>): string {
    const sources = Object.keys(bytesBySource).sort();
    return academyRevision(sources, source => [[source, Buffer.from(bytesBySource[source])]]);
}

describe('academy revision source set', () => {
    it('can be recomputed from committed bytes alone', () => {
        // THE reproducibility invariant. dist/ is not in git, so any source
        // that lives there must name the committed file the sync copies it to;
        // otherwise check:artifacts would have to rebuild to check the stamp,
        // and a rebuild on a different dependency tree computes a different
        // number -- exactly the confusion that made this revision look
        // unverifiable.
        const withoutCommittedBytes = academyRevisionSourcePaths(readJson).filter(source => {
            if (HOSTED_COUNTERPARTS.has(source)) return false;
            return !source.startsWith('public/') && !source.startsWith('docs/public/');
        });

        expect(withoutCommittedBytes).toEqual([]);
    });

    it('names every counterpart under the hosted Academy route the sync writes', () => {
        // The counterpart has to be the file the sync copies the source to, or
        // the recomputed hash reads bytes that were never published.
        for (const [source, counterpart] of HOSTED_COUNTERPARTS) {
            expect(source.startsWith('dist/academy/')).toBe(true);
            expect(counterpart).toBe(source.replace('dist/academy/', 'docs/public/academy/'));
        }
    });

    it('hashes the canonical hosted runtime graph the shell loads', () => {
        // A student on a cached shell against a new runtime graph is the bug
        // this half of the source set exists to prevent.
        const sources = academyRevisionSourcePaths(readJson);

        for (const dependency of HOSTED_DEPENDENCIES) expect(sources).toContain(dependency);
        expect(sources).toEqual([...sources].sort());
    });

    it('renders both cache-busting templates', () => {
        expect(TEMPLATES.map(([, target]) => target)).toEqual(['index.html', 'sw.js']);
    });
});

describe('academy revision digest', () => {
    it('is a short prefixed sha256, which is what the templates match on', () => {
        const revision = revisionOf({ 'dist/academy/app.js': 'bundle' });

        expect(revision).toMatch(new RegExp(`^${REVISION_PATTERN.source}$`));
    });

    it('moves when any published byte moves', () => {
        const before = revisionOf({ 'dist/academy/app.js': 'bundle', 'docs/public/yomu.css': 'a{}' });
        const after = revisionOf({ 'dist/academy/app.js': 'bundle', 'docs/public/yomu.css': 'a{ }' });

        expect(after).not.toBe(before);
    });

    it('moves when a file is renamed but its bytes are not', () => {
        // Paths are hashed alongside contents, so a moved asset still busts the
        // cache even though every byte it contains is unchanged.
        const before = revisionOf({ 'public/academy/art/a.png': 'pixels' });
        const after = revisionOf({ 'public/academy/art/b.png': 'pixels' });

        expect(after).not.toBe(before);
    });

    it('does not confuse a source boundary, so two files cannot swap bytes unnoticed', () => {
        const before = revisionOf({ 'public/academy/a.json': '12', 'public/academy/b.json': '3' });
        const after = revisionOf({ 'public/academy/a.json': '1', 'public/academy/b.json': '23' });

        expect(after).not.toBe(before);
    });

    it('computes the formula the committed shells were stamped with', () => {
        // A frozen vector, because this digest is not free to change: every
        // revision already stamped into a committed index.html and sw.js was
        // produced by this exact byte layout (label, NUL, contents, NUL), and
        // the gate compares recomputed numbers against those. Change the
        // formula and every hosted shell in git reads as stale.
        expect(revisionOf({ 'public/academy/a.json': '12', 'public/academy/b.json': '3' })).toBe('s1-b07ff61202b9');
    });
});
