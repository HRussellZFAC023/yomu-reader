import { AudioPlayer } from './audio';
import { AnkiConnectClient, captureActiveVideoFrame } from './anki';
import { APP_NAME, APP_PUCK, SETTINGS_TITLE, SUPPORT_LINKS } from './constants';
import {
    HAS_JAPANESE,
    applyTokensToTextNode,
    collectTextTargetsIn,
    collectVisibleTextTargets,
    escapeHtml,
    getSelectionSentence,
    getSelectionText,
    setInnerHtml,
} from './dom';
import { JpdbClient } from './jpdb';
import { JpdbKanjiClient, type JpdbKanjiInfo, type JpdbKanjiVocabulary } from './jpdb-kanji';
import { buildKanjiFacts, buildKanjiOriginGraph, KanjiOriginClient, type KanjiFact, type KanjiOriginGraph, type KanjiSourceInfo } from './kanji-origin';
import { KanjiVGClient, type KanjiVGInfo } from './kanjivg';
import { uiText } from './i18n';
import { OnboardingController } from './onboarding';
import { ImageOcrController } from './ocr';
import { formatPartOfSpeech, formatPartOfSpeechDetails } from './pos';
import { RECOMMENDED_JAPANESE_DICTIONARIES, findRecommendedDictionary, type RecommendedDictionary } from './recommended-dictionaries';
import { RtkClient, type RtkInfo } from './rtk';
import {
    AUDIO_GUIDE_URL,
    AUDIO_SOURCE_OPTIONS,
    DEFAULT_AUDIO_SOURCES,
    DEFAULT_SETTINGS,
    accentToRgba,
    formatShortcutEvent,
    loadSettings,
    matchesShortcut,
    mergeDictionaryPreferences,
    normalizeAudioSource,
    normalizeOcrProvider,
    sanitizeAccentColor,
    saveSettings,
    shortcutIsPressed,
} from './settings';
import { READER_CSS } from './styles';
import { SubtitlePlayerController } from './subtitles';
import type { AudioSourceSetting, DictionaryPreference, InterfaceLanguage, JPDBCard, JPDBDeck, JPDBGrade, JPDBToken, ReaderSettings } from './types';
import { YoutubeImmersionFilter, isYouTubeHost } from './youtube';
import {
    YomitanDictionaryStore,
    glossaryToHtml,
    glossaryToText,
    parseYomitanSettingsExport,
    type YomitanDictionaryInfo,
    type YomitanKanjiEntry,
    type YomitanMetaEntry,
    type YomitanTermEntry,
} from './yomitan';

const JPDB_SETTINGS_URL = 'https://jpdb.io/settings';
const JPDB_DEFINITION_SOURCE_ID = '__jpdb__';

class ReaderApp {
    private settings: ReaderSettings = DEFAULT_SETTINGS;
    private jpdb = new JpdbClient(() => this.settings.apiKey.trim());
    private jpdbKanji = new JpdbKanjiClient();
    private kanjiVG = new KanjiVGClient();
    private kanjiOrigin = new KanjiOriginClient();
    private audio = new AudioPlayer(() => this.settings);
    private anki = new AnkiConnectClient(() => this.settings);
    private rtk = new RtkClient();
    private dictionaries = new YomitanDictionaryStore();
    private onboarding = new OnboardingController({
        getSettings: () => this.settings,
        setSettings: settings => {
            this.settings = settings;
            this.applyTheme();
        },
        showSettings: () => this.showSettings(),
    });
    private subtitles = new SubtitlePlayerController({
        getSettings: () => this.settings,
        parseJapanese: async text => (await this.jpdb.parse([text]))[0] ?? [],
        onSettingsChange: () => void saveSettings(this.settings),
        onToast: message => this.toast(message),
    });
    private ocr = new ImageOcrController({
        getSettings: () => this.settings,
        parseJapanese: async text => (await this.jpdb.parse([text]))[0] ?? [],
        onLookup: (text, sentence) => this.lookupText(text, sentence),
        onToast: message => this.toast(message),
    });
    private youtube = new YoutubeImmersionFilter({
        getSettings: () => this.settings,
        setEnabled: enabled => void this.setYoutubeImmersionEnabled(enabled),
    });
    private activePopover?: HTMLElement;
    private activeBackdrop?: HTMLElement;
    private fab?: HTMLButtonElement;
    private lastCard?: JPDBCard;
    private selectionTimer?: number;
    private autoScanTimer?: number;
    private autoScanDeadline = 0;
    private autoScanObserver?: MutationObserver;
    private asbScanTimer?: number;
    private hoverLookupTimer?: number;
    private settingsPreviewOriginalAccent?: string;
    private settingsPreviewOriginalLanguage?: InterfaceLanguage;
    private lastAutoAudioKey = '';
    private lastAutoAudioAt = 0;
    private cardRenderRequest = 0;
    private pressedKeys = new Set<string>();
    private suppressSelectionLookupUntil = 0;

    async init(): Promise<void> {
        this.settings = await loadSettings();
        this.settings = applyUrlBootstrapSettings(this.settings);
        this.installStyles();
        this.applyTheme();
        this.installFab();
        this.bindEvents();
        this.subtitles.init();
        this.ocr.init();
        this.youtube.init();

        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand(`${APP_NAME} settings`, () => this.showSettings());
            GM_registerMenuCommand(`${APP_NAME} scan visible page`, () => this.scanVisiblePage());
            GM_registerMenuCommand(`${APP_NAME} scan nearby images`, () => this.ocr.scanVisible());
            GM_registerMenuCommand(`${APP_NAME} toggle YouTube filter`, () => void this.toggleYoutubeImmersion());
            GM_registerMenuCommand(`${APP_NAME} show puck`, () => {
                this.settings.showFloatingButton = true;
                void saveSettings(this.settings).then(() => this.installFab());
            });
        }

        this.setupAutoScan();
        const showedOnboarding = await this.onboarding.showIfNeeded();
        if (!this.settings.apiKey) {
            if (!showedOnboarding) this.showSettings();
        } else if (this.settings.scanVisiblePage || this.settings.autoScanJapanese) {
            void this.scanVisiblePage({ silent: true });
        }
    }

    private installStyles(): void {
        if (typeof GM_addStyle === 'function') GM_addStyle(READER_CSS);
        else {
            const style = document.createElement('style');
            style.textContent = READER_CSS;
            document.head.appendChild(style);
        }
    }

    private applyTheme(): void {
        this.applyAccentColor(this.settings.accentColor);
        document.documentElement.classList.toggle('jpdb-reader-theme-dark', this.settings.theme === 'dark');
        document.documentElement.classList.toggle('jpdb-reader-theme-light', this.settings.theme === 'light');
        document.documentElement.classList.toggle('jpdb-reader-hide-known', this.settings.hideKnownFurigana);
    }

    private applyAccentColor(color: string): void {
        const accentColor = sanitizeAccentColor(color);
        document.documentElement.style.setProperty('--jpdb-reader-accent', accentColor);
        document.documentElement.style.setProperty('--jpdb-reader-accent-soft', accentToRgba(accentColor, 0.18));
    }

    private installFab(): void {
        this.fab?.remove();
        this.fab = undefined;
        document.querySelectorAll<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-fab').forEach(element => element.remove());
        if (!this.settings.showFloatingButton) return;

        const button = document.createElement('button');
        button.className = 'jpdb-reader-fab';
        button.type = 'button';
        button.textContent = APP_PUCK;
        button.title = APP_NAME;
        button.dataset.jpdbReaderRoot = 'true';
        button.addEventListener('click', () => this.showQuickMenu(button));
        document.body.appendChild(button);
        this.fab = button;
    }

    private setupAutoScan(): void {
        this.autoScanObserver?.disconnect();
        this.autoScanObserver = new MutationObserver(mutations => {
            if (mutations.some(mutationTouchesAsbPlayer)) this.scheduleAsbPlayerScan(120);
            else if (mutations.every(mutationInsideReaderRoot)) return;
            else this.scheduleAutoScan(900);
        });
        this.autoScanObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
        window.addEventListener('scroll', () => this.scheduleAutoScan(500), { passive: true });
        window.addEventListener('resize', () => this.scheduleAutoScan(700), { passive: true });
        this.scheduleAutoScan(600);
    }

    private scheduleAutoScan(delay: number): void {
        if (!this.settings.autoScanJapanese || !this.settings.apiKey.trim()) return;
        const deadline = Date.now() + delay;
        if (this.autoScanTimer && this.autoScanDeadline <= deadline) return;

        window.clearTimeout(this.autoScanTimer);
        this.autoScanDeadline = deadline;
        this.autoScanTimer = window.setTimeout(() => {
            this.autoScanTimer = undefined;
            this.autoScanDeadline = 0;
            void this.scanAsbPlayerSubtitles();
            if (collectVisibleTextTargets(1).length > 0) {
                void this.scanVisiblePage({ silent: true });
            }
        }, delay);
    }

    private scheduleAsbPlayerScan(delay: number): void {
        if (!this.settings.autoScanJapanese || !this.settings.apiKey.trim()) return;
        window.clearTimeout(this.asbScanTimer);
        this.asbScanTimer = window.setTimeout(() => void this.scanAsbPlayerSubtitles(), delay);
    }

    private bindEvents(): void {
        document.addEventListener('click', event => {
            const word = (event.target as HTMLElement).closest?.('.jpdb-reader-word') as HTMLElement | null;
            if (!word) return;
            if (!this.settings.lookupOnClick) return;

            event.preventDefault();
            event.stopPropagation();
            this.suppressSelectionLookupUntil = Date.now() + 350;
            if (word.closest('.jpdb-subtitle-player') && this.settings.subtitleMiningPause) pauseActiveVideo();
            void this.showWord(word);
        }, { capture: true });

        document.addEventListener('pointerover', event => {
            const word = (event.target as HTMLElement).closest?.('.jpdb-reader-word') as HTMLElement | null;
            if (!word || event.pointerType === 'touch') return;
            if (!this.shouldLookupOnHover(event)) return;
            window.clearTimeout(this.hoverLookupTimer);
            this.hoverLookupTimer = window.setTimeout(() => {
                if (!word.isConnected || !word.matches(':hover')) return;
                if (word.closest('.jpdb-subtitle-player') && this.settings.subtitleMiningPause) pauseActiveVideo();
                void this.showWord(word);
            }, 180);
        }, { capture: true });

        document.addEventListener('pointerout', event => {
            const related = event.relatedTarget as Node | null;
            const word = (event.target as HTMLElement).closest?.('.jpdb-reader-word') as HTMLElement | null;
            if (!word || (related && word.contains(related))) return;
            window.clearTimeout(this.hoverLookupTimer);
        }, { capture: true });

        document.addEventListener('keyup', () => {
            if (!this.settings.parseSelection) return;
            window.clearTimeout(this.selectionTimer);
            this.selectionTimer = window.setTimeout(() => void this.lookupSelection(), 120);
        });

        document.addEventListener('mouseup', () => {
            if (!this.settings.parseSelection) return;
            window.clearTimeout(this.selectionTimer);
            this.selectionTimer = window.setTimeout(() => void this.lookupSelection(), 140);
        });

        document.addEventListener('touchend', () => {
            if (!this.settings.parseSelection) return;
            window.clearTimeout(this.selectionTimer);
            this.selectionTimer = window.setTimeout(() => void this.lookupSelection(), 180);
        }, { passive: true });

        document.addEventListener('keydown', event => {
            this.pressedKeys.add(normalizePressedKey(event.key));
            if (isEditableTarget(event.target)) return;
            if (matchesShortcut(event, this.settings.shortcuts.closePopup) && this.hasOpenReaderDialog()) {
                event.preventDefault();
                this.dismiss();
                return;
            }
            if (matchesShortcut(event, this.settings.shortcuts.scanPage)) {
                event.preventDefault();
                void this.scanVisiblePage({ silent: true });
                return;
            }
            if (matchesShortcut(event, this.settings.shortcuts.openSettings)) {
                event.preventDefault();
                this.showSettings();
                return;
            }
            if (matchesShortcut(event, this.settings.shortcuts.toggleOcr)) {
                event.preventDefault();
                this.settings.ocrEnabled = !this.settings.ocrEnabled;
                void saveSettings(this.settings);
                this.ocr.refresh();
                this.toast(this.settings.ocrEnabled ? 'Image reading enabled.' : 'Image reading hidden.');
                return;
            }
            if (matchesShortcut(event, this.settings.shortcuts.toggleYoutubeImmersion)) {
                event.preventDefault();
                void this.toggleYoutubeImmersion();
                return;
            }
            if (matchesShortcut(event, this.settings.shortcuts.scanImages)) {
                event.preventDefault();
                void this.ocr.scanVisible();
                return;
            }
            if (this.lastCard && this.activePopover && matchesShortcut(event, this.settings.shortcuts.playAudio)) {
                event.preventDefault();
                void this.playAudio(this.lastCard);
                return;
            }
            const grade = this.shortcutGrade(event);
            if (this.lastCard && grade && this.activePopover?.classList.contains('jpdb-reader-popover')) {
                event.preventDefault();
                void this.jpdb.reviewCard(this.lastCard, grade).then(() => this.toast('Review sent.')).catch(error => {
                    this.toast(error instanceof Error ? error.message : 'Review failed.');
                });
            }
        });
        document.addEventListener('keyup', event => {
            this.pressedKeys.delete(normalizePressedKey(event.key));
        });
        window.addEventListener('blur', () => this.pressedKeys.clear());
    }

    private shortcutGrade(event: KeyboardEvent): JPDBGrade | null {
        if (!this.settings.enableReviews) return null;
        if (this.settings.twoButtonReviews) {
            if (matchesShortcut(event, this.settings.shortcuts.gradeFail)) return 'fail';
            if (matchesShortcut(event, this.settings.shortcuts.gradePass)) return 'pass';
            return null;
        }
        if (matchesShortcut(event, this.settings.shortcuts.gradeNothing)) return 'nothing';
        if (matchesShortcut(event, this.settings.shortcuts.gradeSomething)) return 'something';
        if (matchesShortcut(event, this.settings.shortcuts.gradeHard)) return 'hard';
        if (matchesShortcut(event, this.settings.shortcuts.gradeOkay)) return 'okay';
        if (matchesShortcut(event, this.settings.shortcuts.gradeEasy)) return 'easy';
        return null;
    }

    private shouldLookupOnHover(event: MouseEvent): boolean {
        return this.settings.lookupOnHover && shortcutIsPressed(this.settings.shortcuts.hoverLookup, event, this.pressedKeys);
    }

    private async toggleYoutubeImmersion(): Promise<void> {
        await this.setYoutubeImmersionEnabled(!this.settings.youtubeImmersionEnabled);
    }

    private async setYoutubeImmersionEnabled(enabled: boolean): Promise<void> {
        this.settings.youtubeImmersionEnabled = enabled;
        await saveSettings(this.settings);
        this.youtube.refresh();
        this.toast(uiText(this.settings.interfaceLanguage, enabled ? 'youtubeToggleToastOn' : 'youtubeToggleToastOff'));
    }

    private hasOpenReaderDialog(): boolean {
        return Boolean(this.activePopover || this.activeBackdrop || document.querySelector('[data-jpdb-reader-root].jpdb-reader-popover, [data-jpdb-reader-root].jpdb-reader-settings, [data-jpdb-reader-root].jpdb-reader-backdrop'));
    }

    private async lookupSelection(): Promise<void> {
        if (Date.now() < this.suppressSelectionLookupUntil) return;
        const selected = getSelectionText();
        if (selected.length < 1 || selected.length > 120 || !HAS_JAPANESE.test(selected)) return;
        if ((document.activeElement as HTMLElement | null)?.closest?.('[data-jpdb-reader-root]')) return;
        await this.lookupText(selected, getSelectionSentence());
    }

    private async lookupText(text: string, sentence = text): Promise<void> {
        const selected = text.replace(/\s+/g, ' ').trim();
        if (!selected || !HAS_JAPANESE.test(selected)) return;
        try {
            const [tokens] = await this.jpdb.parse([sentence]);
            const selectedToken = pickTokenForSelection(tokens, selected);
            if (!selectedToken) {
                this.showTokenList(tokens, selected);
                return;
            }
            void this.showCard(selectedToken.card, selectedToken.sentence ?? sentence);
        } catch (error) {
            const localEntries = this.settings.localDictionariesEnabled
                ? await this.dictionaries.lookup(selected, selected, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
                : [];
            if (localEntries.length) this.showLocalDictionaryPopup(selected, localEntries);
            else this.toast(error instanceof Error ? error.message : 'JPDB lookup failed.');
        }
    }

    private async scanVisiblePage(options: { silent?: boolean } = {}): Promise<void> {
        try {
            const targets = collectVisibleTextTargets();
            if (!targets.length) {
                if (!options.silent) this.toast('No unscanned Japanese text found.');
                return;
            }

            const parsed = await this.jpdb.parse(targets.map(target => target.text));
            targets.forEach((target, index) => applyTokensToTextNode(target, parsed[index] ?? [], this.settings));
        } catch (error) {
            if (!options.silent) this.toast(error instanceof Error ? error.message : 'JPDB scan failed.');
        }
    }

    private async scanAsbPlayerSubtitles(): Promise<void> {
        const roots = Array.from(document.querySelectorAll<HTMLElement>('.asbplayer-offscreen, .asbplayer-subtitles-container-bottom'));
        if (!roots.length) return;

        const targets = roots.flatMap(root => collectTextTargetsIn(root, 12, false)).slice(0, 12);
        if (!targets.length) return;

        try {
            const parsed = await this.jpdb.parse(targets.map(target => target.text));
            targets.forEach((target, index) => applyTokensToTextNode(target, parsed[index] ?? [], this.settings));
        } catch {
            // External subtitle overlays update frequently; the regular popup path still reports API errors.
        }
    }

    private async showWord(word: HTMLElement): Promise<void> {
        const vid = Number(word.dataset.vid);
        const sid = Number(word.dataset.sid);
        const card = this.jpdb.getCard(vid, sid);
        if (!card) {
            this.toast('That word is no longer in the local JPDB cache. Scan it again.');
            return;
        }
        void this.showCard(card, word.dataset.sentence || undefined, word);
    }

    private showTokenList(tokens: JPDBToken[], selected: string): void {
        if (!tokens.length) return;
        const popover = this.createPopover();
        setInnerHtml(popover, `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-pos">Selection</div>
            <div class="jpdb-reader-meanings">
                ${tokens.map(token => `
                    <button class="jpdb-reader-btn" data-vid="${token.card.vid}" data-sid="${token.card.sid}">
                        ${escapeHtml(token.card.spelling)} ${token.card.reading !== token.card.spelling ? `<span class="jpdb-reader-reading">${escapeHtml(token.card.reading)}</span>` : ''}
                    </button>
                `).join('')}
            </div>
            <div class="jpdb-reader-help">Parsed from: ${escapeHtml(selected)}</div>
        `);
        popover.addEventListener('click', event => {
            const button = (event.target as HTMLElement).closest('button[data-vid]') as HTMLButtonElement | null;
            if (!button) return;
            const card = this.jpdb.getCard(Number(button.dataset.vid), Number(button.dataset.sid));
            if (card) void this.showCard(card, tokens.find(t => t.card === card)?.sentence);
        });
        this.mountPopover(popover);
    }

    private showLocalDictionaryPopup(term: string, entries: YomitanTermEntry[]): void {
        const popover = this.createPopover();
        setInnerHtml(popover, `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-header">
                <div>
                    <div class="jpdb-reader-spelling">${escapeHtml(term)}</div>
                    <div class="jpdb-reader-reading">Yomitan dictionaries</div>
                </div>
            </div>
            <div class="jpdb-reader-definition-stack">
                ${Array.from(groupTermEntriesByDictionary(entries))
                    .map(([dictionary, dictionaryEntries]) => this.renderLocalDefinitionSource(dictionary, dictionaryEntries))
                    .join('')}
            </div>
        `);
        this.mountPopover(popover);
    }

    private showQuickMenu(anchor: HTMLElement): void {
        const popover = this.createPopover();
        const language = this.settings.interfaceLanguage;
        const scanButton = this.settings.autoScanJapanese && this.settings.scanVisiblePage && this.settings.ocrAutoScanImages
            ? ''
            : `<button class="jpdb-reader-btn" data-action="scan">${uiText(language, 'scanPage')}</button>`;
        const imageButton = this.settings.ocrAutoScanImages
            ? ''
            : `<button class="jpdb-reader-btn" data-action="ocr">${uiText(language, 'scanImages')}</button>`;
        const youtubeButton = isYouTubeHost()
            ? `<button class="jpdb-reader-btn" data-action="youtube-filter">${uiText(language, this.settings.youtubeImmersionEnabled ? 'youtubeFilterOn' : 'youtubeFilterOff')}</button>`
            : '';
        const buttonCount = [scanButton, imageButton, youtubeButton, 'settings'].filter(Boolean).length;
        setInnerHtml(popover, `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-header">
                <div>
                    <div class="jpdb-reader-spelling">${APP_NAME}</div>
                    <div class="jpdb-reader-reading">${uiText(language, 'quickDescription')}</div>
                </div>
            </div>
            <div class="jpdb-reader-actions">
                <div class="jpdb-reader-row jpdb-reader-grades" style="--cols: ${buttonCount}">
                    ${scanButton}
                    ${imageButton}
                    ${youtubeButton}
                    <button class="jpdb-reader-btn" data-action="settings">${uiText(language, 'settings')}</button>
                </div>
            </div>
        `);
        popover.addEventListener('click', event => {
            const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')?.dataset.action;
            if (action === 'scan') void this.scanVisiblePage();
            if (action === 'ocr') void this.ocr.scanVisible();
            if (action === 'youtube-filter') void this.toggleYoutubeImmersion().then(() => this.dismiss());
            if (action === 'settings') this.showSettings();
            event.stopPropagation();
        });
        this.mountPopover(popover, anchor);
    }

    private async showCard(card: JPDBCard, sentence?: string, anchor?: HTMLElement, options: { autoPlay?: boolean } = {}): Promise<void> {
        const requestId = ++this.cardRenderRequest;
        this.lastCard = card;
        const state = card.cardState[0] ?? 'not-in-deck';
        const popover = this.createPopover();
        const localEntries = this.settings.localDictionariesEnabled
            ? await this.dictionaries.lookup(card.spelling, card.reading, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
            : [];
        const kanjiEntries = this.settings.localDictionariesEnabled && this.settings.localDictionaryShowKanji
            ? await this.dictionaries.lookupKanji(card.spelling, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
            : [];
        const metaEntries = this.settings.localDictionariesEnabled
            ? await this.dictionaries.lookupTermMeta(card.spelling, 12, this.settings.dictionaryPreferences).catch(() => [])
            : [];
        const jpdbUrl = `https://jpdb.io/vocabulary/${card.vid}/${encodeURIComponent(card.spelling)}/${encodeURIComponent(card.reading)}`;
        const cardPos = formatPartOfSpeech(card.partOfSpeech);
        const cardPosDetails = formatPartOfSpeechDetails(card.partOfSpeech);
        const language = this.settings.interfaceLanguage;

        setInnerHtml(popover, `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-header">
                <div class="jpdb-reader-heading">
                    <div class="jpdb-reader-title-row">
                        <div class="jpdb-reader-spelling jpdb-${state}">${renderSpellingForKanjiNavigation(card.spelling, language)}</div>
                        <a class="jpdb-reader-jpdb-pill" href="${jpdbUrl}" target="_blank" rel="noopener" title="${uiText(language, 'openOnJpdb')}" aria-label="${uiText(language, 'openOnJpdb')}: ${escapeHtml(card.spelling)}">JPDB ${externalLinkIcon()}</a>
                    </div>
                    ${card.reading !== card.spelling ? `<div class="jpdb-reader-reading">${escapeHtml(card.reading)}</div>` : ''}
                </div>
                <div class="jpdb-reader-card-tools">
                    ${this.settings.showPitchAccent ? renderPitch(card) : ''}
                    <button class="jpdb-reader-icon-btn jpdb-reader-audio-control" data-action="audio" type="button" aria-label="${uiText(language, 'playAudio')}" title="${uiText(language, 'playAudio')}">${speakerIcon()}</button>
                </div>
            </div>
            ${cardPos ? `<div class="jpdb-reader-pos" title="${escapeHtml(cardPosDetails)}">${escapeHtml(cardPos)}</div>` : ''}
            ${this.renderDefinitionSources(card, localEntries)}
            <div class="jpdb-reader-meta">
                ${card.frequencyRank ? `<span>#${card.frequencyRank}</span>` : ''}
                <span><span class="jpdb-reader-state-dot jpdb-${state}"></span>${escapeHtml(state)}</span>
            </div>
            ${this.renderTermMeta(metaEntries)}
            ${this.renderKanjiDefinitions(kanjiEntries)}
            <div class="jpdb-reader-actions">
                <div class="jpdb-reader-row" style="--cols: 3">
                    <button class="jpdb-reader-btn add" data-action="add">${uiText(language, 'add')}</button>
                    <button class="jpdb-reader-btn nf" data-action="neverforget">${card.cardState.includes('never-forget') ? uiText(language, 'forget') : uiText(language, 'never')}</button>
                    <button class="jpdb-reader-btn blacklist" data-action="blacklist">${card.cardState.includes('blacklisted') ? uiText(language, 'unlist') : uiText(language, 'blacklist')}</button>
                </div>
                ${this.settings.ankiEnabled ? `<div class="jpdb-reader-row" style="--cols: 1"><button class="jpdb-reader-btn anki" data-action="anki">${uiText(language, 'addToAnki')}</button></div>` : ''}
                ${this.settings.enableReviews ? this.renderReviewButtons() : ''}
            </div>
        `);

        if (requestId !== this.cardRenderRequest) return;
        popover.addEventListener('click', event => {
            const kanjiButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action="kanji"]');
            if (kanjiButton) {
                event.preventDefault();
                event.stopPropagation();
                void this.showKanjiCard(card, kanjiButton.dataset.kanji ?? '', sentence, anchor);
                return;
            }
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();
            void this.handleCardAction(button, card, sentence);
        });

        this.mountPopover(popover, anchor);
        if (options.autoPlay !== false && this.shouldAutoPlay(card)) void this.playAudio(card);
    }

    private shouldAutoPlay(card: JPDBCard): boolean {
        if (!this.settings.autoPlayAudio) return false;
        const key = `${card.vid}:${card.sid}`;
        const now = Date.now();
        if (key === this.lastAutoAudioKey && now - this.lastAutoAudioAt < 2500) return false;
        this.lastAutoAudioKey = key;
        this.lastAutoAudioAt = now;
        return true;
    }

    private async showKanjiCard(card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement): Promise<void> {
        if (!isKanjiCharacter(kanji)) return;
        const popover = this.createPopover();
        const kanjiCharacters = uniqueKanji(card.spelling);
        const index = Math.max(0, kanjiCharacters.indexOf(kanji));
        const previous = kanjiCharacters[(index - 1 + kanjiCharacters.length) % kanjiCharacters.length];
        const next = kanjiCharacters[(index + 1) % kanjiCharacters.length];
        const jpdbUrl = `https://jpdb.io/kanji/${encodeURIComponent(kanji)}`;
        const [jpdbInfo, kanjiEntries, rtkInfo, kanjiVGInfo, sourceInfo, similarTerms] = await Promise.all([
            this.jpdbKanji.lookup(kanji).catch(() => null),
            this.settings.localDictionariesEnabled
                ? this.dictionaries.lookupKanji(kanji, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
                : Promise.resolve([]),
            this.settings.rtkEnabled ? this.rtk.lookup(kanji).catch(() => null) : Promise.resolve(null),
            this.settings.kanjivgEnabled ? this.kanjiVG.lookup(kanji).catch(() => null) : Promise.resolve(null),
            this.settings.kanjiOriginsEnabled ? this.kanjiOrigin.lookup(kanji, this.settings).catch(() => null) : Promise.resolve(null),
            this.settings.similarKanjiWords && this.settings.localDictionariesEnabled
                ? this.dictionaries.lookupSimilarTermsByKanji(kanji, this.settings.similarKanjiWordLimit, this.settings.dictionaryPreferences).catch(() => [])
                : Promise.resolve([]),
        ]);
        const componentDictionaryLimit = Math.max(4, Math.min(this.settings.localDictionaryMaxResults, 12));
        const componentSummaries = rtkInfo?.componentKanji.length
            ? await Promise.all(rtkInfo.componentKanji.map(async component => ({
                kanji: component,
                rtk: this.settings.rtkEnabled ? await this.rtk.lookup(component).catch(() => null) : null,
                dictionary: this.settings.localDictionariesEnabled
                    ? await this.dictionaries.lookupKanji(component, componentDictionaryLimit, this.settings.dictionaryPreferences).catch(() => [])
                    : [],
            })))
            : [];
        const kanjiFacts = this.settings.kanjiOriginsEnabled
            ? buildKanjiFacts(kanji, jpdbInfo, rtkInfo, kanjiVGInfo, kanjiEntries, sourceInfo)
            : [];
        const originGraph = this.settings.kanjiOriginsEnabled
            ? buildKanjiOriginGraph(kanji, jpdbInfo, rtkInfo, kanjiEntries, sourceInfo)
            : null;
        const language = this.settings.interfaceLanguage;

        setInnerHtml(popover, `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-kanji-nav">
                <button class="jpdb-reader-icon-mini" type="button" data-action="word-back" title="${escapeHtml(`${uiText(language, 'backToWord')}: ${card.spelling}`)}">←</button>
                <span>${escapeHtml(card.spelling)}</span>
                ${kanjiCharacters.length > 1 ? `
                    <button class="jpdb-reader-icon-mini" type="button" data-action="kanji-prev" data-kanji="${escapeHtml(previous)}" title="${uiText(language, 'previousKanji')}">‹</button>
                    <button class="jpdb-reader-icon-mini" type="button" data-action="kanji-next" data-kanji="${escapeHtml(next)}" title="${uiText(language, 'nextKanji')}">›</button>
                ` : ''}
            </div>
            <div class="jpdb-reader-header">
                <div class="jpdb-reader-heading">
                    <div class="jpdb-reader-title-row jpdb-reader-kanji-title-row">
                        <div class="jpdb-reader-kanji-display">${escapeHtml(kanji)}</div>
                        ${renderKanjiKeywordLine(jpdbInfo, rtkInfo, kanjiEntries)}
                        <a class="jpdb-reader-jpdb-pill" href="${jpdbUrl}" target="_blank" rel="noopener" title="${uiText(language, 'openKanjiOnJpdb')}">JPDB ${externalLinkIcon()}</a>
                    </div>
                </div>
            </div>
            ${this.settings.kanjiOriginsEnabled ? renderKanjiOrigins(kanjiFacts, this.settings.kanjiOriginGraphEnabled ? originGraph : null, sourceInfo, this.settings, language) : ''}
            ${this.settings.kanjivgEnabled ? renderKanjiPractice(kanjiVGInfo, kanji, language) : ''}
            ${renderJpdbKanjiInfo(jpdbInfo, language)}
            ${renderRtkInfo(rtkInfo, componentSummaries, language)}
            ${this.renderKanjiDefinitions(kanjiEntries)}
            ${this.renderSimilarKanjiWords(similarTerms, jpdbInfo?.vocabulary ?? [], kanji, card)}
        `);

        popover.addEventListener('click', event => {
            const actionButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
            const action = actionButton?.dataset.action;
            if (!action) return;
            event.preventDefault();
            event.stopPropagation();
            if (action === 'word-back') void this.showCard(card, sentence, anchor, { autoPlay: false });
            if (action === 'kanji-prev' || action === 'kanji-next') void this.showKanjiCard(card, actionButton.dataset.kanji ?? kanji, sentence, anchor);
            if (action === 'kanji') void this.showKanjiCard(card, actionButton.dataset.kanji ?? kanji, sentence, anchor);
            if (action === 'similar-word') void this.lookupText(actionButton.dataset.expression ?? '', actionButton.dataset.expression ?? '');
        });
        this.mountPopover(popover, anchor);
        this.installKanjiDoodle(popover);
    }

    private installKanjiDoodle(popover: HTMLElement): void {
        const stage = popover.querySelector<HTMLElement>('.jpdb-reader-doodle-stage');
        const canvas = popover.querySelector<HTMLCanvasElement>('.jpdb-reader-doodle-canvas');
        const ghost = popover.querySelector<HTMLElement>('.jpdb-reader-doodle-ghost');
        const clear = popover.querySelector<HTMLButtonElement>('[data-doodle-clear]');
        const trace = popover.querySelector<HTMLButtonElement>('[data-doodle-trace]');
        if (!stage || !canvas || !ghost) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        type DoodlePoint = { x: number; y: number; pressure: number };
        let dpr = 1;
        let drawing = false;
        let pointerId = -1;
        let traceVisible = true;
        let points: DoodlePoint[] = [];
        let strokes: DoodlePoint[][] = [];

        const resize = () => {
            const rect = stage.getBoundingClientRect();
            dpr = Math.max(window.devicePixelRatio || 1, 1);
            canvas.width = Math.max(1, Math.round(rect.width * dpr));
            canvas.height = Math.max(1, Math.round(rect.height * dpr));
            redraw();
        };
        const toPoint = (event: PointerEvent): DoodlePoint => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(rect.width, 1))),
                y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(rect.height, 1))),
                pressure: Math.max(0.12, Math.min(1, event.pressure || 0.55)),
            };
        };
        const drawStroke = (stroke: DoodlePoint[]) => {
            if (!stroke.length) return;
            context.save();
            context.strokeStyle = '#141820';
            context.lineCap = 'round';
            context.lineJoin = 'round';
            context.beginPath();
            stroke.forEach((point, index) => {
                const x = point.x * canvas.width;
                const y = point.y * canvas.height;
                if (index === 0) context.moveTo(x, y);
                else context.lineTo(x, y);
            });
            const lastPoint = stroke[stroke.length - 1];
            const width = Math.max(3.2, Math.min(9.5, canvas.width * 0.014)) * dpr * (0.78 + (lastPoint?.pressure ?? 0.55) * 0.42);
            context.lineWidth = width;
            context.stroke();
            context.restore();
        };
        const redraw = () => {
            context.clearRect(0, 0, canvas.width, canvas.height);
            for (const stroke of strokes) drawStroke(stroke);
            drawStroke(points);
        };
        const start = (event: PointerEvent) => {
            event.preventDefault();
            event.stopPropagation();
            drawing = true;
            pointerId = event.pointerId;
            points = [toPoint(event)];
            canvas.setPointerCapture?.(event.pointerId);
            redraw();
        };
        const move = (event: PointerEvent) => {
            if (!drawing || event.pointerId !== pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            const point = toPoint(event);
            const last = points.at(-1);
            const minDistance = event.pointerType === 'pen' ? 0.0015 : 0.0035;
            if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= minDistance) {
                points.push(point);
                redraw();
            }
        };
        const end = (event: PointerEvent) => {
            if (!drawing || event.pointerId !== pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            if (points.length) strokes = [...strokes, points];
            points = [];
            drawing = false;
            pointerId = -1;
            canvas.releasePointerCapture?.(event.pointerId);
            redraw();
        };

        canvas.addEventListener('pointerdown', start, { passive: false });
        canvas.addEventListener('pointermove', move, { passive: false });
        canvas.addEventListener('pointerup', end, { passive: false });
        canvas.addEventListener('pointercancel', end, { passive: false });
        clear?.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            strokes = [];
            points = [];
            redraw();
        });
        trace?.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            traceVisible = !traceVisible;
            ghost.hidden = !traceVisible;
            trace.textContent = uiText(this.settings.interfaceLanguage, traceVisible ? 'hideTrace' : 'showTrace');
        });
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(stage);
        const disconnectWhenDetached = () => {
            if (!popover.isConnected) {
                resizeObserver.disconnect();
                return;
            }
            requestAnimationFrame(disconnectWhenDetached);
        };
        requestAnimationFrame(resize);
        requestAnimationFrame(disconnectWhenDetached);
    }

    private renderDefinitionSources(card: JPDBCard, entries: YomitanTermEntry[]): string {
        const grouped = groupTermEntriesByDictionary(entries);
        const sections = this.orderedDefinitionSourceIds([...grouped.keys()])
            .map(sourceId => {
                if (sourceId === JPDB_DEFINITION_SOURCE_ID) return this.renderJpdbDefinitionSource(card);
                return this.renderLocalDefinitionSource(sourceId, grouped.get(sourceId) ?? []);
            })
            .filter(Boolean);
        return sections.length
            ? `<div class="jpdb-reader-definition-stack">${sections.join('')}</div>`
            : `<div class="jpdb-reader-help jpdb-reader-no-definitions">${uiText(this.settings.interfaceLanguage, 'noDefinitions')}</div>`;
    }

    private orderedDefinitionSourceIds(dictionaryNames: string[]): string[] {
        const preferences = new Map(this.settings.dictionaryPreferences.map(item => [item.name, item]));
        const sources = [
            {
                id: JPDB_DEFINITION_SOURCE_ID,
                enabled: this.settings.jpdbDefinitionsEnabled,
                priority: this.settings.jpdbDefinitionsPriority,
                name: 'JPDB',
            },
            ...dictionaryNames.map((name, index) => {
                const preference = preferences.get(name);
                return {
                    id: name,
                    enabled: preference?.enabled ?? true,
                    priority: preference?.priority ?? 1000 + index,
                    name,
                };
            }),
        ];
        return sources
            .filter(source => source.enabled)
            .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
            .map(source => source.id);
    }

    private renderJpdbDefinitionSource(card: JPDBCard): string {
        const meanings = card.meanings.slice(0, 6)
            .map(meaning => `<div class="jpdb-reader-meaning">${escapeHtml(meaning.glosses.join('; '))}</div>`)
            .join('');
        if (!meanings) return '';
        return `
            <div class="jpdb-reader-local jpdb-reader-source-card" data-source="jpdb">
                <div class="jpdb-reader-local-title">JPDB</div>
                <div class="jpdb-reader-meanings">${meanings}</div>
            </div>
        `;
    }

    private renderLocalDefinitionSource(dictionary: string, entries: YomitanTermEntry[]): string {
        if (!entries.length) return '';
        return `
            <div class="jpdb-reader-local jpdb-reader-source-card" data-source="${escapeHtml(dictionary)}">
                <div class="jpdb-reader-local-title">${escapeHtml(this.dictionaryLabel(dictionary))}</div>
                ${entries.map(entry => `
                    <div class="jpdb-reader-local-entry">
                        <div class="jpdb-reader-local-head">
                            <span>${escapeHtml(entry.expression)}</span>
                            ${entry.reading && entry.reading !== entry.expression ? `<span class="jpdb-reader-local-reading">${escapeHtml(entry.reading)}</span>` : ''}
                            <span class="jpdb-reader-local-dict">${escapeHtml(entry.dictionary)}</span>
                        </div>
                        <div class="jpdb-reader-local-glossary">
                            ${entry.glossary.slice(0, 4).map(item => `<div>${glossaryToHtml(item)}</div>`).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    private renderKanjiDefinitions(entries: YomitanKanjiEntry[]): string {
        if (!entries.length) return '';
        return `
            <div class="jpdb-reader-local jpdb-reader-kanji">
                <div class="jpdb-reader-local-title">Kanji dictionaries</div>
                ${entries.map(entry => `
                    <div class="jpdb-reader-local-entry">
                        <div class="jpdb-reader-local-head">
                            <span class="jpdb-reader-kanji-char">${escapeHtml(entry.character)}</span>
                            <span class="jpdb-reader-local-dict">${escapeHtml(this.dictionaryLabel(entry.dictionary))}</span>
                        </div>
                        <div class="jpdb-reader-kanji-readings">
                            ${entry.onyomi.length ? `<span>On ${escapeHtml(entry.onyomi.join('、'))}</span>` : ''}
                            ${entry.kunyomi.length ? `<span>Kun ${escapeHtml(entry.kunyomi.join('、'))}</span>` : ''}
                        </div>
                        <div class="jpdb-reader-local-glossary">
                            ${entry.meanings.slice(0, 6).map(meaning => `<div>${escapeHtml(meaning)}</div>`).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    private renderSimilarKanjiWords(entries: YomitanTermEntry[], jpdbVocabulary: JpdbKanjiVocabulary[], kanji: string, currentCard: JPDBCard): string {
        const words = mergeSimilarKanjiWords(entries, jpdbVocabulary, currentCard, name => this.dictionaryLabel(name));
        if (!words.length) return '';
        return `
            <div class="jpdb-reader-local jpdb-reader-similar">
                <div class="jpdb-reader-local-title">Words using ${escapeHtml(kanji)}</div>
                <div class="jpdb-reader-similar-grid">
                    ${words.map(entry => `
                        <button class="jpdb-reader-similar-word" type="button" data-action="similar-word" data-expression="${escapeHtml(entry.expression)}" title="${escapeHtml(entry.source)}${entry.meaning ? `: ${escapeHtml(entry.meaning)}` : ''}">
                            <span>${escapeHtml(entry.expression)}</span>
                            ${entry.reading && entry.reading !== entry.expression ? `<small>${escapeHtml(entry.reading)}</small>` : ''}
                            ${entry.meaning ? `<small>${escapeHtml(entry.meaning)}</small>` : ''}
                            ${entry.frequency ? `<em>#${entry.frequency}</em>` : ''}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }

    private renderTermMeta(entries: YomitanMetaEntry[]): string {
        const items = entries
            .map(entry => this.renderMetaEntry(entry))
            .filter(Boolean)
            .slice(0, 8);
        if (!items.length) return '';
        return `<div class="jpdb-reader-meta jpdb-reader-dict-meta">${items.join('')}</div>`;
    }

    private renderMetaEntry(entry: YomitanMetaEntry): string {
        const label = this.dictionaryLabel(entry.dictionary);
        if (entry.mode === 'freq') {
            const value = formatMetaFrequency(entry.data);
            return value ? `<span class="jpdb-reader-chip" title="${escapeHtml(label)}">${escapeHtml(label)} ${escapeHtml(value)}</span>` : '';
        }
        if (entry.mode === 'pitch') {
            const value = formatMetaPitch(entry.data);
            return value ? `<span class="jpdb-reader-chip" title="${escapeHtml(label)}">pitch ${escapeHtml(value)}</span>` : '';
        }
        return '';
    }

    private dictionaryLabel(name: string): string {
        return this.settings.dictionaryPreferences.find(item => item.name === name)?.alias || name;
    }

    private renderReviewButtons(): string {
        if (this.settings.twoButtonReviews) {
            return `
                <div class="jpdb-reader-row" style="--cols: 2">
                    <button class="jpdb-reader-btn fail" data-action="grade" data-grade="fail">FAIL</button>
                    <button class="jpdb-reader-btn pass" data-action="grade" data-grade="pass">PASS</button>
                </div>
            `;
        }
        return `
            <div class="jpdb-reader-row jpdb-reader-grades" style="--cols: 5">
                <button class="jpdb-reader-btn nothing" data-action="grade" data-grade="nothing">NOTHING</button>
                <button class="jpdb-reader-btn something" data-action="grade" data-grade="something">SOMETHING</button>
                <button class="jpdb-reader-btn hard" data-action="grade" data-grade="hard">HARD</button>
                <button class="jpdb-reader-btn okay" data-action="grade" data-grade="okay">OKAY</button>
                <button class="jpdb-reader-btn easy" data-action="grade" data-grade="easy">EASY</button>
            </div>
        `;
    }

    private async handleCardAction(button: HTMLButtonElement, card: JPDBCard, sentence?: string): Promise<void> {
        if (button.disabled) return;
        button.disabled = true;
        const action = button.dataset.action;
        try {
            if (action === 'audio') await this.playAudio(card);
            if (action === 'add') {
                await this.jpdb.addToDeck(this.settings.miningDeck || 'forq', card, sentence);
                if (this.settings.addToForq && this.settings.miningDeck !== 'forq') await this.jpdb.addToDeck('forq', card, sentence);
                if (this.settings.ankiEnabled && this.settings.ankiMineWithJpdb) await this.addToAnki(card, sentence);
                this.toast(`${uiText(this.settings.interfaceLanguage, 'add')} JPDB.`);
            }
            if (action === 'anki') await this.addToAnki(card, sentence);
            if (action === 'neverforget') await this.toggleDeck(card, 'never-forget', this.settings.neverForgetDeck);
            if (action === 'blacklist') await this.toggleDeck(card, 'blacklisted', this.settings.blacklistDeck);
            if (action === 'grade') {
                await this.jpdb.reviewCard(card, button.dataset.grade as JPDBGrade);
                this.toast(this.settings.interfaceLanguage === 'ja' ? '復習を送信しました。' : 'Review sent.');
            }
            if (action !== 'audio') await this.showCard(card, sentence, undefined, { autoPlay: false });
        } catch (error) {
            this.toast(error instanceof Error ? error.message : 'Action failed.');
        } finally {
            button.disabled = false;
        }
    }

    private async addToAnki(card: JPDBCard, sentence?: string): Promise<void> {
        const [localEntries, kanjiEntries, metaEntries] = await Promise.all([
            this.settings.localDictionariesEnabled
                ? this.dictionaries.lookup(card.spelling, card.reading, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
                : Promise.resolve([]),
            this.settings.localDictionariesEnabled && this.settings.localDictionaryShowKanji
                ? this.dictionaries.lookupKanji(card.spelling, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
                : Promise.resolve([]),
            this.settings.localDictionariesEnabled
                ? this.dictionaries.lookupTermMeta(card.spelling, 12, this.settings.dictionaryPreferences).catch(() => [])
                : Promise.resolve([]),
        ]);
        const imageDataUrl = this.settings.ankiCaptureScreenshot ? captureActiveVideoFrame() : undefined;
        await this.anki.addCard(card, sentence, {
            imageDataUrl,
            localEntries,
            kanjiEntries,
            metaEntries,
            dictionaryPreferences: this.settings.dictionaryPreferences,
            sourceTitle: document.title,
            sourceUrl: location.href,
        });
        this.toast(imageDataUrl ? 'Added to Anki with image.' : 'Added to Anki.');
    }

    private async toggleDeck(card: JPDBCard, state: 'never-forget' | 'blacklisted', deck: string): Promise<void> {
        if (card.cardState.includes(state)) {
            await this.jpdb.removeFromDeck(deck, card);
            this.toast('Removed from deck.');
        } else {
            await this.jpdb.addToDeck(deck, card);
            this.toast('Added to deck.');
        }
    }

    private async playAudio(card: JPDBCard): Promise<void> {
        try {
            await this.audio.play(card);
        } catch (error) {
            this.toast(error instanceof Error ? error.message : 'Audio playback failed.');
        }
    }

    private showSettings(): void {
        const form = document.createElement('form');
        form.className = 'jpdb-reader-settings';
        form.dataset.jpdbReaderRoot = 'true';
        form.setAttribute('role', 'dialog');
        form.setAttribute('aria-modal', 'true');
        form.setAttribute('aria-label', SETTINGS_TITLE);
        form.tabIndex = -1;
        setInnerHtml(form, `
            <div class="jpdb-reader-settings-head">
                <h2>${SETTINGS_TITLE}</h2>
            </div>
            <div class="jpdb-reader-settings-tabs" role="tablist" aria-label="Settings sections">
                ${settingsTabButton('basics', 'Basics', true)}
                ${settingsTabButton('dictionaries', 'Dictionaries')}
                ${settingsTabButton('media', 'Media')}
                ${settingsTabButton('mining', 'Mining')}
                ${settingsTabButton('shortcuts', 'Shortcuts')}
                ${settingsTabButton('help', 'Help')}
            </div>
            <div class="jpdb-reader-settings-scroll">
            <fieldset data-settings-panel="basics">
                <legend>JPDB</legend>
                ${input('apiKey', `API key <a href="${JPDB_SETTINGS_URL}" target="_blank" rel="noopener">JPDB settings</a>`, this.settings.apiKey, 'password')}
                <div data-jpdb-decks>
                    ${renderDeckControls(this.settings, [], Boolean(this.settings.apiKey.trim()))}
                </div>
                ${checkbox('addToForq', 'Also add mined cards to forq', this.settings.addToForq)}
                ${checkbox('enableReviews', 'Enable review actions', this.settings.enableReviews)}
                <div data-review-config ${this.settings.enableReviews ? '' : 'hidden'}>
                    ${select('twoButtonReviews', 'Review rating scale', this.settings.twoButtonReviews ? 'true' : 'false', [['false', 'Five point: NOTHING to EASY'], ['true', 'Two point: FAIL / PASS']])}
                </div>
            </fieldset>
            <fieldset data-settings-panel="basics">
                <legend>Interface</legend>
                <div class="grid">
                    ${select('interfaceLanguage', 'Settings language', this.settings.interfaceLanguage, [['auto', 'Automatic'], ['en', 'English'], ['ja', '日本語']])}
                    ${select('theme', 'Theme', this.settings.theme, [['auto', 'Auto'], ['dark', 'Dark'], ['light', 'Light']])}
                    ${select('popupMode', 'Popup mode', this.settings.popupMode, [['auto', 'Auto'], ['sheet', 'Bottom sheet'], ['popover', 'Popover']])}
                    ${input('accentColor', 'Accent color', sanitizeAccentColor(this.settings.accentColor), 'color')}
                </div>
                <div class="jpdb-reader-help">よむ can be used with JPDB first, imported dictionaries first, or local dictionaries only for definitions. Configure source order in Dictionaries.</div>
            </fieldset>
            <fieldset data-settings-panel="media" hidden>
                <legend>Audio</legend>
                ${checkbox('audioEnabled', 'Enable audio playback for terms', this.settings.audioEnabled)}
                ${checkbox('autoPlayAudio', 'Auto-play search result audio', this.settings.autoPlayAudio)}
                ${checkbox('audioEnableDefaultSources', 'Use built-in audio sources', this.settings.audioEnableDefaultSources)}
                <div class="grid">
                    ${select('audioSelectionMode', 'When a source has several clips', this.settings.audioSelectionMode, [['first', 'First audio'], ['random', 'Random audio']])}
                    ${checkbox('audioViaBlob', 'Fetch as blob for iOS Tampermonkey', this.settings.audioViaBlob)}
                    ${input('audioTimeoutMs', 'Audio timeout (ms)', String(this.settings.audioTimeoutMs), 'number')}
                </div>
                <div class="jpdb-reader-audio-sources">
                    ${renderAudioSourceEditor(this.settings.audioSources)}
                </div>
                <div class="jpdb-reader-help">Supports {term}, {reading}, and {language}. See the <a href="${AUDIO_GUIDE_URL}" target="_blank" rel="noopener">Yomitan audio guide</a>.</div>
            </fieldset>
            <fieldset data-settings-panel="basics">
                <legend>Reader</legend>
                <div class="grid">
                    ${checkbox('parseSelection', 'Lookup selected text', this.settings.parseSelection)}
                    ${checkbox('lookupOnClick', 'Tap or click scanned words', this.settings.lookupOnClick)}
                    ${checkbox('lookupOnHover', 'Hover scanned words', this.settings.lookupOnHover)}
                    ${checkbox('autoScanJapanese', 'Auto-scan when Japanese is detected', this.settings.autoScanJapanese)}
                    ${checkbox('scanVisiblePage', 'Scan visible page on load', this.settings.scanVisiblePage)}
                    ${checkbox('showFloatingButton', 'Show floating puck on pages', this.settings.showFloatingButton)}
                    ${checkbox('showFurigana', 'Enable furigana annotations', this.settings.showFurigana)}
                    ${checkbox('showPitchAccent', 'Show pitch accent', this.settings.showPitchAccent)}
                    ${checkbox('hideKnownFurigana', 'Hide furigana for known cards only', this.settings.hideKnownFurigana)}
                </div>
                <div class="jpdb-reader-help">Hover lookup uses the shortcut below. Leave it blank for plain hover; keep click enabled if you also want tap lookup.</div>
            </fieldset>
            <fieldset data-settings-panel="basics">
                <legend>Kanji</legend>
                <div class="grid">
                    ${checkbox('kanjivgEnabled', 'Show stroke order and drawing pad', this.settings.kanjivgEnabled)}
                    ${checkbox('kanjiOriginsEnabled', 'Show kanji facts and origins map', this.settings.kanjiOriginsEnabled)}
                    ${checkbox('kanjiOriginKanjiMapEnabled', 'Use Kanji Alive and Kanji Map facts', this.settings.kanjiOriginKanjiMapEnabled)}
                    ${checkbox('kanjiOriginWiktionaryEnabled', 'Use Wiktionary origin notes', this.settings.kanjiOriginWiktionaryEnabled)}
                    ${checkbox('kanjiOriginGraphEnabled', 'Show component graph', this.settings.kanjiOriginGraphEnabled)}
                    ${checkbox('kanjiOriginRadicalImagesEnabled', 'Show radical images', this.settings.kanjiOriginRadicalImagesEnabled)}
                    ${checkbox('rtkEnabled', 'Show RTK information', this.settings.rtkEnabled)}
                    ${checkbox('similarKanjiWords', 'Show words using the same kanji', this.settings.similarKanjiWords)}
                    ${input('similarKanjiWordLimit', 'Similar word limit', String(this.settings.similarKanjiWordLimit), 'number')}
                </div>
                <div class="jpdb-reader-help">Click a kanji inside the popup word to see RTK, local kanji dictionary meanings, component keywords, and related words.</div>
            </fieldset>
            <fieldset data-settings-panel="media" hidden>
                <legend>Images</legend>
                <div class="grid">
                    ${checkbox('ocrEnabled', 'Read text in images', this.settings.ocrEnabled)}
                    ${checkbox('ocrAutoScanImages', 'Read images automatically', this.settings.ocrAutoScanImages)}
                    ${checkbox('ocrShowTextOverlay', 'Show recognized text on images', this.settings.ocrShowTextOverlay)}
                    ${select('ocrProvider', 'Image reading', this.settings.ocrProvider, [['google-lens', 'Google Lens (recommended)'], ['local-service', 'Local OCR app'], ['cloud-vision', 'Google Cloud Vision'], ['off', 'Off']])}
                    ${select('ocrMaxImagesPerPage', 'Images to read per page', String(this.settings.ocrMaxImagesPerPage), [['3', 'Light'], ['8', 'Normal'], ['16', 'More']])}
                    ${select('ocrMinImageArea', 'Smallest image to read', String(this.settings.ocrMinImageArea), [['80000', 'Large images only'], ['45000', 'Normal'], ['15000', 'Include small images']])}
                    ${select('ocrMaxImagePixels', 'Image detail', String(this.settings.ocrMaxImagePixels), [['640000', 'Faster'], ['1200000', 'Balanced'], ['2000000', 'Sharper']])}
                    ${input('ocrTextColor', 'Image text color', this.settings.ocrTextColor, 'color')}
                    ${input('ocrOutlineColor', 'Image text outline', this.settings.ocrOutlineColor, 'color')}
                    ${input('ocrBackgroundColor', 'Image highlight background', this.settings.ocrBackgroundColor, 'color')}
                    ${input('ocrBackgroundOpacity', 'Image highlight opacity', String(this.settings.ocrBackgroundOpacity), 'number')}
                    ${input('ocrFontScale', 'Image text scale', String(this.settings.ocrFontScale), 'number')}
                    <label data-local-ocr ${this.settings.ocrProvider === 'local-service' ? '' : 'hidden'}>Local OCR app URL<input name="ocrEndpointUrl" type="text" value="${escapeHtml(this.settings.ocrEndpointUrl)}" autocomplete="off"></label>
                    <div data-local-ocr ${this.settings.ocrProvider === 'local-service' ? '' : 'hidden'}>${select('ocrEngine', 'Local OCR engine', this.settings.ocrEngine, [['auto', 'Automatic'], ['MangaOCR', 'MangaOCR'], ['PaddleOCR', 'PaddleOCR'], ['AppleVision', 'Apple Vision']])}</div>
                    <label data-cloud-ocr ${this.settings.ocrProvider === 'cloud-vision' ? '' : 'hidden'}>Cloud Vision API key<input name="ocrCloudVisionApiKey" type="password" value="${escapeHtml(this.settings.ocrCloudVisionApiKey)}" autocomplete="off"></label>
                    <input type="hidden" name="ocrLanguage" value="${escapeHtml(this.settings.ocrLanguage)}">
                    <input type="hidden" name="ocrPrefetchMargin" value="${this.settings.ocrPrefetchMargin}">
                </div>
                <div class="jpdb-reader-help">Images are read quietly near the viewport. Google Lens handles normal images by default; embedded OCR metadata is instant. Recognized areas stay transparent until you tap or hover.</div>
            </fieldset>
            <fieldset data-settings-panel="media" hidden>
                <legend>Video</legend>
                <div class="grid">
                    ${checkbox('subtitlePlayerEnabled', 'Enable video subtitle player', this.settings.subtitlePlayerEnabled)}
                    ${checkbox('subtitleAutoDetect', 'Auto-detect page subtitles', this.settings.subtitleAutoDetect)}
                    ${checkbox('subtitleOverlayVisible', 'Show subtitle overlay', this.settings.subtitleOverlayVisible)}
                    ${checkbox('subtitleSecondaryVisible', 'Show native subtitles when available', this.settings.subtitleSecondaryVisible)}
                    ${checkbox('subtitleMiningPause', 'Pause video when mining subtitle', this.settings.subtitleMiningPause)}
                    ${select('subtitleControlsMode', 'Subtitle controls', this.settings.subtitleControlsMode, [['auto', 'Show when needed'], ['hidden', 'Hide controls'], ['always', 'Always visible']])}
                    ${input('subtitleFontSize', 'Subtitle font size', String(this.settings.subtitleFontSize), 'number')}
                    ${input('subtitleBottomOffset', 'Subtitle bottom offset (%)', String(this.settings.subtitleBottomOffset), 'number')}
                    ${input('subtitleTextColor', 'Subtitle color', this.settings.subtitleTextColor, 'color')}
                    ${input('subtitleOutlineColor', 'Subtitle outline', this.settings.subtitleOutlineColor, 'color')}
                    ${input('subtitleBackgroundColor', 'Subtitle background', this.settings.subtitleBackgroundColor, 'color')}
                    ${input('subtitleBackgroundOpacity', 'Subtitle background opacity', String(this.settings.subtitleBackgroundOpacity), 'number')}
                    ${input('subtitleFontFamily', 'Subtitle font family', this.settings.subtitleFontFamily)}
                    ${input('subtitleFontWeight', 'Subtitle font weight', String(this.settings.subtitleFontWeight), 'number')}
                    ${input('subtitleSeekPadding', 'Subtitle seek padding (seconds)', String(this.settings.subtitleSeekPadding), 'number')}
                </div>
            </fieldset>
            <fieldset data-settings-panel="media" hidden>
                <legend>YouTube</legend>
                <div class="grid">
                    ${checkbox('youtubeImmersionEnabled', 'Only show Japanese-looking YouTube videos', this.settings.youtubeImmersionEnabled)}
                    ${checkbox('youtubeShowFilterNotice', 'Show reveal control for hidden videos', this.settings.youtubeShowFilterNotice)}
                </div>
                <div class="jpdb-reader-help">Off by default. Turn it on when you want YouTube recommendations, search, and sidebars to stay focused on Japanese-looking video cards.</div>
            </fieldset>
            <fieldset data-settings-panel="mining" hidden>
                <legend>Anki</legend>
                <div class="grid">
                    ${checkbox('ankiEnabled', 'Enable Anki mining', this.settings.ankiEnabled)}
                    ${checkbox('ankiMineWithJpdb', 'Also add to Anki when adding to JPDB', this.settings.ankiMineWithJpdb)}
                    ${checkbox('ankiCaptureScreenshot', 'Attach video screenshot when possible', this.settings.ankiCaptureScreenshot)}
                    ${input('ankiConnectUrl', 'AnkiConnect URL', this.settings.ankiConnectUrl)}
                    ${input('ankiDeck', 'Anki deck', this.settings.ankiDeck)}
                    ${input('ankiModel', 'Anki note type', this.settings.ankiModel)}
                    ${input('ankiTags', 'Tags', this.settings.ankiTags)}
                </div>
                <div class="jpdb-reader-settings-actions">
                    <button class="jpdb-reader-btn" type="button" data-action="test-anki">Test Anki</button>
                </div>
                <div class="jpdb-reader-help" data-anki-status>Anki uses AnkiConnect on this Mac. The default creates a small Yomu note type automatically.</div>
            </fieldset>
            <fieldset data-settings-panel="dictionaries" hidden>
                <legend>Dictionaries</legend>
                <div class="grid">
                    ${checkbox('jpdbDefinitionsEnabled', 'Show JPDB definitions', this.settings.jpdbDefinitionsEnabled)}
                    ${checkbox('localDictionariesEnabled', 'Show imported dictionary definitions', this.settings.localDictionariesEnabled)}
                    ${checkbox('localDictionaryShowKanji', 'Show kanji dictionary cards', this.settings.localDictionaryShowKanji)}
                    ${input('localDictionaryMaxResults', 'Dictionary result limit', String(this.settings.localDictionaryMaxResults), 'number')}
                </div>
                <div class="jpdb-reader-dictionary-status" data-dictionary-status>Checking imported dictionaries...</div>
                <div class="jpdb-reader-dictionary-priorities">
                    ${renderDictionarySourceRows(this.settings)}
                </div>
                <div class="jpdb-reader-recommended-dictionaries" data-recommended-dictionaries>
                    ${renderRecommendedDictionaries([])}
                </div>
                <div class="jpdb-reader-settings-actions">
                    <button class="jpdb-reader-btn" type="button" data-action="import-yomitan-settings">Import settings JSON</button>
                    <button class="jpdb-reader-btn" type="button" data-action="export-reader-settings">Export settings JSON</button>
                    <button class="jpdb-reader-btn" type="button" data-action="import-yomitan-dictionary">Import dictionaries</button>
                    <button class="jpdb-reader-btn" type="button" data-action="export-yomitan-dictionary">Export dictionaries</button>
                </div>
                <input hidden type="file" data-file="settings" accept="application/json,.json">
                <input hidden type="file" data-file="dictionary" accept="application/json,.json,.zip,application/zip">
                <div class="jpdb-reader-help" data-import-status>Import Yomitan settings exports, Yomitan dictionary ZIPs, or exported dictionary backups.</div>
            </fieldset>
            <fieldset data-settings-panel="shortcuts" hidden>
                <legend>Shortcuts</legend>
                <div class="grid">
                    ${shortcutInput('shortcuts.hoverLookup', 'Hold while hovering', this.settings.shortcuts.hoverLookup, 'Blank means hover without a key')}
                    ${shortcutInput('shortcuts.scanPage', 'Scan page', this.settings.shortcuts.scanPage)}
                    ${shortcutInput('shortcuts.openSettings', 'Open settings', this.settings.shortcuts.openSettings)}
                    ${shortcutInput('shortcuts.playAudio', 'Play audio', this.settings.shortcuts.playAudio)}
                    ${shortcutInput('shortcuts.closePopup', 'Close popup', this.settings.shortcuts.closePopup)}
                    ${shortcutInput('shortcuts.previousSubtitle', 'Previous subtitle', this.settings.shortcuts.previousSubtitle)}
                    ${shortcutInput('shortcuts.nextSubtitle', 'Next subtitle', this.settings.shortcuts.nextSubtitle)}
                    ${shortcutInput('shortcuts.copySubtitle', 'Copy subtitle', this.settings.shortcuts.copySubtitle)}
                    ${shortcutInput('shortcuts.toggleOcr', 'Toggle image reading', this.settings.shortcuts.toggleOcr)}
                    ${shortcutInput('shortcuts.toggleYoutubeImmersion', 'Toggle YouTube filter', this.settings.shortcuts.toggleYoutubeImmersion)}
                    ${shortcutInput('shortcuts.scanImages', 'Read images now', this.settings.shortcuts.scanImages)}
                    ${renderReviewShortcutInputs(this.settings)}
                </div>
            </fieldset>
            <fieldset data-settings-panel="help" hidden>
                <legend>Support</legend>
                ${renderSupportPanel()}
            </fieldset>
            </div>
            <div class="footer">
                <button class="jpdb-reader-btn" type="button" data-action="cancel">Cancel</button>
                <button class="jpdb-reader-btn add" type="submit">Save</button>
            </div>
        `);
        localizeSettingsForm(form, this.settings.interfaceLanguage);

        const backdrop = this.createBackdrop();
        form.addEventListener('submit', event => {
            event.preventDefault();
            const data = new FormData(form);
            this.settings = readFormSettings(data, this.settings);
            void saveSettings(this.settings).then(() => {
                this.jpdb.clear();
                this.applyTheme();
                this.installFab();
                this.subtitles.refresh();
                this.ocr.refresh();
                this.youtube.refresh();
                this.scheduleAutoScan(100);
                this.settingsPreviewOriginalAccent = undefined;
                this.settingsPreviewOriginalLanguage = undefined;
                this.dismiss();
                this.toast('Settings saved.');
            });
        });
        form.querySelector('[data-action="cancel"]')?.addEventListener('click', () => this.dismiss());
        form.querySelector<HTMLInputElement>('input[name="accentColor"]')?.addEventListener('input', event => {
            this.applyAccentColor((event.currentTarget as HTMLInputElement).value);
        });
        form.querySelector<HTMLSelectElement>('select[name="interfaceLanguage"]')?.addEventListener('change', event => {
            const value = (event.currentTarget as HTMLSelectElement).value;
            if (value === 'auto' || value === 'en' || value === 'ja') {
                this.settings.interfaceLanguage = value;
                localizeSettingsForm(form, value);
                this.installFab();
            }
        });
        form.querySelector<HTMLSelectElement>('select[name="ocrProvider"]')?.addEventListener('change', event => {
            const value = (event.currentTarget as HTMLSelectElement).value;
            form.querySelectorAll<HTMLElement>('[data-local-ocr]').forEach(node => { node.hidden = value !== 'local-service'; });
            form.querySelectorAll<HTMLElement>('[data-cloud-ocr]').forEach(node => { node.hidden = value !== 'cloud-vision'; });
        });
        form.querySelector<HTMLInputElement>('input[name="enableReviews"]')?.addEventListener('change', () => syncReviewSettingsVisibility(form));
        form.querySelector<HTMLSelectElement>('select[name="twoButtonReviews"]')?.addEventListener('change', () => syncReviewSettingsVisibility(form));
        form.querySelector<HTMLInputElement>('input[name="apiKey"]')?.addEventListener('change', () => void this.refreshDeckControls(form));
        form.addEventListener('change', event => {
            const sourceSelect = (event.target as HTMLElement).closest<HTMLSelectElement>('select[name^="audioSources."][name$=".type"]');
            if (sourceSelect) syncAudioSourceRow(sourceSelect.closest('[data-audio-source-row]'), sourceSelect.value);
        });
        installShortcutCapture(form);
        installDictionarySourceDrag(form);
        form.addEventListener('click', event => {
            const control = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
            const action = control?.dataset.action;
            if (!action || action === 'cancel') return;
            event.preventDefault();
            event.stopPropagation();
            void this.handleSettingsAction(form, action, control);
        });
        this.dismiss();
        this.settingsPreviewOriginalAccent = this.settings.accentColor;
        this.settingsPreviewOriginalLanguage = this.settings.interfaceLanguage;
        document.body.append(backdrop, form);
        this.activeBackdrop = backdrop;
        this.activePopover = form;
        form.focus();
        void this.refreshDictionaryStatus(form);
        void this.refreshDeckControls(form);
    }

    private async refreshDeckControls(form: HTMLFormElement): Promise<void> {
        const container = form.querySelector<HTMLElement>('[data-jpdb-decks]');
        if (!container) return;
        const apiKey = form.querySelector<HTMLInputElement>('input[name="apiKey"]')?.value.trim() ?? this.settings.apiKey.trim();
        if (!apiKey) {
            setInnerHtml(container, renderDeckControls(this.settings, [], false));
            localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
            return;
        }

        const originalKey = this.settings.apiKey;
        this.settings.apiKey = apiKey;
        try {
            const decks = await this.jpdb.listDecks();
            setInnerHtml(container, renderDeckControls(readFormSettings(new FormData(form), this.settings), decks, true));
        } catch {
            setInnerHtml(container, renderDeckControls(readFormSettings(new FormData(form), this.settings), [], true));
        } finally {
            this.settings.apiKey = originalKey;
            localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
        }
    }

    private async refreshDictionaryStatus(form: HTMLFormElement): Promise<void> {
        const status = form.querySelector<HTMLElement>('[data-dictionary-status]');
        const priorities = form.querySelector<HTMLElement>('.jpdb-reader-dictionary-priorities');
        const recommended = form.querySelector<HTMLElement>('[data-recommended-dictionaries]');
        try {
            const summary = await this.dictionaries.summary();
            const names = summary.dictionaries.map(item => item.title);
            const merged = mergeDictionaryPreferences(this.settings.dictionaryPreferences, names);
            if (merged.length !== this.settings.dictionaryPreferences.length) {
                this.settings.dictionaryPreferences = merged;
                await saveSettings(this.settings);
            }
            if (status) {
                status.textContent = summary.dictionaries.length
                    ? `${summary.dictionaries.length} dictionaries, ${summary.terms.toLocaleString()} terms, ${summary.kanji.toLocaleString()} kanji, ${summary.termMeta.toLocaleString()} metadata rows.`
                    : 'No local dictionaries imported yet.';
            }
            if (priorities) setInnerHtml(priorities, renderDictionarySourceRows(this.settings));
            if (recommended) setInnerHtml(recommended, renderRecommendedDictionaries(summary.dictionaries));
            localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
        } catch (error) {
            if (status) status.textContent = error instanceof Error ? error.message : 'Dictionary status unavailable.';
        }
    }

    private async handleSettingsAction(form: HTMLFormElement, action: string, control?: HTMLElement | null): Promise<void> {
        const status = form.querySelector<HTMLElement>('[data-import-status]');
        const setStatus = (message: string) => {
            if (status) status.textContent = message;
        };

        try {
            if (action === 'settings-panel') {
                activateSettingsPanel(form, control?.dataset.panel ?? 'basics');
                return;
            }

            if (action === 'dictionary-source-up' || action === 'dictionary-source-down') {
                updateDictionarySourceEditor(form, action, control);
                return;
            }

            if (action === 'audio-source-add' || action === 'audio-source-remove' || action === 'audio-source-up' || action === 'audio-source-down') {
                updateAudioSourceEditor(form, action, control);
                localizeSettingsForm(form, getFormInterfaceLanguage(form, this.settings.interfaceLanguage));
                return;
            }

            if (action === 'refresh-dictionaries') {
                setStatus('Refreshing installed dictionaries...');
                await this.refreshDictionaryStatus(form);
                setStatus('Dictionary list refreshed.');
                return;
            }

            if (action === 'download-starter-dictionaries') {
                const summary = await this.dictionaries.summary();
                const missing = RECOMMENDED_JAPANESE_DICTIONARIES.filter(dictionary => !isRecommendedDictionaryInstalled(dictionary, summary.dictionaries));
                if (!missing.length) {
                    setStatus('Recommended dictionaries are already installed.');
                    await this.refreshDictionaryStatus(form);
                    return;
                }
                control?.setAttribute('disabled', 'true');
                let importedEntries = 0;
                for (const [index, dictionary] of missing.entries()) {
                    setStatus(`Downloading ${index + 1}/${missing.length}: ${dictionary.name}...`);
                    const imported = await this.dictionaries.importFromUrl(dictionary.downloadUrl, recommendedDictionaryFilename(dictionary), message => setStatus(`${index + 1}/${missing.length} ${message}`));
                    importedEntries += imported.entries;
                    this.settings.dictionaryPreferences = mergeDictionaryPreferences(this.settings.dictionaryPreferences, imported.dictionaries);
                    await saveSettings(this.settings);
                }
                setStatus(`Downloaded ${missing.length} dictionaries: ${importedEntries.toLocaleString()} records imported.`);
                await this.refreshDictionaryStatus(form);
                return;
            }

            if (action === 'import-yomitan-settings') {
                const file = await pickFile(form, 'settings');
                if (!file) return;
                const json = JSON.parse(await file.text()) as unknown;
                const readerSettings = getReaderSettingsExport(json);
                if (readerSettings) {
                    this.settings = { ...this.settings, ...readerSettings, shortcuts: { ...this.settings.shortcuts, ...readerSettings.shortcuts } };
                } else {
                    const imported = parseYomitanSettingsExport(json);
                    this.settings = {
                        ...this.settings,
                        ...imported.settings,
                        shortcuts: {
                            ...this.settings.shortcuts,
                            ...(imported.settings.shortcuts ?? {}),
                        },
                    };
                }
                const importedNames = (await this.dictionaries.summary().catch(() => ({ dictionaries: [] }))).dictionaries.map(item => item.title);
                this.settings.dictionaryPreferences = mergeDictionaryPreferences(this.settings.dictionaryPreferences, importedNames);
                await saveSettings(this.settings);
                setStatus('Settings imported.');
                this.applyTheme();
                this.installFab();
                this.subtitles.refresh();
                this.youtube.refresh();
                this.settingsPreviewOriginalAccent = undefined;
                this.showSettings();
                return;
            }

            if (action === 'export-reader-settings') {
                downloadBlob(new Blob([JSON.stringify({
                    formatName: 'yomu-reader-settings',
                    formatVersion: 1,
                    exportedAt: new Date().toISOString(),
                    settings: this.settings,
                }, null, 2)], { type: 'application/json' }), `yomu-settings-${dateStamp()}.json`);
                setStatus('Settings exported.');
                return;
            }

            if (action === 'import-yomitan-dictionary') {
                const file = await pickFile(form, 'dictionary');
                if (!file) return;
                const summary = await this.dictionaries.importFile(file, message => setStatus(message));
                this.settings.dictionaryPreferences = mergeDictionaryPreferences(this.settings.dictionaryPreferences, summary.dictionaries);
                await saveSettings(this.settings);
                setStatus(`Imported ${summary.entries.toLocaleString()} records from ${summary.dictionaries.length} dictionary source${summary.dictionaries.length === 1 ? '' : 's'}.`);
                this.showSettings();
                return;
            }

            if (action === 'download-recommended-dictionary') {
                const dictionaryId = control?.dataset.dictionaryId;
                const dictionary = dictionaryId ? findRecommendedDictionary(dictionaryId) : undefined;
                if (!dictionary) throw new Error('Recommended dictionary not found.');
                control?.setAttribute('disabled', 'true');
                setStatus(`${control?.dataset.installed === 'true' ? 'Updating' : 'Downloading'} ${dictionary.name}...`);
                const summary = await this.dictionaries.importFromUrl(dictionary.downloadUrl, recommendedDictionaryFilename(dictionary), message => setStatus(message));
                this.settings.dictionaryPreferences = mergeDictionaryPreferences(this.settings.dictionaryPreferences, summary.dictionaries);
                await saveSettings(this.settings);
                setStatus(`${dictionary.name}: ${summary.entries.toLocaleString()} records imported.`);
                await this.refreshDictionaryStatus(form);
                return;
            }

            if (action === 'test-anki') {
                const ankiStatus = form.querySelector<HTMLElement>('[data-anki-status]');
                const previous = this.settings;
                this.settings = readFormSettings(new FormData(form), this.settings);
                try {
                    const connected = await this.anki.isConnected();
                    if (!connected) throw new Error('AnkiConnect is not reachable. Open Anki and confirm the AnkiConnect add-on is enabled.');
                    await this.anki.ensureDeckAndModel();
                    if (ankiStatus) ankiStatus.textContent = `Connected. Deck "${this.settings.ankiDeck}" and note type "${this.settings.ankiModel}" are ready.`;
                } finally {
                    this.settings = previous;
                }
                return;
            }

            if (action === 'copy-discord') {
                await copyText(SUPPORT_LINKS.discordUsername);
                this.toast(`Copied Discord username: ${SUPPORT_LINKS.discordUsername}`);
                return;
            }

            if (action === 'export-yomitan-dictionary') {
                const blob = await this.dictionaries.exportJson();
                downloadBlob(blob, `yomu-dictionaries-${dateStamp()}.json`);
                setStatus('Dictionaries exported.');
            }
        } catch (error) {
            if (action === 'download-recommended-dictionary' || action === 'download-starter-dictionaries') control?.removeAttribute('disabled');
            setStatus(error instanceof Error ? error.message : 'Import failed.');
        }
    }

    private createPopover(): HTMLElement {
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        popover.setAttribute('role', 'dialog');
        popover.setAttribute('aria-modal', 'true');
        popover.tabIndex = -1;
        if (this.shouldUseSheet()) popover.classList.add('jpdb-reader-sheet');
        return popover;
    }

    private mountPopover(popover: HTMLElement, anchor?: HTMLElement): void {
        const backdrop = this.createBackdrop();
        this.dismiss();
        document.body.append(backdrop, popover);
        this.activeBackdrop = backdrop;
        this.activePopover = popover;

        if (!popover.classList.contains('jpdb-reader-sheet')) {
            positionPopover(popover, anchor);
        } else {
            this.installSheetHandle(popover);
        }
        popover.focus();
    }

    private installSheetHandle(popover: HTMLElement): void {
        const handle = popover.querySelector<HTMLElement>('.jpdb-reader-sheet-handle');
        if (!handle) return;
        handle.setAttribute('role', 'button');
        handle.setAttribute('tabindex', '0');
        handle.setAttribute('aria-label', 'Drag to close, or tap to expand');
        handle.setAttribute('aria-expanded', String(popover.classList.contains('jpdb-reader-sheet-expanded')));
        let startY = 0;
        let lastY = 0;
        let pointerId = 0;
        let dragging = false;
        let moved = false;

        const reset = () => {
            popover.style.transition = 'transform .16s ease';
            popover.style.transform = '';
            window.setTimeout(() => { popover.style.transition = ''; }, 180);
        };
        const toggleExpanded = () => {
            const expanded = !popover.classList.contains('jpdb-reader-sheet-expanded');
            popover.classList.toggle('jpdb-reader-sheet-expanded', expanded);
            handle.setAttribute('aria-expanded', String(expanded));
        };
        const finish = () => {
            handle.releasePointerCapture?.(pointerId);
            if (!dragging) return;
            const delta = Math.max(0, lastY - startY);
            dragging = false;
            if (delta > 90) this.dismiss();
            else reset();
        };

        handle.addEventListener('click', event => {
            event.preventDefault();
            if (moved) {
                moved = false;
                return;
            }
            toggleExpanded();
        });
        handle.addEventListener('pointerdown', event => {
            startY = event.clientY;
            lastY = event.clientY;
            pointerId = event.pointerId;
            dragging = true;
            moved = false;
            popover.style.transition = '';
            handle.setPointerCapture?.(event.pointerId);
        });
        handle.addEventListener('pointermove', event => {
            if (!dragging) return;
            lastY = event.clientY;
            const delta = Math.max(0, lastY - startY);
            if (delta > 8) moved = true;
            popover.style.transform = `translateY(${delta}px)`;
        });
        handle.addEventListener('pointerup', finish);
        handle.addEventListener('pointercancel', () => {
            dragging = false;
            moved = false;
            handle.releasePointerCapture?.(pointerId);
            reset();
        });
        handle.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleExpanded();
            }
            if (event.key === 'Escape') this.dismiss();
        });
    }

    private createBackdrop(): HTMLElement {
        const backdrop = document.createElement('div');
        backdrop.className = 'jpdb-reader-backdrop';
        backdrop.dataset.jpdbReaderRoot = 'true';
        backdrop.addEventListener('click', () => this.dismiss());
        return backdrop;
    }

    private shouldUseSheet(): boolean {
        if (this.settings.popupMode === 'sheet') return true;
        if (this.settings.popupMode === 'popover') return false;
        return window.innerWidth <= 768 || matchMedia('(pointer: coarse)').matches;
    }

    private dismiss(): void {
        this.cardRenderRequest++;
        if (this.settingsPreviewOriginalAccent !== undefined && this.activePopover?.classList.contains('jpdb-reader-settings')) {
            this.applyAccentColor(this.settingsPreviewOriginalAccent);
        }
        if (this.settingsPreviewOriginalLanguage !== undefined && this.activePopover?.classList.contains('jpdb-reader-settings')) {
            this.settings.interfaceLanguage = this.settingsPreviewOriginalLanguage;
        }
        this.settingsPreviewOriginalAccent = undefined;
        this.settingsPreviewOriginalLanguage = undefined;
        this.activePopover?.remove();
        this.activeBackdrop?.remove();
        document.querySelectorAll('[data-jpdb-reader-root].jpdb-reader-popover, [data-jpdb-reader-root].jpdb-reader-settings, [data-jpdb-reader-root].jpdb-reader-backdrop')
            .forEach(element => element.remove());
        this.activePopover = undefined;
        this.activeBackdrop = undefined;
    }

    private toast(message: string): void {
        const toast = document.createElement('div');
        toast.className = 'jpdb-reader-toast';
        toast.dataset.jpdbReaderRoot = 'true';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.textContent = message;
        document.body.appendChild(toast);
        window.setTimeout(() => toast.remove(), 3200);
    }
}

function pauseActiveVideo(): void {
    const videos = Array.from(document.querySelectorAll('video'));
    const playable = videos
        .filter(video => video.readyState > 0)
        .sort((a, b) => {
            const aArea = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
            const bArea = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
            return Number(a.paused) - Number(b.paused) || bArea - aArea;
        });
    playable[0]?.pause();
}

function isEditableTarget(target: EventTarget | null): boolean {
    const element = target instanceof Element ? target : null;
    return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'));
}

async function copyText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch {
            // Fall through to the legacy path for userscript/browser contexts.
        }
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
}

function normalizePressedKey(key: string): string {
    if (key === ' ') return 'space';
    return key.length === 1 ? key.toLowerCase() : key.toLowerCase();
}

function mutationTouchesAsbPlayer(mutation: MutationRecord): boolean {
    const nodes = [
        mutation.target,
        ...Array.from(mutation.addedNodes),
    ];
    return nodes.some(node => {
        const element = node.nodeType === Node.ELEMENT_NODE
            ? node as Element
            : node.parentElement;
        return Boolean(element?.closest?.('.asbplayer-offscreen, .asbplayer-subtitles-container-bottom'));
    });
}

function mutationInsideReaderRoot(mutation: MutationRecord): boolean {
    const nodes = [
        mutation.target,
        ...Array.from(mutation.addedNodes),
        ...Array.from(mutation.removedNodes),
    ];
    return nodes.every(node => {
        const element = node.nodeType === Node.ELEMENT_NODE
            ? node as Element
            : node.parentElement;
        return Boolean(element?.closest?.('[data-jpdb-reader-root]'));
    });
}

function pickTokenForSelection(tokens: JPDBToken[] = [], selected: string): JPDBToken | undefined {
    const exact = tokens.find(token => token.card.spelling === selected || token.card.reading === selected);
    if (exact) return exact;

    return tokens.find(token => selected.includes(token.card.spelling) || token.card.spelling.includes(selected));
}

function formatMetaFrequency(value: unknown): string {
    if (typeof value === 'number' || typeof value === 'string') return `#${value}`;
    if (!value || typeof value !== 'object') return '';
    const record = value as Record<string, unknown>;
    const display = record.displayValue ?? record.frequency ?? record.value;
    if (display == null) return '';
    return `#${String(display)}`;
}

function formatMetaPitch(value: unknown): string {
    if (!value || typeof value !== 'object') return '';
    const record = value as Record<string, unknown>;
    const positions = Array.isArray(record.pitches) ? record.pitches : Array.isArray(record.positions) ? record.positions : [];
    if (positions.length) return positions.slice(0, 4).map(String).join(', ');
    if (typeof record.position === 'number') return String(record.position);
    return '';
}

function renderSpellingForKanjiNavigation(spelling: string, language: InterfaceLanguage): string {
    return Array.from(spelling).map(character => isKanjiCharacter(character)
        ? `<button class="jpdb-reader-kanji-inline" type="button" data-action="kanji" data-kanji="${escapeHtml(character)}" title="${escapeHtml(`${uiText(language, 'showKanji')}: ${character}`)}">${escapeHtml(character)}</button>`
        : `<span>${escapeHtml(character)}</span>`,
    ).join('');
}

function groupTermEntriesByDictionary(entries: YomitanTermEntry[]): Map<string, YomitanTermEntry[]> {
    const grouped = new Map<string, YomitanTermEntry[]>();
    for (const entry of entries) {
        const group = grouped.get(entry.dictionary) ?? [];
        group.push(entry);
        grouped.set(entry.dictionary, group);
    }
    return grouped;
}

function mergeSimilarKanjiWords(
    localEntries: YomitanTermEntry[],
    jpdbVocabulary: JpdbKanjiVocabulary[],
    currentCard: JPDBCard,
    dictionaryLabel: (name: string) => string,
): Array<{ expression: string; reading: string; meaning: string; frequency?: number; source: string }> {
    const currentKeys = new Set([`${currentCard.spelling}\n${currentCard.reading}`, `${currentCard.spelling}\n`]);
    const words = new Map<string, { expression: string; reading: string; meaning: string; frequency?: number; source: string }>();
    const add = (entry: { expression: string; reading: string; meaning: string; frequency?: number; source: string }) => {
        const key = `${entry.expression}\n${entry.reading}`;
        if (currentKeys.has(key) || entry.expression === currentCard.spelling) return;
        const existing = words.get(key);
        if (existing) {
            existing.meaning ||= entry.meaning;
            existing.frequency ??= entry.frequency;
            if (!existing.source.includes(entry.source)) existing.source = `${existing.source} · ${entry.source}`;
            return;
        }
        words.set(key, entry);
    };

    jpdbVocabulary.forEach(entry => add({
        expression: entry.expression,
        reading: entry.reading,
        meaning: entry.meaning,
        source: 'JPDB used-in word',
    }));
    localEntries.forEach(entry => add({
        expression: entry.expression,
        reading: entry.reading,
        meaning: entry.glossary.map(glossaryToText).filter(Boolean).join('; ').slice(0, 140),
        frequency: entry.jpdbFrequency,
        source: dictionaryLabel(entry.dictionary),
    }));

    return Array.from(words.values()).sort((a, b) =>
        compareOptionalNumber(a.frequency, b.frequency)
        || a.expression.length - b.expression.length
        || a.expression.localeCompare(b.expression),
    );
}

function renderKanjiKeywordLine(jpdbInfo: JpdbKanjiInfo | null, rtkInfo: RtkInfo | null, entries: YomitanKanjiEntry[]): string {
    const keywords = new Map<string, { text: string; sources: string[] }>();
    const addKeyword = (text: string | undefined, source: string) => {
        const normalized = text?.trim();
        if (!normalized) return;
        const key = normalized.toLocaleLowerCase();
        const existing = keywords.get(key) ?? { text: normalized, sources: [] };
        if (!existing.sources.includes(source)) existing.sources.push(source);
        keywords.set(key, existing);
    };
    addKeyword(jpdbInfo?.keyword, 'JPDB');
    addKeyword(rtkInfo?.keyword, 'RTK');
    entries.flatMap(entry => entry.meanings).filter(Boolean).forEach(keyword => addKeyword(keyword, 'local dictionary'));
    const chips = Array.from(keywords.values()).slice(0, 8)
        .map(keyword => `<span class="jpdb-reader-kanji-keyword" title="${escapeHtml(keyword.sources.join(' · '))}">${escapeHtml(keyword.text)}</span>`)
        .join('');
    return chips ? `<div class="jpdb-reader-kanji-keywords">${chips}</div>` : '<div class="jpdb-reader-help">Kanji details are not available yet.</div>';
}

function splitRtkElements(value: string): string[] {
    return [...new Set(value
        .split(/[、,;＋+]/)
        .map(item => item.trim())
        .filter(Boolean))]
        .slice(0, 16);
}

function compareOptionalNumber(a?: number, b?: number): number {
    if (a === undefined && b === undefined) return 0;
    if (a === undefined) return 1;
    if (b === undefined) return -1;
    return a - b;
}

function renderKanjiPractice(info: KanjiVGInfo | null, kanji: string, language: InterfaceLanguage): string {
    const ghost = info?.svg || `<div class="jpdb-reader-doodle-text-ghost">${escapeHtml(kanji)}</div>`;
    return `
        <div class="jpdb-reader-local jpdb-reader-kanjivg">
            <div class="jpdb-reader-local-title">${uiText(language, 'strokePractice')}</div>
            <div class="jpdb-reader-doodle-stage" data-kanji="${escapeHtml(kanji)}">
                <div class="jpdb-reader-doodle-ghost" aria-hidden="true">${ghost}</div>
                <canvas class="jpdb-reader-doodle-canvas" aria-label="${escapeHtml(`${uiText(language, 'practiceDrawing')} ${kanji}`)}"></canvas>
            </div>
            <div class="jpdb-reader-doodle-tools">
                <span class="jpdb-reader-help">${info ? `${info.strokeCount} ${uiText(language, 'strokes')}` : uiText(language, 'textTrace')}</span>
                <button class="jpdb-reader-mini-btn" type="button" data-doodle-trace>${uiText(language, 'hideTrace')}</button>
                <button class="jpdb-reader-mini-btn" type="button" data-doodle-clear>${uiText(language, 'clear')}</button>
            </div>
        </div>
    `;
}

function renderKanjiOrigins(facts: KanjiFact[], graph: KanjiOriginGraph | null, sourceInfo: KanjiSourceInfo | null, settings: ReaderSettings, language: InterfaceLanguage): string {
    if (!facts.length && (!graph || graph.nodes.length <= 1) && !sourceInfo?.kanjiMap && !sourceInfo?.wiktionary) return '';
    const graphNodes = graph?.nodes ?? [];
    const edges = graph?.edges ?? [];
    const map = sourceInfo?.kanjiMap;
    const wiktionary = sourceInfo?.wiktionary;
    const radical = map?.radical;
    const sourceLinks = [
        map?.sourceUrl ? `<a href="${escapeHtml(map.sourceUrl)}" target="_blank" rel="noopener">${uiText(language, 'kanjiMapData')} ${externalLinkIcon()}</a>` : '',
        map?.kanjiAliveUrl ? `<a href="${escapeHtml(map.kanjiAliveUrl)}" target="_blank" rel="noopener">${uiText(language, 'kanjiAlive')} ${externalLinkIcon()}</a>` : '',
        wiktionary?.pageUrl ? `<a href="${escapeHtml(wiktionary.pageUrl)}" target="_blank" rel="noopener">${uiText(language, 'wiktionary')} ${externalLinkIcon()}</a>` : '',
    ].filter(Boolean).join('');
    return `
        <div class="jpdb-reader-local jpdb-reader-origins">
            <div class="jpdb-reader-local-title">${uiText(language, 'originStructure')}</div>
            ${facts.length ? `<div class="jpdb-reader-kanji-facts">
                ${facts.map(fact => `<span title="${escapeHtml(fact.source)}"><strong>${escapeHtml(fact.label)}</strong>${escapeHtml(fact.value)}</span>`).join('')}
            </div>` : ''}
            ${graphNodes.length > 1 ? `<div class="jpdb-reader-origin-map" aria-label="${uiText(language, 'originMapLabel')}">
                ${graphNodes.map(node => node.kind === 'related' ? `
                    <div class="jpdb-reader-origin-node ${node.kind}" title="${escapeHtml(node.source)}">
                        <strong>${escapeHtml(node.label)}</strong>
                        ${node.detail ? `<small>${escapeHtml(node.detail)}</small>` : ''}
                    </div>
                ` : `
                    <button class="jpdb-reader-origin-node ${node.kind}" type="button" data-action="kanji" data-kanji="${escapeHtml(node.id)}" title="${escapeHtml([node.detail, node.source].filter(Boolean).join(' · '))}">
                        <strong>${escapeHtml(node.label)}</strong>
                        ${node.detail ? `<small>${escapeHtml(node.detail)}</small>` : ''}
                    </button>
                `).join('')}
                ${edges.length ? `<div class="jpdb-reader-origin-edges">
                    ${edges.map(edge => `<span>${escapeHtml(edge.from.replace(/^rtk:\d+:/, ''))} → ${escapeHtml(edge.to)} <small>${escapeHtml(edge.label)}</small></span>`).join('')}
                </div>` : ''}
            </div>` : ''}
            ${map ? `<div class="jpdb-reader-origin-detail">
                ${map.meaning ? `<p><strong>${escapeHtml(map.meaning)}</strong>${map.kunyomi.length || map.onyomi.length ? ` <span>${escapeHtml([...map.kunyomi.slice(0, 3), ...map.onyomi.slice(0, 3)].join(' · '))}</span>` : ''}</p>` : ''}
                ${radical ? `<div class="jpdb-reader-radical-card">
                    ${settings.kanjiOriginRadicalImagesEnabled && radical.image ? `<img src="${escapeHtml(radical.image)}" alt="${escapeHtml(radical.meaning || radical.name || uiText(language, 'radical'))}" loading="lazy">` : ''}
                    <div>
                        <strong>${escapeHtml([radical.symbol, ...radical.forms].filter(Boolean).join(' / ') || uiText(language, 'radical'))}</strong>
                        <span>${escapeHtml([radical.reading, radical.name, radical.meaning, radical.position, radical.strokes ? `${radical.strokes} ${uiText(language, 'strokes')}` : ''].filter(Boolean).join(' · '))}</span>
                    </div>
                </div>` : ''}
                ${map.examples.length ? `<div class="jpdb-reader-origin-examples">
                    ${map.examples.slice(0, 4).map(example => `<button type="button" data-action="similar-word" data-expression="${escapeHtml(example.expression)}" title="${escapeHtml(example.meaning)}">
                        <strong>${escapeHtml(example.expression)}</strong>
                        ${example.reading ? `<span>${escapeHtml(example.reading)}</span>` : ''}
                        ${example.meaning ? `<small>${escapeHtml(example.meaning)}</small>` : ''}
                    </button>`).join('')}
                </div>` : ''}
            </div>` : ''}
            ${wiktionary ? `<details class="jpdb-reader-origin-wiktionary">
                <summary>${uiText(language, 'historicalNotes')}</summary>
                ${wiktionary.images.length ? `<div class="jpdb-reader-origin-images">
                    ${wiktionary.images.map(image => `<img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" loading="lazy">`).join('')}
                </div>` : ''}
                ${[...wiktionary.glyphOrigin, ...wiktionary.etymology].slice(0, 4).map(text => `<p>${escapeHtml(text)}</p>`).join('')}
            </details>` : ''}
            ${sourceLinks ? `<div class="jpdb-reader-origin-sources">${sourceLinks}</div>` : ''}
        </div>
    `;
}

function renderSupportPanel(): string {
    return `
        <div class="jpdb-reader-support-card">
            <div>
                <div class="jpdb-reader-support-title">Free Japanese reading and mining tools</div>
                <p>よむ brings popup lookup, JPDB mining, imported dictionaries, subtitles, image reading, and Anki export into one free userscript. Comparable study suites such as <a href="${SUPPORT_LINKS.migakuPricing}" target="_blank" rel="noopener">Migaku</a> currently advertise paid plans from $10/month; よむ offers the same core reading-and-mining workflow for free.</p>
                <p>Donations are optional. They help cover the time, testing devices, services, and maintenance that keep the reader polished.</p>
            </div>
            <div class="jpdb-reader-support-actions">
                <a class="jpdb-reader-btn add" href="${SUPPORT_LINKS.paypal}" target="_blank" rel="noopener" data-support-link="paypal">Donate</a>
                <a class="jpdb-reader-btn" href="${SUPPORT_LINKS.issues}" target="_blank" rel="noopener" data-support-link="issues">Report issue</a>
                <a class="jpdb-reader-btn" href="${SUPPORT_LINKS.github}" target="_blank" rel="noopener" data-support-link="github">GitHub</a>
                <button class="jpdb-reader-btn" type="button" data-action="copy-discord" data-support-link="discord">Copy Discord</button>
            </div>
            <div class="jpdb-reader-help">Discord: ${SUPPORT_LINKS.discordUsername}</div>
        </div>
    `;
}

function renderJpdbKanjiInfo(info: JpdbKanjiInfo | null, language: InterfaceLanguage): string {
    if (!info) return '';
    const infoChips = [
        info.type,
        info.kanken ? `Kanken ${info.kanken.replace(/^Level\s*/i, '')}` : '',
        info.oldForms.length ? `Old ${info.oldForms.join('、')}` : '',
    ].filter(Boolean).map(item => `<span class="jpdb-reader-chip">${escapeHtml(item)}</span>`).join('');
    return `
        <div class="jpdb-reader-local jpdb-reader-jpdb-kanji">
            <div class="jpdb-reader-local-title">${uiText(language, 'readingsComponents')}</div>
            <div class="jpdb-reader-local-entry">
                ${infoChips ? `<div class="jpdb-reader-kanji-keywords">${infoChips}</div>` : ''}
                ${info.readings.length ? `<div class="jpdb-reader-kanji-readings">
                    ${info.readings.slice(0, 8).map(reading => `<span>${escapeHtml(reading.reading)}${reading.share ? ` ${escapeHtml(reading.share)}` : ''}</span>`).join('')}
                </div>` : ''}
                ${info.components.length ? `<div class="jpdb-reader-component-grid">
                    ${info.components.map(component => `<button class="jpdb-reader-component-card" type="button" data-action="kanji" data-kanji="${escapeHtml(component.kanji)}" title="${escapeHtml(`${uiText(language, 'showKanji')}: ${component.kanji}`)}">
                        <strong>${escapeHtml(component.kanji)}</strong>
                        <span>${escapeHtml(component.keyword)}</span>
                    </button>`).join('')}
                </div>` : ''}
                ${info.mnemonic ? `<details><summary>${uiText(language, 'jpdbMnemonic')}</summary><p>${escapeHtml(info.mnemonic)}</p></details>` : ''}
            </div>
        </div>
    `;
}

function renderRtkInfo(info: RtkInfo | null, components: Array<{ kanji: string; rtk: RtkInfo | null; dictionary: YomitanKanjiEntry[] }>, language: InterfaceLanguage): string {
    if (!info) return '';
    const elementKeywords = splitRtkElements(info.elements);
    const componentByKeyword = new Map(
        components
            .filter(component => component.rtk?.keyword)
            .map(component => [component.rtk?.keyword.toLowerCase(), component.kanji] as const),
    );
    return `
        <div class="jpdb-reader-local jpdb-reader-rtk">
            <div class="jpdb-reader-local-title">RTK</div>
            <div class="jpdb-reader-local-entry">
                <div class="jpdb-reader-rtk-head">
                    <strong>${escapeHtml(info.keyword)}</strong>
                    ${info.frameNumber ? `<span>${escapeHtml(info.frameNumber)}</span>` : ''}
                </div>
                ${info.onYomi || info.kunYomi ? `<div class="jpdb-reader-kanji-readings">
                    ${info.onYomi ? `<span>${uiText(language, 'onReading')} ${escapeHtml(info.onYomi)}</span>` : ''}
                    ${info.kunYomi ? `<span>${uiText(language, 'kunReading')} ${escapeHtml(info.kunYomi)}</span>` : ''}
                </div>` : ''}
                ${elementKeywords.length ? `<div class="jpdb-reader-rtk-elements" aria-label="${uiText(language, 'rtkComponentKeywords')}">
                    ${elementKeywords.map(keyword => {
                        const componentKanji = componentByKeyword.get(keyword.toLowerCase());
                        return componentKanji
                            ? `<button type="button" data-action="kanji" data-kanji="${escapeHtml(componentKanji)}" title="${escapeHtml(`${uiText(language, 'showKanji')}: ${componentKanji}`)}">${escapeHtml(keyword)}</button>`
                            : `<span>${escapeHtml(keyword)}</span>`;
                    }).join('')}
                </div>` : ''}
                ${components.length ? `<div class="jpdb-reader-component-grid">
                    ${components.map(component => {
                        const meanings = [...new Set(component.dictionary.flatMap(entry => entry.meanings))].slice(0, 6);
                        return `<button class="jpdb-reader-component-card" type="button" data-action="kanji" data-kanji="${escapeHtml(component.kanji)}" title="${escapeHtml(`${uiText(language, 'showKanji')}: ${component.kanji}`)}">
                            <strong>${escapeHtml(component.kanji)}</strong>
                            ${component.rtk?.keyword ? `<span>${escapeHtml(component.rtk.keyword)}</span>` : ''}
                            ${meanings.length ? `<small>${escapeHtml(meanings.join(', '))}</small>` : ''}
                        </button>`;
                    }).join('')}
                </div>` : ''}
                ${info.heisigStory ? `<details><summary>${uiText(language, 'heisigStory')}</summary><p>${escapeHtml(info.heisigStory)}</p></details>` : ''}
                ${info.heisigComment ? `<details><summary>${uiText(language, 'heisigComment')}</summary><p>${escapeHtml(info.heisigComment)}</p></details>` : ''}
                ${info.koohiiStories.length ? `<details><summary>${uiText(language, 'koohiiStories')}</summary>${info.koohiiStories.map(story => `<p>${escapeHtml(story)}</p>`).join('')}</details>` : ''}
            </div>
        </div>
    `;
}

function renderPitch(card: JPDBCard): string {
    const [pitch] = card.pitchAccent;
    if (!pitch) return '';

    const morae = splitMorae(card.reading);
    const highs = Array.from(pitch).filter(ch => ch === 'H' || ch === 'L').slice(0, morae.length);
    if (highs.length < 2) return '';

    const width = morae.length * 24 + 18;
    const points = highs.map((level, index) => `${9 + index * 24},${level === 'H' ? 10 : 29}`).join(' ');
    const cls = getPitchClassName(pitch);
    return `<div class="jpdb-reader-pitch"><svg width="${width}" height="46" viewBox="0 0 ${width} 46" aria-hidden="true">
        <polyline class="${cls}" points="${points}"></polyline>
        ${highs.map((level, index) => `<circle cx="${9 + index * 24}" cy="${level === 'H' ? 10 : 29}" r="3"></circle>`).join('')}
        ${morae.map((mora, index) => `<text x="${9 + index * 24}" y="44" text-anchor="middle">${escapeHtml(mora)}</text>`).join('')}
    </svg></div>`;
}

function externalLinkIcon(): string {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 17 17 7"></path>
        <path d="M9 7h8v8"></path>
    </svg>`;
}

function speakerIcon(): string {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M11 5 6.8 8.4H4.5v7.2h2.3L11 19V5Z"></path>
        <path d="M15.2 8.2a5 5 0 0 1 0 7.6"></path>
        <path d="M17.8 5.7a8.4 8.4 0 0 1 0 12.6"></path>
    </svg>`;
}

function uniqueKanji(value: string): string[] {
    return [...new Set(Array.from(value).filter(isKanjiCharacter))];
}

function isKanjiCharacter(value: string): boolean {
    const code = value.codePointAt(0) ?? 0;
    return code >= 0x3400 && code <= 0x9fff;
}

function splitMorae(reading: string): string[] {
    const small = new Set('ゃゅょャュョァィゥェォ');
    const morae: string[] = [];
    for (const char of Array.from(reading)) {
        if (morae.length && small.has(char)) morae[morae.length - 1] += char;
        else morae.push(char);
    }
    return morae;
}

function getPitchClassName(pitch: string): string {
    const drops = (pitch.match(/HL/g) ?? []).length;
    const rises = (pitch.match(/LH/g) ?? []).length;
    if (pitch.startsWith('H') && drops === 1) return 'atamadaka';
    if (pitch.startsWith('L') && rises === 1 && !pitch.endsWith('L')) return 'heiban';
    if (pitch.startsWith('L') && rises === 1 && pitch.endsWith('L')) return 'nakadaka';
    if (rises > 1 || drops > 1) return 'kifuku';
    return 'odaka';
}

function positionPopover(popover: HTMLElement, anchor?: HTMLElement): void {
    const selection = window.getSelection();
    const rect = anchor?.getBoundingClientRect()
        ?? (selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : undefined);
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    const fallbackLeft = (window.innerWidth - width) / 2;
    const fallbackTop = window.innerHeight * 0.18;
    const left = rect ? rect.left + (rect.width - width) / 2 : fallbackLeft;
    const top = rect && rect.top > height + 10 ? rect.top - height - 8 : (rect ? rect.bottom + 8 : fallbackTop);
    popover.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`;
    popover.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`;
}

function input(name: string, label: string, value: string, type = 'text'): string {
    return `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}" autocomplete="off"></label>`;
}

function shortcutInput(name: string, label: string, value: string, placeholder = 'Press keys'): string {
    return `<label>${label}<input data-shortcut-input name="${name}" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" inputmode="none"></label>`;
}

function checkbox(name: string, label: string, checked: boolean): string {
    return `<label class="inline"><input name="${name}" type="checkbox" ${checked ? 'checked' : ''}>${label}</label>`;
}

function select(name: string, label: string, value: string, options: [string, string][]): string {
    return `<label>${label}<select name="${name}">${options.map(([optionValue, text]) =>
        `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? 'selected' : ''}>${escapeHtml(text)}</option>`,
    ).join('')}</select></label>`;
}

function getFormInterfaceLanguage(form: HTMLFormElement, fallback: InterfaceLanguage): InterfaceLanguage {
    const value = getNamedControl<HTMLSelectElement>(form, 'interfaceLanguage')?.value;
    return value === 'auto' || value === 'en' || value === 'ja' ? value : fallback;
}

function localizeSettingsForm(form: HTMLFormElement, language: InterfaceLanguage): void {
    const text = (key: Parameters<typeof uiText>[1]) => uiText(language, key);
    form.setAttribute('aria-label', text('settingsTitle'));
    form.querySelector('h2')?.replaceChildren(text('settingsTitle'));

    const tabLabels: Record<string, Parameters<typeof uiText>[1]> = {
        basics: 'basics',
        dictionaries: 'dictionaries',
        media: 'media',
        mining: 'mining',
        shortcuts: 'shortcuts',
        help: 'help',
    };
    Object.entries(tabLabels).forEach(([panel, key]) => {
        form.querySelector<HTMLButtonElement>(`[data-action="settings-panel"][data-panel="${panel}"]`)?.replaceChildren(text(key));
    });

    [
        'JPDB',
        text('interface'),
        text('audio'),
        text('reader'),
        text('kanji'),
        text('images'),
        text('video'),
        text('youtube'),
        text('anki'),
        text('dictionaries'),
        text('shortcuts'),
        text('support'),
    ].forEach((label, index) => {
        const legend = form.querySelectorAll('fieldset > legend')[index];
        legend?.replaceChildren(label);
    });

    const labelKeys: Array<[string, Parameters<typeof uiText>[1]]> = [
        ['apiKey', 'apiKey'],
        ['addToForq', 'addToForq'],
        ['enableReviews', 'enableReviews'],
        ['twoButtonReviews', 'reviewRatingScale'],
        ['interfaceLanguage', 'settingsLanguage'],
        ['theme', 'theme'],
        ['popupMode', 'popupMode'],
        ['accentColor', 'accentColor'],
        ['parseSelection', 'parseSelection'],
        ['lookupOnClick', 'lookupOnClick'],
        ['lookupOnHover', 'lookupOnHover'],
        ['autoScanJapanese', 'autoScanJapanese'],
        ['scanVisiblePage', 'scanVisiblePage'],
        ['showFloatingButton', 'showFloatingButton'],
        ['showFurigana', 'showFurigana'],
        ['showPitchAccent', 'showPitchAccent'],
        ['hideKnownFurigana', 'hideKnownFurigana'],
        ['kanjivgEnabled', 'kanjivgEnabled'],
        ['kanjiOriginsEnabled', 'kanjiOriginsEnabled'],
        ['kanjiOriginKanjiMapEnabled', 'kanjiOriginKanjiMapEnabled'],
        ['kanjiOriginWiktionaryEnabled', 'kanjiOriginWiktionaryEnabled'],
        ['kanjiOriginGraphEnabled', 'kanjiOriginGraphEnabled'],
        ['kanjiOriginRadicalImagesEnabled', 'kanjiOriginRadicalImagesEnabled'],
        ['rtkEnabled', 'rtkEnabled'],
        ['similarKanjiWords', 'similarKanjiWords'],
        ['similarKanjiWordLimit', 'similarKanjiWordLimit'],
        ['audioEnabled', 'audioEnabled'],
        ['autoPlayAudio', 'autoPlayAudio'],
        ['audioEnableDefaultSources', 'audioEnableDefaultSources'],
        ['audioSelectionMode', 'audioSelectionMode'],
        ['audioViaBlob', 'audioViaBlob'],
        ['audioTimeoutMs', 'audioTimeoutMs'],
        ['ocrEnabled', 'ocrEnabled'],
        ['ocrAutoScanImages', 'ocrAutoScanImages'],
        ['ocrShowTextOverlay', 'ocrShowTextOverlay'],
        ['ocrProvider', 'ocrProvider'],
        ['ocrMaxImagesPerPage', 'ocrMaxImagesPerPage'],
        ['ocrMinImageArea', 'ocrMinImageArea'],
        ['ocrMaxImagePixels', 'ocrMaxImagePixels'],
        ['ocrTextColor', 'ocrTextColor'],
        ['ocrOutlineColor', 'ocrOutlineColor'],
        ['ocrBackgroundColor', 'ocrBackgroundColor'],
        ['ocrBackgroundOpacity', 'ocrBackgroundOpacity'],
        ['ocrFontScale', 'ocrFontScale'],
        ['ocrEndpointUrl', 'ocrEndpointUrl'],
        ['ocrEngine', 'ocrEngine'],
        ['ocrCloudVisionApiKey', 'cloudVisionApiKey'],
        ['subtitlePlayerEnabled', 'subtitlePlayerEnabled'],
        ['subtitleAutoDetect', 'subtitleAutoDetect'],
        ['subtitleOverlayVisible', 'subtitleOverlayVisible'],
        ['subtitleSecondaryVisible', 'subtitleSecondaryVisible'],
        ['subtitleMiningPause', 'subtitleMiningPause'],
        ['subtitleControlsMode', 'subtitleControlsMode'],
        ['subtitleFontSize', 'subtitleFontSize'],
        ['subtitleBottomOffset', 'subtitleBottomOffset'],
        ['subtitleTextColor', 'subtitleTextColor'],
        ['subtitleOutlineColor', 'subtitleOutlineColor'],
        ['subtitleBackgroundColor', 'subtitleBackgroundColor'],
        ['subtitleBackgroundOpacity', 'subtitleBackgroundOpacity'],
        ['subtitleFontFamily', 'subtitleFontFamily'],
        ['subtitleFontWeight', 'subtitleFontWeight'],
        ['subtitleSeekPadding', 'subtitleSeekPadding'],
        ['youtubeImmersionEnabled', 'youtubeImmersionEnabled'],
        ['youtubeShowFilterNotice', 'youtubeShowFilterNotice'],
        ['ankiEnabled', 'ankiEnabled'],
        ['ankiMineWithJpdb', 'ankiMineWithJpdb'],
        ['ankiCaptureScreenshot', 'ankiCaptureScreenshot'],
        ['ankiConnectUrl', 'ankiConnectUrl'],
        ['ankiDeck', 'ankiDeck'],
        ['ankiModel', 'ankiModel'],
        ['ankiTags', 'ankiTags'],
        ['jpdbDefinitionsEnabled', 'jpdbDefinitionsEnabled'],
        ['localDictionariesEnabled', 'localDictionariesEnabled'],
        ['localDictionaryShowKanji', 'localDictionaryShowKanji'],
        ['localDictionaryMaxResults', 'localDictionaryMaxResults'],
        ['shortcuts.hoverLookup', 'holdWhileHovering'],
        ['shortcuts.scanPage', 'scanPage'],
        ['shortcuts.openSettings', 'openSettings'],
        ['shortcuts.playAudio', 'playAudio'],
        ['shortcuts.closePopup', 'closePopup'],
        ['shortcuts.previousSubtitle', 'previousSubtitle'],
        ['shortcuts.nextSubtitle', 'nextSubtitle'],
        ['shortcuts.copySubtitle', 'copySubtitle'],
        ['shortcuts.toggleOcr', 'toggleImageReading'],
        ['shortcuts.toggleYoutubeImmersion', 'toggleYoutubeImmersion'],
        ['shortcuts.scanImages', 'readImagesNow'],
        ['shortcuts.gradeNothing', 'gradeNothing'],
        ['shortcuts.gradeSomething', 'gradeSomething'],
        ['shortcuts.gradeHard', 'gradeHard'],
        ['shortcuts.gradeOkay', 'gradeOkay'],
        ['shortcuts.gradeEasy', 'gradeEasy'],
        ['shortcuts.gradeFail', 'gradeFail'],
        ['shortcuts.gradePass', 'gradePass'],
    ];
    labelKeys.forEach(([name, key]) => setControlLabel(form, name, text(key)));

    const jpdbSettings = form.querySelector<HTMLAnchorElement>('label a[href*="jpdb.io/settings"]');
    if (jpdbSettings) jpdbSettings.textContent = text('jpdbSettings');

    setSelectOptionLabels(form, 'interfaceLanguage', [
        ['auto', text('automatic')],
        ['en', text('english')],
        ['ja', text('japanese')],
    ]);
    setSelectOptionLabels(form, 'theme', [
        ['auto', text('auto')],
        ['dark', text('dark')],
        ['light', text('light')],
    ]);
    setSelectOptionLabels(form, 'popupMode', [
        ['auto', text('auto')],
        ['sheet', text('bottomSheet')],
        ['popover', text('popover')],
    ]);
    setSelectOptionLabels(form, 'twoButtonReviews', [
        ['false', text('fivePoint')],
        ['true', text('twoPoint')],
    ]);
    setSelectOptionLabels(form, 'audioSelectionMode', [
        ['first', text('firstAudio')],
        ['random', text('randomAudio')],
    ]);
    setSelectOptionLabels(form, 'ocrProvider', [
        ['google-lens', text('googleLens')],
        ['local-service', text('localOcr')],
        ['cloud-vision', text('cloudVision')],
        ['off', text('off')],
    ]);
    setSelectOptionLabels(form, 'ocrMaxImagesPerPage', [
        ['3', text('lightWork')],
        ['8', text('normal')],
        ['16', text('more')],
    ]);
    setSelectOptionLabels(form, 'ocrMinImageArea', [
        ['80000', text('largeOnly')],
        ['45000', text('normal')],
        ['15000', text('includeSmall')],
    ]);
    setSelectOptionLabels(form, 'ocrMaxImagePixels', [
        ['640000', text('faster')],
        ['1200000', text('balanced')],
        ['2000000', text('sharper')],
    ]);
    setSelectOptionLabels(form, 'ocrEngine', [
        ['auto', text('automatic')],
        ['MangaOCR', 'MangaOCR'],
        ['PaddleOCR', 'PaddleOCR'],
        ['AppleVision', 'Apple Vision'],
    ]);
    setSelectOptionLabels(form, 'subtitleControlsMode', [
        ['auto', text('showWhenNeeded')],
        ['hidden', text('hideControls')],
        ['always', text('alwaysVisible')],
    ]);

    setShortcutPlaceholder(form, 'shortcuts.hoverLookup', text('blankPlainHover'));
    form.querySelectorAll<HTMLInputElement>('[data-shortcut-input]').forEach(inputEl => {
        if (inputEl.name !== 'shortcuts.hoverLookup') inputEl.placeholder = text('pressKeys');
    });

    setFieldsetHelp(form, 1, text('interfaceHelp'));
    setFieldsetHelp(form, 3, text('readerHelp'));
    setFieldsetHelp(form, 4, text('kanjiHelp'));
    setFieldsetHelp(form, 5, text('ocrHelp'));
    setFieldsetHelp(form, 7, text('youtubeHelp'));
    setFieldsetHelp(form, 8, text('ankiHelp'));
    const audioHelp = getFieldsetHelp(form, 2);
    if (audioHelp) {
        setInnerHtml(audioHelp, `${escapeHtml(text('audioHelp').replace('Yomitan audio guide.', '').replace('Yomitan音声ガイドも参照できます。', ''))}<a href="${AUDIO_GUIDE_URL}" target="_blank" rel="noopener">Yomitan audio guide</a>.`);
    }
    const importStatus = form.querySelector<HTMLElement>('[data-import-status]');
    if (importStatus && /Import Yomitan|Yomitan設定/.test(importStatus.textContent ?? '')) importStatus.textContent = text('dictionaryImportHelp');

    const localOcrLabel = getNamedControl<HTMLInputElement>(form, 'ocrEndpointUrl')?.closest('label');
    if (localOcrLabel) setBlockLabelText(localOcrLabel, text('ocrEndpointUrl'));
    const cloudOcrLabel = getNamedControl<HTMLInputElement>(form, 'ocrCloudVisionApiKey')?.closest('label');
    if (cloudOcrLabel) setBlockLabelText(cloudOcrLabel, text('cloudVisionApiKey'));

    form.querySelector<HTMLButtonElement>('[data-action="test-anki"]')?.replaceChildren(text('testAnki'));
    form.querySelector<HTMLButtonElement>('[data-action="import-yomitan-settings"]')?.replaceChildren(text('importSettings'));
    form.querySelector<HTMLButtonElement>('[data-action="export-reader-settings"]')?.replaceChildren(text('exportSettings'));
    form.querySelector<HTMLButtonElement>('[data-action="import-yomitan-dictionary"]')?.replaceChildren(text('importDictionaries'));
    form.querySelector<HTMLButtonElement>('[data-action="export-yomitan-dictionary"]')?.replaceChildren(text('exportDictionaries'));
    form.querySelector<HTMLButtonElement>('[data-action="audio-source-add"]')?.replaceChildren(text('addAudioSource'));
    form.querySelector<HTMLButtonElement>('[data-action="download-starter-dictionaries"]')?.replaceChildren(text('downloadMissingRecommended'));
    form.querySelector<HTMLButtonElement>('[data-action="refresh-dictionaries"]')?.replaceChildren(text('refreshInstalledList'));
    form.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.replaceChildren(text('cancel'));
    form.querySelector<HTMLButtonElement>('button[type="submit"]')?.replaceChildren(text('save'));

    const audioHead = form.querySelectorAll('.jpdb-reader-audio-source-head span');
    audioHead[1]?.replaceChildren(text('audioSource'));
    audioHead[2]?.replaceChildren(text('urlVoice'));
    const dictionaryTitle = form.querySelector('.jpdb-reader-recommended-title');
    dictionaryTitle?.replaceChildren(text('recommendedDownloads'));
    form.querySelectorAll<HTMLAnchorElement>('.jpdb-reader-recommended-name a').forEach(link => { link.textContent = text('homepage'); });
    form.querySelectorAll<HTMLButtonElement>('[data-action="download-recommended-dictionary"]').forEach(button => {
        button.textContent = button.dataset.installed === 'true' ? text('update') : text('download');
    });
    const dictionaryStatus = form.querySelector<HTMLElement>('[data-dictionary-status]');
    if (dictionaryStatus && /Checking imported|インポート済み辞書を確認/.test(dictionaryStatus.textContent ?? '')) {
        dictionaryStatus.textContent = text('checkingDictionaries');
    }

    localizeSupportPanel(form, language);
}

function getNamedControl<T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(form: HTMLFormElement, name: string): T | null {
    return Array.from(form.elements).find((element): element is T =>
        (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)
        && element.name === name,
    ) ?? null;
}

function setControlLabel(form: HTMLFormElement, name: string, label: string): void {
    const control = getNamedControl(form, name);
    const labelElement = control?.closest('label');
    if (!labelElement) return;
    if (labelElement.classList.contains('inline')) setInlineLabelText(labelElement, label);
    else setBlockLabelText(labelElement, label);
}

function setBlockLabelText(label: Element, text: string): void {
    const textNode = Array.from(label.childNodes).find(node => node.nodeType === Node.TEXT_NODE) as Text | undefined;
    if (textNode) textNode.textContent = text;
    else label.insertBefore(document.createTextNode(text), label.firstChild);
}

function setInlineLabelText(label: Element, text: string): void {
    const textNode = Array.from(label.childNodes).find(node => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim()) as Text | undefined;
    if (textNode) textNode.textContent = text;
    else label.append(document.createTextNode(text));
}

function setSelectOptionLabels(form: HTMLFormElement, name: string, options: Array<[string, string]>): void {
    const selectElement = getNamedControl<HTMLSelectElement>(form, name);
    if (!selectElement) return;
    options.forEach(([value, label]) => {
        const option = Array.from(selectElement.options).find(item => item.value === value);
        if (option) option.textContent = label;
    });
}

function setShortcutPlaceholder(form: HTMLFormElement, name: string, placeholder: string): void {
    const inputElement = getNamedControl<HTMLInputElement>(form, name);
    if (inputElement) inputElement.placeholder = placeholder;
}

function getFieldsetHelp(form: HTMLFormElement, index: number): HTMLElement | null {
    const fieldset = form.querySelectorAll('fieldset')[index];
    return Array.from(fieldset?.children ?? []).find((child): child is HTMLElement =>
        child instanceof HTMLElement && child.classList.contains('jpdb-reader-help'),
    ) ?? null;
}

function setFieldsetHelp(form: HTMLFormElement, index: number, text: string): void {
    const help = getFieldsetHelp(form, index);
    if (help) help.textContent = text;
}

function localizeSupportPanel(form: HTMLFormElement, language: InterfaceLanguage): void {
    const support = form.querySelector<HTMLElement>('.jpdb-reader-support-card');
    if (!support) return;
    const text = (key: Parameters<typeof uiText>[1]) => uiText(language, key);
    support.querySelector('.jpdb-reader-support-title')?.replaceChildren(text('supportTitle'));
    const paragraphs = support.querySelectorAll('p');
    paragraphs[0]?.replaceChildren(text('supportCopy'));
    paragraphs[1]?.replaceChildren(text('supportDonation'));
    support.querySelector<HTMLElement>('[data-support-link="paypal"]')?.replaceChildren(text('donate'));
    support.querySelector<HTMLElement>('[data-support-link="issues"]')?.replaceChildren(text('reportIssue'));
    support.querySelector<HTMLElement>('[data-support-link="github"]')?.replaceChildren(text('github'));
    support.querySelector<HTMLElement>('[data-support-link="discord"]')?.replaceChildren(text('copyDiscord'));
}

function renderReviewShortcutInputs(settings: ReaderSettings): string {
    const fivePointHidden = !settings.enableReviews || settings.twoButtonReviews;
    const passFailHidden = !settings.enableReviews || !settings.twoButtonReviews;
    return `
        <div class="jpdb-reader-shortcut-group" data-review-scale="five" ${fivePointHidden ? 'hidden' : ''}>
            ${shortcutInput('shortcuts.gradeNothing', 'Grade NOTHING', settings.shortcuts.gradeNothing)}
            ${shortcutInput('shortcuts.gradeSomething', 'Grade SOMETHING', settings.shortcuts.gradeSomething)}
            ${shortcutInput('shortcuts.gradeHard', 'Grade HARD', settings.shortcuts.gradeHard)}
            ${shortcutInput('shortcuts.gradeOkay', 'Grade OKAY', settings.shortcuts.gradeOkay)}
            ${shortcutInput('shortcuts.gradeEasy', 'Grade EASY', settings.shortcuts.gradeEasy)}
        </div>
        <div class="jpdb-reader-shortcut-group" data-review-scale="pass-fail" ${passFailHidden ? 'hidden' : ''}>
            ${shortcutInput('shortcuts.gradeFail', 'Pass/fail: FAIL', settings.shortcuts.gradeFail)}
            ${shortcutInput('shortcuts.gradePass', 'Pass/fail: PASS', settings.shortcuts.gradePass)}
        </div>
    `;
}

function activateSettingsPanel(form: HTMLFormElement, panel: string): void {
    form.querySelectorAll<HTMLElement>('[data-settings-panel]').forEach(section => {
        section.hidden = section.dataset.settingsPanel !== panel;
    });
    form.querySelectorAll<HTMLButtonElement>('[data-action="settings-panel"]').forEach(button => {
        const active = button.dataset.panel === panel;
        button.setAttribute('aria-selected', String(active));
    });
}

function renderAudioSourceEditor(sources: AudioSourceSetting[]): string {
    return `
        <div class="jpdb-reader-audio-source-head">
            <span>#</span>
            <span>Audio source</span>
            <span>URL / voice</span>
            <span></span>
        </div>
        ${renderAudioSourceRows(audioSourceRowsForSettings(sources))}
        <button class="jpdb-reader-btn" type="button" data-action="audio-source-add">Add audio source</button>
    `;
}

function renderAudioSourceRows(rows: AudioSourceSetting[]): string {
    const count = rows.length;

    return `
        <input type="hidden" name="audioSourceCount" value="${count}">
        ${rows.map((source, index) => `
            <div class="jpdb-reader-audio-source-row" data-audio-source-row data-index="${index}">
                <label class="inline jpdb-reader-audio-index">
                    <input name="audioSources.${index}.enabled" type="checkbox" ${source.enabled ? 'checked' : ''}>
                    <span>${index + 1}</span>
                </label>
                <select name="audioSources.${index}.type" aria-label="Audio source ${index + 1}">
                    ${AUDIO_SOURCE_OPTIONS.map(([optionValue, text]) =>
                        `<option value="${escapeHtml(optionValue)}" ${optionValue === source.type ? 'selected' : ''}>${escapeHtml(text)}</option>`,
                    ).join('')}
                </select>
                <div class="jpdb-reader-audio-source-fields">
                    <input data-audio-url-field name="audioSources.${index}.url" type="text" value="${escapeHtml(source.url)}" placeholder="${audioUrlPlaceholder(source.type)}" ${audioSourceUsesUrl(source.type) ? '' : 'hidden'}>
                    <input data-audio-voice-field name="audioSources.${index}.voice" type="text" value="${escapeHtml(source.voice)}" placeholder="${audioVoicePlaceholder(source.type)}" ${audioSourceUsesVoice(source.type) ? '' : 'hidden'}>
                </div>
                <div class="jpdb-reader-row-tools" aria-label="Audio source order">
                    <button type="button" class="jpdb-reader-icon-mini" data-action="audio-source-up" title="Move up">↑</button>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="audio-source-down" title="Move down">↓</button>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="audio-source-remove" title="Remove">×</button>
                </div>
            </div>
        `).join('')}
    `;
}

function audioSourceRowsForSettings(sources: AudioSourceSetting[]): AudioSourceSetting[] {
    const rows = sources.map(source => ({ ...source }));
    return rows.length ? rows : DEFAULT_AUDIO_SOURCES.map(source => ({ ...source }));
}

function audioUrlPlaceholder(type: AudioSourceSetting['type']): string {
    if (type === 'custom' || type === 'custom-json') return 'URL for this custom source';
    return 'Built-in source, no URL needed';
}

function audioVoicePlaceholder(type: AudioSourceSetting['type']): string {
    if (type === 'text-to-speech' || type === 'text-to-speech-reading') return 'Voice name';
    return 'No voice needed';
}

function audioSourceUsesUrl(type: string): boolean {
    return type === 'custom' || type === 'custom-json';
}

function audioSourceUsesVoice(type: string): boolean {
    return type === 'text-to-speech' || type === 'text-to-speech-reading';
}

function syncAudioSourceRow(row: Element | null, type: string): void {
    if (!row) return;
    row.querySelectorAll<HTMLElement>('[data-audio-url-field]').forEach(node => { node.hidden = !audioSourceUsesUrl(type); });
    row.querySelectorAll<HTMLElement>('[data-audio-voice-field]').forEach(node => { node.hidden = !audioSourceUsesVoice(type); });
}

function updateAudioSourceEditor(form: HTMLFormElement, action: string, control?: HTMLElement | null): void {
    const container = form.querySelector<HTMLElement>('.jpdb-reader-audio-sources');
    if (!container) return;
    const sources = audioSourceRowsForSettings(readAudioSources(new FormData(form)));
    const row = control?.closest<HTMLElement>('[data-audio-source-row]');
    const index = row ? Array.from(container.querySelectorAll('[data-audio-source-row]')).indexOf(row) : -1;

    if (action === 'audio-source-add' && sources.length < 12) {
        sources.push({ type: 'custom-json', url: '', voice: '', enabled: true });
    }
    if (action === 'audio-source-remove' && index >= 0 && sources.length > 1) {
        sources.splice(index, 1);
    }
    if (action === 'audio-source-up' && index > 0) {
        const [source] = sources.splice(index, 1);
        sources.splice(index - 1, 0, source);
    }
    if (action === 'audio-source-down' && index >= 0 && index < sources.length - 1) {
        const [source] = sources.splice(index, 1);
        sources.splice(index + 1, 0, source);
    }
    setInnerHtml(container, renderAudioSourceEditor(sources));
}

function updateDictionarySourceEditor(form: HTMLFormElement, action: string, control?: HTMLElement | null): void {
    const container = form.querySelector<HTMLElement>('.jpdb-reader-dictionary-priorities');
    const row = control?.closest<HTMLElement>('[data-dictionary-source-row]');
    if (!container || !row) return;
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-dictionary-source-row]'));
    const index = rows.indexOf(row);
    const targetIndex = action === 'dictionary-source-up' ? index - 1 : index + 1;
    moveDictionarySourceRow(container, index, targetIndex);
}

function installDictionarySourceDrag(form: HTMLFormElement): void {
    let dragged: HTMLElement | null = null;
    form.addEventListener('dragstart', event => {
        const row = (event.target as HTMLElement).closest<HTMLElement>('[data-dictionary-source-row]');
        if (!row) return;
        dragged = row;
        row.classList.add('jpdb-reader-dragging');
        event.dataTransfer?.setData('text/plain', row.dataset.sourceId ?? '');
        event.dataTransfer?.setDragImage(row, 18, 18);
    });
    form.addEventListener('dragover', event => {
        if (!dragged) return;
        const row = (event.target as HTMLElement).closest<HTMLElement>('[data-dictionary-source-row]');
        if (row && row !== dragged) event.preventDefault();
    });
    form.addEventListener('drop', event => {
        if (!dragged) return;
        const target = (event.target as HTMLElement).closest<HTMLElement>('[data-dictionary-source-row]');
        const container = dragged.closest<HTMLElement>('.jpdb-reader-dictionary-priorities');
        if (!target || !container || target === dragged) return;
        event.preventDefault();
        const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-dictionary-source-row]'));
        moveDictionarySourceRow(container, rows.indexOf(dragged), rows.indexOf(target));
    });
    form.addEventListener('dragend', () => {
        dragged?.classList.remove('jpdb-reader-dragging');
        dragged = null;
    });
}

function moveDictionarySourceRow(container: HTMLElement, index: number, targetIndex: number): void {
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-dictionary-source-row]'));
    if (index < 0 || targetIndex < 0 || index >= rows.length || targetIndex >= rows.length || index === targetIndex) return;
    const row = rows[index];
    const target = rows[targetIndex];
    if (targetIndex < index) container.insertBefore(row, target);
    else container.insertBefore(row, target.nextSibling);
    syncDictionarySourcePriorities(container);
}

function syncDictionarySourcePriorities(container: HTMLElement): void {
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-dictionary-source-row]'));
    rows.forEach((row, index) => {
        const priority = row.querySelector<HTMLInputElement>('input[name$=".priority"]');
        if (priority) priority.value = String(index);
        const indexLabel = row.querySelector('.jpdb-reader-dictionary-toggle span');
        if (indexLabel) indexLabel.textContent = String(index + 1);
    });
}

function installShortcutCapture(root: HTMLElement): void {
    root.querySelectorAll<HTMLInputElement>('[data-shortcut-input]').forEach(inputEl => {
        inputEl.addEventListener('keydown', event => {
            event.preventDefault();
            event.stopPropagation();
            if (event.key === 'Backspace' || event.key === 'Delete') {
                inputEl.value = '';
                return;
            }
            inputEl.value = formatShortcutEvent(event);
        });
        inputEl.addEventListener('paste', event => event.preventDefault());
    });
}

function syncReviewSettingsVisibility(form: HTMLFormElement): void {
    const reviewsEnabled = form.querySelector<HTMLInputElement>('input[name="enableReviews"]')?.checked ?? true;
    const passFail = form.querySelector<HTMLSelectElement>('select[name="twoButtonReviews"]')?.value === 'true';
    form.querySelectorAll<HTMLElement>('[data-review-config]').forEach(node => { node.hidden = !reviewsEnabled; });
    form.querySelectorAll<HTMLElement>('[data-review-scale="five"]').forEach(node => { node.hidden = !reviewsEnabled || passFail; });
    form.querySelectorAll<HTMLElement>('[data-review-scale="pass-fail"]').forEach(node => { node.hidden = !reviewsEnabled || !passFail; });
}

function renderDeckControls(settings: ReaderSettings, decks: JPDBDeck[], hasApiKey: boolean): string {
    const disabled = !hasApiKey || !decks.length;
    const deckOptions = decks.map(deck => [deck.id, deck.name] as [string, string]);
    const miningOptions = [['forq', 'FORQ'], ...deckOptions] as [string, string][];
    return `
        <div class="grid">
            ${deckSelect('miningDeck', 'Mining deck', settings.miningDeck, miningOptions, disabled)}
            ${deckSelect('neverForgetDeck', 'Never forget deck', settings.neverForgetDeck, deckOptions, disabled)}
            ${deckSelect('blacklistDeck', 'Blacklist deck', settings.blacklistDeck, deckOptions, disabled)}
        </div>
        <div class="jpdb-reader-help">${hasApiKey ? (decks.length ? 'Decks are loaded from your JPDB account.' : 'Could not load decks yet; saved deck IDs will be kept.') : 'Add your JPDB API key to choose decks.'}</div>
    `;
}

function deckSelect(name: string, label: string, value: string, options: [string, string][], disabled: boolean): string {
    const hasValue = options.some(([optionValue]) => optionValue === value);
    const merged = hasValue || !value ? options : [[value, `Saved: ${value}`] as [string, string], ...options];
    return `<label>${label}
        <select name="${name}" ${disabled ? 'disabled' : ''}>
            ${merged.map(([optionValue, text]) => `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}
        </select>
        ${disabled ? `<input type="hidden" name="${name}" value="${escapeHtml(value)}">` : ''}
    </label>`;
}

function settingsTabButton(panel: string, label: string, active = false): string {
    return `<button class="jpdb-reader-settings-tab" type="button" data-action="settings-panel" data-panel="${escapeHtml(panel)}" role="tab" aria-selected="${active ? 'true' : 'false'}">${escapeHtml(label)}</button>`;
}

function renderDictionarySourceRows(settings: ReaderSettings): string {
    const preferences = settings.dictionaryPreferences;
    const rows = [
        {
            id: JPDB_DEFINITION_SOURCE_ID,
            name: 'JPDB',
            alias: 'JPDB',
            enabled: settings.jpdbDefinitionsEnabled,
            priority: settings.jpdbDefinitionsPriority,
            readonly: true,
            help: 'Built-in JPDB meanings from the parsed card.',
        },
        ...preferences.map(preference => ({
            id: preference.name,
            name: preference.name,
            alias: preference.alias,
            enabled: preference.enabled,
            priority: preference.priority,
            readonly: false,
            help: '',
        })),
    ].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));

    if (rows.length === 1) return `
        <div class="jpdb-reader-help">JPDB is the only definition source. Import Yomitan dictionaries to add local or native-language definitions.</div>
        ${renderDictionarySourceRowsList(rows)}
    `;
    return renderDictionarySourceRowsList(rows);
}

function renderDictionarySourceRowsList(rows: Array<{ id: string; name: string; alias: string; enabled: boolean; priority: number; readonly: boolean; help: string }>): string {
    return `
        <div class="jpdb-reader-dictionary-head">
            <span>On</span>
            <span>Definition source</span>
            <span>Alias</span>
            <span>Order</span>
        </div>
        <input type="hidden" name="dictionaryPreferenceCount" value="${rows.filter(row => row.id !== JPDB_DEFINITION_SOURCE_ID).length}">
        ${rows.map((row, index) => {
            const localIndex = rows.slice(0, index).filter(item => item.id !== JPDB_DEFINITION_SOURCE_ID).length;
            const prefix = row.id === JPDB_DEFINITION_SOURCE_ID ? 'jpdbDefinitions' : `dictionaryPreferences.${localIndex}`;
            return `
            <div class="jpdb-reader-dictionary-row" draggable="true" data-dictionary-source-row data-source-id="${escapeHtml(row.id)}">
                <label class="inline jpdb-reader-dictionary-toggle">
                    <input name="${prefix}.enabled" type="checkbox" ${row.enabled ? 'checked' : ''}>
                    <span>${index + 1}</span>
                </label>
                <input name="${prefix}.name" type="text" value="${escapeHtml(row.name)}" readonly aria-label="Dictionary name">
                <input name="${prefix}.alias" type="text" value="${escapeHtml(row.alias)}" ${row.readonly ? 'readonly' : ''} aria-label="Dictionary alias">
                <div class="jpdb-reader-row-tools">
                    <input name="${prefix}.priority" type="hidden" value="${index}" aria-label="Dictionary priority">
                    <button type="button" class="jpdb-reader-icon-mini" data-action="dictionary-source-up" title="Move up">↑</button>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="dictionary-source-down" title="Move down">↓</button>
                </div>
                ${row.help ? `<div class="jpdb-reader-dictionary-row-help">${escapeHtml(row.help)}</div>` : ''}
            </div>
        `; }).join('')}
    `;
}

function renderRecommendedDictionaries(installed: YomitanDictionaryInfo[]): string {
    const groups: Array<[RecommendedDictionary['category'], string]> = [
        ['terms', 'Term dictionaries'],
        ['kanji', 'Kanji dictionaries'],
        ['frequency', 'Frequency dictionaries'],
    ];

    return `
        <div class="jpdb-reader-recommended-title">Recommended dictionary downloads</div>
        <div class="jpdb-reader-settings-actions">
            <button class="jpdb-reader-btn" type="button" data-action="download-starter-dictionaries">Download missing recommended</button>
            <button class="jpdb-reader-btn" type="button" data-action="refresh-dictionaries">Refresh installed list</button>
        </div>
        ${groups.map(([category, label]) => {
            const dictionaries = RECOMMENDED_JAPANESE_DICTIONARIES.filter(dictionary => dictionary.category === category);
            if (!dictionaries.length) return '';
            return `
                <div class="jpdb-reader-recommended-group">
                    <div class="jpdb-reader-recommended-group-title">${escapeHtml(label)}</div>
                    ${dictionaries.map(dictionary => renderRecommendedDictionary(dictionary, installed)).join('')}
                </div>
            `;
        }).join('')}
    `;
}

function renderRecommendedDictionary(dictionary: RecommendedDictionary, installed: YomitanDictionaryInfo[]): string {
    const alreadyInstalled = isRecommendedDictionaryInstalled(dictionary, installed);
    return `
        <div class="jpdb-reader-recommended-item">
            <div>
                <div class="jpdb-reader-recommended-name">
                    <span>${escapeHtml(dictionary.name)}</span>
                    <a href="${dictionary.homepage}" target="_blank" rel="noopener">Homepage</a>
                </div>
                <div class="jpdb-reader-help">${escapeHtml(dictionary.description)}</div>
            </div>
            <button class="jpdb-reader-btn" type="button" data-action="download-recommended-dictionary" data-dictionary-id="${escapeHtml(dictionary.id)}" data-installed="${alreadyInstalled}">
                ${alreadyInstalled ? 'Update' : 'Download'}
            </button>
        </div>
    `;
}

function isRecommendedDictionaryInstalled(dictionary: RecommendedDictionary, installed: YomitanDictionaryInfo[]): boolean {
    const targetName = normalizedDictionaryName(dictionary.name);
    return installed.some(item => item.downloadUrl === dictionary.downloadUrl || normalizedDictionaryName(item.title).includes(targetName));
}

function normalizedDictionaryName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9ぁ-んァ-ン一-龯]/g, '');
}

function recommendedDictionaryFilename(dictionary: RecommendedDictionary): string {
    try {
        const parsed = new URL(dictionary.downloadUrl);
        const lastPath = parsed.pathname.split('/').filter(Boolean).pop();
        if (lastPath && /\.zip$/i.test(lastPath)) return decodeURIComponent(lastPath);
    } catch {
        // Fall through to a readable fallback.
    }
    return `${dictionary.id}.zip`;
}

function readFormSettings(data: FormData, current: ReaderSettings): ReaderSettings {
    const get = (key: string) => String(data.get(key) ?? '');
    const has = (key: string) => data.has(key);
    const number = (key: string, fallback: number) => readNumber(get(key), fallback);
    const audioSources = readAudioSources(data);
    return {
        ...current,
        apiKey: get('apiKey').trim(),
        interfaceLanguage: ['auto', 'en', 'ja'].includes(get('interfaceLanguage')) ? get('interfaceLanguage') as ReaderSettings['interfaceLanguage'] : current.interfaceLanguage,
        jpdbDefinitionsEnabled: has('jpdbDefinitions.enabled'),
        jpdbDefinitionsPriority: Math.max(0, Math.min(999, number('jpdbDefinitions.priority', current.jpdbDefinitionsPriority))),
        rtkEnabled: has('rtkEnabled'),
        kanjivgEnabled: has('kanjivgEnabled'),
        kanjiOriginsEnabled: has('kanjiOriginsEnabled'),
        kanjiOriginKanjiMapEnabled: has('kanjiOriginKanjiMapEnabled'),
        kanjiOriginWiktionaryEnabled: has('kanjiOriginWiktionaryEnabled'),
        kanjiOriginGraphEnabled: has('kanjiOriginGraphEnabled'),
        kanjiOriginRadicalImagesEnabled: has('kanjiOriginRadicalImagesEnabled'),
        similarKanjiWords: has('similarKanjiWords'),
        similarKanjiWordLimit: Math.max(2, Math.min(24, number('similarKanjiWordLimit', current.similarKanjiWordLimit))),
        audioEnabled: has('audioEnabled'),
        autoPlayAudio: has('autoPlayAudio'),
        audioSources,
        audioEnableDefaultSources: has('audioEnableDefaultSources'),
        audioSourceUrl: audioSources.find(source => source.url.trim())?.url.trim() ?? current.audioSourceUrl,
        accentColor: sanitizeAccentColor(get('accentColor'), current.accentColor),
        audioViaBlob: has('audioViaBlob'),
        audioTimeoutMs: Math.max(1000, number('audioTimeoutMs', current.audioTimeoutMs)),
        audioSelectionMode: get('audioSelectionMode') === 'random' ? 'random' : 'first',
        parseSelection: has('parseSelection'),
        lookupOnClick: has('lookupOnClick'),
        lookupOnHover: has('lookupOnHover'),
        popupActivationMode: current.popupActivationMode,
        scanModifierKey: current.scanModifierKey,
        autoScanJapanese: has('autoScanJapanese'),
        scanVisiblePage: has('scanVisiblePage'),
        showFloatingButton: has('showFloatingButton'),
        showFurigana: has('showFurigana'),
        showPitchAccent: has('showPitchAccent'),
        hideKnownFurigana: has('hideKnownFurigana'),
        ocrEnabled: has('ocrEnabled'),
        ocrAutoScanImages: has('ocrAutoScanImages'),
        ocrShowTextOverlay: has('ocrShowTextOverlay'),
        ocrProvider: normalizeOcrProvider(get('ocrProvider')),
        ocrEndpointUrl: get('ocrEndpointUrl').trim(),
        ocrEngine: get('ocrEngine').trim() || 'auto',
        ocrCloudVisionApiKey: get('ocrCloudVisionApiKey').trim(),
        ocrLanguage: get('ocrLanguage').trim() || 'ja-JP',
        ocrMaxImagePixels: Math.max(160000, Math.min(2800000, number('ocrMaxImagePixels', current.ocrMaxImagePixels))),
        ocrMinImageArea: Math.max(10000, Math.min(800000, number('ocrMinImageArea', current.ocrMinImageArea))),
        ocrMaxImagesPerPage: Math.max(1, Math.min(30, number('ocrMaxImagesPerPage', current.ocrMaxImagesPerPage))),
        ocrPrefetchMargin: Math.max(0, Math.min(3000, number('ocrPrefetchMargin', current.ocrPrefetchMargin))),
        ocrTextColor: sanitizeAccentColor(get('ocrTextColor'), current.ocrTextColor),
        ocrOutlineColor: sanitizeAccentColor(get('ocrOutlineColor'), current.ocrOutlineColor),
        ocrBackgroundColor: sanitizeAccentColor(get('ocrBackgroundColor'), current.ocrBackgroundColor),
        ocrBackgroundOpacity: Math.max(0, Math.min(1, number('ocrBackgroundOpacity', current.ocrBackgroundOpacity))),
        ocrFontScale: Math.max(0.7, Math.min(1.8, number('ocrFontScale', current.ocrFontScale))),
        localDictionariesEnabled: has('localDictionariesEnabled'),
        localDictionaryShowKanji: has('localDictionaryShowKanji'),
        localDictionaryMaxResults: Math.max(1, Math.min(64, number('localDictionaryMaxResults', current.localDictionaryMaxResults))),
        dictionaryPreferences: readDictionaryPreferences(data, current.dictionaryPreferences),
        subtitlePlayerEnabled: has('subtitlePlayerEnabled'),
        subtitleAutoDetect: has('subtitleAutoDetect'),
        subtitleOverlayVisible: has('subtitleOverlayVisible'),
        subtitleSecondaryVisible: has('subtitleSecondaryVisible'),
        subtitleControlsMode: ['auto', 'always', 'hidden'].includes(get('subtitleControlsMode')) ? get('subtitleControlsMode') as ReaderSettings['subtitleControlsMode'] : current.subtitleControlsMode,
        subtitleFontSize: Math.max(16, Math.min(64, number('subtitleFontSize', current.subtitleFontSize))),
        subtitleBottomOffset: Math.max(2, Math.min(40, number('subtitleBottomOffset', current.subtitleBottomOffset))),
        subtitleTextColor: sanitizeAccentColor(get('subtitleTextColor'), current.subtitleTextColor),
        subtitleOutlineColor: sanitizeAccentColor(get('subtitleOutlineColor'), current.subtitleOutlineColor),
        subtitleBackgroundColor: sanitizeAccentColor(get('subtitleBackgroundColor'), current.subtitleBackgroundColor),
        subtitleBackgroundOpacity: Math.max(0, Math.min(1, number('subtitleBackgroundOpacity', current.subtitleBackgroundOpacity))),
        subtitleFontFamily: get('subtitleFontFamily').trim() || current.subtitleFontFamily,
        subtitleFontWeight: Math.max(100, Math.min(900, number('subtitleFontWeight', current.subtitleFontWeight))),
        subtitleMiningPause: has('subtitleMiningPause'),
        subtitleSeekPadding: Math.max(-2, Math.min(2, number('subtitleSeekPadding', current.subtitleSeekPadding))),
        youtubeImmersionEnabled: has('youtubeImmersionEnabled'),
        youtubeShowFilterNotice: has('youtubeShowFilterNotice'),
        ankiEnabled: has('ankiEnabled'),
        ankiConnectUrl: get('ankiConnectUrl').trim() || current.ankiConnectUrl,
        ankiDeck: get('ankiDeck').trim() || current.ankiDeck,
        ankiModel: get('ankiModel').trim() || current.ankiModel,
        ankiTags: get('ankiTags').trim(),
        ankiMineWithJpdb: has('ankiMineWithJpdb'),
        ankiCaptureScreenshot: has('ankiCaptureScreenshot'),
        theme: get('theme') as ReaderSettings['theme'],
        popupMode: get('popupMode') as ReaderSettings['popupMode'],
        miningDeck: get('miningDeck').trim() || 'forq',
        neverForgetDeck: get('neverForgetDeck').trim() || 'never-forget',
        blacklistDeck: get('blacklistDeck').trim() || 'blacklist',
        addToForq: has('addToForq'),
        enableReviews: has('enableReviews'),
        twoButtonReviews: get('twoButtonReviews') === 'true',
        shortcuts: {
            scanPage: get('shortcuts.scanPage'),
            hoverLookup: get('shortcuts.hoverLookup'),
            openSettings: get('shortcuts.openSettings'),
            playAudio: get('shortcuts.playAudio'),
            closePopup: get('shortcuts.closePopup'),
            previousSubtitle: get('shortcuts.previousSubtitle'),
            nextSubtitle: get('shortcuts.nextSubtitle'),
            copySubtitle: get('shortcuts.copySubtitle'),
            toggleOcr: get('shortcuts.toggleOcr'),
            toggleYoutubeImmersion: get('shortcuts.toggleYoutubeImmersion'),
            scanImages: get('shortcuts.scanImages'),
            gradeNothing: get('shortcuts.gradeNothing'),
            gradeSomething: get('shortcuts.gradeSomething'),
            gradeHard: get('shortcuts.gradeHard'),
            gradeOkay: get('shortcuts.gradeOkay'),
            gradeEasy: get('shortcuts.gradeEasy'),
            gradeFail: get('shortcuts.gradeFail'),
            gradePass: get('shortcuts.gradePass'),
        },
    };
}

function readNumber(value: string, fallback: number): number {
    if (!value.trim()) return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function applyUrlBootstrapSettings(settings: ReaderSettings): ReaderSettings {
    const params = new URLSearchParams(location.search);
    const apiKey = params.get('apiKey')?.trim();
    const audio = params.get('audio')?.trim();
    const ocr = params.get('ocr')?.trim();
    if (!apiKey && !audio && !ocr) return settings;

    const audioSources = audio
        ? [{ type: 'custom-json', url: audio, voice: '', enabled: true } satisfies AudioSourceSetting, ...settings.audioSources.filter(source => source.url !== audio)]
        : settings.audioSources;

    return {
        ...settings,
        apiKey: apiKey || settings.apiKey,
        audioSources,
        audioSourceUrl: audio || settings.audioSourceUrl,
        ocrEndpointUrl: ocr || settings.ocrEndpointUrl,
    };
}

function readDictionaryPreferences(data: FormData, current: DictionaryPreference[]): DictionaryPreference[] {
    const get = (key: string) => String(data.get(key) ?? '');
    const count = Math.max(0, Number(get('dictionaryPreferenceCount')) || 0);
    if (!count) return current;

    return Array.from({ length: count }, (_, index) => ({
        name: get(`dictionaryPreferences.${index}.name`).trim(),
        alias: get(`dictionaryPreferences.${index}.alias`).trim() || get(`dictionaryPreferences.${index}.name`).trim(),
        enabled: data.has(`dictionaryPreferences.${index}.enabled`),
        priority: readNumber(get(`dictionaryPreferences.${index}.priority`), index),
    }))
        .filter(item => item.name)
        .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

function readAudioSources(data: FormData): AudioSourceSetting[] {
    const get = (key: string) => String(data.get(key) ?? '');
    const count = Math.max(0, Number(get('audioSourceCount')) || 0);
    const sources: AudioSourceSetting[] = [];
    const builtInTypes = new Set(DEFAULT_AUDIO_SOURCES.map(source => source.type));

    for (let index = 0; index < count; index++) {
        const source = normalizeAudioSource({
            type: get(`audioSources.${index}.type`),
            url: get(`audioSources.${index}.url`).trim(),
            voice: get(`audioSources.${index}.voice`).trim(),
            enabled: data.has(`audioSources.${index}.enabled`),
        });
        if (!source) continue;
        if (!source.enabled && !source.url && !source.voice && !builtInTypes.has(source.type)) continue;
        sources.push(source);
    }

    return sources;
}

function getReaderSettingsExport(value: unknown): ReaderSettings | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as { formatName?: string; settings?: unknown };
    return (record.formatName === 'yomu-reader-settings' || record.formatName === 'kotoba-reader-settings' || record.formatName === 'jpdb-popup-reader-settings')
        && record.settings
        && typeof record.settings === 'object'
        ? record.settings as ReaderSettings
        : null;
}

function pickFile(root: HTMLElement, type: 'settings' | 'dictionary'): Promise<File | null> {
    const inputEl = root.querySelector<HTMLInputElement>(`input[data-file="${type}"]`);
    if (!inputEl) return Promise.resolve(null);

    return new Promise(resolve => {
        inputEl.onchange = () => {
            const file = inputEl.files?.[0] ?? null;
            inputEl.value = '';
            resolve(file);
        };
        inputEl.click();
    });
}

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dateStamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

const bootWindow = window as typeof window & {
    __yomuReaderAppInitialized?: boolean;
    __jpdbPopupReaderInitialized?: boolean;
};

if (!bootWindow.__yomuReaderAppInitialized) {
    bootWindow.__yomuReaderAppInitialized = true;
    bootWindow.__jpdbPopupReaderInitialized = true;
    void new ReaderApp().init();
}
