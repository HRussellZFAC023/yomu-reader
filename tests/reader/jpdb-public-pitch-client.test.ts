import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as http from '../../src/reader/network/http';
import * as publicCache from '../../src/reader/jpdb/jpdb-public-cache';
import { JpdbPublicPitchClient } from '../../src/reader/jpdb/jpdb-public-pitch-client';

// One jpdb.io search result: 復習 (ふくしゅう), heiban.
const FUKUSHUU = `<link rel="canonical" href="https://jpdb.io/vocabulary/1496740/%E5%BE%A9%E7%BF%92/%E3%81%B5%E3%81%8F%E3%81%97%E3%82%85%E3%81%86">
    <div class="result vocabulary">
        <a href="/vocabulary/1496740/%E5%BE%A9%E7%BF%92/%E3%81%B5%E3%81%8F%E3%81%97%E3%82%85%E3%81%86#a">復習</a>
        <div class="subsection-pitch-accent"><div class="subsection"><div><div>
            <div style="background-image: linear-gradient(to top,var(--pitch-low-s),var(--pitch-low-e));"><div>ふ</div></div>
            <div style="background-image: linear-gradient(to bottom,var(--pitch-high-s),var(--pitch-high-e));"><div>くしゅう</div></div>
        </div></div></div></div>
    </div>`;
const NO_RESULTS = '<div class="results search"></div>';

const queryOf = (url: string) => new URL(url).searchParams.get('q');

beforeEach(() => {
    vi.spyOn(publicCache, 'readPublicJpdbCache').mockReturnValue(undefined);
    vi.spyOn(publicCache, 'writePublicJpdbCache').mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('JpdbPublicPitchClient', () => {
    it('fetches one search page per query string, whichever word asks for it', async () => {
        const transport = vi.spyOn(http, 'requestText').mockImplementation(async url => queryOf(url) === 'ふくしゅう' ? FUKUSHUU : NO_RESULTS);
        const client = new JpdbPublicPitchClient();

        expect(await client.lookup('ふくしゅう', 'ふくしゅう')).toEqual(['LHHH']);
        // 復讐 finds nothing under its spelling, then reads the ふくしゅう page already fetched.
        await client.lookup('復讐', 'ふくしゅう');

        expect(transport.mock.calls.map(([url]) => queryOf(url))).toEqual(['ふくしゅう', '復讐']);
    });

    it('keeps an answered empty lookup, so a later page does not ask again', async () => {
        vi.spyOn(http, 'requestText').mockResolvedValue(NO_RESULTS);
        const client = new JpdbPublicPitchClient();

        expect(await client.lookup('未知語', 'みちご')).toEqual([]);

        expect(publicCache.writePublicJpdbCache).toHaveBeenCalledWith('pitch', '未知語\nみちご', []);
    });

    it('reads a stored empty answer without a request', async () => {
        vi.mocked(publicCache.readPublicJpdbCache).mockReturnValue([]);
        const transport = vi.spyOn(http, 'requestText').mockResolvedValue(FUKUSHUU);

        expect(await new JpdbPublicPitchClient().lookup('未知語', 'みちご')).toEqual([]);
        expect(transport).not.toHaveBeenCalled();
    });

    it('does not keep a lookup a failed request left unanswered', async () => {
        vi.spyOn(http, 'requestText').mockRejectedValue(new Error('Network down'));

        expect(await new JpdbPublicPitchClient().lookup('復習', 'ふくしゅう')).toEqual([]);
        expect(publicCache.writePublicJpdbCache).not.toHaveBeenCalled();
    });
});
