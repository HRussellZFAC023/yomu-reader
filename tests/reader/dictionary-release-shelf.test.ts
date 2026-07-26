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
    });

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
