import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { applyRecommendationShelf, parseRecommendationShelf, prepareDictionaryRelease } from '../../scripts/dictionaries/prepare-release.mjs';

/**
 * config/dictionaries/published/v1/ is a GENERATED snapshot, not hand-written
 * JSON: prepare-release.mjs produces it. The recommendation shelf was widened
 * from the three bilingual starter rows to eight, so the moment the release
 * script copies a pre-release manifest through unchanged, the next regeneration
 * silently ships the narrow shelf again. These tests regenerate the snapshot
 * from the frozen inputs and demand the shipped bytes back.
 */
const PUBLISHED_ROOT = resolve('config/dictionaries/published/v1');
const PRE_RELEASE_ROOT = resolve('config/dictionaries/manifests/v1');
const SHELF_POLICY = resolve('config/dictionaries/recommendation-shelf.v1.json');
const SHELF_ROLES = ['monolingual', 'grammar', 'frequency', 'pronunciation', 'examples'] as const;

const temporaryDirectories: string[] = [];

afterAll(async () => {
    await Promise.all(temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true })));
});

/**
 * The release runs against the catalogue as it stands AFTER the verified
 * connector inventory has been ingested and licence-approved objects promoted —
 * which is exactly the published catalogue. Feeding that back in with the
 * pre-release recommendations reproduces a regeneration without needing the
 * 173-entry connector inventory, which is an operator artefact and not tracked.
 */
async function regenerateRelease(catalogPath: string): Promise<string> {
    const manifestRoot = await mkdtemp(join(tmpdir(), 'yomu-dict-manifests-'));
    const stagingRoot = await mkdtemp(join(tmpdir(), 'yomu-dict-staging-'));
    // assertSafeWorkingDirectory refuses a release directory outside the
    // repository or the user's home, so the output has to live under artifacts/.
    await mkdir(resolve('artifacts'), { recursive: true });
    const releaseRoot = await mkdtemp(resolve('artifacts', 'yomu-dict-release-test-'));
    temporaryDirectories.push(manifestRoot, stagingRoot, releaseRoot);

    await cp(catalogPath, join(manifestRoot, 'catalog.json'));
    await cp(join(PUBLISHED_ROOT, 'languages.json'), join(manifestRoot, 'languages.json'));
    await cp(join(PRE_RELEASE_ROOT, 'recommendations'), join(manifestRoot, 'recommendations'), { recursive: true });
    await writeFile(
        join(stagingRoot, 'acquisition-ledger.v1.json'),
        JSON.stringify({ schemaVersion: 1, artifacts: [], failures: [] }),
        'utf8',
    );

    await prepareDictionaryRelease({ manifestRoot, stagingRoot, releaseRoot, write: true });
    return join(releaseRoot, 'v1', 'recommendations');
}

describe('regenerating the dictionary release keeps the wide recommendation shelf', () => {
    it('reproduces every published recommendation manifest byte for byte', async () => {
        const written = await regenerateRelease(join(PUBLISHED_ROOT, 'catalog.json'));
        const filenames = (await readdir(join(PUBLISHED_ROOT, 'recommendations'))).sort();

        expect(filenames).toHaveLength(32);
        for (const filename of filenames) {
            const regenerated = await readFile(join(written, filename), 'utf8');
            const shipped = await readFile(join(PUBLISHED_ROOT, 'recommendations', filename), 'utf8');

            expect(regenerated, filename).toBe(shipped);
            const roles = JSON.parse(regenerated).dictionaries.map((item: { role: string }) => item.role);
            expect(roles, filename).toHaveLength(8);
            for (const role of SHELF_ROLES) expect(roles, `${filename}/${role}`).toContain(role);
        }
    // Regenerates all 32 published manifests and compares them byte for byte. That is
    // genuinely slow, and under the parallel CI pass it overran the 5s default and read
    // as a failure rather than as work.
    }, 60_000);

    it('leaves a pre-release catalogue on the three starter rows instead of inventing a shelf', async () => {
        const written = await regenerateRelease(join(PRE_RELEASE_ROOT, 'catalog.json'));

        const english = JSON.parse(await readFile(join(written, 'en-ja.json'), 'utf8'));
        expect(english.dictionaries.map((item: { role: string }) => item.role))
            .toEqual(['primary-terms', 'names', 'kanji']);
    });

    it('reads the shelf from the frozen policy rather than a copy inside the script', async () => {
        const policy = JSON.parse(await readFile(SHELF_POLICY, 'utf8'));
        const slots = parseRecommendationShelf(policy);
        const catalog = JSON.parse(await readFile(join(PUBLISHED_ROOT, 'catalog.json'), 'utf8'));
        const source = JSON.parse(await readFile(join(PRE_RELEASE_ROOT, 'recommendations', 'en-ja.json'), 'utf8'));

        expect(slots.map(slot => slot.role)).toEqual([...SHELF_ROLES]);
        expect(applyRecommendationShelf(source, catalog, slots.slice(0, 2)).dictionaries).toHaveLength(5);
        expect(() => parseRecommendationShelf({ ...policy, slots: [] })).toThrow(/at least one slot/);
    });

    it('never promises a translation for a learner language no provider reaches, or for a list with no prose', async () => {
        const written = await regenerateRelease(join(PUBLISHED_ROOT, 'catalog.json'));
        const modeByRole = async (language: string) => {
            const manifest = JSON.parse(await readFile(join(written, `${language}-ja.json`), 'utf8'));
            return new Map<string, string>(
                manifest.dictionaries.map((item: { role: string; translationMode: string }) => [item.role, item.translationMode]),
            );
        };

        const greek = await modeByRole('grc');
        const korean = await modeByRole('ko');
        expect(greek.get('monolingual')).toBe('off');
        expect(greek.get('examples')).toBe('off');
        expect(korean.get('monolingual')).toBe('offer');
        expect(korean.get('examples')).toBe('offer');
        for (const language of ['en', 'grc', 'ko', 'de']) {
            const modes = await modeByRole(language);
            expect(modes.get('frequency'), language).toBe('off');
            expect(modes.get('pronunciation'), language).toBe('off');
        }
    });
});

/**
 * The tests above prove the CHECKED-IN inputs still reproduce the wide shelf.
 * That is one path, and not the one a release actually takes: the real command
 * runs `--inventory` against an operator-supplied connector manifest and
 * acquisition ledger, neither of which is tracked here, so the catalogue the
 * script sees is built fresh every time.
 *
 * applyRecommendationShelf skips any slot the catalogue cannot serve. That skip
 * is correct for exactly one situation — a catalogue with nothing mirrored yet —
 * and silently wrong for every other reason a slot can fail to resolve. Measured
 * against the published catalogue before this guard existed, each case below
 * dropped the shelf from 8 rows to 7 (or, for the per-language one, dropped it
 * for one language only) and the release wrote the narrowed manifests with no
 * error at all. These tests fail if any of those paths can ship again.
 */
interface CatalogEntryJson {
    id: string;
    headwordLanguages?: string[];
    distribution: { state: string; object?: unknown };
    [key: string]: unknown;
}
interface CatalogJson {
    targetLanguage: string;
    entries: CatalogEntryJson[];
    [key: string]: unknown;
}
type ShelfSummary = Awaited<ReturnType<typeof prepareDictionaryRelease>>;

async function regenerate(options: {
    catalog?: (catalog: CatalogJson) => void;
    recommendations?: (directory: string) => Promise<void>;
    write?: boolean;
} = {}): Promise<{ summary: () => Promise<ShelfSummary>; releaseRoot: string }> {
    const manifestRoot = await mkdtemp(join(tmpdir(), 'yomu-dict-durability-m-'));
    const stagingRoot = await mkdtemp(join(tmpdir(), 'yomu-dict-durability-s-'));
    await mkdir(resolve('artifacts'), { recursive: true });
    const releaseRoot = await mkdtemp(resolve('artifacts', 'yomu-dict-durability-r-'));
    temporaryDirectories.push(manifestRoot, stagingRoot, releaseRoot);

    const catalog = JSON.parse(await readFile(join(PUBLISHED_ROOT, 'catalog.json'), 'utf8')) as CatalogJson;
    options.catalog?.(catalog);
    await writeFile(join(manifestRoot, 'catalog.json'), JSON.stringify(catalog), 'utf8');
    await cp(join(PUBLISHED_ROOT, 'languages.json'), join(manifestRoot, 'languages.json'));
    await cp(join(PRE_RELEASE_ROOT, 'recommendations'), join(manifestRoot, 'recommendations'), { recursive: true });
    await options.recommendations?.(join(manifestRoot, 'recommendations'));
    await writeFile(
        join(stagingRoot, 'acquisition-ledger.v1.json'),
        JSON.stringify({ schemaVersion: 1, artifacts: [], failures: [] }),
        'utf8',
    );

    return {
        releaseRoot,
        summary: () => prepareDictionaryRelease({ manifestRoot, stagingRoot, releaseRoot, write: options.write ?? true }),
    };
}

const shelfSlotOf = async (role: string) => {
    const policy = JSON.parse(await readFile(SHELF_POLICY, 'utf8')) as { slots: Array<{ role: string; dictionaryId: string }> };
    const slot = policy.slots.find(candidate => candidate.role === role);
    if (!slot) throw new Error(`the frozen policy no longer declares a ${role} slot`);
    return slot;
};

describe('a regeneration cannot narrow the recommendation shelf by any path', () => {
    it('reports the released stage and a full shelf when nothing is wrong', async () => {
        const summary = await (await regenerate()).summary();

        expect(summary.shelfStage).toBe('released');
        expect(summary.shelfSlotsPerLanguage).toBe(SHELF_ROLES.length);
        expect(summary.shelfRecommendationRows).toBe(SHELF_ROLES.length * 32);
    });

    it('refuses when a shelf title is in the catalogue but no longer mirrored', async () => {
        const slot = await shelfSlotOf('monolingual');
        const run = await regenerate({
            catalog: catalog => {
                const entry = catalog.entries.find(candidate => candidate.id === slot.dictionaryId)!;
                entry.distribution = { state: 'source-only' };
            },
        });

        await expect(run.summary()).rejects.toThrow(/monolingual.*source-only rather than published/s);
    });

    it('refuses when a re-import renames a shelf title out from under the frozen policy', async () => {
        const slot = await shelfSlotOf('grammar');
        const run = await regenerate({
            catalog: catalog => {
                catalog.entries.find(candidate => candidate.id === slot.dictionaryId)!.id = `${slot.dictionaryId}-v2`;
            },
        });

        await expect(run.summary()).rejects.toThrow(/grammar.*no catalogue entry carries that id/s);
    });

    it('refuses when a shelf title stops covering the target language', async () => {
        const slot = await shelfSlotOf('pronunciation');
        const run = await regenerate({
            catalog: catalog => {
                catalog.entries.find(candidate => candidate.id === slot.dictionaryId)!.headwordLanguages = ['en'];
            },
        });

        await expect(run.summary()).rejects.toThrow(/pronunciation.*no longer lists ja in headwordLanguages/s);
    });

    it('refuses when a shelf title disappears from the catalogue entirely', async () => {
        const slot = await shelfSlotOf('examples');
        const run = await regenerate({
            catalog: catalog => {
                catalog.entries = catalog.entries.filter(candidate => candidate.id !== slot.dictionaryId);
            },
        });

        await expect(run.summary()).rejects.toThrow(/examples.*no catalogue entry carries that id/s);
    });

    // The one that a total-row count cannot see: 31 languages keep all eight
    // rows, one drops to seven because its starter already names the shelf
    // title, so applyRecommendationShelf treats the slot as already seeded.
    it('refuses when a single learner language alone loses a shelf role', async () => {
        const slot = await shelfSlotOf('monolingual');
        const run = await regenerate({
            recommendations: async directory => {
                const file = join(directory, 'de-ja.json');
                const manifest = JSON.parse(await readFile(file, 'utf8')) as { dictionaries: Array<{ dictionaryId: string }> };
                manifest.dictionaries[0].dictionaryId = slot.dictionaryId;
                await writeFile(file, JSON.stringify(manifest), 'utf8');
            },
        });

        await expect(run.summary()).rejects.toThrow(/de-ja\.json came out of the release without its monolingual row/);
    });

    it('fails the dry run too, before a single file is written', async () => {
        const slot = await shelfSlotOf('frequency');
        const run = await regenerate({
            write: false,
            catalog: catalog => {
                const entry = catalog.entries.find(candidate => candidate.id === slot.dictionaryId)!;
                entry.distribution = { state: 'source-only' };
            },
        });

        await expect(run.summary()).rejects.toThrow(/frequency.*source-only rather than published/s);
        await expect(readdir(join(run.releaseRoot, 'v1'))).rejects.toThrow(/ENOENT/);
    });

    // The narrow shelf is legitimate in exactly one state, and the guard must
    // not take that away: nothing mirrored yet means nothing to recommend.
    it('still lets a catalogue with nothing mirrored ship the plain starter', async () => {
        const run = await regenerate({
            catalog: catalog => {
                for (const entry of catalog.entries) entry.distribution = { state: 'source-only' };
            },
        });
        const summary = await run.summary();
        const english = JSON.parse(await readFile(join(run.releaseRoot, 'v1/recommendations/en-ja.json'), 'utf8'));

        expect(summary.shelfStage).toBe('pre-release');
        expect(summary.shelfSlotsPerLanguage).toBe(0);
        expect(english.dictionaries.map((item: { role: string }) => item.role)).toEqual(['primary-terms', 'names', 'kanji']);
    });

    // Editing the frozen policy is the last way to lose the shelf, and the only
    // one the shipped-bytes test above would have to catch on its own.
    it('refuses a policy that no longer names a title for every shelf role', async () => {
        const policy = JSON.parse(await readFile(SHELF_POLICY, 'utf8')) as { slots: Array<{ role: string }> };

        for (const role of SHELF_ROLES) {
            const narrowed = { ...policy, slots: policy.slots.filter(slot => slot.role !== role) };
            expect(() => parseRecommendationShelf(narrowed), role).toThrow(new RegExp(`missing a title for ${role}`));
        }
        expect(parseRecommendationShelf(policy)).toHaveLength(SHELF_ROLES.length);
    });
});
