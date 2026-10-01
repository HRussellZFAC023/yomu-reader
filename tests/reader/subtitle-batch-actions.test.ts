import { afterEach, describe, expect, it, vi } from 'vitest';
import { SubtitlePlayerController } from '../../src/reader/subtitles/controller';
import { testCardActionController } from './jpdb/fixtures';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import type { SubtitleBatchMiningCandidate } from '../../src/reader/subtitles/subtitle-batch-mining';
import { readSubtitleCommandCapability } from '../../src/reader/dom/private-command-capabilities';
import { allowSyntheticReaderInteractionsForTests, trustedReaderEventHandler } from '../../src/reader/ui/trusted-interaction';
import { waitForExpect } from './test-utils';
import { createYomuLocalSrsAdapter, LocalYomuSrsRepository } from '../../src/reader/srs/local-yomu';

const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); document.body.replaceChildren(); vi.unstubAllGlobals(); });
function candidate(vid: number, source: JPDBCard['source'] = 'jiten'): SubtitleBatchMiningCandidate {
    const card: JPDBCard = { vid, sid: 0, rid: 0, spelling: `語${vid}`, reading: 'ご', source,
        cardState: ['new'], meanings: [], partOfSpeech: [], pitchAccent: [], frequencyRank: null, wordWithReading: null };
    return { key: `private-key-${vid}`, card, sentence: '単語を読む。', rowIndex: vid, cueIndex: vid,
        start: vid, end: vid + 1, occurrences: 1, sentenceCardCount: 3, unknownCardCount: 1, iPlusOne: true, selected: true, state: 'new' };
}
// With only Jiten connected, a JPDB-parsed word is reviewed in the Academy
// deck: a genuinely different scale from the Jiten word beside it.
function academyDeck(): Parameters<typeof testCardActionController>[0] {
    return { srsAdapters: { 'yomu-local': createYomuLocalSrsAdapter(new LocalYomuSrsRepository()) } };
}
function setup(candidates = [candidate(42)], overrides: Partial<ReaderSettings> = {}, controllerOverrides: Parameters<typeof testCardActionController>[0] = {}) {
    allowSyntheticReaderInteractionsForTests(true);
    vi.stubGlobal('location', new URL('https://www.youtube.com/watch?v=fixture'));
    const settings = { ...DEFAULT_SETTINGS, apiKey: 'jpdb-private-key', jitenApiKey: 'jiten-private-key', ankiEnabled: false, localDictionariesEnabled: false, audioEnabled: false, ...overrides };
    const jitenReview = vi.fn(async (_card: JPDBCard, _grade: string): Promise<void> => {});
    const jpdbReview = vi.fn(async (_card: JPDBCard, _grade: string): Promise<void> => {});
    const add = vi.fn(async (..._args: unknown[]): Promise<void> => {});
    const jitenParse = vi.fn(async (terms: string[]): Promise<JPDBToken[][]> => terms.map(() => []));
    const jpdbParse = vi.fn(async (terms: string[]): Promise<JPDBToken[][]> => terms.map(() => []));
    const ankiAdd = vi.fn(async (_card: JPDBCard, _sentence?: string, _options?: unknown) => 1001);
    const ankiFind = vi.fn(async (_card: JPDBCard): Promise<{ primary: object | null; notes: unknown[]; state: string }> => ({ primary: null, notes: [], state: 'not-found' }));
    const toast = vi.fn();
    const actions = testCardActionController({ getSettings: () => settings,
        jiten: { reviewCard: jitenReview, addToStudyDeck: add, listStudyDecks: async () => [{ id: 12, name: 'Private deck' }], parse: jitenParse } as never,
        jpdb: { reviewCard: jpdbReview, addToDeck: add, parse: jpdbParse } as never,
        anki: { findExistingCards: ankiFind, addCard: ankiAdd } as never,
        resolveMiningContext: async (card, sentence) => ({ term: card.spelling, sentence: sentence ?? '', sourceKind: 'page', sourceTitle: 'Fixture', sourceUrl: 'https://example.test', updatedAt: 0 }),
        isJpdbBackedCard: card => card.source === 'jpdb',
        ...controllerOverrides,
    });
    const controller = new SubtitlePlayerController({ getSettings: () => settings, parseJapanese: async () => [], onSettingsChange: () => {}, toast,
        prepareBatchMiningCandidates: candidates => actions.batchMining.prepare(candidates),
        beginBatchMiningGeneration: () => actions.batchMining.beginGeneration(),
        executeBatchMiningCandidates: (tokens, kind, grade) => actions.batchMining.execute(tokens, kind, grade),
    });
    const panel = document.createElement('div');
    panel.className = 'jpdb-subtitle-panel';
    document.body.append(panel);
    const selected = new Set(candidates.map(candidate => candidate.key));
    const internals = controller as unknown as {
        renderBatchMiningPanel(): void;
        handleClick(event: MouseEvent): void;
        batchMiningCandidates: SubtitleBatchMiningCandidate[];
    };
    Object.assign(controller, { transcriptPanel: panel, panelMode: 'mine', batchMiningStatus: 'ready', batchMiningCandidates: candidates, batchMiningSelectedKeys: selected });
    panel.addEventListener('click', trustedReaderEventHandler((event: MouseEvent) => internals.handleClick(event)));
    internals.renderBatchMiningPanel();
    cleanups.push(() => controller.destroy());
    return { controller, internals, panel, settings, actions, selected, jitenReview, jpdbReview, jitenParse, jpdbParse, add, ankiAdd, ankiFind, toast };
}

describe('subtitle prepared batch actions through the controller', () => {
    it('renders native per-candidate scales and blocks incompatible bulk without revealing account data', async () => {
        const f = setup([candidate(42), candidate(43, 'jpdb')], { apiKey: '' }, academyDeck());
        const rows = f.panel.querySelectorAll('[role="listitem"]');
        expect([...rows[0]!.querySelectorAll('[data-action="bm-grade"]')].map(button => button.textContent)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
        expect([...rows[1]!.querySelectorAll('[data-action="bm-grade"]')].map(button => button.textContent)).toEqual(['Nothing', 'Something', 'Hard', 'Okay', 'Easy']);
        expect(f.panel.querySelector('[data-action="bm-grade-selected"]')).toBeNull();
        expect(f.panel.querySelector('[data-batch-scale-help]')?.textContent).toContain('different review scales');
        expect(f.panel.innerHTML).not.toMatch(/private-key|private-deck|Private deck|jiten-private-key|jpdb-private-key|data-batch-candidate-key|data-review-target|batchGroup|batchPlans/);
        const button = rows[0]!.querySelector<HTMLButtonElement>('[data-grade="hard"]')!;
        button.dataset.grade = 'easy';
        button.click();
        await waitForExpect(() => expect(f.jitenReview).toHaveBeenCalledWith(expect.objectContaining({ vid: 42 }), 'hard'));
        expect(f.jpdbReview).not.toHaveBeenCalled();
    });

    it('preserves the completed prefix and selects only unfinished words after failure, then retries', async () => {
        const f = setup([candidate(42), candidate(43), candidate(44)]);
        f.jitenReview.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Rejected'));
        f.panel.querySelector<HTMLButtonElement>('[data-action="bm-grade-selected"][data-grade="hard"]')!.click();
        await waitForExpect(() => expect([...f.selected]).toEqual(['private-key-43', 'private-key-44']));
        await waitForExpect(() => expect(f.toast).toHaveBeenCalledWith('Completed 1 of 3 words. Unfinished words remain selected.'));
        f.panel.querySelector<HTMLButtonElement>('[data-action="bm-grade-selected"][data-grade="hard"]')!.click();
        await waitForExpect(() => expect(f.selected.size).toBe(0));
        expect(f.jitenReview.mock.calls.map(([card]) => card.vid)).toEqual([42, 43, 43, 44]);
    });

    it('blocks double pending row/bulk/add clicks and keeps collection separate', async () => {
        const f = setup();
        let resolve!: () => void;
        f.jitenReview.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
        f.panel.querySelector<HTMLButtonElement>('[data-action="bm-grade"][data-grade="hard"]')!.click();
        expect(f.panel.querySelector<HTMLButtonElement>('[data-action="bm-add"]')?.disabled).toBe(true);
        f.panel.querySelector<HTMLButtonElement>('[data-action="bm-grade-selected"][data-grade="easy"]')!.click();
        f.panel.querySelector<HTMLButtonElement>('[data-action="bm-add"]')!.click();
        expect(f.jitenReview).toHaveBeenCalledTimes(1);
        expect(f.add).not.toHaveBeenCalled();
        resolve();
        await waitForExpect(() => expect(f.selected.size).toBe(0));
        const fresh = setup([candidate(77)], { enableReviews: false });
        const collect = fresh.panel.querySelector<HTMLButtonElement>('[data-action="bm-add"]')!;
        collect.dataset.action = 'bm-grade';
        collect.dataset.grade = 'easy';
        collect.click();
        await waitForExpect(() => expect(fresh.add).toHaveBeenCalledTimes(1));
        expect(fresh.jitenReview).not.toHaveBeenCalled();
    });

    it('retains an API-save/Anki-failure row and retries only Anki after configuration is corrected', async () => {
        const f = setup([candidate(42)], { ankiEnabled: true, ankiMineWithJpdb: true });
        f.ankiAdd.mockRejectedValueOnce(new Error('Anki unavailable'));
        f.panel.querySelector<HTMLButtonElement>('[data-action="bm-add"]')!.click();
        await waitForExpect(() => expect(f.toast).toHaveBeenCalledWith('Completed 0 of 1 words. Unfinished words remain selected.'));
        expect(f.selected.size).toBe(1);
        expect(f.add).toHaveBeenCalledTimes(1);
        f.settings.ankiConnectUrl = 'http://corrected-anki';
        f.internals.renderBatchMiningPanel();
        f.panel.querySelector<HTMLButtonElement>('[data-action="bm-add"]')!.click();
        await waitForExpect(() => expect(f.selected.size).toBe(0));
        expect(f.add).toHaveBeenCalledTimes(1);
        expect(f.ankiAdd).toHaveBeenCalledTimes(2);
        expect(f.jitenReview).not.toHaveBeenCalled();
    });

    it('rejects cloned and stale rendered commands, including a settings/account switch', async () => {
        const f = setup();
        const button = f.panel.querySelector<HTMLButtonElement>('[data-action="bm-grade"][data-grade="hard"]')!;
        const clone = button.cloneNode(true) as HTMLButtonElement;
        f.panel.append(clone);
        clone.click();
        expect(readSubtitleCommandCapability(clone)).toBeUndefined();
        f.internals.renderBatchMiningPanel();
        f.panel.append(button);
        button.click();
        expect(f.jitenReview).not.toHaveBeenCalled();
        f.settings.jitenApiKey = 'new-private-account';
        f.panel.querySelector<HTMLButtonElement>('[data-action="bm-grade-selected"][data-grade="hard"]')!.click();
        await waitForExpect(() => expect(f.toast).toHaveBeenCalled());
        expect(f.jitenReview).not.toHaveBeenCalled();
        expect(f.selected.size).toBe(1);
    });

    it('matches Japanese incompatible and collection/review explanatory copy', () => {
        const f = setup([candidate(42), candidate(43, 'jpdb')], { interfaceLanguage: 'ja', apiKey: '' }, academyDeck());
        expect(f.panel.textContent).toContain('選択した単語は評価段階が異なるか、一部の単語を復習できません。復習できる単語を個別に評価してください。');
        expect(f.panel.textContent).toContain('「選択を追加」は単語を保存し、評価ボタンは復習結果を記録します。');
        expect(f.panel.textContent).not.toContain('未翻訳');
    });

    it('grades every word into the chosen grading service when both are connected, resolving the rest first', async () => {
        const f = setup([candidate(42), candidate(43, 'jpdb')]);
        const resolved = { ...candidate(4300).card, spelling: '語43' };
        f.jitenParse.mockResolvedValueOnce([[{ card: resolved, start: 0, end: 2, length: 2, rubies: [], pitchClass: '', sentence: '語43' }]]);
        const rows = f.panel.querySelectorAll('[role="listitem"]');
        for (const row of rows) {
            expect([...row.querySelectorAll('[data-action="bm-grade"]')].map(button => button.textContent)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
        }
        f.panel.querySelector<HTMLButtonElement>('[data-action="bm-grade-selected"][data-grade="hard"]')!.click();
        await waitForExpect(() => expect(f.selected.size).toBe(0));
        expect(f.jitenParse.mock.calls).toEqual([[['語43']]]);
        expect(f.jitenReview.mock.calls.map(([card]) => card.vid)).toEqual([42, 4300]);
        expect(f.jpdbReview).not.toHaveBeenCalled();
        expect(f.add).not.toHaveBeenCalled();
    });

    it('never adds a Jiten identity to JPDB: a JPDB grade adds and reviews the resolved JPDB word once', async () => {
        const f = setup([candidate(42)], { apiGradingProvider: 'jpdb' });
        const resolved: JPDBCard = { ...candidate(9042, 'jpdb').card, sid: 1, spelling: '語42', cardState: ['not-in-deck'] };
        f.jpdbParse.mockResolvedValueOnce([[{ card: resolved, start: 0, end: 2, length: 2, rubies: [], pitchClass: '', sentence: '語42' }]]);
        const row = f.panel.querySelector('[role="listitem"]')!;
        expect([...row.querySelectorAll('[data-action="bm-grade"]')].map(button => button.textContent)).toEqual(['Nothing', 'Something', 'Hard', 'Okay', 'Easy']);
        row.querySelector<HTMLButtonElement>('[data-action="bm-grade"][data-grade="okay"]')!.click();
        await waitForExpect(() => expect(f.selected.size).toBe(0));
        expect(f.jpdbParse.mock.calls).toEqual([[['語42']]]);
        // The resolved JPDB word, never the Jiten one, goes through the batch's
        // own add-then-review stages, each exactly once.
        const jpdbWord = expect.objectContaining({ source: 'jpdb', vid: 9042, sid: 1, spelling: '語42', reading: 'ご' });
        expect(f.add.mock.calls).toEqual([[DEFAULT_SETTINGS.miningDeck, jpdbWord, '単語を読む。']]);
        expect(f.jpdbReview.mock.calls).toEqual([[jpdbWord, 'okay']]);
        expect(f.jitenReview).not.toHaveBeenCalled();
    });

    // ADR-0019: subtitle words are JPDB-parsed, the default grading service is
    // Jiten. One request finds them all on Jiten; a word Jiten lacks is not
    // graded anywhere, but it never stops the words after it.
    it.each([
        ['en', 'Graded 2 words. Not found in your preferred grading service, so not graded: 語52.',
            'Not graded: this word was not found in your preferred grading service.'],
        ['ja', '2語を評価しました。優先採点サービスで見つからなかったため、採点していません：語52',
            '優先採点サービスでこの単語が見つからなかったため、採点していません。'],
    ] as const)('grades the words the grading service has and names the one it lacks (%s)', async (interfaceLanguage, toast, rowNote) => {
        const f = setup([candidate(51, 'jpdb'), candidate(52, 'jpdb'), candidate(53, 'jpdb')], { interfaceLanguage });
        const onJiten = (vid: number): JPDBToken => ({ card: { ...candidate(vid * 100).card, spelling: `語${vid}` }, start: 0, end: 3, length: 3, rubies: [], pitchClass: '', sentence: `語${vid}` });
        f.jitenParse.mockResolvedValueOnce([[onJiten(51)], [], [onJiten(53)]]);

        f.panel.querySelector<HTMLButtonElement>('[data-action="bm-grade-selected"][data-grade="hard"]')!.click();
        await waitForExpect(() => expect(f.toast).toHaveBeenCalledWith(toast));

        expect(f.jitenParse.mock.calls).toEqual([[['語51', '語52', '語53']]]);
        expect(f.jitenReview.mock.calls.map(([card, grade]) => [card.vid, grade])).toEqual([[5100, 'hard'], [5300, 'hard']]);
        expect(f.jpdbReview).not.toHaveBeenCalled();
        expect(f.add).not.toHaveBeenCalled();
        expect(f.selected.size).toBe(0);
        // The row says why it has no grade buttons, naming no service, and the
        // word cannot be bulk-graded into a request that is bound to fail.
        const unmatched = f.panel.querySelectorAll('[role="listitem"]')[1]!;
        expect(unmatched.querySelectorAll('[data-action="bm-grade"]')).toHaveLength(0);
        expect(unmatched.textContent).toContain(rowNote);
        expect(f.panel.textContent).not.toMatch(/JPDB|Jiten/);
        expect(f.panel.textContent).not.toContain('未翻訳');
    });

    it('stops a batch at a lookup failure rather than reading it as a missing word', async () => {
        const f = setup([candidate(61, 'jpdb'), candidate(62, 'jpdb')]);
        f.jitenParse.mockRejectedValueOnce(new Error('network'));

        f.panel.querySelector<HTMLButtonElement>('[data-action="bm-grade-selected"][data-grade="hard"]')!.click();
        await waitForExpect(() => expect(f.toast).toHaveBeenCalledWith('Completed 0 of 2 words. Unfinished words remain selected.'));

        expect(f.jitenReview).not.toHaveBeenCalled();
        expect(f.jpdbReview).not.toHaveBeenCalled();
        expect(f.selected.size).toBe(2);
        expect(f.panel.querySelectorAll('[data-action="bm-grade"]')).toHaveLength(8);
    });

    it('grades a word just added to the local deck from the subtitle batch', async () => {
        localStorage.clear();
        const repository = new LocalYomuSrsRepository();
        const word = candidate(42);
        const f = setup([word], { apiKey: '', jitenApiKey: '', yomuLocalSrsEnabled: true },
            { srsAdapters: { 'yomu-local': createYomuLocalSrsAdapter(repository) } });
        f.panel.querySelector<HTMLButtonElement>('[data-action="bm-add"]')!.click();
        await waitForExpect(() => expect(f.selected.size).toBe(0));
        const [saved] = await repository.lookupCards([{ expression: '語42', reading: 'ご' }]);
        expect(saved).toMatchObject({ state: ['in-deck'], srsLevel: 'Saved' });

        f.selected.add(word.key);
        f.internals.renderBatchMiningPanel();
        f.panel.querySelector<HTMLButtonElement>('[data-action="bm-grade"][data-grade="okay"]')!.click();
        await waitForExpect(() => expect(f.selected.size).toBe(0));
        const [graded] = await repository.lookupCards([{ expression: '語42', reading: 'ご' }]);
        expect(graded).toMatchObject({ state: ['learning'], srsLevel: 'Learning' });
        expect(f.toast).not.toHaveBeenCalledWith(expect.stringContaining('not enrolled'));
    });

    it('consults Anki again in a new generation, preserving word dedupe and allowing a deleted note to be mined', async () => {
        const f = setup([candidate(42)], { ankiEnabled: true, apiKey: '', jitenApiKey: '', yomuLocalSrsEnabled: false });
        const generation = f.controller as unknown as { batchActions: { beginGeneration(): boolean } };
        const collect = () => f.panel.querySelector<HTMLButtonElement>('[data-action="bm-add"]')!.click();
        collect();
        await waitForExpect(() => expect(f.selected.size).toBe(0));
        expect(f.ankiAdd).toHaveBeenCalledTimes(1);

        f.ankiFind.mockResolvedValue({ primary: { noteId: 1001 }, notes: [], state: 'due' });
        const next = candidate(42);
        next.sentence = 'A different context';
        f.internals.batchMiningCandidates = [next];
        f.selected.add(next.key);
        expect(generation.batchActions.beginGeneration()).toBe(true);
        f.internals.renderBatchMiningPanel();
        collect();
        await waitForExpect(() => expect(f.selected.size).toBe(0));
        expect(f.ankiFind).toHaveBeenCalledTimes(2);
        expect(f.ankiAdd).toHaveBeenCalledTimes(1);

        f.ankiFind.mockResolvedValue({ primary: null, notes: [], state: 'not-found' });
        const afterDeletion = candidate(42);
        afterDeletion.sentence = 'Context after deletion';
        f.internals.batchMiningCandidates = [afterDeletion];
        f.selected.add(afterDeletion.key);
        generation.batchActions.beginGeneration();
        f.internals.renderBatchMiningPanel();
        collect();
        await waitForExpect(() => expect(f.ankiAdd).toHaveBeenCalledTimes(2));
        expect(f.ankiAdd.mock.calls[1]?.[1]).toBe('Context after deletion');
        expect(f.jitenReview).not.toHaveBeenCalled();
    });

    it('starts a receipt generation on an actual new scan, not a panel rerender', async () => {
        const f = setup();
        const begin = vi.spyOn(f.actions.batchMining, 'beginGeneration');
        f.internals.renderBatchMiningPanel();
        expect(begin).not.toHaveBeenCalled();
        Object.assign(f.internals, {
            forceNativeCueRefresh: () => {},
            transcriptRows: () => [{ cueIndex: 0, cue: { start: 0, end: 1, text: '語42' } }],
            parseCueHtmlBatch: async () => {},
        });
        f.panel.querySelector<HTMLButtonElement>('[data-action="bm-scan"]')!.click();
        await waitForExpect(() => expect(begin).toHaveBeenCalledTimes(1));
        await waitForExpect(() => expect(f.panel.querySelector('[data-action="bm-scan"]')?.textContent).toContain('Rescan'));
    });

    it.each(['en', 'ja'] as const)('reports retained-state capacity without losing selection in %s', async language => {
        const f = setup([candidate(42)], { interfaceLanguage: language });
        vi.spyOn(f.actions.batchMining, 'execute').mockResolvedValue({ items: [], rejected: 'capacity' });
        f.panel.querySelector<HTMLButtonElement>('[data-action="bm-grade"][data-grade="hard"]')!.click();
        await waitForExpect(() => expect(f.toast).toHaveBeenCalledWith(expect.stringContaining(language === 'en' ? 'Unfinished work has been kept.' : '未完了の処理は保持しています。')));
        expect(f.selected.size).toBe(1);
        expect(f.jitenReview).not.toHaveBeenCalled();
    });
});
