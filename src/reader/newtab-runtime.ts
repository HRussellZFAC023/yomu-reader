import { AudioPlayer } from './audio';
import { AnkiConnectClient } from './anki';
import { listNewTabAnkiCards } from './anki-new-tab';
import { appendToDocumentHead } from './dom';
import { DictionaryStyleController } from './dictionary-styles';
import { ImmersionKitClient } from './immersion-kit';
import { JpdbClient } from './jpdb';
import { JpdbKanjiClient } from './jpdb-kanji';
import { createJpdbReviewBridgeClient } from './jpdb-review-bridge';
import { KanjiVGClient } from './kanjivg';
import { configureLogger, Logger, loggingSettingsSummary } from './logger';
import { applyNestedParsePlan, clearNestedParseLoadingKey, nestedParseAlreadyScheduled, nestedTextParsePlan } from './nested-text-parse';
import { NewTabController } from './new-tab-controller';
import { NEW_TAB_CSS } from './newtab-styles';
import { createReaderBackdrop } from './popover-shell';
import { ReaderParser } from './reader-parser';
import { RtkClient } from './rtk';
import {
    DEFAULT_SETTINGS,
    loadSettings,
    saveSettings,
} from './settings';
import { applyReaderAccentColor, applyReaderTheme, applyReaderWordColors } from './reader-theme';
import { SettingsDialogController } from './settings-dialog-controller';
import type { ReaderSettings } from './types';
import { YomitanDictionaryStore } from './yomitan';

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
    private jpdbKanji = new JpdbKanjiClient();
    private kanjiVG = new KanjiVGClient();
    private immersionKit = new ImmersionKitClient();
    private audio = new AudioPlayer(() => this.settings);
    private anki = new AnkiConnectClient(() => this.settings);
    private rtk = new RtkClient();
    private jpdbReviewBridge = createJpdbReviewBridgeClient();
    private dictionaries = new YomitanDictionaryStore();
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
            ensureStarterDictionary: onProgress => this.settingsDialog.ensureStarterDictionaryInstalled(onProgress),
            parseContent: root => this.parseNewTabContent(root),
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
        this.activeDialog = undefined;
        this.activeBackdrop = undefined;
        this.restoreSettingsPreviewState();
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
