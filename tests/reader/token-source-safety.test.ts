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

    it('omits isolated counter readings in dates and times without removing lookup targets', () => {
        for (const text of ['2026年10月6日 20時10分', '２０２６年１０月６日 ２０時１０分', '三人と二本']) {
            const tokens = [...text.matchAll(/[年月日時分人本]/gu)].map(match => {
                const t = token(text, match.index, match.index + 1, match[0]);
                t.card.reading = ({ 月: 'つき', 日: 'ひ', 時: 'とき', 分: 'ぶん' } as Record<string, string>)[match[0]] ?? 'ほん';
                t.rubies = [{ ...t.rubies[0]!, text: t.card.reading }];
                return t;
            });
            const host = rendered(text, tokens);
            expect(host.querySelectorAll('.jpdb-reader-word')).toHaveLength(tokens.length);
            expect(host.querySelector('rt')).toBeNull();
            expect(host.textContent).toBe(text);
        }
    });

    it('keeps independent noun readings and whole numeric-phrase readings', () => {
        const noun = token('月を見る', 0, 1, '月');
        noun.card.reading = 'つき';
        noun.rubies = [{ text: 'つき', start: 0, end: 1, length: 1 }];
        expect(rendered('月を見る', [noun]).querySelector('rt')?.textContent).toBe('つき');
        const phrase = token('三人', 0, 2, '三人');
        phrase.card.reading = 'さんにん';
        phrase.rubies = [{ text: 'さんにん', start: 0, end: 2, length: 2 }];
        expect(rendered('三人', [phrase]).querySelector('rt')?.textContent).toBe('さんにん');
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
