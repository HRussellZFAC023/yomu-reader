import { afterEach, describe, expect, it } from 'vitest';

import {
    applyTokensToScanTarget,
    collectFragmentTextTargetsIn,
    collectTextTargetsIn,
    removeNonDestructiveScanMirrors,
} from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

// news.web.nhk is a React article page. Framework ownership must promote its
// text to a source-preserving additive mirror: the page's Text nodes remain the
// readable authority while Yomu contributes only annotation and hit geometry.
const TEXT = '60メートル以上では、▽屋外で行動するのは極めて危険 ▽走行中のトラックは横転する';

function card(spelling: string): JPDBCard {
    return {
        vid: 1, sid: 1, rid: 0, spelling, reading: spelling, frequencyRank: null,
        partOfSpeech: [], meanings: [], cardState: ['new'], pitchAccent: [],
        wordWithReading: null, source: 'jpdb',
    };
}

function tokens(text: string): JPDBToken[] {
    const out: JPDBToken[] = [];
    const re = /[一-龯々]{2,}/gu;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
        const word = match[0].slice(0, 2);
        out.push({
            card: card(word),
            start: match.index,
            end: match.index + word.length,
            length: word.length,
            rubies: [],
            pitchClass: '',
            sentence: text,
        });
    }
    return out;
}

function markReactOwned(element: Element): void {
    (element as unknown as Record<string, unknown>).__reactFiber$abc123 = {};
    (element as unknown as Record<string, unknown>).__reactProps$abc123 = {};
}

function paint(host: HTMLElement): void {
    const target = collectTextTargetsIn(host, 60, false).find(candidate => candidate.text.includes('▽'));
    if (target) applyTokensToScanTarget(target, tokens(target.text), { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
}

function nativeSurfaceText(host: HTMLElement): string {
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let text = '';
    let node = walker.nextNode();
    while (node) {
        const parent = node.parentElement;
        if (!parent?.closest('.jpdb-reader-text-mirror,.jpdb-reader-control-text-mirror,[data-jpdb-reader-root]')) {
            text += node.textContent ?? '';
        }
        node = walker.nextNode();
    }
    return text;
}

function flushObservers(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
});

describe('NHK framework source-preserving annotation', () => {
    it('keeps the original page Text node as the sole visible text authority', () => {
        document.body.innerHTML = `<article class="prose"><p id="host">${TEXT}</p></article>`;
        const host = document.getElementById('host')!;
        const source = host.firstChild as Text;
        markReactOwned(host);

        paint(host);

        const mirror = host.querySelector<HTMLElement>(':scope > .jpdb-reader-text-mirror.jpdb-reader-additive-text-mirror');
        expect(mirror).toBeTruthy();
        expect(mirror?.getAttribute('aria-hidden')).toBe('true');
        expect(mirror?.querySelector('.jpdb-reader-word')).toBeTruthy();
        expect(source.isConnected).toBe(true);
        expect(host.firstChild).toBe(source);
        expect(source.data).toBe(TEXT);
        expect(nativeSurfaceText(host)).toBe(TEXT);
        expect(host.style.visibility).toBe('');
    });

    it('replays the additive mirror after repeated framework child replacement', async () => {
        document.body.innerHTML = `<article class="prose"><p id="host">${TEXT}</p></article>`;
        const host = document.getElementById('host')!;
        markReactOwned(host);
        paint(host);

        for (let cycle = 0; cycle < 3; cycle += 1) {
            host.replaceChildren(document.createTextNode(TEXT));
            await flushObservers();

            expect(nativeSurfaceText(host)).toBe(TEXT);
            expect(Array.from(host.childNodes).filter(node => node.nodeType === Node.TEXT_NODE)).toHaveLength(1);
            expect(host.querySelector(':scope > .jpdb-reader-text-mirror.jpdb-reader-additive-text-mirror .jpdb-reader-word')).toBeTruthy();
        }
    });

    it('preserves page-owned element and adjacent text siblings by identity', () => {
        document.body.innerHTML = `<article class="prose"><p id="host">${TEXT}<span id="weather">晴れ</span>です</p></article>`;
        const host = document.getElementById('host')!;
        const source = host.firstChild as Text;
        const weather = document.getElementById('weather')!;
        const suffix = host.lastChild as Text;
        markReactOwned(host);

        paint(host);

        expect(source.isConnected).toBe(true);
        expect(document.getElementById('weather')).toBe(weather);
        expect(suffix.isConnected).toBe(true);
        expect(suffix.data).toBe('です');
        expect(nativeSurfaceText(host)).toBe(`${TEXT}晴れです`);
        expect(host.querySelector('.jpdb-reader-text-mirror .jpdb-reader-word')).toBeTruthy();
    });

    it('keeps inline fragment structure and one native copy of every gap', () => {
        const splitText = '60メートル以上では、屋外で行動するのは極めて危険。走行中のトラックは横転する';
        document.body.innerHTML = '<article class="prose"><p id="host">60メートル以上では、<b id="outdoor">屋外</b>で行動するのは極めて危険。走行中のトラックは横転する</p></article>';
        const host = document.getElementById('host')!;
        const outdoor = document.getElementById('outdoor')!;
        markReactOwned(host);

        const target = collectFragmentTextTargetsIn(host, 60, false).find(candidate => candidate.text.includes('走行中'));
        expect(target).toBeTruthy();
        applyTokensToScanTarget(target!, tokens(target!.text), { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        expect(document.getElementById('outdoor')).toBe(outdoor);
        expect(nativeSurfaceText(host)).toBe(splitText);
        expect((nativeSurfaceText(host).match(/のトラック/g) ?? [])).toHaveLength(1);
        expect(host.querySelector('.jpdb-reader-text-mirror .jpdb-reader-word')).toBeTruthy();
    });
});
