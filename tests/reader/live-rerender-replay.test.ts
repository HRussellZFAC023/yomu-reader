import { afterEach, describe, expect, it } from 'vitest';

import {
    applyTokensToScanTarget,
    collectTextTargetsIn,
    NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT,
    nonDestructiveRenderReplayCountForTest,
    projectAdditiveTextMirrors,
    removeNonDestructiveScanMirrors,
} from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

const TEXT = '日本語';
const CARD: JPDBCard = {
    vid: 1, sid: 1, rid: 0, spelling: TEXT, reading: 'にほんご', frequencyRank: null,
    partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb',
};

function token(): JPDBToken {
    return {
        card: { ...CARD },
        start: 0, end: TEXT.length, length: TEXT.length,
        rubies: [{ text: 'にほんご', start: 0, end: TEXT.length, length: TEXT.length }],
        pitchClass: '', sentence: TEXT,
    };
}

function paint(host: HTMLElement): void {
    const target = collectTextTargetsIn(host, 40, false).find(t => t.text.trim() === TEXT)!;
    expect(target).toBeTruthy();
    applyTokensToScanTarget({ ...target, nonDestructive: true }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
}

function flushObservers(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
});

// Class Y (live-page thrash) + class BB (mobile scroll content-shift):
// framework re-renders with UNCHANGED text (ytd-watch-info-text every ~6s on
// live streams; scroll recyclers rehydrating tiles) must re-apply the cached
// render synchronously in the mutation-observer microtask — no stale event
// (i.e. no scheduled re-scan/re-parse), no bare frame, no paint change.
describe('identical-text re-render replays the cached render (class Y/BB)', () => {
    it('preserves the multiline prose reading lane across a cache replay', async () => {
        const prose = `${TEXT}\n${TEXT}`;
        document.body.innerHTML = `<span id="info" style="display:block;white-space:pre-wrap;font-size:14px;line-height:16px">${prose}</span>`;
        const host = document.getElementById('info')!;
        applyTokensToScanTarget({
            node: host.firstChild as Text,
            parent: host,
            text: prose,
            nonDestructive: true,
            decoration: 'content-ruby',
            proseWrap: true,
        }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        projectAdditiveTextMirrors(document);
        expect(host.style.lineHeight).toBe('29px');

        host.textContent = prose;
        await flushObservers();
        projectAdditiveTextMirrors(document);

        const replayed = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(replayed.dataset.yomuReadingLaneCandidate).toBe('true');
        expect(host.style.lineHeight).toBe('29px');
    });

    it('does not restore a removed inline line-height while replaying a wiped mirror', async () => {
        const prose = `${TEXT}\n${TEXT}`;
        document.body.innerHTML = `<span id="info" style="display:block;white-space:pre-wrap;font-size:14px;line-height:16px">${prose}</span>`;
        const host = document.getElementById('info')!;
        applyTokensToScanTarget({
            node: host.firstChild as Text,
            parent: host,
            text: prose,
            nonDestructive: true,
            decoration: 'content-ruby',
        }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        projectAdditiveTextMirrors(document);
        expect(host.style.lineHeight).toBe('29px');

        host.style.removeProperty('line-height');
        host.textContent = prose;
        await flushObservers();
        projectAdditiveTextMirrors(document);
        removeNonDestructiveScanMirrors(document);

        expect(host.style.lineHeight).toBe('');
    });

    it('replays N recycle cycles from cache with zero stale rescans and stable paint inputs', async () => {
        document.body.innerHTML = `<span id="info" class="ytAttributedStringHost">${TEXT}</span>`;
        const host = document.getElementById('info')!;
        paint(host);
        const initialMirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(initialMirror).toBeTruthy();
        const initialSignature = initialMirror.dataset.renderSignature;
        const initialSourceText = initialMirror.dataset.sourceText;
        const initialHostStyle = host.getAttribute('style') ?? '';
        // Paint invariance baseline: the source glyphs remain authoritative.
        expect(host.style.getPropertyValue('visibility')).toBe('');

        let staleEvents = 0;
        const onStale = () => { staleEvents += 1; };
        document.addEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, onStale);
        const replaysBefore = nonDestructiveRenderReplayCountForTest();

        const cycles = 5;
        for (let cycle = 0; cycle < cycles; cycle += 1) {
            // The 6s live re-render / scroll-recycle shape: children replaced
            // (mirror wiped) with byte-identical text in one mutation batch.
            host.textContent = TEXT;
            await flushObservers();

            const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror');
            expect(mirror, `cycle ${cycle}: mirror must be re-applied`).toBeTruthy();
            // Deterministic same-input/same-output: identical render signature
            // and source text, identical host inline paint writes — so the
            // row's paint inputs (and therefore its height) cannot oscillate.
            expect(mirror!.dataset.renderSignature).toBe(initialSignature);
            expect(mirror!.dataset.sourceText).toBe(initialSourceText);
            expect(mirror!.querySelector('.jpdb-reader-furi')?.textContent).toBe('にほんご');
            expect(host.style.getPropertyValue('visibility')).toBe('');
            expect(host.getAttribute('style') ?? '').toBe(initialHostStyle);
        }
        document.removeEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, onStale);

        // N recycles = N cache replays and ZERO stale rescans (a stale event is
        // the only trigger for the re-scan → re-parse → re-decorate churn).
        expect(staleEvents).toBe(0);
        expect(nonDestructiveRenderReplayCountForTest() - replaysBefore).toBe(cycles);
    });

    it('still dispatches stale (and does not replay) when the re-rendered text CHANGED', async () => {
        document.body.innerHTML = `<span id="title" class="ytAttributedStringHost">${TEXT}</span>`;
        const host = document.getElementById('title')!;
        paint(host);
        let staleEvents = 0;
        const onStale = () => { staleEvents += 1; };
        document.addEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, onStale);
        const replaysBefore = nonDestructiveRenderReplayCountForTest();

        host.textContent = '新しい題名';
        await flushObservers();
        document.removeEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, onStale);

        expect(staleEvents).toBeGreaterThan(0);
        expect(nonDestructiveRenderReplayCountForTest() - replaysBefore).toBe(0);
    });

    it('never replays after a bulk clear (annotations off must stay off)', async () => {
        document.body.innerHTML = `<span id="info" class="ytAttributedStringHost">${TEXT}</span>`;
        const host = document.getElementById('info')!;
        paint(host);
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();

        removeNonDestructiveScanMirrors(document);
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeFalsy();
        const replaysBefore = nonDestructiveRenderReplayCountForTest();

        // A framework re-render with identical text after the clear must not
        // resurrect the mirror from the (now invalidated) cache.
        host.textContent = TEXT;
        await flushObservers();
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeFalsy();
        expect(nonDestructiveRenderReplayCountForTest() - replaysBefore).toBe(0);
    });
});
