import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReaderApp } from '../../src/reader/app/main';
import type { ReaderSettings } from '../../src/reader/app/types';
import {
    currentJpdbTermTarget,
    currentLocalDictionaryTargets,
} from '../../src/reader/jpdb/jpdb-page-targets';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';

interface ReaderAppInternals {
    settings: ReaderSettings;
    lastEnhancedHref: string;
    jpdbPageEnhancementGeneration: number;
    jitenEnhancementsNeedRefresh(): boolean;
    refreshJpdbPageEnhancements(): Promise<void>;
    reviewPageWordTargetsStableForMount(): boolean;
}

function stubJpdbVocabularyReview(): void {
    vi.stubGlobal('location', {
        href: 'https://jpdb.io/review',
        origin: 'https://jpdb.io',
        hostname: 'jpdb.io',
        pathname: '/review',
        search: '',
    });
}

function renderVocabularyQuestionFront(): void {
    // Mirrors the signed JPDB vocabulary-review question shape: the reviewed
    // word appears only as a generic `.plain` token inside the prompt sentence,
    // while answer-only sections do not exist until Show answer is pressed.
    document.body.innerHTML = `
        <main>
            <form action="/review" method="post">
                <input name="c" type="hidden" value="vf,1227560,665431007">
                <section class="review-card">
                    <div class="prompt">
                        <div class="sentence" lang="ja">
                            食べ物は<span class="plain">たっぷり</span>ある。
                        </div>
                    </div>
                    <button type="button">Show answer</button>
                </section>
            </form>
        </main>
    `;
}

function wordEnhancementSettings(): ReaderSettings {
    return {
        ...DEFAULT_SETTINGS,
        jpdbPageEnhancementsEnabled: true,
        jpdbPageWordEnhancementsEnabled: true,
        localDictionariesEnabled: false,
        jpdbDefinitionsEnabled: false,
        jitenDefinitionsEnabled: false,
        bunproDefinitionsEnabled: false,
        immersionKitEnabled: true,
    };
}

describe('JPDB vocabulary review front targets', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.replaceChildren();
    });

    it('waits for the native answer before exposing a term or mounting an addon', async () => {
        stubJpdbVocabularyReview();
        renderVocabularyQuestionFront();
        const promptToken = document.querySelector<HTMLElement>('.prompt .plain');

        expect(promptToken?.textContent).toBe('たっぷり');
        expect(currentJpdbTermTarget()).toBeNull();
        expect(currentLocalDictionaryTargets()).toEqual([]);

        const app = new ReaderApp();
        const internals = app as unknown as ReaderAppInternals;
        internals.settings = wordEnhancementSettings();
        // Remove the review transition settle delay from this unit. On the
        // regressed implementation this makes the false `.plain` target mount
        // its addon immediately; the fixed implementation still has no target.
        internals.reviewPageWordTargetsStableForMount = () => true;

        try {
            await internals.refreshJpdbPageEnhancements();
            expect(document.querySelector('[data-yomu-jpdb-addon]')).toBeNull();

            document.querySelector('form')!.insertAdjacentHTML('beforeend', `
                <section class="review-reveal">
                    <div class="answer-box">
                        <div class="plain" lang="ja"><ruby>たっぷり<rt>たっぷり</rt></ruby></div>
                    </div>
                    <section class="subsection-meanings">plentifully; fully</section>
                </section>
            `);

            expect(currentJpdbTermTarget()).toMatchObject({
                term: 'たっぷり',
                reading: 'たっぷり',
            });
            expect(currentLocalDictionaryTargets()).toHaveLength(1);
        } finally {
            app.destroy();
        }
    });

    it('does not mistake a retained Yomu answer addon for native reveal content', async () => {
        stubJpdbVocabularyReview();
        renderVocabularyQuestionFront();
        document.querySelector('main')!.insertAdjacentHTML('beforeend', `
            <div
                data-jpdb-reader-root="true"
                data-yomu-jpdb-addon="word"
                data-yomu-addon-key="word:前:まえ"
                data-yomu-generation="0"
            >
                <section class="subsection-meanings">previous answer</section>
            </div>
        `);

        expect(currentJpdbTermTarget()).toBeNull();
        expect(currentLocalDictionaryTargets()).toEqual([]);

        const app = new ReaderApp();
        const internals = app as unknown as ReaderAppInternals;
        internals.settings = wordEnhancementSettings();
        internals.lastEnhancedHref = location.href;

        try {
            expect(internals.jitenEnhancementsNeedRefresh()).toBe(true);
            await internals.refreshJpdbPageEnhancements();
            expect(document.querySelector('[data-yomu-jpdb-addon]')).toBeNull();
        } finally {
            app.destroy();
        }
    });
});
