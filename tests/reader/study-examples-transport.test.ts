import { afterEach, describe, expect, it, vi } from 'vitest';
import * as http from '../../src/reader/network/http';
import { ImmersionKitClient } from '../../src/reader/immersion/kit';
import { StudyExamples } from '../../src/reader/newtab/study-examples';
import type { ReaderSettings } from '../../src/reader/app/types';
import { DEFAULT_SETTINGS, newTabTestCard } from './new-tab-review/fixtures';

const sessions: StudyExamples[] = [];
const firstSentence = '私は中学生です。';
const nextSentence = '妹は中学生になりました。';
function immersionResponse(sentence: string) { return { examples: [{ id: sentence, sentence }] }; }
function nadeshikoResponse(sentence: string) { return { segments: [{ publicId: sentence, textJa: { content: sentence } }] }; }

function fixture(source: ReaderSettings['immersionKitExampleSource']) {
    const settings: ReaderSettings = { ...DEFAULT_SETTINGS, immersionKitEnabled: true,
        immersionKitExampleSource: source, nadeshikoApiKey: 'fixture-first-key',
        immersionKitMinLength: 0, immersionKitShowImages: false, immersionKitAutoPlayAudio: false,
        jpdbDefinitionsEnabled: false };
    const client = new ImmersionKitClient();
    const module = new StudyExamples({ getSettings: () => settings, immersionKit: client,
        parser: { canParse: () => false, parse: async () => [],
            fallbackCardFromText: text => newTabTestCard({ spelling: text }) },
        sentences: { peek: () => undefined, prepare: async () => [], enrich: async () => false, highlight() {} },
    });
    sessions.push(module);
    const card = newTabTestCard({ spelling: '中学生', reading: 'ちゅうがくせい' });
    const mount = document.createElement('div');
    document.body.append(mount);
    const reveal = () => module.present({ card, mount, mode: 'word', revealed: true });
    const expectSentence = (sentence: string) => vi.waitFor(() =>
        expect(mount.querySelector('.jpdb-reader-newtab-immersion')?.textContent).toContain(sentence));
    return { settings, client, module, card, mount, reveal, expectSentence };
}

afterEach(() => {
    sessions.splice(0).forEach(module => module.dispose());
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe('StudyExamples with the real example client', () => {
    it('reveals the fast-first example prepared on the front even when providers later answer differently', async () => {
        let now = 100_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        let recovered = false;
        const transport = vi.spyOn(http, 'requestJson').mockImplementation(async url => {
            if (url.includes('nadeshiko')) {
                if (!recovered) throw new Error('Temporary provider failure');
                return nadeshikoResponse(nextSentence);
            }
            return recovered ? { examples: [] } : immersionResponse(firstSentence);
        });
        const f = fixture('combined');
        const search = vi.spyOn(f.client, 'searchResult');
        f.module.present({ card: f.card, mount: f.mount, mode: 'word', revealed: false });
        f.module.prefetch([f.card]);
        expect((await f.module.examples(f.card)).map(example => example.sentence)).toEqual([firstSentence]);
        expect(search.mock.calls[0]?.[2]).toMatchObject({ fastFirst: true });
        const preparedCalls = transport.mock.calls.length;
        expect(preparedCalls).toBe(2);
        recovered = true;
        now += 2_000;
        f.reveal();
        await f.expectSentence(firstSentence);
        now += 600_000;
        f.reveal();
        await f.expectSentence(firstSentence);
        expect(transport).toHaveBeenCalledTimes(preparedCalls);
        expect(f.mount.textContent).not.toContain(nextSentence);
    });

    it('does not retry a rate-limited card until expiry, then renders recovered results', async () => {
        let now = 100_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const transport = vi.spyOn(http, 'requestJson').mockRejectedValue(new Error('Immersion Kit failed (429)'));
        const f = fixture('immersion-kit');
        f.reveal();
        expect(await f.module.examples(f.card)).toEqual([]);
        expect(transport).toHaveBeenCalledTimes(1);
        expect(f.mount.querySelector('.jpdb-reader-newtab-immersion')).toBeNull();
        now += 999;
        f.reveal();
        expect(await f.module.examples(f.card)).toEqual([]);
        expect(transport).toHaveBeenCalledTimes(1);
        now += 2;
        transport.mockResolvedValue(immersionResponse(nextSentence));
        f.reveal();
        await f.expectSentence(nextSentence);
        expect(transport).toHaveBeenCalledTimes(2);
    });

    it('keeps Nadeshiko available while Immersion Kit is still in its backoff', async () => {
        let now = 100_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const transport = vi.spyOn(http, 'requestJson').mockImplementation(async (url, options) => {
            if (!url.includes('nadeshiko')) throw new Error('Immersion Kit failed (429)');
            const query = (JSON.parse(String(options?.data)) as { query: { search: string } }).query.search;
            return nadeshikoResponse(query === '中学生' ? firstSentence : '兄は高校生になりました。');
        });
        const f = fixture('combined');
        f.reveal();
        await f.expectSentence(firstSentence);
        const immersionKitCalls = () => transport.mock.calls.filter(([url]) => !url.includes('nadeshiko')).length;
        expect(immersionKitCalls()).toBe(1);
        now += 500;
        const other = newTabTestCard({ spelling: '高校生', reading: 'こうこうせい' });
        f.module.present({ card: other, mount: f.mount, mode: 'word', revealed: true });
        await f.expectSentence('兄は高校生になりました。');
        expect(immersionKitCalls()).toBe(1);
        now += 1_001;
        f.reveal();
        await f.expectSentence(firstSentence);
        expect(transport.mock.calls.filter(([url]) => url.includes('nadeshiko'))).toHaveLength(2);
    });

    it('uses the replacement credential and rejects the late result from the old credential', async () => {
        let resolveOld!: (data: unknown) => void;
        const oldResponse = new Promise<unknown>(resolve => { resolveOld = resolve; });
        const transport = vi.spyOn(http, 'requestJson').mockImplementation(async (_url, options) => {
            if (new Headers(options?.headers).get('Authorization') === 'Bearer fixture-first-key') return oldResponse;
            return nadeshikoResponse(nextSentence);
        });
        const f = fixture('nadeshiko');
        f.reveal();
        const oldRead = f.module.examples(f.card);
        await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
        f.settings.nadeshikoApiKey = 'fixture-replacement-key';
        f.reveal();
        await f.expectSentence(nextSentence);
        expect(transport.mock.calls.map(([, options]) => new Headers(options?.headers).get('Authorization')))
            .toEqual(['Bearer fixture-first-key', 'Bearer fixture-replacement-key']);
        resolveOld(nadeshikoResponse(firstSentence));
        expect(await oldRead).toEqual([]);
        expect(f.mount.textContent).toContain(nextSentence);
        expect(f.mount.textContent).not.toContain(firstSentence);
        expect(await f.module.examples(f.card)).toHaveLength(1);
        expect(transport).toHaveBeenCalledTimes(2);
    });
});
