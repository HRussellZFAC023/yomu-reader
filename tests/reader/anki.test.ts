import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { canFetchAnkiConnectFrom, needsHostedAnkiConnectSetupHint, type AnkiExistingNote, type AnkiLookupResult } from '../../src/reader/anki';
import { renderAnkiExistingSection } from '../../src/reader/anki-render';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { ReaderSettings } from '../../src/reader/types';

const LOCAL_DICTIONARY_CSS = readFileSync('src/reader/styles/local-dictionaries.css', 'utf8');

describe('AnkiConnect browser fetch eligibility', () => {
    it('lets the hosted new-tab app contact a configured AnkiConnect endpoint', () => {
        expect(canFetchAnkiConnectFrom(
            'http://127.0.0.1:8765',
            'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html',
        )).toBe(true);
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
        expect(needsHostedAnkiConnectSetupHint(
            'http://127.0.0.1:8765',
            'http://127.0.0.1:5174/newtab/',
        )).toBe(false);
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
    });

    it('caps rendered-card media and keeps Anki audio as separate controls', () => {
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-rendered-side-body\s*\{[^}]*font-size:\s*14px;/);
        expect(LOCAL_DICTIONARY_CSS)
            .toMatch(/\.jpdb-reader-anki-rendered-side-body\s*\*\s*\{[^}]*max-height:\s*min\(70vh,\s*420px\);/);
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
