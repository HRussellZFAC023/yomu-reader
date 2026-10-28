import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyPublicVocabularyFurigana } from '../../src/reader/app/dom-helpers';
import { applyTokensToTextNode, removeNonDestructiveScanMirrors } from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';
import { settleProjectionFrame } from './helpers/projection-frame';

/**
 * A compact control renders its reading through the DETACHED channel: the
 * in-word `.jpdb-reader-detached-furi` is `display: none` by stylesheet, and the
 * only copy that can ever paint is the clone the projection overlay stamps at
 * the base glyph's client rect. So for this channel "the reading is in the DOM"
 * and "the reading is on the screen" are different claims, and only the second
 * one is the feature.
 *
 * `public-vocabulary-repaint.test.ts` covers the first claim for a reading that
 * arrives from LATE async enrichment (public-vocabulary lookup resolving after
 * the word was rendered bare). Nothing covered the second: deleting the
 * projection scheduling from the in-place branch of replaceRenderedWordFurigana
 * left all 74 tests in the four suites nearest this behaviour green, while a
 * real Chromium harness measured the reading going from 233 painted pixels to
 * none. This closes that gap.
 *
 * The mirror half of the same transition is already guarded by
 * `recycled-mirror-projection.test.ts` ("projects a reading enriched after the
 * projection pass settled"), which does fail when its scheduling is removed.
 */
const SURFACE = '賛成票';
const READING = 'さんせいひょう';

function card(reading: string): JPDBCard {
    return {
        vid: 11, sid: 22, rid: 0, spelling: SURFACE, reading, frequencyRank: null,
        partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [],
        wordWithReading: null, source: 'jiten',
    };
}

function unresolvedToken(): JPDBToken {
    return {
        card: card(''),
        start: 0,
        end: SURFACE.length,
        length: SURFACE.length,
        rubies: [],
        pitchClass: 'unknown',
        sentence: SURFACE,
    };
}

function rect(left = 100, top = 50, width = 48, height = 16): DOMRect {
    return {
        left, top, width, height,
        right: left + width, bottom: top + height,
        x: left, y: top,
        toJSON: () => ({}),
    } as DOMRect;
}

const elementProto = Element.prototype as unknown as { getBoundingClientRect: () => DOMRect };
const nativeElementRect = elementProto.getBoundingClientRect;

// Every box the in-place projection measures — the detached-ruby wrapper it
// lifts, and the clipped row it must stay inside — is created by the enrichment
// itself, so the geometry has to come from the prototype rather than from
// elements the test can reach beforehand.
beforeEach(() => {
    Object.defineProperty(elementProto, 'getBoundingClientRect', {
        configurable: true,
        value: () => rect(),
    });
});

afterEach(() => {
    Object.defineProperty(elementProto, 'getBoundingClientRect', {
        configurable: true,
        value: nativeElementRect,
    });
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
});

function projectedReadings(): string[] {
    return [...document.querySelectorAll<HTMLElement>('[data-yomu-projected-reading="true"]')]
        .map(clone => clone.textContent ?? '');
}

describe('a reading enriched onto an in-place detached word', () => {
    it('reaches the overlay, not just the word', async () => {
        document.body.innerHTML = '<button id="word" style="height:24px;overflow:hidden;white-space:nowrap">賛成票</button>';
        const host = document.querySelector<HTMLElement>('#word')!;
        applyTokensToTextNode({
            text: SURFACE,
            node: host.firstChild as Text,
            parent: host,
            decoration: 'interactive-passive',
            suppressRuby: true,
        }, [unresolvedToken()], { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });

        const word = host.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(word.classList.contains('jpdb-reader-detached-reading-word')).toBe(true);
        await settleProjectionFrame();
        expect(projectedReadings()).toEqual([]);

        // The lookup resolves long after the projection pass settled.
        applyPublicVocabularyFurigana(
            word,
            card(READING),
            { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' },
        );
        await settleProjectionFrame();

        // The in-word copy is the data, never the paint.
        const source = word.querySelector<HTMLElement>('.jpdb-reader-detached-furi')!;
        expect(source.textContent).toBe(READING);
        expect(source.style.getPropertyValue('display')).toBe('none');
        // ...so this clone is the only thing a reader can actually see.
        expect(projectedReadings()).toEqual([READING]);
    });
});
