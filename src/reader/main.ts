import { AudioPlayer } from './audio';
import { AnkiConnectClient, captureActiveVideoFrame } from './anki';
import { copyText, isEditableTarget, normalizePressedKey, pauseActiveVideo, positionPopover } from './browser-ui';
import { APP_NAME, APP_PUCK, JPDB_DEFINITION_SOURCE_ID, SETTINGS_TITLE, SUPPORT_LINKS } from './constants';
import {
    HAS_JAPANESE,
    applyTokensToTextNode,
    applyTokensToScanTarget,
    collectTextTargetsIn,
    collectVisibleTextTargets,
    escapeHtml,
    getSelectionSentence,
    getSelectionText,
    renderTokensToHtml,
    setInnerHtml,
} from './dom';
import { ImmersionKitClient, type ImmersionKitExample } from './immersion-kit';
import { JpdbClient } from './jpdb';
import { JpdbKanjiClient, type JpdbKanjiInfo, type JpdbKanjiVocabulary } from './jpdb-kanji';
import { buildKanjiFacts, buildKanjiOriginGraph, KanjiOriginClient } from './kanji-origin';
import { installKanjiDoodle } from './kanji-doodle';
import { KanjiVGClient, type KanjiVGInfo } from './kanjivg';
import { uiText } from './i18n';
import { OnboardingController } from './onboarding';
import { ImageOcrController } from './ocr';
import { formatPartOfSpeech, formatPartOfSpeechDetails } from './pos';
import {
    buildRtkComponentSummaries,
    externalLinkIcon,
    formatMetaFrequency,
    formatMetaPitch,
    groupTermEntriesByDictionary,
    isKanjiCharacter,
    mergeSimilarKanjiWords,
    pickTokenForSelection,
    renderJpdbKanjiInfo,
    renderKanjiKeywordLine,
    renderKanjiOrigins,
    renderKanjiPractice,
    renderPitch,
    renderRtkInfo,
    renderSpellingForKanjiNavigation,
    speakerIcon,
    uniqueKanji,
} from './popup-render';
import { RECOMMENDED_JAPANESE_DICTIONARIES, findRecommendedDictionary } from './recommended-dictionaries';
import { RtkClient, type RtkInfo } from './rtk';
import {
    DEFAULT_SETTINGS,
    accentToRgba,
    applyUrlBootstrapSettings,
    loadSettings,
    matchesShortcut,
    mergeDictionaryPreferences,
    sanitizeAccentColor,
    saveSettings,
    shortcutIsPressed,
} from './settings';
import {
    activateSettingsPanel,
    dateStamp,
    downloadBlob,
    getFormInterfaceLanguage,
    getReaderSettingsExport,
    installDictionarySourceDrag,
    installShortcutCapture,
    isRecommendedDictionaryInstalled,
    localizeSettingsForm,
    pickFile,
    readFormSettings,
    recommendedDictionaryFilename,
    renderDeckControls,
    renderDictionarySourceRows,
    renderRecommendedDictionaries,
    renderSettingsForm,
    syncAudioSourceRow,
    syncReviewSettingsVisibility,
    updateAudioSourceEditor,
    updateDictionarySourceEditor,
} from './settings-form';
import { collectScanTargets, collectSiteScanTargets } from './site-parsers';
import { READER_CSS } from './styles';
import { SubtitlePlayerController } from './subtitles';
import type { InterfaceLanguage, JPDBCard, JPDBGrade, JPDBToken, ReaderSettings } from './types';
import { YoutubeImmersionFilter, isYouTubeHost } from './youtube';
import {
    YomitanDictionaryStore,
    glossaryToHtml,
    glossaryToText,
    parseYomitanSettingsExport,
    type YomitanKanjiEntry,
    type YomitanMetaEntry,
    type YomitanTermEntry,
} from './yomitan';

const JPDB_SETTINGS_URL = 'https://jpdb.io/settings';

class ReaderApp {
    private settings: ReaderSettings = DEFAULT_SETTINGS;
    private jpdb = new JpdbClient(() => this.settings.apiKey.trim());
    private jpdbKanji = new JpdbKanjiClient();
    private kanjiVG = new KanjiVGClient();
    private kanjiOrigin = new KanjiOriginClient();
    private immersionKit = new ImmersionKitClient();
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
    private hoverCloseTimer?: number;
    private hoverPendingWord?: HTMLElement;
    private activeHoverWord?: HTMLElement;
    private suppressedHoverWord?: HTMLElement;
    private activePopoverMode?: 'modal' | 'hover';
    private activePopoverAnchor?: HTMLElement;
    private lastPointerPosition?: { x: number; y: number };
    private settingsPreviewOriginalAccent?: string;
    private settingsPreviewOriginalLanguage?: InterfaceLanguage;
    private lastAutoAudioKey = '';
    private lastAutoAudioAt = 0;
    private cardRenderRequest = 0;
    private immersionKitAudio?: HTMLAudioElement;
    private immersionKitAudioBlobUrl?: string;
    private pressedKeys = new Set<string>();
    private suppressSelectionLookupUntil = 0;
    private suppressWordClickUntil = 0;
    private pressLookup?: {
        pointerId: number;
        startX: number;
        startY: number;
        active: boolean;
        lastWord?: HTMLElement;
    };

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
            GM_registerMenuCommand(`${APP_NAME} toggle puck`, () => {
                this.settings.showFloatingButton = !this.settings.showFloatingButton;
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
        if (this.settings.puckPositionX !== undefined && this.settings.puckPositionY !== undefined) {
            button.style.left = `${this.settings.puckPositionX}px`;
            button.style.top = `${this.settings.puckPositionY}px`;
            button.style.right = 'auto';
            button.style.bottom = 'auto';
        }
        let dragging = false;
        let moved = false;
        let startX = 0;
        let startY = 0;
        let originX = 0;
        let originY = 0;
        const clampPuck = (x: number, y: number) => {
            const rect = button.getBoundingClientRect();
            const margin = 8;
            return {
                x: Math.max(margin, Math.min(window.innerWidth - rect.width - margin, x)),
                y: Math.max(margin, Math.min(window.innerHeight - rect.height - margin, y)),
            };
        };
        const savePuckPosition = () => {
            const rect = button.getBoundingClientRect();
            const position = clampPuck(rect.left, rect.top);
            this.settings.puckPositionX = Math.round(position.x);
            this.settings.puckPositionY = Math.round(position.y);
            void saveSettings(this.settings);
        };
        button.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            dragging = true;
            moved = false;
            startX = event.clientX;
            startY = event.clientY;
            const rect = button.getBoundingClientRect();
            originX = rect.left;
            originY = rect.top;
            button.setPointerCapture?.(event.pointerId);
        });
        button.addEventListener('pointermove', event => {
            if (!dragging) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            if (Math.hypot(dx, dy) > 4) moved = true;
            if (!moved) return;
            event.preventDefault();
            const position = clampPuck(originX + dx, originY + dy);
            button.style.left = `${position.x}px`;
            button.style.top = `${position.y}px`;
            button.style.right = 'auto';
            button.style.bottom = 'auto';
        }, { passive: false });
        button.addEventListener('pointerup', event => {
            if (!dragging) return;
            dragging = false;
            button.releasePointerCapture?.(event.pointerId);
            if (moved) savePuckPosition();
        });
        button.addEventListener('click', event => {
            if (moved) {
                event.preventDefault();
                event.stopPropagation();
                moved = false;
                return;
            }
            this.showQuickMenu(button);
        });
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
            if ((collectSiteScanTargets(1)?.length ?? 0) > 0 || collectVisibleTextTargets(1).length > 0) {
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
            if (Date.now() < this.suppressWordClickUntil) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            if (!this.settings.lookupOnClick) return;

            event.preventDefault();
            event.stopPropagation();
            this.suppressSelectionLookupUntil = Date.now() + 350;
            if (word.closest('.jpdb-subtitle-player') && this.settings.subtitleMiningPause) pauseActiveVideo();
            void this.showWord(word, { trigger: 'click' });
        }, { capture: true });

        document.addEventListener('pointerdown', event => {
            this.beginPressLookup(event);
        }, { capture: true, passive: false });

        document.addEventListener('pointermove', event => {
            this.updatePressLookup(event);
        }, { capture: true, passive: false });

        document.addEventListener('pointerup', event => {
            this.endPressLookup(event);
        }, { capture: true });

        document.addEventListener('pointercancel', event => {
            this.endPressLookup(event);
        }, { capture: true });

        document.addEventListener('pointerover', event => {
            this.handleHoverPointer(event);
        }, { capture: true });

        document.addEventListener('pointermove', event => {
            this.handleHoverPointer(event);
        }, { capture: true });

        document.addEventListener('pointerout', event => {
            this.handleHoverPointerOut(event);
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
            const escapeClose = this.settings.shortcuts.closePopup.trim().toLowerCase() === 'escape' && event.key === 'Escape';
            if ((escapeClose || matchesShortcut(event, this.settings.shortcuts.closePopup)) && this.hasOpenReaderDialog()) {
                event.preventDefault();
                this.dismiss({ suppressHoverTarget: true });
                return;
            }
            if (this.settings.shortcuts.hoverLookup.trim() && this.shouldLookupOnHover(event)) this.scheduleHoverLookupAtPointer(event);
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
            if (this.settings.shortcuts.hoverLookup.trim() && !this.shouldLookupOnHover(event)) {
                window.clearTimeout(this.hoverLookupTimer);
                this.hoverLookupTimer = undefined;
                this.hoverPendingWord = undefined;
                if (this.activePopoverMode === 'hover') this.scheduleHoverClose(0);
            }
        });
        window.addEventListener('blur', () => {
            this.pressedKeys.clear();
            window.clearTimeout(this.hoverLookupTimer);
            this.hoverLookupTimer = undefined;
            this.hoverPendingWord = undefined;
            if (this.activePopoverMode === 'hover') this.scheduleHoverClose(0);
        });
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

    private shouldLookupOnHover(event: MouseEvent | KeyboardEvent): boolean {
        return this.settings.lookupOnHover && shortcutIsPressed(this.settings.shortcuts.hoverLookup, event, this.pressedKeys);
    }

    private beginPressLookup(event: PointerEvent): void {
        if (!this.settings.lookupOnClick && !this.settings.lookupOnHover) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (this.isInsideActivePopover(event.target as Node | null)) return;
        const word = this.wordFromEventTarget(event.target);
        if (!word) return;

        this.pressLookup = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            active: false,
        };
    }

    private updatePressLookup(event: PointerEvent): void {
        const pressLookup = this.pressLookup;
        if (!pressLookup || pressLookup.pointerId !== event.pointerId) return;
        this.lastPointerPosition = { x: event.clientX, y: event.clientY };

        if (!pressLookup.active) {
            const distance = Math.hypot(event.clientX - pressLookup.startX, event.clientY - pressLookup.startY);
            if (distance < 8) return;
            pressLookup.active = true;
            this.suppressWordClickUntil = Date.now() + 700;
            this.suppressedHoverWord = undefined;
        }

        event.preventDefault();
        event.stopPropagation();

        const word = this.wordFromPoint(event.clientX, event.clientY);
        if (!word || word === pressLookup.lastWord) return;
        pressLookup.lastWord = word;
        this.cancelHoverClose();
        window.clearTimeout(this.hoverLookupTimer);
        this.hoverLookupTimer = undefined;
        this.hoverPendingWord = undefined;
        if (word.closest('.jpdb-subtitle-player') && this.settings.subtitleMiningPause) pauseActiveVideo();
        void this.showWord(word, { trigger: 'hover' });
    }

    private endPressLookup(event: PointerEvent): void {
        const pressLookup = this.pressLookup;
        if (!pressLookup || pressLookup.pointerId !== event.pointerId) return;
        if (pressLookup.active) {
            this.suppressWordClickUntil = Date.now() + 700;
            this.suppressSelectionLookupUntil = Date.now() + 350;
        }
        this.pressLookup = undefined;
    }

    private wordFromEventTarget(target: EventTarget | null): HTMLElement | null {
        const element = target instanceof Element ? target : null;
        const word = element?.closest?.('.jpdb-reader-word') as HTMLElement | null;
        return word && !word.closest('[data-jpdb-reader-root]') ? word : null;
    }

    private wordFromPoint(x: number, y: number): HTMLElement | null {
        for (const element of document.elementsFromPoint(x, y)) {
            const word = element.closest?.('.jpdb-reader-word') as HTMLElement | null;
            if (word && !word.closest('[data-jpdb-reader-root]')) return word;
        }
        return null;
    }

    private handleHoverPointer(event: PointerEvent): void {
        this.lastPointerPosition = { x: event.clientX, y: event.clientY };
        if (event.pointerType === 'touch') return;
        if (this.isInsideActivePopover(event.target as Node | null)) {
            this.cancelHoverClose();
            return;
        }

        const word = (event.target as HTMLElement).closest?.('.jpdb-reader-word') as HTMLElement | null;
        if (!word || word.closest('[data-jpdb-reader-root]')) return;
        if (this.activePopoverMode === 'hover' && this.activeHoverWord === word) {
            this.cancelHoverClose();
            return;
        }
        if (!this.shouldLookupOnHover(event)) return;
        this.scheduleHoverLookup(word, event);
    }

    private handleHoverPointerOut(event: PointerEvent): void {
        const related = event.relatedTarget as Node | null;
        if (this.isInsideActivePopover(event.target as Node | null)) {
            if (this.isInsideActivePopover(related) || (this.activeHoverWord && this.isInsideNode(related, this.activeHoverWord))) return;
            this.scheduleHoverClose();
            return;
        }

        const word = (event.target as HTMLElement).closest?.('.jpdb-reader-word') as HTMLElement | null;
        if (!word || (related && word.contains(related))) return;
        window.clearTimeout(this.hoverLookupTimer);
        if (this.hoverPendingWord === word) this.hoverPendingWord = undefined;
        if (this.suppressedHoverWord === word) this.suppressedHoverWord = undefined;

        if (this.activePopoverMode === 'hover' && this.activeHoverWord === word) {
            if (this.isInsideActivePopover(related)) {
                this.cancelHoverClose();
                return;
            }
            this.scheduleHoverClose();
        }
    }

    private scheduleHoverLookupAtPointer(event: KeyboardEvent): void {
        if (!this.lastPointerPosition) return;
        const target = document.elementFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y) as HTMLElement | null;
        const word = target?.closest?.('.jpdb-reader-word') as HTMLElement | null;
        if (!word || word.closest('[data-jpdb-reader-root]')) return;
        this.scheduleHoverLookup(word, event);
    }

    private scheduleHoverLookup(word: HTMLElement, event: MouseEvent | KeyboardEvent): void {
        if (this.suppressedHoverWord === word) return;
        if (this.activePopoverMode === 'hover' && this.activeHoverWord === word) return;
        if (this.hoverPendingWord === word && this.hoverLookupTimer) return;

        this.cancelHoverClose();
        window.clearTimeout(this.hoverLookupTimer);
        this.hoverPendingWord = word;
        this.hoverLookupTimer = window.setTimeout(() => {
            this.hoverLookupTimer = undefined;
            this.hoverPendingWord = undefined;
            if (!word.isConnected || this.suppressedHoverWord === word) return;
            if (!this.isWordHoverActive(word) || !this.settings.lookupOnHover) return;
            if (!shortcutIsPressed(this.settings.shortcuts.hoverLookup, event, this.pressedKeys)) return;
            if (word.closest('.jpdb-subtitle-player') && this.settings.subtitleMiningPause) pauseActiveVideo();
            void this.showWord(word, { trigger: 'hover' });
        }, Math.max(0, this.settings.hoverOpenDelayMs));
    }

    private cancelHoverClose(): void {
        window.clearTimeout(this.hoverCloseTimer);
        this.hoverCloseTimer = undefined;
    }

    private scheduleHoverClose(delay = this.settings.hoverCloseDelayMs): void {
        if (this.activePopoverMode !== 'hover') return;
        this.cancelHoverClose();
        this.hoverCloseTimer = window.setTimeout(() => {
            this.hoverCloseTimer = undefined;
            if (this.isHoverContextActive()) return;
            this.dismiss({ suppressHoverTarget: false });
        }, Math.max(0, delay));
    }

    private isHoverContextActive(): boolean {
        if (this.activeHoverWord && this.isWordHoverActive(this.activeHoverWord)) return true;
        if (this.activePopover?.matches(':hover')) return true;
        if (!this.lastPointerPosition) return false;
        const target = document.elementFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y);
        return this.isInsideActivePopover(target) || Boolean(this.activeHoverWord && this.isInsideNode(target, this.activeHoverWord));
    }

    private isWordHoverActive(word: HTMLElement): boolean {
        if (word.matches(':hover')) return true;
        if (!this.lastPointerPosition) return false;
        const target = document.elementFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y);
        return this.isInsideNode(target, word);
    }

    private isInsideActivePopover(node: Node | null): boolean {
        return Boolean(this.activePopover && this.isInsideNode(node, this.activePopover));
    }

    private isInsideNode(node: Node | null, root: Node): boolean {
        return Boolean(node && (node === root || root.contains(node)));
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
            const targets = collectScanTargets();
            if (!targets.length) {
                if (!options.silent) this.toast('No unscanned Japanese text found.');
                return;
            }

            const parsed = await this.jpdb.parse(targets.map(target => target.text));
            targets.forEach((target, index) => applyTokensToScanTarget(target, parsed[index] ?? [], this.settings));
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
            targets.forEach((target, index) => applyTokensToScanTarget(target, parsed[index] ?? [], this.settings));
        } catch {
            // External subtitle overlays update frequently; the regular popup path still reports API errors.
        }
    }

    private async showWord(word: HTMLElement, options: { trigger?: 'click' | 'hover' } = {}): Promise<void> {
        const vid = Number(word.dataset.vid);
        const sid = Number(word.dataset.sid);
        const card = this.jpdb.getCard(vid, sid);
        if (!card) {
            this.toast('That word is no longer in the local JPDB cache. Scan it again.');
            return;
        }
        void this.showCard(card, word.dataset.sentence || undefined, word, { trigger: options.trigger === 'hover' ? 'hover' : 'modal' });
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
        void this.parsePopoverJapanese(popover);
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

    private async showCard(card: JPDBCard, sentence?: string, anchor?: HTMLElement, options: { autoPlay?: boolean; trigger?: 'modal' | 'hover' } = {}): Promise<void> {
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
            ${this.renderImmersionKitMount()}
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

        this.mountPopover(popover, anchor, { mode: options.trigger === 'hover' ? 'hover' : 'modal' });
        void this.parsePopoverJapanese(popover);
        void this.loadImmersionKitExamples(popover, card);
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
        const kanjiVGPromise = this.settings.kanjivgEnabled
            ? this.kanjiVG.lookup(kanji).catch(() => null)
            : Promise.resolve(null);
        const similarTermsPromise = this.settings.similarKanjiWords && this.settings.localDictionariesEnabled
            ? this.dictionaries.lookupSimilarTermsByKanji(kanji, this.settings.similarKanjiWordLimit, this.settings.dictionaryPreferences).catch(() => [])
            : Promise.resolve([]);
        const [jpdbInfo, kanjiEntries, rtkInfo] = await Promise.all([
            this.jpdbKanji.lookup(kanji).catch(() => null),
            this.settings.localDictionariesEnabled
                ? this.dictionaries.lookupKanji(kanji, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
                : Promise.resolve([]),
            this.settings.rtkEnabled ? this.rtk.lookup(kanji).catch(() => null) : Promise.resolve(null),
        ]);
        const componentSummaries = buildRtkComponentSummaries(rtkInfo, jpdbInfo, kanjiEntries);
        const kanjiFacts = this.settings.kanjiOriginsEnabled
            ? buildKanjiFacts(kanji, jpdbInfo, rtkInfo, null, kanjiEntries, null)
            : [];
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
            ${this.settings.kanjivgEnabled ? renderKanjiPractice(null, kanji, language) : ''}
            ${renderJpdbKanjiInfo(jpdbInfo, language)}
            ${renderRtkInfo(rtkInfo, componentSummaries, language)}
            ${this.renderKanjiDefinitions(kanjiEntries)}
            <div data-kanji-similar-mount>
                ${this.settings.similarKanjiWords ? this.renderSimilarKanjiWords([], jpdbInfo?.vocabulary ?? [], kanji, card) : ''}
            </div>
            <div data-kanji-origin-mount></div>
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
        installKanjiDoodle(popover, () => this.settings.interfaceLanguage);
        if (this.settings.kanjivgEnabled) {
            void this.renderKanjiVGInto(popover, kanjiVGPromise, kanji, language);
        }
        if (this.settings.similarKanjiWords) {
            void this.renderSimilarKanjiWordsInto(popover, similarTermsPromise, jpdbInfo?.vocabulary ?? [], kanji, card);
        }
        if (this.settings.kanjiOriginsEnabled) {
            void this.renderKanjiOriginsInto(popover, kanji, jpdbInfo, rtkInfo, null, kanjiEntries);
        }
    }

    private async renderSimilarKanjiWordsInto(popover: HTMLElement, promise: Promise<YomitanTermEntry[]>, jpdbVocabulary: JpdbKanjiVocabulary[], kanji: string, card: JPDBCard): Promise<void> {
        const mount = popover.querySelector<HTMLElement>('[data-kanji-similar-mount]');
        if (!mount) return;
        const entries = await promise;
        if (!popover.isConnected || !mount.isConnected) return;
        setInnerHtml(mount, this.renderSimilarKanjiWords(entries, jpdbVocabulary, kanji, card));
    }

    private async renderKanjiVGInto(popover: HTMLElement, kanjiVGPromise: Promise<KanjiVGInfo | null>, kanji: string, language: InterfaceLanguage): Promise<void> {
        const info = await kanjiVGPromise;
        if (!info || !popover.isConnected) return;
        const stage = Array.from(popover.querySelectorAll<HTMLElement>('.jpdb-reader-doodle-stage'))
            .find(candidate => candidate.dataset.kanji === kanji);
        const ghost = stage?.querySelector<HTMLElement>('.jpdb-reader-doodle-ghost');
        const help = stage?.closest('.jpdb-reader-kanjivg')?.querySelector<HTMLElement>('.jpdb-reader-help');
        if (!stage || !ghost || !help) return;
        setInnerHtml(ghost, info.svg);
        help.textContent = `${info.strokeCount} ${uiText(language, 'strokes')}`;
        stage.classList.remove('trace-hidden');
        const trace = stage.closest('.jpdb-reader-kanjivg')?.querySelector<HTMLButtonElement>('[data-doodle-trace]');
        if (trace) trace.textContent = uiText(language, 'hideTrace');
    }

    private async renderKanjiOriginsInto(popover: HTMLElement, kanji: string, jpdbInfo: JpdbKanjiInfo | null, rtkInfo: RtkInfo | null, kanjiVGInfo: KanjiVGInfo | null, kanjiEntries: YomitanKanjiEntry[]): Promise<void> {
        const mount = popover.querySelector<HTMLElement>('[data-kanji-origin-mount]');
        if (!mount) return;
        const sourceInfo = await this.kanjiOrigin.lookup(kanji, { ...this.settings, kanjiOriginWiktionaryEnabled: false }).catch(() => null);
        if (!popover.isConnected || !mount.isConnected) return;
        const facts = buildKanjiFacts(kanji, jpdbInfo, rtkInfo, kanjiVGInfo, kanjiEntries, sourceInfo);
        const graph = this.settings.kanjiOriginGraphEnabled
            ? buildKanjiOriginGraph(kanji, jpdbInfo, rtkInfo, kanjiEntries, sourceInfo)
            : null;
        setInnerHtml(mount, renderKanjiOrigins(facts, graph, sourceInfo, this.settings, this.settings.interfaceLanguage));
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

    private renderImmersionKitMount(): string {
        if (!this.settings.immersionKitEnabled) return '';
        return `
            <div class="jpdb-reader-local jpdb-reader-immersion" data-immersion-kit>
                <div class="jpdb-reader-local-title">${uiText(this.settings.interfaceLanguage, 'immersionKit')}</div>
                <div class="jpdb-reader-help">${uiText(this.settings.interfaceLanguage, 'loadingExamples')}</div>
            </div>
        `;
    }

    private async loadImmersionKitExamples(popover: HTMLElement, card: JPDBCard): Promise<void> {
        const container = popover.querySelector<HTMLElement>('[data-immersion-kit]');
        if (!container) return;

        try {
            const examples = await this.immersionKit.search(card.spelling, this.settings);
            if (!popover.isConnected || !container.isConnected) return;
            if (!examples.length) {
                setInnerHtml(container, `
                    <div class="jpdb-reader-local-title">${uiText(this.settings.interfaceLanguage, 'immersionKit')}</div>
                    <div class="jpdb-reader-help">${uiText(this.settings.interfaceLanguage, 'noImmersionExamples')}</div>
                `);
                return;
            }

            let index = 0;
            const render = async (nextIndex: number, playAudio: boolean) => {
                index = (nextIndex + examples.length) % examples.length;
                await this.renderImmersionKitExample(container, examples, index, playAudio);
            };
            container.addEventListener('click', event => {
                const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-immersion-action]');
                if (!button) return;
                event.preventDefault();
                event.stopPropagation();
                const action = button.dataset.immersionAction;
                if (action === 'previous') void render(index - 1, this.settings.immersionKitAutoPlayAudio);
                if (action === 'next') void render(index + 1, this.settings.immersionKitAutoPlayAudio);
                if (action === 'audio') void this.playImmersionKitExample(examples[index]);
            });
            await render(0, false);
        } catch {
            if (!popover.isConnected || !container.isConnected) return;
            setInnerHtml(container, `
                <div class="jpdb-reader-local-title">${uiText(this.settings.interfaceLanguage, 'immersionKit')}</div>
                <div class="jpdb-reader-help">${uiText(this.settings.interfaceLanguage, 'noImmersionExamples')}</div>
            `);
        }
    }

    private async renderImmersionKitExample(container: HTMLElement, examples: ImmersionKitExample[], index: number, playAudio: boolean): Promise<void> {
        const example = examples[index];
        const language = this.settings.interfaceLanguage;
        const [tokens] = await this.jpdb.parse([example.sentence]).catch(() => [[] as JPDBToken[]]);
        const imageUrl = this.settings.immersionKitShowImages ? this.immersionKit.mediaUrl(example, 'image') : '';
        const sentenceHtml = renderTokensToHtml(example.sentence, tokens ?? [], this.settings);
        const translation = this.settings.immersionKitShowTranslation && example.translation
            ? `<div class="jpdb-reader-example-translation jpdb-reader-parseable">${escapeHtml(example.translation)}</div>`
            : '';
        const image = imageUrl
            ? `<img class="jpdb-reader-example-image" src="${escapeHtml(imageUrl)}" alt="" loading="lazy">`
            : '';

        setInnerHtml(container, `
            <div class="jpdb-reader-local-title">${uiText(language, 'immersionKit')}</div>
            <div class="jpdb-reader-example-card ${image ? 'has-image' : ''}" data-immersion-index="${index}" data-immersion-sentence="${escapeHtml(example.sentence)}">
                ${image}
                <div class="jpdb-reader-example-body">
                    <div class="jpdb-reader-example-meta">
                        <span>${escapeHtml(example.sourceTitle)}</span>
                        <span>${index + 1}/${examples.length}</span>
                    </div>
                    <div class="jpdb-reader-example-sentence jpdb-reader-parseable">${sentenceHtml}</div>
                    ${translation}
                    <div class="jpdb-reader-example-actions">
                        <button class="jpdb-reader-icon-mini" type="button" data-immersion-action="previous" title="${uiText(language, 'previousExample')}">‹</button>
                        <button class="jpdb-reader-icon-mini" type="button" data-immersion-action="audio" title="${uiText(language, 'playExampleAudio')}">${speakerIcon()}</button>
                        <button class="jpdb-reader-icon-mini" type="button" data-immersion-action="next" title="${uiText(language, 'nextExample')}">›</button>
                    </div>
                </div>
            </div>
        `);

        void this.parsePopoverJapanese(container);
        if (playAudio) void this.playImmersionKitExample(example, true);
    }

    private async playImmersionKitExample(example: ImmersionKitExample, quiet = false): Promise<void> {
        const url = this.immersionKit.mediaUrl(example, 'sound');
        if (!url) {
            if (!quiet) this.toast('No Immersion Kit audio for this example.');
            return;
        }

        try {
            this.immersionKitAudio?.pause();
            if (this.immersionKitAudioBlobUrl) {
                URL.revokeObjectURL(this.immersionKitAudioBlobUrl);
                this.immersionKitAudioBlobUrl = undefined;
            }
            const src = this.settings.audioViaBlob
                ? await this.immersionKit.fetchBlobUrl(url, this.settings.audioTimeoutMs)
                : url;
            if (this.settings.audioViaBlob) this.immersionKitAudioBlobUrl = src;
            const audio = new Audio(src);
            audio.preload = 'auto';
            audio.playbackRate = this.settings.immersionKitPlaybackRate;
            this.immersionKitAudio = audio;
            await audio.play();
        } catch (error) {
            if (!quiet) this.toast(error instanceof Error ? error.message : 'Immersion Kit audio failed.');
        }
    }

    private async parsePopoverJapanese(popover: HTMLElement): Promise<void> {
        if (!this.settings.apiKey.trim()) return;
        const targets = Array.from(popover.querySelectorAll<HTMLElement>('.jpdb-reader-parseable'))
            .flatMap(root => collectTextTargetsIn(root, 24, false, { includeReaderRoot: true }))
            .slice(0, 24);
        if (!targets.length) return;

        try {
            const parsed = await this.jpdb.parse(targets.map(target => target.text));
            if (!popover.isConnected) return;
            targets.forEach((target, index) => applyTokensToTextNode(target, parsed[index] ?? [], this.settings));
        } catch {
            // The primary popup already succeeded; nested text parsing is a quiet enhancement.
        }
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
                        <div class="jpdb-reader-local-glossary jpdb-reader-parseable">
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
                        <div class="jpdb-reader-local-glossary jpdb-reader-parseable">
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
        setInnerHtml(form, renderSettingsForm(this.settings, JPDB_SETTINGS_URL));
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

    private mountPopover(popover: HTMLElement, anchor?: HTMLElement, options: { mode?: 'modal' | 'hover' } = {}): void {
        const mode = options.mode ?? 'modal';
        const useBackdrop = mode !== 'hover';
        const backdrop = useBackdrop ? this.createBackdrop() : undefined;
        this.dismiss({ suppressHoverTarget: false });
        popover.setAttribute('aria-modal', String(useBackdrop));
        if (backdrop) document.body.append(backdrop, popover);
        else document.body.append(popover);
        this.activeBackdrop = backdrop;
        this.activePopover = popover;
        this.activePopoverMode = mode;
        this.activePopoverAnchor = anchor;
        this.activeHoverWord = mode === 'hover' ? anchor : undefined;

        if (!popover.classList.contains('jpdb-reader-sheet')) {
            positionPopover(popover, anchor);
        } else {
            this.installSheetHandle(popover);
        }
        if (mode === 'hover') this.installHoverPopoverLifecycle(popover);
        popover.focus();
    }

    private installHoverPopoverLifecycle(popover: HTMLElement): void {
        popover.addEventListener('pointerenter', () => this.cancelHoverClose());
        popover.addEventListener('pointerleave', event => {
            if (this.activeHoverWord && this.isInsideNode(event.relatedTarget as Node | null, this.activeHoverWord)) return;
            this.scheduleHoverClose();
        });
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

    private dismiss(options: { suppressHoverTarget?: boolean } = { suppressHoverTarget: true }): void {
        window.clearTimeout(this.hoverLookupTimer);
        window.clearTimeout(this.hoverCloseTimer);
        this.hoverLookupTimer = undefined;
        this.hoverCloseTimer = undefined;
        this.hoverPendingWord = undefined;
        const suppressTarget = this.activePopoverMode === 'hover' ? this.activeHoverWord : this.activePopoverAnchor;
        if (options.suppressHoverTarget && suppressTarget?.isConnected && suppressTarget.classList.contains('jpdb-reader-word')) {
            this.suppressedHoverWord = suppressTarget;
        }
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
        this.activePopoverMode = undefined;
        this.activePopoverAnchor = undefined;
        this.activeHoverWord = undefined;
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

const bootWindow = window as typeof window & {
    __yomuReaderAppInitialized?: boolean;
    __jpdbPopupReaderInitialized?: boolean;
};

if (!bootWindow.__yomuReaderAppInitialized) {
    bootWindow.__yomuReaderAppInitialized = true;
    bootWindow.__jpdbPopupReaderInitialized = true;
    void new ReaderApp().init();
}
