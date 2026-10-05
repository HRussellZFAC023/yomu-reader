import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    SLICE1_LEARNER_LANGUAGES,
    SLICE1_TARGET_LANGUAGES,
    assertDictionaryObjectIntegrity,
    assertRecommendationReferencesCatalog,
    dictionaryObjectKey,
    dictionaryRecommendationFilename,
    parseDictionaryCatalogManifest,
    parseDictionaryLanguageManifest,
    parseDictionaryRecommendationManifest,
    parseDictionaryRecommendationFilename,
    sha256FromDictionaryObjectKey,
    verifyDictionaryObject,
} from '../../src/reader/dictionaries/catalog';

const MANIFEST_ROOT = resolve(process.cwd(), 'config/dictionaries/manifests/v1');
const PUBLISHED_ROOT = resolve(process.cwd(), 'config/dictionaries/published/v1');

async function json(path: string): Promise<unknown> {
    return JSON.parse(await readFile(path, 'utf8'));
}

describe('dictionary catalogue manifests', () => {
    it('freezes exactly the approved 32 learner languages in their canonical order', async () => {
        const manifest = parseDictionaryLanguageManifest(await json(resolve(MANIFEST_ROOT, 'languages.json')));

        expect(manifest.count).toBe(32);
        expect(manifest.targetLanguage).toBe('ja');
        expect(manifest.languages.map(language => language.tag)).toEqual([...SLICE1_LEARNER_LANGUAGES]);
        expect(manifest.languages.find(language => language.tag === 'zh')?.defaultScript).toBe('Hans');
        expect(manifest.languages.filter(language => language.direction === 'rtl').map(language => language.tag)).toEqual(['ar', 'fa']);
    });

    it('keeps the packaged runtime projection complete and materially smaller', async () => {
        const published = await json(resolve(PUBLISHED_ROOT, 'catalog.json')) as {
            revision: string;
            entries: Array<{ id: string }>;
        };
        const runtime = await json(resolve(PUBLISHED_ROOT, 'runtime-catalog.json')) as {
            revision: string;
            entries: Array<[string, ...unknown[]]>;
        };
        const publishedBytes = (await stat(resolve(PUBLISHED_ROOT, 'catalog.json'))).size;
        const runtimeBytes = (await stat(resolve(PUBLISHED_ROOT, 'runtime-catalog.json'))).size;

        expect(runtime.revision).toBe(published.revision);
        expect(runtime.entries.map(entry => entry[0])).toEqual(published.entries.map(entry => entry.id));
        expect(runtimeBytes).toBeLessThan(publishedBytes / 2);
    });

    // Recorded from each mirrored archive's own index.json (audited 2026-10-04).
    it('projects the archive revision only for the seed-card families that compare it', async () => {
        const published = await json(resolve(PUBLISHED_ROOT, 'catalog.json')) as {
            entries: Array<{ id: string; distribution: { state: string; object?: { revision?: string } } }>;
        };
        const runtime = await json(resolve(PUBLISHED_ROOT, 'runtime-catalog.json')) as { entries: unknown[][] };
        const recorded = new Map(published.entries.map(entry => [entry.id, entry.distribution.object?.revision]));
        const revisions = new Map(runtime.entries.filter(entry => entry.length > 9).map(entry => [entry[0] as string, entry[9]]));
        const projected = /^(jmdict-|jmnedict$|kanjidic-)/u;

        // An index.json may declare no revision; these families' archives all do.
        expect(published.entries.filter(entry =>
            projected.test(entry.id) && entry.distribution.state === 'published' && !recorded.get(entry.id))).toEqual([]);
        for (const [id, revision] of revisions) expect(revision, id).toBe(recorded.get(id));
        expect(revisions.get('jmdict-en')).toBe('JMdict.2026-07-23');
        expect(revisions.get('jmnedict')).toBe('JMnedict.2026-07-23');
        // Not the catalogue's "2026-07-23": KANJIDIC numbers the days of a year.
        expect(revisions.get('kanjidic-en')).toBe('kanjidic2.2026-204');
        // Drive copies record theirs too, but their seed cards rely on title tokens.
        for (const id of ['drive-japanese-ja-ja-ukmi3vhk6', 'drive-japanese-ja-freq-jpdb-v2-2-frequency-kana-2024-10-13-p5yytox4s0']) {
            expect(recorded.get(id), id).toBeTruthy();
            expect(revisions.has(id), id).toBe(false);
        }
        expect([...revisions.keys()].filter(id => !projected.test(id))).toEqual([]);
    });

    it('ships one valid, catalogue-linked recommendation manifest per learner-target pair', async () => {
        const catalog = parseDictionaryCatalogManifest(await json(resolve(MANIFEST_ROOT, 'catalog.json')));
        const files = (await readdir(resolve(MANIFEST_ROOT, 'recommendations')))
            .filter(filename => filename.endsWith('.json'))
            .sort();

        expect(files).toHaveLength(32 * 33);
        for (const targetLanguage of SLICE1_TARGET_LANGUAGES) {
            for (const learnerLanguage of SLICE1_LEARNER_LANGUAGES) {
                const filename = dictionaryRecommendationFilename(learnerLanguage, targetLanguage);
                expect(parseDictionaryRecommendationFilename(filename)).toEqual({ learnerLanguage, targetLanguage });
                const recommendation = parseDictionaryRecommendationManifest(
                    await json(resolve(MANIFEST_ROOT, 'recommendations', filename)),
                );
                expect(recommendation).toMatchObject({ learnerLanguage, targetLanguage });
                expect(() => assertRecommendationReferencesCatalog(recommendation, catalog)).not.toThrow();
            }
        }
    }, 30_000);

    it('selects Spanish-headword terms and IPA using the deterministic learner-first ranking', async () => {
        const english = parseDictionaryRecommendationManifest(
            await json(resolve(PUBLISHED_ROOT, 'recommendations/en-es.json')),
        );
        const spanish = parseDictionaryRecommendationManifest(
            await json(resolve(PUBLISHED_ROOT, 'recommendations/es-es.json')),
        );

        expect(english.dictionaries).toEqual([
            expect.objectContaining({ dictionaryId: 'wty-es-en', role: 'primary-terms', priority: 10 }),
            expect.objectContaining({ dictionaryId: 'wty-es-en-ipa', role: 'pronunciation', priority: 20 }),
        ]);
        expect(spanish.dictionaries).toEqual([
            expect.objectContaining({ dictionaryId: 'wty-es-es', role: 'primary-terms', priority: 10 }),
            expect.objectContaining({ dictionaryId: 'wty-es-es-ipa', role: 'pronunciation', priority: 20 }),
        ]);
    });

    it('keeps non-native fallback dictionaries explicit and opt-in for translation', async () => {
        const korean = parseDictionaryRecommendationManifest(
            await json(resolve(MANIFEST_ROOT, 'recommendations/ko-ja.json')),
        );
        const english = parseDictionaryRecommendationManifest(
            await json(resolve(MANIFEST_ROOT, 'recommendations/en-ja.json')),
        );

        expect(korean.dictionaries[0]).toMatchObject({
            dictionaryId: 'jmdict-en',
            role: 'fallback-terms',
            translationMode: 'offer',
        });
        expect(english.dictionaries[0]).toMatchObject({
            dictionaryId: 'jmdict-en',
            role: 'primary-terms',
            translationMode: 'off',
        });
    });

    it('rejects a published object whose key is not addressed by its SHA-256', async () => {
        const input = await json(resolve(MANIFEST_ROOT, 'catalog.json')) as Record<string, unknown>;
        const invalid = structuredClone(input) as { entries: Array<Record<string, unknown>> };
        invalid.entries[0].distribution = {
            state: 'published',
            object: {
                key: `objects/sha256/${'a'.repeat(64)}.zip`,
                sha256: 'b'.repeat(64),
                bytes: 42,
                contentType: 'application/zip',
            },
        };

        expect(() => parseDictionaryCatalogManifest(invalid)).toThrow(/content-addressed/);
    });

    it('builds and verifies content-addressed dictionary objects', async () => {
        const data = new TextEncoder().encode('verified dictionary fixture');
        const expected = 'ff225c3bb266a9c333b4a41855df2549dd519f42fec1eeec24e3f618745c6d4a';
        const key = dictionaryObjectKey(expected);

        expect(key).toBe(`objects/sha256/${expected}.zip`);
        expect(sha256FromDictionaryObjectKey(key)).toBe(expected);
        await expect(verifyDictionaryObject(data, expected)).resolves.toBe(true);
        await expect(verifyDictionaryObject(data, '0'.repeat(64))).resolves.toBe(false);
        await expect(assertDictionaryObjectIntegrity(data, {
            sha256: expected,
            bytes: data.byteLength,
        })).resolves.toBeUndefined();
        await expect(assertDictionaryObjectIntegrity(data, {
            sha256: expected,
            bytes: data.byteLength + 1,
        })).rejects.toThrow(/size mismatch/);
        await expect(assertDictionaryObjectIntegrity(data, {
            sha256: '0'.repeat(64),
            bytes: data.byteLength,
        })).rejects.toThrow(/SHA-256 mismatch/);
    });
});
