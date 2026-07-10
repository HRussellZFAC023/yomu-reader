import { afterEach, describe, expect, it } from 'vitest';

import {
    applyTokensToScanTarget,
    removeNonDestructiveScanMirrors,
    renderTokensToHtml,
    type FragmentTextTarget,
} from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

const SETTINGS = { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' as const };

function card(spelling: string, reading = 'にほんご'): JPDBCard {
    return {
        vid: 1,
        sid: 1,
        rid: 0,
        spelling,
        reading,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
    };
}

function token(sentence: string, start: number, end: number, spelling = '日本語'): JPDBToken {
    return {
        card: card(spelling),
        start,
        end,
        length: end - start,
        rubies: [{ text: 'にほんご', start, end, length: end - start }],
        pitchClass: '',
        sentence,
    };
}

function rendered(text: string, tokens: JPDBToken[]): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = renderTokensToHtml(text, tokens, SETTINGS);
    return host;
}

function expectPlainSource(host: HTMLElement, text: string): void {
    expect(host.textContent).toBe(text);
    expect(host.querySelector('.jpdb-reader-word')).toBeNull();
    expect(host.querySelector('ruby,rt')).toBeNull();
}

afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
});

describe('token source-range safety', () => {
    it('never decorates a Latin-only source slice even when token offsets are structurally valid', () => {
        const text = 'r/singularity';
        const host = rendered(text, [token(text, 0, text.length)]);

        expectPlainSource(host, text);
    });

    it('never turns punctuation-only ranges into floating readings', () => {
        for (const text of ['...', '…', '！？', '・', 'ー', 'ｰ']) {
            const host = rendered(text, [token(text, 0, text.length)]);
            expectPlainSource(host, text);
        }
    });

    it('still decorates a Japanese source slice inside mixed-script text', () => {
        const text = 'r/日本語';
        const host = rendered(text, [token(text, 2, text.length)]);

        expect(host.firstChild?.textContent).toBe('r/');
        expect(host.querySelector('.jpdb-reader-ruby-base')?.textContent).toBe('日本語');
        expect(host.querySelector('.jpdb-reader-word')?.getAttribute('data-expression')).toBe('日本語');
        expect(host.querySelector('rt')?.textContent).toBe('にほんご');
    });

    it('does not create or hide a framework mirror when every returned token misses Japanese text', () => {
        const text = 'r/singularity';
        document.body.innerHTML = `<shreddit-app><span id="name">${text}</span></shreddit-app>`;
        const host = document.querySelector<HTMLElement>('#name')!;
        const target: FragmentTextTarget = {
            text,
            parent: host,
            fragments: [{ node: host.firstChild as Text, start: 0, end: text.length, hasNativeRuby: false }],
            decoration: 'content-ruby',
            nonDestructive: true,
        };

        applyTokensToScanTarget(target, [token(text, 0, text.length)], SETTINGS);

        expect(host.textContent).toBe(text);
        expect(host.querySelector('.jpdb-reader-word')).toBeNull();
        expect(host.parentElement?.querySelector('.jpdb-reader-text-mirror')).toBeNull();
        expect(host.style.visibility).toBe('');
    });
});
