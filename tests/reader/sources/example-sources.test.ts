import { describe, expect, it, vi } from 'vitest';

import { LEARNER_LANGUAGE_IDS } from '../../../src/reader/locales/types';
import { decideMediaLicence, licenceFamily } from '../../../src/reader/sources/examples/licence';
import {
    createTatoebaExampleSource,
    tatoebaCapabilitiesFor,
    coverageFor,
} from '../../../src/reader/sources/examples/tatoeba';
import {
    limitedCorpusLanguages,
    languagesWithoutSentenceAudio,
    tatoebaTranslationCode,
    TATOEBA_COVERAGE,
} from '../../../src/reader/sources/examples/tatoeba-coverage';
import {
    createImmersionKitExampleSource,
    immersionExampleToRecord,
    immersionKitCapabilitiesFor,
} from '../../../src/reader/sources/examples/immersion-kit';
import { declaredExampleCapabilities, exampleSourcesForTarget } from '../../../src/reader/sources/examples/registry';
import type { ImmersionKitExample } from '../../../src/reader/immersion/kit';
import type { ExampleRecord } from '../../../src/reader/sources/examples/types';
import {
    TATOEBA_EMPTY_PAYLOAD,
    TATOEBA_SERBO_CROATIAN_PAYLOADS,
    TATOEBA_SPANISH_PAYLOAD,
    TATOEBA_THAI_PAYLOAD,
} from './tatoeba-fixtures';

function sourceWith(payloads: unknown | ((url: string) => unknown)) {
    const urls: string[] = [];
    const source = createTatoebaExampleSource({
        fetchJson: async url => {
            urls.push(url);
            const payload = typeof payloads === 'function' ? (payloads as (url: string) => unknown)(url) : payloads;
            if (payload instanceof Error) throw payload;
            return payload;
        },
    });
    return { source, urls };
}

function search(source: ReturnType<typeof createTatoebaExampleSource>, targetLanguage: string, outputLanguage = 'en') {
    return source.search({
        term: 'agua',
        targetLanguage,
        outputLanguage,
        signal: new AbortController().signal,
    });
}

describe('U46 media licence allowlist', () => {
    it('refuses the licences the sampled Tatoeba audio actually carries', () => {
        // Measured 2026-07-29: 27 of 42 sampled audio rows were CC BY-NC-ND 3.0,
        // 8 stated no licence, 3 were CC BY-NC 4.0 and 4 were CC BY 4.0. If this
        // gate ever softened, Yomu would ship the first three groups.
        expect(decideMediaLicence('CC BY-NC-ND 3.0')).toEqual({ allowed: false, withheld: 'no-derivatives' });
        expect(decideMediaLicence('CC BY-NC 4.0')).toEqual({ allowed: false, withheld: 'non-commercial' });
        expect(decideMediaLicence(undefined)).toEqual({ allowed: false, withheld: 'missing-licence' });
        expect(decideMediaLicence('')).toEqual({ allowed: false, withheld: 'missing-licence' });
        expect(decideMediaLicence('Some studio licence')).toEqual({ allowed: false, withheld: 'unknown-licence' });
    });

    it('accepts open licences whatever their version or jurisdiction port', () => {
        expect(decideMediaLicence('CC BY 4.0')).toMatchObject({ allowed: true, licence: { id: 'CC BY 4.0', commercialUse: true, derivatives: true } });
        expect(decideMediaLicence('CC BY 2.0 FR')).toMatchObject({ allowed: true });
        expect(decideMediaLicence('CC0 1.0')).toMatchObject({ allowed: true });
        expect(decideMediaLicence('CC BY-SA 4.0')).toMatchObject({ allowed: true, licence: { derivatives: true } });
        expect(licenceFamily('CC BY-NC-ND 3.0')).toBe('by-nc-nd');
    });
});

describe('U46 per-language component capability', () => {
    it('gives every one of the 32 configured languages a text source', () => {
        LEARNER_LANGUAGE_IDS.forEach(id => {
            const capabilities = tatoebaCapabilitiesFor(id);
            expect(capabilities.supported, id).toBe(true);
            expect(capabilities.text.availability, id).toBe('available');
        });
    });

    it('names exactly the twelve languages with no open sentence audio', () => {
        // The plan's list, kept as data rather than prose so a future audio
        // snapshot cannot leave the UI promising audio the corpus lost.
        expect([...languagesWithoutSentenceAudio()].sort()).toEqual(
            ['da', 'el', 'fa', 'grc', 'km', 'ko', 'lo', 'mn', 'sh', 'sq', 'tl', 'vi'].sort(),
        );
        languagesWithoutSentenceAudio().forEach(id => {
            expect(tatoebaCapabilitiesFor(id).audio, id).toEqual({
                availability: 'none',
                scope: 'sentence',
                reason: 'no-sentence-audio-source',
            });
        });
    });

    it('never promises audio for a language that has it, only per-item licensing', () => {
        expect(tatoebaCapabilitiesFor('es').audio).toEqual({
            availability: 'per-item',
            scope: 'sentence',
            reason: 'no-licensed-audio',
        });
        expect(tatoebaCapabilitiesFor('en').sentenceAudioRows).toBe(849_774);
    });

    it('reports no sentence-paired image source for any of the 32', () => {
        LEARNER_LANGUAGE_IDS.forEach(id => {
            expect(tatoebaCapabilitiesFor(id).image, id).toEqual({ availability: 'none', reason: 'no-image-source' });
        });
    });

    it('badges the five limited corpora, including Lao at 229 sentences', () => {
        expect([...limitedCorpusLanguages()].sort()).toEqual(['grc', 'km', 'lo', 'mn', 'sq'].sort());
        expect(tatoebaCapabilitiesFor('lo').corpus).toBe('limited');
        expect(tatoebaCapabilitiesFor('lo').text.reason).toBe('limited-corpus');
        expect(tatoebaCapabilitiesFor('es').corpus).toBe('ample');
    });

    it('keeps Japanese on ImmersionKit and off Tatoeba', () => {
        expect(tatoebaCapabilitiesFor('ja').supported).toBe(false);
        expect(tatoebaCapabilitiesFor('ja').reason).toBe('unsupported-target');
        const japanese = immersionKitCapabilitiesFor('ja');
        expect(japanese.supported).toBe(true);
        expect(japanese.text.availability).toBe('available');
        expect(japanese.audio.availability).toBe('available');
        expect(japanese.image.availability).toBe('available');
    });

    it('answers unsupported rather than degrading an unmapped target to English', () => {
        // `resolveLearnerLanguage` falls back to `en`. For an example source that
        // would mean quietly serving English sentences to someone reading
        // something else, so this path is strict.
        expect(coverageFor('sw')).toBeNull();
        expect(tatoebaCapabilitiesFor('sw').supported).toBe(false);
        expect(immersionKitCapabilitiesFor('es').supported).toBe(false);
    });
});

describe('U46 Tatoeba language mapping', () => {
    it('maps every configured language to a Tatoeba code and asks for it', async () => {
        await Promise.all(LEARNER_LANGUAGE_IDS.map(async id => {
            const { source, urls } = sourceWith(TATOEBA_EMPTY_PAYLOAD);
            const collection = await search(source, id);
            // Never `unavailable`: a mapping problem must never look like an
            // outage. Empty is the honest answer for a corpus miss.
            expect(collection.availability, id).toBe('empty');
            expect(urls.length, id).toBe(TATOEBA_COVERAGE[id].codes.length);
            TATOEBA_COVERAGE[id].codes.forEach(code => {
                expect(urls.some(url => url.includes(`lang=${code}`)), `${id} -> ${code}`).toBe(true);
            });
        }));
    });

    it('pins the three deliberate mapping decisions', () => {
        expect(TATOEBA_COVERAGE.zh.codes).toEqual(['cmn']);
        expect(TATOEBA_COVERAGE.fa.codes).toEqual(['pes']);
        expect(TATOEBA_COVERAGE.sh.codes).toEqual(['srp', 'hrv', 'bos']);
        expect(coverageFor('fil')?.id).toBe('tl');
        expect(coverageFor('sr')?.id).toBe('sh');
        expect(coverageFor('zh-Hans')?.id).toBe('zh');
    });

    it('aggregates Serbo-Croatian across three codes and keeps each row its own language', async () => {
        const { source, urls } = sourceWith((url: string) => {
            const code = /lang=([a-z]+)/u.exec(url)?.[1] ?? '';
            return TATOEBA_SERBO_CROATIAN_PAYLOADS[code] ?? TATOEBA_EMPTY_PAYLOAD;
        });
        const collection = await search(source, 'sh');
        expect(urls).toHaveLength(3);
        expect(collection.availability).toBe('loaded');
        expect(collection.items.map((item: ExampleRecord) => item.text.language)).toEqual(['srp', 'hrv', 'bos']);
    });

    it('requests the OUTPUT language as the translation filter, not the interface language', async () => {
        const { source, urls } = sourceWith(TATOEBA_EMPTY_PAYLOAD);
        await search(source, 'es', 'ko-KR');
        expect(urls[0]).toContain('trans%3Alang=kor');
        expect(tatoebaTranslationCode('ja')).toBe('jpn');
        expect(tatoebaTranslationCode('xx-nonsense')).toBeNull();
    });

    it('sends the parameters the API actually requires', async () => {
        const { source, urls } = sourceWith(TATOEBA_EMPTY_PAYLOAD);
        await search(source, 'es');
        // `sort` is mandatory: without it the live API answers 400.
        expect(urls[0]).toContain('sort=relevance');
        // Quoted so the corpus matches the written word, not its letters.
        expect(urls[0]).toContain('q=%22agua%22');
    });
});

describe('U46 Tatoeba record normalisation', () => {
    it('carries text, translation, licence, attribution and quality end to end', async () => {
        const { source } = sourceWith(TATOEBA_SPANISH_PAYLOAD);
        const collection = await search(source, 'es');
        expect(collection.availability).toBe('loaded');
        const [first, second] = collection.items as ExampleRecord[];
        expect(first).toMatchObject({
            id: 'tatoeba:13227432',
            text: { value: '¡Agua!', language: 'spa' },
            translation: { value: 'Water!', language: 'eng', provenance: 'source', direct: true },
            source: {
                name: 'Tatoeba',
                url: 'https://tatoeba.org/en/sentences/show/13227432',
                licence: 'CC BY 2.0 FR',
                attribution: 'Tatoeba — jan_Junipa',
            },
        });
        expect(first?.quality?.reviewed).toBe(true);
        // A pivoted translation is kept and marked, never presented as a direct
        // human pair.
        expect(second?.translation?.direct).toBe(false);
    });

    it('withholds the NC-ND recording and says so instead of showing a dead button', async () => {
        const { source } = sourceWith(TATOEBA_SPANISH_PAYLOAD);
        const collection = await search(source, 'es');
        expect(collection.items.every((item: ExampleRecord) => !item.audio)).toBe(true);
        expect(collection.availability === 'loaded' && collection.withheldMedia).toEqual([
            { kind: 'audio', licence: 'CC BY-NC-ND 3.0', reason: 'no-derivatives' },
        ]);
    });

    it('keeps a CC BY recording with the contributor attribution and the record link', async () => {
        const { source } = sourceWith(TATOEBA_THAI_PAYLOAD);
        const collection = await search(source, 'th');
        const audio = (collection.items as ExampleRecord[])[0]?.audio?.[0];
        expect(audio).toMatchObject({
            kind: 'audio',
            // A sentence reading, never relabelled as word audio.
            scope: 'sentence',
            url: 'https://api.tatoeba.org/v1/audio/987383/file',
            licence: { id: 'CC BY 4.0', commercialUse: true, derivatives: true },
            attribution: 'TonySpeaks (Tatoeba)',
            recordUrl: 'https://tatoeba.org/user/profile/TonySpeaks',
        });
    });

    it('marks Latin audio as a reconstruction rather than a native speaker', async () => {
        const { source } = sourceWith({
            data: [{ id: 9, text: 'Aqua est bona.', lang: 'lat', license: 'CC BY 2.0 FR', owner: 'x', is_unapproved: false, audios: [], translations: [] }],
            paging: {},
        });
        const collection = await search(source, 'la');
        const [record] = collection.items as ExampleRecord[];
        expect(record?.quality?.nativeSpeaker).toBe(false);
        expect(record?.quality?.warnings).toEqual(['reconstructed-pronunciation']);
    });

    it('reports a broken payload as a schema failure, not as an empty corpus', async () => {
        const { source } = sourceWith({ unexpected: true });
        expect(await search(source, 'es')).toEqual({ availability: 'unavailable', items: [], reason: 'schema' });
    });

    it('backs off after a rate limit without firing a second request', async () => {
        const { source, urls } = sourceWith(new Error('Tatoeba examples failed with 429'));
        expect(await search(source, 'es')).toEqual({ availability: 'unavailable', items: [], reason: 'network' });
        expect(await search(source, 'es')).toEqual({ availability: 'unavailable', items: [], reason: 'network' });
        expect(urls).toHaveLength(1);
    });

    it('keeps the sentences that arrived when one code of an aggregate fails', async () => {
        const { source } = sourceWith((url: string) => {
            if (url.includes('lang=bos')) return new Error('network down');
            const code = /lang=([a-z]+)/u.exec(url)?.[1] ?? '';
            return TATOEBA_SERBO_CROATIAN_PAYLOADS[code] ?? TATOEBA_EMPTY_PAYLOAD;
        });
        const collection = await search(source, 'sh');
        expect(collection.availability).toBe('loaded');
        expect(collection.items).toHaveLength(2);
    });

    it('propagates an abort instead of rendering a failure for a lookup the learner left', async () => {
        const controller = new AbortController();
        const source = createTatoebaExampleSource({
            fetchJson: async () => {
                const error = new Error('Aborted');
                error.name = 'AbortError';
                throw error;
            },
        });
        controller.abort();
        await expect(source.search({
            term: 'agua',
            targetLanguage: 'es',
            outputLanguage: 'en',
            signal: controller.signal,
        })).rejects.toThrow('Aborted');
    });
});

describe('U46 ImmersionKit behind the neutral contract', () => {
    const example: ImmersionKitExample = {
        id: 'ik-1',
        provider: 'immersion-kit',
        sentence: '毎日復習する。',
        sentenceWithFurigana: '毎日[まいにち]復習[ふくしゅう]する。',
        translation: 'I review every day.',
        sourceTitle: 'Overprotected Kahoko',
        titleSlug: 'overprotected_kahoko',
        category: 'anime',
        soundFile: 'sound.mp3',
        imageFile: 'frame.webp',
        soundUrl: 'https://example.test/sound.mp3',
        imageUrl: 'https://example.test/frame.webp',
    };

    it('preserves the sentence, the human translation, the clip audio and the frame', () => {
        const record = immersionExampleToRecord(example);
        expect(record.text).toEqual({ value: '毎日復習する。', language: 'ja', script: 'Jpan' });
        expect(record.translation).toMatchObject({ value: 'I review every day.', provenance: 'source', direct: true });
        expect(record.audio?.[0]).toMatchObject({ kind: 'audio', scope: 'sentence', url: 'https://example.test/sound.mp3' });
        expect(record.image?.[0]).toMatchObject({ kind: 'image', scope: 'sentence', url: 'https://example.test/frame.webp' });
        expect(record.source.attribution).toBe('Overprotected Kahoko');
    });

    it('states what its media licence is rather than borrowing a CC label', () => {
        const record = immersionExampleToRecord(example);
        expect(record.audio?.[0]?.licence).toEqual({ id: 'source-hosted media', commercialUse: false, derivatives: false });
        // The CC allowlist would reject it, which is exactly why ImmersionKit
        // media does not travel through that gate.
        expect(decideMediaLicence('source-hosted media').allowed).toBe(false);
    });

    it('refuses a non-Japanese target instead of searching Japanese for it', async () => {
        const searcher = vi.fn(async () => [example]);
        const adapter = createImmersionKitExampleSource(searcher);
        const collection = await adapter.search({
            term: 'agua',
            targetLanguage: 'es',
            outputLanguage: 'en',
            signal: new AbortController().signal,
        });
        expect(collection).toEqual({ availability: 'unsupported', items: [] });
        expect(searcher).not.toHaveBeenCalled();
    });
});

describe('U46 source registry', () => {
    it('registers Tatoeba for the roster and nothing for Japanese', () => {
        expect(exampleSourcesForTarget('es').map(adapter => adapter.id)).toEqual(['tatoeba']);
        expect(exampleSourcesForTarget('ja')).toEqual([]);
        expect(exampleSourcesForTarget('sw')).toEqual([]);
    });

    it('keeps the refusing sources in the capability rows so the UI can show them', () => {
        const rows = declaredExampleCapabilities('es');
        expect(rows.map(row => row.sourceId)).toEqual(['immersion-kit', 'tatoeba']);
        expect(rows[0]?.capabilities.supported).toBe(false);
        expect(rows[1]?.capabilities.supported).toBe(true);
    });
});
