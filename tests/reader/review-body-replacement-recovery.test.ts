import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import type { ReaderSettings } from '../../src/reader/app/types';
import { currentLocalDictionaryTargets } from '../../src/reader/jpdb/jpdb-page-targets';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';

interface ReaderAppInternals {
    settings: ReaderSettings;
    disposeJpdbReviewBridge?: () => void;
    setupAutoScan(): void;
    installFab(): void;
    observeAutoScanMutations(): void;
    scheduleJpdbPageEnhancements(delay?: number, options?: { preserveEarlier?: boolean }): void;
}

function stubJpdbReviewLocation(): void {
    vi.stubGlobal('location', {
        href: 'https://jpdb.io/review',
        origin: 'https://jpdb.io',
        hostname: 'jpdb.io',
        pathname: '/review',
        search: '',
    });
}

function jpdbQuestionBody(): HTMLBodyElement {
    const body = document.createElement('body');
    body.innerHTML = `
        <main>
            <form action="/review">
                <section class="review-card">
                    <div class="prompt"><span class="plain" lang="ja">たっぷり</span></div>
                    <input type="submit" value="Show answer">
                </section>
            </form>
        </main>
    `;
    return body;
}

function jpdbAnswerBody(): HTMLBodyElement {
    const body = document.createElement('body');
    body.innerHTML = `
        <main>
            <form action="/review">
                <section class="review-card">
                    <div class="prompt"><span class="plain" lang="ja">たっぷり</span></div>
                    <section class="answer-box">
                        <div class="plain" lang="ja"><ruby>たっぷり<rt>たっぷり</rt></ruby></div>
                        <section class="subsection-meanings">plentifully; fully</section>
                    </section>
                </section>
            </form>
        </main>
    `;
    return body;
}

function stubJitenStudyLocation(): void {
    vi.stubGlobal('location', {
        href: 'https://jiten.moe/srs/study',
        origin: 'https://jiten.moe',
        hostname: 'jiten.moe',
        pathname: '/srs/study',
        search: '',
    });
}

async function deliverMutationObserverRecords(): Promise<void> {
    // MutationObserver delivery happens at a microtask checkpoint. Give the
    // document-root recovery callback and the observer it installs one turn
    // each, without racing a polling timer against Vitest's test deadline.
    await Promise.resolve();
    await Promise.resolve();
}

describe('review page body replacement recovery', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        document.body.replaceChildren();
    });

    it('rebinds the scanner and puck and schedules JPDB enhancement recovery', async () => {
        stubJpdbReviewLocation();
        document.documentElement.replaceChild(jpdbQuestionBody(), document.body);
        const app = new ReaderApp();
        const internals = app as unknown as ReaderAppInternals;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            jpdbPageEnhancementsEnabled: true,
            jpdbPageWordEnhancementsEnabled: true,
        };
        const installFab = vi.fn();
        const scheduleEnhancements = vi.fn();
        const disposeDetachedBodyBridge = vi.fn();
        const closeReplacementBodyBridge = vi.fn();
        const publishReplacementBodyStatus = vi.fn();
        class TestBroadcastChannel {
            onmessage: ((event: MessageEvent) => void) | null = null;
            postMessage = publishReplacementBodyStatus;
            close = closeReplacementBodyBridge;
        }
        vi.stubGlobal('BroadcastChannel', TestBroadcastChannel);
        internals.installFab = installFab;
        internals.scheduleJpdbPageEnhancements = scheduleEnhancements;
        internals.disposeJpdbReviewBridge = disposeDetachedBodyBridge;
        const observeBody = vi.spyOn(internals, 'observeAutoScanMutations');

        try {
            internals.setupAutoScan();
            observeBody.mockClear();
            scheduleEnhancements.mockClear();

            // The question-side sentence contains the reviewed spelling, but
            // remains definition/media-free until the native control reveals it.
            expect(currentLocalDictionaryTargets()).toEqual([]);
            const reveal = document.querySelector<HTMLInputElement>('input[value="Show answer"]')!;
            reveal.addEventListener('click', event => event.preventDefault(), { once: true });
            reveal.click();
            expect(scheduleEnhancements).toHaveBeenCalledWith(0, { preserveEarlier: true });
            scheduleEnhancements.mockClear();

            // Signed JPDB replaces <body> while keeping the userscript realm
            // alive. Model that exact transition rather than only replacing a
            // review-card child.
            document.documentElement.replaceChild(jpdbAnswerBody(), document.body);

            await deliverMutationObserverRecords();
            expect(observeBody).toHaveBeenCalled();
            expect(installFab).toHaveBeenCalledTimes(1);
            expect(disposeDetachedBodyBridge).toHaveBeenCalledTimes(1);
            expect(scheduleEnhancements).toHaveBeenCalledWith(0, { preserveEarlier: true });
            expect(internals.disposeJpdbReviewBridge).not.toBe(disposeDetachedBodyBridge);
            expect(currentLocalDictionaryTargets()).toHaveLength(1);
            expect(document.querySelector('[data-yomu-jpdb-addon]')).toBeNull();

            vi.useFakeTimers();
            try {
                const publishesAfterRebind = publishReplacementBodyStatus.mock.calls.length;
                document.querySelector('.answer-box')!.append(document.createElement('span'));
                await deliverMutationObserverRecords();
                // The replacement bridge intentionally coalesces DOM churn for
                // 160 ms. Advance its production debounce deterministically; no
                // host-load-dependent wall-clock polling is involved.
                expect(publishReplacementBodyStatus).toHaveBeenCalledTimes(publishesAfterRebind);
                await vi.advanceTimersByTimeAsync(160);
                expect(publishReplacementBodyStatus.mock.calls.length).toBeGreaterThan(publishesAfterRebind);
            } finally {
                vi.useRealTimers();
            }
        } finally {
            app.destroy();
        }
    });

    it('schedules the existing enhancement pipeline for an in-place Jiten reveal', () => {
        stubJitenStudyLocation();
        document.body.innerHTML = `
            <main>
                <button type="button"><span>Reveal answer</span></button>
                <div class="text-5xl" lang="ja">図鑑</div>
            </main>
        `;
        const app = new ReaderApp();
        const internals = app as unknown as ReaderAppInternals;
        internals.settings = { ...DEFAULT_SETTINGS, jpdbPageEnhancementsEnabled: true };
        const scheduleEnhancements = vi.fn();
        internals.scheduleJpdbPageEnhancements = scheduleEnhancements;

        try {
            internals.setupAutoScan();
            scheduleEnhancements.mockClear();

            document.querySelector<HTMLSpanElement>('button span')!.click();

            expect(scheduleEnhancements).toHaveBeenCalledWith(0, { preserveEarlier: true });
            expect(document.querySelector('[data-yomu-jpdb-addon]')).toBeNull();
        } finally {
            app.destroy();
        }
    });
});
