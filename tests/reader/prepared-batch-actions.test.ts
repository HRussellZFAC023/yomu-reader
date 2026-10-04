import { describe, expect, it, vi } from 'vitest';
import { PreparedBatchActions, commonBatchGrades } from '../../src/reader/cards/prepared-batch-actions';
import { isApiSrsProviderEnabled, type ApiSrsProviderAdapter } from '../../src/reader/cards/srs-providers';
import { BunproApiError } from '../../src/reader/bunpro/bunpro';
import type { JPDBCard } from '../../src/reader/app/types';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { testCardActionController } from './jpdb/fixtures';

function card(vid = 42, overrides: Partial<JPDBCard> = {}): JPDBCard {
    return { vid, sid: 0, rid: 0, spelling: `語${vid}`, reading: 'ご', source: 'jiten', cardState: ['new'],
        meanings: [], partOfSpeech: [], frequencyRank: null, pitchAccent: [], wordWithReading: null, ...overrides };
}
function provider(id: ApiSrsProviderAdapter['id'] = 'jiten'): ApiSrsProviderAdapter {
    return { id, hasApiKey: true, supportsCard: () => true, addToDeck: vi.fn(async () => undefined) } as unknown as ApiSrsProviderAdapter;
}
function fixture(receiptLimit?: number) {
    let settings = { ...DEFAULT_SETTINGS, jitenApiKey: 'private-key', ankiEnabled: false };
    let destination = provider();
    const review = vi.fn(async (): Promise<void> => {});
    const collectAnki = vi.fn(async () => true);
    const collectionDeck = vi.fn(async () => 'private-deck');
    const collectForReview = vi.fn(async (): Promise<void> => {});
    // The popup's destination rule in miniature: the reviewing service while it is on, otherwise Anki.
    const batch = new PreparedBatchActions({ getSettings: () => settings, resolveReviewProvider: () => destination,
        resolveCollectionDestination: () => isApiSrsProviderEnabled(settings, destination.id) ? destination : settings.ankiEnabled ? 'anki' : null,
        review, collectAnki, collectionDeck, collectForReview, findOnGradingService: vi.fn(), notify: vi.fn() }, receiptLimit);
    return { batch, review, collectAnki, collectionDeck, collectForReview,
        get settings() { return settings; }, set settings(value) { settings = value; },
        get destination() { return destination; }, set destination(value) { destination = value; } };
}
function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    return { promise, resolve };
}

describe('prepared batch mutations', () => {
    it('uses actual write-provider resolution rather than the dictionary source', async () => {
        const jitenReview = vi.fn(async () => undefined);
        const jpdbReview = vi.fn(async () => undefined);
        const controller = testCardActionController({ getSettings: () => ({ ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key', jitenApiKey: 'jiten-key', apiGradingProvider: 'jiten', ankiEnabled: false }),
            jiten: { reviewCard: jitenReview } as never, jpdb: { reviewCard: jpdbReview } as never, isJpdbBackedCard: () => true });
        const candidate = card(42, { source: 'jpdb', jitenWordId: 42, jitenReadingIndex: 0 });
        let [plan] = controller.batchMining.prepare([{ card: candidate }]);
        expect(plan!.grades.map(([grade]) => grade)).toEqual(['nothing', 'hard', 'okay', 'easy']);
        await controller.batchMining.execute([plan!.token], 'review', 'hard');
        expect(jitenReview).toHaveBeenCalledWith(candidate, 'hard');
        expect(jpdbReview).not.toHaveBeenCalled();
        candidate.apiGradingProviderOverride = 'jpdb';
        [plan] = controller.batchMining.prepare([{ card: candidate }]);
        expect(plan!.grades.map(([grade]) => grade)).toEqual(['nothing', 'something', 'hard', 'okay', 'easy']);
        await controller.batchMining.execute([plan!.token], 'review', 'something');
        expect(jpdbReview).toHaveBeenCalledWith(candidate, 'something');
    });

    it.each(['regular', 'fsrs'] as const)('keeps Bunpro %s native scale with two-button preference', mode => {
        const f = fixture();
        f.destination = provider('bunpro');
        f.settings = { ...f.settings, twoButtonReviews: true };
        const plan = f.batch.prepare([{ card: card(42, { bunproReviewInputMode: mode }) }])[0]!;
        expect(plan.grades).toEqual(mode === 'regular' ? [['fail', 'Hard'], ['pass', 'Good']]
            : [['nothing', 'Again'], ['hard', 'Hard'], ['okay', 'Good'], ['easy', 'Easy']]);
    });

    it.each(['regular', 'fsrs'] as const)('requires a real Bunpro session and submits %s through the existing adapter', async mode => {
        const review = vi.fn(async () => ({}));
        const controller = testCardActionController({ getSettings: () => ({ ...DEFAULT_SETTINGS,
            apiKey: '', jitenApiKey: '', bunproFrontendApiToken: 'token', bunproMiningEnabled: true, twoButtonReviews: true,
            ankiEnabled: false, yomuLocalSrsEnabled: false }),
            srsAdapters: { bunpro: { hasCredential: () => true, review } as never }, isJpdbBackedCard: () => false,
        });
        const item = card(42, { source: 'bunpro', bunproReviewId: '123', bunproReviewInputMode: mode, bunproReviewEndpoint: 'review' });
        expect(controller.batchMining.prepare([{ card: item }])[0]!.grades).toEqual([]);
        item.bunproReviewSessionId = '456';
        const [plan] = controller.batchMining.prepare([{ card: item }]);
        const grade = mode === 'regular' ? 'pass' : 'hard';
        expect((await controller.batchMining.execute([plan!.token], 'review', grade)).items[0]!.state).toBe('completed');
        expect(review).toHaveBeenCalledWith(expect.objectContaining({ grade, card: expect.objectContaining({ reviewSession: { id: '456', inputMode: mode, endpoint: 'review' } }) }));
    });

    it('does not display review grades for a disabled resolved provider or blocked card', () => {
        const f = fixture();
        f.settings = { ...f.settings, jpdbMiningEnabled: false };
        expect(f.batch.prepare([{ card: card() }])[0]!.grades).toEqual([]);
        f.settings = { ...f.settings, jpdbMiningEnabled: true };
        expect(f.batch.prepare([{ card: card(42, { cardState: ['blacklisted'] }) }])[0]!.grades).toEqual([]);
    });

    it('compares the complete ordered grades and labels for bulk compatibility', () => {
        const f = fixture();
        const jiten = f.batch.prepare([{ card: card() }])[0]!;
        f.destination = provider('jpdb');
        const jpdb = f.batch.prepare([{ card: card() }])[0]!;
        f.destination = provider('bunpro');
        const fsrs = f.batch.prepare([{ card: card(42, { bunproReviewInputMode: 'fsrs' }) }])[0]!;
        expect(commonBatchGrades([jiten, jpdb])).toEqual([]);
        expect(commonBatchGrades([jiten, fsrs])).toEqual(jiten.grades);
        expect(commonBatchGrades([jiten, { ...jiten, grades: [] }])).toEqual([]);
        expect(commonBatchGrades([{ ...jiten, grades: [['fail', 'Hard'], ['pass', 'Good']] },
            { ...jiten, grades: [['fail', 'Fail'], ['pass', 'Pass']] }])).toEqual([]);
    });

    it('rejects old, forged, changed-card and changed-account plans before any write', async () => {
        const f = fixture();
        const candidate = card();
        let [plan] = f.batch.prepare([{ card: candidate }]);
        f.batch.prepare([{ card: candidate }]);
        expect((await f.batch.execute([plan!.token], 'review', 'hard')).rejected).toBe('stale');
        expect((await f.batch.execute([Symbol()], 'collect')).rejected).toBe('stale');
        [plan] = f.batch.prepare([{ card: candidate }]);
        candidate.jitenWordId = 77;
        expect((await f.batch.execute([plan!.token], 'review', 'hard')).rejected).toBe('stale');
        [plan] = f.batch.prepare([{ card: candidate }]);
        f.settings = { ...f.settings, jitenApiKey: 'other-account' };
        expect((await f.batch.execute([plan!.token], 'review', 'hard')).rejected).toBe('stale');
        expect(f.review).not.toHaveBeenCalled();
        expect(f.destination.addToDeck).not.toHaveBeenCalled();
    });

    it('locks collection and review below the UI while a provider request is pending', async () => {
        const f = fixture();
        const pending = deferred();
        f.review.mockImplementationOnce(() => pending.promise);
        const [plan] = f.batch.prepare([{ card: card() }]);
        const first = f.batch.execute([plan!.token], 'review', 'hard');
        expect(f.batch.beginGeneration()).toBe(false);
        expect((await f.batch.execute([plan!.token], 'review', 'easy')).rejected).toBe('busy');
        expect((await f.batch.execute([plan!.token], 'collect')).rejected).toBe('busy');
        expect(f.batch.prepare([{ card: card(77) }])).toEqual([]);
        pending.resolve();
        expect((await first).items[0]!.state).toBe('completed');
        expect(f.review).toHaveBeenCalledTimes(1);
        expect(f.destination.addToDeck).not.toHaveBeenCalled();
    });

    it('retains the completed prefix and unlocks retries for unfinished items only', async () => {
        const f = fixture();
        f.review.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('rejected'));
        const candidates = [42, 43, 44].map(vid => ({ card: card(vid) }));
        const plans = f.batch.prepare(candidates);
        const result = await f.batch.execute(plans.map(plan => plan.token), 'review', 'hard');
        expect(result.items.map(item => item.state)).toEqual(['completed', 'failed', 'unattempted']);
        expect(result.items[0]!.completedStages).toEqual(['review']);
        const retry = f.batch.prepare(candidates.slice(1));
        expect((await f.batch.execute(retry.map(plan => plan.token), 'review', 'hard')).items.map(item => item.state)).toEqual(['completed', 'completed']);
        expect(f.review.mock.calls).toHaveLength(4);
        expect(f.batch.prepare(candidates)[0]!.grades).toEqual([]);
    });

    it('retries only Anki after API collection succeeded, without recording a review', async () => {
        const f = fixture();
        f.settings = { ...f.settings, ankiEnabled: true, ankiMineWithJpdb: true };
        f.collectAnki.mockRejectedValueOnce(new Error('Anki unavailable'));
        const candidate = { card: card() };
        const [plan] = f.batch.prepare([candidate]);
        expect((await f.batch.execute([plan!.token], 'collect')).items[0]).toMatchObject({ state: 'failed', completedStages: ['api-collection'] });
        // Fixing the Anki endpoint and switching UI language must not replay the successful API stage.
        f.settings = { ...f.settings, ankiConnectUrl: 'http://working-anki', interfaceLanguage: 'ja' };
        const [retry] = f.batch.prepare([candidate]);
        expect((await f.batch.execute([retry!.token], 'collect')).items[0]!.state).toBe('completed');
        expect(f.destination.addToDeck).toHaveBeenCalledTimes(1);
        expect(f.collectAnki).toHaveBeenCalledTimes(2);
        expect(f.review).not.toHaveBeenCalled();
    });

    it('rechecks account context after asynchronous deck resolution and between stages', async () => {
        const f = fixture();
        f.settings = { ...f.settings, ankiEnabled: true, ankiMineWithJpdb: true };
        f.collectionDeck.mockImplementationOnce(async () => { f.settings = { ...f.settings, jitenApiKey: 'changed' }; return 'deck'; });
        let [plan] = f.batch.prepare([{ card: card() }]);
        expect((await f.batch.execute([plan!.token], 'collect')).items[0]!.state).toBe('stale');
        expect(f.destination.addToDeck).not.toHaveBeenCalled();
        vi.mocked(f.destination.addToDeck).mockImplementationOnce(async () => { f.settings = { ...f.settings, ankiConnectUrl: 'http://other-account' }; });
        [plan] = f.batch.prepare([{ card: card() }]);
        expect((await f.batch.execute([plan!.token], 'collect')).items[0]).toMatchObject({ state: 'stale', completedStages: ['api-collection'] });
        expect(f.collectAnki).not.toHaveBeenCalled();
    });

    it('does not repeat JPDB add-before-review after a context change at that await boundary', async () => {
        const f = fixture();
        f.destination = provider('jpdb');
        f.collectForReview.mockImplementationOnce(async () => { f.settings = { ...f.settings, interfaceLanguage: 'ja' }; });
        const item = card(42, { source: 'jpdb', cardState: ['not-in-deck'] });
        let [plan] = f.batch.prepare([{ card: item }]);
        expect((await f.batch.execute([plan!.token], 'review', 'hard')).items[0]).toMatchObject({ state: 'stale', completedStages: ['review-collection'] });
        expect(f.review).not.toHaveBeenCalled();
        f.batch.beginGeneration();
        [plan] = f.batch.prepare([{ card: item }]);
        expect((await f.batch.execute([plan!.token], 'review', 'hard')).items[0]!.state).toBe('completed');
        expect(f.collectForReview).toHaveBeenCalledTimes(1);
    });

    it('checks the plan after Anki duplicate lookup before note creation', async () => {
        let settings = { ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: '', ankiEnabled: true, yomuLocalSrsEnabled: false };
        const addCard = vi.fn();
        const controller = testCardActionController({ getSettings: () => settings, isJpdbBackedCard: () => false,
            anki: { findExistingCards: async () => { settings = { ...settings, ankiConnectUrl: 'http://other' }; return { primary: null }; }, addCard } as never,
        });
        const [plan] = controller.batchMining.prepare([{ card: card() }]);
        expect((await controller.batchMining.execute([plan!.token], 'collect')).items[0]!.state).toBe('stale');
        expect(addCard).not.toHaveBeenCalled();
    });

    it('reports a confirmed review before a context switch as completed and stops the suffix', async () => {
        let settings = { ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: 'key', ankiEnabled: false };
        const reviewCard = vi.fn(async () => { settings = { ...settings, interfaceLanguage: 'ja' }; });
        const controller = testCardActionController({ getSettings: () => settings, jiten: { reviewCard } as never });
        const candidates = [{ card: card(42) }, { card: card(43) }];
        const plans = controller.batchMining.prepare(candidates);
        const result = await controller.batchMining.execute(plans.map(plan => plan.token), 'review', 'hard');
        expect(result.items.map(item => item.state)).toEqual(['completed', 'unattempted']);
        expect(reviewCard).toHaveBeenCalledTimes(1);
        expect(controller.batchMining.prepare(candidates)[0]!.grades).toEqual([]);
    });

    it('does not blindly retry an uncertain Bunpro session, even after preparing again', async () => {
        const f = fixture();
        f.destination = provider('bunpro');
        f.review.mockRejectedValueOnce(new Error('response lost'));
        const candidate = card(42, { bunproReviewId: '99', bunproReviewSessionId: '1', bunproReviewInputMode: 'fsrs' });
        const [plan] = f.batch.prepare([{ card: candidate }]);
        expect((await f.batch.execute([plan!.token], 'review', 'hard')).items[0]!.state).toBe('uncertain');
        f.settings = { ...f.settings, interfaceLanguage: 'ja' };
        expect(f.batch.beginGeneration()).toBe(true);
        const [again] = f.batch.prepare([{ card: candidate }]);
        expect(again).toMatchObject({ uncertain: true, grades: [] });
        await f.batch.execute([again!.token], 'review', 'hard');
        expect(f.review).toHaveBeenCalledTimes(1);
        candidate.bunproReviewSessionId = '2';
        const [fresh] = f.batch.prepare([{ card: candidate }]);
        expect((await f.batch.execute([fresh!.token], 'review', 'hard')).items[0]!.state).toBe('completed');
    });

    it('retires completed review receipts only at an explicit new generation and invalidates old tokens', async () => {
        const f = fixture();
        const [first] = f.batch.prepare([{ card: card() }]);
        await f.batch.execute([first!.token], 'review', 'hard');
        const [rerender] = f.batch.prepare([{ card: card() }]);
        expect(rerender!.grades).toEqual([]);
        expect(f.batch.beginGeneration()).toBe(true);
        expect((await f.batch.execute([rerender!.token], 'review', 'hard')).rejected).toBe('stale');
        const [nextDay] = f.batch.prepare([{ card: card(42, { lastReviewAt: 100, dueAt: 86400100 }) }]);
        expect(nextDay!.grades).toHaveLength(4);
        await f.batch.execute([nextDay!.token], 'review', 'hard');
        expect(f.review).toHaveBeenCalledTimes(2);
    });

    it('protects a completed prefix across generations until its unfinished suffix succeeds', async () => {
        const f = fixture();
        f.review.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('rejected'));
        const candidates = [42, 43].map(vid => ({ card: card(vid) }));
        const plans = f.batch.prepare(candidates);
        await f.batch.execute(plans.map(plan => plan.token), 'review', 'hard');
        f.batch.beginGeneration();
        const retry = f.batch.prepare(candidates);
        expect(retry[0]!.grades).toEqual([]);
        expect(retry[1]!.grades).toHaveLength(4);
        await f.batch.execute([retry[1]!.token], 'review', 'hard');
        expect(f.review).toHaveBeenCalledTimes(3);
        f.batch.beginGeneration();
        expect(f.batch.prepare(candidates).every(plan => plan.grades.length === 4)).toBe(true);
    });

    it('preserves a partial API save across generations and corrected Anki settings without exhausting capacity', async () => {
        const f = fixture(2);
        f.settings = { ...f.settings, ankiEnabled: true, ankiMineWithJpdb: true };
        f.collectAnki.mockRejectedValueOnce(new Error('unavailable'));
        const item = { card: card() };
        const [plan] = f.batch.prepare([item]);
        await f.batch.execute([plan!.token], 'collect');
        f.batch.beginGeneration();
        const [unrelated] = f.batch.prepare([{ card: card(43) }]);
        expect((await f.batch.execute([unrelated!.token], 'review', 'hard')).rejected).toBe('capacity');
        expect(f.review).not.toHaveBeenCalled();
        f.settings = { ...f.settings, ankiConnectUrl: 'http://corrected', interfaceLanguage: 'ja' };
        const [retry] = f.batch.prepare([item]);
        expect((await f.batch.execute([retry!.token], 'collect')).items[0]!.state).toBe('completed');
        expect(f.destination.addToDeck).toHaveBeenCalledTimes(1);
        expect(f.collectAnki).toHaveBeenCalledTimes(2);
        f.batch.beginGeneration();
        const [fresh] = f.batch.prepare([{ card: card(43) }]);
        expect((await f.batch.execute([fresh!.token], 'review', 'hard')).items[0]!.state).toBe('completed');
    });

    it('bounds retained completed state across a long sequence of generations', async () => {
        const f = fixture(2);
        for (let vid = 0; vid < 50; vid += 1) {
            f.batch.beginGeneration();
            const [plan] = f.batch.prepare([{ card: card(vid) }]);
            expect((await f.batch.execute([plan!.token], 'review', 'hard')).items[0]!.state).toBe('completed');
            expect((f.batch as unknown as { receipts: { size: number } }).receipts.size).toBeLessThanOrEqual(2);
        }
        f.batch.beginGeneration();
        expect((f.batch as unknown as { receipts: { size: number } }).receipts.size).toBe(0);
    });

    it('rechecks Anki on a fresh scan after an Anki-only retry finishes a combined operation', async () => {
        const f = fixture(2);
        f.settings = { ...f.settings, ankiEnabled: true, ankiMineWithJpdb: true };
        f.collectAnki.mockRejectedValueOnce(new Error('Anki unavailable'));
        const item = { card: card() };
        let [plan] = f.batch.prepare([item]);
        expect((await f.batch.execute([plan!.token], 'collect')).items[0]!.state).toBe('failed');
        f.settings = { ...f.settings, jpdbMiningEnabled: false, bunproMiningEnabled: false, yomuLocalSrsEnabled: false };
        [plan] = f.batch.prepare([item]);
        expect((await f.batch.execute([plan!.token], 'collect')).items[0]!.state).toBe('completed');
        expect(f.destination.addToDeck).toHaveBeenCalledTimes(1);
        f.batch.beginGeneration();
        [plan] = f.batch.prepare([item]);
        expect(plan!.canCollect).toBe(true);
        expect((await f.batch.execute([plan!.token], 'collect')).items[0]!.state).toBe('completed');
        expect(f.collectAnki).toHaveBeenCalledTimes(3);
    });

    it('does not evict an uncertain Bunpro obligation when capacity is reached', async () => {
        const f = fixture(2);
        f.destination = provider('bunpro');
        f.review.mockRejectedValueOnce(new Error('response lost'));
        const item = card(42, { bunproReviewId: '99', bunproReviewSessionId: '1', bunproReviewInputMode: 'fsrs' });
        let [plan] = f.batch.prepare([{ card: item }]);
        await f.batch.execute([plan!.token], 'review', 'hard');
        f.batch.beginGeneration();
        [plan] = f.batch.prepare([{ card: { ...item, bunproReviewId: '100' } }]);
        expect((await f.batch.execute([plan!.token], 'review', 'hard')).rejected).toBe('capacity');
        f.batch.beginGeneration();
        expect(f.batch.prepare([{ card: item }])[0]).toMatchObject({ uncertain: true, grades: [] });
        expect(f.review).toHaveBeenCalledTimes(1);
    });
});

// ADR-0016: "Add selected" saves each word where the popup's "Add to deck +"
// would (collectionDestinationsForCard), once and without a schedule. JPDB
// stays connected for lookups; JPDB mining is off.
describe('batch collection follows the popup destination', () => {
    const JPDB_LOOKUPS_ONLY = { ...DEFAULT_SETTINGS, apiKey: 'jpdb-lookup-key', jitenApiKey: '', jpdbMiningEnabled: false, ankiEnabled: false, enableReviews: true };
    const words = () => [81, 82, 83].map(vid => ({ card: card(vid, { source: 'jpdb', cardState: ['not-in-deck'] }), sentence: `語${vid}を読む。` }));

    it.each([
        ['Bunpro', 'bunpro', { bunproMiningEnabled: true, bunproFrontendApiToken: 'bunpro-token', yomuLocalSrsEnabled: false }],
        ['the Yomu deck', 'yomu-local', { bunproMiningEnabled: false, yomuLocalSrsEnabled: true }],
    ] as const)('saves JPDB-parsed words to %s, once each, without grading them', async (_name, id, learner) => {
        const mine = vi.fn(async (_request: { expression: string }) => ({}));
        const jpdbAdd = vi.fn();
        const review = vi.fn();
        const controller = testCardActionController({ getSettings: () => ({ ...JPDB_LOOKUPS_ONLY, ...learner }),
            jpdb: { addToDeck: jpdbAdd, reviewCard: review } as never,
            srsAdapters: { [id]: { hasCredential: () => true, mine, review } } as never });
        const plans = controller.batchMining.prepare(words());
        expect(plans.map(plan => [plan.canCollect, plan.noDestination])).toEqual([[true, false], [true, false], [true, false]]);

        const result = await controller.batchMining.execute(plans.map(plan => plan.token), 'collect');

        expect(result.items.map(item => item.state)).toEqual(['completed', 'completed', 'completed']);
        expect(mine.mock.calls.map(([request]) => request.expression)).toEqual(['語81', '語82', '語83']);
        expect(jpdbAdd).not.toHaveBeenCalled();
        expect(review).not.toHaveBeenCalled();
    });

    it('skips a word no enabled destination can take and still saves the rest', async () => {
        const addToStudyDeck = vi.fn(async (_deck: string, _word: JPDBCard) => undefined);
        const controller = testCardActionController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: 'jiten-key', ankiEnabled: false, yomuLocalSrsEnabled: false }),
            jiten: { addToStudyDeck, listReaderStudyDecks: async () => [{ userStudyDeckId: 12, name: 'Reading', deckType: 2 }] } as never,
            isJpdbBackedCard: () => false,
        });
        // Only Jiten collects here, and it needs its own identity for a word.
        const candidates = [card(91), card(92, { source: 'local' }), card(93)].map(item => ({ card: item }));
        const plans = controller.batchMining.prepare(candidates);
        expect(plans.map(plan => plan.noDestination)).toEqual([false, true, false]);

        const result = await controller.batchMining.execute(plans.map(plan => plan.token), 'collect');

        expect(result.items.map(item => item.state)).toEqual(['completed', 'no-destination', 'completed']);
        expect(addToStudyDeck.mock.calls.map(([, word]) => word.vid)).toEqual([91, 93]);
        expect((await controller.batchMining.execute([plans[1]!.token], 'collect')).rejected).toBe('unavailable');
    });

    // Jiten takes a word only into a word list; with none, the word goes to the
    // next destination before anything is written to Jiten.
    it('does not hold the batch open for a word moved off a service with no collection for it', async () => {
        const settings = { ...DEFAULT_SETTINGS, jitenApiKey: 'private-key', ankiEnabled: true };
        const jiten = provider('jiten');
        const collectAnki = vi.fn(async () => true);
        const batch = new PreparedBatchActions({ getSettings: () => settings, resolveReviewProvider: () => jiten,
            resolveCollectionDestination: (_card, _settings, without) => without === 'jiten' ? 'anki' : jiten,
            review: vi.fn(), collectAnki, collectionDeck: vi.fn(async () => ''), collectForReview: vi.fn(), findOnGradingService: vi.fn(), notify: vi.fn() }, 2);

        for (let vid = 0; vid < 5; vid += 1) {
            batch.beginGeneration();
            const [plan] = batch.prepare([{ card: card(vid) }]);
            const result = await batch.execute([plan!.token], 'collect');
            expect(result.rejected).toBeUndefined();
            expect(result.items.map(item => item.state)).toEqual(['completed']);
        }
        expect(jiten.addToDeck).not.toHaveBeenCalled();
        expect(collectAnki).toHaveBeenCalledTimes(5);
    });

    it('skips a word Bunpro has no entry for without holding the batch open', async () => {
        const mine = vi.fn(async (request: { expression: string }) => {
            if (request.expression === '語82') throw new BunproApiError('No Bunpro item found.', undefined, 'bunproNoMatchingWord');
            return {};
        });
        const controller = testCardActionController({
            getSettings: () => ({ ...JPDB_LOOKUPS_ONLY, bunproMiningEnabled: true, bunproFrontendApiToken: 'bunpro-token', yomuLocalSrsEnabled: false }),
            srsAdapters: { bunpro: { hasCredential: () => true, mine } as never },
        });
        const candidates = words();
        const plans = controller.batchMining.prepare(candidates);

        const result = await controller.batchMining.execute(plans.map(plan => plan.token), 'collect');

        expect(result.items.map(item => item.state)).toEqual(['completed', 'no-destination', 'completed']);
        expect(mine).toHaveBeenCalledTimes(3);
        // Nothing was saved for the word Bunpro lacks, so a fresh scan starts clean.
        expect(controller.batchMining.beginGeneration()).toBe(true);
        expect(controller.batchMining.prepare(candidates).map(plan => plan.canCollect)).toEqual([true, true, true]);
    });
});
