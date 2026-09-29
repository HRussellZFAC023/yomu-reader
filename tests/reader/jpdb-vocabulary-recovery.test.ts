import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as http from '../../src/reader/network/http';
import * as publicCache from '../../src/reader/jpdb/jpdb-public-cache';
import { JpdbVocabularyClient, parseJpdbSearchHtml, parseJpdbVocabularyHtml } from '../../src/reader/jpdb/jpdb-vocabulary';

const vocabularyPath = '/vocabulary/1456360/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80';
const vocabularyHtml = `<link rel="canonical" href="https://jpdb.io${vocabularyPath}">
    <div class="result vocabulary">
        <div class="spelling"><a href="${vocabularyPath}"><ruby>読む<rt>よむ</rt></ruby></a></div>
        <div class="subsection-meanings"><div class="description">to read</div></div>
    </div>`;
const examplesHtml = `<link rel="canonical" href="https://jpdb.io${vocabularyPath}">
    <div class="subsection-examples"><div class="example"><span class="sentence">本を読みます。</span>
    <span class="translation">I read a book.</span></div></div>`;

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
}

beforeEach(() => {
    vi.spyOn(publicCache, 'readPublicJpdbCache').mockReturnValue(undefined);
    vi.spyOn(publicCache, 'writePublicJpdbCache').mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('real JPDB vocabulary client recovery', () => {
    it('retains usable partial data when another in-flight failure extends shared backoff', async () => {
        let now = 100_000;
        let recovered = false;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const supplement = deferred<string>();
        const otherRequest = deferred<string>();
        const transport = vi.spyOn(http, 'requestText').mockImplementation(async url => {
            if (url.includes('/1456361/')) return otherRequest.promise;
            if (url.includes('expand=e')) return recovered ? examplesHtml : supplement.promise;
            return `${vocabularyHtml}<a href="${vocabularyPath}?expand=e">More examples</a>`;
        });
        const client = new JpdbVocabularyClient();
        const first = client.lookup(1456360, '読む', 'よむ');
        const other = client.lookup(1456361, '本', 'ほん').catch(error => error);
        await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(3));
        supplement.reject(new Error('JPDB request failed (429)'));
        expect(await first).toMatchObject({ status: 'partial', info: { meanings: ['to read'] } });
        now += 1_000;
        otherRequest.reject(new Error('JPDB request failed (429)'));
        expect(await other).toBeInstanceOf(Error);
        now = 130_001;
        expect(await client.lookup(1456360, '読む', 'よむ')).toMatchObject({ status: 'partial', info: { meanings: ['to read'] } });
        expect(transport).toHaveBeenCalledTimes(3);
        now = 161_001;
        recovered = true;
        expect(await client.lookup(1456360, '読む', 'よむ')).toMatchObject({ status: 'complete', info: {
            examples: [expect.objectContaining({ sentence: '本を読みます。' })],
        } });
        expect(transport).toHaveBeenCalledTimes(5);
    });

    it('deduplicates pending requests and keeps complete results cached', async () => {
        const pending = deferred<string>();
        const transport = vi.spyOn(http, 'requestText').mockReturnValue(pending.promise);
        const client = new JpdbVocabularyClient();
        const first = client.lookup(1456360, '読む', 'よむ');
        const second = client.lookup(1456360, '読む', 'よむ');
        expect(first).toBe(second);
        pending.resolve(vocabularyHtml);
        expect(await first).toMatchObject({ status: 'complete', info: { meanings: ['to read'] } });
        await client.lookup(1456360, '読む', 'よむ');
        expect(transport).toHaveBeenCalledTimes(1);
        expect(publicCache.writePublicJpdbCache).toHaveBeenCalledWith('vocabulary-complete-v2', expect.any(String),
            expect.objectContaining({ status: 'complete' }));
    });

    it('keeps genuine empty responses distinct and expires their negative cache', async () => {
        let now = 100_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const transport = vi.spyOn(http, 'requestText').mockResolvedValue('<p>No results.</p>');
        const client = new JpdbVocabularyClient();
        expect(await client.lookup(1456360, '読む', 'よむ')).toEqual({ info: null, status: 'complete' });
        const calls = transport.mock.calls.length;
        now += 9_999;
        await client.lookup(1456360, '読む', 'よむ');
        expect(transport).toHaveBeenCalledTimes(calls);
        expect(publicCache.writePublicJpdbCache).not.toHaveBeenCalled();
        now += 2;
        transport.mockResolvedValue(vocabularyHtml);
        expect(await client.lookup(1456360, '読む', 'よむ')).toMatchObject({ info: { meanings: ['to read'] } });
        expect(transport).toHaveBeenCalledTimes(calls + 1);
    });

    it.each([false, true])('retries partial supplements without discarding usable data (rate limited: %s)', async rateLimited => {
        let now = 100_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        let recovered = false;
        const transport = vi.spyOn(http, 'requestText').mockImplementation(async url => {
            if (!url.includes('expand=e')) return `${vocabularyHtml}<a href="${vocabularyPath}?expand=e">More examples</a>`;
            if (!recovered) throw new Error(`JPDB request failed (${rateLimited ? 429 : 503})`);
            return examplesHtml;
        });
        const client = new JpdbVocabularyClient();
        expect(await client.lookup(1456360, '読む', 'よむ')).toMatchObject({ info: { meanings: ['to read'], examples: [] }, status: 'partial' });
        expect(publicCache.writePublicJpdbCache).not.toHaveBeenCalled();
        now += rateLimited ? 29_999 : 999;
        expect(await client.lookup(1456360, '読む', 'よむ')).toMatchObject({ status: 'partial' });
        expect(transport).toHaveBeenCalledTimes(2);
        recovered = true;
        now += 2;
        expect(await client.lookup(1456360, '読む', 'よむ')).toMatchObject({
            status: 'complete', info: { examples: [expect.objectContaining({ sentence: '本を読みます。' })] },
        });
        expect(transport).toHaveBeenCalledTimes(4);
        expect(publicCache.writePublicJpdbCache).toHaveBeenCalledTimes(1);
    });

    it('does not let clear bypass an active provider backoff', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(100_000);
        const transport = vi.spyOn(http, 'requestText').mockRejectedValue(new Error('JPDB request failed (429)'));
        const client = new JpdbVocabularyClient();
        await expect(client.search('読む')).rejects.toThrow(/429/);
        client.clear();
        await expect(client.search('読む')).rejects.toThrow(/rate limited/);
        expect(transport).toHaveBeenCalledTimes(1);
    });

    it('fences a pre-clear completion out of persistent and current memory caches', async () => {
        const pending = deferred<string>();
        const transport = vi.spyOn(http, 'requestText').mockReturnValueOnce(pending.promise).mockResolvedValue(vocabularyHtml);
        const client = new JpdbVocabularyClient();
        const stale = client.lookup(1456360, '読む', 'よむ');
        client.clear();
        pending.resolve(vocabularyHtml);
        await expect(stale).rejects.toThrow(/context changed/);
        expect(publicCache.writePublicJpdbCache).not.toHaveBeenCalled();
        expect(await client.lookup(1456360, '読む', 'よむ')).toMatchObject({ status: 'complete' });
        expect(transport).toHaveBeenCalledTimes(2);
        expect(publicCache.writePublicJpdbCache).toHaveBeenCalledTimes(1);
    });

    it('captures proxy identity once and rejects a late result from the old proxy', async () => {
        let proxy = 'https://first-proxy.test/?url=';
        const pending = deferred<string>();
        const transport = vi.spyOn(http, 'requestText').mockReturnValueOnce(pending.promise).mockResolvedValue(vocabularyHtml);
        const client = new JpdbVocabularyClient(() => proxy);
        const stale = client.lookup(1456360, '読む', 'よむ');
        proxy = 'https://second-proxy.test/?url=';
        expect(await client.lookup(1456360, '読む', 'よむ')).toMatchObject({ status: 'complete' });
        pending.resolve(`${vocabularyHtml}<a href="${vocabularyPath}?expand=e">More examples</a>`);
        await expect(stale).rejects.toThrow(/context changed/);
        expect(transport.mock.calls.map(([, options]) => options?.proxyUrl)).toEqual([
            'https://first-proxy.test/?url=', 'https://second-proxy.test/?url=',
        ]);
        expect(publicCache.writePublicJpdbCache).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(vi.mocked(publicCache.writePublicJpdbCache).mock.calls)).not.toContain('proxy.test');
    });

    it('does not qualify old cache entries or malformed new entries as complete results', async () => {
        vi.mocked(publicCache.readPublicJpdbCache).mockImplementation(kind => kind === 'vocabulary'
            ? { meanings: ['stale'], compounds: [], examples: [] }
            : { status: 'complete', info: { meanings: 'invalid' } });
        const transport = vi.spyOn(http, 'requestText').mockResolvedValue(vocabularyHtml);
        const client = new JpdbVocabularyClient();
        expect(await client.lookup(1456360, '読む', 'よむ')).toMatchObject({ info: { meanings: ['to read'] }, status: 'complete' });
        expect(transport).toHaveBeenCalledTimes(1);
        expect(vi.mocked(publicCache.readPublicJpdbCache).mock.calls.map(([kind]) => kind)).toEqual(['vocabulary-complete-v2']);
    });

    it('uses a fixture accepted by the real vocabulary and search parsers', () => {
        expect(parseJpdbVocabularyHtml(vocabularyHtml, '読む', 'よむ')?.meanings).toContain('to read');
        expect(parseJpdbSearchHtml(vocabularyHtml).map(card => card.spelling)).toContain('読む');
    });

    it.each(['compound', 'sentence'] as const)('rejects malformed cached %s rich text', async kind => {
        const info = { meanings: ['stale'], compounds: [], examples: [] };
        const malformed = kind === 'compound'
            ? { ...info, compounds: [{ term: '本', reading: 'ほん', meaning: 'book', url: '/vocabulary/1', termHtml: 42 }] }
            : { ...info, examples: [{ sentence: '本を読みます。', translation: 'I read a book.', sentenceHtml: 42 }] };
        vi.mocked(publicCache.readPublicJpdbCache).mockReturnValue({ info: malformed, status: 'complete' });
        const transport = vi.spyOn(http, 'requestText').mockResolvedValue(vocabularyHtml);
        expect(await new JpdbVocabularyClient().lookup(1456360, '読む', 'よむ'))
            .toMatchObject({ info: { meanings: ['to read'] } });
        expect(transport).toHaveBeenCalledTimes(1);
    });

    it.each(['rid', 'partOfSpeech', 'frequencyRank', 'wordWithReading'] as const)('rejects incomplete cached search cards missing %s', async field => {
        const card = { ...parseJpdbSearchHtml(vocabularyHtml)[0] };
        delete card[field];
        vi.mocked(publicCache.readPublicJpdbCache).mockReturnValue({ cards: [card], status: 'complete' });
        const transport = vi.spyOn(http, 'requestText').mockResolvedValue(vocabularyHtml);
        expect((await new JpdbVocabularyClient().search('読む')).cards.map(value => value.spelling)).toEqual(['読む']);
        expect(transport).toHaveBeenCalledTimes(1);
    });

    it('does not use persistent empty results to suppress a fresh query', async () => {
        vi.mocked(publicCache.readPublicJpdbCache).mockImplementation(kind => kind.startsWith('vocabulary')
            ? { info: null, status: 'complete' } : { cards: [], status: 'complete' });
        const transport = vi.spyOn(http, 'requestText').mockResolvedValue(vocabularyHtml);
        const client = new JpdbVocabularyClient();
        expect(await client.lookup(1456360, '読む', 'よむ')).toMatchObject({ info: { meanings: ['to read'] } });
        expect((await client.search('読む')).cards).toHaveLength(1);
        expect(transport).toHaveBeenCalledTimes(2);
    });

    it('accepts complete results produced by the actual parsers from the qualified cache', async () => {
        vi.mocked(publicCache.readPublicJpdbCache).mockImplementation(kind => kind.startsWith('vocabulary')
            ? { info: parseJpdbVocabularyHtml(vocabularyHtml, '読む', 'よむ'), status: 'complete' }
            : { cards: parseJpdbSearchHtml(vocabularyHtml), status: 'complete' });
        const transport = vi.spyOn(http, 'requestText').mockRejectedValue(new Error('Must use cache'));
        const client = new JpdbVocabularyClient();
        expect(await client.lookup(1456360, '読む', 'よむ')).toMatchObject({ info: { meanings: ['to read'] } });
        expect((await client.search('読む')).cards).toHaveLength(1);
        expect(transport).not.toHaveBeenCalled();
        expect(publicCache.writePublicJpdbCache).not.toHaveBeenCalled();
    });

    it('recovers lookup after the provider backoff rather than retaining its failed null', async () => {
        let now = 100_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const transport = vi.spyOn(http, 'requestText').mockRejectedValue(new Error('JPDB request failed (429)'));
        const client = new JpdbVocabularyClient();
        await expect(client.lookup(1456360, '読む', 'よむ')).rejects.toThrow(/429/);
        expect(transport).toHaveBeenCalledTimes(1);
        now += 29_999;
        await expect(client.lookup(1456360, '読む', 'よむ')).rejects.toThrow(/429|rate limited/);
        expect(transport).toHaveBeenCalledTimes(1);
        now += 2;
        transport.mockResolvedValue(vocabularyHtml);
        expect(await client.lookup(1456360, '読む', 'よむ')).toMatchObject({ info: { meanings: ['to read'] }, status: 'complete' });
        expect(transport).toHaveBeenCalledTimes(2);
    });

    it('recovers search after the provider backoff rather than retaining a failed empty list', async () => {
        let now = 100_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const transport = vi.spyOn(http, 'requestText').mockRejectedValue(new Error('JPDB request failed (429)'));
        const client = new JpdbVocabularyClient();
        await expect(client.search('読む')).rejects.toThrow(/429/);
        expect(transport).toHaveBeenCalledTimes(1);
        now += 30_001;
        transport.mockResolvedValue(vocabularyHtml);
        expect((await client.search('読む')).cards.map(card => card.spelling)).toContain('読む');
        expect(transport).toHaveBeenCalledTimes(2);
    });

    it('does not persist incomplete supplement data as a complete vocabulary result', async () => {
        vi.spyOn(http, 'requestText').mockImplementation(async url => {
            if (url.includes('expand=e')) throw new Error('JPDB request failed (503)');
            return `${vocabularyHtml}<a href="${vocabularyPath}?expand=e">More examples</a>`;
        });
        const client = new JpdbVocabularyClient();
        const { info, status } = await client.lookup(1456360, '読む', 'よむ');
        expect(info?.meanings).toContain('to read');
        expect(status).toBe('partial');
        expect(publicCache.writePublicJpdbCache).not.toHaveBeenCalled();
    });
});
