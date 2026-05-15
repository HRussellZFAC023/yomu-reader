import { AudioPlayer } from './audio';
import { AnkiConnectClient } from './anki';
import { appendToDocumentHead, applyTokensToScanTarget, collectFragmentTextTargetsIn, type ScanTextTarget } from './dom';
import { ImmersionKitClient } from './immersion-kit';
import { JpdbClient } from './jpdb';
import { JpdbKanjiClient } from './jpdb-kanji';
import { createJpdbReviewBridgeClient } from './jpdb-review-bridge';
import { KanjiVGClient } from './kanjivg';
import { configureLogger, Logger, loggingSettingsSummary } from './logger';
import { NewTabController } from './new-tab-controller';
import { NEW_TAB_CSS } from './newtab-styles';
import { createReaderBackdrop } from './popover-shell';
import { ReaderParser } from './reader-parser';
import { RtkClient } from './rtk';
import {
    DEFAULT_SETTINGS,
    accentToRgba,
    effectiveFuriganaMode,
    effectiveReaderColorSource,
    effectiveSubtitleColorSource,
    effectiveWordHighlightMode,
    loadSettings,
    sanitizeAccentColor,
    saveSettings,
} from './settings';
import { SettingsDialogController } from './settings-dialog-controller';
import type { InterfaceLanguage, JPDBToken, ReaderColorSource, ReaderSettings } from './types';
import { YomitanDictionaryStore } from './yomitan';

const log = Logger.scope('NewTabRuntime');
const COLOR_SOURCE_CLASSES: Exclude<ReaderColorSource, 'auto' | 'off'>[] = ['status', 'jpdb', 'anki', 'pitch'];
const COLOR_CHANNELS = ['highlight', 'underline', 'text'] as const;
type ColorChannel = typeof COLOR_CHANNELS[number];

interface NestedParsePlan {
    targets: ScanTextTarget[];
    parseKey: string;
}

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
    private dictionaryStyleElement?: HTMLStyleElement;
    private settingsPreviewOriginalAccent?: string;
    private settingsPreviewOriginalLanguage?: InterfaceLanguage;
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
        youtube: refreshableNoop(),
        jpdbExtensions: refreshableNoop(),
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
        beginSettingsPreview: (accent, language, theme) => {
            this.settingsPreviewOriginalAccent = accent;
            this.settingsPreviewOriginalLanguage = language;
            this.settingsPreviewOriginalTheme = theme;
        },
        clearSettingsPreview: () => {
            this.settingsPreviewOriginalAccent = undefined;
            this.settingsPreviewOriginalLanguage = undefined;
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
        this.dismiss();
    }

    private createNewTabController(): NewTabController {
        return new NewTabController({
            getSettings: () => this.settings,
            anki: this.anki,
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
        this.settingsPreviewOriginalLanguage = undefined;
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
        this.applyAccentColor(this.settings.accentColor);
        this.applyWordColors();
        document.documentElement.classList.toggle('jpdb-reader-theme-dark', this.settings.theme === 'dark');
        document.documentElement.classList.toggle('jpdb-reader-theme-light', this.settings.theme === 'light');
        const furiganaMode = effectiveFuriganaMode(this.settings);
        const wordHighlightMode = effectiveWordHighlightMode(this.settings);
        this.applyColorSourceClasses('word', {
            highlight: effectiveReaderColorSource(this.settings, this.settings.wordHighlightColorSource),
            underline: effectiveReaderColorSource(this.settings, this.settings.wordUnderlineColorSource),
            text: effectiveReaderColorSource(this.settings, this.settings.wordTextColorSource),
        });
        this.applyColorSourceClasses('subtitle', {
            highlight: effectiveSubtitleColorSource(this.settings, this.settings.subtitleHighlightColorSource),
            underline: effectiveSubtitleColorSource(this.settings, this.settings.subtitleUnderlineColorSource),
            text: effectiveSubtitleColorSource(this.settings, this.settings.subtitleTextColorSource),
        });
        document.documentElement.classList.toggle('jpdb-reader-hide-known', furiganaMode === 'known-status');
        document.documentElement.classList.toggle('jpdb-reader-highlight-status', wordHighlightMode === 'status');
        document.documentElement.classList.toggle('jpdb-reader-highlight-pitch', wordHighlightMode === 'pitch');
        document.documentElement.classList.toggle('jpdb-reader-highlight-off', wordHighlightMode === 'off');
    }

    private applyColorSourceClasses(scope: 'word' | 'subtitle', sources: Record<ColorChannel, Exclude<ReaderColorSource, 'auto'>>): void {
        COLOR_CHANNELS.forEach(channel => {
            COLOR_SOURCE_CLASSES.forEach(source => {
                document.documentElement.classList.toggle(`jpdb-reader-${scope}-${channel}-${source}`, sources[channel] === source);
            });
        });
    }

    private applyAccentColor(color: string): void {
        const accentColor = sanitizeAccentColor(color);
        document.documentElement.style.setProperty('--jpdb-reader-accent', accentColor);
        document.documentElement.style.setProperty('--jpdb-reader-accent-soft', accentToRgba(accentColor, 0.18));
    }

    private applyWordColors(settings = this.settings): void {
        const colorMap = {
            new: sanitizeAccentColor(settings.wordColorNew),
            learning: sanitizeAccentColor(settings.wordColorLearning),
            known: sanitizeAccentColor(settings.wordColorKnown),
            due: sanitizeAccentColor(settings.wordColorDue),
            failed: sanitizeAccentColor(settings.wordColorFailed),
            ignored: sanitizeAccentColor(settings.wordColorIgnored),
        };
        Object.entries(colorMap).forEach(([state, color]) => {
            document.documentElement.style.setProperty(`--jpdb-reader-state-${state}`, color);
            document.documentElement.style.setProperty(`--jpdb-reader-state-${state}-soft`, accentToRgba(color, 0.16));
            document.documentElement.style.setProperty(`--jpdb-reader-state-${state}-strong`, accentToRgba(color, 0.28));
        });
    }

    private async refreshDictionaryStyles(): Promise<void> {
        const css = await this.dictionaryStyleCss();
        const existing = this.dictionaryStyleElement ?? document.getElementById('jpdb-reader-yomitan-dictionary-styles') as HTMLStyleElement | null;
        if (!css.trim()) {
            existing?.remove();
            this.dictionaryStyleElement = undefined;
            return;
        }
        const style = existing ?? document.createElement('style');
        style.id = 'jpdb-reader-yomitan-dictionary-styles';
        style.textContent = css;
        if (!style.isConnected) appendToDocumentHead(style);
        this.dictionaryStyleElement = style;
    }

    private dictionaryStyleCss(): Promise<string> {
        if (!this.settings.localDictionariesEnabled) return Promise.resolve('');
        return this.dictionaries.dictionaryStyleCss(this.settings.dictionaryPreferences).catch(error => {
            log.warn('Dictionary styles unavailable', error);
            return '';
        });
    }

    private async parseNewTabContent(root: HTMLElement): Promise<void> {
        if (!root.isConnected || !this.parser.canParse()) return;
        const plan = newTabNestedParsePlan(root);
        if (!plan || nestedParseAlreadyScheduled(root, plan.parseKey)) return;
        root.dataset.jpdbReaderParseLoadingKey = plan.parseKey;
        try {
            const parsed = await this.parser.parse(plan.targets.map(target => target.text));
            if (!root.isConnected || root.dataset.jpdbReaderParseLoadingKey !== plan.parseKey) return;
            applyNestedParsePlan(plan, parsed, this.settings);
            root.dataset.jpdbReaderParseKey = plan.parseKey;
        } catch (error) {
            log.debug('New tab nested text parsing failed quietly', error);
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

function newTabNestedParsePlan(root: HTMLElement): NestedParsePlan | null {
    const targets = Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-parseable'))
        .flatMap(parseRoot => collectFragmentTextTargetsIn(parseRoot, 36, false, '', { includeReaderRoot: true, allowUiText: true, minLength: 1 }))
        .slice(0, 36);
    return targets.length ? { targets, parseKey: nestedParseKey(targets) } : null;
}

function nestedParseKey(targets: ScanTextTarget[]): string {
    return targets.map(target => target.text).join('\n\n');
}

function nestedParseAlreadyScheduled(root: HTMLElement, parseKey: string): boolean {
    return root.dataset.jpdbReaderParseKey === parseKey
        || root.dataset.jpdbReaderParseLoadingKey === parseKey;
}

function applyNestedParsePlan(plan: NestedParsePlan, parsed: JPDBToken[][], settings: ReaderSettings): void {
    plan.targets.forEach((target, index) => applyTokensToScanTarget(target, parsed[index] ?? [], settings));
}

function clearNestedParseLoadingKey(root: HTMLElement, parseKey: string): void {
    if (root.dataset.jpdbReaderParseLoadingKey === parseKey) delete root.dataset.jpdbReaderParseLoadingKey;
}
