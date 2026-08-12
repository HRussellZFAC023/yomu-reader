import { readFileSync } from 'node:fs';
import { expect } from 'vitest';

import type { AnkiExistingNote, AnkiLookupResult } from '../../../src/reader/anki/index';
import { renderAnkiExistingSection } from '../../../src/reader/anki/render';
import type { ReaderSettings } from '../../../src/reader/app/types';

const LOCAL_DICTIONARY_CSS = readFileSync('src/reader/styles/local-dictionaries.css', 'utf8');

export function renderExistingAnkiLookup(notes: AnkiExistingNote[], settings: ReaderSettings): HTMLElement {
    const lookup = existingAnkiLookup(notes);
    const container = document.createElement('div');
    container.innerHTML = renderAnkiExistingSection(lookup, null, settings, { trustedAccountDataSurface: true });
    const section = container.querySelector<HTMLElement>('.jpdb-reader-anki-existing');
    if (!section) throw new Error('Expected rendered Anki section');
    return section;
}

function existingAnkiLookup(notes: AnkiExistingNote[]): AnkiLookupResult {
    const primary = notes[0] ?? null;
    return { state: primary?.state ?? 'not-in-deck', notes, primary, trusted: true };
}

export function renderExistingAnkiNote(note: AnkiExistingNote, settings: ReaderSettings): HTMLElement {
    return renderExistingAnkiLookup([note], settings);
}

export function expectReadableRenderedAnkiSection(section: HTMLElement): void {
    const bodies = [...section.querySelectorAll<HTMLElement>('.jpdb-reader-anki-rendered-side-body')];
    expect(bodies.length).toBeGreaterThan(0);
    expectRenderedAnkiPopoverScrollCss();
    expectRenderedAnkiDividerCss();
    expectReadableAnkiSummaryCss();
    expectCssNotToMatch(/\.jpdb-reader-anki(?:-[^{]+)?\s*\{[^}]*text-transform:\s*uppercase;/);
}

export function expectFirstRenderedAnkiCardOpen(renderedCards: HTMLElement[]): void {
    expect(renderedCards[0]?.tagName).toBe('DETAILS');
    expect(renderedCards[0]?.hasAttribute('open')).toBe(true);
    expect(renderedCards[1]?.hasAttribute('open')).toBe(false);
}

function expectRenderedAnkiPopoverScrollCss(): void {
    expectCssToMatch(
        /\.jpdb-reader-anki-rendered-side-body\s*\{[^}]*max-height:\s*none;/,
        /\.jpdb-reader-anki-rendered-side-body\s*\{[^}]*overflow:\s*visible;/,
        /\.jpdb-reader-anki-rendered-side-body\s*\{[^}]*overscroll-behavior:\s*contain;/,
    );
}

function expectRenderedAnkiDividerCss(): void {
    expectCssToMatch(
        /\.jpdb-reader-anki-rendered-side\s*\+\s*\.jpdb-reader-anki-rendered-side\s*\{[^}]*border-top:\s*1px solid/,
        /\.jpdb-reader-anki-rendered-card\s*\+\s*\.jpdb-reader-anki-rendered-card\s*\{[^}]*border-top:\s*1px solid/,
    );
}

function expectReadableAnkiSummaryCss(): void {
    expectCssToMatch(/\.jpdb-reader-anki-existing\s*>\s*summary\s*>\s*span\s*\{[^}]*text-transform:\s*none;/);
}

function expectCssToMatch(...patterns: RegExp[]): void {
    patterns.forEach(pattern => expect(LOCAL_DICTIONARY_CSS).toMatch(pattern));
}

function expectCssNotToMatch(...patterns: RegExp[]): void {
    patterns.forEach(pattern => expect(LOCAL_DICTIONARY_CSS).not.toMatch(pattern));
}

export function expectNoNestedScrollStyles(root: ParentNode): void {
    root.querySelectorAll<HTMLElement>('[style]').forEach(element => {
        expect(element.getAttribute('style')).not.toMatch(/(?:max-height|overflow|overscroll-behavior)\s*:/i);
    });
}

export function expectNoHugeInlineFontLeak(root: ParentNode): void {
    root.querySelectorAll<HTMLElement>('[style]').forEach(element => {
        expect(element.getAttribute('style')).not.toMatch(/font(?:-size)?\s*:\s*(?:[4-9]\d|[1-9]\d{2,})px/i);
        expect(element.getAttribute('style')).not.toMatch(/font(?:-size)?\s*:\s*[3-9](?:\.\d+)?rem/i);
    });
}

export function existingAnkiNote(overrides: Partial<AnkiExistingNote> = {}): AnkiExistingNote {
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
