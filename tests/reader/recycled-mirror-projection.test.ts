import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    applyTokensToScanTarget,
    collectTextTargetsIn,
    NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT,
    projectAdditiveTextMirrors,
    removeNonDestructiveScanMirrors,
    withMirrorTokenApply,
} from '../../src/reader/dom';
import { applyPublicVocabularyFurigana } from '../../src/reader/app/dom-helpers';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

/**
 * A source-projected mirror paints nothing of its own: the status tint and the
 * pitch/status underline live in `.jpdb-reader-source-fragment` boxes stamped at
 * the exact client rects of the HOST's glyphs, and every reading is a clone in
 * the overlay measured from the same ranges. All of that is measured against the
 * host text the mirror was rendered from.
 *
 * YouTube reuses `#owner-sub-count` (and the watch-info line) for different
 * content while the mirror survives the stale-rescan grace. Every offset the
 * mirror holds then indexes a string that is gone — so the boxes must be taken
 * down, not left decorating whatever the recycler put in their place.
 */
const SUBS = 'チャンネル登録者数 2040人';
const RECYCLED = '高評価 5.2万件';

function card(spelling: string, reading: string): JPDBCard {
    return {
        vid: 1, sid: 1, rid: 0, spelling, reading, frequencyRank: null,
        partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [],
        wordWithReading: null, source: 'jpdb',
    };
}

function token(text: string, spelling: string, reading: string): JPDBToken {
    const start = text.indexOf(spelling);
    const end = start + spelling.length;
    return {
        card: card(spelling, reading),
        start,
        end,
        length: spelling.length,
        rubies: reading ? [{ text: reading, start, end, length: spelling.length }] : [],
        pitchClass: 'heiban',
        sentence: text,
    };
}

function rect(left: number, top = 50, width = 16, height = 16): DOMRect {
    return {
        left, top, width, height,
        right: left + width, bottom: top + height,
        x: left, y: top,
        toJSON: () => ({}),
    } as DOMRect;
}

// Host geometry for the ranges the projection asks about, keyed by the text the
// range actually selects — the only thing production code can ask jsdom for.
const RANGE_RECTS: Record<string, DOMRect[]> = {
    '登録者数': [rect(160, 50, 64)],
};

const rangeProto = Range.prototype as unknown as { getClientRects?: () => DOMRect[] };
const hadNativeRangeRects = 'getClientRects' in rangeProto;

function mount(reading = ''): { host: HTMLElement; mirror: HTMLElement } {
    document.body.innerHTML = `<span id="owner-sub-count">${SUBS}</span>`;
    const host = document.getElementById('owner-sub-count') as HTMLElement;
    Object.defineProperties(host, {
        getBoundingClientRect: { configurable: true, value: () => rect(100, 50, 200, 20) },
        clientWidth: { configurable: true, value: 200 },
        clientHeight: { configurable: true, value: 20 },
        offsetWidth: { configurable: true, value: 200 },
        offsetHeight: { configurable: true, value: 20 },
    });
    const collected = collectTextTargetsIn(host, 40, false)[0];
    applyTokensToScanTarget(
        { ...collected, parent: host, nonDestructive: true, passiveInteraction: true },
        [token(SUBS, '登録者数', reading)],
        { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' },
    );
    const mirror = host.querySelector<HTMLElement>('.jpdb-reader-additive-text-mirror');
    if (!mirror) throw new Error('no additive mirror mounted');
    Object.defineProperties(mirror, {
        getBoundingClientRect: { configurable: true, value: () => rect(100, 50, 200, 20) },
        offsetWidth: { configurable: true, value: 200 },
        offsetHeight: { configurable: true, value: 20 },
    });
    return { host, mirror };
}

const frame = (): Promise<void> => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

function recycleHostText(host: HTMLElement, next: string): void {
    const textNode = [...host.childNodes].find(node => node.nodeType === Node.TEXT_NODE) as Text;
    textNode.nodeValue = next;
}

function projectionState(mirror: HTMLElement): {
    fragments: string[];
    mirrorFlag: string | undefined;
    wordFlags: Array<string | undefined>;
    liftedRubies: number;
} {
    return {
        fragments: [...mirror.querySelectorAll<HTMLElement>('.jpdb-reader-source-fragment')]
            .map(fragment => fragment.style.left),
        mirrorFlag: mirror.dataset.yomuSourceProjected,
        wordFlags: [...mirror.querySelectorAll<HTMLElement>('.jpdb-reader-word')]
            .map(word => word.dataset.yomuSourceProjected),
        liftedRubies: [...mirror.querySelectorAll<HTMLElement>('.jpdb-reader-detached-ruby')]
            .filter(wrapper => wrapper.style.getPropertyValue('position') === 'absolute').length,
    };
}

beforeEach(() => {
    Object.defineProperty(rangeProto, 'getClientRects', {
        configurable: true,
        value(this: Range) { return RANGE_RECTS[this.toString()] ?? []; },
    });
});

afterEach(() => {
    if (!hadNativeRangeRects) delete rangeProto.getClientRects;
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
});

describe('recycled additive mirror projection', () => {
    it('drops the decoration a recycler stranded on the host new glyphs', async () => {
        const { host, mirror } = mount();
        projectAdditiveTextMirrors(document);
        await frame();
        expect(projectionState(mirror).fragments).toEqual(['60px']);

        let staleEvents = 0;
        const onStale = (): void => { staleEvents += 1; };
        document.addEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, onStale);
        recycleHostText(host, RECYCLED);
        // Let the host observer run: it marks the mirror stale and KEEPS it for
        // the rescan grace, which is exactly the window the decoration is wrong.
        await Promise.resolve();
        await frame();
        document.removeEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, onStale);
        expect(host.querySelector('.jpdb-reader-additive-text-mirror')).toBe(mirror);
        expect(mirror.dataset.sourceText).toBe(SUBS);
        // The surface is already queued for re-annotation, so dropping the
        // decoration costs nothing but the wrong paint.
        expect(staleEvents).toBeGreaterThan(0);

        // A scroll/resize/font settle during that grace.
        projectAdditiveTextMirrors(document);
        await frame();

        expect(projectionState(mirror)).toEqual({
            fragments: [],
            mirrorFlag: undefined,
            wordFlags: [undefined],
            liftedRubies: 0,
        });
    });

    it('drops it even when the recycler mutation never reaches the mirror observer', async () => {
        const { host, mirror } = mount();
        projectAdditiveTextMirrors(document);
        await frame();
        expect(projectionState(mirror).fragments).toEqual(['60px']);

        // A guarded token apply drains every live mirror observer's records, so a
        // page write landing in the same delivery turn is never reported and the
        // mirror is never marked stale — the indefinite variant of the same bug.
        withMirrorTokenApply(() => recycleHostText(host, RECYCLED));
        await Promise.resolve();
        await frame();
        expect(host.querySelector('.jpdb-reader-additive-text-mirror')).toBe(mirror);

        projectAdditiveTextMirrors(document);
        await frame();

        expect(projectionState(mirror)).toEqual({
            fragments: [],
            mirrorFlag: undefined,
            wordFlags: [undefined],
            liftedRubies: 0,
        });
    });

    it('takes the reading clone down with the decoration', async () => {
        const { host, mirror } = mount('とうろくしゃすう');
        projectAdditiveTextMirrors(document);
        await frame();
        expect([...document.querySelectorAll('[data-yomu-projected-reading="true"]')]
            .map(clone => clone.textContent)).toEqual(['とうろくしゃすう']);

        recycleHostText(host, RECYCLED);
        await Promise.resolve();
        await frame();
        projectAdditiveTextMirrors(document);
        await frame();

        expect(projectionState(mirror).fragments).toEqual([]);
        expect(document.querySelectorAll('[data-yomu-projected-reading="true"]')).toHaveLength(0);
    });

    // The other half of the same branch: a frame that merely cannot measure must
    // NOT tear the decoration down, or every collapsed/offscreen host would
    // flash undecorated and rebuild on the next settle.
    it('keeps the projection through an unmeasurable frame', async () => {
        const { mirror } = mount();
        projectAdditiveTextMirrors(document);
        await frame();
        expect(projectionState(mirror).fragments).toEqual(['60px']);

        Object.defineProperty(mirror, 'getBoundingClientRect', {
            configurable: true,
            value: () => rect(0, 0, 0, 0),
        });
        projectAdditiveTextMirrors(document);
        await frame();

        expect(projectionState(mirror).fragments).toEqual(['60px']);
        expect(mirror.dataset.yomuSourceProjected).toBe('true');
    });

    /**
     * Not a fix — a guard. Late enrichment reaching the overlay was reported as
     * broken ("the reading appears on the host but never on the screen"), and a
     * Chromium harness driving this exact transition (reading-free additive
     * mirror, then applyPublicVocabularyFurigana) could not reproduce it: the
     * clone appeared and 115 pixels changed above the word, before and after any
     * further settle pass. So this test asserts behaviour that already worked,
     * which is why it passes with any candidate "fix" removed. It still bites
     * for the thing that matters: deleting the projection scheduling from
     * replaceRenderedWordFurigana turns the clone into `undefined` here.
     */
    it('projects a reading enriched after the projection pass settled', async () => {
        const { mirror } = mount();
        projectAdditiveTextMirrors(document);
        await frame();
        expect(document.querySelectorAll('[data-yomu-projected-reading="true"]')).toHaveLength(0);

        const word = mirror.querySelector<HTMLElement>('.jpdb-reader-word.jpdb-reader-scan-word')!;
        applyPublicVocabularyFurigana(
            word,
            card('登録者数', 'とうろくしゃすう'),
            { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' },
        );
        await frame();
        await frame();

        const clone = document.querySelector<HTMLElement>('[data-yomu-projected-reading="true"]');
        expect(clone?.textContent).toBe('とうろくしゃすう');
        expect(clone?.style.display).toBe('block');
    });
});

describe('a stale additive mirror stops painting its own decoration lane', () => {
    /**
     * Taking the projection down is not enough on its own. An additive mirror
     * word carries its OWN pitch/status underline: styleAdditiveMirrorPaint
     * writes `--jpdb-reader-word-decoration-source` inline and
     * `.jpdb-reader-word::after` draws it, and that lane is suppressed only
     * WHILE the word is projected. Clearing the projection therefore hands the
     * word its underline back, and because it falls into the mirror's own flow
     * at the host's metrics it lands within a few pixels of where the stale
     * fragment was — the same wrong glyphs underlined. Measured in Chromium
     * before this guard: the blue border stayed at x 99.4-163.4 over 万件, with
     * only 24 of 41,600 pixels different.
     *
     * The lane is closed by zeroing the inline custom property rather than by a
     * stylesheet rule, deliberately: a rule suppressing `::after` on mirror
     * words is indistinguishable by text match from the retired bare-until-hover
     * behaviour, and `styles.test.ts` rightly forbids that shape. Zeroing the
     * source keeps the underline channel intact and merely gives it nothing to
     * paint, so chrome and passive words keep their at-rest underline.
     */
    it('zeroes the decoration source on a mirror whose host text was rewritten', async () => {
        const { host, mirror } = mount();
        projectAdditiveTextMirrors(document);
        await frame();
        const word = mirror.querySelector<HTMLElement>('.jpdb-reader-word');
        expect(word, 'fixture must produce a mirror word').toBeTruthy();

        // Stand in for a word whose pitch actually paints. jsdom resolves this
        // fixture's own pitch to transparent, so asserting the post-state alone
        // would pass whether or not anything cleared it.
        word?.style.setProperty('--jpdb-reader-word-decoration-source', 'rgb(0, 120, 255)');

        recycleHostText(host, RECYCLED);
        await Promise.resolve();
        await frame();
        projectAdditiveTextMirrors(document);
        await frame();

        expect(mirror.dataset.yomuSourceStale).toBe('true');
        expect(word?.style.getPropertyValue('--jpdb-reader-word-decoration-source')).toBe('transparent');
    });
});
