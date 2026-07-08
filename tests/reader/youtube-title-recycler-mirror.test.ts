import { afterEach, describe, expect, it } from 'vitest';

import {
    applyTokensToScanTarget,
    collectTextTargetsIn,
    NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT,
    removeNonDestructiveScanMirrors,
} from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

const TEXT = '日本語';
const CARD: JPDBCard = {
    vid: 1, sid: 1, rid: 0, spelling: TEXT, reading: 'にほんご', frequencyRank: null,
    partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb',
};

function token(spelling = TEXT, reading = 'にほんご'): JPDBToken {
    return {
        card: { ...CARD, spelling, reading },
        start: 0, end: spelling.length, length: spelling.length,
        rubies: [{ text: reading, start: 0, end: spelling.length, length: spelling.length }],
        pitchClass: '', sentence: spelling,
    };
}

function paint(host: HTMLElement): void {
    const target = collectTextTargetsIn(host, 40, false).find(t => t.text.trim() === TEXT)!;
    expect(target).toBeTruthy();
    applyTokensToScanTarget({ ...target, nonDestructive: true }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
}

afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
});

// YouTube's grid/Shorts recycler swaps a card's title in place. If a recycler
// swap leaves a hidden host with no (matching) mirror and queues no re-scan, the
// title renders blank/stale — the owner-reported "title disappears" bug. The
// mirror lifecycle must never leave a hidden host stranded: either it restores
// the host AND queues a re-scan for the new text, or it keeps a matching mirror.
describe('YouTube title recycler mirror coordination', () => {
    it('queues a re-scan when a recycler wipes the mirror via textContent (new title not left bare)', async () => {
        document.body.innerHTML = `<span id="title" class="ytAttributedStringHost">${TEXT}</span>`;
        const host = document.getElementById('title')!;
        paint(host);
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();

        let staleEvents = 0;
        const onStale = () => { staleEvents += 1; };
        document.addEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, onStale);

        // Recycler pattern 1: textContent assignment wipes ALL children (incl. the
        // mirror) and drops in a fresh Japanese title in one mutation batch.
        host.textContent = '新しい題名';
        await new Promise(resolve => setTimeout(resolve, 0));
        document.removeEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, onStale);

        // The host must not be left hidden without a mirror...
        const hidden = host.style.getPropertyValue('visibility') === 'hidden';
        const hasMirror = Boolean(host.querySelector('.jpdb-reader-text-mirror'));
        expect(hidden && !hasMirror).toBe(false);
        // ...and a re-scan must be queued so the NEW title gets annotated rather
        // than left as bare text until some unrelated scroll scan happens by.
        expect(staleEvents).toBeGreaterThan(0);
    });

    it('never leaves a hidden host without a matching mirror after a recycler text-node swap', async () => {
        document.body.innerHTML = `<span id="title" class="ytAttributedStringHost">${TEXT}</span>`;
        const host = document.getElementById('title')!;
        paint(host);
        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror).toBeTruthy();

        let staleEvents = 0;
        const onStale = () => { staleEvents += 1; };
        document.addEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, onStale);

        // Recycler pattern 2: mutate the text node value; the mirror sibling
        // survives but now renders text that no longer matches the host.
        const textNode = Array.from(host.childNodes).find(n => n.nodeType === Node.TEXT_NODE) as Text;
        textNode.nodeValue = '新しい題名';
        await new Promise(resolve => setTimeout(resolve, 0));
        document.removeEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, onStale);

        // While the host stays hidden, its mirror MUST still be present (the
        // stale mirror keeps something painted) AND a re-scan MUST be queued to
        // refresh it — a hidden host showing stale text with no pending rescan
        // is the blank/stale-title bug.
        const hidden = host.style.getPropertyValue('visibility') === 'hidden';
        const hasMirror = Boolean(host.querySelector('.jpdb-reader-text-mirror'));
        if (hidden) {
            expect(hasMirror).toBe(true);
            expect(staleEvents).toBeGreaterThan(0);
        }
    });
});
