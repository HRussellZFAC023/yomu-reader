import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_WORK_LEASE_MS } from '../../src/reader/app/gm-storage-lease';
import { resetManagedStateEpochSessionsForTests } from '../../src/reader/app/managed-state-epoch';
import type { JPDBCard } from '../../src/reader/app/types';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';

// A learner's save in one tab while another tab died in the middle of the same
// kind of save (closed, crashed, or killed by the OS). Each tab is its own realm
// over one userscript store; the dead tab's timers and in-flight write stop with
// it. Its lease must hold the save up for seconds, not a minute, and the
// waiting tab must say why it is waiting.
const DECK_INDEX_KEY = 'yomu:srs-local:v2:index';
const SETTINGS_INTENT_KEY = 'yomu:settings-intent:v2';
const LIVE_REVIEW_KEY = 'yomu:newtab-live-review:v1';
const NOW = Date.parse('2026-09-30T10:00:00.000Z');

function openProfile(dyingWriteKey: string) {
    localStorage.clear();
    resetManagedStateEpochSessionsForTests();
    const values = new Map<string, unknown>();
    const profile = { values, dying: false, died: false };
    installGmStorageFixture(values, {
        // The dying tab's write of this key is in flight when the tab goes away: it never lands.
        beforeSet: key => {
            if (!profile.dying || !key.startsWith(dyingWriteKey)) return undefined;
            profile.died = true;
            return new Promise<void>(() => undefined);
        },
    });
    vi.stubGlobal('GM_listValues', () => [...values.keys()]);
    return profile;
}

async function openTab() {
    vi.resetModules();
    const [deck, store, settings, saveWait, providers, errors] = await Promise.all([
        import('../../src/reader/srs/local-yomu'),
        import('../../src/reader/srs/local-yomu-store'),
        import('../../src/reader/settings'),
        import('../../src/reader/app/save-wait'),
        import('../../src/reader/cards/srs-providers'),
        import('../../src/reader/app/user-facing-errors'),
    ]);
    const waits: boolean[] = [];
    saveWait.watchSavesWaitingForAnotherTab(waiting => waits.push(waiting));
    return { deck, store, settings, waits, providers, errors };
}

type Tab = Awaited<ReturnType<typeof openTab>>;

/** "Add to deck +" saving to the Academy deck, as the popup does. */
function saveToAcademy(tab: Tab, spelling: string, reading: string): Promise<void> {
    const academy = tab.providers.createApiSrsProviderAdapters({
        jpdb: {} as never,
        yomuLocal: tab.deck.createYomuLocalSrsAdapter(new tab.deck.LocalYomuSrsRepository(() => NOW)),
        isJpdbBackedCard: () => false,
    }, { ...DEFAULT_SETTINGS, yomuLocalSrsEnabled: true }).find(provider => provider.id === 'yomu-local')!;
    return academy.addToDeck('yomu-local', { vid: 0, sid: 0, rid: 0, spelling, reading, frequencyRank: null, partOfSpeech: [],
        meanings: [{ glosses: ['gloss'], partOfSpeech: [] }], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null });
}

/** What the learner is told about a failed save, in English and Japanese. */
function learnerText(tab: Tab, error: unknown): string[] {
    return (['en', 'ja'] as const).map(language => tab.errors.userFacingErrorText(language, 'actionFailed', error));
}

const SAVE_INTERRUPTED = [
    'Your Academy deck was not saved because saving was interrupted. Try again.',
    '保存が中断されたため、Academyデッキに保存されませんでした。もう一度お試しください。',
];

/** The OS suspends the tab for longer than its lease right after its next card record lands. */
function suspendAfterNextCardWrite(): void {
    const write = (globalThis as { GM_setValue?: unknown }).GM_setValue as (key: string, value: unknown) => Promise<void>;
    let armed = true;
    vi.stubGlobal('GM_setValue', async (key: string, value: unknown) => {
        await write(key, value);
        if (!armed || !key.startsWith('yomu:srs-local:v2:card:')) return;
        armed = false;
        vi.setSystemTime(Date.now() + STORAGE_WORK_LEASE_MS + 1_000);
    });
}

/** Starts a save in a tab that dies at the profile's dying write, and returns once it has died. */
async function dieMidSave(profile: { dying: boolean; died: boolean }, save: () => Promise<unknown>, stepMs = 0): Promise<void> {
    const timers = vi.spyOn(globalThis, 'setInterval').mockImplementation(() => 0 as never);
    profile.dying = true;
    void save().catch(() => undefined);
    for (let turn = 0; turn < 200 && !profile.died; turn++) await vi.advanceTimersByTimeAsync(stepMs);
    expect(profile.died).toBe(true);
    profile.dying = false;
    timers.mockRestore();
}

/**
 * Stalls a tab right after it reads `key` while holding `lease`, as a tab the
 * OS suspends mid-save: the read returns what storage held then, but only once
 * the tab resumes. Its renewal timer does not run meanwhile.
 */
async function stallAfterRead(profile: { values: Map<string, unknown> }, key: string, lease: string, save: () => Promise<unknown>) {
    const read = (globalThis as { GM_getValue?: unknown }).GM_getValue as (key: string, fallback: unknown) => Promise<unknown>;
    let resume: (() => void) | undefined;
    vi.stubGlobal('GM_getValue', (requested: string, fallback: unknown) => {
        const holding = [...profile.values.keys()].some(stored => stored.startsWith(`yomu:lease:${lease}:`));
        if (resume || requested !== key || !holding) return read(requested, fallback);
        const snapshot = read(requested, fallback);
        return new Promise(answer => { resume = () => answer(snapshot); });
    });
    const timers = vi.spyOn(globalThis, 'setInterval').mockImplementation(() => 0 as never);
    const stale = save();
    stale.catch(() => undefined);
    for (let turn = 0; turn < 50 && !resume; turn++) await vi.advanceTimersByTimeAsync(0);
    expect(resume).toBeDefined();
    timers.mockRestore();
    return { stale, resume: () => resume?.() };
}

/** A Study tab of its own realm, grading online reviews of one card under account-a. */
async function studyTab() {
    vi.resetModules();
    const { NewTabGradeQueue } = await import('../../src/reader/newtab/grade-queue');
    return new NewTabGradeQueue({ owner: null, submit: async () => true, onSubmitted: () => undefined,
        offlineEnabled: () => true, providerContextForTarget: () => 'account-a' });
}

const REVIEWED_CARD = { vid: 1, sid: 0, spelling: '読む', reading: 'よむ' } as JPDBCard;

function claim(queue: Awaited<ReturnType<typeof studyTab>>) {
    return queue.claimLiveReview(REVIEWED_CARD, ['jpdb-api'], () => 'account-a');
}

/** The save, counted from when it started waiting, must finish within the short lease. */
async function expectSavedWithinShortLease(save: Promise<unknown>, startedAt: number): Promise<void> {
    let savedAt = Number.NaN;
    void save.then(() => { savedAt = Date.now(); }, () => undefined);
    await vi.advanceTimersByTimeAsync(STORAGE_WORK_LEASE_MS);
    expect(savedAt - startedAt).toBeLessThanOrEqual(STORAGE_WORK_LEASE_MS);
    await save;
}

/** The words a fresh read of the deck finds. */
async function storedWords(tab: Tab): Promise<string[]> {
    return Object.values((await new tab.store.LocalYomuSrsStore().read()).cards).map(card => card.expression);
}

/** Every userscript storage call answers `latencyMs` late, as slow extension messaging or a busy page makes it. */
function slowStorage(latencyMs: number | ((name: string) => number)): void {
    const latency = typeof latencyMs === 'number' ? () => latencyMs : latencyMs;
    for (const name of ['GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_listValues']) {
        const call = (globalThis as Record<string, unknown>)[name] as (...args: unknown[]) => unknown;
        vi.stubGlobal(name, (...args: unknown[]) => new Promise(answer => setTimeout(() => answer(call(...args)), latency(name))));
    }
}

function addWord(tab: Tab, expression: string, reading: string): Promise<string> {
    return new tab.deck.LocalYomuSrsRepository(() => NOW).mine({ expression, reading, meaning: 'gloss' })
        .then(() => 'saved', (error: unknown) => String(error));
}

function useFakeClock(): void {
    beforeEach(() => { vi.useFakeTimers({ now: NOW }); });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });
}

describe('a save after another tab died mid-save', () => {
    useFakeClock();

    it('adds the word to the local deck within the short lease and says it is waiting meanwhile', async () => {
        const profile = openProfile(DECK_INDEX_KEY);
        const dying = await openTab();
        await dieMidSave(profile,
            () => new dying.deck.LocalYomuSrsRepository(() => NOW).mine({ expression: '読む', reading: 'よむ', meaning: 'to read' }));

        const tab = await openTab();
        const startedAt = Date.now();
        const save = new tab.deck.LocalYomuSrsRepository(() => NOW).mine({ expression: '本', reading: 'ほん', meaning: 'book' });
        await vi.advanceTimersByTimeAsync(2_000);
        expect(tab.waits).toEqual([true]);
        await expectSavedWithinShortLease(save, startedAt);
        expect(tab.waits).toEqual([true, false]);
        const deck = await new tab.store.LocalYomuSrsStore().read();
        expect(Object.values(deck.cards).map(card => card.expression)).toEqual(['本']);
    });

    // Real storage answers in a millisecond or two: the dead tab's claim
    // stretches by a few dozen ms, and the save's own calls take a few more.
    it('adds the word about one short lease after the tab died when storage answers in 2 ms', async () => {
        const profile = openProfile(DECK_INDEX_KEY);
        slowStorage(2);
        const dying = await openTab();
        await dieMidSave(profile, () => addWord(dying, '読む', 'よむ'), 1);

        const tab = await openTab();
        const diedAt = Date.now();
        let savedAt = Number.NaN;
        const save = addWord(tab, '本', 'ほん').finally(() => { savedAt = Date.now(); });
        await vi.advanceTimersByTimeAsync(2 * STORAGE_WORK_LEASE_MS);
        expect(await save).toBe('saved');
        expect(savedAt - diedAt).toBeLessThanOrEqual(STORAGE_WORK_LEASE_MS + 300);
    });

    it('saves settings within the short lease and says it is waiting meanwhile', async () => {
        const profile = openProfile(SETTINGS_INTENT_KEY);
        const dying = await openTab();
        await dying.settings.saveSettings({ ...DEFAULT_SETTINGS, theme: 'light' }, { explicitUserChoiceKeys: ['theme'] });
        await dieMidSave(profile,
            () => dying.settings.saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] }));

        const tab = await openTab();
        const startedAt = Date.now();
        const save = tab.settings.saveSettings({ ...DEFAULT_SETTINGS, accentColor: '#3366ff' }, { explicitUserChoiceKeys: ['accentColor'] });
        await vi.advanceTimersByTimeAsync(2_000);
        expect(tab.waits).toEqual([true]);
        await expectSavedWithinShortLease(save, startedAt);
        expect(tab.waits).toEqual([true, false]);
        expect(await tab.settings.loadSettings()).toMatchObject({ theme: 'light', accentColor: '#3366ff' });
    });
});

// The other half of a short lease: a tab that stalled mid-save (not dead, only
// suspended) has lost its lease by the time it resumes. Whatever it read before
// it stalled is stale, so none of its writes may land over the save another
// tab made meanwhile.
describe('a tab that resumes after another tab saved in its place', () => {
    useFakeClock();

    it('cannot write its stale deck over the word another tab added, and says the save was interrupted', async () => {
        const profile = openProfile(DECK_INDEX_KEY);
        const stalled = await openTab();
        const tab = await openTab();
        const { stale, resume } = await stallAfterRead(profile, DECK_INDEX_KEY, 'local-yomu-srs-deck',
            () => saveToAcademy(stalled, '読む', 'よむ'));

        const save = new tab.deck.LocalYomuSrsRepository(() => NOW).mine({ expression: '本', reading: 'ほん', meaning: 'book' });
        await vi.advanceTimersByTimeAsync(STORAGE_WORK_LEASE_MS + 500);
        await save;
        resume();
        await vi.advanceTimersByTimeAsync(100);
        const error = await stale.then(() => null, (failure: unknown) => failure);
        // Storage is fine, so the learner is not told to free some.
        expect(learnerText(stalled, error)).toEqual(SAVE_INTERRUPTED);
        expect(await storedWords(tab)).toEqual(['本']);
    });

    // ADR-0019 decision 4: one tab, suspended mid-save, with no other tab involved.
    it('grades a card once when the tab is suspended between its card write and the index commit', async () => {
        const profile = openProfile(DECK_INDEX_KEY);
        const tab = await openTab();
        const repository = new tab.deck.LocalYomuSrsRepository(() => NOW);
        const { card } = await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to read' });
        const reviewable = await repository.startReview(card!.providerCardId);
        const revision = (profile.values.get(DECK_INDEX_KEY) as { revision: number }).revision;

        suspendAfterNextCardWrite();
        const review = repository.review({ card: reviewable, grade: 'okay' });
        await vi.advanceTimersByTimeAsync(500);

        // The grade landed before the lease lapsed: it is reported as saved, so
        // neither the learner nor a queued retry grades the card a second time.
        await expect(review).resolves.toMatchObject({ card: { expression: '読む' } });
        expect(Object.values((await repository.snapshot()).cards)).toMatchObject([{ expression: '読む', reviews: 1 }]);
        expect((profile.values.get(DECK_INDEX_KEY) as { revision: number }).revision).toBeGreaterThan(revision);
    });

    it('leaves the deck as it was when a new word\'s save is interrupted, and says so', async () => {
        const profile = openProfile(DECK_INDEX_KEY);
        const tab = await openTab();
        await saveToAcademy(tab, '本', 'ほん');
        const index = profile.values.get(DECK_INDEX_KEY);

        suspendAfterNextCardWrite();
        const save = saveToAcademy(tab, '読む', 'よむ').then(() => null, (failure: unknown) => failure);
        await vi.advanceTimersByTimeAsync(500);

        expect(learnerText(tab, await save)).toEqual(SAVE_INTERRUPTED);
        expect(profile.values.get(DECK_INDEX_KEY)).toEqual(index);
        expect(await storedWords(tab)).toEqual(['本']);
    });

    it('cannot write its stale settings over the choice another tab saved', async () => {
        const profile = openProfile(SETTINGS_INTENT_KEY);
        const stalled = await openTab();
        await stalled.settings.saveSettings({ ...DEFAULT_SETTINGS, theme: 'light' }, { explicitUserChoiceKeys: ['theme'] });
        const tab = await openTab();
        const { stale, resume } = await stallAfterRead(profile, SETTINGS_INTENT_KEY, 'reader-settings-persistence',
            () => stalled.settings.saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] }));

        const save = tab.settings.saveSettings({ ...DEFAULT_SETTINGS, accentColor: '#3366ff' }, { explicitUserChoiceKeys: ['accentColor'] });
        await vi.advanceTimersByTimeAsync(STORAGE_WORK_LEASE_MS + 500);
        await save;
        resume();
        await vi.advanceTimersByTimeAsync(100);
        await expect(stale).rejects.toThrow();
        expect(await tab.settings.loadSettings()).toMatchObject({ theme: 'light', accentColor: '#3366ff' });
    });

    it('retires its copy of an online review another Study tab claimed meanwhile, instead of sending it again', async () => {
        const profile = openProfile(LIVE_REVIEW_KEY);
        const stalled = await studyTab();
        const other = await studyTab();
        const { stale, resume } = await stallAfterRead(profile, LIVE_REVIEW_KEY, 'newtab-live-review', () => claim(stalled));

        // The stalled tab's claim on the lease has lapsed: the other tab claims the review.
        await vi.advanceTimersByTimeAsync(STORAGE_WORK_LEASE_MS + 500);
        const claimed = claim(other);
        await vi.advanceTimersByTimeAsync(100);
        const otherClaim = await claimed;
        expect(otherClaim).not.toBeNull();

        resume();
        await vi.advanceTimersByTimeAsync(500);
        expect(await stale).toBeNull();
        expect(Object.values(profile.values.get(LIVE_REVIEW_KEY) as Record<string, { id: string }>).map(record => record.id))
            .toEqual([otherClaim!.id]);
    });

    it('keeps the refusal it read for a review another Study tab already sent', async () => {
        const profile = openProfile(LIVE_REVIEW_KEY);
        const sender = await studyTab();
        const sent = claim(sender);
        await vi.advanceTimersByTimeAsync(100);
        await sender.finishLiveReview((await sent)!);
        const stalled = await studyTab();

        // A sent review refuses each other tab once. The refusal this tab read is
        // its answer even though the lease lapsed before it could record it.
        const { stale, resume } = await stallAfterRead(profile, LIVE_REVIEW_KEY, 'newtab-live-review', () => claim(stalled));
        await vi.advanceTimersByTimeAsync(STORAGE_WORK_LEASE_MS + 500);
        resume();
        await vi.advanceTimersByTimeAsync(500);
        expect(await stale).toBeNull();
    });
});

// ADR-0019 decision 7: slow storage only delays a save. 2.0.4's one-minute
// lease saved through 600 ms a call; a five-second claim that each claim write
// fenced with three more reads lapsed mid-save at 250 ms and timed out at 400.
describe('a save while storage answers slowly', () => {
    useFakeClock();

    it.each([250, 400, 600, 800])('adds the word when every storage call takes %i ms', async latencyMs => {
        openProfile(DECK_INDEX_KEY);
        slowStorage(latencyMs);
        const tab = await openTab();
        const save = addWord(tab, '本', 'ほん');
        await vi.advanceTimersByTimeAsync(120_000);
        expect(await save).toBe('saved');
        // Slow storage is not another tab.
        expect(tab.waits).toEqual([]);
    });

    // Safari can wake an extension's background page in the middle of a save:
    // storage that answered in 2 ms takes 800 ms a call from then on. The save
    // takes about 90 ms while storage is prompt.
    it('adds the word when storage turns slow at any point of the save', async () => {
        const failures: string[] = [];
        for (let turnsSlowAt = 0; turnsSlowAt <= 92; turnsSlowAt += 4) {
            openProfile(DECK_INDEX_KEY);
            const startedAt = Date.now();
            slowStorage(() => (Date.now() - startedAt < turnsSlowAt ? 2 : 800));
            const save = addWord(await openTab(), '本', 'ほん');
            await vi.advanceTimersByTimeAsync(120_000);
            const result = await save;
            if (result !== 'saved') failures.push(`${turnsSlowAt} ms: ${result}`);
        }
        expect(failures).toEqual([]);
    }, 60_000);

    // A claim sized from the faster of its write and confirming read stayed at
    // five seconds while reads took 800 ms, and the holder lapsed itself.
    it('adds the word when reads take 800 ms and writes 10 ms', async () => {
        openProfile(DECK_INDEX_KEY);
        slowStorage(name => (name === 'GM_setValue' ? 10 : 800));
        const save = addWord(await openTab(), '本', 'ほん');
        await vi.advanceTimersByTimeAsync(120_000);
        expect(await save).toBe('saved');
    });

    it('adds both words when two tabs save at once and storage calls take 10 or 800 ms at random', async () => {
        const failures: string[] = [];
        for (let seed = 1; seed <= 12; seed++) {
            openProfile(DECK_INDEX_KEY);
            let state = seed;
            slowStorage(() => ((state = (state * 48271) % 2147483647) % 2 ? 800 : 10));
            const saves = Promise.all([addWord(await openTab(), '本', 'ほん'), addWord(await openTab(), '読む', 'よむ')]);
            await vi.advanceTimersByTimeAsync(180_000);
            const results = await saves;
            if (results.some(result => result !== 'saved')) failures.push(`seed ${seed}: ${results.join(' / ')}`);
        }
        expect(failures).toEqual([]);
    }, 60_000);

    it.each([400, 800])('adds both words when two tabs save at once and every storage call takes %i ms', async latencyMs => {
        openProfile(DECK_INDEX_KEY);
        slowStorage(latencyMs);
        const [first, second] = [await openTab(), await openTab()];
        const saves = Promise.all([addWord(first, '本', 'ほん'), addWord(second, '読む', 'よむ')]);
        await vi.advanceTimersByTimeAsync(180_000);
        expect(await saves).toEqual(['saved', 'saved']);
        const words = storedWords(first);
        await vi.advanceTimersByTimeAsync(60_000);
        expect((await words).sort()).toEqual(['本', '読む'].sort());
    });
});
