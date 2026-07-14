import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    applyTokensToScanTarget,
    collectFragmentTextTargetsIn,
    collectTextTargetsIn,
    readerWordAtSourcePointInScope,
    removeNonDestructiveScanMirrors,
    STALE_MIRROR_REMOVAL_GRACE_MS,
} from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

const TEXT = '日本語';
const CARD: JPDBCard = {
    vid: 1, sid: 1, rid: 0, spelling: TEXT, reading: 'にほんご', frequencyRank: null,
    partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb',
};
function token(): JPDBToken {
    return { card: CARD, start: 0, end: TEXT.length, length: TEXT.length, rubies: [{ text: 'にほんご', start: 0, end: TEXT.length, length: TEXT.length }], pitchClass: '', sentence: TEXT };
}
// Stamp the private expando React puts on every DOM node it owns, so the reader
// sees the host as framework-managed the same way it would on a live chat page.
function markReactOwned(element: Element): void {
    (element as unknown as Record<string, unknown>).__reactFiber$abc123 = {};
    (element as unknown as Record<string, unknown>).__reactProps$abc123 = {};
}
function paint(host: HTMLElement): void {
    const targets = [
        ...collectTextTargetsIn(host, 40, false),
        ...collectFragmentTextTargetsIn(host, 40, false),
    ];
    const target = targets.find(t => t.text.trim() === TEXT);
    expect(target).toBeTruthy();
    applyTokensToScanTarget(target!, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
}

afterEach(() => { removeNonDestructiveScanMirrors(document); document.body.innerHTML = ''; });

// A React chat app (ChatGPT/Claude/Gemini/Grok) keeps a live reference to the
// assistant message's Text node and re-renders it while streaming. Destructively
// replacing that node makes React's next commit call removeChild on a node that is
// no longer there and throws ("このメッセージを表示できません"). The reader must paint
// framework-owned chat surfaces with the non-destructive mirror, which never mutates
// the framework's own nodes, so React keeps ownership and re-renders safely.
describe('framework-managed chat mirror', () => {
    it('keeps a Discord message suffix visible while a progressively grown host is rescanned', async () => {
        const initial = 'スター';
        const complete = 'スタープラチナ';
        document.body.innerHTML = `<main role="main"><div id="host" class="messageContent"><span id="prefix">ス</span><span id="prefix-rest">ター</span></div></main>`;
        const host = document.getElementById('host')!;
        const prefix = document.getElementById('prefix')!;
        markReactOwned(host);

        const target = collectFragmentTextTargetsIn(host, 40, false).find(candidate => candidate.text === initial);
        expect(target).toBeTruthy();
        applyTokensToScanTarget(target!, [{
            card: { ...CARD, spelling: initial, reading: 'すたー' },
            start: 0,
            end: initial.length,
            length: initial.length,
            rubies: [{ text: 'すたー', start: 0, end: initial.length, length: initial.length }],
            pitchClass: '',
            sentence: initial,
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        expect(host.querySelectorAll<HTMLElement>('.jpdb-reader-text-mirror')).toHaveLength(2);
        expect(prefix.querySelector<HTMLElement>('.jpdb-reader-text-mirror')?.textContent).toBe('ス');

        // Discord/React keeps the existing nested node and appends the rest of
        // the message in a sibling text node. The mirror must expose the suffix
        // immediately instead of continuing to paint only the cached prefix.
        document.getElementById('prefix-rest')!.after(document.createTextNode('プラチナ'));
        await new Promise(resolve => setTimeout(resolve, 0));

        // The source glyphs remain page-owned and visible, so a newly streamed
        // suffix is readable immediately even before the next annotation pass.
        expect(host.childNodes[2]?.textContent).toBe('プラチナ');
        expect(prefix.childNodes[0]?.textContent).toBe('ス');
        expect(complete).toBe(`${prefix.childNodes[0]?.textContent}${document.getElementById('prefix-rest')?.childNodes[0]?.textContent}${host.childNodes[2]?.textContent}`);
    });

    it('conceals text instead of hiding a STYLED framework host (box paint survives)', () => {
        document.body.innerHTML = `<div data-message-author-role="assistant"><div id="host" class="markdown" style="background-color: rgb(31, 41, 55); border: 1px solid rgb(99, 102, 241);">${TEXT}<svg aria-hidden="true"></svg></div></div>`;
        const host = document.getElementById('host')!;
        markReactOwned(host);
        paint(host);

        // The page-owned text and box remain authoritative. The additive
        // layer must not blank any native glyph or icon.
        expect(host.querySelector(':scope > .jpdb-reader-text-mirror')).toBeTruthy();
        expect(host.style.getPropertyValue('visibility')).not.toBe('hidden');
        expect(host.style.getPropertyValue('color')).not.toBe('transparent');
        expect(host.style.getPropertyValue('background-color')).toBe('rgb(31, 41, 55)');
        // The icon must not inherit the transparent text colour.
        const svg = host.querySelector('svg')!;
        expect((svg as unknown as HTMLElement).style.getPropertyValue('color')).not.toBe('transparent');
        // Only the overlay glyphs are transparent.
        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror.classList.contains('jpdb-reader-additive-text-mirror')).toBe(true);
    });

    it('restores concealed text when the mirror is removed', () => {
        document.body.innerHTML = `<div data-message-author-role="assistant"><div id="host" class="markdown" style="background-color: rgb(31, 41, 55); color: rgb(255, 255, 255);">${TEXT}</div></div>`;
        const host = document.getElementById('host')!;
        markReactOwned(host);
        paint(host);
        expect(host.style.getPropertyValue('color')).toBe('rgb(255, 255, 255)');

        removeNonDestructiveScanMirrors(document);
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeNull();
        expect(host.style.getPropertyValue('color')).toBe('rgb(255, 255, 255)');
    });

    it('keeps native glyphs visible for bare hosts', () => {
        document.body.innerHTML = `<div data-message-author-role="assistant"><div id="host" class="markdown">${TEXT}</div></div>`;
        const host = document.getElementById('host')!;
        markReactOwned(host);
        paint(host);
        expect(host.style.getPropertyValue('visibility')).not.toBe('hidden');
        expect(host.style.getPropertyValue('color')).not.toBe('transparent');
        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror.style.getPropertyValue('color')).toBe('');
    });

    it('mirrors a React-owned chat message instead of replacing its text node', () => {
        document.body.innerHTML = `<div data-message-author-role="assistant"><div id="host" class="markdown">${TEXT}</div></div>`;
        const host = document.getElementById('host')!;
        markReactOwned(host);
        const reactTextNode = host.firstChild as Text;

        paint(host);

        // The original Text node React holds must survive untouched (not replaced).
        expect(reactTextNode.isConnected).toBe(true);
        expect(reactTextNode.parentNode).toBe(host);
        expect(reactTextNode.data).toBe(TEXT);
        // Annotation is delivered via the overlay mirror, not by mutating React's tree.
        expect(host.querySelector(':scope > .jpdb-reader-text-mirror')).toBeTruthy();
        expect(host.style.getPropertyValue('visibility')).not.toBe('hidden');
        expect(host.querySelector('.jpdb-reader-text-mirror .jpdb-reader-word')).toBeTruthy();
    });

    it('survives a React re-render that reverts the streaming text', () => {
        document.body.innerHTML = `<div data-message-author-role="assistant"><div id="host" class="markdown">${TEXT}</div></div>`;
        const host = document.getElementById('host')!;
        markReactOwned(host);

        // React streams/re-renders by rewriting its own text node; the mirror path
        // must never throw and must keep the host's own node intact each pass.
        for (let i = 0; i < 5; i++) {
            host.replaceChildren(document.createTextNode(TEXT));
            expect(() => paint(host)).not.toThrow();
            expect((host.firstChild as Text).data).toBe(TEXT);
        }
        expect(host.querySelector(':scope > .jpdb-reader-text-mirror')).toBeTruthy();
    });

    it('mirrors one word across framework-owned sibling text fragments', () => {
        document.body.innerHTML = `<div data-message-author-role="assistant"><div id="host" class="markdown"><span>日</span><span>本語</span></div></div>`;
        const host = document.getElementById('host')!;
        markReactOwned(host);

        paint(host);

        const mirrors = [...host.querySelectorAll<HTMLElement>('.jpdb-reader-text-mirror')];
        expect(mirrors).toHaveLength(2);
        expect(mirrors.map(item => item.parentElement?.tagName)).toEqual(['SPAN', 'SPAN']);
        const words = mirrors.flatMap(mirror => [...mirror.querySelectorAll<HTMLElement>('.jpdb-reader-word')]);
        expect(words).toHaveLength(2);
        expect(words.every(word => word.dataset.expression === TEXT)).toBe(true);
        // A cross-leaf reading has no safe single geometry lane: omit only
        // furigana, keeping the native glyphs and word lookup identity.
        expect(words.some(word => word.querySelector('.jpdb-reader-furi'))).toBe(false);
        expect(host.querySelector('span')?.childNodes[0]?.textContent).toBe('日');
    });

    it('splits explicit non-destructive multi-leaf targets without framework markers', () => {
        document.body.innerHTML = '<button id="host"><span>共</span><span>有</span></button>';
        const host = document.getElementById('host')!;
        const target = collectFragmentTextTargetsIn(host, 40, false).find(candidate => candidate.text === '共有');
        expect(target).toBeTruthy();

        applyTokensToScanTarget({ ...target!, nonDestructive: true }, [{
            card: { ...CARD, spelling: '共有', reading: 'きょうゆう' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'きょうゆう', start: 0, end: 2, length: 2 }],
            pitchClass: 'heiban',
            sentence: '共有',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        expect(host.querySelectorAll(':scope > .jpdb-reader-text-mirror')).toHaveLength(0);
        expect(host.querySelectorAll('.jpdb-reader-text-mirror')).toHaveLength(2);
        expect(host.childNodes[0]?.textContent?.startsWith('共')).toBe(true);
        expect(host.childNodes[1]?.textContent?.startsWith('有')).toBe(true);
    });

    it('drops a stale mirror when the host is recycled with different text', async () => {
        document.body.innerHTML = `<div data-message-author-role="assistant"><div id="host" class="markdown">${TEXT}</div></div>`;
        const host = document.getElementById('host')!;
        markReactOwned(host);
        paint(host);
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();

        // YouTube/React recycle the element for new content (the comments
        // header became the composer row on iPad): the OLD mirror must not
        // keep painting over the new text once the rescan grace passes.
        host.firstChild!.textContent = '別の日本語テキスト';
        await new Promise(resolve => setTimeout(resolve, 0));
        // Inside the grace window the mirror survives (anti-flicker for
        // routine title re-renders that a rescan refreshes immediately).
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();

        await new Promise(resolve => setTimeout(resolve, STALE_MIRROR_REMOVAL_GRACE_MS + 150));
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeNull();
        expect(host.style.getPropertyValue('visibility')).not.toBe('hidden');
    });

    it('keeps the mirror through re-renders when the host carries aria-hidden text', async () => {
        // The staleness baseline and the staleness check must read the host
        // through the same extractor: aria-hidden duplicate labels (YouTube
        // subscribe-button crossfades) are excluded from the check, so a
        // baseline that INCLUDED them made every such host stale from birth —
        // the first re-render then tore the mirror down after the grace.
        document.body.innerHTML = `<div data-message-author-role="assistant"><div id="host" class="markdown">${TEXT}<span aria-hidden="true">${TEXT}</span></div></div>`;
        const host = document.getElementById('host')!;
        markReactOwned(host);
        paint(host);
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();

        // A routine framework re-render that does NOT change the visible text.
        (host.firstChild as Text).data = TEXT;
        await new Promise(resolve => setTimeout(resolve, STALE_MIRROR_REMOVAL_GRACE_MS + 150));
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();
        expect(host.style.getPropertyValue('visibility')).not.toBe('hidden');
    });

    it('resolves a tap against source ranges rather than displaced overlay boxes', () => {
        document.body.innerHTML = `<div data-message-author-role="assistant"><div id="host" class="markdown">高評価</div></div>`;
        const host = document.getElementById('host')!;
        markReactOwned(host);
        const target = collectFragmentTextTargetsIn(host, 40, false).find(item => item.text === '高評価')!;
        const makeToken = (surface: string, start: number, end: number): JPDBToken => ({
            card: { ...CARD, spelling: surface, reading: surface }, start, end, length: end - start,
            rubies: [], pitchClass: '', sentence: '高評価',
        });
        applyTokensToScanTarget(target, [makeToken('高', 0, 1), makeToken('評価', 1, 3)], DEFAULT_SETTINGS);
        const restore = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
        Object.defineProperty(Range.prototype, 'getClientRects', {
            configurable: true,
            value(this: Range) {
                const left = this.startOffset === 0 ? 0 : 20;
                const right = this.startOffset === 0 ? 20 : 60;
                return [{ left, right, top: 0, bottom: 20, width: right - left, height: 20 }];
            },
        });
        try {
            const word = readerWordAtSourcePointInScope(host, 35, 10);
            expect(word?.dataset.expression).toBe('評価');
        } finally {
            if (restore) Object.defineProperty(Range.prototype, 'getClientRects', restore);
            else Reflect.deleteProperty(Range.prototype, 'getClientRects');
            vi.restoreAllMocks();
        }
    });

    it('keeps static framework article prose source-owned too', () => {
        // "Quiet" React/Next.js prose can still be replaced by hydration or SPA
        // navigation later. Exact ownership therefore selects the same additive
        // source-preserving contract as a streaming message.
        document.body.innerHTML = `<article class="prose"><p id="host">${TEXT}</p></article>`;
        const host = document.getElementById('host')!;
        markReactOwned(host);

        paint(host);

        expect(host.querySelector('.jpdb-reader-word')).toBeTruthy();
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();
        expect(host.childNodes[0]?.textContent).toBe(TEXT);
    });

    it('keeps the destructive paint on a chat-shaped host that is not framework-owned', () => {
        // A plain (non-framework) page that merely uses a .markdown wrapper is safe to
        // paint destructively — we only switch to the mirror when a framework owns the node.
        document.body.innerHTML = `<div class="markdown" id="host">${TEXT}</div>`;
        const host = document.getElementById('host')!;

        paint(host);

        expect(host.querySelector('.jpdb-reader-word')).toBeTruthy();
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeNull();
    });
});
