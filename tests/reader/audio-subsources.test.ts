import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAudioCandidates } from '../../src/reader/audio/player';
import { detectCustomJsonAudioSubSources, namedAudioSubSources } from '../../src/reader/audio/candidates';
import { mergeAudioSubSources, renderAudioSourceEditor } from '../../src/reader/settings/form-editors';
import { readAudioSources } from '../../src/reader/settings/form-read';
import { normalizeAudioSources } from '../../src/reader/settings/index';
import type { AudioSourceSetting, JPDBCard } from '../../src/reader/app/types';

const HOSTED_URL = 'https://audio.yomureader.com/?term={term}&reading={reading}';
const CLIP_URL = 'https://audio.yomureader.com/audio/clips/nihon-1.mp3';
const JPOD_URL = 'https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?kanji=%E6%97%A5%E6%9C%AC&kana=%E3%81%AB%E3%81%BB%E3%82%93';

const AGGREGATOR_RESPONSE = {
    type: 'audioSourceList',
    audioSources: [
        { name: 'Yomu audio', url: CLIP_URL },
        { name: 'jpod', url: JPOD_URL },
    ],
};

function testCard(): JPDBCard {
    return { vid: 0, sid: 0, spelling: '日本', reading: 'にほん' } as unknown as JPDBCard;
}

function hostedSource(overrides: Partial<AudioSourceSetting> = {}): AudioSourceSetting {
    return { type: 'custom-json', url: HOSTED_URL, voice: '', enabled: true, ...overrides };
}

function stubAggregatorFetch(payload: unknown = AGGREGATOR_RESPONSE): void {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    })));
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('audio aggregator sub-sources', () => {
    it('extracts named sub-sources from audioSourceList responses', () => {
        expect(namedAudioSubSources(AGGREGATOR_RESPONSE)).toEqual([
            { name: 'Yomu audio', url: CLIP_URL },
            { name: 'jpod', url: JPOD_URL },
        ]);
        expect(namedAudioSubSources({ audioSources: ['not-an-entry', { url: CLIP_URL }] })).toEqual([]);
        expect(namedAudioSubSources(null)).toEqual([]);
    });

    it('keeps every named clip when no sub-source is disabled', async () => {
        stubAggregatorFetch();
        await expect(getAudioCandidates(hostedSource(), testCard(), 1000, '')).resolves.toEqual([
            { url: CLIP_URL, sourceUrl: expect.stringContaining('audio.yomureader.com') },
            { url: JPOD_URL, sourceUrl: expect.stringContaining('audio.yomureader.com') },
        ]);
    });

    it('drops clips from disabled sub-sources, matching names case-insensitively', async () => {
        stubAggregatorFetch();
        const source = hostedSource({ subSources: [{ name: 'JPod', enabled: false }] });
        await expect(getAudioCandidates(source, testCard(), 1000, '')).resolves.toEqual([
            { url: CLIP_URL, sourceUrl: expect.stringContaining('audio.yomureader.com') },
        ]);
    });

    it('returns no candidates when every named sub-source is disabled', async () => {
        stubAggregatorFetch();
        const source = hostedSource({
            subSources: [
                { name: 'jpod', enabled: false },
                { name: 'Yomu audio', enabled: false },
            ],
        });
        await expect(getAudioCandidates(source, testCard(), 1000, '')).resolves.toEqual([]);
    });

    it('keeps generic extraction for unnamed JSON payloads even with disabled sub-sources', async () => {
        stubAggregatorFetch({ audioSources: [{ url: CLIP_URL, type: 'audio' }] });
        const source = hostedSource({ subSources: [{ name: 'jpod', enabled: false }] });
        await expect(getAudioCandidates(source, testCard(), 1000, '')).resolves.toEqual([
            { url: CLIP_URL, sourceUrl: expect.stringContaining('audio.yomureader.com') },
        ]);
    });

    it('detects the union of sub-source names across probe lookups', async () => {
        const payloads = [
            { type: 'audioSourceList', audioSources: [{ name: 'Yomu audio', url: CLIP_URL }] },
            { type: 'audioSourceList', audioSources: [{ name: 'yomu audio', url: CLIP_URL }] },
            { type: 'audioSourceList', audioSources: [{ name: 'jpod', url: JPOD_URL }] },
        ];
        let call = 0;
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payloads[Math.min(call++, payloads.length - 1)]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })));
        await expect(detectCustomJsonAudioSubSources(HOSTED_URL, 1000, '')).resolves.toEqual(['Yomu audio', 'jpod']);
    });

    it('merges newly detected names without losing saved toggles', () => {
        expect(mergeAudioSubSources(
            [{ name: 'jpod', enabled: false }],
            ['JPod', 'Yomu audio'],
        )).toEqual([
            { name: 'jpod', enabled: false },
            { name: 'Yomu audio', enabled: true },
        ]);
    });

    it('round-trips sub-source toggles through the settings form and normalization', () => {
        const sources: AudioSourceSetting[] = [hostedSource({
            subSources: [
                { name: 'Yomu audio', enabled: true },
                { name: 'jpod', enabled: false },
            ],
        })];
        const form = document.createElement('form');
        form.innerHTML = renderAudioSourceEditor(sources, 'en');
        document.body.append(form);
        try {
            const read = readAudioSources(new FormData(form));
            expect(read[0]).toMatchObject({
                type: 'custom-json',
                url: HOSTED_URL,
                subSources: [
                    { name: 'Yomu audio', enabled: true },
                    { name: 'jpod', enabled: false },
                ],
            });
            expect(normalizeAudioSources(read)[0]?.subSources).toEqual([
                { name: 'Yomu audio', enabled: true },
                { name: 'jpod', enabled: false },
            ]);
        } finally {
            form.remove();
        }
    });

    it('flags sub-sources that duplicate an enabled stand-alone source row', () => {
        const rows: AudioSourceSetting[] = [
            hostedSource({ subSources: [{ name: 'jpod', enabled: true }] }),
            { type: 'jpod101', url: '', voice: '', enabled: true },
        ];
        expect(renderAudioSourceEditor(rows, 'en')).toContain('jpdb-reader-audio-subsource-overlap');

        const withoutOverlap: AudioSourceSetting[] = [
            hostedSource({ subSources: [{ name: 'jpod', enabled: true }] }),
            { type: 'jpod101', url: '', voice: '', enabled: false },
        ];
        expect(renderAudioSourceEditor(withoutOverlap, 'en')).not.toContain('jpdb-reader-audio-subsource-overlap');
    });
});
