import { afterEach, describe, expect, it } from 'vitest';

import {
    applyTokensToScanTarget,
    collectFragmentTextTargetsIn,
    collectTextTargetsIn,
    readerRenderRejectionRescanDelay,
    removeNonDestructiveScanMirrors,
} from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

// news.web.nhk is a React article page: every element carries a fiber expando,
// so the reader treats the paragraph as framework-managed — but it is NOT a
// conversation surface, so it keeps the higher-fidelity DESTRUCTIVE inline paint
// (word/ruby spans replace the paragraph's Text node) rather than the overlay
// mirror. NHK then live-updates the article: React re-renders the paragraph and
// re-inserts its OWN fresh Text node (it lost track of the node the reader
// replaced) WITHOUT removing the reader's word-spans. The plain original text
// then paints ALONGSIDE the bold coloured word fragments — the "duplicated and
// offset" unreadable overlap the user photographed on iOS Safari.
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
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
        const word = m[0].slice(0, 2);
        out.push({ card: card(word), start: m.index, end: m.index + word.length, length: word.length, rubies: [], pitchClass: '', sentence: text });
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
// A whole, un-annotated copy of the paragraph living directly under the host as
// a single Text node — React's re-inserted node. This is the duplicate layer
// that paints its plain glyphs BESIDE the annotated word-spans. (Inter-token
// plain remnants inside the destructive paint are expected and NOT counted.)
function duplicateFullTextCopies(host: HTMLElement): number {
    return Array.from(host.childNodes).filter(
        node => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').includes('▽屋外'),
    ).length;
}

afterEach(() => { removeNonDestructiveScanMirrors(document); document.body.innerHTML = ''; });

describe('NHK framework destructive-paint duplication', () => {
    it('reproduces the duplicate plain-text overlap after a React re-insert', () => {
        document.body.innerHTML = `<article class="prose"><p id="host">${TEXT}</p></article>`;
        const host = document.getElementById('host')!;
        markReactOwned(host);

        // NHK static-article path: framework-owned prose keeps the destructive paint.
        paint(host);
        expect(host.querySelector('.jpdb-reader-word')).toBeTruthy();
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeNull();
        expect(duplicateFullTextCopies(host)).toBe(0);

        // React reconcile re-inserts its own Text node alongside the intact
        // word-spans (it can no longer find the node the reader replaced).
        const insert = new MutationObserver(() => undefined);
        insert.observe(host, { childList: true });
        host.insertBefore(document.createTextNode(TEXT), host.firstChild);
        const records = insert.takeRecords();
        insert.disconnect();

        // The plain paragraph text now co-exists with the coloured word-spans.
        expect(duplicateFullTextCopies(host)).toBe(1);
        expect(host.querySelectorAll('.jpdb-reader-word').length).toBeGreaterThan(0);

        // ROOT CAUSE: the existing render-rejection guard does NOT classify this
        // add-text-alongside-intact-words shape as a rejection, so it neither
        // repairs (unwrap) nor reschedules a rescan — the overlap is not healed.
        // When the fix lands, this delay should become non-null (a rejection is
        // recognised) and the guard should unwrap the stale word-spans.
        const delay = records
            .map(record => readerRenderRejectionRescanDelay(record))
            .find(value => value !== null) ?? null;
        // The fix recognises the duplicate-insert shape (non-null delay), drops our
        // stale destructive paint (word-spans + interspersed plain text), and leaves
        // the framework's single fresh copy behind for the promoted mirror to overlay.
        expect(delay).not.toBeNull();
        expect(host.querySelector('.jpdb-reader-word')).toBeNull();
        expect(duplicateFullTextCopies(host)).toBe(1);
    });

    it('is not self-healed by a subsequent rescan (double paint persists)', () => {
        document.body.innerHTML = `<article class="prose"><p id="host">${TEXT}</p></article>`;
        const host = document.getElementById('host')!;
        markReactOwned(host);
        paint(host);
        host.insertBefore(document.createTextNode(TEXT), host.firstChild); // React reconcile
        paint(host); // reader's debounced rescan lands

        // A plain, un-annotated copy of the paragraph still paints beside the
        // annotated copy — the rescan did not collapse the duplication.
        expect(duplicateFullTextCopies(host)).toBeGreaterThanOrEqual(1);
    });

    it('preserves page-owned siblings when dropping stale paint', () => {
        // The cleanup must remove only OUR paint (word-spans + interspersed plain),
        // never a legitimate page sibling like `です`.
        document.body.innerHTML = `<article class="prose"><p id="host">${TEXT}<span>晴れ</span>です</p></article>`;
        const host = document.getElementById('host')!;
        markReactOwned(host);
        paint(host);

        const insert = new MutationObserver(() => undefined);
        insert.observe(host, { childList: true });
        host.insertBefore(document.createTextNode(TEXT), host.firstChild); // React reconcile
        const records = insert.takeRecords();
        insert.disconnect();
        records.forEach(record => readerRenderRejectionRescanDelay(record));

        expect(host.querySelector('.jpdb-reader-word')).toBeNull();
        expect(host.querySelector('span')?.textContent).toBe('晴れ');
        expect(host.textContent).toContain('です');
    });

    it('preserves a page-owned text node directly adjacent to a painted word', () => {
        // Ownership is tracked at paint time (a WeakSet of the text WE created),
        // not by adjacency — so a page-owned Text node sitting right next to a
        // reader word (e.g. an untranslatable run) survives the cleanup.
        document.body.innerHTML = `<article class="prose"><p id="host"></p></article>`;
        const host = document.getElementById('host')!;
        host.append(document.createTextNode(TEXT), document.createTextNode('PAGEOWNED123'));
        markReactOwned(host);
        paint(host);

        const insert = new MutationObserver(() => undefined);
        insert.observe(host, { childList: true });
        host.insertBefore(document.createTextNode(TEXT), host.firstChild); // React reconcile
        const records = insert.takeRecords();
        insert.disconnect();
        records.forEach(record => readerRenderRejectionRescanDelay(record));

        expect(host.querySelector('.jpdb-reader-word')).toBeNull();
        expect(host.textContent).toContain('PAGEOWNED123');
    });

    it('drops fragment-path gap remnants on duplicate insert (both paint paths tracked)', () => {
        // An inline element splits ONE surface into multiple text fragments, so it
        // paints via the FRAGMENT path (applyTokensToFragmentTarget →
        // replaceTextNodeRange), whose plain gap text nodes must ALSO be ownership-
        // tracked — otherwise they survive the duplicate cleanup as stale remnants
        // beside the framework's fresh copy. There is NO page-owned second copy here,
        // so any surviving painted-surface fragment would be a genuine leak.
        const SPLIT_TEXT = '60メートル以上では、屋外で行動するのは極めて危険。走行中のトラックは横転する';
        document.body.innerHTML = `<article class="prose"><p id="host">60メートル以上では、<b>屋外</b>で行動するのは極めて危険。走行中のトラックは横転する</p></article>`;
        const host = document.getElementById('host')!;
        markReactOwned(host);
        // The inline <b> forces the FRAGMENT collector/paint path (not the single
        // text-node replaceWith path), so the gap text this paints goes through
        // replaceTextNodeRange — the path Codex flagged as untracked.
        const target = collectFragmentTextTargetsIn(host, 60, false).find(candidate => candidate.text.includes('走行中'));
        if (target) applyTokensToScanTarget(target, tokens(target.text), { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        expect(host.querySelector('.jpdb-reader-word')).toBeTruthy();
        expect((host.textContent?.match(/のトラック/g) ?? []).length).toBe(1); // painted, single copy

        const insert = new MutationObserver(() => undefined);
        insert.observe(host, { childList: true });
        host.insertBefore(document.createTextNode(SPLIT_TEXT), host.firstChild); // React reconcile: one fresh copy
        const records = insert.takeRecords();
        insert.disconnect();
        records.forEach(record => readerRenderRejectionRescanDelay(record));

        expect(host.querySelector('.jpdb-reader-word')).toBeNull();
        // Exactly the framework's fresh single copy survives — no fragment gap remnant.
        // Probe a katakana-only gap span (のトラック) that lives ENTIRELY in gap text,
        // so a surviving untracked gap would push the count to 2. (A word-spanning
        // probe can't detect it — the word-span is removed either way.)
        expect((host.textContent?.match(/のトラック/g) ?? []).length).toBe(1);
    });

    it('does not classify a partial re-insert of a truncated (>1000-char) surface', () => {
        // The stored surface is capped at 1000 chars, so a giant paragraph is stored
        // TRUNCATED. A framework re-insert of only the first 1000 chars is a substring
        // of the cap — indistinguishable from a full duplicate — so the guard must
        // refuse to classify it and fall back to the safe debounced rescan instead of
        // stripping intact paint. (With the WeakSet the worst case is still safe, but
        // we avoid the needless mirror promotion.)
        const giant = TEXT.repeat(40); // comfortably over the 1000-char cap
        document.body.innerHTML = `<article class="prose"><p id="host">${giant}</p></article>`;
        const host = document.getElementById('host')!;
        markReactOwned(host);
        paint(host);
        const wordsBefore = host.querySelectorAll('.jpdb-reader-word').length;
        expect(wordsBefore).toBeGreaterThan(0);

        const insert = new MutationObserver(() => undefined);
        insert.observe(host, { childList: true });
        host.insertBefore(document.createTextNode(giant.slice(0, 1000)), host.firstChild);
        const records = insert.takeRecords();
        insert.disconnect();
        const delay = records.map(record => readerRenderRejectionRescanDelay(record)).find(value => value !== null) ?? null;

        expect(delay).toBeNull();
        expect(host.querySelectorAll('.jpdb-reader-word').length).toBe(wordsBefore);
    });

    it('ignores a tiny partial insert that only appears within the surface', () => {
        // A split fragment (の) is a substring of the surface but NOT a duplicate;
        // it must not classify as a rejection or strip the intact word-spans.
        document.body.innerHTML = `<article class="prose"><p id="host">${TEXT}</p></article>`;
        const host = document.getElementById('host')!;
        markReactOwned(host);
        paint(host);
        const wordsBefore = host.querySelectorAll('.jpdb-reader-word').length;
        expect(wordsBefore).toBeGreaterThan(0);

        const insert = new MutationObserver(() => undefined);
        insert.observe(host, { childList: true });
        host.insertBefore(document.createTextNode('の'), host.firstChild);
        const records = insert.takeRecords();
        insert.disconnect();
        const delay = records.map(record => readerRenderRejectionRescanDelay(record)).find(value => value !== null) ?? null;

        expect(delay).toBeNull();
        expect(host.querySelectorAll('.jpdb-reader-word').length).toBe(wordsBefore);
    });
});
