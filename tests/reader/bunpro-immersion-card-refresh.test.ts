import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReaderApp } from '../../src/reader/app/main';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import { currentBunproLocalDictionaryTargets } from '../../src/reader/bunpro/page-targets';
import type { ReaderSettings } from '../../src/reader/app/types';

interface ReaderAppInternals {
    settings: ReaderSettings;
    lastEnhancedHref: string;
    jitenEnhancementsNeedRefresh(): boolean;
}

function stubReviews(): void {
    vi.stubGlobal('location', {
        href: 'https://bunpro.jp/reviews?only_review=vocab',
        origin: 'https://bunpro.jp',
        hostname: 'bunpro.jp',
        pathname: '/reviews',
        search: '?only_review=vocab',
    });
}

function renderAnswer(term: string): void {
    document.body.innerHTML = `
        <main id="js-quiz">
            <section id="js-tour-quiz-question"><p class="bp-quiz-question">例文</p></section>
            <section id="js-tour-quiz-answer" data-case="answer">
                <header id="js-rev-header"><h1 id="rev-id-1"><ruby>${term}<rt>よむ</rt></ruby></h1></header>
                <div data-case="last">Details</div>
            </section>
        </main>
    `;
}

function mountAddon(key: string): void {
    const addon = document.createElement('div');
    addon.dataset.jpdbReaderRoot = 'true';
    addon.dataset.yomuJpdbAddon = 'word';
    addon.dataset.yomuAddonKey = key;
    addon.dataset.yomuGeneration = '1';
    addon.dataset.yomuAnchorFallback = 'false';
    document.querySelector('[data-case="answer"]')!.append(addon);
}

function currentAddonKey(): string {
    const [target] = currentBunproLocalDictionaryTargets();
    return target ? `word:${target.term}:${target.reading}` : '';
}

describe('bunpro in-place SRS refresh gate', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.replaceChildren();
    });

    it('refreshes the Immersion Kit when Bunpro swaps the revealed item under the same URL', () => {
        stubReviews();
        const app = new ReaderApp();
        const internals = app as unknown as ReaderAppInternals;
        internals.settings = { ...DEFAULT_SETTINGS, jpdbPageEnhancementsEnabled: true, immersionKitEnabled: true };
        try {
            renderAnswer('読む');
            mountAddon(currentAddonKey());
            internals.lastEnhancedHref = location.href;
            expect(internals.jitenEnhancementsNeedRefresh()).toBe(false);

            document.querySelector('#js-rev-header ruby')!.childNodes[0]!.textContent = '書く';
            expect(internals.jitenEnhancementsNeedRefresh()).toBe(true);
        } finally {
            app.destroy();
        }
    });

    it('removes the preceding answer addon as soon as the next prompt is hidden', () => {
        stubReviews();
        const app = new ReaderApp();
        const internals = app as unknown as ReaderAppInternals;
        internals.settings = { ...DEFAULT_SETTINGS, jpdbPageEnhancementsEnabled: true, immersionKitEnabled: true };
        try {
            renderAnswer('読む');
            mountAddon(currentAddonKey());
            internals.lastEnhancedHref = location.href;
            // Model the in-place quiz shell retaining the previous addon while
            // React replaces only Bunpro's native answer subtree.
            const addon = document.querySelector<HTMLElement>('[data-yomu-jpdb-addon]')!;
            document.querySelector('#js-quiz')!.append(addon);
            document.querySelector('#js-tour-quiz-answer')!.remove();
            document.querySelector('#js-quiz')!.insertAdjacentHTML('beforeend', '<input id="js-manual-input">');

            expect(currentBunproLocalDictionaryTargets()).toEqual([]);
            expect(internals.jitenEnhancementsNeedRefresh()).toBe(true);
        } finally {
            app.destroy();
        }
    });
});
