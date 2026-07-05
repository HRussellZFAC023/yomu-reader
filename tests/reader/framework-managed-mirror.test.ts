import { afterEach, describe, expect, it } from 'vitest';

import { applyTokensToScanTarget, collectTextTargetsIn, removeNonDestructiveScanMirrors, STALE_MIRROR_REMOVAL_GRACE_MS } from '../../src/reader/dom';
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
    const target = collectTextTargetsIn(host, 40, false).find(t => t.text.trim() === TEXT);
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
        expect(host.style.getPropertyValue('visibility')).toBe('hidden');
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
        expect(host.style.getPropertyValue('visibility')).toBe('hidden');
    });

    it('keeps the higher-fidelity destructive paint on static framework article prose', () => {
        // A React/Next.js article is framework-owned but not a live chat surface; it
        // must keep inline destructive rendering (preserving bold/links/code) — no
        // mirror, no regression for the core article-reading experience.
        document.body.innerHTML = `<article class="prose"><p id="host">${TEXT}</p></article>`;
        const host = document.getElementById('host')!;
        markReactOwned(host);

        paint(host);

        expect(host.querySelector('.jpdb-reader-word')).toBeTruthy();
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeNull();
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
