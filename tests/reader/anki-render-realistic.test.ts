import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { AnkiExistingNote, AnkiLookupResult } from '../../src/reader/anki';
import { renderAnkiExistingSection } from '../../src/reader/anki-render';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { ReaderSettings } from '../../src/reader/types';

const LOCAL_DICTIONARY_CSS = readFileSync('src/reader/styles/local-dictionaries.css', 'utf8');

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
        const bodies = [...section.querySelectorAll<HTMLElement>('.jpdb-reader-anki-rendered-side-body')];
        const audioControls = [...section.querySelectorAll<HTMLButtonElement>('[data-action="anki-media-audio"]')];
        const audioNames = audioControls.map(button => button.dataset.ankiMediaName);
        const image = section.querySelector<HTMLImageElement>('img[data-anki-media-name="core-2k-market.webp"]');
        const nativeAudio = section.querySelector<HTMLAudioElement>('audio[data-anki-media-name="tanoshii-sentence.mp3"]');

        expectReadableRenderedAnkiSection(section);
        expect(bodies).toHaveLength(2);
        expect(section.textContent).toContain('楽しい');
        expect(section.textContent).toContain('Everyone talked happily at the market.');
        expect(section.textContent).not.toMatch(/\[(?:sound|anki:play):[^\]]+]/i);
        expect(audioControls).toHaveLength(3);
        expect(audioNames).toEqual([
            'tanoshii-word.mp3',
            'tanoshii-sentence.mp3',
            'tanoshii-sentence.mp3',
        ]);
        expect(new Set(audioControls.map(button => button.tagName))).toEqual(new Set(['BUTTON']));
        expect(image?.src).toBe('data:image/webp;base64,core2k');
        expect(nativeAudio?.hasAttribute('controls')).toBe(true);
        expectNoNestedScrollStyles(section);
    });

    it('renders Jlab-style cards from template HTML without leaking fallback fields', () => {
        const section = renderExistingAnkiLookup([jlabBeginnerNote()]);
        const bodies = [...section.querySelectorAll<HTMLElement>('.jpdb-reader-anki-rendered-side-body')];
        const audioControls = [...section.querySelectorAll<HTMLButtonElement>('[data-action="anki-media-audio"]')];
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
        expect(section.querySelector('script')).toBeNull();
        expect(section.querySelector('style')).toBeNull();
        expectNoNestedScrollStyles(section);
        expectNoHugeInlineFontLeak(section);
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
    const primary = notes[0] ?? null;
    const lookup: AnkiLookupResult = { state: primary?.state ?? 'not-in-deck', notes, primary, trusted: true };
    const container = document.createElement('div');
    container.innerHTML = renderAnkiExistingSection(lookup, null, settings);
    const section = container.querySelector<HTMLElement>('.jpdb-reader-anki-existing');
    if (!section) throw new Error('Expected rendered Anki section');
    return section;
}

function expectReadableRenderedAnkiSection(section: HTMLElement): void {
    const bodies = [...section.querySelectorAll<HTMLElement>('.jpdb-reader-anki-rendered-side-body')];
    expect(bodies.length).toBeGreaterThan(0);
    expect(LOCAL_DICTIONARY_CSS)
        .toMatch(/\.jpdb-reader-anki-rendered-side-body\s*\{[^}]*max-height:\s*none;/);
    expect(LOCAL_DICTIONARY_CSS)
        .toMatch(/\.jpdb-reader-anki-rendered-side-body\s*\{[^}]*overflow:\s*visible;/);
    expect(LOCAL_DICTIONARY_CSS)
        .toMatch(/\.jpdb-reader-anki-rendered-side\s*\+\s*\.jpdb-reader-anki-rendered-side\s*\{[^}]*border-top:\s*1px solid/);
    expect(LOCAL_DICTIONARY_CSS)
        .toMatch(/\.jpdb-reader-anki-rendered-card\s*\+\s*\.jpdb-reader-anki-rendered-card\s*\{[^}]*border-top:\s*1px solid/);
    expect(LOCAL_DICTIONARY_CSS)
        .toMatch(/\.jpdb-reader-anki-existing\s*>\s*summary\s*>\s*span\s*\{[^}]*text-transform:\s*none;/);
    expect(LOCAL_DICTIONARY_CSS)
        .not.toMatch(/\.jpdb-reader-anki(?:-[^{]+)?\s*\{[^}]*text-transform:\s*uppercase;/);
}

function expectNoNestedScrollStyles(root: ParentNode): void {
    root.querySelectorAll<HTMLElement>('[style]').forEach(element => {
        expect(element.getAttribute('style')).not.toMatch(/(?:max-height|overflow|overscroll-behavior)\s*:/i);
    });
}

function expectNoHugeInlineFontLeak(root: ParentNode): void {
    root.querySelectorAll<HTMLElement>('[style]').forEach(element => {
        expect(element.getAttribute('style')).not.toMatch(/font(?:-size)?\s*:\s*(?:[4-9]\d|[1-9]\d{2,})px/i);
        expect(element.getAttribute('style')).not.toMatch(/font(?:-size)?\s*:\s*[3-9](?:\.\d+)?rem/i);
    });
}

function ankiRenderSettings(): ReaderSettings {
    return {
        ...DEFAULT_SETTINGS,
        interfaceLanguage: 'en',
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

function existingAnkiNote(overrides: Partial<AnkiExistingNote> = {}): AnkiExistingNote {
    return {
        noteId: 99,
        modelName: 'Yomu Japanese',
        deckNames: ['Mining'],
        cardIds: [123],
        primaryCardId: 123,
        state: 'due',
        fields: {
            Expression: '日本語',
            Reading: 'にほんご',
            Meaning: 'Japanese language',
        },
        renderedCards: [],
        tags: [],
        reps: 3,
        lapses: 0,
        ...overrides,
    };
}
