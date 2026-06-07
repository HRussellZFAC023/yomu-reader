import { readFileSync } from 'node:fs';
import { expect } from 'vitest';

import type { AnkiExistingNote, AnkiLookupResult } from '../../../src/reader/anki';
import { renderAnkiExistingSection } from '../../../src/reader/anki-render';
import type { ReaderSettings } from '../../../src/reader/types';

const LOCAL_DICTIONARY_CSS = readFileSync('src/reader/styles/local-dictionaries.css', 'utf8');

export function renderExistingAnkiLookup(notes: AnkiExistingNote[], settings: ReaderSettings): HTMLElement {
    const primary = notes[0] ?? null;
    const lookup: AnkiLookupResult = { state: primary?.state ?? 'not-in-deck', notes, primary, trusted: true };
    const container = document.createElement('div');
    container.innerHTML = renderAnkiExistingSection(lookup, null, settings);
    const section = container.querySelector<HTMLElement>('.jpdb-reader-anki-existing');
    if (!section) throw new Error('Expected rendered Anki section');
    return section;
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

export function expectRenderedAnkiPopoverScrollCss(): void {
    expectCssToMatch(
        /\.jpdb-reader-anki-rendered-side-body\s*\{[^}]*max-height:\s*none;/,
        /\.jpdb-reader-anki-rendered-side-body\s*\{[^}]*overflow:\s*visible;/,
        /\.jpdb-reader-anki-rendered-side-body\s*\{[^}]*overscroll-behavior:\s*contain;/,
    );
}

export function expectRenderedAnkiInlineLaneCss(): void {
    expectCssToMatch(
        /\.jpdb-reader-source-card\s*>\s*\.jpdb-reader-anki-card-preview\s*\{[^}]*background:\s*transparent;/,
        /\.jpdb-reader-anki-rendered-side-body\s*\{[^}]*border-left:\s*2px solid/,
    );
    expectCssNotToMatch(/\.jpdb-reader-anki-rendered-side-body\s*\{[^}]*border:\s*1px solid/);
    expectRenderedAnkiDividerCss();
}

export function expectReadableAnkiLabelCss(): void {
    expectReadableAnkiSummaryCss();
    expectCssToMatch(/\.jpdb-reader-anki-field\s*>\s*strong,\s*\.jpdb-reader-anki-context\s*>\s*strong\s*\{[^}]*color:\s*var\(--jpdb-reader-muted\);/);
    expectCssNotToMatch(
        /\.jpdb-reader-anki-field\s*>\s*strong,[^}]*text-transform:\s*uppercase;/,
        /\.jpdb-reader-anki-audio-merge span\s*\{[^}]*text-transform:\s*uppercase;/,
    );
}

export function expectCollapsibleAnkiNoteCss(): void {
    expectCssToMatch(
        /\.jpdb-reader-anki-existing-note-title\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto\s*20px;/,
        /\.jpdb-reader-anki-existing-note-title::after\s*\{[^}]*content:\s*"\+";/,
        /\.jpdb-reader-anki-existing-note\[open\]\s*>\s*\.jpdb-reader-anki-existing-note-title::after\s*\{[^}]*content:\s*"-";/,
        /\.jpdb-reader-anki-existing-note-title small\s*\{[^}]*text-overflow:\s*ellipsis;/,
        /\.jpdb-reader-anki-match-summary-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto;/,
    );
}

export function expectCollapsibleRenderedAnkiCardCss(): void {
    expectCssToMatch(
        /\.jpdb-reader-anki-rendered-card-title\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*20px;/,
        /\.jpdb-reader-anki-rendered-card-title::after\s*\{[^}]*content:\s*"\+";/,
        /\.jpdb-reader-anki-rendered-card\[open\]\s*>\s*\.jpdb-reader-anki-rendered-card-title::after\s*\{[^}]*content:\s*"-";/,
        /\.jpdb-reader-anki-rendered-side-body :is\(h1, h2, h3, h4, h5, h6\)\s*\{[^}]*font-size:\s*clamp\(16px,\s*1\.35em,\s*30px\);/,
    );
}

export function expectCappedRenderedAnkiMediaCss(): void {
    expectCssToMatch(
        /\.jpdb-reader-anki-rendered-side-body\s*\{[^}]*font-size:\s*14px;/,
        /\.jpdb-reader-anki-rendered-side-body\s+:is\(img,\s*video,\s*canvas,\s*svg\)\s*\{[^}]*max-height:\s*min\(70vh,\s*420px\);/,
        /\.jpdb-reader-anki-rendered-side-body :where\(\*\)\s*\{[^}]*font-size:\s*min\(1em,\s*30px\);/,
        /\.jpdb-reader-anki-rendered-side-body audio\[data-anki-media-name\]\s*\{[^}]*display:\s*none;/,
        /\.jpdb-reader-anki-sound svg\s*\{[^}]*stroke-width:\s*2\.6;/,
        /\.jpdb-reader-anki-sound\s*\{[^}]*background:\s*color-mix\(in srgb,\s*var\(--jpdb-reader-surface\)\s*78%,\s*var\(--jpdb-reader-state-known\)\s*22%\);/,
    );
    expectCssNotToMatch(/\.jpdb-reader-anki-rendered-side-body\s+\*\s*\{[^}]*max-height:/);
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
