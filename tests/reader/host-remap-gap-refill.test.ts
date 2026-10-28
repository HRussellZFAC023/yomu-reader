import { afterEach, describe, expect, it } from 'vitest';

import { applyTokensToScanTarget, removeNonDestructiveScanMirrors, type FragmentTextTarget } from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

function card(spelling: string): JPDBCard {
    return {
        vid: 9001, sid: 1, rid: 0, spelling, reading: '', frequencyRank: null,
        partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jiten',
    };
}

function token(text: string, spelling: string, start: number): JPDBToken {
    return {
        card: card(spelling),
        start, end: start + spelling.length, length: spelling.length,
        rubies: [], pitchClass: '', sentence: text,
    };
}

afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
});

// エージェント型 class (2026-07-19): the parser guarantees token coverage in
// TARGET coordinates, but the non-destructive host remap can drop a token
// whose surface no longer matches the host text (an intervening non-scanned
// element splits the word). The dropped token's range must be refilled with
// bare fallback tokens — a remap loss degrades to annotated-but-unenriched,
// never to an un-annotated hole while its neighbours annotate.
describe('non-destructive host remap gap refill', () => {
    it('refills a dropped cross-fragment token with segmented fallback words', () => {
        document.body.innerHTML = '<p id="host">長時間のエージェント<sup>[1]</sup>型コーディングです</p>';
        const host = document.getElementById('host')!;
        const [first, , second] = [...host.childNodes] as [Text, HTMLElement, Text];
        const text = '長時間のエージェント型コーディングです';
        const target: FragmentTextTarget = {
            text,
            parent: host,
            nonDestructive: true,
            fragments: [
                { node: first, start: 0, end: first.data.length, hasNativeRuby: false },
                { node: second, start: 0, end: second.data.length, hasNativeRuby: false },
            ],
        };
        applyTokensToScanTarget(target, [
            token(text, '長時間', 0),
            // Crosses the fragment boundary; the host text has [1] in between,
            // so remapTokenIntoHostText rejects it.
            token(text, 'エージェント型', 4),
            token(text, 'コーディング', 11),
        ], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const mirror = document.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror).toBeTruthy();
        const words = [...mirror.querySelectorAll<HTMLElement>('.jpdb-reader-word')].map(word => word.textContent);
        expect(words).toContain('長時間');
        expect(words).toContain('コーディング');
        // The dropped word's halves come back as bare fallback words.
        expect(words).toContain('エージェント');
        expect(words).toContain('型');
        // The mirror still renders the host's full text including the citation.
        expect(mirror.textContent).toContain('[1]');
    });

    it('leaves deliberately-bare ranges untouched when no token was dropped', () => {
        document.body.innerHTML = '<p id="host">長時間のエージェント<sup>[1]</sup>型コーディングです</p>';
        const host = document.getElementById('host')!;
        const [first, , second] = [...host.childNodes] as [Text, HTMLElement, Text];
        const text = '長時間のエージェント型コーディングです';
        const target: FragmentTextTarget = {
            text,
            parent: host,
            nonDestructive: true,
            fragments: [
                { node: first, start: 0, end: first.data.length, hasNativeRuby: false },
                { node: second, start: 0, end: second.data.length, hasNativeRuby: false },
            ],
        };
        applyTokensToScanTarget(target, [token(text, '長時間', 0)], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const mirror = document.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        const words = [...mirror.querySelectorAll<HTMLElement>('.jpdb-reader-word')].map(word => word.textContent);
        expect(words).toEqual(['長時間']);
    });

    it('refills supplementary kanji without splitting their surrogate pairs', () => {
        document.body.innerHTML = '<p id="host">彼は𠮟<sup>[1]</sup>𩸽を見た</p>';
        const host = document.getElementById('host')!;
        const [first, , second] = [...host.childNodes] as [Text, HTMLElement, Text];
        const text = '彼は𠮟𩸽を見た';
        const target: FragmentTextTarget = {
            text,
            parent: host,
            nonDestructive: true,
            fragments: [
                { node: first, start: 0, end: first.data.length, hasNativeRuby: false },
                { node: second, start: 0, end: second.data.length, hasNativeRuby: false },
            ],
        };
        applyTokensToScanTarget(target, [token(text, '𠮟𩸽', 2)], {
            ...DEFAULT_SETTINGS,
            furiganaMode: 'all',
        });

        const mirror = document.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        const words = [...mirror.querySelectorAll<HTMLElement>('.jpdb-reader-word')].map(word => word.textContent);
        expect(words).toContain('𠮟');
        expect(words).toContain('𩸽');
        expect(words).not.toContain('\ud842');
        expect(words).not.toContain('\udfb7');
        expect(mirror.textContent).toContain('𠮟[1]𩸽');
    });
});
