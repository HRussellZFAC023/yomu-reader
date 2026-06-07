import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    contextLabel,
    createFallbackMiningContext,
    inferMiningSourceKind,
    immersionContextFromElement,
    immersionContextFromExample,
    loadMiningContext,
    normalizeMiningSentence,
    pageMiningContext,
    resolveMiningContext,
    saveMiningContext,
} from '../../src/reader/study/mining-context';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';

const STORAGE_PREFIX = 'yomu-mining-context:';

describe('mining context helpers', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '';
        document.title = 'Example page';
        window.history.replaceState(null, '', '/article');
    });

    it('normalizes transient popup sentences without changing stored source metadata', () => {
        expect(normalizeMiningSentence('  今日は\n 本を\t読む。  ')).toBe('今日は 本を 読む。');

        const stored = saveMiningContext(' 読む ', {
            ...pageMiningContext('  今日は本を読む。  '),
            sourceTitle: '  Article title  ',
            sourceUrl: '  https://example.test/read  ',
        });

        expect(stored).toMatchObject({
            term: '読む',
            sentence: '今日は本を読む。',
            sourceTitle: 'Article title',
            sourceUrl: 'https://example.test/read',
        });
        expect(loadMiningContext('読む')).toEqual(stored);
    });

    it('ignores stale or mismatched stored contexts', () => {
        const stored = saveMiningContext('読む', pageMiningContext('今日は本を読む。'));
        expect(stored).not.toBeNull();

        localStorage.setItem(`${STORAGE_PREFIX}読む`, JSON.stringify({ ...stored, term: '見る' }));
        expect(loadMiningContext('読む')).toBeNull();

        localStorage.setItem(`${STORAGE_PREFIX}読む`, JSON.stringify({
            ...stored,
            updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 22,
        }));
        expect(loadMiningContext('読む')).toBeNull();
    });

    it('keeps source-kind precedence readable and deterministic', () => {
        expect(inferMiningSourceKind({ isImageSource: true, hasVideo: true, hostname: 'jpdb.io' })).toBe('image');
        expect(inferMiningSourceKind({ hasVideo: true, hostname: 'jpdb.io' })).toBe('video');
        expect(inferMiningSourceKind({ hostname: 'jpdb.io' })).toBe('jpdb');
        expect(inferMiningSourceKind({ hostname: 'example.test' })).toBe('page');
    });

    it('builds immersion contexts from rendered example cards', () => {
        const element = document.createElement('article');
        element.dataset.immersionSourceTitle = 'Steins Gate';
        element.dataset.immersionImageUrl = 'https://images.test/frame.jpg';
        element.dataset.immersionAudioUrls = JSON.stringify(['https://audio.test/clip.mp3', 'https://audio.test/fallback.mp3']);
        element.dataset.immersionIndex = '2';
        element.dataset.immersionTotal = '5';

        const draft = immersionContextFromElement('メールを読みました。', element, 'https://example.test/popup');
        const context = createFallbackMiningContext('読む', draft, 1234);

        expect(context).toMatchObject({
            term: '読む',
            sentence: 'メールを読みました。',
            sourceKind: 'immersion-kit',
            sourceTitle: 'Steins Gate',
            sourceUrl: 'https://example.test/popup',
            imageUrl: 'https://images.test/frame.jpg',
            audioUrls: ['https://audio.test/clip.mp3', 'https://audio.test/fallback.mp3'],
            immersionIndex: 2,
            immersionTotal: 5,
            updatedAt: 1234,
        });
        expect(contextLabel(context)).toBe('Steins Gate 3/5');
    });

    it('builds immersion contexts from examples with audio URL fallbacks', () => {
        const draft = immersionContextFromExample('読む', {
            id: 'anime/steins_gate/1',
            sentence: 'メールを読みました。',
            sentenceWithFurigana: '',
            translation: 'I read the email.',
            sourceTitle: 'Steins Gate',
            titleSlug: 'steins_gate',
            category: 'anime',
            soundFile: 'clip.mp3',
            imageFile: 'frame.jpg',
            soundUrl: '',
            imageUrl: '',
        }, 0, 2, 'https://images.test/frame.jpg', [
            'https://audio.test/clip.mp3',
            'https://audio.test/clip.mp3',
            ' https://audio.test/fallback.mp3 ',
        ]);

        expect(createFallbackMiningContext('読む', draft, 1234)).toMatchObject({
            sourceKind: 'immersion-kit',
            imageUrl: 'https://images.test/frame.jpg',
            audioUrls: ['https://audio.test/clip.mp3', 'https://audio.test/fallback.mp3'],
            immersionIndex: 0,
            immersionTotal: 2,
        });
    });

    it('creates an in-memory fallback when storage input is incomplete', () => {
        expect(createFallbackMiningContext('読む', {
            sentence: '',
            sourceKind: 'page',
            sourceTitle: 'Example page',
            sourceUrl: 'https://example.test/article',
        }, 1234)).toMatchObject({
            term: '読む',
            sentence: '読む',
            sourceKind: 'page',
            updatedAt: 1234,
        });
    });

    it('resolves screenshot context before reusable stored contexts', async () => {
        const stored = saveMiningContext('読む', {
            sentence: 'メールを読みました。',
            sourceKind: 'immersion-kit',
            sourceTitle: 'Steins Gate',
            sourceUrl: 'https://www.immersionkit.com/dictionary?keyword=読む',
            imageUrl: 'https://images.test/frame.jpg',
            immersionIndex: 0,
            immersionTotal: 1,
        });

        const context = await resolveMiningContext({
            term: '読む',
            sentence: '  今日は本を読む。 ',
            settings: { ...DEFAULT_SETTINGS, ankiCaptureScreenshot: true, immersionKitEnabled: true },
            storedContext: stored,
            sourceKind: 'page',
            imageDataUrl: 'data:image/png;base64,ocr',
        });

        expect(context).toMatchObject({
            term: '読む',
            sentence: '今日は本を読む。',
            sourceKind: 'image',
            imageDataUrl: 'data:image/png;base64,ocr',
        });
    });

    it('hydrates selected Immersion Kit context images only when that source wins', async () => {
        const stored = saveMiningContext('読む', {
            sentence: 'メールを読みました。',
            sourceKind: 'immersion-kit',
            sourceTitle: 'Steins Gate',
            sourceUrl: 'https://www.immersionkit.com/dictionary?keyword=読む',
            imageUrl: 'https://images.test/frame.jpg',
            audioUrls: ['https://audio.test/clip.mp3', 'https://audio.test/fallback.mp3'],
            immersionIndex: 0,
            immersionTotal: 1,
        });
        const fetchAudioDataUrl = vi.fn(async (audioUrls: string[], timeoutMs: number) => `${audioUrls.join('|')}?timeout=${timeoutMs}`);

        const context = await resolveMiningContext({
            term: '読む',
            sentence: '今日は本を読む。',
            settings: {
                ...DEFAULT_SETTINGS,
                immersionKitEnabled: true,
                immersionKitShowImages: true,
                audioTimeoutMs: 123,
            },
            storedContext: stored,
            sourceKind: 'page',
            fetchImageDataUrl: async (imageUrl, timeoutMs) => `${imageUrl}?timeout=${timeoutMs}`,
            fetchAudioDataUrl,
        });

        expect(context).toMatchObject({
            sentence: 'メールを読みました。',
            sourceKind: 'immersion-kit',
            imageDataUrl: 'https://images.test/frame.jpg?timeout=123',
            audioDataUrl: 'https://audio.test/clip.mp3|https://audio.test/fallback.mp3?timeout=123',
        });
        expect(fetchAudioDataUrl).toHaveBeenCalledWith(['https://audio.test/clip.mp3', 'https://audio.test/fallback.mp3'], 123);
    });

    it('does not hydrate Immersion Kit audio when screenshot context wins', async () => {
        const stored = saveMiningContext('読む', {
            sentence: 'メールを読みました。',
            sourceKind: 'immersion-kit',
            sourceTitle: 'Steins Gate',
            sourceUrl: 'https://www.immersionkit.com/dictionary?keyword=読む',
            audioUrls: ['https://audio.test/clip.mp3'],
            immersionIndex: 0,
            immersionTotal: 1,
        });
        const fetchAudioDataUrl = vi.fn(async () => 'data:audio/mpeg;base64,audio');

        const context = await resolveMiningContext({
            term: '読む',
            sentence: '  今日は本を読む。 ',
            settings: { ...DEFAULT_SETTINGS, ankiCaptureScreenshot: true, immersionKitEnabled: true },
            storedContext: stored,
            sourceKind: 'page',
            imageDataUrl: 'data:image/png;base64,ocr',
            fetchAudioDataUrl,
        });

        expect(context).toMatchObject({
            sentence: '今日は本を読む。',
            sourceKind: 'image',
        });
        expect(context.audioDataUrl).toBeUndefined();
        expect(fetchAudioDataUrl).not.toHaveBeenCalled();
    });
});
