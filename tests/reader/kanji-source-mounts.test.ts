import { describe, expect, it } from 'vitest';
import { renderKanjiSourceMounts } from '../../src/reader/runtime/kanji-source-mounts';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import { KANJI_SIMILAR_WORDS_SOURCE_ID, kanjiSourceRows, orderedKanjiSourceIds } from '../../src/reader/sources/sections';

describe('kanji source mounts', () => {
    it('omits the legacy similar-words source from settings order and runtime mounts', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            similarKanjiWords: true,
        };

        expect(kanjiSourceRows(settings).map(row => row.id)).not.toContain(KANJI_SIMILAR_WORDS_SOURCE_ID);
        expect(orderedKanjiSourceIds(settings)).not.toContain(KANJI_SIMILAR_WORDS_SOURCE_ID);

        const html = renderKanjiSourceMounts({
            settings,
            kanji: '訓',
            language: 'en',
            isSourceOpen: () => true,
            sourceAttributes: () => '',
            sourceTitle: sourceId => sourceId,
            staticMounts: {
                [KANJI_SIMILAR_WORDS_SOURCE_ID]: '<div data-kanji-similar-mount></div>',
            },
        });

        expect(html).not.toContain('data-kanji-similar');
    });
});
