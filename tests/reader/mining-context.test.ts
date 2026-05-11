import { beforeEach, describe, expect, it } from 'vitest';
import {
    contextLabel,
    createFallbackMiningContext,
    inferMiningSourceKind,
    immersionContextFromElement,
    loadMiningContext,
    normalizeMiningSentence,
    pageMiningContext,
    resolveMiningContext,
    saveMiningContext,
} from '../../src/reader/mining-context';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

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
            immersionIndex: 2,
            immersionTotal: 5,
            updatedAt: 1234,
        });
        expect(contextLabel(context)).toBe('Steins Gate 3/5');
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
            immersionIndex: 0,
            immersionTotal: 1,
        });

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
        });

        expect(context).toMatchObject({
            sentence: 'メールを読みました。',
            sourceKind: 'immersion-kit',
            imageDataUrl: 'https://images.test/frame.jpg?timeout=123',
        });
    });
});
