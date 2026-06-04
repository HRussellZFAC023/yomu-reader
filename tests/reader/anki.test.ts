import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnkiConnectClient, canFetchAnkiConnectFrom, needsHostedAnkiConnectSetupHint, type AnkiExistingNote, type AnkiLookupResult } from '../../src/reader/anki';
import { renderAnkiExistingSection } from '../../src/reader/anki-render';
import { uiText } from '../../src/reader/i18n';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, ReaderSettings } from '../../src/reader/types';

const LOCAL_DICTIONARY_CSS = readFileSync('src/reader/styles/local-dictionaries.css', 'utf8');

afterEach(() => {
    vi.restoreAllMocks();
});

describe('AnkiConnect browser fetch eligibility', () => {
    it('keeps hosted loopback AnkiConnect requests on the userscript bridge path', () => {
        expect(canFetchAnkiConnectFrom(
            'http://127.0.0.1:8765',
            'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html',
        )).toBe(false);
        expect(canFetchAnkiConnectFrom(
            'http://localhost:8765',
            'https://hrussellzfac023.github.io/yomu-reader/newtab/',
        )).toBe(false);
    });

    it('lets the hosted new-tab app contact a non-local configured AnkiConnect endpoint', () => {
        expect(canFetchAnkiConnectFrom(
            'http://tailscale-host.ts.net:8765',
            'https://hrussellzfac023.github.io/yomu-reader/newtab/',
        )).toBe(true);
    });

    it('keeps arbitrary content pages on the userscript request bridge path', () => {
        expect(canFetchAnkiConnectFrom(
            'http://127.0.0.1:8765',
            'https://example.com/article',
        )).toBe(false);
    });

    it('keeps local development pages able to fetch AnkiConnect directly', () => {
        expect(canFetchAnkiConnectFrom(
            'http://127.0.0.1:8765',
            'http://127.0.0.1:5174/newtab/',
        )).toBe(true);
    });

    it('shows the hosted setup hint only for standalone hosted AnkiConnect requests', () => {
        expect(needsHostedAnkiConnectSetupHint(
            'http://127.0.0.1:8765',
            'https://hrussellzfac023.github.io/yomu-reader/newtab/',
        )).toBe(true);
        expect(uiText('en', 'ankiHostedCorsHint')).toContain('Optional advanced setup');
        expect(uiText('en', 'ankiHostedCorsHint')).toContain('webCorsOriginList');
        expect(needsHostedAnkiConnectSetupHint(
            'http://127.0.0.1:8765',
            'http://127.0.0.1:5174/newtab/',
        )).toBe(false);
    });
});

describe('Anki existing-card lookup', () => {
    it('matches a kana page term to an existing kanji Anki note by reading', async () => {
        const ankiConnectUrl = `${window.location.origin}/anki-connect`;
        const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body ?? '{}')) as { action: string; params?: Record<string, unknown> };
            const resultForAction = (): unknown => {
                if (body.action === 'multi') {
                    const actions = body.params?.actions as Array<{ action: string; params?: Record<string, unknown> }>;
                    return actions.map(action => ({
                        result: action.action === 'findNotes' && action.params?.query === '"よむ"' ? [959] : [],
                        error: null,
                    }));
                }
                if (body.action === 'notesInfo') {
                    return [{
                        noteId: 959,
                        modelName: 'Simple Model',
                        tags: ['core'],
                        cards: [123],
                        fields: {
                            Japanese_Word: { value: '読む' },
                            Readings: { value: 'よむ' },
                            Translation_1: { value: 'to read' },
                        },
                    }];
                }
                if (body.action === 'cardsInfo') {
                    return [{
                        cardId: 123,
                        note: 959,
                        deckName: 'Vocab 2k',
                        queue: 2,
                        type: 2,
                        due: 0,
                        reps: 12,
                        lapses: 1,
                        question: '<div>読む</div>',
                        answer: '<div>to read</div>',
                    }];
                }
                if (body.action === 'areDue') return [true];
                throw new Error(`Unexpected Anki action: ${body.action}`);
            };
            return new Response(JSON.stringify({ result: resultForAction(), error: null }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        });
        vi.stubGlobal('fetch', fetchMock);

        const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, interfaceLanguage: 'en', ankiConnectUrl }));
        const result = await client.findExistingCards(jpdbCard({ spelling: 'よむ', reading: '' }));

        expect(result.state).toBe('due');
        expect(result.primary?.noteId).toBe(959);
        expect(result.primary?.fields.Japanese_Word).toBe('読む');
        expect(result.primary?.fields.Readings).toBe('よむ');
        expect(fetchMock).toHaveBeenCalledWith(
            ankiConnectUrl,
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('does not match a kanji page term to a different expression with the same reading', async () => {
        const ankiConnectUrl = `${window.location.origin}/anki-connect`;
        vi.stubGlobal('fetch', vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body ?? '{}')) as { action: string; params?: Record<string, unknown> };
            const resultForAction = (): unknown => {
                if (body.action === 'multi') {
                    const actions = body.params?.actions as Array<{ action: string; params?: Record<string, unknown> }>;
                    return actions.map(action => ({
                        result: action.action === 'findNotes' && action.params?.query === '"うる"' ? [960] : [],
                        error: null,
                    }));
                }
                if (body.action === 'notesInfo') {
                    return [{
                        noteId: 960,
                        modelName: 'Simple Model',
                        tags: [],
                        cards: [124],
                        fields: {
                            Japanese_Word: { value: '得る' },
                            Readings: { value: 'うる' },
                            Translation_1: { value: 'to obtain' },
                        },
                    }];
                }
                if (body.action === 'cardsInfo') {
                    return [{
                        cardId: 124,
                        note: 960,
                        deckName: 'Vocab 2k',
                        queue: 2,
                        type: 2,
                        due: 0,
                    }];
                }
                if (body.action === 'areDue') return [true];
                throw new Error(`Unexpected Anki action: ${body.action}`);
            };
            return new Response(JSON.stringify({ result: resultForAction(), error: null }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }));

        const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, interfaceLanguage: 'en', ankiConnectUrl }));
        const result = await client.findExistingCards(jpdbCard({ spelling: '売る', reading: 'うる' }));

        expect(result.state).toBe('not-in-deck');
        expect(result.primary).toBeNull();
    });
});

describe('Anki rendered card scroll behavior', () => {
    it('lets the popover own scrolling for rendered Anki cards', () => {
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-rendered-side-body\s*\{[^}]*max-height:\s*none;/);
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-rendered-side-body\s*\{[^}]*overflow:\s*visible;/);
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-rendered-side-body\s*\{[^}]*overscroll-behavior:\s*contain;/);
    });

    it('keeps rendered-card content as an inline lane instead of a nested card', () => {
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-source-card\s*>\s*\.jpdb-reader-anki-card-preview\s*\{[^}]*background:\s*transparent;/);
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-rendered-side-body\s*\{[^}]*border-left:\s*2px solid/);
        expect(LOCAL_DICTIONARY_CSS)
            .not.toMatch(/\.jpdb-reader-anki-rendered-side-body\s*\{[^}]*border:\s*1px solid/);
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-rendered-side\s*\+\s*\.jpdb-reader-anki-rendered-side\s*\{[^}]*border-top:\s*1px solid/);
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-rendered-card\s*\+\s*\.jpdb-reader-anki-rendered-card\s*\{[^}]*border-top:\s*1px solid/);
    });

    it('keeps Anki labels readable without forcing Yomu-style uppercase', () => {
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-existing\s*>\s*summary\s*>\s*span\s*\{[^}]*text-transform:\s*none;/);
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-field\s*>\s*strong,\s*\.jpdb-reader-anki-context\s*>\s*strong\s*\{[^}]*color:\s*var\(--jpdb-reader-muted\);/);
        expect(LOCAL_DICTIONARY_CSS)
            .not.toMatch(/\.jpdb-reader-anki-field\s*>\s*strong,[^}]*text-transform:\s*uppercase;/);
        expect(LOCAL_DICTIONARY_CSS)
            .not.toMatch(/\.jpdb-reader-anki-audio-merge span\s*\{[^}]*text-transform:\s*uppercase;/);
    });

    it('keeps multiple Anki notes collapsible with stable summary lanes', () => {
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-existing-note-title\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto\s*20px;/);
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-existing-note-title::after\s*\{[^}]*content:\s*"\+";/);
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-existing-note\[open\]\s*>\s*\.jpdb-reader-anki-existing-note-title::after\s*\{[^}]*content:\s*"-";/);
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-existing-note-title small\s*\{[^}]*text-overflow:\s*ellipsis;/);
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-match-summary-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto;/);
    });

    it('keeps multiple rendered Anki cards collapsible without adding labels to card bodies', () => {
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-rendered-card-title\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*20px;/);
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-rendered-card-title::after\s*\{[^}]*content:\s*"\+";/);
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-rendered-card\[open\]\s*>\s*\.jpdb-reader-anki-rendered-card-title::after\s*\{[^}]*content:\s*"-";/);
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-rendered-side-body :is\(h1, h2, h3, h4, h5, h6\)\s*\{[^}]*font-size:\s*clamp\(16px,\s*1\.35em,\s*30px\);/);
    });

    it('caps rendered-card media and keeps Anki audio as separate controls', () => {
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-rendered-side-body\s*\{[^}]*font-size:\s*14px;/);
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-rendered-side-body\s*\*\s*\{[^}]*max-height:\s*min\(70vh,\s*420px\);/);
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-rendered-side-body :where\(\*\)\s*\{[^}]*font-size:\s*min\(1em,\s*30px\);/);
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-rendered-side-body audio\[data-anki-media-name\]\s*\{[^}]*display:\s*none;/);
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-sound\s*\{[^}]*display:\s*inline-flex;/);
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-sound\s*\{[^}]*background:\s*color-mix\(in srgb,\s*var\(--jpdb-reader-surface\)\s*78%,\s*var\(--jpdb-reader-state-known\)\s*22%\);/);
    });
});

describe('Anki rendered card details', () => {
    it('renders stored fields instead of a pending state when rendered card HTML is blank', () => {
        const note = existingAnkiNote({
            fields: {
                Expression: '日本語',
                Meaning: 'Japanese language',
                Audio: '[sound:nihongo.mp3]',
            },
            renderedCards: [{ cardId: 123, deckName: 'Mining', question: ' ', answer: '' }],
        });
        const section = renderExistingAnkiSection(note);

        expect(section.querySelector('.jpdb-reader-anki-details-pending')).toBeNull();
        expect(section.querySelector('.jpdb-reader-anki-stored-fields')?.textContent).toContain('Japanese language');
        const audio = section.querySelector<HTMLButtonElement>('[data-action="anki-media-audio"][data-anki-media-name="nihongo.mp3"]');
        expect(audio?.textContent).toBe('Card audio');
    });

    it('falls back to stored fields when a rendered card is only an empty template shell', () => {
        const note = existingAnkiNote({
            fields: {
                Expression: '泳ぐ',
                Reading: 'およぐ',
                Meaning: 'to swim',
            },
            renderedCards: [{
                cardId: 321,
                deckName: 'Sentence Mining',
                question: '<div class="card"><span class="front"></span></div><script>renderCard()</script>',
                answer: '<section><div></div></section>',
            }],
        });
        const section = renderExistingAnkiSection(note);

        expect(section.querySelector('.jpdb-reader-anki-rendered-card')).toBeNull();
        expect(section.querySelector('.jpdb-reader-anki-details-pending')).toBeNull();
        expect(section.querySelector('.jpdb-reader-anki-stored-fields')?.textContent).toContain('to swim');
    });

    it('keeps media-only rendered cards visible instead of falling back to fields', () => {
        const note = existingAnkiNote({
            fields: {
                Expression: '写真',
                Meaning: 'photo',
            },
            renderedCards: [{
                cardId: 654,
                deckName: 'Visual Mining',
                question: '<div><img src="photo.jpg" alt=""></div>',
                answer: '',
            }],
        });
        const section = renderExistingAnkiSection(note);

        expect(section.querySelector('.jpdb-reader-anki-rendered-card')).not.toBeNull();
        expect(section.querySelector('.jpdb-reader-anki-stored-fields')).toBeNull();
        expect(section.querySelector<HTMLImageElement>('img')?.dataset.ankiMediaName).toBe('photo.jpg');
    });

    it('turns literal sound markers in rendered card HTML into Anki audio controls', () => {
        const note = existingAnkiNote({
            fields: { Audio: '[sound:nihongo.mp3]' },
            renderedCards: [{
                cardId: 456,
                deckName: 'Mining',
                question: '<div>日本語 [sound:nihongo.mp3]</div>',
                answer: '<span>Japanese language</span>',
            }],
        });
        const section = renderExistingAnkiSection(note);
        const renderedBody = section.querySelector<HTMLElement>('.jpdb-reader-anki-rendered-side-body');
        const audio = renderedBody?.querySelector<HTMLButtonElement>('[data-action="anki-media-audio"][data-anki-media-name="nihongo.mp3"]');

        expect(renderedBody?.textContent).not.toContain('[sound:nihongo.mp3]');
        expect(audio?.textContent).toBe('Card audio');
        expect(audio?.title).toBe('Audio nihongo.mp3');
    });

    it('renders multiple Anki cards as collapsible separators while preserving card content', () => {
        const note = existingAnkiNote({
            primaryCardId: 456,
            cardIds: [123, 456],
            renderedCards: [
                { cardId: 123, deckName: 'Mining', question: '<div>日本語</div>', answer: '<div>Japanese</div>' },
                { cardId: 456, deckName: 'Mining', question: '<div>Japanese</div>', answer: '<div>日本語</div>' },
            ],
        });
        const section = renderExistingAnkiSection(note);
        const renderedCards = [...section.querySelectorAll<HTMLElement>('.jpdb-reader-anki-rendered-card')];
        const summaries = [...section.querySelectorAll<HTMLElement>('.jpdb-reader-anki-rendered-card-title')];

        expect(renderedCards).toHaveLength(2);
        expect(renderedCards.map(element => element.dataset.ankiRenderedCardId)).toEqual(['456', '123']);
        expect(renderedCards[0]?.tagName).toBe('DETAILS');
        expect(renderedCards[0]?.hasAttribute('open')).toBe(true);
        expect(renderedCards[1]?.hasAttribute('open')).toBe(false);
        expect(summaries).toHaveLength(2);
        expect(section.querySelector('.jpdb-reader-anki-rendered-side-body')?.textContent).toContain('Japanese');
    });

    it('caps oversized Anki inline font declarations without flattening normal card text', () => {
        const note = existingAnkiNote({
            renderedCards: [{
                cardId: 789,
                deckName: 'Mining',
                question: '<div style="font-size: 96px">Big</div><p style="font: 72px serif">Huge</p><span>Normal</span>',
                answer: '',
            }],
        });
        const section = renderExistingAnkiSection(note);
        const body = section.querySelector<HTMLElement>('.jpdb-reader-anki-rendered-side-body')!;

        expect(body.innerHTML).toContain('font-size: 30px');
        expect(body.innerHTML).not.toContain('96px');
        expect(body.innerHTML).not.toContain('72px');
        expect(body.textContent).toContain('Normal');
    });

    it('does not duplicate Anki fronts when an answer already contains the question', () => {
        const note = existingAnkiNote({
            modelName: 'RRTK Recognition Remembering The Kanji v2',
            deckNames: ['RRTK Recognition Remembering The Kanji v2'],
            fields: {
                Kanji: '読',
                Keyword: 'read',
                Story: "People will say almost anything to sell you something; don't believe everything you read.",
            },
            renderedCards: [{
                cardId: 1300,
                deckName: 'RRTK Recognition Remembering The Kanji v2',
                question: '<div class="rtk-kanji" style="font-size: 96px">読 読</div><div class="rtk-kanji" style="font-size: 96px">読 読</div>',
                answer: '<div class="rtk-kanji" style="font-size: 96px">読 読</div><div class="rtk-kanji" style="font-size: 96px">読 読</div><hr><strong>read</strong><p>People will say almost anything to <em>sell</em> you something; do not believe everything you <strong>read</strong>.</p>',
            }],
        });
        const section = renderExistingAnkiSection(note);
        const bodies = [...section.querySelectorAll<HTMLElement>('.jpdb-reader-anki-rendered-side-body')];

        expect(bodies).toHaveLength(1);
        expect(bodies[0]?.textContent).toContain('read');
        expect(bodies[0]?.innerHTML).not.toContain('96px');
        expect(section.querySelector('.jpdb-reader-anki-existing > summary')?.textContent).toContain('RRTK Recognition Remembering The Kanji v2');
    });

    it('keeps Core-style Anki card media and audio distinct from lookup audio', () => {
        const note = existingAnkiNote({
            modelName: 'Core 2k/6k Optimized Japanese Vocabulary',
            deckNames: ['Vocab 2k'],
            fields: {
                Expression: '始める',
                Reading: 'はじめる',
                Meaning: 'to start',
                Audio: '[sound:core-start.mp3]',
            },
            renderedCards: [{
                cardId: 2050,
                deckName: 'Vocab 2k',
                question: '<div class="expression">始める</div><button>[sound:core-start.mp3]</button><img src="start.jpg">',
                answer: '<div class="expression">始める</div><button>[sound:core-start.mp3]</button><img src="start.jpg"><hr><div>Please start the test.</div>',
                mediaDataUrls: {
                    'start.jpg': 'data:image/jpeg;base64,start',
                },
            }],
        });
        const section = renderExistingAnkiSection(note);
        const body = section.querySelector<HTMLElement>('.jpdb-reader-anki-rendered-side-body')!;

        expect(body.querySelector<HTMLButtonElement>('[data-action="anki-media-audio"][data-anki-media-name="core-start.mp3"]')).not.toBeNull();
        expect(body.querySelector<HTMLImageElement>('img')?.src).toBe('data:image/jpeg;base64,start');
        expect(body.textContent).toContain('Please start the test.');
        expect(section.textContent).not.toContain('WORD AUDIO');
    });

    it('summarizes multiple existing Anki matches by deck model kind and status', () => {
        const word = existingAnkiNote({
            noteId: 101,
            modelName: 'Core 2k',
            deckNames: ['Vocab 2k'],
            state: 'due',
            reps: 12,
        });
        const kanji = existingAnkiNote({
            noteId: 102,
            modelName: 'RRTK Recognition',
            deckNames: ['RRTK'],
            state: 'new',
            fields: {
                Kanji: '下',
                On: 'カ',
                Keyword: 'below',
            },
            reps: 0,
        });
        const lookup: AnkiLookupResult = { state: 'due', primary: word, notes: [word, kanji], trusted: true };
        const container = document.createElement('div');
        container.innerHTML = renderAnkiExistingSection(lookup, null, ankiRenderSettings());

        const summary = container.querySelector<HTMLElement>('.jpdb-reader-anki-match-summary');
        expect(summary?.textContent).toContain('Vocab 2k · Core 2k · Word');
        expect(summary?.textContent).toContain('RRTK · RRTK Recognition · Kanji');
        expect(summary?.textContent).toContain('Due');
        expect(summary?.textContent).toContain('New');
    });
});

function renderExistingAnkiSection(note: AnkiExistingNote, settings: ReaderSettings = ankiRenderSettings()): HTMLElement {
    const lookup: AnkiLookupResult = { state: note.state, notes: [note], primary: note, trusted: true };
    const container = document.createElement('div');
    container.innerHTML = renderAnkiExistingSection(lookup, null, settings);
    const section = container.querySelector<HTMLElement>('.jpdb-reader-anki-existing');
    if (!section) throw new Error('Expected rendered Anki section');
    return section;
}

function ankiRenderSettings(): ReaderSettings {
    return {
        ...DEFAULT_SETTINGS,
        interfaceLanguage: 'en',
        enableReviews: false,
    };
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

function jpdbCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 1,
        sid: 0,
        rid: 0,
        spelling: '日本語',
        reading: 'にほんご',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [{ glosses: ['Japanese language'], partOfSpeech: [] }],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'local',
        ...overrides,
    };
}
