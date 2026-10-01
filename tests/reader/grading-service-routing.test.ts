import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderParser } from '../../src/reader/lookup/parser';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { resetActiveLearningTargetLanguage } from '../../src/reader/languages/active';
import { CardPopoverRenderer } from '../../src/reader/cards/popover-renderer';
import { userFacingErrorText } from '../../src/reader/app/user-facing-errors';
import { uiText } from '../../src/reader/app/i18n';
import { GRADING_SERVICE_COPY } from '../../src/reader/app/grading-service-copy';
import { subtitleParseSourceSignature } from '../../src/reader/subtitles/subtitle-parse-policy';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import type { JpdbClient } from '../../src/reader/jpdb/jpdb';
import type { JitenApiClient } from '../../src/reader/dictionaries/jiten';
import { newTabLookupReviewTargetSelection } from '../../src/reader/newtab/lookup-dom';
import { card as baseCard, emptyCardRenderData, jitenTestCard, testCardActionController } from './jpdb/fixtures';
import { NewTabRuntime, newTabLookupRenderData, newTabTestCard, newTabVisibleWordFixture, registerNewTabReviewCleanup, setupNewTabLookupRuntime } from './new-tab-review/fixtures';
import type { CardActionController } from '../../src/reader/cards/action-controller';

/**
 * Decision 2: with both JPDB and Jiten connected, grades go to the service the
 * learner chose. Automatic parsing gives words that service's identity; a word
 * another service identified is matched on the chosen service before it is
 * graded, and is not graded at all when it cannot be matched.
 */

const BOTH_KEYS: Partial<ReaderSettings> = { apiKey: 'jpdb-key', jitenApiKey: 'ak_jiten-key', jpdbMiningEnabled: true, enableReviews: true };
const isJpdbBackedCard = (card: JPDBCard): boolean => (!card.source || card.source === 'jpdb') && card.vid > 0;

function token(card: JPDBCard, sentence = card.spelling): JPDBToken {
    const start = Math.max(0, sentence.indexOf(card.spelling));
    return { card, start, end: start + card.spelling.length, length: card.spelling.length, rubies: [], pitchClass: '', sentence };
}

const jpdbYomu: JPDBCard = { ...baseCard, source: 'jpdb', vid: 777, sid: 3, spelling: '読む', reading: 'よむ', cardState: ['learning'] };
const jitenYomu = jitenTestCard({ spelling: '読む', reading: 'よむ', cardState: ['new'] });

beforeEach(() => resetActiveLearningTargetLanguage());
afterEach(() => resetActiveLearningTargetLanguage());

describe('automatic parsing follows the grading service', () => {
    const PAGE_TEXT = '本を読むのが好きです';

    function parserFor(settings: Partial<ReaderSettings>) {
        const words = (card: JPDBCard) => async (paragraphs: string[]) => paragraphs
            .map(text => text.includes(card.spelling) ? [token(card, text)] : []);
        const jpdbParse = vi.fn(words(jpdbYomu));
        const jitenParse = vi.fn(words(jitenYomu));
        const parser = new ReaderParser({
            getSettings: () => ({ ...DEFAULT_SETTINGS, ...settings }),
            jpdb: { parse: jpdbParse } as never,
            jiten: { parse: jitenParse } as never,
            dictionaries: { hasTermDictionaries: vi.fn(async () => false), findTermMatches: vi.fn(async () => []) } as never,
        });
        return { parser, jpdbParse, jitenParse };
    }

    // Which service received the page text itself (span checks may still ask
    // either service about single terms), and whose identity the word carries.
    async function pageParsedBy(settings: Partial<ReaderSettings>): Promise<{ service: string; source: string | undefined }> {
        const { parser, jpdbParse, jitenParse } = parserFor(settings);
        const [tokens = []] = await parser.parse([PAGE_TEXT]);
        const sentPage = (parse: typeof jpdbParse) => parse.mock.calls.some(([paragraphs]) => paragraphs.includes(PAGE_TEXT));
        const service = sentPage(jpdbParse) === sentPage(jitenParse) ? 'both or neither' : sentPage(jpdbParse) ? 'jpdb' : 'jiten';
        return { service, source: tokens.find(parsed => parsed.card.spelling === '読む')?.card.source };
    }

    it.each([
        ['jpdb', 'jpdb'],
        ['jiten', 'jiten'],
        // A stored Bunpro preference grades words to Jiten, as the popover does.
        ['bunpro', 'jiten'],
    ] as const)('parses with both keys and a %s grading preference by %s', async (apiGradingProvider, expected) => {
        await expect(pageParsedBy({ ...BOTH_KEYS, parserProvider: 'auto', apiGradingProvider })).resolves
            .toEqual({ service: expected, source: expected });
    });

    it('applies to the default parser when no local dictionary is installed', async () => {
        await expect(pageParsedBy({ ...BOTH_KEYS, parserProvider: 'local', apiGradingProvider: 'jpdb' })).resolves
            .toEqual({ service: 'jpdb', source: 'jpdb' });
    });

    it('keeps an explicit parser choice and the single-key order', async () => {
        await expect(pageParsedBy({ ...BOTH_KEYS, parserProvider: 'jiten', apiGradingProvider: 'jpdb' })).resolves
            .toMatchObject({ service: 'jiten' });
        await expect(pageParsedBy({ ...BOTH_KEYS, parserProvider: 'jpdb', apiGradingProvider: 'jiten' })).resolves
            .toMatchObject({ service: 'jpdb' });
        await expect(pageParsedBy({ ...BOTH_KEYS, jitenApiKey: '', parserProvider: 'auto', apiGradingProvider: 'jiten' })).resolves
            .toMatchObject({ service: 'jpdb' });
        await expect(pageParsedBy({ ...BOTH_KEYS, apiKey: '', parserProvider: 'auto', apiGradingProvider: 'jpdb' })).resolves
            .toMatchObject({ service: 'jiten' });
    });

    // Subtitle parsing requires JPDB identity whatever the grading service, so a
    // service change must not throw away every cached subtitle line.
    it('keeps cached subtitles when only the grading service changes', () => {
        const settings = { ...DEFAULT_SETTINGS, ...BOTH_KEYS, parserProvider: 'auto' as const };
        expect(subtitleParseSourceSignature({ ...settings, apiGradingProvider: 'jpdb' }))
            .toBe(subtitleParseSourceSignature({ ...settings, apiGradingProvider: 'jiten' }));
    });
});

describe('a grade reaches only the chosen grading service', () => {
    function gradingController(settings: Partial<ReaderSettings>, parsed: { jpdb?: JPDBCard[]; jiten?: JPDBCard[] } = {}) {
        const jpdb = {
            parse: vi.fn(async (terms: string[]) => terms.map(() => (parsed.jpdb ?? []).map(card => token(card)))),
            reviewCard: vi.fn(async () => undefined),
            addToDeck: vi.fn(async () => undefined),
        };
        const jiten = {
            parse: vi.fn(async (terms: string[]) => terms.map(() => (parsed.jiten ?? []).map(card => token(card)))),
            reviewCard: vi.fn(async () => undefined),
        };
        const onApiCardStateChanged = vi.fn();
        const controller = testCardActionController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, ...BOTH_KEYS, ...settings }),
            jpdb: jpdb as unknown as JpdbClient,
            jiten: jiten as unknown as JitenApiClient,
            isJpdbBackedCard,
            onApiCardStateChanged,
        });
        return { controller, jpdb, jiten, onApiCardStateChanged };
    }

    it('resolves the JPDB identity of a word an explicit Jiten parser found, then grades JPDB exactly once', async () => {
        const f = gradingController({ parserProvider: 'jiten', apiGradingProvider: 'jpdb' }, { jpdb: [{ ...jpdbYomu }] });

        await f.controller.reviewGrade('okay', { ...jitenYomu }, '本を読む。');

        expect(f.jpdb.parse.mock.calls).toEqual([[['読む']]]);
        expect(f.jpdb.reviewCard.mock.calls).toEqual([[expect.objectContaining({ source: 'jpdb', vid: 777, sid: 3 }), 'okay']]);
        expect(f.jpdb.addToDeck).not.toHaveBeenCalled();
        expect(f.jiten.reviewCard).not.toHaveBeenCalled();
        expect(f.onApiCardStateChanged).toHaveBeenCalledWith(expect.objectContaining({ vid: 777 }));
    });

    it('resolves the Jiten identity of a JPDB-parsed word when Jiten is the grading service', async () => {
        const jpdbOnly: JPDBCard = { ...jpdbYomu };
        const f = gradingController({ parserProvider: 'jpdb', apiGradingProvider: 'jiten' }, { jiten: [{ ...jitenYomu }] });

        await f.controller.reviewGrade('okay', jpdbOnly);

        expect(f.jiten.parse.mock.calls).toEqual([[['読む']]]);
        expect(f.jiten.reviewCard.mock.calls).toEqual([[expect.objectContaining({ source: 'jiten', jitenWordId: 42 }), 'okay']]);
        expect(f.jpdb.reviewCard).not.toHaveBeenCalled();
    });

    it.each([
        ['another reading', [{ ...jpdbYomu, reading: 'とく' }]],
        ['no word', []],
    ])('says so and sends nothing when the grading service has %s', async (_case, jpdbCards) => {
        const f = gradingController({ parserProvider: 'jiten', apiGradingProvider: 'jpdb' }, { jpdb: jpdbCards });

        const error = await f.controller.reviewGrade('okay', { ...jitenYomu }).catch((failure: unknown) => failure);

        expect(userFacingErrorText('en', 'actionFailed', error)).toBe('Not graded: this word was not found in your preferred grading service.');
        expect(userFacingErrorText('ja', 'actionFailed', error)).toBe('優先採点サービスでこの単語が見つからなかったため、採点していません。');
        expect(f.jpdb.reviewCard).not.toHaveBeenCalled();
        expect(f.jpdb.addToDeck).not.toHaveBeenCalled();
        expect(f.jiten.reviewCard).not.toHaveBeenCalled();
        expect(f.onApiCardStateChanged).not.toHaveBeenCalled();
    });

    it('never matches a word whose reading is unknown, so it sends nothing', async () => {
        const f = gradingController({ parserProvider: 'jiten', apiGradingProvider: 'jpdb' }, { jpdb: [{ ...jpdbYomu }] });

        const error = await f.controller.reviewGrade('okay', { ...jitenYomu, reading: '' }).catch((failure: unknown) => failure);

        expect(userFacingErrorText('en', 'actionFailed', error)).toBe('Not graded: this word was not found in your preferred grading service.');
        expect(f.jpdb.parse).not.toHaveBeenCalled();
        expect(f.jpdb.reviewCard).not.toHaveBeenCalled();
        expect(f.jiten.reviewCard).not.toHaveBeenCalled();
    });

    it('keeps a word the Study toggle switched to the other service on that service', async () => {
        const f = gradingController({ apiGradingProvider: 'jpdb' });

        await f.controller.reviewGrade('okay', { ...jitenYomu, apiGradingProviderOverride: 'jiten' });

        expect(f.jpdb.parse).not.toHaveBeenCalled();
        expect(f.jiten.reviewCard).toHaveBeenCalledTimes(1);
        expect(f.jpdb.reviewCard).not.toHaveBeenCalled();
    });

    it('grades a word the chosen service already identifies without resolving it', async () => {
        const f = gradingController({ apiGradingProvider: 'jiten' });

        await f.controller.reviewGrade('okay', { ...jitenYomu });

        expect(f.jiten.parse).not.toHaveBeenCalled();
        expect(f.jiten.reviewCard).toHaveBeenCalledTimes(1);
        expect(f.jpdb.reviewCard).not.toHaveBeenCalled();
    });
});

// ADR-0016/0021: a Study review card belongs to the queue it came from. Study
// opens it in the lookup popover, and a grade there must reach that queue
// whatever the preferred grading service, exactly like Study's own grade bar.
describe('a Study review card keeps its owner', () => {
    registerNewTabReviewCleanup();
    const jpdbDue = (): JPDBCard => newTabTestCard({ vid: 12000, sid: 1, rid: 8800, spelling: '読む', reading: 'よむ', sentence: '本を読む。',
        source: 'jpdb', reviewSource: 'jpdb-api', jpdbReviewId: 'jpdb-review-8800', cardState: ['due'] });
    const jitenDue = (): JPDBCard => newTabTestCard({ vid: 4300, sid: 2, rid: 9900, spelling: '試験', reading: 'しけん', sentence: '試験を受ける。',
        source: 'jiten', reviewSource: 'jiten-api', jitenWordId: 4300, jitenReadingIndex: 2, cardState: ['due'] });

    it.each([
        ['JPDB', 'jiten', jpdbDue, 'jpdb'],
        ['JPDB', 'jpdb', jpdbDue, 'jpdb'],
        ['Jiten', 'jpdb', jitenDue, 'jiten'],
        ['Jiten', 'jiten', jitenDue, 'jiten'],
    ] as const)('grades a due %s card opened from Study with a %s preference into its own queue once', async (_label, apiGradingProvider, dueCard, owner) => {
        const card = dueCard();
        const settings: ReaderSettings = { ...DEFAULT_SETTINGS, ...BOTH_KEYS, apiGradingProvider, immersionKitEnabled: false, interfaceLanguage: 'en' };
        const reviewCard = { jpdb: vi.fn(async () => undefined), jiten: vi.fn(async () => undefined) };
        const parse = { jpdb: vi.fn(async () => [[]]), jiten: vi.fn(async () => [[]]) };
        const showLookupCard = vi.fn();
        const { controller, root } = newTabVisibleWordFixture(settings, {
            card,
            sourceLabel: owner === 'jpdb' ? 'JPDB' : 'Jiten',
            controllerOverrides: {
                showLookupCard,
                jpdb: { reviewCard: reviewCard.jpdb, parse: parse.jpdb } as never,
                jiten: { reviewCard: reviewCard.jiten, parse: parse.jiten, refreshCardState: vi.fn(async () => undefined) } as never,
            },
        });
        try {
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
            root.querySelector<HTMLElement>('[data-newtab-prompt]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            const [shown] = showLookupCard.mock.calls[0] as [JPDBCard];
            // Study is a trusted surface, so its popover row names the service.
            const popover = document.createElement('div');
            popover.innerHTML = new CardPopoverRenderer({
                getSettings: () => settings,
                isJpdbBackedCard,
                renderWordHistory: () => '',
                renderWordPills: () => '',
                renderDefinitionSources: () => '',
                dictionarySourceAttributes: () => '',
                dictionaryLabel: name => name,
                accountDataSurfaceTrusted: () => true,
            }).render(shown, shown.sentence, 'modal', emptyCardRenderData());
            document.body.append(popover);
            const grades = [...popover.querySelectorAll<HTMLButtonElement>('[data-action="grade"][data-grade]')];

            expect(grades.map(button => button.dataset.reviewTarget)).toEqual(grades.map(() => owner));
            expect(grades.map(button => button.dataset.grade)).toEqual(owner === 'jpdb'
                ? ['nothing', 'something', 'hard', 'okay', 'easy'] : ['nothing', 'hard', 'okay', 'easy']);
            const okay = grades.find(button => button.dataset.grade === 'okay')!;
            await expect(controller.gradeFromLookup('okay', newTabLookupReviewTargetSelection(okay), shown)).resolves.toEqual({ preserveLookup: false });

            expect(reviewCard[owner]).toHaveBeenCalledTimes(1);
            expect(reviewCard[owner === 'jpdb' ? 'jiten' : 'jpdb']).not.toHaveBeenCalled();
            expect(parse.jpdb).not.toHaveBeenCalled();
            expect(parse.jiten).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
            root.remove();
        }
    });
});

// The ⇄ toggle in Study switches one word. The stored preference decides
// Automatic parsing and every page grade, which never name a service, so only
// Settings may change it: a toggle that rewrote it would silently re-target them.
describe('the Study grading-service toggle', () => {
    registerNewTabReviewCleanup();

    it('switches only that word and leaves the preferred grading service as Settings set it', async () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
        const runtime = new NewTabRuntime();
        const internals = setupNewTabLookupRuntime(runtime, newTabLookupRenderData(), {
            settings: { ...BOTH_KEYS, apiGradingProvider: 'jiten' },
            isJpdbBackedCard,
        }) as ReturnType<typeof setupNewTabLookupRuntime> & { cardActions: CardActionController; jpdb: JpdbClient };
        const showLookupCard = vi.fn(async () => undefined);
        internals.showLookupCard = showLookupCard;
        Object.assign(internals.cardRenderData, { clear: vi.fn() });
        Object.assign(internals.jpdb, {
            parse: vi.fn(async (terms: string[]) => terms.map(() => [token({ ...jpdbYomu })])),
            refreshCardState: vi.fn(async () => undefined),
        });
        try {
            await internals.cardActions.perform({ kind: 'card-action', action: 'grade-provider-toggle' }, document.createElement('button'), { ...jitenYomu }, '本を読む。');

            expect(showLookupCard).toHaveBeenCalledWith(expect.objectContaining({ vid: 777, apiGradingProviderOverride: 'jpdb' }), '本を読む。', undefined, expect.anything());
            expect(internals.settings.apiGradingProvider).toBe('jiten');
        } finally {
            runtime.destroy();
        }
    });
});

describe('the ordinary-page grade row', () => {
    it('offers the chosen service scale for a word the other service found, naming no service', () => {
        const settings: ReaderSettings = { ...DEFAULT_SETTINGS, ...BOTH_KEYS, apiGradingProvider: 'jpdb', interfaceLanguage: 'en' };
        const renderer = new CardPopoverRenderer({
            getSettings: () => settings,
            isJpdbBackedCard,
            renderWordHistory: () => '',
            renderWordPills: () => '',
            renderDefinitionSources: () => '',
            dictionarySourceAttributes: () => '',
            dictionaryLabel: name => name,
            accountDataSurfaceTrusted: () => false,
        });
        document.body.innerHTML = renderer.render({ ...jitenYomu }, undefined, 'modal', emptyCardRenderData());
        const grades = [...document.querySelectorAll<HTMLButtonElement>('[data-action="grade"][data-grade]')];

        expect(grades.map(button => button.dataset.grade)).toEqual(['nothing', 'something', 'hard', 'okay', 'easy']);
        expect(grades.every(button => !button.dataset.reviewTarget)).toBe(true);
        expect(document.querySelector('.jpdb-reader-actions')?.textContent ?? '').not.toMatch(/JPDB|Jiten/);
    });
});

describe('grading-service copy', () => {
    it('has Japanese for every English key, so Japanese mode never shows 未翻訳', () => {
        expect(Object.keys(GRADING_SERVICE_COPY.ja).sort()).toEqual(Object.keys(GRADING_SERVICE_COPY.en).sort());
        for (const key of Object.keys(GRADING_SERVICE_COPY.en) as Array<keyof typeof GRADING_SERVICE_COPY.en>) {
            expect(uiText('ja', key)).toBe(GRADING_SERVICE_COPY.ja[key]);
            expect(uiText('ja', key)).not.toContain('未翻訳');
        }
        expect(uiText('ja', 'parserProviderHelp')).toContain('優先採点サービス');
    });
});
