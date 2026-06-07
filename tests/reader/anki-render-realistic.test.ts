import { describe, expect, it } from 'vitest';

import type { AnkiExistingNote } from '../../src/reader/anki';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { ReaderSettings } from '../../src/reader/types';
import {
    existingAnkiNote,
    expectNoHugeInlineFontLeak,
    expectNoNestedScrollStyles,
    expectReadableRenderedAnkiSection,
    renderExistingAnkiLookup as renderExistingAnkiLookupWithSettings,
} from './helpers/anki-render';

describe('Anki realistic rendered card QA fixtures', () => {
    it('keeps repeated large RRTK kanji blocks readable without nested template scrolling', () => {
        const section = renderExistingAnkiLookup([rrtkKanjiNote()]);
        const renderedCards = [...section.querySelectorAll<HTMLElement>('.jpdb-reader-anki-rendered-card')];
        const kanjiBlocks = [...section.querySelectorAll<HTMLElement>('.rrtk-kanji')];

        expectReadableRenderedAnkiSection(section);
        expect(renderedCards).toHaveLength(2);
        expect(renderedCards[0]?.tagName).toBe('DETAILS');
        expect(renderedCards[0]?.hasAttribute('open')).toBe(true);
        expect(renderedCards[1]?.hasAttribute('open')).toBe(false);
        expect(renderedCards.map(card => card.querySelector('.jpdb-reader-anki-rendered-card-title')?.textContent))
            .toEqual(['RRTK Recognition #7001', 'RRTK Recognition #7002']);
        expect(section.querySelector('style')).toBeNull();
        expect(kanjiBlocks).toHaveLength(5);
        expect(kanjiBlocks.map(block => block.textContent?.trim())).toEqual(['語', '語', '語', '語', '語']);
        expectNoNestedScrollStyles(section);
        expectNoHugeInlineFontLeak(section);
        expect(section.innerHTML).toContain('font-size: 30px');
        expect(section.innerHTML).toContain('font-size: 1.8rem');
    });

    it('renders Core 2k-style vocab media as separated image and Anki audio controls', () => {
        const section = renderExistingAnkiLookup([core2kVocabNote()]);
        const { bodies, audioControls } = renderedAnkiCardParts(section);
        const audioNames = audioControls.map(button => button.dataset.ankiMediaName);
        const image = section.querySelector<HTMLImageElement>('img[data-anki-media-name="core-2k-market.webp"]');
        const nativeAudio = section.querySelector<HTMLAudioElement>('audio[data-anki-media-name="tanoshii-sentence.mp3"]');

        expectReadableRenderedAnkiSection(section);
        expect(bodies).toHaveLength(2);
        expect(section.textContent).toContain('楽しい');
        expect(section.textContent).toContain('Everyone talked happily at the market.');
        expect(section.textContent).not.toMatch(/\[(?:sound|anki:play):[^\]]+]/i);
        expect(audioControls).toHaveLength(2);
        expect(audioNames).toEqual([
            'tanoshii-word.mp3',
            'tanoshii-sentence.mp3',
        ]);
        expect(new Set(audioControls.map(button => button.tagName))).toEqual(new Set(['BUTTON']));
        expect(image?.src).toBe('data:image/webp;base64,core2k');
        expect(nativeAudio?.hasAttribute('controls')).toBe(true);
        expectNoNestedScrollStyles(section);
    });

    it('renders Jlab-style cards from template HTML without leaking fallback fields', () => {
        const section = renderExistingAnkiLookup([jlabBeginnerNote()]);
        const { bodies, audioControls } = renderedAnkiCardParts(section);
        const image = section.querySelector<HTMLImageElement>('img[data-anki-media-name="jlab-start.png"]');

        expectReadableRenderedAnkiSection(section);
        expect(bodies).toHaveLength(2);
        expect(section.textContent).toContain('始める');
        expect(section.textContent).toContain('Please start.');
        expect(section.textContent).toContain('Jlab beginner course');
        expect(section.querySelector('.jpdb-reader-anki-stored-fields')).toBeNull();
        expect(section.querySelector('.jpdb-reader-anki-field')).toBeNull();
        expect(section.textContent).not.toContain('Jlab-Translation');
        expect(section.textContent).not.toContain('sentence-like generic field should not win');
        expect(audioControls.map(button => button.dataset.ankiMediaName)).toEqual([
            'jlab-hajimeru-word.mp3',
            'jlab-hajimeru-sentence.mp3',
        ]);
        expect(image?.src).toBe('data:image/png;base64,jlab');
        expectSafeRenderedAnkiFixture(section);
    });

    it('renders Kaishi 1.5k cards without long audio filenames or fallback labels', () => {
        const section = renderExistingAnkiLookup([kaishiVocabNote()]);
        const { bodies, audioControls } = renderedAnkiCardParts(section);
        const image = section.querySelector<HTMLImageElement>('img[data-anki-media-name="button_start2.webp"]');

        expectReadableRenderedAnkiSection(section);
        expect(bodies).toHaveLength(2);
        expect(section.textContent).toContain('始める');
        expect(section.textContent).toContain('テストを始めてください。');
        expect(section.textContent).toContain('to start');
        expect(section.textContent).toContain('Please start the test.');
        expect(section.querySelector('.jpdb-reader-anki-stored-fields')).toBeNull();
        expect(section.querySelector('.jpdb-reader-anki-field')).toBeNull();
        expect(section.textContent).not.toContain('Word Audio');
        expect(section.textContent).not.toContain('Sentence Audio');
        expect(section.textContent).not.toContain('0e5a0bcb94d981c08ea2552a0716e02b');
        expect(section.textContent).not.toMatch(/\[anki:play:[^\]]+]/i);
        expect(audioControls).toHaveLength(2);
        expect(audioControls.every(button => button.classList.contains('jpdb-reader-audio-control'))).toBe(true);
        expect(audioControls.map(button => button.textContent?.trim())).toEqual(['', '']);
        expect(audioControls.every(button => button.querySelector('svg'))).toBe(true);
        expect(audioControls.map(button => button.dataset.ankiMediaName)).toEqual([
            '0e5a0bcb94d981c08ea2552a0716e02b-c8aca572ab508c03a1942de4757f535945a90c5a.mp3',
            'e79a8072345e2d2560af1e7ca2540eee-1bd2024a27767f03ad514d91142e19a4e6e77ac6.mp3',
        ]);
        expect(image?.src).toBe('data:image/webp;base64,kaishi');
        expectSafeRenderedAnkiFixture(section);
    });

    it('separates Yomu notes from other matches and keeps generated labels natural-case', () => {
        const section = renderExistingAnkiLookup([yomuJapaneseNote(), core2kVocabNote(), rrtkKanjiNote()]);
        const noteEntries = [...section.querySelectorAll<HTMLElement>('.jpdb-reader-anki-existing-note')];
        const noteTitles = noteEntries.map(note => note.querySelector('.jpdb-reader-anki-existing-note-title')?.textContent ?? '');
        const matchSummary = section.querySelector<HTMLElement>('.jpdb-reader-anki-match-summary');
        const sectionStatus = section.querySelector<HTMLElement>('.jpdb-reader-source-status');
        const yomuEntry = noteEntries[0]!;
        const yomuCard = yomuEntry.querySelector<HTMLElement>('.yomu-card');
        const labels = [...section.querySelectorAll<HTMLElement>('.jpdb-reader-anki-audio-merge span')]
            .map(label => label.textContent?.trim());

        expectReadableRenderedAnkiSection(section);
        expect(noteEntries).toHaveLength(3);
        expect(noteEntries.map(note => note.tagName)).toEqual(['DETAILS', 'DETAILS', 'DETAILS']);
        expect(noteEntries.map(note => note.hasAttribute('open'))).toEqual([true, false, false]);
        expect(noteTitles[0]).toContain('よむ · Yomu Japanese · Sentence');
        expect(noteTitles[1]).toContain('Core 2k · Core 2k/6k Optimized · Sentence');
        expect(noteTitles[2]).toContain('RRTK Recognition · RRTK Recognition · Kanji');
        expect(matchSummary?.textContent).toContain('よむ · Yomu Japanese · Sentence');
        expect(sectionStatus?.textContent).toContain('3 matches');
        expect(yomuCard?.textContent).toContain('本を読む');
        expect(yomuEntry.querySelector<HTMLImageElement>('img[data-anki-media-name="yomu-context.png"]')?.src)
            .toBe('data:image/png;base64,yomu');
        expect(labels).toContain('Audio');
        expect(labels).not.toContain('AUDIO');
        expect(section.innerHTML).not.toMatch(/text-transform:\s*uppercase/i);
        expectNoNestedScrollStyles(yomuEntry);
        expectNoHugeInlineFontLeak(yomuEntry);
    });
});

function renderExistingAnkiLookup(notes: AnkiExistingNote[], settings: ReaderSettings = ankiRenderSettings()): HTMLElement {
    return renderExistingAnkiLookupWithSettings(notes, settings);
}

function renderedAnkiCardParts(section: ParentNode): {
    bodies: HTMLElement[];
    audioControls: HTMLButtonElement[];
} {
    return {
        bodies: [...section.querySelectorAll<HTMLElement>('.jpdb-reader-anki-rendered-side-body')],
        audioControls: [...section.querySelectorAll<HTMLButtonElement>('[data-action="anki-media-audio"]')],
    };
}

function expectSafeRenderedAnkiFixture(section: ParentNode): void {
    expect(section.querySelector('script')).toBeNull();
    expect(section.querySelector('style')).toBeNull();
    expectNoNestedScrollStyles(section);
    expectNoHugeInlineFontLeak(section);
}

function ankiRenderSettings(): ReaderSettings {
    return {
        ...DEFAULT_SETTINGS,
        interfaceLanguage: 'en',
        ankiSectionEnabled: true,
        enableReviews: false,
    };
}

function rrtkKanjiNote(): AnkiExistingNote {
    return existingAnkiNote({
        noteId: 700,
        modelName: 'RRTK Recognition',
        deckNames: ['RRTK Recognition'],
        cardIds: [7001, 7002],
        primaryCardId: 7001,
        state: 'new',
        fields: {
            Kanji: '語',
            Keyword: 'language',
            Heisig_Frame: '301',
            Story: 'Words stack up until they become a language.',
        },
        renderedCards: [
            {
                cardId: 7001,
                deckName: 'RRTK Recognition',
                question: `
                    <style>.rrtk-kanji { font-size: 220px; overflow: auto; max-height: 130px; }</style>
                    <div class="rrtk-card" style="overflow: auto; max-height: 180px;">
                        <div class="rrtk-kanji" style="font-size: 180px">語</div>
                        <div class="rrtk-kanji" style="font: 128px serif">語</div>
                        <div class="rrtk-kanji" style="font-size: 9rem">語</div>
                    </div>
                `,
                answer: `
                    <div class="rrtk-answer">
                        <div class="rrtk-kanji" style="font-size: 160px">語</div>
                        <p>language</p>
                    </div>
                `,
            },
            {
                cardId: 7002,
                deckName: 'RRTK Recognition',
                question: '<div class="rrtk-kanji" style="font-size: 96px">語</div>',
                answer: '<div>readings: ゴ / かた.る</div>',
            },
        ],
    });
}

function core2kVocabNote(): AnkiExistingNote {
    return existingAnkiNote({
        noteId: 820,
        modelName: 'Core 2k/6k Optimized',
        deckNames: ['Core 2k'],
        cardIds: [8201],
        primaryCardId: 8201,
        state: 'due',
        fields: {
            Vocabulary: '楽しい',
            Reading: 'たのしい',
            Meaning: 'fun; enjoyable',
            Sentence: '市場でみんなが楽しそうに話していた。',
            Word_Audio: '[sound:tanoshii-word.mp3]',
            Sentence_Audio: '[sound:tanoshii-sentence.mp3]',
            Image: '<img src="core-2k-market.webp">',
        },
        renderedCards: [{
            cardId: 8201,
            deckName: 'Core 2k',
            mediaDataUrls: {
                'core-2k-market.webp': 'data:image/webp;base64,core2k',
            },
            question: `
                <div class="core-card">
                    <div class="core-expression" style="font-size: 64px">楽しい</div>
                    <div class="core-reading">たのしい [sound:tanoshii-word.mp3]</div>
                    <img src="core-2k-market.webp" alt="market scene">
                </div>
            `,
            answer: `
                <div class="core-answer" style="overflow-y: scroll; max-height: 90px;">
                    <p>市場でみんなが楽しそうに話していた。</p>
                    <p>Everyone talked happily at the market.</p>
                    <audio src="tanoshii-sentence.mp3"></audio>
                    [anki:play:q:1]
                </div>
            `,
        }],
    });
}

function jlabBeginnerNote(): AnkiExistingNote {
    return existingAnkiNote({
        noteId: 840,
        modelName: 'JlabNote-JlabConverted-1',
        deckNames: ["Jlab's beginner course::Part 2: Reading practice"],
        cardIds: [8401],
        primaryCardId: 8401,
        state: 'new',
        fields: {
            Expression: 'sentence-like generic field should not win',
            Reading: 'generic reading',
            'Jlab-Kanji': '始める',
            'Jlab-Hiragana': 'はじめる',
            'Jlab-Translation': 'Please start.',
            RemarksFront: 'Jlab beginner course',
            RemarksBack: 'Extra grammar note',
            Audio: '[sound:jlab-hajimeru-word.mp3]',
            SentenceAudio: '[sound:jlab-hajimeru-sentence.mp3]',
            Picture: '<img src="jlab-start.png">',
        },
        renderedCards: [{
            cardId: 8401,
            deckName: "Jlab's beginner course::Part 2: Reading practice",
            mediaDataUrls: {
                'jlab-start.png': 'data:image/png;base64,jlab',
            },
            question: `
                <style>.jlab-expression { font-size: 88px; overflow-y: scroll; max-height: 120px; }</style>
                <script>window.bad = true;</script>
                <main class="jlab-card" style="overflow: auto; max-height: 180px;">
                    <div class="jlab-expression" style="font-size: 72px">始める</div>
                    <div class="jlab-reading">はじめる [sound:jlab-hajimeru-word.mp3]</div>
                    <p>Jlab beginner course</p>
                </main>
            `,
            answer: `
                <section class="jlab-answer" style="overflow-y: scroll; max-height: 160px;">
                    <p>Please start.</p>
                    <p>テストを始めてください。</p>
                    <img src="jlab-start.png" alt="start context">
                    [sound:jlab-hajimeru-sentence.mp3]
                </section>
            `,
        }],
    });
}

function kaishiVocabNote(): AnkiExistingNote {
    return existingAnkiNote({
        noteId: 860,
        modelName: 'Kaishi 1.5k',
        deckNames: ['Kaishi 1.5k'],
        cardIds: [8601],
        primaryCardId: 8601,
        state: 'new',
        fields: {
            Word: '始める',
            'Word Reading': 'はじめる',
            'Word Meaning': 'to start',
            'Word Furigana': '始[はじ]める',
            'Word Audio': '[sound:0e5a0bcb94d981c08ea2552a0716e02b-c8aca572ab508c03a1942de4757f535945a90c5a.mp3]',
            Sentence: 'テストを<b>始めて</b>ください。',
            'Sentence Meaning': 'Please start the test.',
            'Sentence Furigana': 'テストを<b>始[はじ]めて</b>ください。',
            'Sentence Audio': '[sound:e79a8072345e2d2560af1e7ca2540eee-1bd2024a27767f03ad514d91142e19a4e6e77ac6.mp3]',
            'Pitch Accent': 'ハ<span style="display:inline-block;position:relative;">ジメル</span>',
            Frequency: '240',
            Picture: '<img src="button_start2.webp">',
        },
        renderedCards: [{
            cardId: 8601,
            deckName: 'Kaishi 1.5k',
            mediaDataUrls: {
                'button_start2.webp': 'data:image/webp;base64,kaishi',
            },
            question: `
                <style>
                    .card { font-size: 44px; text-align: center; overflow: hidden; }
                    img { max-width: 300px; max-height: 250px; }
                    b { color: #5586cd; }
                </style>
                <div lang="ja" class="card" style="overflow: hidden;">
                    始める
                    <div style="font-size: 20px;">テストを<b>始めて</b>ください。</div>
                </div>
            `,
            answer: `
                <style>.card { font-size: 44px; text-align: center; overflow: hidden; }</style>
                <div lang="ja" class="card" style="overflow: hidden;">
                    <ruby><rb>始</rb><rt>はじ</rt></ruby>める
                    <div style="font-size: 25px; padding-bottom:20px">to start</div>
                    <div style="font-size: 25px;">テストを<b><ruby><rb>始</rb><rt>はじ</rt></ruby>めて</b>ください。</div>
                    <div style="font-size: 25px; padding-bottom:10px">Please start the test.</div>
                    [anki:play:a:0]
                    [anki:play:a:1]
                    <img alt="start button" src="button_start2.webp">
                </div>
            `,
        }],
    });
}

function yomuJapaneseNote(): AnkiExistingNote {
    return existingAnkiNote({
        noteId: 901,
        modelName: 'Yomu Japanese',
        deckNames: ['よむ'],
        cardIds: [9011],
        primaryCardId: 9011,
        state: 'known',
        fields: {
            Word: '読む',
            Reading: 'よむ',
            Meaning: 'to read',
            Sentence: '夜に静かな部屋で本を読む。',
            Audio: '[sound:yomu-word.mp3]',
            Image: '<img src="yomu-context.png">',
        },
        renderedCards: [{
            cardId: 9011,
            deckName: 'よむ',
            mediaDataUrls: {
                'yomu-context.png': 'data:image/png;base64,yomu',
            },
            question: `
                <article class="yomu-card" style="overflow: auto; max-height: 240px;">
                    <h1 style="font-size: 72px">読む</h1>
                    <p class="sentence">夜に静かな部屋で<strong>本を読む</strong>。</p>
                    <img src="yomu-context.png" alt="reader context">
                    <div>[sound:yomu-word.mp3]</div>
                </article>
            `,
            answer: `
                <article class="yomu-card-back">
                    <h2>to read</h2>
                    <p>Source: よむ popover dictionary</p>
                </article>
            `,
        }],
    });
}
