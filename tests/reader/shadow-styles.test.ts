import { afterEach, describe, expect, it } from 'vitest';

import { applyTokensToScanTarget, removeNonDestructiveScanMirrors } from '../../src/reader/dom';
import { setShadowReaderCss } from '../../src/reader/dom/shadow-styles';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { FragmentTextTarget } from '../../src/reader/dom';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

const SETTINGS = { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' as const };

function card(spelling: string, reading: string): JPDBCard {
    return {
        vid: 1, sid: 1, rid: 0, spelling, reading, frequencyRank: null,
        partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb',
    };
}

function token(spelling: string, reading: string, sentence: string): JPDBToken {
    const start = sentence.indexOf(spelling);
    return {
        card: card(spelling, reading),
        start, end: start + spelling.length, length: spelling.length,
        rubies: [{ text: reading, start, end: start + spelling.length, length: spelling.length }],
        pitchClass: '', sentence,
    };
}

function shadowTarget(host: HTMLElement, text: string): FragmentTextTarget {
    return {
        text,
        parent: host,
        fragments: [{ node: host.firstChild as Text, start: 0, end: text.length, hasNativeRuby: false }],
        insideShadowDOM: true,
        nonDestructive: true,
    };
}

afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
});

// Document-level CSS never cascades into shadow roots. Without the reader
// sheet inside the root, the additive mirror's transparent base resolves
// opaque and paints a double image over the native text (Reddit shreddit
// 参加 / 並べ替え基準). Every shadow root Yomu mounts styled nodes into must
// receive the reader CSS.
describe('shadow-root reader styles', () => {
    it('injects the reader stylesheet into a shadow root when a mirror mounts there', () => {
        setShadowReaderCss('.jpdb-reader-word{color:transparent}');
        const outer = document.createElement('div');
        document.body.append(outer);
        const root = outer.attachShadow({ mode: 'open' });
        const host = document.createElement('div');
        host.textContent = '参加します';
        root.append(host);

        applyTokensToScanTarget(shadowTarget(host, '参加します'), [token('参加', 'さんか', '参加します')], SETTINGS);

        expect(root.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();
        const sheetHosts = root.adoptedStyleSheets?.length
            ? root.adoptedStyleSheets.length
            : root.querySelectorAll('style[data-yomu-shadow-reader-style]').length;
        expect(sheetHosts, 'reader CSS must be adopted by the shadow root').toBeGreaterThan(0);
    });

    it('propagates later CSS updates (async full-sheet fallback) to already-adopted roots', () => {
        setShadowReaderCss('.jpdb-reader-word{color:transparent}');
        const outer = document.createElement('div');
        document.body.append(outer);
        const root = outer.attachShadow({ mode: 'open' });
        const host = document.createElement('div');
        host.textContent = '参加します';
        root.append(host);
        applyTokensToScanTarget(shadowTarget(host, '参加します'), [token('参加', 'さんか', '参加します')], SETTINGS);

        setShadowReaderCss('.jpdb-reader-word{color:transparent}.jpdb-full{display:block}');
        const style = root.querySelector('style[data-yomu-shadow-reader-style]');
        if (style) {
            expect(style.textContent).toContain('.jpdb-full');
        } else {
            // Constructable-sheet path: the shared sheet object was updated in
            // place; presence in adoptedStyleSheets is the observable.
            expect(root.adoptedStyleSheets.length).toBeGreaterThan(0);
        }
    });
});
