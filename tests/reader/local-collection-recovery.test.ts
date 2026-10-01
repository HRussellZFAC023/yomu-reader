import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JPDBCard } from '../../src/reader/app/types';
import { resetManagedStateEpochSessionsForTests } from '../../src/reader/app/managed-state-epoch';
import { resetActiveLearningTargetLanguage, setActiveLearningTargetLanguage } from '../../src/reader/languages/active';
import type { NewTabController } from '../../src/reader/newtab/controller';
import { NewTabRuntime } from '../../src/reader/newtab/runtime';
import { DEFAULT_NEW_TAB_UI_STATE } from '../../src/reader/newtab/state';
import { DEFAULT_SETTINGS, loadSettings } from '../../src/reader/settings';
import { exportSettingsBackupSnapshot } from '../../src/reader/settings/settings-backup';
import { runSettingsRestoreTransaction } from '../../src/reader/settings/settings-restore-transaction';
import { createYomuLocalSrsAdapter, LocalYomuSrsRepository } from '../../src/reader/srs/local-yomu';
import { LocalYomuSrsStore } from '../../src/reader/srs/local-yomu-store';
import { canonicalStudyCardKey } from '../../src/reader/srs/shared';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';
import { newTabPromptController, newTabTestCard } from './new-tab-review/fixtures';

// C04 recovery through the real backup and storage layers: a Backup & sync
// export restores saved context into a fresh profile, and a restore or save
// interrupted at the index commit (storage throws, or the page closes while the
// write is in flight) leaves every card record old or new and complete.
const INDEX_KEY = 'yomu:srs-local:v2:index';
const CARD_PREFIX = 'yomu:srs-local:v2:card:';
const SENTENCE = '毎晩、本を読むのが好きです。';
const SOURCE_URL = 'https://reader-fixture.example/articles/evening-reading.html';
const SOURCE_TITLE = 'Evening reading';
const READ = canonicalStudyCardKey('読む', 'よむ');
const BOOK = canonicalStudyCardKey('本', 'ほん');
const NOW = Date.parse('2026-09-30T10:00:00.000Z');

type IndexFault = 'none' | 'throw' | 'never-settles';

/** One browser profile's userscript storage, with a fault seam on the deck's commit record. */
function openProfile(values = new Map<string, unknown>()) {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
    resetManagedStateEpochSessionsForTests();
    const profile = { values, indexFault: 'none' as IndexFault };
    installGmStorageFixture(values, {
        beforeSet: key => {
            if (!key.startsWith(INDEX_KEY) || profile.indexFault === 'none') return undefined;
            if (profile.indexFault === 'throw') throw new DOMException('Quota exceeded', 'QuotaExceededError');
            return new Promise<void>(() => undefined);
        },
    });
    // Export enumerates the manager's keys, as Tampermonkey's GM_listValues does.
    vi.stubGlobal('GM_listValues', () => [...values.keys()]);
    return profile;
}

async function collectAndExport() {
    openProfile();
    const repository = new LocalYomuSrsRepository(() => NOW);
    await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to read', sentence: SENTENCE, sourceUrl: SOURCE_URL, sourceTitle: SOURCE_TITLE });
    await repository.mine({ expression: '本', reading: 'ほん', meaning: 'book', sentence: SENTENCE, sourceUrl: SOURCE_URL, sourceTitle: SOURCE_TITLE });
    await repository.startReview(READ);
    return (await exportSettingsBackupSnapshot(await loadSettings())).storage;
}

function restore(storage: Record<string, unknown>) {
    return runSettingsRestoreTransaction({ storage, publishSettings: async () => undefined });
}

// What Study's Library and review queue read.
async function library() {
    const repository = createYomuLocalSrsAdapter(new LocalYomuSrsRepository(() => NOW));
    return {
        collection: (await repository.collection!()).map(card => ({
            expression: card.expression, sentence: card.sentence, sourceUrl: card.sourceUrl, sourceTitle: card.sourceTitle, level: card.srsLevel, dueAt: card.dueAt,
        })),
        queue: (await repository.queue()).cards.map(card => card.expression),
    };
}

function deckRecordKeys(values: Map<string, unknown>): string[] {
    return [...values.keys()].filter(key => key.startsWith('yomu:srs-local:')).sort();
}

// What the learner sees on the Study page: Library rows and the Stats due count.
function libraryRows(): string[] {
    return [...document.querySelectorAll('.jpdb-reader-newtab-browse-item [data-expression]')]
        .map(row => row.getAttribute('data-expression') ?? '').sort();
}

// The due count once Stats has loaded the local deck ('' until then).
function statsDueNow(): string {
    const deck = document.querySelector('.jpdb-reader-stats-connection.is-yomu-local')?.getAttribute('data-stats-status');
    if (!deck || deck === 'setup' || deck === 'loading') return '';
    const metric = [...document.querySelectorAll('.jpdb-reader-stats-metric')]
        .find(item => item.querySelector('.jpdb-reader-stats-metric-label')?.textContent?.trim() === 'Due now');
    return metric?.querySelector('strong')?.textContent?.trim() ?? '';
}

describe('local collection export and recovery', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); resetActiveLearningTargetLanguage(); });

    it('refreshes a Study page that loaded Library, Stats and a queue before the restore, as a reload would', async () => {
        const backup = await collectAndExport();
        openProfile();
        setActiveLearningTargetLanguage('ja');
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, learningTargetChosen: true }, {
            srsAdapters: { 'yomu-local': createYomuLocalSrsAdapter(new LocalYomuSrsRepository(() => NOW)) },
        });
        const study = controller as unknown as { state: typeof DEFAULT_NEW_TAB_UI_STATE; allWords: JPDBCard[] };
        const open = (mode: 'word' | 'search' | 'stats') => document.querySelector<HTMLButtonElement>(
            `.jpdb-reader-newtab-mode [data-newtab-action="mode"][data-mode="${mode}"]`,
        )!.click();
        try {
            // The fresh profile's Study page reopens on Stats with its queue
            // already built; the learner then opens Library.
            study.state = { ...DEFAULT_NEW_TAB_UI_STATE, route: 'stats', source: 'auto' };
            study.allWords = [newTabTestCard({ spelling: '電話', reading: 'でんわ' })];
            await controller.renderPage();
            await vi.waitFor(() => expect(statsDueNow()).toBe('0'));
            open('search');
            await vi.waitFor(() => expect(document.querySelector('.jpdb-reader-newtab-browse-empty')).not.toBeNull());

            await restore(backup);
            await controller.refreshExternalData();

            await vi.waitFor(() => expect(libraryRows()).toEqual(['本', '読む']));
            open('stats');
            await vi.waitFor(() => expect(statsDueNow()).toBe('1'));
            open('word');
            await vi.waitFor(() => expect(document.querySelector('[data-newtab-prompt]')?.textContent).toContain('読む'));
        } finally { controller.destroy(); }
    });

    it('has a restore from Study Settings refresh the Study page under the dialog', () => {
        const runtime = new NewTabRuntime();
        const internals = runtime as unknown as {
            newTab: Pick<NewTabController, 'isCurrentPage' | 'refreshExternalData' | 'destroy'>;
            parseContentCache: { clear(): void };
            settingsDialog: { applySettingsRestoreEffects(refreshOcr: boolean): void };
        };
        const refreshExternalData = vi.fn(async () => undefined);
        internals.newTab = { isCurrentPage: () => true, refreshExternalData, destroy: vi.fn() };
        const clearParsedStudyText = vi.spyOn(internals.parseContentCache, 'clear');
        try {
            // What both the file import and the cloud restore run once they commit.
            internals.settingsDialog.applySettingsRestoreEffects(false);
            expect(refreshExternalData).toHaveBeenCalledOnce();
            expect(clearParsedStudyText).toHaveBeenCalled();
        } finally { runtime.destroy(); }
    });

    it('restores saved context into a fresh profile, scheduling only the word added to review', async () => {
        const backup = await collectAndExport();
        expect(backup[INDEX_KEY]).toMatchObject({ cardIds: [BOOK, READ] });
        expect(backup[`${CARD_PREFIX}${encodeURIComponent(BOOK)}`]).toMatchObject({ sentence: SENTENCE, sourceUrl: SOURCE_URL, sourceTitle: SOURCE_TITLE, reviewEnabled: false });

        openProfile();
        await restore(backup);

        expect(await library()).toEqual({
            collection: expect.arrayContaining([
                { expression: '本', sentence: SENTENCE, sourceUrl: SOURCE_URL, sourceTitle: SOURCE_TITLE, level: 'Saved', dueAt: undefined },
                { expression: '読む', sentence: SENTENCE, sourceUrl: SOURCE_URL, sourceTitle: SOURCE_TITLE, level: 'New', dueAt: NOW },
            ]),
            queue: ['読む'],
        });
    });

    it('rolls an interrupted restore back to the fresh profile, then restores on retry', async () => {
        const backup = await collectAndExport();
        const profile = openProfile();
        profile.indexFault = 'throw';

        await expect(restore(backup)).rejects.toThrow();

        expect(deckRecordKeys(profile.values)).toEqual([]);
        expect(await library()).toEqual({ collection: [], queue: [] });
        profile.indexFault = 'none';
        await restore(backup);
        expect((await library()).collection.map(card => card.expression).sort()).toEqual(['本', '読む']);
    });

    it('opens the old deck after a restore dies before its index commit, and a retry completes it', async () => {
        const backup = await collectAndExport();
        const profile = openProfile();
        profile.indexFault = 'never-settles';
        void restore(backup).catch(() => undefined);
        await vi.waitFor(() => expect(profile.values.has(`${CARD_PREFIX}${encodeURIComponent(READ)}`)).toBe(true));

        // The page is gone: nothing can roll the staged card records back.
        profile.indexFault = 'none';
        expect(await new LocalYomuSrsStore().read()).toEqual({ version: 1, cards: {} });
        expect(await library()).toEqual({ collection: [], queue: [] });

        await restore(backup);
        expect(await library()).toMatchObject({ queue: ['読む'] });
        expect((await library()).collection.map(card => card.expression).sort()).toEqual(['本', '読む']);
    });

    it('keeps one complete record with its schedule when a save of a reviewed word dies mid-write', async () => {
        const profile = openProfile();
        const repository = new LocalYomuSrsRepository(() => NOW);
        const saved = await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to read', sentence: SENTENCE, sourceUrl: SOURCE_URL });
        await repository.startReview(READ);
        await repository.review({ card: saved.card!, grade: 'good' });
        const before = await new LocalYomuSrsStore().read();

        profile.indexFault = 'never-settles';
        void repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to peruse', sentence: '別の文。' }).catch(() => undefined);
        await vi.waitFor(() => expect(profile.values.get(`${CARD_PREFIX}${encodeURIComponent(READ)}`)).toMatchObject({ meanings: ['to read', 'to peruse'] }));

        const after = await new LocalYomuSrsStore().read();
        expect(Object.keys(after.cards)).toEqual([READ]);
        const { meanings: _meanings, updatedAt: _updatedAt, ...schedule } = after.cards[READ]!;
        const { meanings: _before, updatedAt: _beforeUpdated, ...previousSchedule } = before.cards[READ]!;
        expect(schedule).toEqual(previousSchedule);
        expect(after.cards[READ]).toMatchObject({ sentence: SENTENCE, reviews: 1, dueAt: NOW + 2 * 86_400_000 });
    });
});
