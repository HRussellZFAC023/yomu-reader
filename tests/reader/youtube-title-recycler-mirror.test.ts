import { afterEach, describe, expect, it } from 'vitest';

import {
    NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT,
    removeNonDestructiveScanMirrors,
} from '../../src/reader/dom';
import { MIRROR_TEXT as TEXT, paintMirrorToken as paint } from './helpers/japanese-token-fixtures';

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
        paint(host, { nonDestructive: true });
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
        paint(host, { nonDestructive: true });
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
