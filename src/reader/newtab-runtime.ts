import { AudioPlayer } from './audio';
import { AnkiConnectClient, type AnkiLookupResult } from './anki';
import { listNewTabAnkiCards } from './anki-new-tab';
import { positionPopover } from './browser-ui';
import { CardPopoverRenderer } from './card-popover-renderer';
import { CardRenderDataLoader, loadingCardRenderData } from './card-render-data';
import { APP_NAME, JPDB_DEFINITION_SOURCE_ID } from './constants';
import {
    renderJpdbDefinitionSource,
    renderLocalDefinitionSourcesSection,
} from './definition-source-render';
import { DictionarySourceStateController } from './dictionary-source-state';
import { appendToDocumentHead, HAS_JAPANESE, setInnerHtml } from './dom';
import { DictionaryStyleController } from './dictionary-styles';
import { ImmersionKitClient } from './immersion-kit';
import { JpdbClient } from './jpdb';
import { JpdbKanjiClient } from './jpdb-kanji';
import { JpdbPublicPitchClient } from './jpdb-public-pitch';
import { createJpdbReviewBridgeClient } from './jpdb-review-bridge';
import { JpdbVocabularyClient, type JpdbVocabularyInfo } from './jpdb-vocabulary';
import { KanjiVGClient } from './kanjivg';
import { configureLogger, Logger, loggingSettingsSummary } from './logger';
import { applyNestedParsePlan, clearNestedParseLoadingKey, nestedParseAlreadyScheduled, nestedTextParsePlan } from './nested-text-parse';
import { NewTabController } from './new-tab-controller';
import { NEW_TAB_CSS } from './newtab-styles';
import { createReaderBackdrop, createReaderPopover } from './popover-shell';
import { groupTermEntriesByDictionary, pickTokenForSelection } from './popup-render';
import { ReaderParser } from './reader-parser';
import { RtkClient } from './rtk';
import {
    DEFAULT_SETTINGS,
    loadSettings,
    saveSettings,
} from './settings';
import { applyReaderAccentColor, applyReaderTheme, applyReaderWordColors } from './reader-theme';
import { SettingsDialogController } from './settings-dialog-controller';
import { orderedDefinitionSourceIds } from './source-sections';
import type { JPDBCard, ReaderSettings } from './types';
import { renderWordPills } from './word-pills';
import { YomitanDictionaryStore, type YomitanTermEntry } from './yomitan';

const log = Logger.scope('NewTabRuntime');

type YomuNewTabWindow = typeof window & {
    __YOMU_READER_RUNTIME__?: string;
};

export function bootNewTabRuntime(): void {
    const app = new NewTabRuntime();
    void app.init().catch(error => {
        log.error('New tab initialization failed', error);
        throw error;
    });
    window.addEventListener('pagehide', () => app.destroy(), { once: true });
}

class NewTabRuntime {
    private settings: ReaderSettings = DEFAULT_SETTINGS;
    private activeDialog?: HTMLElement;
    private activeBackdrop?: HTMLElement;
    private settingsPreviewOriginalAccent?: string;
    private settingsPreviewOriginalTheme?: ReaderSettings['theme'];
    private newTab?: NewTabController;

    private jpdb = new JpdbClient(() => this.settings.apiKey.trim());
    private jpdbKanji = new JpdbKanjiClient(() => this.settings.corsProxyUrl);
    private jpdbPublicPitch = new JpdbPublicPitchClient(() => this.settings.corsProxyUrl);
    private jpdbVocabulary = new JpdbVocabularyClient(() => this.settings.corsProxyUrl);
    private kanjiVG = new KanjiVGClient();
    private immersionKit = new ImmersionKitClient();
    private audio = new AudioPlayer(() => this.settings);
    private anki = new AnkiConnectClient(() => this.settings);
    private rtk = new RtkClient();
    private jpdbReviewBridge = createJpdbReviewBridgeClient();
    private dictionaries = new YomitanDictionaryStore(() => this.settings.corsProxyUrl);
    private dictionarySourceState = new DictionarySourceStateController({
        getSettings: () => this.settings,
        onStateChange: () => this.repositionLookupPopover(),
    });
    private cardRenderData = new CardRenderDataLoader({
        getSettings: () => this.settings,
        dictionaries: this.dictionaries,
        jpdbPublicPitch: this.jpdbPublicPitch,
        jpdbVocabulary: this.jpdbVocabulary,
        anki: this.anki,
        jpdb: this.jpdb,
        isJpdbBackedCard: card => this.parser.isJpdbBackedCard(card),
    });
    private lookupPopoverRenderer = new CardPopoverRenderer({
        getSettings: () => this.settings,
        isJpdbBackedCard: card => this.parser.isJpdbBackedCard(card),
        renderWordHistory: () => '',
        renderWordPills: (card, jpdbUrl, metaEntries, overrideQuery) => renderWordPills({
            card,
            jpdbUrl,
            settings: this.settings,
            metaEntries,
            overrideQuery,
            isJpdbBackedCard: value => this.parser.isJpdbBackedCard(value),
            dictionaryLabel: name => this.dictionaryLabel(name),
        }),
        renderDefinitionSources: (card, entries, sentence, jpdbVocabularyInfo) => this.renderDefinitionSources(card, entries, sentence, jpdbVocabularyInfo),
        dictionarySourceAttributes: (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
        dictionaryLabel: name => this.dictionaryLabel(name),
    });
    private activeLookupPopover?: HTMLElement;
    private activeLookupBackdrop?: HTMLElement;
    private activeLookupAnchor?: HTMLElement;
    private dictionaryStyles = new DictionaryStyleController({
        loadCss: () => this.settings.localDictionariesEnabled
            ? this.dictionaries.dictionaryStyleCss(this.settings.dictionaryPreferences)
            : Promise.resolve(''),
        onUnavailable: error => log.warn('Dictionary styles unavailable', error),
    });
    private parser = new ReaderParser({
        getSettings: () => this.settings,
        jpdb: this.jpdb,
        dictionaries: this.dictionaries,
    });

    private settingsDialog = new SettingsDialogController({
        getSettings: () => this.settings,
        setSettings: settings => { this.settings = settings; },
        jpdb: this.jpdb,
        dictionaries: this.dictionaries,
        anki: this.anki,
        audio: this.audio,
        subtitles: refreshableNoop(),
        ocr: refreshableNoop(),
        createBackdrop: () => createReaderBackdrop(() => this.dismiss()),
        mountDialog: (backdrop, form) => this.mountSettingsDialog(backdrop, form),
        dismiss: () => this.dismiss(),
        toast: message => this.toast(message),
        applyTheme: () => this.applyTheme(),
        applyAccentColor: color => this.applyAccentColor(color),
        applyWordColors: settings => this.applyWordColors(settings),
        installFab: () => undefined,
        refreshDictionaryStyles: () => this.refreshDictionaryStyles(),
        scheduleDictionaryRescan: () => undefined,
        refreshNewTabIfCurrent: () => {
            if (this.newTab?.isCurrentPage()) void this.newTab.renderPage();
        },
        clearDictionarySourceOpenOverrides: () => undefined,
        beginSettingsPreview: (accent, _language, theme) => {
            this.settingsPreviewOriginalAccent = accent;
            this.settingsPreviewOriginalTheme = theme;
        },
        clearSettingsPreview: () => {
            this.settingsPreviewOriginalAccent = undefined;
            this.settingsPreviewOriginalTheme = undefined;
        },
    });

    async init(): Promise<void> {
        markNewTabRuntime();
        configureLogger({ settingsProvider: () => this.settings });
        this.installStyles();
        this.settings = await loadSettings();
        log.info('Settings loaded', loggingSettingsSummary(this.settings));
        this.applyTheme();
        await this.refreshDictionaryStyles();
        this.newTab = this.createNewTabController();
        await this.newTab.renderPage();
    }

    destroy(): void {
        this.newTab?.destroy();
        this.dictionaryStyles.remove();
        this.dismiss();
    }

    private createNewTabController(): NewTabController {
        return new NewTabController({
            getSettings: () => this.settings,
            anki: {
                listNewTabCards: limit => listNewTabAnkiCards(this.anki, this.settings, limit),
                answerCard: (cardId, grade) => this.anki.answerCard(cardId, grade),
            },
            jpdb: this.jpdb,
            jpdbKanji: this.jpdbKanji,
            kanjiVG: this.kanjiVG,
            rtk: this.rtk,
            immersionKit: this.immersionKit,
            jpdbReviewBridge: this.jpdbReviewBridge,
            parser: this.parser,
            dictionaries: this.dictionaries,
            parseContent: root => this.parseNewTabContent(root),
            lookupText: (text, reading, anchor) => this.lookupText(text, reading, anchor),
            lookupDictionaryReference: (query, reading, _dictionary, anchor) => this.lookupText(query, reading || query, anchor),
            setImmersionTranslationBlurred: blurred => this.setImmersionTranslationBlurred(blurred),
            onSettingsChange: () => saveSettings(this.settings),
            applyTheme: () => this.applyTheme(),
            showSettings: panel => this.showSettings(panel),
            dismiss: () => this.dismiss(),
        });
    }

    private installStyles(): void {
        const style = document.createElement('style');
        style.textContent = NEW_TAB_CSS;
        appendToDocumentHead(style);
    }

    private setImmersionTranslationBlurred(blurred: boolean): void {
        if (this.settings.immersionKitRevealTranslationOnClick === blurred) return;
        this.settings = { ...this.settings, immersionKitRevealTranslationOnClick: blurred };
        void saveSettings(this.settings);
    }

    private showSettings(panel?: string): void {
        this.settingsDialog.open(panel);
    }

    private mountSettingsDialog(backdrop: HTMLElement, form: HTMLFormElement): void {
        this.dismiss();
        document.body.append(backdrop, form);
        this.activeBackdrop = backdrop;
        this.activeDialog = form;
        form.focus();
    }

    private dismiss(): void {
        this.activeDialog?.remove();
        this.activeBackdrop?.remove();
        this.activeLookupPopover?.remove();
        this.activeLookupBackdrop?.remove();
        this.activeDialog = undefined;
        this.activeBackdrop = undefined;
        this.activeLookupPopover = undefined;
        this.activeLookupBackdrop = undefined;
        this.activeLookupAnchor = undefined;
        this.restoreSettingsPreviewState();
    }

    private async lookupText(text: string, reading = text, anchor?: HTMLElement): Promise<void> {
        const term = text.trim();
        if (!HAS_JAPANESE.test(term)) return;
        const sentence = anchor?.dataset.sentence || term;
        const card = await this.lookupCard(term, reading);
        const renderData = this.cardRenderData.load(card);
        const initialEntries = await renderData.localEntries.catch(() => []);
        const popover = createReaderPopover(APP_NAME, this.settings);
        const fallbackAnkiLookup: AnkiLookupResult = { state: 'not-in-deck', notes: [], primary: null };
        setInnerHtml(popover, this.lookupPopoverRenderer.render(card, sentence, 'modal', loadingCardRenderData(initialEntries, fallbackAnkiLookup)));
        this.mountLookupPopover(popover, anchor);
        void renderData.all.then(data => {
            if (this.activeLookupPopover !== popover || !popover.isConnected) return;
            setInnerHtml(popover, this.lookupPopoverRenderer.render(card, sentence, 'modal', { ...data, loading: false }));
            this.dictionarySourceState.installTracking(popover);
            void this.parseNewTabContent(popover);
            this.repositionLookupPopover();
        });
        void this.parseNewTabContent(popover);
    }

    private async lookupCard(term: string, reading: string): Promise<JPDBCard> {
        const parsed = await this.parser.parse([term]).catch(() => [[]]);
        const token = pickTokenForSelection(parsed[0] ?? [], term);
        if (token) return token.card;
        const localEntry = await this.localLookupEntry(term, reading);
        return localEntry ? this.parser.localCardFromEntry(localEntry) : this.parser.fallbackCardFromText(term);
    }

    private async localLookupEntry(term: string, reading: string): Promise<YomitanTermEntry | undefined> {
        if (!this.settings.localDictionariesEnabled) return undefined;
        const entries = await this.dictionaries.lookup(term, reading || term, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => []);
        return entries[0];
    }

    private mountLookupPopover(popover: HTMLElement, anchor?: HTMLElement): void {
        this.activeLookupPopover?.remove();
        this.activeLookupBackdrop?.remove();
        const backdrop = createReaderBackdrop(() => this.dismissLookupPopover());
        document.body.append(backdrop, popover);
        this.activeLookupBackdrop = backdrop;
        this.activeLookupPopover = popover;
        this.activeLookupAnchor = anchor;
        this.dictionarySourceState.installTracking(popover);
        this.repositionLookupPopover();
        requestAnimationFrame(() => this.repositionLookupPopover());
    }

    private dismissLookupPopover(): void {
        this.activeLookupPopover?.remove();
        this.activeLookupBackdrop?.remove();
        this.activeLookupPopover = undefined;
        this.activeLookupBackdrop = undefined;
        this.activeLookupAnchor = undefined;
    }

    private repositionLookupPopover(): void {
        if (!this.activeLookupPopover) return;
        positionPopover(this.activeLookupPopover, this.activeLookupAnchor);
    }

    private renderDefinitionSources(card: JPDBCard, entries: YomitanTermEntry[], _sentence?: string, jpdbVocabularyInfo: JpdbVocabularyInfo | null = null): string {
        const grouped = groupTermEntriesByDictionary(entries);
        const sourceIds = orderedDefinitionSourceIds(this.settings, [...grouped.keys()]);
        const dictionarySourceIds = sourceIds.filter(sourceId => grouped.has(sourceId));
        let renderedDictionaries = false;
        const sections = sourceIds.map(sourceId => {
            if (sourceId === JPDB_DEFINITION_SOURCE_ID) {
                return renderJpdbDefinitionSource(card, (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded), jpdbVocabularyInfo);
            }
            if (grouped.has(sourceId)) {
                if (renderedDictionaries) return '';
                renderedDictionaries = true;
                return renderLocalDefinitionSourcesSection(
                    dictionarySourceIds,
                    grouped,
                    this.settings,
                    (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
                    name => this.dictionaryLabel(name),
                    card,
                );
            }
            return '';
        }).filter(Boolean);
        return sections.length
            ? `<div class="jpdb-reader-definition-stack">${sections.join('')}</div>`
            : '<div class="jpdb-reader-help jpdb-reader-no-definitions">No definitions found.</div>';
    }

    private dictionaryLabel(name: string): string {
        return this.settings.dictionaryPreferences.find(item => item.name === name)?.alias || name;
    }

    private restoreSettingsPreviewState(): void {
        if (this.settingsPreviewOriginalAccent !== undefined) {
            this.applyAccentColor(this.settingsPreviewOriginalAccent);
            this.applyWordColors();
        }
        if (this.settingsPreviewOriginalTheme !== undefined) {
            this.settings.theme = this.settingsPreviewOriginalTheme;
            this.applyTheme();
        }
        this.settingsPreviewOriginalAccent = undefined;
        this.settingsPreviewOriginalTheme = undefined;
    }

    private toast(message: string): void {
        const toast = document.createElement('div');
        toast.className = 'jpdb-reader-toast';
        toast.dataset.jpdbReaderRoot = 'true';
        toast.textContent = message;
        document.body.append(toast);
        window.setTimeout(() => toast.remove(), 3000);
    }

    private applyTheme(): void {
        applyReaderTheme(this.settings);
    }

    private applyAccentColor(color: string): void {
        applyReaderAccentColor(color);
    }

    private applyWordColors(settings = this.settings): void {
        applyReaderWordColors(settings);
    }

    private async refreshDictionaryStyles(): Promise<void> {
        await this.dictionaryStyles.refresh();
    }

    private async parseNewTabContent(root: HTMLElement): Promise<void> {
        if (!root.isConnected || !this.parser.canParse()) return;
        const plan = nestedTextParsePlan(root, 36);
        if (!plan || nestedParseAlreadyScheduled(root, plan.parseKey)) return;
        root.dataset.jpdbReaderParseLoadingKey = plan.parseKey;
        try {
            const parsed = await this.parser.parse(plan.targets.map(target => target.text));
            if (!root.isConnected || root.dataset.jpdbReaderParseLoadingKey !== plan.parseKey) return;
            applyNestedParsePlan(plan, parsed, this.settings);
            root.dataset.jpdbReaderParseKey = plan.parseKey;
        } catch {
        } finally {
            clearNestedParseLoadingKey(root, plan.parseKey);
        }
    }
}

function markNewTabRuntime(): void {
    (window as YomuNewTabWindow).__YOMU_READER_RUNTIME__ = 'newtab';
}

function refreshableNoop(): { refresh: () => void } {
    return { refresh: () => undefined };
}
