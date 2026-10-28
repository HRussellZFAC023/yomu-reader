import '../../../src/reader/companions/register-build-companions';
import { describe, expect, it } from 'vitest';
import { registerReaderHelpersCleanup, CardPopoverRenderer, DEFAULT_SETTINGS, card, defaultDictionaryLookupLinks, emptyCardRenderData, jitenTestCard, popoverGradeButtons, popoverGradeTargetCurrentText, popoverGradeTargetOptions, popoverGradeTargetText, readerMetaText, renderModalCard, renderWordPills, testAnkiExistingNote, testAnkiLookup, testCardPopoverRenderer, testIsJpdbBackedCard, updatePopoverReviewTargetSelection } from './fixtures';
import type { JPDBCard } from './fixtures';
import { setInnerHtml } from '../../../src/reader/dom';
import { readCardUiCommandCapability } from '../../../src/reader/dom/private-command-capabilities';
import { readFileSync as readStyleFile } from 'node:fs';

// Read only the styles this host actually asserts.
const KANJI_CSS = readStyleFile('src/reader/styles/kanji.css', 'utf8');


registerReaderHelpersCleanup();

// Each destination keeps its native scale: JPDB's five grades, Anki's four.
const JPDB_GRADE_ROW = { grades: ['nothing', 'something', 'hard', 'okay', 'easy'], labels: ['Nothing', 'Something', 'Hard', 'Okay', 'Easy'] };
const ANKI_GRADE_ROW = { grades: ['nothing', 'hard', 'okay', 'easy'], labels: ['Again', 'Hard', 'Good', 'Easy'] };

/** One entry per rendered grade row; hidden rows are the scales of switchable targets. */
function popoverGradeRows() {
    return [...document.querySelectorAll<HTMLElement>('.jpdb-reader-actions [data-review-target-row]')].map(row => {
        const buttons = [...row.querySelectorAll<HTMLButtonElement>('[data-action="grade"]')];
        return {
            profile: row.dataset.reviewGradeProfile,
            hidden: row.hidden,
            grades: buttons.map(button => button.dataset.grade),
            labels: buttons.map(button => button.textContent?.trim()),
            targets: [...new Set(buttons.map(button => button.dataset.reviewTarget))],
            ankiCardIds: [...new Set(buttons.map(button => button.dataset.ankiCardId))],
        };
    });
}

function selectPopoverReviewTarget(value: string): void {
    const select = document.querySelector<HTMLSelectElement>('[data-review-target-select]')!;
    select.value = value;
    updatePopoverReviewTargetSelection(select);
}

function expectJpdbAndAnkiGradeRows(visible: 'standard' | 'anki', target: string, ankiCardId: string | undefined): void {
    expect(popoverGradeRows()).toEqual([
        { profile: 'standard', hidden: visible !== 'standard', ...JPDB_GRADE_ROW, targets: [target], ankiCardIds: [ankiCardId] },
        { profile: 'anki', hidden: visible !== 'anki', ...ANKI_GRADE_ROW, targets: [target], ankiCardIds: [ankiCardId] },
    ]);
}

describe('reader helpers', () => {

    it('keeps Add to Anki visible inside the mining drawer panel', () => {
        const settings = {
            apiKey: 'test-key',
            jpdbMiningEnabled: true,
            ankiEnabled: true,
        };
        const renderer = testCardPopoverRenderer(settings);

        document.body.innerHTML = renderModalCard(renderer, card, '食べる。');

        const panel = document.querySelector<HTMLElement>('.jpdb-reader-mining-panel')!;
        const ankiButton = document.querySelector<HTMLButtonElement>('[data-action="anki"]')!;

        expect(panel.contains(ankiButton)).toBe(true);
        expect(document.querySelector<HTMLElement>('.jpdb-reader-actions')?.classList.contains('jpdb-reader-actions-mining-collapsed')).toBe(true);
        expect(document.querySelector<HTMLButtonElement>('[data-action="mining-collapse"]')?.getAttribute('aria-expanded')).toBe('false');
        expect(KANJI_CSS).toContain('.jpdb-reader-actions-mining-collapsed .jpdb-reader-mining-panel');
    });

    it('does not show Add to Anki while an Anki miss is still untrusted', () => {
        const settings = {
            apiKey: 'test-key',
            jpdbMiningEnabled: true,
            ankiEnabled: true,
        };
        const renderer = testCardPopoverRenderer(settings);

        document.body.innerHTML = renderModalCard(renderer, card, '食べる。', {
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null, trusted: false },
        });

        expect(document.querySelector<HTMLButtonElement>('[data-action="anki"]')).toBeNull();
        expect(document.querySelector('.jpdb-reader-anki-checking')).toBeNull();
        expect(document.querySelector('.jpdb-reader-meta')?.textContent).not.toContain('Checking Anki...');
    });

    it('hides JPDB review buttons when JPDB writes are disabled but keeps Anki review available', () => {
        const renderer = testCardPopoverRenderer({
            apiKey: 'test-key',
            jpdbMiningEnabled: false,
            ankiEnabled: true,
            ankiSectionEnabled: true,
            enableReviews: true,
        });

        const jpdbOnly = renderer.render(card, '食べる。', 'modal', emptyCardRenderData());
        expect(jpdbOnly).not.toContain('data-action="grade"');
        expect(jpdbOnly).toContain('data-action="anki"');

        const ankiBacked = renderer.render(card, '食べる。', 'modal', emptyCardRenderData({
            ankiLookup: {
                state: 'due',
                notes: [],
                primary: {
                    noteId: 10,
                    primaryCardId: 20,
                    cardIds: [20],
                    state: 'due',
                    deckNames: ['Yomu'],
                    modelName: 'Yomu Japanese',
                    fields: {},
                    tags: [],
                    reps: 1,
                    lapses: 0,
                },
            },
        }));
        expect(ankiBacked).toContain('data-action="grade"');
        expect(ankiBacked).toContain('data-anki-card-id="20"');
        expect(ankiBacked).toContain('jpdb-reader-actions-has-mining');
        expect(ankiBacked).toContain('data-review-target-gutter');
    });

    it('shows a grading-provider toggle and follows the chosen provider when both keys back the card', () => {
        const dualCard: JPDBCard = { ...card, source: 'jpdb', cardState: ['new'], jitenWordId: 99, jitenReadingIndex: 0 };
        const dualSettings = {
            apiKey: 'jpdb-key',
            jitenApiKey: 'jiten-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
        };
        const renderer = testCardPopoverRenderer(dualSettings, {
            isJpdbBackedCard: testIsJpdbBackedCard,
        });

        document.body.innerHTML = renderModalCard(renderer, dualCard, '食べる。');
        const providerToggle = document.querySelector<HTMLButtonElement>('[data-review-target-gutter] [data-action="grade-provider-toggle"]');
        const currentTarget = document.querySelector<HTMLElement>('[data-review-target-current]');
        expect(providerToggle).not.toBeNull();
        expect(providerToggle?.parentElement?.matches('[data-review-target-gutter]')).toBe(true);
        expect(currentTarget?.parentElement).toBe(providerToggle);
        expect(providerToggle?.textContent).toContain('Jiten');
        expect(document.querySelector('.jpdb-reader-provider-status [data-action="grade-provider-toggle"]')).toBeNull();
        expect(readerMetaText()).toContain('Jiten');
        expect(popoverGradeButtons().every(button => button.dataset.reviewTarget === 'jiten')).toBe(true);
        // Only one provider switcher (the review-target gutter toggle), never a second selector on the grade row.
        expect(document.querySelector('[data-review-target-select]')).toBeNull();

        const jitenRenderer = testCardPopoverRenderer({ ...dualSettings, apiGradingProvider: 'jiten' }, {
            isJpdbBackedCard: testIsJpdbBackedCard,
        });
        document.body.innerHTML = renderModalCard(jitenRenderer, dualCard, '食べる。');
        expect(document.querySelector('[data-review-target-gutter] [data-action="grade-provider-toggle"]')).not.toBeNull();
        expect(readerMetaText()).toContain('Jiten');
        expect(popoverGradeButtons().every(button => button.dataset.reviewTarget === 'jiten')).toBe(true);
    });

    it('hides the grading-provider toggle when only one provider backs the card', () => {
        const renderer = testCardPopoverRenderer({ apiKey: 'jpdb-key', jpdbMiningEnabled: true, enableReviews: true });
        document.body.innerHTML = renderModalCard(renderer, { ...card, cardState: ['new'] }, '食べる。');
        expect(document.querySelector('[data-action="grade-provider-toggle"]')).toBeNull();
        expect(document.querySelector('[data-review-target-current]')).toBeNull();
    });

    it('keeps the grading-provider toggle visible for dual-key Jiten-only popovers', () => {
        const renderer = testCardPopoverRenderer({ apiKey: 'jpdb-key', jitenApiKey: 'jiten-key', jpdbMiningEnabled: true, enableReviews: true }, {
            isJpdbBackedCard: () => false,
        });

        document.body.innerHTML = renderModalCard(renderer, jitenTestCard(), '読む。');

        const providerToggle = document.querySelector<HTMLButtonElement>('[data-review-target-gutter] [data-action="grade-provider-toggle"]');
        const currentTarget = document.querySelector<HTMLElement>('[data-review-target-current]');
        expect(providerToggle).not.toBeNull();
        expect(currentTarget?.parentElement).toBe(providerToggle);
        expect(providerToggle?.textContent).toContain('Jiten');
        expect(providerToggle?.getAttribute('aria-label')).toBe('Switch grading provider (JPDB)');
        expect(popoverGradeTargetCurrentText()).toBe('Jiten');
    });

    it('renders Jiten cards with the JPDB action pattern and no Mining/Suspended/Forget row', () => {
        const renderer = testCardPopoverRenderer({ apiKey: '', jitenApiKey: 'jiten-key', jpdbMiningEnabled: true, enableReviews: true }, {
            isJpdbBackedCard: testIsJpdbBackedCard,
        });
        const html = renderModalCard(renderer, jitenTestCard(), '読む。');
        expect(html).toContain('jpdb-reader-deck-select');
        expect(html).toContain('data-action="neverforget"');
        expect(html).toContain('data-action="blacklist"');
        expect(html).not.toContain('data-action="jiten-mining"');
        expect(html).not.toContain('data-action="jiten-suspend"');
        expect(html).not.toContain('data-action="jiten-forget"');
        document.body.innerHTML = html;
        expect(popoverGradeButtons().every(button => button.dataset.reviewTarget === 'jiten')).toBe(true);
    });

    it('hides Never forget and Blacklist for Bunpro-only cards where no provider can set deck state', () => {
        const renderer = testCardPopoverRenderer({ apiKey: '', jitenApiKey: '', bunproMiningEnabled: true, bunproFrontendApiToken: 'bunpro-token', enableReviews: true }, {
            isJpdbBackedCard: testIsJpdbBackedCard,
        });
        const html = renderModalCard(renderer, jitenTestCard({ source: 'bunpro', jitenWordId: undefined, jitenReadingIndex: undefined, bunproReviewId: '77', bunproReviewableType: 'vocabulary' }), '読む。');
        expect(html).toContain('jpdb-reader-deck-select');
        setInnerHtml(document.body, html);
        const collect = document.querySelector('.jpdb-reader-deck-select')!;
        expect(readCardUiCommandCapability(collect)?.choices).toContainEqual({ source: 'bunpro', id: 'bunpro', label: 'Bunpro' });
        expect(document.querySelector('[data-deck-source], [data-deck-id], [data-add-deck-select]')).toBeNull();
        expect(html).not.toContain('data-action="neverforget"');
        expect(html).not.toContain('data-action="blacklist"');
    });

    it('offers Bunpro mining for an ordinary popup word without offering an unsessioned grade', () => {
        const renderer = testCardPopoverRenderer({
            apiKey: '',
            jitenApiKey: '',
            yomuLocalSrsEnabled: false,
            bunproMiningEnabled: true,
            bunproFrontendApiToken: 'bunpro-token',
            enableReviews: true,
        }, {
            isJpdbBackedCard: () => false,
        });

        const html = renderModalCard(renderer, { ...card, source: 'local', cardState: ['not-in-deck'] }, '食べる。');
        setInnerHtml(document.body, html);
        const collect = document.querySelector('.jpdb-reader-deck-select')!;
        expect(readCardUiCommandCapability(collect)?.choices).toContainEqual({ source: 'bunpro', id: 'bunpro', label: 'Bunpro' });
        expect(document.querySelector('[data-deck-source], [data-deck-id], [data-add-deck-select]')).toBeNull();
        expect(html).not.toContain('data-action="grade"');
    });

    it('allows locked JPDB review buttons while keeping Anki review available', () => {
        const renderer = testCardPopoverRenderer({
            apiKey: 'test-key',
            jpdbMiningEnabled: true,
            ankiEnabled: true,
            ankiSectionEnabled: true,
            enableReviews: true,
        });

        const jpdbOnly = renderer.render({ ...card, cardState: ['locked'] }, '食べる。', 'modal', emptyCardRenderData());
        expect(jpdbOnly).toContain('data-action="grade"');
        expect(jpdbOnly).toContain('jpdb-reader-actions-has-mining');
        expect(jpdbOnly).toContain('jpdb-reader-actions-mining-collapsed');
        expect(jpdbOnly).toContain('aria-expanded="false"');
        expect(jpdbOnly).toContain('More actions');
        expect(jpdbOnly).toContain('jpdb-reader-deck-select');
        expect(jpdbOnly).not.toContain('This JPDB card is locked');
        const container = document.createElement('div');
        setInnerHtml(container, jpdbOnly);
        document.body.innerHTML = jpdbOnly;
        expect(popoverGradeButtons()).toHaveLength(5);
        expect(popoverGradeButtons().every(button => button.dataset.reviewTarget === 'jpdb')).toBe(true);
        expect(popoverGradeTargetCurrentText()).toBe('');
        expect(document.querySelector('[data-review-target-current]')).toBeNull();
        expect(popoverGradeTargetText()).toBe('Grades JPDB');
        expect(popoverGradeTargetOptions()).toEqual([]);
        expect(document.querySelector('.jpdb-reader-popover-grade-target-selector')).toBeNull();
        expect(document.querySelector('[data-review-target-gutter]')).not.toBeNull();
        expect(document.querySelector<HTMLButtonElement>('[data-review-target-gutter] [data-action="mining-collapse"]')?.getAttribute('aria-expanded')).toBe('false');
        expect(container.querySelector('[data-add-deck-select]')).toBeNull();
        expect(readCardUiCommandCapability(container.querySelector('.jpdb-reader-deck-select')!)?.choices)
            .toContainEqual({ source: 'jpdb', id: DEFAULT_SETTINGS.miningDeck, label: 'JPDB: FORQ' });

        const ankiBacked = renderModalCard(renderer, { ...card, cardState: ['locked'] }, '食べる。', {
            ankiLookup: testAnkiLookup({
                primary: testAnkiExistingNote({
                    noteId: 10,
                    primaryCardId: 20,
                    cardIds: [20],
                    state: 'due',
                    deckNames: ['Yomu'],
                    modelName: 'Yomu Japanese',
                    fields: {},
                    reps: 1,
                    lapses: 0,
                }),
            }),
        });
        expect(ankiBacked).toContain('data-action="grade"');
        expect(ankiBacked).toContain('data-anki-card-id="20"');
        expect(ankiBacked).not.toContain('This JPDB card is locked');
    });

    it('shows JPDB and Anki status together and grades Anki cards from any deck', () => {
        const renderer = testCardPopoverRenderer({
            apiKey: 'test-key',
            jpdbMiningEnabled: true,
            ankiEnabled: true,
            ankiSectionEnabled: true,
            enableReviews: true,
        });

        // Bound (not raw innerHTML) so the private target selector can switch rows.
        setInnerHtml(document.body, renderModalCard(renderer, { ...card, cardState: ['due'] }, '動画を見る。', {
            ankiLookup: testAnkiLookup(),
        }));

        const metaText = document.querySelector('.jpdb-reader-meta')?.textContent ?? '';

        expect(metaText).toContain('JPDB Due');
        expect(metaText).toContain('Anki Known');
        expect(document.querySelector('.jpdb-reader-meta .jpdb-reader-state-dot.jpdb-due')).not.toBeNull();
        expect(document.querySelector('.jpdb-reader-meta .jpdb-reader-state-dot.anki-known')).not.toBeNull();
        expect(document.querySelector('.jpdb-reader-anki-existing summary small')?.textContent).toBe('Known · Anime::Mining · 8 reviews, 1 lapse');
        // Both grades JPDB's five-point scale; Anki's native four waits hidden
        // until the Anki card itself is the selected destination.
        expectJpdbAndAnkiGradeRows('standard', 'both', '777');
        expect(popoverGradeTargetCurrentText()).toBe('Both');
        expect(popoverGradeTargetText()).toBe('Grades JPDB + Anki card: Anime::Mining #777');
        expect(document.querySelector<HTMLElement>('.jpdb-reader-actions')?.classList.contains('jpdb-reader-actions-mining-collapsed')).toBe(true);
        expect(document.querySelector<HTMLButtonElement>('[data-review-target-gutter] [data-action="mining-collapse"]')?.getAttribute('aria-expanded')).toBe('false');
        expect(document.querySelector('.jpdb-reader-popover-grade-target-selector')).toBeNull();
        expect(document.querySelector('[data-review-target-selector]')?.classList.contains('jpdb-reader-review-target-panel')).toBe(true);
        expect(popoverGradeTargetOptions()).toEqual([
            { text: 'Both', target: 'both', cardId: '777', selected: true },
            { text: 'JPDB', target: 'jpdb', cardId: '', selected: false },
            { text: 'Anime::Mining #777', target: 'anki', cardId: '777', selected: false },
        ]);

        selectPopoverReviewTarget('anki:777');
        expectJpdbAndAnkiGradeRows('anki', 'anki', '777');
        expect(popoverGradeTargetText()).toBe('Grades Anki card: Anime::Mining #777');
        // The dropdown must still offer every destination after an Anki pick.
        expect([...document.querySelectorAll<HTMLOptionElement>('[data-review-target-select] option')].map(option => option.hidden))
            .toEqual([false, false, false]);
        // Anki's four buttons take keys by position; each button says which.
        expect([...document.querySelectorAll<HTMLButtonElement>('[data-review-target-row][data-review-grade-profile="anki"] [data-action="grade"]')]
            .map(button => [button.textContent?.trim(), button.dataset.gradeKey])).toEqual([['Again', '1'], ['Hard', '2'], ['Good', '3'], ['Easy', '4']]);
        selectPopoverReviewTarget('jpdb');
        expectJpdbAndAnkiGradeRows('standard', 'jpdb', undefined);
        expect(popoverGradeTargetText()).toBe('Grades JPDB');
    });

    it('renders an Add to Anki pill for trusted Anki misses', () => {
        const html = renderWordPills({
            card,
            jpdbUrl: 'https://jpdb.io/vocabulary/1',
            settings: {
                ...DEFAULT_SETTINGS,
                interfaceLanguage: 'en',
                ankiEnabled: true,
                dictionaryLookupLinks: defaultDictionaryLookupLinks('local'),
            },
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
            isJpdbBackedCard: () => true,
            dictionaryLabel: name => name,
            trustedAccountDataSurface: true,
        });

        expect(html).toContain('jpdb-reader-anki-pill');
        expect(html).toContain('data-action="anki"');
        expect(html).toContain('title="Add to Anki"');
        expect(html).toContain('>Anki ');
        expect(html).not.toContain('--chip-');
    });

    it('hides the Anki pill while lookup state is untrusted or the pill is scoped to kanji', () => {
        const base: Parameters<typeof renderWordPills>[0] = {
            card,
            jpdbUrl: 'https://jpdb.io/vocabulary/1',
            settings: {
                ...DEFAULT_SETTINGS,
                interfaceLanguage: 'en',
                ankiEnabled: true,
                dictionaryLookupLinks: defaultDictionaryLookupLinks('local'),
            },
            ankiLookup: { state: 'not-in-deck' as const, notes: [], primary: null, trusted: false },
            isJpdbBackedCard: () => true,
            dictionaryLabel: (name: string) => name,
        };

        expect(renderWordPills(base)).not.toContain('jpdb-reader-anki-pill');
        expect(renderWordPills({ ...base, overrideQuery: '読', ankiLookup: { state: 'not-in-deck', notes: [], primary: null } })).not.toContain('jpdb-reader-anki-pill');
    });

    it('uses the hosted new-tab review fallback when a dictionary card is gradeable outside JPDB API lookup', () => {
        const renderer = new CardPopoverRenderer({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                enableReviews: true,
            }),
            isJpdbBackedCard: () => false,
            renderWordHistory: () => '',
            renderWordPills: () => '',
            renderDefinitionSources: () => '',
            dictionarySourceAttributes: () => '',
            dictionaryLabel: name => name,
            accountDataSurfaceTrusted: () => true,
            renderReviewButtonsFallback: () => ({ gutter: '', buttons: '<div data-fallback-review><button data-action="grade" data-grade="pass">Pass</button></div>' }),
        });

        const html = renderer.render({ ...card, reviewSource: 'jpdb-live' }, '漢字です。', 'modal', {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            loading: false,
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
        });

        expect(html).toContain('data-fallback-review');
        expect(html).toContain('data-action="grade"');
    });

    it('renders unfamiliar Anki notes from their rendered card without exposing raw fields by default', () => {
        const renderer = testCardPopoverRenderer({
            ankiEnabled: true,
            ankiSectionEnabled: true,
        });

        document.body.innerHTML = renderer.render({ ...card, spelling: '女', reading: 'おんな' }, '女の人です。', 'modal', {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: {
                state: 'due',
                notes: [],
                primary: {
                    noteId: 168,
                    primaryCardId: 167,
                    cardIds: [167],
                    state: 'due',
                    deckNames: ['Vocab 2k'],
                    modelName: 'Imported Vocab',
                    fields: {
                        EXPRESSION: '女',
                        READINGS: 'おんな, おみな, おうな, うみな, おな',
                        TRANSLATION_1: 'raw stored gloss should stay hidden',
                        RESTRICTION_1: '',
                        TRANSLATION_2: 'raw alternate stored gloss should stay hidden',
                        AUDIO: '[sound:h2k-167.mp3]',
                    },
                    renderedCards: [{
                        cardId: 167,
                        deckName: 'Vocab 2k',
                        question: '<div class="front">女 <img src="front.png" onerror="window.bad = true"> [anki:play:q:0]<script>window.bad = true</script></div>',
                        answer: '<div><strong>female</strong> [anki:play:a:0]<a href="javascript:bad()">bad link</a></div>',
                        mediaDataUrls: { 'front.png': 'data:image/png;base64,front-data' },
                    }],
                    tags: [],
                    reps: 2,
                    lapses: 0,
                },
            },
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            loading: false,
        });

        const preview = document.querySelector<HTMLElement>('.jpdb-reader-anki-card-preview')!;

        expect(preview.textContent).toContain('女');
        expect(preview.querySelector('.jpdb-reader-anki-stored-fields')).toBeNull();
        expect(preview.querySelector('.jpdb-reader-anki-field')).toBeNull();
        expect(preview.textContent).not.toContain('READINGS');
        expect(preview.textContent).not.toContain('TRANSLATION_1');
        expect(preview.textContent).not.toContain('raw stored gloss should stay hidden');
        expect(preview.textContent).not.toContain('raw alternate stored gloss should stay hidden');
        expect(preview.textContent).not.toContain('Front');
        expect(preview.textContent).not.toContain('Back');
        expect(preview.textContent).not.toContain('Card audio');
        expect(preview.querySelector('.jpdb-reader-anki-rendered-side-body')?.textContent).toContain('女');
        expect(preview.querySelector('.jpdb-reader-anki-rendered-side-body')?.classList.contains('jpdb-reader-parseable')).toBe(true);
        expect(preview.querySelector<HTMLImageElement>('.jpdb-reader-anki-rendered-side-body img')?.getAttribute('src')).toBe('data:image/png;base64,front-data');
        expect(preview.querySelector<HTMLImageElement>('.jpdb-reader-anki-rendered-side-body img')?.getAttribute('data-anki-media-name')).toBe('front.png');
        expect(preview.querySelector('.jpdb-reader-anki-rendered-side-body img')?.getAttribute('onerror')).toBeNull();
        expect(preview.textContent).not.toContain('[anki:play');
        expect(preview.querySelectorAll('.jpdb-reader-anki-playback-marker')).toHaveLength(2);
        expect(preview.querySelector<HTMLButtonElement>('.jpdb-reader-anki-playback-marker')?.dataset.ankiMediaName).toBe('h2k-167.mp3');
        expect(preview.querySelector<HTMLButtonElement>('.jpdb-reader-anki-playback-marker')?.title).toBe('Anki audio h2k-167.mp3');
        expect(preview.querySelector<HTMLButtonElement>('[data-action="anki-media-audio"]')?.tagName).toBe('BUTTON');
        expect(preview.querySelector<HTMLButtonElement>('[data-action="anki-media-audio"]')?.classList.contains('jpdb-reader-audio-control')).toBe(true);
        expect(preview.innerHTML).not.toContain('<script');
        expect(preview.innerHTML).not.toContain('javascript:bad');
    });

});
