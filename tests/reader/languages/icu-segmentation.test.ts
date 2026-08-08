import { afterEach, describe, expect, it } from 'vitest';

import { createLearningTargetModule } from '../../../src/reader/languages/module';
import { hasIcuWordSegmentation, icuWordSegments } from '../../../src/reader/languages/icu-segmentation';
import {
    registerLearningTargetModule,
    unregisterLearningTargetModule,
} from '../../../src/reader/languages/registry';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../../src/reader/languages/active';
import { segmentTargetLanguageText } from '../../../src/reader/lookup/target-text';

/**
 * A target that states nothing about segmentation, so every boundary below is
 * the contract's own default rather than something a language module supplied.
 */
function thinTarget(language: string) {
    return createLearningTargetModule({
        id: `thin-${language}`,
        language,
        featureSemantics: {
            characterSystem: 'unspecified',
            phoneticScripts: [],
            pronunciation: 'none',
            readingAnnotation: 'none',
        },
        detectsText: /\S/u,
    });
}

const AD_HOC_LANGUAGES = ['th', 'lo', 'km', 'my', 'vi', 'yue', 'ru', 'es'] as const;

afterEach(() => {
    resetActiveLearningTargetLanguage();
    for (const language of AD_HOC_LANGUAGES) unregisterLearningTargetModule(language);
});

function words(language: string, text: string): string[] {
    registerLearningTargetModule(thinTarget(language));
    expect(setActiveLearningTargetLanguage(language)).not.toBeNull();
    return [...segmentTargetLanguageText(text)].map(segment => segment.text);
}

describe('ICU word segmentation through the target contract', () => {
    it('is available in this runtime', () => {
        expect(hasIcuWordSegmentation('th')).toBe(true);
    });

    /**
     * The languages whitespace segmentation was simply wrong about: without a
     * segmenter, every sentence below is one token the length of the sentence,
     * and nothing in it can be looked up.
     */
    it('finds words in scripts that are written without spaces', () => {
        expect(words('th', 'ผมชอบกินข้าวผัดที่ร้านนี้'))
            .toEqual(['ผม', 'ชอบ', 'กิน', 'ข้าว', 'ผัด', 'ที่', 'ร้าน', 'นี้']);
        expect(words('lo', 'ຂ້ອຍມັກກິນເຂົ້າ').length).toBeGreaterThan(1);
        expect(words('km', 'ខ្ញុំចូលចិត្តញ៉ាំបាយ').length).toBeGreaterThan(1);
        expect(words('my', 'ကျွန်တော်ထမင်းစားသည်').length).toBeGreaterThan(1);
    });

    /** For space-delimited targets ICU is whitespace with the punctuation gone. */
    it('strips punctuation off space-delimited words so a lookup can find them', () => {
        expect(words('es', 'Me gusta comer paella, ¿y a ti?'))
            .toEqual(['Me', 'gusta', 'comer', 'paella', 'y', 'a', 'ti']);
        expect(words('ru', 'Я люблю есть блины.'))
            .toEqual(['Я', 'люблю', 'есть', 'блины']);
    });

    /**
     * The holes, stated rather than papered over. Each expectation below is a
     * limitation, not a success: closing one means this test changes, which is
     * the point of writing them down.
     */
    describe('what ICU still cannot segment', () => {
        it('gives Korean eojeol, not morphemes', () => {
            // '저는' is topic-marked '저', '밥을' is '밥' plus an object particle.
            // Splitting those needs a Korean analyser Yomu does not ship.
            expect(icuWordSegments('저는 밥을 먹었습니다', 'ko')!.map(segment => segment.text))
                .toEqual(['저는', '밥을', '먹었습니다']);
        });

        it('splits Vietnamese compounds into their syllables', () => {
            // 'cơm rang' is one word — fried rice — and comes back as two.
            expect(words('vi', 'Tôi thích ăn cơm rang'))
                .toEqual(['Tôi', 'thích', 'ăn', 'cơm', 'rang']);
        });

        it('splits Cantonese compounds a character at a time', () => {
            // 鍾意 is one word — to like — and comes back as two characters.
            expect(words('yue', '我鍾意食炒飯')).toContain('鍾');
            expect(words('yue', '我鍾意食炒飯')).not.toContain('鍾意');
        });
    });
});
