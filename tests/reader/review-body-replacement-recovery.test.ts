import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import type { ReaderSettings } from '../../src/reader/app/types';
import { currentLocalDictionaryTargets } from '../../src/reader/jpdb/jpdb-page-targets';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import { waitForExpect } from './test-utils';

interface ReaderAppInternals {
    settings: ReaderSettings;
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
        internals.installFab = installFab;
        internals.scheduleJpdbPageEnhancements = scheduleEnhancements;
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

            await waitForExpect(() => {
                expect(observeBody).toHaveBeenCalled();
                expect(installFab).toHaveBeenCalledTimes(1);
                expect(scheduleEnhancements).toHaveBeenCalledWith(0, { preserveEarlier: true });
            });
            expect(currentLocalDictionaryTargets()).toHaveLength(1);
            expect(document.querySelector('[data-yomu-jpdb-addon]')).toBeNull();
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
