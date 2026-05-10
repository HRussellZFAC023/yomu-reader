import { AudioPlayer } from './audio';
import { AnkiConnectClient, captureActiveVideoFrame, type AnkiExistingNote, type AnkiLookupResult } from './anki';
import { copyText, isEditableTarget, normalizePressedKey, pauseActiveVideo, positionPopover } from './browser-ui';
import { APP_NAME, APP_PUCK, IMMERSION_KIT_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID, SETTINGS_TITLE, SUPPORT_LINKS } from './constants';
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
import { JpdbExtensionsController } from './jpdb-extensions';
import { JpdbKanjiClient, type JpdbKanjiInfo, type JpdbKanjiVocabulary } from './jpdb-kanji';
import { buildKanjiFacts, buildKanjiOriginGraph, KanjiOriginClient } from './kanji-origin';
import { installKanjiDoodle } from './kanji-doodle';
import { KanjiVGClient, type KanjiVGInfo } from './kanjivg';
import {
    contextLabel,
    immersionContextFromExample,
    loadMiningContext,
    pageMiningContext,
    saveMiningContext,
    shouldUseImmersionContext,
    type MiningContext,
    type StoredMiningContext,
} from './mining-context';
import { resolveUiLanguage, uiText } from './i18n';
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
    syncSubtitlePreview,
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

function cardKey(card: JPDBCard): string {
    return `${card.vid}:${card.sid}:${card.spelling}:${card.reading}`;
}

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
    private jpdbExtensions = new JpdbExtensionsController({
        getSettings: () => this.settings,
        dictionaries: this.dictionaries,
        immersionKit: this.immersionKit,
        rtk: this.rtk,
    });
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
    private lastAnkiLookup?: AnkiLookupResult;
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
    private activePopoverAnchorRect?: DOMRect;
    private activePopoverResizeObserver?: ResizeObserver;
    private lastPointerPosition?: { x: number; y: number };
    private settingsPreviewOriginalAccent?: string;
    private settingsPreviewOriginalLanguage?: InterfaceLanguage;
    private lastAutoAudioKey = '';
    private lastAutoAudioAt = 0;
    private cardRenderRequest = 0;
    private immersionKitAudio?: HTMLAudioElement;
    private immersionKitAudioBlobUrl?: string;
    private immersionPreloadTerms = new Set<string>();
    private activeMiningContext?: MiningContext;
    private immersionContextByCardKey = new Map<string, StoredMiningContext>();
    private pressedKeys = new Set<string>();
    private suppressSelectionLookupUntil = 0;
    private suppressWordClickUntil = 0;
    private pressLookup?: {
        pointerId: number;
        startX: number;
        startY: number;
        active: boolean;
        source: 'primary' | 'middle';
        captureTarget?: Element;
        lastWord?: HTMLElement;
    };
    private suppressMiddleAuxClickUntil = 0;

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
        this.jpdbExtensions.init();

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
        this.applyWordColors();
        document.documentElement.classList.toggle('jpdb-reader-theme-dark', this.settings.theme === 'dark');
        document.documentElement.classList.toggle('jpdb-reader-theme-light', this.settings.theme === 'light');
        document.documentElement.classList.toggle('jpdb-reader-hide-known', this.settings.hideKnownFurigana);
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
            else this.scheduleAutoScan(450);
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

        document.addEventListener('mousedown', event => {
            if (!this.shouldCaptureMiddleMouseLookup(event)) return;
            event.preventDefault();
            event.stopPropagation();
        }, { capture: true, passive: false });

        document.addEventListener('auxclick', event => {
            if (event.button !== 1 || Date.now() > this.suppressMiddleAuxClickUntil) return;
            event.preventDefault();
            event.stopPropagation();
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
            if ((this.settings.shortcuts.hoverLookup ?? '').trim() && this.shouldLookupOnHover(event)) this.scheduleHoverLookupAtPointer(event);
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
                const ankiCardId = this.lastAnkiLookup?.primary?.primaryCardId ?? null;
                const promise = ankiCardId
                    ? this.anki.answerCard(ankiCardId, grade)
                    : this.jpdb.reviewCard(this.lastCard, grade);
                void promise.catch(error => {
                    this.toast(error instanceof Error ? error.message : 'Review failed.');
                });
            }
        });
        document.addEventListener('keyup', event => {
            this.pressedKeys.delete(normalizePressedKey(event.key));
            if ((this.settings.shortcuts.hoverLookup ?? '').trim() && !this.shouldLookupOnHover(event)) {
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
        return this.settings.lookupOnHover && shortcutIsPressed(this.settings.shortcuts.hoverLookup ?? '', event, this.pressedKeys);
    }

    private beginPressLookup(event: PointerEvent): void {
        if (this.isInsideActivePopover(event.target as Node | null)) return;
        const isMiddleScan = this.shouldCaptureMiddleMouseLookup(event);
        if (!isMiddleScan) {
            if (!this.settings.lookupOnClick && !this.settings.lookupOnHover) return;
            if (event.pointerType === 'mouse' && event.button !== 0) return;
        }

        const word = this.wordFromEventTarget(event.target);
        if (!isMiddleScan && !word) return;
        if (isMiddleScan) this.captureMiddleMouseLookup(event);

        this.pressLookup = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            active: isMiddleScan,
            source: isMiddleScan ? 'middle' : 'primary',
            captureTarget: isMiddleScan && event.target instanceof Element ? event.target : undefined,
        };

        if (isMiddleScan) this.updatePressLookup(event);
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

        const targetAtPointer = document.elementFromPoint(event.clientX, event.clientY);
        if (this.isInsideActivePopover(targetAtPointer)) {
            this.cancelHoverClose();
            return;
        }

        const word = this.wordFromPoint(event.clientX, event.clientY);
        if (!word) {
            if (pressLookup.source === 'middle') this.scheduleHoverClose();
            return;
        }
        if (word === pressLookup.lastWord) return;
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
        if (pressLookup.source === 'middle') {
            event.preventDefault();
            event.stopPropagation();
            this.finishMiddleMouseLookup(pressLookup);
            if (this.activePopoverMode === 'hover' && !this.isHoverContextActive()) this.scheduleHoverClose();
        }
        this.pressLookup = undefined;
    }

    private shouldCaptureMiddleMouseLookup(event: MouseEvent | PointerEvent): boolean {
        if (!this.settings.lookupOnMiddleMouse || event.button !== 1) return false;
        if ('pointerType' in event && event.pointerType !== 'mouse') return false;
        if (this.isInsideActivePopover(event.target as Node | null)) return false;
        const target = event.target instanceof Element ? event.target : null;
        return !this.isNativeMiddleClickTarget(target);
    }

    private captureMiddleMouseLookup(event: PointerEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.suppressMiddleAuxClickUntil = Date.now() + 1200;
        this.suppressSelectionLookupUntil = Date.now() + 350;
        document.documentElement.classList.add('jpdb-reader-middle-scan-active');
        try {
            if (event.target instanceof Element) event.target.setPointerCapture?.(event.pointerId);
        } catch {
            // Some pages detach nodes during pointerdown; capture is only an enhancement.
        }
    }

    private finishMiddleMouseLookup(pressLookup: { pointerId: number; captureTarget?: Element }): void {
        this.suppressMiddleAuxClickUntil = Date.now() + 700;
        document.documentElement.classList.remove('jpdb-reader-middle-scan-active');
        try {
            pressLookup.captureTarget?.releasePointerCapture?.(pressLookup.pointerId);
        } catch {
            // Already released or unsupported.
        }
    }

    private isNativeMiddleClickTarget(target: Element | null): boolean {
        return Boolean(target?.closest([
            'a[href]',
            'button',
            'input',
            'textarea',
            'select',
            'summary',
            '[role="button"]',
            '[contenteditable="true"]',
            '[data-jpdb-reader-root]',
        ].join(',')));
    }

    private wordFromEventTarget(target: EventTarget | null): HTMLElement | null {
        const element = target instanceof Element ? target : null;
        const word = element?.closest?.('.jpdb-reader-word') as HTMLElement | null;
        return word && this.canLookupReaderWord(word) ? word : null;
    }

    private wordFromPoint(x: number, y: number): HTMLElement | null {
        for (const element of document.elementsFromPoint(x, y)) {
            const word = element.closest?.('.jpdb-reader-word') as HTMLElement | null;
            if (word && this.canLookupReaderWord(word)) return word;
        }
        return null;
    }

    private canLookupReaderWord(word: HTMLElement): boolean {
        if (!word.closest('[data-jpdb-reader-root]')) return true;
        return Boolean(word.closest('.jpdb-subtitle-player, .jpdb-ocr-layer, .jpdb-reader-popover'));
    }

    private canHoverLookupReaderWord(word: HTMLElement): boolean {
        if (!word.closest('[data-jpdb-reader-root]')) return true;
        return Boolean(word.closest('.jpdb-subtitle-player, .jpdb-ocr-layer'));
    }

    private handleHoverPointer(event: PointerEvent): void {
        this.lastPointerPosition = { x: event.clientX, y: event.clientY };
        if (this.pressLookup?.source === 'middle') return;
        if (event.pointerType === 'touch') return;
        if (this.isInsideActivePopover(event.target as Node | null)) {
            this.cancelHoverClose();
            return;
        }

        const word = (event.target as HTMLElement).closest?.('.jpdb-reader-word') as HTMLElement | null;
        if (!word || !this.canHoverLookupReaderWord(word)) return;
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
        if (!word || !this.canHoverLookupReaderWord(word)) return;
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
            let activeWord = word;
            if (!activeWord.isConnected && this.lastPointerPosition) {
                activeWord = this.wordFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y) ?? activeWord;
            }
            if (!activeWord.isConnected || this.suppressedHoverWord === activeWord) return;
            if (!this.isWordHoverActive(activeWord) || !this.settings.lookupOnHover) return;
            if (!shortcutIsPressed(this.settings.shortcuts.hoverLookup ?? '', event, this.pressedKeys)) return;
            if (activeWord.closest('.jpdb-subtitle-player') && this.settings.subtitleMiningPause) pauseActiveVideo();
            void this.showWord(activeWord, { trigger: 'hover' });
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
        const anchor = this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined;
        const trigger = this.activePopoverMode === 'hover' ? 'hover' : 'modal';
        try {
            const [tokens] = await this.jpdb.parse([sentence]);
            const selectedToken = pickTokenForSelection(tokens, selected);
            if (!selectedToken) {
                this.showTokenList(tokens, selected, anchor, trigger);
                return;
            }
            void this.showCard(selectedToken.card, selectedToken.sentence ?? sentence, anchor, { trigger });
        } catch (error) {
            const localEntries = this.settings.localDictionariesEnabled
                ? await this.dictionaries.lookup(selected, selected, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
                : [];
            if (localEntries.length) this.showLocalDictionaryPopup(selected, localEntries, anchor, trigger);
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
            this.preloadImmersionKitForTokens(parsed.flat());
            void this.enrichAnkiWords(parsed.flat());
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
            this.preloadImmersionKitForTokens(parsed.flat());
            void this.enrichAnkiWords(parsed.flat());
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
        const insideReaderPopup = Boolean(word.closest('.jpdb-reader-popover'));
        if (insideReaderPopup && word.closest('.jpdb-reader-example-card')) {
            this.rememberPageMiningContext(card, word.dataset.sentence || undefined, word);
        }
        const anchor = insideReaderPopup
            ? this.activePopoverAnchor ?? undefined
            : word;
        const trigger = insideReaderPopup && this.activePopoverMode === 'hover'
            ? 'hover'
            : options.trigger === 'hover' ? 'hover' : 'modal';
        void this.showCard(card, word.dataset.sentence || undefined, anchor, { trigger });
    }

    private showTokenList(tokens: JPDBToken[], selected: string, anchor?: HTMLElement, trigger: 'modal' | 'hover' = 'modal'): void {
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
            if (card) void this.showCard(card, tokens.find(t => t.card === card)?.sentence, anchor, { trigger });
        });
        this.mountPopover(popover, anchor, { mode: trigger });
        void this.parsePopoverJapanese(popover);
    }

    private showLocalDictionaryPopup(term: string, entries: YomitanTermEntry[], anchor?: HTMLElement, trigger: 'modal' | 'hover' = 'modal'): void {
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
        this.mountPopover(popover, anchor, { mode: trigger });
        void this.parsePopoverJapanese(popover);
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
        if (this.activeMiningContext?.term !== card.spelling || this.activeMiningContext.sentence !== (sentence || '').replace(/\s+/g, ' ').trim()) {
            this.rememberPageMiningContext(card, sentence, anchor);
        }
        const localEntries = this.settings.localDictionariesEnabled
            ? await this.dictionaries.lookup(card.spelling, card.reading, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
            : [];
        const kanjiEntries = this.settings.localDictionariesEnabled && this.settings.localDictionaryShowKanji
            ? await this.dictionaries.lookupKanji(card.spelling, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
            : [];
        const metaEntries = this.settings.localDictionariesEnabled
            ? await this.dictionaries.lookupTermMeta(card.spelling, 12, this.settings.dictionaryPreferences).catch(() => [])
            : [];
        const ankiLookup = this.settings.ankiEnabled
            ? await this.anki.findExistingCards(card)
            : { state: 'not-in-deck', notes: [], primary: null } satisfies AnkiLookupResult;
        this.lastAnkiLookup = ankiLookup;
        this.applyAnkiLookupToRenderedWords(card, ankiLookup);
        const storedContext = loadMiningContext(card.spelling);
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
                ${ankiLookup.primary ? `<span><span class="jpdb-reader-state-dot jpdb-${ankiLookup.state}"></span>Anki ${escapeHtml(ankiLookup.state)}</span>` : ''}
            </div>
            ${this.renderTermMeta(metaEntries)}
            ${this.renderAnkiExistingSection(ankiLookup, storedContext)}
            ${this.renderKanjiDefinitions(kanjiEntries)}
            <div class="jpdb-reader-actions">
                <div class="jpdb-reader-row" style="--cols: 3">
                    <button class="jpdb-reader-btn add" data-action="add">${uiText(language, 'add')}</button>
                    <button class="jpdb-reader-btn nf" data-action="neverforget" title="${uiText(language, 'neverHint')}">${card.cardState.includes('never-forget') ? uiText(language, 'forget') : uiText(language, 'never')}</button>
                    <button class="jpdb-reader-btn blacklist" data-action="blacklist" title="${uiText(language, 'blacklistHint')}">${card.cardState.includes('blacklisted') ? uiText(language, 'unlist') : uiText(language, 'blacklist')}</button>
                </div>
                ${this.renderAnkiActionRow(ankiLookup)}
                ${this.settings.enableReviews ? this.renderReviewButtons(ankiLookup.primary) : ''}
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
        mount.querySelectorAll<HTMLImageElement>('[data-radical-frame]').forEach(image => {
            image.addEventListener('error', () => image.remove(), { once: true });
        });
        this.installKanjiGraphDrag(mount);
    }

    private installKanjiGraphDrag(root: HTMLElement): void {
        const graph = root.querySelector<HTMLElement>('.jpdb-reader-origin-graph-wrap');
        if (!graph) return;
        const nodes = Array.from(graph.querySelectorAll<HTMLElement>('[data-graph-node]'));
        const lines = Array.from(graph.querySelectorAll<SVGLineElement>('.jpdb-reader-origin-graph-lines line[data-from][data-to]'));
        const nodeById = (id: string) => nodes.find(node => node.dataset.graphNode === id);
        const updateLines = () => {
            for (const line of lines) {
                const from = line.dataset.from ? nodeById(line.dataset.from) : undefined;
                const to = line.dataset.to ? nodeById(line.dataset.to) : undefined;
                if (!from || !to) continue;
                line.setAttribute('x1', from.dataset.x ?? '50');
                line.setAttribute('y1', from.dataset.y ?? '50');
                line.setAttribute('x2', to.dataset.x ?? '50');
                line.setAttribute('y2', to.dataset.y ?? '50');
            }
        };

        for (const node of nodes) {
            let pointerId = -1;
            let startX = 0;
            let startY = 0;
            let startLeft = Number(node.dataset.x ?? 50);
            let startTop = Number(node.dataset.y ?? 50);
            let moved = false;

            node.addEventListener('pointerdown', event => {
                if (event.button !== 0) return;
                pointerId = event.pointerId;
                startX = event.clientX;
                startY = event.clientY;
                startLeft = Number(node.dataset.x ?? 50);
                startTop = Number(node.dataset.y ?? 50);
                moved = false;
                node.setPointerCapture?.(event.pointerId);
            });
            node.addEventListener('pointermove', event => {
                if (event.pointerId !== pointerId) return;
                const rect = graph.getBoundingClientRect();
                if (!rect.width || !rect.height) return;
                const nextX = Math.max(6, Math.min(94, startLeft + ((event.clientX - startX) / rect.width) * 100));
                const nextY = Math.max(10, Math.min(90, startTop + ((event.clientY - startY) / rect.height) * 100));
                if (Math.abs(event.clientX - startX) > 3 || Math.abs(event.clientY - startY) > 3) moved = true;
                node.dataset.x = String(nextX);
                node.dataset.y = String(nextY);
                node.style.left = `${nextX}%`;
                node.style.top = `${nextY}%`;
                updateLines();
            });
            const finish = (event: PointerEvent) => {
                if (event.pointerId !== pointerId) return;
                node.releasePointerCapture?.(pointerId);
                pointerId = -1;
                if (moved) node.dataset.dragged = 'true';
            };
            node.addEventListener('pointerup', finish);
            node.addEventListener('pointercancel', finish);
            node.addEventListener('click', event => {
                if (node.dataset.dragged !== 'true') return;
                delete node.dataset.dragged;
                event.preventDefault();
                event.stopImmediatePropagation();
            }, true);
        }
    }

    private renderDefinitionSources(card: JPDBCard, entries: YomitanTermEntry[]): string {
        const grouped = groupTermEntriesByDictionary(entries);
        const sections = this.orderedDefinitionSourceIds([...grouped.keys()])
            .map(sourceId => {
                if (sourceId === JPDB_DEFINITION_SOURCE_ID) return this.renderJpdbDefinitionSource(card);
                if (sourceId === IMMERSION_KIT_SOURCE_ID) return this.renderImmersionKitMount();
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

            let index = this.immersionStartIndex(card, examples);
            const render = async (nextIndex: number, playAudio: boolean) => {
                index = (nextIndex + examples.length) % examples.length;
                await this.renderImmersionKitExample(container, card, examples, index, playAudio);
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
            await render(index, false);
        } catch {
            if (!popover.isConnected || !container.isConnected) return;
            setInnerHtml(container, `
                <div class="jpdb-reader-local-title">${uiText(this.settings.interfaceLanguage, 'immersionKit')}</div>
                <div class="jpdb-reader-help">${uiText(this.settings.interfaceLanguage, 'noImmersionExamples')}</div>
            `);
        }
    }

    private immersionStartIndex(card: JPDBCard, examples: ImmersionKitExample[]): number {
        const context = this.activeMiningContext?.term === card.spelling
            ? this.activeMiningContext
            : this.immersionContextByCardKey.get(cardKey(card)) ?? loadMiningContext(card.spelling);
        if (!context || context.sourceKind !== 'immersion-kit') return 0;

        const sentenceIndex = examples.findIndex(example => example.sentence === context.sentence);
        if (sentenceIndex >= 0) return sentenceIndex;

        const storedIndex = Number(context.immersionIndex);
        return Number.isFinite(storedIndex) && storedIndex >= 0 && storedIndex < examples.length ? storedIndex : 0;
    }

    private async renderImmersionKitExample(container: HTMLElement, card: JPDBCard, examples: ImmersionKitExample[], index: number, playAudio: boolean): Promise<void> {
        const example = examples[index];
        const language = this.settings.interfaceLanguage;
        const [tokens] = await this.jpdb.parse([example.sentence]).catch(() => [[] as JPDBToken[]]);
        const imageUrl = this.settings.immersionKitShowImages ? this.immersionKit.mediaUrl(example, 'image') : '';
        const storedContext = saveMiningContext(card.spelling, immersionContextFromExample(card.spelling, example, index, examples.length, imageUrl));
        if (storedContext) {
            this.immersionContextByCardKey.set(cardKey(card), storedContext);
            this.activeMiningContext = storedContext;
        }
        const sentenceHtml = renderTokensToHtml(example.sentence, tokens ?? [], this.settings);
        const translation = this.settings.immersionKitShowTranslation && example.translation
            ? `<div class="jpdb-reader-example-translation jpdb-reader-parseable">${escapeHtml(example.translation)}</div>`
            : '';
        const image = imageUrl
            ? `<img class="jpdb-reader-example-image" data-immersion-image data-immersion-image-src="${escapeHtml(imageUrl)}" alt="" loading="lazy">`
            : '';

        setInnerHtml(container, `
            <div class="jpdb-reader-local-title">${uiText(language, 'immersionKit')}</div>
            <div class="jpdb-reader-example-card ${image ? 'has-image' : ''}" data-immersion-index="${index}" data-immersion-total="${examples.length}" data-immersion-sentence="${escapeHtml(example.sentence)}" data-immersion-source-title="${escapeHtml(example.sourceTitle)}" data-immersion-image-url="${escapeHtml(imageUrl)}">
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

        const hideBrokenImage = (imageElement: HTMLImageElement): void => {
            imageElement.remove();
            container.querySelector<HTMLElement>('.jpdb-reader-example-card')?.classList.remove('has-image');
            this.repositionActivePopover();
        };
        container.querySelectorAll<HTMLImageElement>('[data-immersion-image]').forEach(imageElement => {
            imageElement.addEventListener('error', () => hideBrokenImage(imageElement), { once: true });
            const source = imageElement.dataset.immersionImageSrc ?? '';
            if (!source) {
                hideBrokenImage(imageElement);
                return;
            }
            this.immersionKit.fetchDataUrl(source, this.settings.audioTimeoutMs)
                .then(src => {
                    if (!container.isConnected || !imageElement.isConnected) return;
                    imageElement.src = src;
                    this.repositionActivePopover();
                })
                .catch(() => {
                    if (!container.isConnected || !imageElement.isConnected) return;
                    imageElement.src = source;
                    if (imageElement.complete && imageElement.naturalWidth === 0) hideBrokenImage(imageElement);
                });
        });
        void this.parsePopoverJapanese(container);
        void this.enrichAnkiWords(tokens ?? []);
        if (playAudio) void this.playImmersionKitExample(example, true);
    }

    private async playImmersionKitExample(example: ImmersionKitExample, quiet = false): Promise<void> {
        const url = this.immersionKit.mediaUrl(example, 'sound');
        if (!url) {
            if (!quiet) this.toast('No Immersion Kit audio for this example.');
            return;
        }

        try {
            this.stopImmersionKitAudio();
            this.audio.stop();
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

    private stopImmersionKitAudio(): void {
        this.immersionKitAudio?.pause();
        this.immersionKitAudio = undefined;
        if (this.immersionKitAudioBlobUrl) {
            URL.revokeObjectURL(this.immersionKitAudioBlobUrl);
            this.immersionKitAudioBlobUrl = undefined;
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
            const tokens = parsed.flat();
            this.preloadImmersionKitForTokens(tokens);
            void this.enrichAnkiWords(tokens);
        } catch {
            // The primary popup already succeeded; nested text parsing is a quiet enhancement.
        }
    }

    private async enrichAnkiWords(tokens: JPDBToken[]): Promise<void> {
        if (!this.settings.ankiEnabled) return;
        const seen = new Set<string>();
        const uniqueTokens = tokens.filter(token => {
            const key = cardKey(token.card);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 16);
        for (const token of uniqueTokens) {
            const lookup = await this.anki.findExistingCards(token.card);
            this.applyAnkiLookupToRenderedWords(token.card, lookup);
        }
    }

    private preloadImmersionKitForTokens(tokens: JPDBToken[]): void {
        if (!this.settings.immersionKitEnabled) return;
        let queued = 0;
        for (const token of tokens) {
            const term = token.card.spelling.trim();
            if (!term || this.immersionPreloadTerms.has(term)) continue;
            this.immersionPreloadTerms.add(term);
            this.immersionKit.preload(term, this.settings);
            queued++;
            if (queued >= 6) break;
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
            {
                id: IMMERSION_KIT_SOURCE_ID,
                enabled: this.settings.immersionKitEnabled,
                priority: this.settings.immersionKitPriority,
                name: 'Immersion Kit',
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

    private rememberPageMiningContext(card: JPDBCard, sentence?: string, anchor?: HTMLElement): void {
        const cleanSentence = (sentence || '').replace(/\s+/g, ' ').trim();
        if (!cleanSentence || cleanSentence === card.spelling) return;
        const immersionCard = anchor?.closest?.('.jpdb-reader-example-card') as HTMLElement | null;
        if (immersionCard) {
            const stored = saveMiningContext(card.spelling, {
                sentence: cleanSentence,
                sourceKind: 'immersion-kit',
                sourceTitle: immersionCard.dataset.immersionSourceTitle || 'Immersion Kit',
                sourceUrl: location.href,
                imageUrl: immersionCard.dataset.immersionImageUrl || undefined,
                immersionIndex: Number(immersionCard.dataset.immersionIndex ?? 0),
                immersionTotal: Number(immersionCard.dataset.immersionTotal ?? 0),
            });
            if (stored) this.activeMiningContext = stored;
            return;
        }
        const sourceKind = anchor?.closest?.('.jpdb-ocr-line') ? 'image' : document.querySelector('video') ? 'video' : location.hostname === 'jpdb.io' ? 'jpdb' : 'page';
        const stored = saveMiningContext(card.spelling, pageMiningContext(cleanSentence, sourceKind));
        if (stored) this.activeMiningContext = stored;
    }

    private applyAnkiLookupToRenderedWords(card: JPDBCard, ankiLookup: AnkiLookupResult): void {
        if (!ankiLookup.primary) return;
        const selector = `.jpdb-reader-word[data-vid="${card.vid}"][data-sid="${card.sid}"]`;
        document.querySelectorAll<HTMLElement>(selector).forEach(word => {
            word.classList.add(`anki-${ankiLookup.state}`);
            word.dataset.ankiState = ankiLookup.state;
            word.dataset.ankiDecks = ankiLookup.primary?.deckNames.join(', ') ?? '';
            word.title = `Anki: ${ankiLookup.state}${word.dataset.ankiDecks ? ` (${word.dataset.ankiDecks})` : ''}`;
        });
    }

    private renderAnkiActionRow(ankiLookup: AnkiLookupResult): string {
        if (!this.settings.ankiEnabled) return '';
        if (ankiLookup.primary) {
            return `
                <div class="jpdb-reader-row" style="--cols: 1">
                    <button class="jpdb-reader-btn anki compact" data-action="anki-edit" data-note-id="${ankiLookup.primary.noteId}">Edit in Anki</button>
                </div>
            `;
        }
        return `<div class="jpdb-reader-row" style="--cols: 1"><button class="jpdb-reader-btn anki" data-action="anki">${uiText(this.settings.interfaceLanguage, 'addToAnki')}</button></div>`;
    }

    private renderAnkiExistingSection(ankiLookup: AnkiLookupResult, storedContext: StoredMiningContext | null): string {
        const note = ankiLookup.primary;
        if (!note) return '';
        const decks = note.deckNames.length ? note.deckNames.join(', ') : 'Anki';
        const sentence = note.fields.Sentence || note.fields.Example || note.fields.SentenceExpression || '';
        const meaning = note.fields.Meaning || note.fields.Definition || note.fields.Glossary || '';
        const source = note.fields.Source || note.fields.Url || '';
        const lastContext = storedContext
            ? `<div class="jpdb-reader-anki-context"><strong>Last seen</strong><span>${escapeHtml(contextLabel(storedContext))}</span><small>${escapeHtml(storedContext.sentence)}</small></div>`
            : '';
        return `
            <details class="jpdb-reader-anki-existing">
                <summary>
                    <span><span class="jpdb-reader-state-dot jpdb-${note.state}"></span>Already in Anki</span>
                    <small>${escapeHtml(decks)} · ${escapeHtml(note.modelName)}</small>
                </summary>
                <div class="jpdb-reader-anki-card-preview">
                    ${sentence ? `<div><strong>Sentence</strong><span>${escapeHtml(sentence)}</span></div>` : ''}
                    ${meaning ? `<div><strong>Meaning</strong><span>${escapeHtml(meaning).slice(0, 420)}</span></div>` : ''}
                    ${source ? `<div><strong>Source</strong><span>${escapeHtml(source)}</span></div>` : ''}
                    ${lastContext}
                </div>
            </details>
        `;
    }

    private renderReviewButtons(ankiNote: AnkiExistingNote | null = null): string {
        const ankiAttrs = ankiNote?.primaryCardId ? ` data-anki-card-id="${ankiNote.primaryCardId}"` : '';
        if (this.settings.twoButtonReviews) {
            return `
                <div class="jpdb-reader-row" style="--cols: 2">
                    <button class="jpdb-reader-btn fail" data-action="grade" data-grade="fail"${ankiAttrs}>FAIL</button>
                    <button class="jpdb-reader-btn pass" data-action="grade" data-grade="pass"${ankiAttrs}>PASS</button>
                </div>
            `;
        }
        return `
            <div class="jpdb-reader-row jpdb-reader-grades" style="--cols: 5">
                <button class="jpdb-reader-btn nothing" data-action="grade" data-grade="nothing"${ankiAttrs}>NOTHING</button>
                <button class="jpdb-reader-btn something" data-action="grade" data-grade="something"${ankiAttrs}>SOMETHING</button>
                <button class="jpdb-reader-btn hard" data-action="grade" data-grade="hard"${ankiAttrs}>HARD</button>
                <button class="jpdb-reader-btn okay" data-action="grade" data-grade="okay"${ankiAttrs}>OKAY</button>
                <button class="jpdb-reader-btn easy" data-action="grade" data-grade="easy"${ankiAttrs}>EASY</button>
            </div>
        `;
    }

    private async handleCardAction(button: HTMLButtonElement, card: JPDBCard, sentence?: string): Promise<void> {
        if (button.disabled) return;
        button.disabled = true;
        const action = button.dataset.action;
        const anchor = this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined;
        const trigger = this.activePopoverMode === 'hover' ? 'hover' : 'modal';
        try {
            if (action === 'audio') await this.playAudio(card);
            if (action === 'add') {
                await this.jpdb.addToDeck(this.settings.miningDeck || 'forq', card, sentence);
                if (this.settings.addToForq && this.settings.miningDeck !== 'forq') await this.jpdb.addToDeck('forq', card, sentence);
                if (this.settings.ankiEnabled && this.settings.ankiMineWithJpdb) await this.addToAnki(card, sentence);
                this.toast(`${uiText(this.settings.interfaceLanguage, 'add')} JPDB.`);
            }
            if (action === 'anki') await this.addToAnki(card, sentence);
            if (action === 'anki-edit') {
                const noteId = Number(button.dataset.noteId);
                if (!Number.isFinite(noteId)) throw new Error('Anki note not found.');
                await this.anki.browseNote(noteId);
                this.toast('Opened in Anki.');
            }
            if (action === 'neverforget') await this.toggleDeck(card, 'never-forget', this.settings.neverForgetDeck);
            if (action === 'blacklist') await this.toggleDeck(card, 'blacklisted', this.settings.blacklistDeck);
            if (action === 'grade') {
                const grade = button.dataset.grade as JPDBGrade;
                const ankiCardId = Number(button.dataset.ankiCardId);
                if (Number.isFinite(ankiCardId) && ankiCardId > 0) {
                    await this.anki.answerCard(ankiCardId, grade);
                } else {
                    await this.jpdb.reviewCard(card, grade);
                }
            }
            if (action !== 'audio') await this.showCard(card, sentence, anchor, { autoPlay: false, trigger });
        } catch (error) {
            this.toast(error instanceof Error ? error.message : 'Action failed.');
        } finally {
            button.disabled = false;
        }
    }

    private async addToAnki(card: JPDBCard, sentence?: string): Promise<void> {
        const existing = await this.anki.findExistingCards(card);
        if (existing.primary) {
            this.toast('Already in Anki. Use Edit in Anki instead.');
            await this.showCard(card, sentence, this.activePopoverAnchor, { autoPlay: false, trigger: this.activePopoverMode === 'hover' ? 'hover' : 'modal' });
            return;
        }
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
        const context = await this.resolveMiningContext(card, sentence);
        await this.anki.addCard(card, context.sentence || sentence, {
            imageDataUrl: context.imageDataUrl,
            localEntries,
            kanjiEntries,
            metaEntries,
            dictionaryPreferences: this.settings.dictionaryPreferences,
            sourceTitle: context.sourceTitle || document.title,
            sourceUrl: context.sourceUrl || location.href,
        });
        this.toast(context.imageDataUrl ? 'Added to Anki with context image.' : 'Added to Anki.');
    }

    private async resolveMiningContext(card: JPDBCard, sentence?: string): Promise<MiningContext> {
        const activeContext = this.activeMiningContext?.term === card.spelling ? this.activeMiningContext : undefined;
        const storedImmersionContext = this.immersionContextByCardKey.get(cardKey(card)) ?? loadMiningContext(card.spelling);
        const anchor = this.activePopoverAnchor;
        const ocrImage = this.settings.ankiCaptureScreenshot ? this.ocr.captureSourceImageForElement(anchor ?? null) : undefined;
        if (ocrImage && sentence) {
            const context = saveMiningContext(card.spelling, pageMiningContext(sentence, 'image'));
            return { ...(context ?? pageMiningContext(sentence, 'image')), term: card.spelling, updatedAt: Date.now(), imageDataUrl: ocrImage };
        }

        const videoImage = this.settings.ankiCaptureScreenshot ? captureActiveVideoFrame() : undefined;
        if (videoImage && sentence) {
            const context = saveMiningContext(card.spelling, pageMiningContext(sentence, 'video'));
            return { ...(context ?? pageMiningContext(sentence, 'video')), term: card.spelling, updatedAt: Date.now(), imageDataUrl: videoImage };
        }

        const chosen = activeContext ?? storedImmersionContext;
        if (shouldUseImmersionContext(this.settings, chosen ?? null) && chosen) {
            const imageDataUrl = chosen.imageUrl && this.settings.immersionKitShowImages
                ? await this.immersionKit.fetchDataUrl(chosen.imageUrl, this.settings.audioTimeoutMs).catch(() => undefined)
                : undefined;
            return { ...chosen, imageDataUrl };
        }

        const fallback = saveMiningContext(card.spelling, pageMiningContext(sentence || card.spelling, location.hostname === 'jpdb.io' ? 'jpdb' : 'page'))
            ?? { ...pageMiningContext(sentence || card.spelling, 'page'), term: card.spelling, updatedAt: Date.now() };
        return fallback;
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
            this.stopImmersionKitAudio();
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
                this.jpdbExtensions.refresh();
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
        form.querySelectorAll<HTMLInputElement>('input[name^="wordColor"]').forEach(input => {
            input.addEventListener('input', () => this.applyWordColors(readFormSettings(new FormData(form), this.settings)));
        });
        syncSubtitlePreview(form);
        form.addEventListener('input', event => {
            const name = (event.target as HTMLInputElement | HTMLSelectElement | null)?.name ?? '';
            if (name.startsWith('subtitle')) syncSubtitlePreview(form);
        });
        form.addEventListener('change', event => {
            const name = (event.target as HTMLInputElement | HTMLSelectElement | null)?.name ?? '';
            if (name.startsWith('subtitle')) syncSubtitlePreview(form);
        });
        form.querySelector<HTMLSelectElement>('select[name="interfaceLanguage"]')?.addEventListener('change', event => {
            const value = (event.currentTarget as HTMLSelectElement).value;
            if (value === 'auto' || value === 'en' || value === 'ja') {
                this.settings.interfaceLanguage = value;
                localizeSettingsForm(form, value);
                syncSubtitlePreview(form);
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
                this.jpdbExtensions.refresh();
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
                const language = getFormInterfaceLanguage(form, this.settings.interfaceLanguage);
                const button = control instanceof HTMLButtonElement ? control : control?.closest<HTMLButtonElement>('button');
                const setAnkiStatus = (message: string, tone: 'pending' | 'success' | 'error') => {
                    if (!ankiStatus) return;
                    ankiStatus.textContent = message;
                    ankiStatus.dataset.statusTone = tone;
                };
                const previous = this.settings;
                this.settings = readFormSettings(new FormData(form), this.settings);
                button?.setAttribute('disabled', 'true');
                setAnkiStatus(uiText(language, 'ankiTesting'), 'pending');
                try {
                    const connected = await this.anki.isConnected();
                    if (!connected) throw new Error(uiText(language, 'ankiUnreachable'));
                    await this.anki.ensureDeckAndModel();
                    const readyMessage = resolveUiLanguage(language) === 'ja'
                        ? `接続できました。デッキ「${this.settings.ankiDeck}」とノートタイプ「${this.settings.ankiModel}」を準備しました。`
                        : `Connected. Deck "${this.settings.ankiDeck}" and note type "${this.settings.ankiModel}" are ready.`;
                    setAnkiStatus(readyMessage, 'success');
                } catch (error) {
                    const message = error instanceof Error ? error.message : uiText(language, 'ankiUnreachable');
                    setAnkiStatus(message, 'error');
                    this.toast(message);
                } finally {
                    this.settings = previous;
                    button?.removeAttribute('disabled');
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
        const previousRect = this.activePopoverAnchorRect;
        const resolvedAnchor = anchor?.isConnected
            ? anchor
            : this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined;
        const resolvedRect = resolvedAnchor ? resolvedAnchor.getBoundingClientRect() : undefined;
        const anchorRect = resolvedRect && (resolvedRect.width > 0 || resolvedRect.height > 0)
            ? resolvedRect
            : previousRect;
        this.dismiss({ suppressHoverTarget: false });
        popover.setAttribute('aria-modal', String(useBackdrop));
        if (backdrop) document.body.append(backdrop, popover);
        else document.body.append(popover);
        this.activeBackdrop = backdrop;
        this.activePopover = popover;
        this.activePopoverMode = mode;
        this.activePopoverAnchor = resolvedAnchor;
        this.activePopoverAnchorRect = anchorRect;
        this.activeHoverWord = mode === 'hover' ? resolvedAnchor : undefined;

        if (!popover.classList.contains('jpdb-reader-sheet')) {
            this.activePopoverResizeObserver = new ResizeObserver(() => this.repositionActivePopover());
            this.activePopoverResizeObserver.observe(popover);
            this.repositionActivePopover();
            requestAnimationFrame(() => this.repositionActivePopover());
        } else {
            this.installSheetHandle(popover);
        }
        if (mode === 'hover') this.installHoverPopoverLifecycle(popover);
        else popover.focus();
    }

    private repositionActivePopover(): void {
        if (!this.activePopover || this.activePopover.classList.contains('jpdb-reader-sheet')) return;
        if (this.activePopoverAnchor?.isConnected) {
            const rect = this.activePopoverAnchor.getBoundingClientRect();
            if (rect.width > 0 || rect.height > 0) this.activePopoverAnchorRect = rect;
        }
        positionPopover(this.activePopover, this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined, this.activePopoverAnchorRect);
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
            this.applyWordColors();
        }
        if (this.settingsPreviewOriginalLanguage !== undefined && this.activePopover?.classList.contains('jpdb-reader-settings')) {
            this.settings.interfaceLanguage = this.settingsPreviewOriginalLanguage;
        }
        this.settingsPreviewOriginalAccent = undefined;
        this.settingsPreviewOriginalLanguage = undefined;
        this.activePopover?.remove();
        this.activeBackdrop?.remove();
        this.activePopoverResizeObserver?.disconnect();
        document.querySelectorAll('[data-jpdb-reader-root].jpdb-reader-popover, [data-jpdb-reader-root].jpdb-reader-settings, [data-jpdb-reader-root].jpdb-reader-backdrop')
            .forEach(element => element.remove());
        this.activePopover = undefined;
        this.activeBackdrop = undefined;
        this.activePopoverResizeObserver = undefined;
        this.activePopoverAnchorRect = undefined;
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
