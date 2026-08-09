// The furigana dead tap band.
//
// A reader aims at what a reader can see, and above every annotated word that is
// the READING. Two separate mechanisms made that whole horizontal strip inert:
//
//   1. in-place ruby: the full stylesheet pinned `.jpdb-reader-word rt` to
//      pointer-events:none, so the press hit-tested to the paragraph behind the
//      annotation. A word is display:inline, so its own client rects never cover
//      its ruby, and every rect-based fallback in the pointer path missed it too;
//   2. projected readings: on mirrored/OCR/scrolled surfaces the reading is a
//      clone re-rooted into a paint-only overlay layer. Nothing structurally
//      connects the clone a reader presses to the word it annotates.
//
// jsdom cannot hit-test, so nothing here pretends to. These exercise the
// resolution FUNCTIONS and the pointer-path WIRING: which element the reader
// pressed is stated outright (the event target, or a stubbed painted rect), and
// what is asserted is which word that press resolves to.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';
import { applyTokensToScanTarget, collectTextTargetsIn, removeNonDestructiveScanMirrors } from '../../src/reader/dom';
import {
    clearProjectedReadings,
    projectedReadingWordAtPoint,
    syncProjectedReadings,
} from '../../src/reader/dom/detached-reading-overlay-impl';
import { registerYomuCompanion, yomuAnnotationsCompanion } from '../../src/reader/companions/registry';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

const CARD: JPDBCard = {
    vid: 1,
    sid: 1,
    rid: 0,
    spelling: '',
    reading: '',
    frequencyRank: null,
    partOfSpeech: [],
    meanings: [],
    cardState: ['not-in-deck'],
    pitchAccent: [],
    wordWithReading: null,
    source: 'jpdb',
};

afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    document.body.replaceChildren();
    Reflect.deleteProperty(document, 'elementsFromPoint');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("a word's own furigana resolves to the word", () => {
    it('resolves a press whose target is the rt to the owning word', () => {
        const word = annotateSentence('詳細を読む', [token('詳細', 0, 2, 'しょうさい')]);
        const reading = word.querySelector<HTMLElement>('rt.jpdb-reader-furi');
        expect(reading?.textContent).toBe('しょうさい');

        const { internals, app } = readerAppInternals();
        try {
            // The CSS half of the fix (pointer-events: inherit, asserted in
            // styles.test.ts) is what makes the rt the event target at all. Given
            // that target, resolution needs no geometry whatsoever: the rt box
            // belongs to exactly one word.
            const resolved = internals.readerWordForPointerEvent(
                mouseEventOn(reading!, 'click', 40, 12),
                { clickLookup: true },
            );

            expect(resolved).toBe(word);
            expect(resolved?.dataset.expression).toBe('詳細');
        } finally {
            app.destroy();
        }
    });

    it('resolves a press on the ruby base to the same word, so both halves agree', () => {
        const word = annotateSentence('詳細を読む', [token('詳細', 0, 2, 'しょうさい')]);
        const base = word.querySelector<HTMLElement>('.jpdb-reader-ruby-base') ?? word;

        const { internals, app } = readerAppInternals();
        try {
            expect(internals.readerWordForPointerEvent(mouseEventOn(base, 'click', 40, 24), { clickLookup: true })).toBe(word);
        } finally {
            app.destroy();
        }
    });
});

describe('a projected reading resolves to the word it annotates', () => {
    it('answers with the owning word for a point inside the painted band', () => {
        const { word, owner, anchor, source } = projectedWordFixture('しょうさい');
        paint(owner, anchor, source, { left: 40, top: 24, width: 60, height: 20 }, { left: 44, top: 8, width: 52, height: 12 });

        try {
            // Dead centre of the reading — the band that used to do nothing.
            expect(projectedReadingWordAtPoint(document, 70, 14)).toBe(word);
            // The clone is a COPY: the answer has to be the real word in the page,
            // never the clone that was pressed.
            expect(projectedReadingWordAtPoint(document, 70, 14)?.dataset.expression).toBe('詳細');
        } finally {
            clearProjectedReadings(owner);
        }
    });

    it('answers with nothing outside the painted band, so the page keeps its press', () => {
        const { owner, anchor, source } = projectedWordFixture('しょうさい');
        paint(owner, anchor, source, { left: 40, top: 24, width: 60, height: 20 }, { left: 44, top: 8, width: 52, height: 12 });

        try {
            expect(projectedReadingWordAtPoint(document, 70, 40)).toBeNull();
            expect(projectedReadingWordAtPoint(document, 200, 14)).toBeNull();
        } finally {
            clearProjectedReadings(owner);
        }
    });

    it('does not answer for a reading that is not painting', () => {
        const { owner, anchor, source } = projectedWordFixture('しょうさい');
        // display:none collapses the clone's box; a stale record must not keep
        // claiming presses in a band nothing is drawn in.
        paint(owner, anchor, source, { left: 40, top: 24, width: 60, height: 20 }, { left: 0, top: 0, width: 0, height: 0 });

        try {
            expect(projectedReadingWordAtPoint(document, 70, 14)).toBeNull();
        } finally {
            clearProjectedReadings(owner);
        }
    });

    it('respects the caller filter, so lookup permission still decides', () => {
        const { word, owner, anchor, source } = projectedWordFixture('しょうさい');
        paint(owner, anchor, source, { left: 40, top: 24, width: 60, height: 20 }, { left: 44, top: 8, width: 52, height: 12 });

        try {
            expect(projectedReadingWordAtPoint(document, 70, 14, () => false)).toBeNull();
            expect(projectedReadingWordAtPoint(document, 70, 14, candidate => candidate === word)).toBe(word);
        } finally {
            clearProjectedReadings(owner);
        }
    });

    it('answers with the nearest reading when two bands overlap', () => {
        const first = projectedWordFixture('しょうさい', '詳細');
        const second = projectedWordFixture('よ', '読');
        paint(first.owner, first.anchor, first.source, { left: 0, top: 24, width: 40, height: 20 }, { left: 0, top: 8, width: 60, height: 12 });
        paint(second.owner, second.anchor, second.source, { left: 40, top: 24, width: 40, height: 20 }, { left: 30, top: 8, width: 60, height: 12 });

        try {
            // x=55 sits in both bands (centres 30 and 60): the nearer centre wins
            // rather than whichever record happens to be iterated first.
            expect(projectedReadingWordAtPoint(document, 55, 14)).toBe(second.word);
            expect(projectedReadingWordAtPoint(document, 20, 14)).toBe(first.word);
        } finally {
            clearProjectedReadings(first.owner);
            clearProjectedReadings(second.owner);
        }
    });
});

describe('the pointer path consults projected readings', () => {
    it('opens the projected reading owner when no word covers the point', () => {
        // The seam under test is the wiring: core reaches projected readings
        // through the annotations companion, so a stub companion proves the
        // pointer path asks it — and asks it with the pressed coordinates.
        document.body.innerHTML = '<p id="prose">詳細を読む</p>';
        const owner = document.createElement('span');
        owner.className = 'jpdb-reader-word';
        owner.dataset.expression = '詳細';
        owner.dataset.vid = '1';
        owner.dataset.sid = '1';
        document.body.append(owner);
        const projectedReadingWordAtPointStub = vi.fn(() => owner);
        const restoreAnnotations = stubProjectedReadingResolution(projectedReadingWordAtPointStub);

        const prose = document.getElementById('prose')!;
        const { internals, app } = readerAppInternals();
        try {
            // The press lands on plain prose: the reader's own paragraph is the
            // event target, exactly as it is when a pointer-events:none clone is
            // painted over the page.
            const resolved = internals.readerWordForPointerEvent(mouseEventOn(prose, 'click', 70, 14), { clickLookup: true });

            expect(resolved).toBe(owner);
            expect(projectedReadingWordAtPointStub).toHaveBeenCalledWith(document, 70, 14, expect.any(Function));
        } finally {
            app.destroy();
            restoreAnnotations();
        }
    });

    it('never overrides a word the pointer is genuinely inside', () => {
        const word = annotateSentence('詳細を読む', [token('詳細', 0, 2, 'しょうさい')]);
        const wrongWord = document.createElement('span');
        wrongWord.className = 'jpdb-reader-word';
        wrongWord.dataset.expression = 'まちがい';
        document.body.append(wrongWord);
        const projectedReadingWordAtPointStub = vi.fn(() => wrongWord);
        const restoreAnnotations = stubProjectedReadingResolution(projectedReadingWordAtPointStub);

        const { internals, app } = readerAppInternals();
        try {
            const resolved = internals.readerWordForPointerEvent(
                mouseEventOn(word.querySelector<HTMLElement>('rt.jpdb-reader-furi')!, 'click', 40, 12),
                { clickLookup: true },
            );

            expect(resolved).toBe(word);
            expect(projectedReadingWordAtPointStub).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            restoreAnnotations();
        }
    });
});

/**
 * Replace ONLY the resolution seam, and put the real companion back afterwards.
 * The companion registry lives on globalThis, so a stub left behind here would
 * silently un-register projected readings for later cases in this file. The
 * release runner also enforces per-file isolation as a second boundary.
 */
function stubProjectedReadingResolution(stub: () => HTMLElement | null): () => void {
    const annotations = yomuAnnotationsCompanion();
    expect(annotations, 'tests/reader/setup.ts should have registered the annotations companion').toBeTruthy();
    registerYomuCompanion('annotations', { ...annotations!, projectedReadingWordAtPoint: stub as never });
    return () => registerYomuCompanion('annotations', annotations!);
}

function readerAppInternals(): {
    app: ReaderApp;
    internals: {
        readerWordForPointerEvent(event: MouseEvent, options: { hoverLookup?: boolean; clickLookup?: boolean }): HTMLElement | null;
    };
} {
    const app = new ReaderApp();
    const internals = app as unknown as {
        settings: typeof DEFAULT_SETTINGS;
        ocr: { pinLineForElement: () => void; destroy: () => void };
        readerWordForPointerEvent(event: MouseEvent, options: { hoverLookup?: boolean; clickLookup?: boolean }): HTMLElement | null;
    };
    internals.settings = { ...DEFAULT_SETTINGS, lookupOnClick: true };
    internals.ocr = { pinLineForElement: vi.fn(), destroy: vi.fn() };
    return { app, internals };
}

/** An in-place annotated word with real ruby, rendered by the real renderer. */
function annotateSentence(sentence: string, tokens: JPDBToken[]): HTMLElement {
    document.body.innerHTML = `<p id="prose">${sentence}</p>`;
    const target = collectTextTargetsIn(document.getElementById('prose')!, 20, false)
        .find(candidate => candidate.text === sentence);
    expect(target).toBeTruthy();
    applyTokensToScanTarget(target!, tokens, { ...DEFAULT_SETTINGS, furiganaMode: 'all', showFurigana: true });
    const word = document.querySelector<HTMLElement>(`#prose .jpdb-reader-word[data-expression="${tokens[0].card.spelling}"]`);
    expect(word).toBeTruthy();
    return word!;
}

/** A word whose reading is projected into the overlay rather than laid out in it. */
function projectedWordFixture(reading: string, expression = '詳細'): {
    word: HTMLElement;
    owner: HTMLElement;
    anchor: HTMLElement;
    source: HTMLElement;
} {
    const anchor = document.createElement('div');
    const owner = document.createElement('span');
    owner.className = 'jpdb-reader-text-mirror jpdb-reader-additive-text-mirror';
    const word = document.createElement('span');
    word.className = 'jpdb-reader-word jpdb-reader-scan-word';
    word.dataset.expression = expression;
    word.dataset.vid = '1';
    word.dataset.sid = '1';
    const source = document.createElement('span');
    source.className = 'jpdb-reader-furi';
    source.textContent = reading;
    word.append(source);
    owner.append(word);
    anchor.append(owner);
    document.body.append(anchor);
    return { word, owner, anchor, source };
}

interface RectLike {
    left: number;
    top: number;
    width: number;
    height: number;
}

/**
 * Project one reading and state where its clone paints. jsdom measures nothing,
 * so the painted band is stubbed on the clone — the one geometry primitive the
 * resolver reads — instead of faking a hit test that would prove nothing.
 */
function paint(owner: HTMLElement, anchor: HTMLElement, source: HTMLElement, wordRect: RectLike, bandRect: RectLike): void {
    anchor.getBoundingClientRect = () => domRect(wordRect);
    Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: vi.fn(() => [anchor]) });
    syncProjectedReadings(owner, [{
        source,
        anchor,
        rect: domRect(wordRect),
        measure: () => domRect(wordRect),
    }]);
    const clone = [...document.querySelectorAll<HTMLElement>('[data-yomu-projected-reading="true"]')]
        .find(candidate => candidate.textContent === source.textContent);
    expect(clone, 'the projection did not create a clone').toBeTruthy();
    clone!.getBoundingClientRect = () => domRect(bandRect);
}

function domRect({ left, top, width, height }: RectLike): DOMRect {
    return {
        left, top, width, height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => ({}),
    } as DOMRect;
}

function token(surface: string, start: number, end: number, reading = ''): JPDBToken {
    return {
        card: { ...CARD, spelling: surface, reading: reading || surface },
        start,
        end,
        length: end - start,
        // A ruby's `text` is the READING; its offsets are the base run it covers.
        rubies: reading ? [{ text: reading, start, end, length: end - start }] : [],
        pitchClass: 'heiban',
        sentence: '詳細を読む',
    };
}

function mouseEventOn(target: HTMLElement, type: string, clientX: number, clientY: number): MouseEvent {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, button: 0, clientX, clientY });
    Object.defineProperty(event, 'target', { configurable: true, value: target });
    return event;
}
