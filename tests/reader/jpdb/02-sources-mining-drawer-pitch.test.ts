import { describe, expect, it, vi } from 'vitest';
import {
    registerReaderHelpersCleanup,
    AnkiConnectClient,
    CardPopoverRenderer,
    DEFAULT_SETTINGS,
    DictionarySourceStateController,
    IMMERSION_KIT_SOURCE_ID,
    KANJI_CSS,
    NEW_TAB_PAGE_URL,
    POPOVER_CORE_CSS,
    ReaderApp,
    card,
    defaultDictionaryLookupLinks,
    definitionSourceStateKey,
    emptyCardRenderData,
    jitenTestCard,
    popoverGradeButtons,
    popoverGradeTargetCurrentText,
    popoverGradeTargetOptions,
    popoverGradeTargetText,
    readFileSync,
    readerMetaText,
    readerWordSurfaceText,
    readingTestCard,
    renderModalCard,
    renderWordPills,
    settingsJapaneseParserFixture,
    sourceSummaryClickFixture,
    testAnkiExistingNote,
    testAnkiLookup,
    testCardActionController,
    testCardPopoverRenderer,
    testCardPopoverRendererWithWordPills,
    testJitenAudioActionController,
    TEST_JITEN_AUDIO_URLS,
    performTestJitenAudioAction,
    testIsJpdbBackedCard,
    updatePopoverReviewTargetSelection,
} from './fixtures';
import type {
    AnkiLookupResult,
    JPDBCard,
} from './fixtures';
import { setInnerHtml } from '../../../src/reader/dom';

registerReaderHelpersCleanup();

function expectAnkiGradeButtons(cardId: string): void {
    const buttons = popoverGradeButtons();
    expect(buttons).toHaveLength(5);
    expect(buttons.map(button => button.dataset.reviewTarget)).toEqual(Array(5).fill('anki'));
    expect(buttons.map(button => button.dataset.ankiCardId)).toEqual(Array(5).fill(cardId));
}

describe('reader helpers', () => {
    it('does not parse settings help and status rows as reading text', async () => {
        const { app, form, parseJapanese, internals } = settingsJapaneseParserFixture({
            spelling: '公開',
            reading: 'こうかい',
            vid: 8642,
        });

        try {
            await internals.parseSettingsJapanese(form);

            const parsedTexts = parseJapanese.mock.calls[0]?.[0] ?? [];
            expect(parsedTexts.join('\n')).not.toContain('公開検索は使えます');
            expect(form.querySelector('[data-jpdb-status] .jpdb-reader-word')).toBeNull();
            expect(form.querySelector('[data-jpdb-status] rt')).toBeNull();
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('leaves source summary clicks to native details toggling even when tracking is installed twice', () => {
        const { click } = sourceSummaryClickFixture(`
            <details class="jpdb-reader-local jpdb-reader-source-card" data-source-state-key="definition-source:test" data-source-initial-open="true" open>
                <summary class="jpdb-reader-local-title">Test</summary>
                <p>Definition</p>
            </details>
        `, 2);

        expect(click.defaultPrevented).toBe(false);
    });

    it('still blocks empty immersion source summary toggles', () => {
        const { click } = sourceSummaryClickFixture(`
            <details class="jpdb-reader-local jpdb-reader-source-card" data-source-state-key="definition-source:immersion" data-source-initial-open="false" data-immersion-empty="true">
                <summary class="jpdb-reader-local-title">Immersion</summary>
            </details>
        `);

        expect(click.defaultPrevented).toBe(true);
    });

    it('keeps enhanced Immersion Kit source labels out of stretched flex summary layout', () => {
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.innerHTML = `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-immersion" data-immersion-kit>
                <summary class="jpdb-reader-local-title">
                    <span class="jpdb-reader-word">イ</span><span class="jpdb-reader-word">マージ</span><span class="jpdb-reader-word">ョ</span><span class="jpdb-reader-word">ン</span><span class="jpdb-reader-word">キット</span>
                </summary>
                <div class="jpdb-reader-help">Loading examples...</div>
            </details>
        `;
        document.body.append(popover);

        try {
            const summary = popover.querySelector<HTMLElement>('summary.jpdb-reader-local-title')!;
            expect(Array.from(summary.children).filter(child => child.matches('.jpdb-reader-word'))).toHaveLength(5);
            expect(readerWordSurfaceText(summary).trim()).toBe('イマージョンキット');
            expect(summary.textContent?.replace(/\s+/g, '')).toContain('イマージョンキット');
            const sourceCss = readFileSync('src/reader/styles/local-dictionaries.css', 'utf8');
            const sourceSummaryRule = sourceCss.match(/\.jpdb-reader-source-card > summary\.jpdb-reader-local-title,[\s\S]*?list-style: none;\n}/)?.[0] ?? '';
            expect(sourceSummaryRule).toContain('display: block;');
            expect(sourceSummaryRule).toContain('padding: 6px 32px 6px 0;');
            expect(sourceSummaryRule).not.toContain('justify-content: space-between;');
            expect(sourceCss).toContain('position: absolute;');
            expect(sourceCss).toContain('inset-inline-end: 0;');
        } finally {
            popover.remove();
        }
    });

    it('remembers collapsed source state for later renders', () => {
        const onStateChange = vi.fn();
        const popover = document.createElement('div');
        popover.innerHTML = `
            <details class="jpdb-reader-local jpdb-reader-source-card" data-source-state-key="definition-source:translation" data-source-initial-open="true" open>
                <summary class="jpdb-reader-local-title">Translation</summary>
                <p>Definition</p>
            </details>
        `;
        const controller = new DictionarySourceStateController({
            getSettings: () => DEFAULT_SETTINGS,
            onStateChange,
        });

        controller.installTracking(popover);
        const details = popover.querySelector<HTMLDetailsElement>('details')!;
        details.open = false;
        details.dispatchEvent(new Event('toggle', { bubbles: true }));

        expect(onStateChange).toHaveBeenCalledTimes(1);
        expect(controller.isOpen('definition-source:translation')).toBe(false);
        const attributes = controller.attributes('definition-source:translation');
        expect(attributes).toContain('data-source-initial-open="false"');
        expect(attributes).not.toContain(' open');
    });

    it('renders Immersion Kit mounts through the shared dictionary source state', () => {
        localStorage.removeItem('jpdb-reader-source-open-state');
        const app = new ReaderApp();
        const settings = {
            ...DEFAULT_SETTINGS,
            immersionKitEnabled: true,
            dictionarySourcesInitiallyExpanded: true,
            jpdbDefinitionsEnabled: false,
            studyTranslationEnabled: false,
            studyGrammarEnabled: false,
        };
        const internals = app as unknown as {
            settings: typeof settings;
            dictionarySourceState: DictionarySourceStateController;
            renderDefinitionSources(card: JPDBCard, entries: never[], sentence?: string): string;
            renderKanjiImmersionKitMount(): string;
        };
        internals.settings = settings;

        try {
            const root = document.createElement('div');
            root.innerHTML = internals.renderDefinitionSources(card, []);
            const details = root.querySelector<HTMLDetailsElement>('[data-immersion-kit]');

            expect(details?.dataset.sourceStateKey).toBe(definitionSourceStateKey(IMMERSION_KIT_SOURCE_ID));
            expect(details?.dataset.sourceInitialOpen).toBe('false');
            expect(details?.open).toBe(false);

            internals.dictionarySourceState.installTracking(root);
            details!.open = true;
            details!.dispatchEvent(new Event('toggle', { bubbles: true }));

            const opened = document.createElement('div');
            opened.innerHTML = internals.renderDefinitionSources(card, []);
            const openedDetails = opened.querySelector<HTMLDetailsElement>('[data-immersion-kit]');

            expect(openedDetails?.dataset.sourceInitialOpen).toBe('true');
            expect(openedDetails?.open).toBe(true);

            details!.open = false;
            details!.dispatchEvent(new Event('toggle', { bubbles: true }));

            const rerendered = document.createElement('div');
            rerendered.innerHTML = internals.renderDefinitionSources(card, []);
            const rerenderedDetails = rerendered.querySelector<HTMLDetailsElement>('[data-immersion-kit]');

            expect(rerenderedDetails?.dataset.sourceInitialOpen).toBe('false');
            expect(rerenderedDetails?.open).toBe(false);
            expect(internals.renderKanjiImmersionKitMount()).toContain('data-source-initial-open="false"');
        } finally {
            app.destroy();
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-source-open-state');
        }
    });

    it('keeps working remote definitions free of repeated dictionary setup nags', () => {
        const app = new ReaderApp();
        const settings = {
            ...DEFAULT_SETTINGS,
            localDictionariesEnabled: true,
            jpdbDefinitionsEnabled: true,
            jitenDefinitionsEnabled: false,
            bunproDefinitionsEnabled: false,
            wanikaniDefinitionsEnabled: false,
            ankiSectionEnabled: false,
            studyTranslationEnabled: false,
            studyGrammarEnabled: false,
            immersionKitEnabled: false,
        };
        const internals = app as unknown as {
            settings: typeof settings;
            renderDefinitionSources(card: JPDBCard, entries: never[]): string;
        };
        internals.settings = settings;

        try {
            const html = internals.renderDefinitionSources({
                ...card,
                source: 'jpdb',
                meanings: [{ glosses: ['to eat'], partOfSpeech: ['v1'] }],
            }, []);

            expect(html).toContain('data-source="jpdb"');
            expect(html).not.toContain('data-yomu-finish-setup');
            expect(html).not.toContain('Finish setup');
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('renders the mining drawer affordance as a bar instead of text', () => {
        const settings = {
            apiKey: 'test-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
        };
        const renderer = testCardPopoverRenderer(settings);

        const html = renderModalCard(renderer, card, '食べる。');

        expect(html).toContain('jpdb-reader-mining-drawer-handle');
        expect(html).toContain('aria-label="Show mining actions"');
        expect(html).not.toContain('>+</button>');
        expect(KANJI_CSS).toContain('.jpdb-reader-mining-collapse::before');
        const normalizedKanjiCss = KANJI_CSS.replace(/\s+/g, ' ');
        const normalizedPopoverCss = POPOVER_CORE_CSS.replace(/\s+/g, ' ');
        expect(normalizedPopoverCss).toContain('.jpdb-reader-popover .jpdb-reader-icon-btn, .jpdb-reader-settings .jpdb-reader-icon-btn, .jpdb-reader-icon-btn {');
        expect(normalizedPopoverCss).toContain('.jpdb-reader-popover .jpdb-reader-icon-btn svg, .jpdb-reader-settings .jpdb-reader-icon-btn svg, .jpdb-reader-icon-btn svg {');
        expect(normalizedKanjiCss).toContain('.jpdb-reader-actions .jpdb-reader-mining-collapse, .jpdb-reader-mining-collapse {');
        expect(normalizedKanjiCss).toContain('.jpdb-reader-actions .jpdb-reader-mining-collapse::before, .jpdb-reader-mining-collapse::before {');
        expect(normalizedKanjiCss).toContain('.jpdb-reader-mining-collapse::after { content: ""; position: absolute; inset: -16px 0 0; border-radius: 999px; }');
        expect(normalizedKanjiCss).not.toContain('.jpdb-reader-actions-has-mining { padding-top: 45px; }');
        expect(normalizedPopoverCss).toContain('.jpdb-reader-popover.jpdb-reader-sheet:has(.jpdb-reader-popover-body) .jpdb-reader-actions.jpdb-reader-actions-has-mining { padding-top: 31px; }');
    });

    it('marks the card headword with its pitch class so it can show the pitch underline', () => {
        const renderer = testCardPopoverRenderer({ showPitchAccent: true });
        document.body.innerHTML = renderModalCard(renderer, card, '食べる。');
        const spelling = document.querySelector<HTMLElement>('.jpdb-reader-spelling')!;
        // card fixture: pitchAccent ['LHH'] over たべる => heiban.
        expect(spelling.dataset.pitchClass).toBe('heiban');
        expect(spelling.classList.contains('jpdb-pitch-heiban')).toBe(true);
    });

    it('renders compound components as nested dictionary lookup links', () => {
        const renderer = testCardPopoverRenderer();
        document.body.innerHTML = renderModalCard(renderer, {
            ...card,
            spelling: '跳梁跋扈',
            reading: 'ちょうりょうばっこ',
            pitchAccent: [],
        }, '跳梁跋扈だ。', {
            expressionComponents: [
                { text: '跳梁', reading: 'ちょうりょう' },
                { text: '跋扈', reading: 'ばっこ' },
            ],
            componentPitches: [
                { text: '跳梁', reading: 'ちょうりょう', pitch: 'LHHHHH' },
                { text: '跋扈', reading: 'ばっこ', pitch: 'HLL' },
            ],
        });

        const section = document.querySelector<HTMLElement>('.jpdb-reader-expression-components')!;
        const links = [...section.querySelectorAll<HTMLAnchorElement>('a.gloss-link[data-dictionary-lookup]')];
        const words = [...section.querySelectorAll<HTMLElement>('.jpdb-reader-expression-component-term')];
        // The redesigned breakdown drops the "Composed of" label/collapse: the
        // section is a borderless div of tappable component chips.
        expect(section.tagName).toBe('DIV');
        expect(section.querySelector('summary')).toBeNull();
        expect(links.map(link => link.dataset.dictionaryLookup)).toEqual(['跳梁', '跋扈']);
        expect(links.map(link => link.dataset.dictionaryReading)).toEqual(['ちょうりょう', 'ばっこ']);
        expect(words.map(word => word.dataset.expression)).toEqual(['跳梁', '跋扈']);
        expect(words.map(word => word.dataset.pitchClass)).toEqual(['heiban', 'atamadaka']);
        expect(words.map(word => word.querySelector('.jpdb-reader-furi')?.textContent)).toEqual(['ちょうりょう', 'ばっこ']);
    });

    it('renders furigana on the popup headword without losing inline kanji navigation', () => {
        const renderer = testCardPopoverRenderer({
            showFurigana: true,
            furiganaMode: 'all',
        });
        document.body.innerHTML = renderModalCard(renderer, {
            ...card,
            spelling: '大変',
            reading: 'たいへん',
            wordWithReading: '大[たい]変[へん]',
            frequencyRank: 800,
            cardState: ['not-in-deck'],
            pitchAccent: [],
        }, '大変です。');

        const spelling = document.querySelector<HTMLElement>('.jpdb-reader-spelling')!;
        const furi = [...spelling.querySelectorAll('rt.jpdb-reader-furi')].map(rt => rt.textContent);
        const kanjiButtons = [...spelling.querySelectorAll<HTMLButtonElement>('.jpdb-reader-kanji-inline')];

        expect(furi).toEqual(['たい', 'へん']);
        expect(kanjiButtons.map(button => button.dataset.kanji)).toEqual(['大', '変']);
        expect(spelling.querySelector('ruby .jpdb-reader-kanji-inline[data-kanji="大"]')).not.toBeNull();
        expect(spelling.querySelector('ruby .jpdb-reader-kanji-inline[data-kanji="変"]')).not.toBeNull();
        expect(document.querySelector('.jpdb-reader-meta-reading')).toBeNull();
    });

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

    it('labels mobile Anki fallback actions with the target app and new-note limitation', () => {
        const originalUserAgent = navigator.userAgent;
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'test-key',
            jpdbMiningEnabled: true,
            ankiEnabled: true,
            ankiMobileHandoff: true,
        };
        const renderer = testCardPopoverRenderer(settings);
        const render = (lookup: AnkiLookupResult = { state: 'not-in-deck', notes: [], primary: null, trusted: false }) => renderer.render(card, '食べる。', 'modal', {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: lookup,
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            loading: false,
        });

        try {
            Object.defineProperty(window.navigator, 'userAgent', {
                value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
                configurable: true,
            });
            document.body.innerHTML = render();
            expect(document.querySelector<HTMLButtonElement>('[data-action="anki"]')?.textContent).toBe('Send to AnkiMobile');
            expect(document.querySelector('.jpdb-reader-anki-handoff-hint')).toBeNull();
            document.body.innerHTML = render({ state: 'not-in-deck', notes: [], primary: null, trusted: true });
            expect(document.querySelector<HTMLButtonElement>('[data-action="anki"]')?.textContent).toBe('Send to AnkiMobile');
            expect(document.querySelector('.jpdb-reader-anki-handoff-hint')).toBeNull();

            Object.defineProperty(window.navigator, 'userAgent', {
                value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
                configurable: true,
            });
            document.body.innerHTML = render();
            expect(document.querySelector<HTMLButtonElement>('[data-action="anki"]')?.textContent).toBe('Send to AnkiDroid');
            expect(document.querySelector('.jpdb-reader-anki-handoff-hint')).toBeNull();
        } finally {
            Object.defineProperty(window.navigator, 'userAgent', { value: originalUserAgent, configurable: true });
            document.body.innerHTML = '';
        }
    });

    it('shows cached Anki status instead of a permanent loading message when card details time out', () => {
        const renderer = testCardPopoverRenderer({
            ankiEnabled: true,
            ankiSectionEnabled: true,
            jpdbDefinitionsEnabled: false,
            studyTranslationEnabled: false,
            studyGrammarEnabled: false,
            immersionKitEnabled: false,
        });
        const statusOnly: AnkiLookupResult = {
            state: 'new',
            notes: [],
            primary: {
                noteId: 55,
                modelName: 'Imported Core',
                deckNames: ['Vocab 2k'],
                cardIds: [7701],
                primaryCardId: 7701,
                state: 'new',
                fields: {},
                detailsUnavailable: true,
                tags: [],
                reps: 0,
                lapses: 0,
            },
        };
        statusOnly.notes = [statusOnly.primary!];

        document.body.innerHTML = renderModalCard(renderer, card, '食べる。', { ankiLookup: statusOnly });

        expect(document.querySelector('.jpdb-reader-anki-details-pending')?.textContent)
            .toContain('showing cached status');
        expect(document.querySelector('.jpdb-reader-anki-details-pending')?.textContent)
            .not.toContain('Loading card details');
    });

    it('previews the Anki note fields before adding a new card', () => {
        const renderer = testCardPopoverRenderer({
            ankiEnabled: true,
            ankiSectionEnabled: true,
            ankiDeck: 'Mining',
            ankiModel: 'Japanese',
        });

        document.body.innerHTML = renderModalCard(renderer, readingTestCard(), '今日は本を読む。');

        const preview = document.querySelector<HTMLElement>('.jpdb-reader-anki-new .jpdb-reader-anki-card-preview')!;
        const summary = document.querySelector<HTMLElement>('.jpdb-reader-anki-new summary small')!;

        expect(summary.textContent).toBe('New card · Mining · Japanese');
        expect(preview.textContent).toContain('Expression');
        expect(preview.textContent).toContain('読む');
        expect(preview.textContent).toContain('Sentence');
        expect(preview.textContent).toContain('今日は本を');
        expect(preview.textContent).not.toContain('yomu-highlight');
        expect(preview.textContent).toContain('Meaning');
        expect(preview.querySelector('.yomu-highlight')?.textContent).toBe('読む');
        expect(preview.querySelector('.yomu-definition')?.textContent).toContain('to read');
        expect(document.querySelector<HTMLButtonElement>('[data-action="anki"]')).not.toBeNull();
    });

    it('previews configured Anki field mappings before adding a custom note type card', () => {
        const renderer = testCardPopoverRenderer({
            ankiEnabled: true,
            ankiSectionEnabled: true,
            ankiDeck: 'Mining',
            ankiModel: 'Ambiguous Japanese',
            ankiFieldMappings: {
                'Ambiguous Japanese': {
                    expression: 'Back',
                    reading: 'Kana Field',
                    meaning: 'Front',
                    sentence: 'Sentence Slot',
                },
            },
        });

        document.body.innerHTML = renderModalCard(renderer, readingTestCard(), '今日は本を読む。');

        const preview = document.querySelector<HTMLElement>('.jpdb-reader-anki-new .jpdb-reader-anki-card-preview')!;
        const labels = [...preview.querySelectorAll<HTMLElement>('.jpdb-reader-anki-field strong')]
            .map(label => label.textContent);

        expect(document.querySelector<HTMLElement>('.jpdb-reader-anki-new summary small')?.textContent)
            .toBe('New card · Mining · Ambiguous Japanese');
        expect(labels).toEqual(['Back', 'Kana Field', 'Front', 'Sentence Slot']);
        expect(labels).not.toContain('Expression');
        expect(labels).not.toContain('Reading');
        expect(labels).not.toContain('Meaning');
        expect(labels).not.toContain('Sentence');
        expect(preview.textContent).toContain('読む');
        expect(preview.textContent).toContain('よむ');
        expect(preview.textContent).toContain('to read');
    });

    it('renders popup title kanji as immediate kanji lookup buttons', () => {
        const renderer = testCardPopoverRenderer();

        document.body.innerHTML = renderer.render({
            ...card,
            spelling: '漢語',
            reading: 'かんご',
            cardState: ['known'],
        }, '漢語です。', 'modal', {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            loading: false,
        });
        const spelling = document.querySelector<HTMLElement>('.jpdb-reader-spelling')!;
        const kanjiButtons = [...document.querySelectorAll<HTMLElement>('.jpdb-reader-spelling .jpdb-reader-kanji-inline')];

        expect(spelling.classList.contains('jpdb-reader-parseable')).toBe(false);
        expect(readerWordSurfaceText(spelling)).toBe('漢語');
        expect(kanjiButtons.map(button => button.dataset.kanji)).toEqual(['漢', '語']);
        expect(kanjiButtons.map(button => button.dataset.action)).toEqual(['kanji', 'kanji']);
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
        expect(html).toContain('data-action="deck-picker"');
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
        expect(html).toContain('data-action="deck-picker"');
        expect(html).toContain('data-deck-source="bunpro"');
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
        expect(html).toContain('data-deck-source="bunpro"');
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
        expect(jpdbOnly).toContain('Show mining actions');
        expect(jpdbOnly).toContain('data-action="deck-picker"');
        expect(jpdbOnly).not.toContain('This JPDB card is locked');
        const container = document.createElement('div');
        container.innerHTML = jpdbOnly;
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
        expect(container.querySelector<HTMLSelectElement>('[data-add-deck-select]')?.hidden).toBe(true);

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

        document.body.innerHTML = renderModalCard(renderer, { ...card, cardState: ['due'] }, '動画を見る。', {
            ankiLookup: testAnkiLookup(),
        });

        const metaText = document.querySelector('.jpdb-reader-meta')?.textContent ?? '';
        const gradeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-action="grade"]')];

        expect(metaText).toContain('JPDB Due');
        expect(metaText).toContain('Anki Known');
        expect(document.querySelector('.jpdb-reader-meta .jpdb-reader-state-dot.jpdb-due')).not.toBeNull();
        expect(document.querySelector('.jpdb-reader-meta .jpdb-reader-state-dot.anki-known')).not.toBeNull();
        expect(document.querySelector('.jpdb-reader-anki-existing summary small')?.textContent).toBe('Known · Anime::Mining · 8 reviews, 1 lapse');
        expect(gradeButtons).toHaveLength(5);
        expect(gradeButtons.every(button => button.dataset.reviewTarget === 'both')).toBe(true);
        expect(gradeButtons.every(button => button.dataset.ankiCardId === '777')).toBe(true);
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
    });

    it('hides the reading chip when it just repeats a kana-only headword', () => {
        const renderer = testCardPopoverRenderer({
            apiKey: 'test-key',
            jpdbMiningEnabled: true,
            ankiEnabled: true,
            ankiSectionEnabled: true,
            enableReviews: true,
        });

        document.body.innerHTML = renderModalCard(renderer, {
            ...card,
            spelling: 'よむ',
            reading: 'よむ',
            frequencyRank: 20200,
            cardState: ['redundant'],
        }, 'よむ。', {
            ankiLookup: testAnkiLookup({
                primary: testAnkiExistingNote({
                    noteId: 56,
                    primaryCardId: 778,
                    cardIds: [778],
                    state: 'due',
                    deckNames: ['Mining'],
                    fields: { Word: 'よむ', Reading: 'よむ' },
                    reps: 3,
                    lapses: 0,
                }),
            }),
        });

        const meta = document.querySelector<HTMLElement>('.jpdb-reader-meta')!;
        const metaItems = [...meta.children].map(child => child.textContent?.trim() ?? '');

        expect(metaItems).toEqual(['JPDB Redundant', 'Anki Due']);
        expect(meta.querySelector('.jpdb-reader-meta-reading')).toBeNull();
        expect(meta.querySelector('.jpdb-reader-state-dot.jpdb-redundant')).not.toBeNull();
        expect(meta.querySelector('.jpdb-reader-state-dot.anki-due')).not.toBeNull();
        expect(document.querySelector('.jpdb-reader-reading')).toBeNull();
    });

    it('suppresses duplicate reading metadata when the headword has visible furigana', () => {
        const renderer = testCardPopoverRenderer({
            apiKey: 'test-key',
            showFurigana: true,
            furiganaMode: 'all',
        });

        document.body.innerHTML = renderModalCard(renderer, {
            ...card,
            spelling: '学習能力',
            reading: 'がくしゅうのうりょく',
            frequencyRank: 32900,
            cardState: ['new'],
            pitchAccent: [],
        }, '学習能力を伸ばす。');

        expect(document.querySelector('.jpdb-reader-meta-reading')).toBeNull();
        expect(document.querySelector('.jpdb-reader-meta')?.textContent).toBe('JPDB New');
    });

    it('shows Academy due state with the same SRS swatch used by external providers', () => {
        const renderer = testCardPopoverRenderer({
            apiKey: '',
            jitenApiKey: '',
            yomuLocalSrsEnabled: true,
        });

        document.body.innerHTML = renderModalCard(renderer, {
            ...card,
            source: 'yomu-local',
            reviewSource: 'yomu-local',
            frequencyRank: 400,
            cardState: ['due'],
        }, '説明する。');

        expect(document.querySelector('.jpdb-reader-provider-status')?.textContent).toBe('Academy Due');
        expect(document.querySelector('.jpdb-reader-provider-status .jpdb-reader-state-dot.jpdb-due')).not.toBeNull();
        expect(document.querySelector('.jpdb-reader-meta')?.textContent).not.toContain('#400');
    });

    it('suppresses alternate reading metadata when wordWithReading renders as headword ruby', () => {
        const renderer = testCardPopoverRenderer({
            apiKey: 'test-key',
            showFurigana: true,
            furiganaMode: 'all',
        });

        document.body.innerHTML = renderModalCard(renderer, {
            ...card,
            spelling: '人気',
            reading: '人気',
            wordWithReading: '人気[にんき]',
            frequencyRank: 800,
            cardState: ['new'],
            pitchAccent: [],
        }, '人気がある。');

        expect(document.querySelector('.jpdb-reader-spelling rt.jpdb-reader-furi')?.textContent).toBe('にんき');
        expect(document.querySelector('.jpdb-reader-meta-reading')).toBeNull();
        expect(document.querySelector('.jpdb-reader-meta')?.textContent).toBe('JPDB New');
    });

    it('renders headword furigana even when known-status mode hides in-page furigana', () => {
        const renderer = testCardPopoverRenderer({
            apiKey: 'test-key',
            showFurigana: true,
            furiganaMode: 'known-status',
        });

        document.body.innerHTML = renderModalCard(renderer, {
            ...card,
            spelling: '人間',
            reading: 'にんげん',
            frequencyRank: 500,
            cardState: ['known'],
            pitchAccent: [],
        }, '人間だ。');

        expect(document.querySelector('.jpdb-reader-spelling rt.jpdb-reader-furi')?.textContent).toBe('にんげん');
        expect(document.querySelector('.jpdb-reader-meta-reading')).toBeNull();
    });

    it('does not append a loose hiragana reading after katakana headwords', () => {
        const renderer = testCardPopoverRenderer({
            apiKey: 'test-key',
            showFurigana: true,
            furiganaMode: 'all',
        });

        document.body.innerHTML = renderModalCard(renderer, {
            ...card,
            spelling: 'カメラ',
            reading: 'かめら',
            frequencyRank: 900,
            cardState: ['new'],
            pitchAccent: [],
        }, 'カメラを買う。');

        expect(document.querySelector('.jpdb-reader-spelling rt.jpdb-reader-furi')).toBeNull();
        expect(document.querySelector('.jpdb-reader-meta-reading')).toBeNull();
    });

    it('keeps headword ruby visible instead of appending alternate reading metadata', () => {
        const renderer = testCardPopoverRenderer({
            apiKey: 'test-key',
            showFurigana: false,
            furiganaMode: 'off',
        });

        document.body.innerHTML = renderModalCard(renderer, {
            ...card,
            spelling: '人気',
            reading: '人気',
            wordWithReading: '人気[にんき]',
            frequencyRank: 800,
            cardState: ['new'],
            pitchAccent: [],
        }, '人気がある。');

        expect(document.querySelector('.jpdb-reader-spelling rt.jpdb-reader-furi')?.textContent).toBe('にんき');
        expect(document.querySelector('.jpdb-reader-meta-reading')).toBeNull();
        expect(document.querySelector('.jpdb-reader-meta')?.textContent).toBe('JPDB New');
    });

    it('shows separate JPDB and Anki status when JPDB is not in deck but Anki exists', () => {
        const renderer = testCardPopoverRenderer({
            apiKey: 'test-key',
            jpdbMiningEnabled: true,
            ankiEnabled: true,
            ankiSectionEnabled: true,
            enableReviews: true,
        });

        document.body.innerHTML = renderModalCard(renderer, { ...card, cardState: ['not-in-deck'] }, '動画を見る。', {
            ankiLookup: testAnkiLookup(),
        });

        const metaText = document.querySelector('.jpdb-reader-meta')?.textContent ?? '';
        const gradeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-action="grade"]')];

        expect(metaText).toContain('JPDB Not in deck');
        expect(metaText).toContain('Anki Known');
        expect(gradeButtons).toHaveLength(5);
        expect(gradeButtons.every(button => button.dataset.reviewTarget === 'both')).toBe(true);
        expect(gradeButtons.every(button => button.dataset.ankiCardId === '777')).toBe(true);
        expect(popoverGradeTargetOptions()).toEqual([
            { text: 'Both', target: 'both', cardId: '777', selected: true },
            { text: 'JPDB', target: 'jpdb', cardId: '', selected: false },
            { text: 'Anime::Mining #777', target: 'anki', cardId: '777', selected: false },
        ]);
        expect(gradeButtons.every(button => button.title.includes('Review adds to deck'))).toBe(false);
    });

    it('hides JPDB status in the popup header until a JPDB API key is configured', () => {
        const renderer = testCardPopoverRenderer({
            apiKey: '',
            jpdbMiningEnabled: false,
            ankiEnabled: false,
        });

        document.body.innerHTML = renderModalCard(renderer, { ...card, cardState: ['due'] }, '動画を見る。');
        const metaText = readerMetaText();

        expect(metaText).not.toContain('JPDB Due');
        expect(document.querySelector('.jpdb-reader-meta .jpdb-reader-state-dot.jpdb-due')).toBeNull();
    });

    it('shows Anki status without showing JPDB status when JPDB has no API key', () => {
        const renderer = testCardPopoverRenderer({
            apiKey: '',
            jpdbMiningEnabled: false,
            ankiEnabled: true,
            ankiSectionEnabled: true,
            enableReviews: true,
        });

        document.body.innerHTML = renderModalCard(renderer, {
            ...card,
            spelling: '日本語',
            reading: 'にほんご',
            frequencyRank: 250,
            cardState: ['not-in-deck'],
        }, '日本語です。', {
            ankiLookup: testAnkiLookup({
                primary: testAnkiExistingNote({
                    state: 'due',
                    deckNames: ['Mining'],
                    fields: { Word: '日本語', Reading: 'にほんご' },
                }),
            }),
        });

        const meta = document.querySelector<HTMLElement>('.jpdb-reader-meta')!;
        const metaItems = [...meta.children].map(child => child.textContent?.trim() ?? '');

        expect(metaItems).toEqual(['Anki Due']);
        expect(document.querySelector('.jpdb-reader-spelling rt.jpdb-reader-furi')?.textContent).toBe('にほんご');
        expect(meta.querySelector('.jpdb-reader-state-dot.jpdb-not-in-deck')).toBeNull();
        expect(meta.querySelector('.jpdb-reader-state-dot.anki-due')).not.toBeNull();
        expect(document.querySelector('.jpdb-reader-reading')).toBeNull();
    });

    it('shows pooled JPDB deck membership as in deck', () => {
        const renderer = testCardPopoverRenderer({
            apiKey: 'test-key',
            jpdbMiningEnabled: true,
        });

        document.body.innerHTML = renderModalCard(renderer, { ...card, cardState: ['in-deck'] }, '日本語です。');
        const metaText = readerMetaText();

        expect(metaText).toContain('JPDB In deck');
        expect(metaText).not.toContain('Not in deck');
    });

    it('hides disconnected deck status and keeps live frequency in the lookup pill', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            interfaceLanguage: 'en' as const,
            apiKey: '',
            jpdbMiningEnabled: true,
            ankiEnabled: true,
        };
        const renderer = testCardPopoverRendererWithWordPills(settings);

        document.body.innerHTML = renderModalCard(renderer, { ...card, frequencyRank: 2600, cardState: ['not-in-deck'] }, '前後です。', {
            frequencyRanks: { jpdb: { provider: 'jpdb', rank: 2600, spelling: card.spelling, reading: card.reading, source: 'card' } },
        });
        const metaText = readerMetaText();

        expect(metaText).not.toContain('#2600');
        expect(document.querySelector('.jpdb-reader-meta .jpdb-reader-pill.jpdb-reader-frequency-pill')).toBeNull();
        const jpdbPill = document.querySelector<HTMLElement>('.jpdb-reader-heading .jpdb-reader-jpdb-pill');
        expect(jpdbPill?.textContent).toContain('JPDB #2600');
        expect((document.body.textContent?.match(/#2600/g) ?? []).length).toBe(1);
        expect(metaText).not.toContain('Not in deck');
        expect(metaText).not.toContain('Anki');
    });

    it('keeps local JPDB frequency in the JPDB lookup pill instead of duplicating a raw meta chip', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            interfaceLanguage: 'en' as const,
            apiKey: '',
            jpdbMiningEnabled: true,
        };
        const renderer = testCardPopoverRendererWithWordPills(settings);

        document.body.innerHTML = renderModalCard(renderer, {
            ...card,
            source: 'local',
            frequencyRank: 18447,
            cardState: ['not-in-deck'],
        }, '図鑑を読む。', {
            metaEntries: [{ expression: card.spelling, mode: 'freq', data: { frequency: 18447 }, dictionary: 'JPDBv2' }],
        });

        expect(document.querySelector('.jpdb-reader-meta .jpdb-reader-pill.jpdb-reader-frequency-pill')).toBeNull();
        const jpdbPill = document.querySelector<HTMLElement>('.jpdb-reader-heading .jpdb-reader-jpdb-pill');
        expect(jpdbPill?.textContent).toContain('JPDB #18447');
        expect((document.body.textContent?.match(/#18447/g) ?? []).length).toBe(1);
    });

    it('shows JPDB status in dictionary meta when the API key is active but writes are disabled', () => {
        const renderer = testCardPopoverRenderer({
            interfaceLanguage: 'en',
            apiKey: 'test-key',
            jpdbMiningEnabled: false,
        });

        document.body.innerHTML = renderer.render({ ...card, cardState: ['known'] }, '前後です。', 'modal', {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            loading: false,
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
        });

        const meta = document.querySelector<HTMLElement>('.jpdb-reader-meta')!;
        expect(meta.textContent).toContain('Known');
        expect(meta.querySelector('.jpdb-reader-state-dot.jpdb-known')).not.toBeNull();
    });

    it('hides the copy pill when the copy lookup link is disabled or absent', () => {
        const html = renderWordPills({
            card,
            jpdbUrl: 'https://jpdb.io/vocabulary/1',
            settings: {
                ...DEFAULT_SETTINGS,
                interfaceLanguage: 'en',
                dictionaryLookupLinks: [{
                    id: 'jpdb',
                    label: 'JPDB',
                    urlTemplate: 'https://jpdb.io/search?q={word}',
                    enabled: true,
                }],
            },
            isJpdbBackedCard: () => true,
            dictionaryLabel: name => name,
        });

        expect(html).not.toContain('jpdb-reader-copy-pill');
        expect(html).not.toContain('data-action="copy-word"');
        expect(html).toContain('--chip-bg:#2563c7');
    });

    it('renders the built-in lookup pills Yomu-first with their provider colors', () => {
        const html = renderWordPills({
            card,
            jpdbUrl: 'https://jpdb.io/vocabulary/1',
            settings: {
                ...DEFAULT_SETTINGS,
                interfaceLanguage: 'en',
                dictionaryLookupLinks: defaultDictionaryLookupLinks('local'),
            },
            isJpdbBackedCard: () => true,
            dictionaryLabel: name => name,
        });

        expect(html).toContain('>JPDB ');
        expect(html).toContain('>Jiten ');
        expect(html).toContain('>Yomu ');
        expect(html.indexOf('>Yomu ')).toBeLessThan(html.indexOf('>Jiten '));
        expect(html.indexOf('>Jiten ')).toBeLessThan(html.indexOf('>JPDB '));
        expect(html).not.toContain('>Jisho ');
        expect(html).toContain('>Copy ');
        expect(html).toContain('https://jiten.moe/parse?text=');
        expect(html).toContain(`${NEW_TAB_PAGE_URL}index.html?q=`);
        expect(html).toContain('--chip-bg:#b83280');
        expect(html).toContain('--chip-bg:#13845f');
        expect(html).not.toContain('>Immersion Kit ');
        expect(html).not.toContain('>Uchisen ');
    });

    it('merges the live Jiten frequency rank inline into the Jiten pill without duplicating a standalone meta pill', () => {
        const jitenCard = { ...card, source: 'jiten' as const, frequencyRank: 18447, pitchAccent: [] };
        const baseSettings = {
            ...DEFAULT_SETTINGS,
            interfaceLanguage: 'en' as const,
            dictionaryLookupLinks: defaultDictionaryLookupLinks('local'),
        };

        const merged = renderWordPills({
            card: jitenCard,
            jpdbUrl: 'https://jpdb.io/vocabulary/1',
            settings: baseSettings,
            frequencyRanks: { jiten: { provider: 'jiten', rank: 18447, spelling: jitenCard.spelling, reading: jitenCard.reading, source: 'card' } },
            isJpdbBackedCard: () => false,
            dictionaryLabel: name => name,
        });
        // Rank lives inside the Jiten link pill; no separate live-frequency pill.
        expect(merged).toContain('>Jiten #18447 ');
        expect(merged).not.toContain('data-frequency-source="live"');

        const split = renderWordPills({
            card: jitenCard,
            jpdbUrl: 'https://jpdb.io/vocabulary/1',
            settings: { ...baseSettings, showLookupPillFrequency: false },
            frequencyRanks: { jiten: { provider: 'jiten', rank: 18447, spelling: jitenCard.spelling, reading: jitenCard.reading, source: 'card' } },
            isJpdbBackedCard: () => false,
            dictionaryLabel: name => name,
        });
        // Toggle off removes the rank from the lookup pill instead of bringing
        // back a duplicate standalone frequency chip in the meta row.
        expect(split).not.toContain('data-frequency-source="live"');
        expect(split).not.toContain('>Jiten #18447');
    });

    it('does not render a standalone live rank when its sibling lookup pill is disabled', () => {
        const jitenCard = { ...card, source: 'jiten' as const, frequencyRank: 18447, pitchAccent: [] };
        const html = renderWordPills({
            card: jitenCard,
            jpdbUrl: 'https://jpdb.io/vocabulary/1',
            settings: {
                ...DEFAULT_SETTINGS,
                interfaceLanguage: 'en',
                // jiten-frequency enabled, but the jiten link pill that would carry it is off.
                dictionaryLookupLinks: defaultDictionaryLookupLinks('local').map(link => link.id === 'jiten' ? { ...link, enabled: false } : link),
            },
            frequencyRanks: { jiten: { provider: 'jiten', rank: 18447, spelling: jitenCard.spelling, reading: jitenCard.reading, source: 'card' } },
            isJpdbBackedCard: () => false,
            dictionaryLabel: name => name,
        });
        expect(html).not.toContain('data-frequency-source="live"');
        expect(html).not.toContain('>Jiten #18447');
    });

    it('does not weld the whole-word frequency rank onto a single-kanji lookup pill', () => {
        const jitenCard = { ...card, source: 'jiten' as const, frequencyRank: 18447, pitchAccent: [] };
        const html = renderWordPills({
            card: jitenCard,
            jpdbUrl: 'https://jpdb.io/vocabulary/1',
            settings: {
                ...DEFAULT_SETTINGS,
                interfaceLanguage: 'en',
                dictionaryLookupLinks: defaultDictionaryLookupLinks('local'),
            },
            overrideQuery: '食',
            frequencyRanks: { jiten: { provider: 'jiten', rank: 18447, spelling: jitenCard.spelling, reading: jitenCard.reading, source: 'card' } },
            isJpdbBackedCard: () => false,
            dictionaryLabel: name => name,
        });
        expect(html).not.toContain('#18447');
    });

    it('merges installed Jiten frequency metadata into its own provider lookup pill', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            interfaceLanguage: 'en' as const,
            dictionaryPreferences: [
                { name: 'Jiten', alias: 'Jiten', enabled: true, priority: 0, type: 'frequency' as const },
            ],
            dictionaryLookupLinks: defaultDictionaryLookupLinks('local'),
        };
        const html = renderWordPills({
            card,
            jpdbUrl: 'https://jpdb.io/vocabulary/1',
            settings,
            metaEntries: [
                { expression: card.spelling, mode: 'freq', data: { frequency: 123 }, dictionary: 'Jiten' },
            ],
            isJpdbBackedCard: () => true,
            dictionaryLabel: name => settings.dictionaryPreferences.find(preference => preference.name === name)?.alias ?? name,
        });

        expect(html).not.toContain('jpdb-reader-frequency-pill');
        expect(html).toContain('>Jiten #123 ');

        const disabledHtml = renderWordPills({
            card,
            jpdbUrl: 'https://jpdb.io/vocabulary/1',
            settings: {
                ...settings,
                dictionaryPreferences: settings.dictionaryPreferences.map(preference => ({ ...preference, enabled: false })),
            },
            metaEntries: [
                { expression: card.spelling, mode: 'freq', data: { frequency: 123 }, dictionary: 'Jiten' },
            ],
            isJpdbBackedCard: () => true,
            dictionaryLabel: name => name,
        });
        expect(disabledHtml).not.toContain('data-dictionary="Jiten"');
    });

    it('keeps hover lookup pills visible and actionable', () => {
        const html = renderWordPills({
            card,
            jpdbUrl: 'https://jpdb.io/vocabulary/1',
            settings: {
                ...DEFAULT_SETTINGS,
                interfaceLanguage: 'en',
                dictionaryLookupLinks: defaultDictionaryLookupLinks('local'),
            },
            isJpdbBackedCard: () => true,
            dictionaryLabel: name => name,
        });

        expect(html).toContain('>JPDB ');
        expect(html).toContain('>Jiten ');
        expect(html).toContain('>Yomu ');
        expect(html).not.toContain('>Jisho ');
        expect(html).toContain('>Copy ');
        expect(html).toContain('<a ');
        expect(html).toContain('href="https://jiten.moe/parse?text=');
        expect(html).toContain(`href="${NEW_TAB_PAGE_URL}index.html?q=`);
        expect(html).toContain('data-action="copy-word"');
        expect(html).not.toContain('aria-disabled="true"');
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
        expect(html).toContain('--chip-bg:#2f6da8');
    });

    it('renders an Edit in Anki pill for existing Anki notes', () => {
        const html = renderWordPills({
            card,
            jpdbUrl: 'https://jpdb.io/vocabulary/1',
            settings: {
                ...DEFAULT_SETTINGS,
                interfaceLanguage: 'en',
                ankiEnabled: true,
                dictionaryLookupLinks: defaultDictionaryLookupLinks('local'),
            },
            ankiLookup: {
                state: 'known',
                notes: [],
                primary: {
                    noteId: 42,
                    modelName: 'Yomu Japanese',
                    deckNames: ['Yomu'],
                    cardIds: [100],
                    primaryCardId: 100,
                    state: 'known',
                    fields: {},
                    renderedCards: [],
                    tags: [],
                    reps: 0,
                    lapses: 0,
                },
            },
            isJpdbBackedCard: () => true,
            dictionaryLabel: name => name,
            trustedAccountDataSurface: true,
        });

        expect(html).toContain('jpdb-reader-anki-pill');
        expect(html).toContain('data-action="anki-edit"');
        expect(html).toContain('data-note-id="42"');
        expect(html).toContain('title="Edit in Anki"');
        expect(html).not.toContain('data-action="anki"');
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

    it('links single-kanji Jiten lookup pills to Jiten kanji pages', () => {
        const html = renderWordPills({
            card,
            jpdbUrl: 'https://jpdb.io/kanji/%E8%AA%AD',
            settings: {
                ...DEFAULT_SETTINGS,
                interfaceLanguage: 'en',
                dictionaryLookupLinks: defaultDictionaryLookupLinks('local'),
            },
            overrideQuery: '読',
            isJpdbBackedCard: () => false,
            dictionaryLabel: name => name,
        });

        expect(html).toContain('href="https://jiten.moe/kanji/%E8%AA%AD"');
        expect(html).not.toContain('href="https://jiten.moe/parse?text=%E8%AA%AD"');
    });

    it('renders optional Immersion Kit, Nadeshiko, and Uchisen lookup pills with provider colors', () => {
        const html = renderWordPills({
            card,
            jpdbUrl: 'https://jpdb.io/vocabulary/1',
            settings: {
                ...DEFAULT_SETTINGS,
                interfaceLanguage: 'en',
                dictionaryLookupLinks: defaultDictionaryLookupLinks('local').map(link => (
                    link.id === 'immersion-kit' || link.id === 'nadeshiko' || link.id === 'uchisen' ? { ...link, enabled: true } : link
                )),
            },
            isJpdbBackedCard: () => true,
            dictionaryLabel: name => name,
        });

        expect(html).toContain('>Immersion Kit ');
        expect(html).toContain('>Nadeshiko ');
        expect(html).toContain('>Uchisen ');
        expect(html).toContain('https://www.immersionkit.com/dictionary?keyword=');
        expect(html).toContain('https://nadeshiko.co/search/');
        expect(html).toContain('https://uchisen.com/kanji/');
        expect(html).toContain('--chip-bg:#0e7490');
        expect(html).toContain('--chip-bg:#7c3aed');
        expect(html).toContain('--chip-bg:#9a3412');
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
            renderReviewButtonsFallback: () => '<div data-fallback-review><button data-action="grade" data-grade="pass">Pass</button></div>',
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

    it('passes the hover trigger through to popover lookup pills', () => {
        const renderWordPillsSpy = vi.fn(() => '<div data-hover-pills></div>');
        const renderer = new CardPopoverRenderer({
            getSettings: () => DEFAULT_SETTINGS,
            isJpdbBackedCard: () => true,
            renderWordHistory: () => '',
            renderWordPills: renderWordPillsSpy,
            renderDefinitionSources: () => '',
            dictionarySourceAttributes: () => '',
            dictionaryLabel: name => name,
        });

        const html = renderer.render(card, '食べる。', 'hover', emptyCardRenderData());

        expect(html).toContain('data-hover-pills');
        expect(renderWordPillsSpy).toHaveBeenCalledWith(
            card,
            'https://jpdb.io/vocabulary/1/%E9%A3%9F%E3%81%B9%E3%82%8B/%E3%81%9F%E3%81%B9%E3%82%8B',
            [],
            undefined,
            'hover',
            { state: 'not-in-deck', notes: [], primary: null },
            undefined,
        );
    });

    it('renders existing Anki edit actions inside the card preview', () => {
        const renderer = testCardPopoverRenderer({
            ankiEnabled: true,
            ankiSectionEnabled: true,
        });

        document.body.innerHTML = renderer.render(card, '食べる。', 'modal', {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: {
                state: 'known',
                notes: [],
                primary: {
                    noteId: 10,
                    primaryCardId: 20,
                    cardIds: [20],
                    state: 'known',
                    deckNames: ['Yomu'],
                    modelName: 'Yomu Japanese',
                    fields: { Sentence: '食べる。', Meaning: 'eat' },
                    tags: [],
                    reps: 3,
                    lapses: 0,
                },
            },
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            loading: false,
        });

        const preview = document.querySelector<HTMLElement>('.jpdb-reader-anki-card-preview')!;
        const details = document.querySelector<HTMLDetailsElement>('.jpdb-reader-anki-existing')!;
        const editButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-action="anki-edit"]')];

        expect(document.querySelector('.jpdb-reader-anki-existing summary > span')?.textContent).toBe('Anki');
        expect(document.querySelector('.jpdb-reader-anki-existing summary small')?.textContent).toBe('Known · Yomu · 3 reviews');
        expect(details.open).toBe(true);
        expect(editButtons).toHaveLength(1);
        expect(editButtons[0]?.dataset.noteId).toBe('10');
        expect(preview.contains(editButtons[0]!)).toBe(true);
        expect(document.querySelector('.jpdb-reader-actions [data-action="anki-edit"]')).toBeNull();
        expect(document.querySelector('.jpdb-reader-actions [data-action="anki"]')).toBeNull();
    });

    it('renders multiple existing Anki notes with the primary note first', () => {
        const renderer = testCardPopoverRenderer({
            ankiEnabled: true,
            enableReviews: true,
        });
        const primary = {
            noteId: 10,
            primaryCardId: 20,
            cardIds: [20],
            state: 'due' as const,
            deckNames: ['Core'],
            modelName: 'Core Vocab',
            fields: { Expression: '読む', Meaning: 'to read' },
            renderedCards: [{ cardId: 20, deckName: 'Core', question: '読む', answer: 'to read' }],
            tags: [],
            reps: 5,
            lapses: 1,
        };
        const secondary = {
            noteId: 11,
            primaryCardId: 21,
            cardIds: [21],
            state: 'known' as const,
            deckNames: ['Mining'],
            modelName: 'Imported',
            fields: { Term: '読む', Gloss: 'read a book' },
            renderedCards: [{ cardId: 21, deckName: 'Mining', question: '読む', answer: 'read a book' }],
            tags: [],
            reps: 2,
            lapses: 0,
        };

        setInnerHtml(document.body, renderer.render(card, '本を読む。', 'modal', emptyCardRenderData({
            ankiLookup: {
                state: 'due',
                notes: [secondary, primary],
                primary,
            },
        })));

        const details = document.querySelector<HTMLElement>('.jpdb-reader-anki-existing')!;
        const notePreviews = [...details.querySelectorAll<HTMLElement>('.jpdb-reader-anki-card-preview')];

        expect(details.querySelector('summary > span')?.textContent).toBe('Anki (2)');
        expect(details.querySelector('summary small')?.textContent).toContain('2 matches');
        expect(notePreviews.map(preview => preview.dataset.ankiNoteId)).toEqual(['10', '11']);
        expect(notePreviews.map(preview => preview.textContent)).toEqual([
            expect.stringContaining('Core'),
            expect.stringContaining('Mining'),
        ]);
        expect(notePreviews.map(preview => preview.textContent)).toEqual([
            expect.stringContaining('to read'),
            expect.stringContaining('read a book'),
        ]);
        expectAnkiGradeButtons('20');
        expect(popoverGradeTargetCurrentText()).toBe('Core #20');
        expect(popoverGradeTargetText()).toBe('Grades Anki card: Core #20');
        expect(document.querySelector('.jpdb-reader-popover-grade-target-selector')).toBeNull();
        expect(popoverGradeTargetOptions()).toEqual([
            { text: 'Core #20', target: 'anki', cardId: '20', selected: true },
            { text: 'Mining #21', target: 'anki', cardId: '21', selected: false },
        ]);
        const targetSelect = document.querySelector<HTMLSelectElement>('[data-review-target-select]')!;
        targetSelect.value = 'anki:21';
        updatePopoverReviewTargetSelection(targetSelect);
        expect(popoverGradeTargetCurrentText()).toBe('Mining #21');
        expect(popoverGradeTargetText()).toBe('Grades Anki card: Mining #21');
        expectAnkiGradeButtons('21');
        expect(popoverGradeButtons()[0]!.title).toBe('Grades Anki card: Mining #21');
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

    it('shows stored Anki fields when rendered cards are unavailable', () => {
        const renderer = testCardPopoverRenderer({
            ankiEnabled: true,
            ankiSectionEnabled: true,
        });

        document.body.innerHTML = renderer.render({ ...card, spelling: '写真', reading: 'しゃしん' }, '写真を見た。', 'modal', {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: {
                state: 'known',
                notes: [],
                primary: {
                    noteId: 770,
                    primaryCardId: 771,
                    cardIds: [771],
                    state: 'known',
                    deckNames: ['Imported'],
                    modelName: 'All Caps Import',
                    fields: {
                        EXPRESSION: '写真',
                        READING_KATAKANA: 'シャシン',
                        TRANSLATION_1: 'photograph',
                        AUDIO: '[sound:fallback-card.mp3]',
                    },
                    tags: [],
                    reps: 1,
                    lapses: 0,
                },
            },
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            loading: false,
        });

        const preview = document.querySelector<HTMLElement>('.jpdb-reader-anki-card-preview')!;
        const storedFields = preview.querySelector<HTMLDetailsElement>('.jpdb-reader-anki-stored-fields')!;

        expect(preview.querySelector('.jpdb-reader-anki-rendered-card')).toBeNull();
        expect(storedFields).not.toBeNull();
        expect(storedFields.open).toBe(true);
        expect(storedFields.querySelectorAll('.jpdb-reader-anki-field')).toHaveLength(4);
        expect(storedFields.textContent).toContain('Reading Katakana');
        expect(storedFields.textContent).toContain('Translation 1');
        expect(storedFields.textContent).not.toContain('READING_KATAKANA');
        expect(storedFields.textContent).not.toContain('TRANSLATION_1');
        expect(storedFields.querySelector<HTMLButtonElement>('[data-action="anki-media-audio"]')?.dataset.ankiMediaName)
            .toBe('fallback-card.mp3');
    });

    it('renders every Anki rendered card in the popover with the primary card first', () => {
        const renderer = testCardPopoverRenderer({
            ankiEnabled: true,
            ankiSectionEnabled: true,
        });

        document.body.innerHTML = renderer.render(card, '本を読む。', 'modal', {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: {
                state: 'known',
                notes: [],
                primary: {
                    noteId: 10,
                    primaryCardId: 202,
                    cardIds: [101, 202],
                    state: 'known',
                    deckNames: ['Mining'],
                    modelName: 'Custom Japanese',
                    fields: { Expression: '読む', Meaning: 'read' },
                    renderedCards: [
                        { cardId: 101, deckName: 'Mining', question: '<div>読む</div>', answer: '<div>to read</div>' },
                        { cardId: 202, deckName: 'Mining', question: '<div>to read</div>', answer: '<div>読む</div>' },
                    ],
                    tags: [],
                    reps: 4,
                    lapses: 0,
                },
            },
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            loading: false,
        });

        const renderedCards = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-anki-rendered-card'));

        expect(renderedCards.map(element => element.dataset.ankiRenderedCardId)).toEqual(['202', '101']);
        expect(renderedCards[0]?.textContent).toContain('to read');
        expect(renderedCards[0]?.textContent).toContain('読む');
        expect(renderedCards[1]?.textContent).toContain('読む');
        expect(document.querySelectorAll('.jpdb-reader-anki-rendered-card-title')).toHaveLength(2);
    });

    it('keeps Anki media audio chips separate from lookup word audio', async () => {
        const mediaFileDataUrl = vi.fn(async () => 'data:audio/mpeg;base64,audio-data');
        const playMediaUrl = vi.fn(async () => undefined);
        const playAudio = vi.fn(async () => undefined);
        const controller = testCardActionController({
            anki: { mediaFileDataUrl } as unknown as AnkiConnectClient,
            playAudio,
            playMediaUrl,
            detectGrammarHints: vi.fn(async () => []),
        });
        const button = document.createElement('button');
        button.dataset.ankiMediaName = 'h2k-167.mp3';

        await expect(controller.perform({ kind: 'card-action', action: 'anki-media-audio', mediaFilename: 'h2k-167.mp3' }, button, card)).resolves.toBe(false);
        expect(mediaFileDataUrl).toHaveBeenCalledWith('h2k-167.mp3');
        expect(playMediaUrl).toHaveBeenCalledWith('data:audio/mpeg;base64,audio-data');
        expect(playAudio).not.toHaveBeenCalled();

        await expect(controller.perform({ kind: 'card-action', action: 'audio' }, document.createElement('button'), card)).resolves.toBe(false);
        expect(playAudio).toHaveBeenCalledWith(card, { userGesture: true });
        expect(mediaFileDataUrl).toHaveBeenCalledTimes(1);
        expect(playMediaUrl).toHaveBeenCalledTimes(1);
    });

    it('plays Jiten-provided audio URLs before falling back to sentence TTS', async () => {
        const playMediaUrl = vi.fn(async (_audioUrl: string): Promise<boolean | void> => true)
            .mockRejectedValueOnce(new Error('first audio failed'))
            .mockResolvedValueOnce(true);
        const { controller, playSentenceAudio } = testJitenAudioActionController({ playMediaUrl });
        await performTestJitenAudioAction(controller);

        expect(playMediaUrl).toHaveBeenCalledTimes(2);
        expect(playMediaUrl).toHaveBeenNthCalledWith(1, TEST_JITEN_AUDIO_URLS[0]);
        expect(playMediaUrl).toHaveBeenNthCalledWith(2, TEST_JITEN_AUDIO_URLS[1]);
        expect(playSentenceAudio).not.toHaveBeenCalled();
    });

});
