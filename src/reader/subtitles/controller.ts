import { escapeHtml, readerWordSurfaceText, renderTokensToHtml, setInnerHtml } from '../dom/index';
import {
    compactTextLength,
    cueHasExactWordTimings,
    escapeWithBreaks,
    findActiveSubtitleCue,
    findAlignedCue,
    formatSubtitleTime,
    karaokeCharacterProgress,
    normalizeSubtitleCues,
    parseSubtitleText,
    subtitleCueSignature,
    withBreaks,
    type SubtitleCue,
    type SubtitleWordTiming,
} from './subtitle-cues';
import {
    TRANSCRIPT_PANEL_MARGIN,
    applyTranscriptPanelLayout,
    computeSubtitleDrawerLayout,
    loadTranscriptPanelSize,
    saveTranscriptPanelSize,
    shouldUseCompactSubtitleDrawer,
    type SubtitleDrawerLayoutOptions,
    type TranscriptPanelLayout,
} from './subtitle-layout';
import {
    collectPageSubtitleSources,
    normalizedSubtitleUrl,
    sameSubtitleUrl,
    type PageSubtitleSource,
} from './subtitle-sources';
import {
    createSubtitleVideoInsetAdapter,
    subtitleVideoLayoutRect,
    transcriptAvoidanceTarget,
    type SubtitleVideoInsetAdapter,
    type SubtitleVideoInsetSide,
} from './subtitle-video-inset';
import {
    activateYouTubeCaptionTrack,
    discoverYouTubeCaptionTracks,
    getYouTubeVideoId,
    isYouTubeOwnedVideoElement,
    isYouTubePage,
    shouldRefreshYouTubeTrackUrl,
    type YouTubeCaptionTrackCandidate,
    youtubeCaptionTrackIdentity,
    youtubeVideoHasNativeCaptions,
} from './subtitle-youtube';
import {
    ensureTextTrackReadable,
    getTextTrackCueText,
    loadSubtitleTrackCues,
    readTextTrackCues,
    waitForTextTrackCues,
    type SubtitleTrackLoadOptions,
} from './subtitle-track-loader';
import {
    compareSubtitleTrackOptions,
    isEnglishSubtitleTrack,
    isJapaneseSubtitleTrack,
    shouldReplaceWaitingNativeTrack,
} from './subtitle-track-metadata';
import { renderSubtitleTrackPanel, subtitleDrawerMetaText } from './subtitle-track-panel';
import {
    hasSelectedSubtitleTrackOrLines,
    subtitleDrawerButtonState,
    subtitleTrackPanelState,
    syncSubtitleDrawerButton,
    syncSubtitleLineNavigationButton,
    syncSubtitleTrackStatus,
    syncTranscriptPlacementButtons,
} from './subtitle-panel-actions';
import { applySubtitleNativeTrackModes } from './subtitle-native-track-modes';
import {
    canUseDomCaptionFallback as canUseSubtitleDomCaptionFallback,
    mutationCouldAffectVideoDiscovery,
    mutationInsideReaderRoot,
    shouldHideSubtitleRoot,
    shouldKeepIdleControlClass,
    subtitleSourceContextKey,
    videoSummary,
} from './subtitle-player-context';
import { renderSubtitleKaraokeCue, renderSubtitlePrimary, renderSubtitleSecondary } from './subtitle-rendering';
import {
    compareNativeOverlaySubtitleTrackOptions,
    isStalePageSubtitleTrack,
    loadedTrackState,
    updatePageSubtitleTrack,
    type LoadedSubtitleTrackSelection,
    type SubtitleTrackOption,
    type SubtitleTrackSelectionLoadRequest,
    type SubtitleTrackSelectionRole,
} from './subtitle-track-options';
import { planTranscriptHydrationIndexes } from './subtitle-transcript-hydration';
import { readPageCaptionText } from './subtitle-dom-captions';
import {
    canParseSubtitleTranscriptRows,
    authoritativeSubtitleParseOptions,
    hasAttemptedTranscriptParse,
    parsedSubtitleHtmlHasReaderWords,
    provisionalSubtitleParseOptions,
    shouldApplyParsedTranscriptHtml,
    SUBTITLE_EMPTY_PARSE_RETRY_MS,
    subtitleParseOptions,
    subtitleParseSourceSignature,
    waitForBackgroundTranscriptParseTurn,
    type SubtitleParseOptions,
} from './subtitle-parse-policy';
import { renderControllerPrimarySubtitle } from './subtitle-primary-render';
import {
    planProvisionalSubtitleParseBatch,
    planSubtitleParseBatch,
    type ParsedSubtitleHtmlResult,
    type SubtitleParseBatchItem,
} from './subtitle-parse-batch';
import { requestSubtitleText as defaultRequestSubtitleText, subtitleRequestFailureDetails } from './subtitle-request';
import {
    applyElementLayout,
    compareSubtitleVideoCandidates,
    isSubtitleOverlayVideoVisible,
    isSubtitleVideoElementRenderable,
    renderPanelModeControls,
    renderPanelNavigationControls,
    renderPanelPlacementControls,
    renderPausePanelToggle,
    setStylePropertyIfChanged,
    subtitleIcon,
    subtitleOverlayLayout,
} from './subtitle-surface';
import {
    TRANSCRIPT_PANEL_ANIMATION_MS,
    TRANSCRIPT_PANEL_MIN_SIDE_WIDTH,
    minimumSideTranscriptPlayerWidth,
    shouldUseBottomTranscriptLayoutForAvailableWidth,
    transcriptResizeBounds,
    transcriptResizeHandleMetrics,
    transcriptResizeKeyboardDirection,
    transcriptResizePatchForKeyboard,
    transcriptResizePatchForPointerDrag,
} from './subtitles-transcript-resize';
import { OPEN_SUBTITLE_TRACKS_EVENT } from '../app/constants';
import { uiText } from '../app/i18n';
import { Logger } from '../app/logger';
import { accentToRgba, matchesShortcut } from '../settings/index';
import { hasJitenApiCredential, hasJpdbApiCredential } from '../settings/api-credential';
import type { JPDBToken, ReaderSettings } from '../app/types';

export { requestSubtitleText } from './subtitle-request';

const YOUTUBE_SUBTITLE_NAVIGATION_EVENTS = [
    'yt-navigate-finish',
    'yt-page-data-updated',
    'yt-page-type-changed',
    'popstate',
    'hashchange',
] as const;

interface SubtitlePlayerOptions {
    getSettings: () => ReaderSettings;
    parseJapanese: (text: string, options?: SubtitleParseOptions) => Promise<JPDBToken[]>;
    parseJapaneseBatch?: (texts: string[], options?: SubtitleParseOptions) => Promise<JPDBToken[][]>;
    afterParseTokens?: (tokens: JPDBToken[], roots?: ParentNode[]) => void;
    onSettingsChange: () => void;
}

interface TranscriptPanelOptions {
    persist?: boolean;
    autoPause?: boolean;
}

function isYouTubeTheaterMode(): boolean {
    return isYouTubePage() && Boolean(document.querySelector('ytd-watch-flexy[theater], ytd-watch-flexy[fullscreen]'));
}

function subtitleMinimumFontSize(root: HTMLElement): number {
    const rootRect = root.getBoundingClientRect();
    return rootRect.width < 420 || rootRect.height < 260 ? 11 : 14;
}

function subtitleFrameTargetFontSize(root: HTMLElement, settings: ReaderSettings): number {
    const rootRect = root.getBoundingClientRect();
    const width = Math.max(1, rootRect.width);
    const height = Math.max(1, rootRect.height);
    const baseline = Math.max(16, Math.min(64, settings.subtitleFontSize));
    const frameScale = Math.sqrt(Math.min(width / 1280, height / 720));
    const scaled = Math.round(baseline * Math.max(0.62, Math.min(1.45, frameScale)));
    return Math.max(subtitleMinimumFontSize(root), Math.min(64, scaled));
}

function subtitleElementOverflows(element: HTMLElement): boolean {
    return element.scrollHeight > element.clientHeight + 1
        || element.scrollWidth > element.clientWidth + 1;
}

function nextSubtitleFontSize(element: HTMLElement, fitted: number, minimum: number): number {
    const heightScale = element.clientHeight / Math.max(1, element.scrollHeight);
    const widthScale = element.clientWidth / Math.max(1, element.scrollWidth);
    return Math.max(minimum, Math.floor(fitted * Math.min(.92, heightScale, widthScale)));
}

function applyKaraokeClassToWordElement(element: HTMLElement, cursor: number, progress: number): number {
    element.classList.remove('jpdb-subtitle-word-pending', 'jpdb-subtitle-word-spoken', 'jpdb-subtitle-word-current');
    const surface = readerWordSurfaceText(element).replace(/\s+/g, '');
    if (!surface) return cursor;
    const start = cursor;
    const end = cursor + compactTextLength(surface);
    element.classList.add(karaokeWordClass(progress, start, end));
    return end;
}

function karaokeWordClass(progress: number, start: number, end: number): string {
    if (progress >= end) return 'jpdb-subtitle-word-spoken';
    return progress > start ? 'jpdb-subtitle-word-current' : 'jpdb-subtitle-word-pending';
}

function pointInRect(x: number, y: number, rect: DOMRect): boolean {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function clearWindowTimeout(id: number | undefined): undefined {
    if (id !== undefined) window.clearTimeout(id);
    return undefined;
}

function clearWindowAnimationFrame(id: number | undefined): undefined {
    if (id !== undefined) window.cancelAnimationFrame(id);
    return undefined;
}

// Behind matters for the previous-line button: keep enough parsed history
// that stepping back always hits the cache.
const SUBTITLE_ACTIVE_PREPARSE_BEHIND = 6;
const SUBTITLE_ACTIVE_PREPARSE_AHEAD = 10;
const SUBTITLE_CONTROLS_AUTO_IDLE_DELAY_MS = 2500;
const TRANSCRIPT_ACTIVE_HYDRATION_BEHIND = 1;
const TRANSCRIPT_ACTIVE_HYDRATION_AHEAD = 3;
const TRANSCRIPT_HYDRATION_MAX_ROWS = 12;
const TRANSCRIPT_BACKGROUND_HYDRATION_BATCH = 1;
const TRANSCRIPT_BACKGROUND_PARSE_CONCURRENCY = 2;
const TRANSCRIPT_BACKGROUND_PARSE_BATCH = 4;
const TRANSCRIPT_BACKGROUND_PARSE_AHEAD = 32;
const TRANSCRIPT_BACKGROUND_PARSE_BEHIND = 6;
const TRANSCRIPT_BACKGROUND_PARSE_LIMIT = 1500;
const TRANSCRIPT_WARMUP_SIGNATURE_BUCKET_SIZE = 8;
const YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_PAUSE_MS = 120;
// Cues near the playhead must colorise immediately; only the whole-transcript
// tail of the warmup queue is paced.
const TRANSCRIPT_WARMUP_PRIORITY_ROWS = 48;
const SUBTITLE_TICK_ACTIVE_MS = 250;
const SUBTITLE_TICK_PAUSED_MS = 600;
const SUBTITLE_TICK_IDLE_MS = 1500;
const SUBTITLE_TOKEN_ENRICHMENT_RETRY_MS = 1000;
const YOUTUBE_CAPTION_ACTIVATION_RETRY_MS = 2000;
const DOM_CAPTION_STABLE_DELAY_MS = 180;
const YOUTUBE_DOM_CAPTION_FALLBACK_SOURCE_KEY = 'youtube-dom-caption-fallback';
const SUBTITLE_FILE_ACCEPT = '.srt,.vtt,.ass,.ssa,text/vtt';
const log = Logger.scope('Subtitles');
const TRACK_LOAD_OPTIONS: Omit<SubtitleTrackLoadOptions<SubtitleTrackOption>, 'tracks' | 'transcriptEligible'> = {
    requestText: defaultRequestSubtitleText,
    onYouTubeRequestError: (track, url, error) => log.debug('YouTube subtitle request failed', {
        label: track.label,
        ...subtitleRequestFailureDetails(url),
        error,
    }),
};

function normalizedSubtitleText(value: string | null | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
}

interface TranscriptRow {
    cue: SubtitleCue;
    cueIndex: number;
}

interface TranscriptPanelRenderState {
    rows: TranscriptRow[];
    currentRowIndex: number;
    signature: string;
}

interface TranscriptRowHydrationTarget {
    cue: SubtitleCue;
    target: HTMLElement;
    key: string;
}

function transcriptWarmupIndexes(priority: number[], focusIndex: number, rowCount: number): number[] {
    return [
        ...priority,
        ...forwardIndexes(focusIndex, Math.min(rowCount, focusIndex + TRANSCRIPT_BACKGROUND_PARSE_AHEAD)),
        ...backwardIndexes(focusIndex - 1, Math.max(0, focusIndex - TRANSCRIPT_BACKGROUND_PARSE_BEHIND)),
        // Then warm the whole transcript (lowest priority) so ruby is ready ahead
        // of playback instead of appearing line-by-line as cues become active.
        ...forwardIndexes(0, rowCount),
    ];
}

function uniqueSubtitleParseTexts(texts: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const text of texts.map(value => value.trim()).filter(Boolean)) {
        if (seen.has(text)) continue;
        seen.add(text);
        result.push(text);
    }
    return result;
}

function forwardIndexes(start: number, endExclusive: number): number[] {
    const indexes: number[] = [];
    for (let index = start; index < endExclusive; index++) indexes.push(index);
    return indexes;
}

function backwardIndexes(start: number, endInclusive: number): number[] {
    const indexes: number[] = [];
    for (let index = start; index >= endInclusive; index--) indexes.push(index);
    return indexes;
}

function shouldReplaceLoadedCue(next: SubtitleCue | undefined, current: SubtitleCue | undefined): next is SubtitleCue {
    return Boolean(next && next !== current);
}

function shouldClearLoadedCue(next: SubtitleCue | undefined, current: SubtitleCue | undefined, time: number): boolean {
    return Boolean(!next && current && time > current.end + 0.12);
}

function subtitleClipboardText(primary: SubtitleCue | undefined, secondary: SubtitleCue | undefined): string {
    return [primary?.text.trim(), secondary?.text.trim()].filter(Boolean).join('\n');
}

function fittedSubtitleFontSize(element: HTMLElement, fitted: number, minimum: number, apply: (value: number) => void): number {
    for (let attempt = 0; attempt < 10; attempt++) {
        if (!subtitleElementOverflows(element)) return fitted;
        const next = nextSubtitleFontSize(element, fitted, minimum);
        if (next >= fitted) break;
        fitted = next;
        apply(fitted);
    }
    return fitted;
}

export class SubtitlePlayerController {
    private root?: HTMLElement;
    private subtitleEl?: HTMLElement;
    private transcriptPanel?: HTMLElement;
    private abortController?: AbortController;
    private video?: HTMLVideoElement;
    private cues: SubtitleCue[] = [];
    private secondaryCues: SubtitleCue[] = [];
    private tracks: SubtitleTrackOption[] = [];
    private currentCue?: SubtitleCue;
    private secondaryCue?: SubtitleCue;
    private observer?: MutationObserver;
    private videoResizeObserver?: ResizeObserver;
    private discoverTimer?: number;
    private tickTimer?: number;
    private alignFrame?: number;
    private destroyed = false;
    private selectedTrackId = '';
    private secondaryTrackId = '';
    private youtubeVideoId = '';
    private youtubeAutoSelectSuppressedVideoId = '';
    private lastDomCaption = '';
    private pendingDomCaption?: { text: string; firstSeenAt: number };
    private parsedHtmlCache = new Map<string, string>();
    private provisionalParsedHtmlCache = new Map<string, string>();
    private emptyParsedHtmlCache = new Map<string, { html: string; expiresAt: number }>();
    private pendingParsedHtml = new Map<string, Promise<string>>();
    private pendingProvisionalParsedHtml = new Map<string, Promise<string>>();
    private parsedTokenCache = new Map<string, JPDBToken[]>();
    private parsedTokenNotifiedAt = new Map<string, number>();
    private transcriptTextTargetsByParseKey = new Map<string, HTMLElement[]>();
    private renderSerial = 0;
    private panelMode: 'lines' | 'tracks' = 'lines';
    private lastTranscriptSignature = '';
    private transcriptScrollFrame?: number;
    private transcriptHydrateFrame?: number;
    private transcriptInsetRealignFrame?: number;
    private transcriptPanelAnimationFrame?: number;
    private transcriptPanelHideTimer?: number;
    private pointerActivityFrame?: number;
    private pendingPointerActivity?: { x: number; y: number };
    private controlsIdleTimer?: number;
    private transcriptHydrationSerial = 0;
    private transcriptCacheWarmupSerial = 0;
    private transcriptCacheWarmupSignature = '';
    private transcriptPanelSize = loadTranscriptPanelSize();
    private videoInset: SubtitleVideoInsetAdapter = createSubtitleVideoInsetAdapter();
    private lastYomuCaptionsActive = false;
    private youtubeDomCaptionFallbackTrackId = '';
    private fullscreen = false;
    private lastRenderedPrimaryText = '';
    private lastRenderedPrimaryHtml = '';
    private lastRenderedPrimaryKey = '';
    private parseWarmupSerial = 0;
    private transcriptHydrationCursor = 0;
    private effectiveTranscriptPlacement: ReaderSettings['subtitleTranscriptPlacement'] = 'right';
    private lastAutoCopiedCueSignature = '';
    private youtubeTrackDiscoveryInFlight = false;
    private lastYouTubeTrackDiscoveryAt = 0;
    private lastYouTubeCaptionActivationAt = 0;
    private transcriptPanelClosing = false;
    private transcriptLayoutReferenceRect?: DOMRect;
    private transcriptLayoutReferenceViewport = '';
    private primarySelectionRequest = 0;
    private secondarySelectionRequest = 0;
    private subtitleSourceContextKey = '';
    private pausePanelOpen = false;
    private pausePanelDismissed = false;
    private pausePanelSyncScheduled = false;

    constructor(private options: SubtitlePlayerOptions) {}

    private readonly clickHandlers: Record<string, (target: HTMLElement) => void> = {
        cue: target => this.seekToTranscriptRow(this.rowIndexFromTarget(target)),
        previous: () => this.seekSubtitle(-1),
        next: () => this.seekSubtitle(1),
        copy: () => { void this.copySubtitle(); },
        'copy-row': target => { void this.copyTranscriptRow(this.rowIndexFromTarget(target)); },
        load: () => this.openSubtitleFilePicker('primary'),
        'load-secondary': () => this.openSubtitleFilePicker('secondary'),
        panel: () => this.toggleTranscriptDrawer(),
        'panel-lines': () => this.openLinesPanel(),
        'panel-tracks': () => this.openTracksPanel(),
        'close-panel': () => this.closeTranscriptPanel(),
        'transcript-placement': target => this.changeTranscriptPlacement(target),
        'toggle-pause-panel': () => this.togglePausePanelMode(),
        'primary-track': target => { void this.choosePrimaryTrack(this.trackIdFromTarget(target)); },
        'secondary-track': target => { void this.chooseSecondaryTrack(this.trackIdFromTarget(target)); },
        'toggle-native-blur': () => this.toggleNativeSubtitleBlur(),
    };

    init(): void {
        this.destroy();
        this.destroyed = false;
        this.abortController = new AbortController();
        this.install();
        this.observer = new MutationObserver(mutations => {
            if (mutations.every(mutationInsideReaderRoot)) return;
            if (!mutations.some(mutationCouldAffectVideoDiscovery)) return;
            this.scheduleDiscoverVideo();
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
        document.addEventListener('keydown', event => this.handleKeydown(event), this.eventOptions());
        document.addEventListener('pointerdown', event => this.handlePointerActivity(event), this.eventOptions({ passive: true }));
        document.addEventListener('visibilitychange', () => this.restartTickAfterVisibilityChange(), this.eventOptions());
        document.addEventListener('pointermove', event => this.handlePointerActivity(event), this.eventOptions({ passive: true }));
        window.addEventListener(OPEN_SUBTITLE_TRACKS_EVENT, () => this.openSubtitleTracksPanelFromHost(), this.eventOptions());
        for (const eventName of YOUTUBE_SUBTITLE_NAVIGATION_EVENTS) {
            window.addEventListener(eventName, () => this.handleYouTubeNavigation(), this.eventOptions());
        }
        document.addEventListener('fullscreenchange', () => {
            this.fullscreen = Boolean(document.fullscreenElement);
            this.syncFullscreenState();
            this.scheduleAlignToVideo();
            this.render();
        }, this.eventOptions());
        window.addEventListener('scroll', () => this.scheduleAlignToVideo(), this.eventOptions({ passive: true }));
        window.addEventListener('resize', () => {
            this.scheduleAlignToVideo();
        }, this.eventOptions({ passive: true }));
        this.discoverVideo();
        this.tick();
        log.info('Subtitle controller initialized');
    }

    private handleYouTubeNavigation(): void {
        if (!isYouTubePage()) return;
        this.lastYouTubeTrackDiscoveryAt = 0;
        this.scheduleDiscoverVideo();
        void this.discoverYouTubeTracksThrottled(true);
        this.scheduleAlignToVideo();
    }

    destroy(): void {
        this.destroyed = true;
        this.abortController?.abort();
        this.abortController = undefined;
        this.observer?.disconnect();
        this.observer = undefined;
        this.videoResizeObserver?.disconnect();
        this.videoResizeObserver = undefined;
        this.discoverTimer = clearWindowTimeout(this.discoverTimer);
        this.tickTimer = clearWindowTimeout(this.tickTimer);
        this.clearControlsIdleTimer();
        this.alignFrame = clearWindowAnimationFrame(this.alignFrame);
        this.transcriptScrollFrame = clearWindowAnimationFrame(this.transcriptScrollFrame);
        this.transcriptHydrateFrame = clearWindowAnimationFrame(this.transcriptHydrateFrame);
        this.transcriptInsetRealignFrame = clearWindowAnimationFrame(this.transcriptInsetRealignFrame);
        this.clearTranscriptPanelAnimation();
        this.pointerActivityFrame = clearWindowAnimationFrame(this.pointerActivityFrame);
        this.pendingPointerActivity = undefined;
        this.clearVideoInsetForTranscriptPanel();
        this.transcriptPanel?.remove();
        this.root?.remove();
        this.root = undefined;
        this.subtitleEl = undefined;
        this.transcriptPanel = undefined;
        this.video = undefined;
    }

    private eventOptions(options: AddEventListenerOptions = {}): AddEventListenerOptions {
        return this.abortController ? { ...options, signal: this.abortController.signal } : options;
    }

    refresh(): void {
        if (!this.root) return;
        const settings = this.options.getSettings();
        this.syncRootVisibility(settings);
        this.syncTranscriptPlacementClass();
        this.syncFullscreenState();
        this.syncRootStyleSettings(settings);
        this.openTranscriptPanelFromSettings(settings);
        this.syncPauseTranscriptPanel();
        this.scheduleAlignToVideo();
        this.syncControls();
        this.render();
        this.hideControlsImmediately();
    }

    private syncRootVisibility(settings: ReaderSettings): void {
        if (!this.root) return;
        const hidden = shouldHideSubtitleRoot(settings, this.video, this.cues, this.tracks);
        this.root.hidden = hidden;
        if (hidden && this.transcriptPanel) this.hideTranscriptPanelElement({ immediate: true });
        this.root.classList.toggle('jpdb-subtitle-hidden', !settings.subtitleOverlayVisible);
        this.root.classList.toggle('jpdb-subtitle-controls-auto', settings.subtitleControlsMode === 'auto');
        this.root.classList.toggle('jpdb-subtitle-controls-hidden', settings.subtitleControlsMode === 'hidden');
        this.root.classList.toggle('jpdb-subtitle-controls-always', settings.subtitleControlsMode === 'always');
        this.root.classList.toggle('jpdb-subtitle-controls-idle', shouldKeepIdleControlClass(this.root, settings));
        this.transcriptPanel?.classList.toggle('jpdb-subtitle-controls-hidden', settings.subtitleControlsMode === 'hidden');
    }

    private syncRootStyleSettings(settings: ReaderSettings): void {
        if (!this.root) return;
        setStylePropertyIfChanged(this.root, '--subtitle-font-size-target', `${settings.subtitleFontSize}px`);
        setStylePropertyIfChanged(this.root, '--subtitle-font-size', `${settings.subtitleFontSize}px`);
        this.root.style.setProperty('--subtitle-bottom', `${settings.subtitleBottomOffset}%`);
        this.root.style.setProperty('--subtitle-color', settings.subtitleTextColor);
        this.root.style.setProperty('--subtitle-outline', settings.subtitleOutlineColor);
        this.root.style.setProperty('--subtitle-background-rgba', accentToRgba(settings.subtitleBackgroundColor, settings.subtitleBackgroundOpacity));
        this.root.style.setProperty('--subtitle-family', settings.subtitleFontFamily);
        this.root.style.setProperty('--subtitle-weight', String(settings.subtitleFontWeight));
    }

    private openTranscriptPanelFromSettings(settings: ReaderSettings): void {
        if (!settings.subtitleTranscriptVisible || !this.hasTranscriptSurface() || !this.transcriptPanel?.hidden) return;
        this.panelMode = 'lines';
        this.showTranscriptPanelElement();
        this.renderTranscriptPanel(true);
    }

    private install(): void {
        if (this.root) return;
        document.querySelectorAll<HTMLElement>('.jpdb-subtitle-player[data-jpdb-reader-root="true"], .jpdb-subtitle-list[data-jpdb-reader-root="true"]').forEach(element => element.remove());

        const root = document.createElement('div');
        root.className = 'jpdb-subtitle-player';
        root.dataset.jpdbReaderRoot = 'true';
        const settings = this.options.getSettings();
        const previousLabel = uiText(settings.interfaceLanguage, 'previousSubtitle');
        const nextLabel = uiText(settings.interfaceLanguage, 'nextSubtitle');
        const panelLabel = uiText(settings.interfaceLanguage, 'openSubtitlePanel');
        setInnerHtml(root, `
            <div class="jpdb-subtitle-text" aria-live="polite"></div>
            <div class="jpdb-subtitle-status" aria-live="polite"></div>
            <div class="jpdb-subtitle-rail">
                <button type="button" data-action="previous" title="${escapeHtml(previousLabel)}" aria-label="${escapeHtml(previousLabel)}">‹</button>
                <button type="button" data-action="next" title="${escapeHtml(nextLabel)}" aria-label="${escapeHtml(nextLabel)}">›</button>
                <button class="jpdb-subtitle-panel-toggle" type="button" data-action="panel" title="${escapeHtml(panelLabel)}" aria-label="${escapeHtml(panelLabel)}">${subtitleIcon('panel-right')}</button>
            </div>
            <div class="jpdb-subtitle-list" hidden></div>
        `);
        root.addEventListener('click', event => this.handleClick(event));
        this.subtitleEl = root.querySelector('.jpdb-subtitle-text') as HTMLElement;
        this.transcriptPanel = root.querySelector('.jpdb-subtitle-list') as HTMLElement;
        this.transcriptPanel.dataset.jpdbReaderRoot = 'true';
        this.transcriptPanel.addEventListener('click', event => this.handleClick(event), this.eventOptions());
        this.transcriptPanel.addEventListener('keydown', event => this.handleTranscriptPanelKeydown(event), this.eventOptions());
        document.body.appendChild(root);
        document.body.appendChild(this.transcriptPanel);
        this.root = root;
        this.refresh();
        // Touch devices get no pointermove, so without this the rail stays
        // visible forever; tapping the video re-reveals it via pointerdown.
        this.scheduleControlsIdle();
    }

    private scheduleDiscoverVideo(): void {
        if (this.discoverTimer !== undefined) return;
        this.discoverTimer = window.setTimeout(() => {
            this.discoverTimer = undefined;
            if (this.destroyed) return;
            this.discoverVideo();
        }, 120);
    }

    private discoverVideo(): void {
        if (!this.shouldDiscoverVideo()) {
            this.refresh();
            return;
        }
        this.discoverEnabledVideo();
    }

    private shouldDiscoverVideo(): boolean {
        const settings = this.options.getSettings();
        return settings.subtitlePlayerEnabled && settings.subtitleAutoDetect;
    }

    private discoverEnabledVideo(): void {
        const candidate = this.discoverVideoCandidate();
        if (!candidate) {
            if (this.video && !this.isSubtitleVideoCandidate(this.video)) this.clearDiscoveredVideoCandidate();
            this.syncSubtitleSourceContext(undefined);
            this.refresh();
            return;
        }
        if (candidate && candidate !== this.video) this.useDiscoveredVideoCandidate(candidate);
        this.syncSubtitleSourceContext(candidate ?? this.video);
        this.discoverPageSubtitleTracks();
        void this.discoverYouTubeTracksThrottled(true);
        this.refresh();
    }

    private discoverVideoCandidate(): HTMLVideoElement | undefined {
        return Array.from(document.querySelectorAll<HTMLVideoElement>('video'))
            .filter(video => this.isSubtitleVideoCandidate(video))
            .sort(compareSubtitleVideoCandidates)[0];
    }

    private isSubtitleVideoCandidate(video: HTMLVideoElement): boolean {
        if (isYouTubePage() && !isYouTubeOwnedVideoElement(video)) return false;
        return video.readyState >= 1 || video.clientWidth > 120 || video.getBoundingClientRect().width > 120;
    }

    // Our rail belongs next to a real player: if the video offers playback
    // controls (native attribute or a known player chrome) or we actually
    // have subtitle data for it, show ours too. Decorative/ad videos (e.g.
    // Discord promos) have neither, so the rail stays away.
    private videoHasPlayerAffordances(): boolean {
        if (!this.video) return false;
        if (this.video.controls || isYouTubePage()) return true;
        if (this.video.closest('#movie_player, .html5-video-player, [data-yomu-video-frame]')) return true;
        return Boolean(this.tracks.length || this.cues.length || this.currentCue?.text);
    }

    private clearDiscoveredVideoCandidate(): void {
        this.video = undefined;
        this.subtitleSourceContextKey = '';
        this.youtubeVideoId = '';
        this.youtubeAutoSelectSuppressedVideoId = '';
        this.youtubeDomCaptionFallbackTrackId = '';
        this.clearTransientSubtitleState();
        this.removeSubtitleTracks(track => track.kind !== 'file');
        this.setNativeTrackModes();
        this.render();
        this.syncControls();
    }

    private useDiscoveredVideoCandidate(candidate: HTMLVideoElement): void {
        this.video = candidate;
        this.clearTransientSubtitleState();
        this.removeStaleNativeTracks(candidate);
        this.attachTextTracks(candidate);
        this.observeVideoLayout(candidate);
        log.info('Subtitle video detected', videoSummary(candidate));
    }

    private attachTextTracks(video: HTMLVideoElement): void {
        for (const track of Array.from(video.textTracks)) this.addNativeTrack(track);
        video.textTracks.addEventListener?.('addtrack', event => {
            if (video !== this.video) return;
            const track = (event as TrackEvent).track as TextTrack | null;
            if (track) this.addNativeTrack(track);
        }, this.eventOptions());
    }

    private syncSubtitleSourceContext(video = this.video): boolean {
        const key = subtitleSourceContextKey(video);
        if (!key) return false;
        if (!this.subtitleSourceContextKey) {
            this.subtitleSourceContextKey = key;
            return false;
        }
        if (this.subtitleSourceContextKey === key) return false;

        this.subtitleSourceContextKey = key;
        this.youtubeAutoSelectSuppressedVideoId = '';
        this.lastYouTubeTrackDiscoveryAt = 0;
        this.clearTransientSubtitleState();
        this.removeSubtitleTracks(track => track.kind !== 'file');
        return true;
    }

    private clearTransientSubtitleState(): void {
        this.currentCue = undefined;
        this.secondaryCue = undefined;
        this.pendingDomCaption = undefined;
        this.lastDomCaption = '';
        this.lastAutoCopiedCueSignature = '';
        this.lastRenderedPrimaryText = '';
        this.lastRenderedPrimaryHtml = '';
        this.renderSerial += 1;
        this.parseWarmupSerial += 1;
    }

    private removeStaleNativeTracks(video: HTMLVideoElement): void {
        const textTracks = new Set(Array.from(video.textTracks));
        // Synthetic translated tracks have no TextTrack of their own; they are
        // culled with their source via the orphan cascade, not by liveness.
        this.removeSubtitleTracks(track => track.kind === 'native'
            && !track.translatedFromTrackId
            && (!track.track || !textTracks.has(track.track)));
    }

    private removeSubtitleTracks(predicate: (track: SubtitleTrackOption) => boolean): number {
        const removed = this.tracks.filter(predicate);
        if (!removed.length) return 0;

        this.removeSubtitleTrackIds(new Set(removed.map(track => track.id)));
        this.lastTranscriptSignature = '';
        this.render();
        this.renderOpenSubtitlePanel();
        this.syncControls();
        return removed.length;
    }

    private removeSubtitleTrackIds(removedIds: Set<string>): void {
        // Cascade: a synthetic translated track cannot outlive its source.
        const removed = new Set(removedIds);
        for (const track of this.tracks) {
            if (track.translatedFromTrackId && removed.has(track.translatedFromTrackId)) removed.add(track.id);
        }
        this.tracks = this.tracks.filter(track => !removed.has(track.id));
        if (removed.has(this.selectedTrackId)) this.resetPrimarySubtitleState();
        if (removed.has(this.secondaryTrackId)) this.resetSecondarySubtitleState();
    }

    private renderOpenSubtitlePanel(): void {
        if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing) return;
        if (this.panelMode === 'tracks' || !this.hasTranscriptSurface()) this.renderTrackPanel();
        else this.renderTranscriptPanel(true);
    }

    private observeVideoLayout(video: HTMLVideoElement): void {
        this.videoResizeObserver?.disconnect();
        this.videoResizeObserver = new ResizeObserver(() => this.scheduleAlignToVideo());
        this.videoResizeObserver.observe(video);
        video.addEventListener('loadedmetadata', () => this.scheduleAlignToVideo(), this.eventOptions({ passive: true }));
        video.addEventListener('loadeddata', () => this.scheduleAlignToVideo(), this.eventOptions({ passive: true }));
        video.addEventListener('pause', () => this.schedulePauseTranscriptPanelSync(), this.eventOptions({ passive: true }));
        video.addEventListener('play', () => {
            this.pausePanelDismissed = false;
            // Same deferred path as pause: syncPauseTranscriptPanel sees the
            // playing video and closes the auto-opened panel after the paint.
            if (this.pausePanelOpen) this.schedulePauseTranscriptPanelSync();
            this.scheduleAlignToVideo();
        }, this.eventOptions({ passive: true }));
        this.scheduleAlignToVideo();
    }

    private addNativeTrack(track: TextTrack): void {
        if (isYouTubePage()) return;
        if (this.tracks.some(item => item.track === track)) return;
        const id = `native-${this.tracks.length}`;
        const label = track.label || track.language || `${uiText(this.options.getSettings().interfaceLanguage, 'subtitleFallbackLabel')} ${this.tracks.length + 1}`;
        const option: SubtitleTrackOption = { id, label, kind: 'native', language: track.language, track };
        this.tracks.push(option);

        track.addEventListener('cuechange', () => this.updateFromNativeTrack(track), this.eventOptions());
        this.maybeAutoSelectNativeTrack(option);
        if (this.ensureTranslatedJapaneseTrack()) this.maybeAutoSelectTranslatedJapaneseTrack();
        window.setTimeout(() => {
            if (this.destroyed) return;
            this.setNativeTrackModes();
            this.syncControls();
        }, 0);
        this.syncControls();
    }

    private discoverPageSubtitleTracks(): void {
        const sources = collectPageSubtitleSources(document);
        const removed = this.removeStalePageSubtitleTracks(sources);
        if (!sources.length) return;

        const changes = this.addOrUpdatePageSubtitleTracks(sources, removed);
        this.finishPageSubtitleTrackDiscovery(changes);
    }

    private removeStalePageSubtitleTracks(sources: PageSubtitleSource[]): number {
        const sourceKeys = new Set(sources.map(source => source.sourceKey));
        const sourceUrls = new Set(sources.map(source => normalizedSubtitleUrl(source.url)));
        return this.removeSubtitleTracks(track => isStalePageSubtitleTrack(track, sourceKeys, sourceUrls));
    }

    private addOrUpdatePageSubtitleTracks(sources: PageSubtitleSource[], removed: number): { added: number; updated: number; removed: number } {
        const changes = { added: 0, updated: 0, removed };
        for (const source of sources) {
            const result = this.addOrUpdatePageSubtitleTrack(source);
            changes.added += result.added;
            changes.updated += result.updated;
        }
        return changes;
    }

    private finishPageSubtitleTrackDiscovery(changes: { added: number; updated: number; removed: number }): void {
        const generated = this.ensureTranslatedJapaneseTrack();
        if (generated) this.maybeAutoSelectTranslatedJapaneseTrack();
        if (changes.added || changes.updated || changes.removed || generated) {
            this.renderTrackPanel();
            this.syncControls();
        }
    }

    private addOrUpdatePageSubtitleTrack(source: PageSubtitleSource): { added: number; updated: number } {
        const existing = this.findPageSubtitleTrack(source);
        if (existing) return { added: 0, updated: updatePageSubtitleTrack(existing, source) ? 1 : 0 };
        const track = this.createPageSubtitleTrack(source);
        this.tracks.push(track);
        this.maybeAutoSelectPageSubtitleTrack(track);
        return { added: 1, updated: 0 };
    }

    private findPageSubtitleTrack(source: PageSubtitleSource): SubtitleTrackOption | undefined {
        return this.tracks.find(track => track.sourceKey === source.sourceKey || (track.url && sameSubtitleUrl(track.url, source.url)));
    }

    private createPageSubtitleTrack(source: PageSubtitleSource): SubtitleTrackOption {
        return {
            id: `remote-${this.tracks.length}`,
            label: source.label,
            kind: 'remote',
            language: source.language,
            url: source.url,
            sourceKey: source.sourceKey,
        };
    }

    private maybeAutoSelectPageSubtitleTrack(option: SubtitleTrackOption): void {
        if (option.kind !== 'remote' || !option.url) return;
        const selected = this.tracks.find(track => track.id === this.selectedTrackId);
        const secondary = this.tracks.find(track => track.id === this.secondaryTrackId);
        if (this.shouldAutoSelectPrimaryPageTrack(option, selected)) {
            void this.selectTrack(option.id);
            return;
        }
        if (this.shouldAutoSelectSecondaryPageTrack(option, secondary)) {
            void this.selectSecondaryTrack(option.id);
        }
    }

    private shouldAutoSelectPrimaryPageTrack(option: SubtitleTrackOption, selected: SubtitleTrackOption | undefined): boolean {
        return isJapaneseSubtitleTrack(option)
            && (!this.selectedTrackId || this.isSyntheticTranslatedSelection() || shouldReplaceWaitingNativeTrack(selected, option, this.cues));
    }

    private shouldAutoSelectSecondaryPageTrack(option: SubtitleTrackOption, secondary: SubtitleTrackOption | undefined): boolean {
        return isEnglishSubtitleTrack(option)
            && (!this.secondaryTrackId || shouldReplaceWaitingNativeTrack(secondary, option, this.secondaryCues));
    }

    private maybeAutoSelectNativeTrack(option: SubtitleTrackOption): void {
        const track = option.track;
        if (!track) return;
        const role = this.autoSelectableNativeTrackRole(option);
        if (role) this.autoSelectNativeTrack(option, track, role);
    }

    private autoSelectableNativeTrackRole(option: SubtitleTrackOption): 'primary' | 'secondary' | null {
        // A real Japanese track always beats an auto-selected machine translation.
        if (isJapaneseSubtitleTrack(option) && (!this.selectedTrackId || this.isSyntheticTranslatedSelection())) return 'primary';
        if (!this.secondaryTrackId && isEnglishSubtitleTrack(option)) return 'secondary';
        return null;
    }

    private isSyntheticTranslatedSelection(): boolean {
        if (!this.selectedTrackId) return false;
        const selected = this.tracks.find(track => track.id === this.selectedTrackId);
        return Boolean(selected?.translatedFromTrackId);
    }

    private maybeAutoSelectTranslatedJapaneseTrack(): void {
        if (this.selectedTrackId) return;
        const synthetic = this.tracks.find(track => track.translatedFromTrackId && isJapaneseSubtitleTrack(track));
        if (synthetic) void this.selectTrack(synthetic.id);
    }

    private autoSelectNativeTrack(option: SubtitleTrackOption, track: TextTrack, role: 'primary' | 'secondary'): void {
        const requestId = this.beginTrackSelection(role);
        this.setSelectedNativeTrackId(role, option.id);
        ensureTextTrackReadable(track);
        void this.loadNativeTrackCues(option, role, requestId);
    }

    private setSelectedNativeTrackId(role: 'primary' | 'secondary', id: string): void {
        if (role === 'primary') this.selectedTrackId = id;
        else this.secondaryTrackId = id;
    }

    private async loadNativeTrackCues(option: SubtitleTrackOption, role: 'primary' | 'secondary', requestId: number): Promise<void> {
        const track = option.track;
        if (!track) return;
        const cues = readTextTrackCues(track);
        const loadedCues = cues.length ? cues : await waitForTextTrackCues(track);
        if (!this.canApplyNativeTrackCues(option, role, requestId, loadedCues)) return;
        this.applyNativeTrackCues(role, option.id, loadedCues);
        option.loadingState = 'ready';
        this.updateFromLoadedCues();
        this.render();
        this.syncControls();
    }

    private canApplyNativeTrackCues(option: SubtitleTrackOption, role: 'primary' | 'secondary', requestId: number, cues: SubtitleCue[]): boolean {
        return cues.length > 0 && this.isTrackSelectionCurrent(role, requestId, option.id);
    }

    private applyNativeTrackCues(role: 'primary' | 'secondary', optionId: string, cues: SubtitleCue[]): void {
        if (role === 'primary' && this.selectedTrackId === optionId) this.cues = cues;
        if (role === 'secondary' && this.secondaryTrackId === optionId) this.secondaryCues = cues;
    }

    private updateFromNativeTrack(track: TextTrack): void {
        const active = track.activeCues?.[0] as VTTCue | TextTrackCue | undefined;
        if (!active) return;
        this.updatePrimaryNativeTrackCue(track, active);
        this.updateSecondaryNativeTrackCue(track, active);
        this.render();
        this.renderTranscriptPanel();
        this.syncPauseTranscriptPanel();
        this.syncControls();
    }

    private updatePrimaryNativeTrackCue(track: TextTrack, active: VTTCue | TextTrackCue): void {
        const primary = this.tracks.find(item => item.id === this.selectedTrackId);
        if (primary?.track === track) {
            this.currentCue = normalizeSubtitleCues([{ start: active.startTime, end: active.endTime, text: getTextTrackCueText(active) }])[0];
            if (!this.cues.length) this.cues = readTextTrackCues(track);
            void this.autoCopyCurrentCue();
        }
    }

    private updateSecondaryNativeTrackCue(track: TextTrack, active: VTTCue | TextTrackCue): void {
        const secondary = this.tracks.find(item => item.id === this.secondaryTrackId);
        if (secondary?.track === track) {
            this.secondaryCue = normalizeSubtitleCues([{ start: active.startTime, end: active.endTime, text: getTextTrackCueText(active), transcriptEligible: false }])[0];
            if (!this.secondaryCues.length) this.secondaryCues = readTextTrackCues(track);
        }
    }

    private tick(): void {
        if (this.destroyed) return;
        const settings = this.options.getSettings();
        if (settings.subtitlePlayerEnabled && !document.hidden) this.tickSubtitlePlayer(settings);
        this.tickTimer = window.setTimeout(() => {
            this.tickTimer = undefined;
            this.tick();
        }, this.tickDelayMs(settings));
    }

    // The 250ms cadence is only needed while a video is actually playing;
    // hidden tabs and videoless pages ticking that fast just drains battery.
    private tickDelayMs(settings: ReaderSettings): number {
        if (document.hidden || !settings.subtitlePlayerEnabled || !this.video) return SUBTITLE_TICK_IDLE_MS;
        if (this.video.paused && !this.isTranscriptPanelOpen()) return SUBTITLE_TICK_PAUSED_MS;
        return SUBTITLE_TICK_ACTIVE_MS;
    }

    private restartTickAfterVisibilityChange(): void {
        if (this.destroyed || document.hidden || this.tickTimer === undefined) return;
        window.clearTimeout(this.tickTimer);
        this.tickTimer = undefined;
        this.tick();
    }

    private tickSubtitlePlayer(settings: ReaderSettings): void {
        this.refreshSubtitleSourcesForTick();
        this.refreshNativeCueLists();
        this.updateFromLoadedCues();
        this.syncPlayerChromeIdleState();
        if (settings.subtitleKaraokeMode && cueHasExactWordTimings(this.currentCue)) this.render();
        if (this.shouldUpdateFromDomCaptions()) this.updateFromDomCaptions();
    }

    private syncPlayerChromeIdleState(): void {
        if (!this.root || !this.shouldAutoIdleControls() || !this.videoPlayerChromeHidden()) return;
        this.hideControlsImmediately();
    }

    private refreshSubtitleSourcesForTick(): void {
        if (this.syncSubtitleSourceContext(this.video)) this.refreshDiscoveredSubtitleTracks();
        if (this.shouldRefreshYouTubeTracks()) void this.discoverYouTubeTracksThrottled();
    }

    private refreshDiscoveredSubtitleTracks(): void {
        this.discoverPageSubtitleTracks();
        void this.discoverYouTubeTracksThrottled(true);
    }

    private shouldRefreshYouTubeTracks(): boolean {
        return isYouTubePage()
            && Boolean(getYouTubeVideoId())
            && (!this.video || isYouTubeOwnedVideoElement(this.video))
            && (!this.selectedTrackId || !this.cues.length);
    }

    private shouldUpdateFromDomCaptions(): boolean {
        if (!isYouTubePage()) return true;
        return Boolean(getYouTubeVideoId())
            && isYouTubeOwnedVideoElement(this.video)
            && !this.cues.length
            && (Boolean(this.selectedTrackId) || !this.tracks.some(track => track.kind === 'youtube'));
    }

    private refreshNativeCueLists(): void {
        const primary = this.tracks.find(item => item.id === this.selectedTrackId);
        const secondary = this.tracks.find(item => item.id === this.secondaryTrackId);
        this.refreshNativeCueList(primary, this.cues.length, cues => { this.cues = cues; });
        this.refreshNativeCueList(secondary, this.secondaryCues.length, cues => { this.secondaryCues = cues; });
    }

    private refreshNativeCueList(track: SubtitleTrackOption | undefined, currentLength: number, assign: (cues: SubtitleCue[]) => void): void {
        if (!track?.track) return;
        const cues = readTextTrackCues(track.track);
        if (cues.length && cues.length !== currentLength) assign(cues);
    }

    private alignToVideo(): void {
        if (!this.root || !this.video) {
            this.root?.classList.remove('jpdb-subtitle-video-out-of-view');
            this.positionTranscriptPanel();
            return;
        }
        const rect = this.videoLayoutRect();
        this.applyVideoLayout(rect);
    }

    private applyVideoLayout(rect: DOMRect): void {
        if (!this.root) return;
        const videoVisible = isSubtitleOverlayVideoVisible(rect)
            && (!this.video || isSubtitleVideoElementRenderable(this.video))
            && this.videoHasPlayerAffordances();
        this.root.classList.toggle('jpdb-subtitle-video-out-of-view', !videoVisible);
        if (!videoVisible) {
            this.clearVideoInsetForTranscriptPanel();
            return;
        }
        const layout = subtitleOverlayLayout(rect);
        this.root.classList.toggle('jpdb-subtitle-compact-video', layout.width < 560 || layout.height < 260);
        if (rect.width < 120 || rect.height < 80) {
            applyElementLayout(this.root, { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight });
            this.positionTranscriptPanel();
            this.fitSubtitleTextToVideo();
            return;
        }
        applyElementLayout(this.root, layout);
        this.positionTranscriptPanel({ realignAfterInset: true });
        this.fitSubtitleTextToVideo();
    }

    private updateFromLoadedCues(): void {
        if (!this.video) return;
        const time = this.video.currentTime;
        const cue = this.selectedTrackId ? findActiveSubtitleCue(this.cues, time) : undefined;
        const secondary = this.secondaryTrackId ? findActiveSubtitleCue(this.secondaryCues, time) : undefined;
        if (this.updateLoadedCueState(cue, secondary, time)) this.afterLoadedCueStateChanged();
    }

    private updateLoadedCueState(cue: SubtitleCue | undefined, secondary: SubtitleCue | undefined, time: number): boolean {
        return this.updateLoadedPrimaryCue(cue, time) || this.updateLoadedSecondaryCue(secondary);
    }

    private afterLoadedCueStateChanged(): void {
        this.render();
        this.renderTranscriptPanel();
        this.syncPauseTranscriptPanel();
        this.syncControls();
        this.warmParseAroundActiveCue();
        this.scheduleTranscriptCacheWarmup();
        void this.autoCopyCurrentCue();
    }

    private updateLoadedPrimaryCue(cue: SubtitleCue | undefined, time: number): boolean {
        if (shouldReplaceLoadedCue(cue, this.currentCue)) return this.replaceLoadedPrimaryCue(cue);
        if (shouldClearLoadedCue(cue, this.currentCue, time)) return this.clearLoadedPrimaryCue();
        return false;
    }

    private replaceLoadedPrimaryCue(cue: SubtitleCue): boolean {
        this.currentCue = cue;
        return true;
    }

    private clearLoadedPrimaryCue(): boolean {
        this.currentCue = undefined;
        return true;
    }

    private updateLoadedSecondaryCue(secondary: SubtitleCue | undefined): boolean {
        if (secondary === this.secondaryCue) return false;
        this.secondaryCue = secondary;
        return true;
    }

    private updateFromDomCaptions(): void {
        const fallback = this.domCaptionFallback();
        if (!fallback) return;
        this.applyDomCaptionFallback(fallback.text, fallback.selected);
    }

    private domCaptionFallback(): { text: string; selected: SubtitleTrackOption | undefined } | null {
        if (this.cues.length) return null;
        let selected = this.tracks.find(track => track.id === this.selectedTrackId);
        if (!this.shouldUseDomCaptionFallback(selected)) return null;
        selected = this.ensureDomCaptionFallbackTrack(selected);
        this.ensureYouTubeDomCaptionFallbackActive(selected);
        const text = readPageCaptionText(this.video, this.root, {
            allowNonJapanese: this.shouldAllowNonJapaneseDomCaptionFallback(selected),
        });
        if (!text) {
            this.clearDomCaptionFallbackIfExpired();
            return null;
        }
        if (!this.isDomCaptionStable(text, performance.now())) return null;

        return { text, selected };
    }

    private ensureYouTubeDomCaptionFallbackActive(selected: SubtitleTrackOption | undefined): void {
        if (selected?.kind !== 'youtube') return;
        if (this.youtubeDomCaptionFallbackTrackId !== this.selectedTrackId) return;
        const now = performance.now();
        if (now - this.lastYouTubeCaptionActivationAt < YOUTUBE_CAPTION_ACTIVATION_RETRY_MS) return;
        this.lastYouTubeCaptionActivationAt = now;
        activateYouTubeCaptionTrack(selected);
    }

    private shouldUseDomCaptionFallback(selected: SubtitleTrackOption | undefined): boolean {
        if (!this.canUseDomCaptionFallback(selected)) return false;
        return this.options.getSettings().subtitleOverlayVisible;
    }

    private canUseDomCaptionFallback(selected: SubtitleTrackOption | undefined): boolean {
        return canUseSubtitleDomCaptionFallback({
            selected,
            tracks: this.tracks,
            selectedTrackId: this.selectedTrackId,
            cues: this.cues,
            video: this.video,
        });
    }

    private ensureDomCaptionFallbackTrack(selected: SubtitleTrackOption | undefined): SubtitleTrackOption | undefined {
        if (!isYouTubePage() || selected || this.tracks.some(track => track.kind === 'youtube')) return selected;
        if (!youtubeVideoHasNativeCaptions()) return selected;
        const track = this.createYouTubeDomCaptionFallbackTrack();
        this.tracks.push(track);
        this.selectedTrackId = track.id;
        this.youtubeDomCaptionFallbackTrackId = track.id;
        return track;
    }

    private createYouTubeDomCaptionFallbackTrack(): SubtitleTrackOption {
        const videoId = getYouTubeVideoId();
        return {
            id: `youtube-dom-${this.youtubeVideoId || videoId}`,
            label: 'YouTube native captions',
            kind: 'youtube',
            loadingState: 'waiting',
            sourceKey: YOUTUBE_DOM_CAPTION_FALLBACK_SOURCE_KEY,
        };
    }

    private shouldAllowNonJapaneseDomCaptionFallback(selected: SubtitleTrackOption | undefined): boolean {
        return Boolean(selected?.kind === 'youtube'
            && selected.sourceKey !== YOUTUBE_DOM_CAPTION_FALLBACK_SOURCE_KEY);
    }

    private clearDomCaptionFallbackIfExpired(): void {
        this.pendingDomCaption = undefined;
        if (!this.cues.length && this.currentCue && (this.video?.currentTime ?? 0) > this.currentCue.end) {
            this.currentCue = undefined;
            this.lastDomCaption = '';
            this.render();
            this.syncControls();
        }
    }

    private isDomCaptionStable(text: string, nowMs: number): boolean {
        if (this.pendingDomCaption?.text !== text) {
            this.pendingDomCaption = { text, firstSeenAt: nowMs };
            return false;
        }
        return nowMs - this.pendingDomCaption.firstSeenAt >= DOM_CAPTION_STABLE_DELAY_MS && text !== this.lastDomCaption;
    }

    private applyDomCaptionFallback(text: string, selected: SubtitleTrackOption | undefined): void {
        this.lastDomCaption = text;
        const now = this.video?.currentTime ?? 0;
        this.currentCue = normalizeSubtitleCues([{ start: now, end: now + 4, text }])[0];
        if (selected?.loadingState === 'waiting') selected.loadingState = 'ready';
        this.render();
        this.renderTranscriptPanel();
        this.syncControls();
        void this.autoCopyCurrentCue();
    }

    private render(): void {
        if (!this.subtitleEl) return;
        const settings = this.options.getSettings();
        const text = this.currentCue?.text.trim() ?? '';
        if (!text) {
            this.renderEmptySubtitle(settings);
            return;
        }
        this.renderActiveSubtitle(text, settings);
    }

    private renderEmptySubtitle(settings: ReaderSettings): void {
        if (!this.subtitleEl) return;
        setInnerHtml(this.subtitleEl, this.secondaryCue?.text ? renderSubtitleSecondary(this.secondaryCue.text, settings.subtitleNativeBlurred, settings.interfaceLanguage) : '');
    }

    private renderActiveSubtitle(text: string, settings: ReaderSettings): void {
        if (!this.subtitleEl) return;
        const primary = this.renderPrimarySubtitle(text, settings);
        setInnerHtml(this.subtitleEl, `<div class="jpdb-subtitle-primary">${primary.html}</div>${this.renderSecondarySubtitle(settings)}`);
        this.applyRenderedPrimarySubtitle(primary, text);
        this.notifyParsedTokensForRenderedPrimary(text, settings, primary.html);
    }

    // A cache-hit render (e.g. stepping back to a previous line) inserts fresh
    // DOM, so JPDB/Anki state colors must be re-applied to the new nodes even
    // though the parse itself was cached.
    private notifyParsedTokensForRenderedPrimary(text: string, settings: ReaderSettings, html: string): void {
        if (!parsedSubtitleHtmlHasReaderWords(html)) return;
        const primary = this.subtitleEl?.querySelector<HTMLElement>('.jpdb-subtitle-primary');
        if (!primary) return;
        this.notifyParsedTokensForKey(this.parseCacheKey(text, settings), true, [primary]);
    }

    private renderPrimarySubtitle(text: string, settings: ReaderSettings): ReturnType<typeof renderSubtitlePrimary> {
        const activeCue = this.currentCue;
        const parseKey = this.parseCacheKey(text, settings);
        return renderControllerPrimarySubtitle({
            cue: activeCue,
            text,
            settings,
            parseKey,
            parsedHtml: this.primaryParsedHtmlForRender(text, settings, parseKey),
            lastRenderedKey: this.lastRenderedPrimaryKey,
            lastRenderedText: this.lastRenderedPrimaryText,
            lastRenderedHtml: this.lastRenderedPrimaryHtml,
            hasFreshEmptyParsedHtml: this.hasFreshEmptyParsedHtml(parseKey),
            hasParser: this.shouldParseSubtitles(settings),
            time: this.video?.currentTime ?? activeCue?.start ?? 0,
        });
    }

    private primaryParsedHtmlForRender(text: string, settings: ReaderSettings, key: string): string | undefined {
        const cached = this.parsedHtmlCache.get(key);
        if (cached !== undefined) return cached;
        const provisional = this.provisionalParsedHtmlCache.get(key);
        if (provisional !== undefined) {
            if (this.shouldUseProvisionalSubtitleParse(settings)) this.ensureAuthoritativeParsedCueHtml(text, settings, key);
            return provisional;
        }
        return undefined;
    }

    private renderSecondarySubtitle(settings: ReaderSettings): string {
        return settings.subtitleSecondaryVisible && this.secondaryCue?.text
            ? renderSubtitleSecondary(this.secondaryCue.text, settings.subtitleNativeBlurred, settings.interfaceLanguage)
            : '';
    }

    private applyRenderedPrimarySubtitle(primary: ReturnType<typeof renderSubtitlePrimary>, text: string): void {
        this.applyRenderedPrimaryKaraoke(primary);
        this.fitSubtitleTextToVideo();
        this.cacheRenderedPrimarySubtitle(primary);
        this.requestParsedPrimaryIfNeeded(primary, text);
    }

    private applyRenderedPrimaryKaraoke(primary: ReturnType<typeof renderSubtitlePrimary>): void {
        const activeCue = this.currentCue;
        if (primary.karaokeActive && activeCue) this.applyKaraokeStateToPrimary(activeCue, this.video?.currentTime ?? activeCue.start);
    }

    private cacheRenderedPrimarySubtitle(primary: ReturnType<typeof renderSubtitlePrimary>): void {
        if (!primary.nextRenderedPrimary) return;
        this.lastRenderedPrimaryText = primary.nextRenderedPrimary.text;
        this.lastRenderedPrimaryHtml = primary.nextRenderedPrimary.html;
    }

    private requestParsedPrimaryIfNeeded(primary: ReturnType<typeof renderSubtitlePrimary>, text: string): void {
        if (primary.shouldRequestParse) void this.renderParsedPrimary(text);
    }

    private async renderParsedPrimary(text: string): Promise<void> {
        const settings = this.options.getSettings();
        const key = this.parseCacheKey(text, settings);
        const serial = ++this.renderSerial;
        const cached = this.parsedHtmlCache.get(key);
        if (cached) {
            const root = this.replacePrimaryHtml(cached, serial);
            if (root) this.notifyParsedTokensForKey(key, true, [root]);
            return;
        }

        try {
            const html = await this.parseCueHtml(text, settings);
            this.applyParsedPrimaryHtml(key, text, html, serial);
        } catch {
            // Keep plain selectable subtitles if JPDB is unavailable.
        }
    }

    private replacePrimaryHtml(html: string, serial: number): HTMLElement | null {
        if (serial !== this.renderSerial) return null;
        const primary = this.subtitleEl?.querySelector('.jpdb-subtitle-primary');
        if (primary) {
            const currentCue = this.currentCue ?? null;
            const shouldKaraoke = !parsedSubtitleHtmlHasReaderWords(html)
                && this.shouldRenderKaraokePrimary(primary, currentCue);
            setInnerHtml(primary, this.primaryReplacementHtml(html, currentCue, shouldKaraoke));
            this.syncKaraokePrimary(currentCue, shouldKaraoke);
            this.fitSubtitleTextToVideo();
            return primary as HTMLElement;
        }
        return null;
    }

    private shouldRenderKaraokePrimary(primary: Element, currentCue: SubtitleCue | null): boolean {
        return Boolean(this.options.getSettings().subtitleKaraokeMode
            && currentCue
            && cueHasExactWordTimings(currentCue)
            && normalizedSubtitleText(primary.textContent) === normalizedSubtitleText(currentCue.text));
    }

    private primaryReplacementHtml(html: string, currentCue: SubtitleCue | null, shouldKaraoke: boolean): string {
        return shouldKaraoke && currentCue && !html.includes('jpdb-reader-word')
            ? renderSubtitleKaraokeCue(currentCue, this.video?.currentTime ?? currentCue.start)
            : html;
    }

    private syncKaraokePrimary(currentCue: SubtitleCue | null, shouldKaraoke: boolean): void {
        if (!shouldKaraoke || !currentCue) return;
        this.applyKaraokeStateToPrimary(currentCue, this.video?.currentTime ?? currentCue.start);
    }

    private shouldParseSubtitles(settings = this.options.getSettings()): boolean {
        return canParseSubtitleTranscriptRows(settings);
    }

    private parseCacheKey(text: string, settings = this.options.getSettings()): string {
        return [
            subtitleParseSourceSignature(settings),
            settings.showFurigana,
            settings.furiganaMode,
            settings.hideKnownFurigana,
            settings.wordHighlightColorSource,
            settings.wordUnderlineColorSource,
            settings.wordTextColorSource,
            settings.subtitleHighlightColorSource,
            settings.subtitleUnderlineColorSource,
            settings.subtitleTextColorSource,
            text,
        ].join(':');
    }

    private async parseCueHtml(text: string, settings = this.options.getSettings(), options: { allowProvisional?: boolean } = {}): Promise<string> {
        const key = this.parseCacheKey(text, settings);
        const cached = this.parsedHtmlCache.get(key);
        if (cached) {
            return cached;
        }
        const emptyCached = this.freshEmptyParsedHtml(key);
        if (emptyCached) return emptyCached;
        if (options.allowProvisional !== false && this.shouldUseProvisionalSubtitleParse(settings)) return await this.parseProvisionalCueHtml(text, settings, key);
        const pending = this.pendingParsedHtml.get(key);
        if (pending) return pending;
        const promise = (async () => {
            const tokens = await this.options.parseJapanese(text, subtitleParseOptions(settings));
            const html = withBreaks(renderTokensToHtml(text, tokens, settings));
            this.rememberParsedCueHtml(key, html, tokens);
            return html;
        })();
        this.pendingParsedHtml.set(key, promise);
        try {
            return await promise;
        } finally {
            this.pendingParsedHtml.delete(key);
        }
    }

    private async parseProvisionalCueHtml(text: string, settings: ReaderSettings, key: string): Promise<string> {
        this.ensureAuthoritativeParsedCueHtml(text, settings, key);
        const cached = this.provisionalParsedHtmlCache.get(key);
        if (cached) {
            return cached;
        }
        const pending = this.pendingProvisionalParsedHtml.get(key);
        if (pending) return pending;
        const promise = (async () => {
            const tokens = await this.options.parseJapanese(text, provisionalSubtitleParseOptions());
            const html = withBreaks(renderTokensToHtml(text, tokens, settings));
            this.rememberParsedCueHtml(key, html, tokens, { provisional: true });
            return html;
        })();
        this.pendingProvisionalParsedHtml.set(key, promise);
        try {
            return await promise;
        } finally {
            this.pendingProvisionalParsedHtml.delete(key);
        }
    }

    private ensureAuthoritativeParsedCueHtml(text: string, settings: ReaderSettings, key: string): void {
        this.ensureAuthoritativeParsedCueHtmlBatch([{ text, key }], settings);
    }

    private ensureAuthoritativeParsedCueHtmlBatch(items: SubtitleParseBatchItem[], settings: ReaderSettings): void {
        // Without an API credential there is no authoritative tier to upgrade
        // to; the provisional parse is the final result for both surfaces.
        if (!hasJpdbApiCredential(settings) && !hasJitenApiCredential(settings)) return;
        const missing = items.filter(item => !this.parsedHtmlCache.has(item.key) && !this.pendingParsedHtml.has(item.key));
        if (!missing.length) return;
        const parsed = this.options.parseJapaneseBatch
            ? this.options.parseJapaneseBatch(missing.map(item => item.text), authoritativeSubtitleParseOptions())
            : Promise.all(missing.map(item => this.options.parseJapanese(item.text, authoritativeSubtitleParseOptions())));
        const parsedHtml = missing.map((item, index) => parsed.then(tokens => {
            const tokenList = tokens[index] ?? [];
            const html = withBreaks(renderTokensToHtml(item.text, tokenList, settings));
            this.rememberParsedCueHtml(item.key, html, tokenList, { forceNotify: true });
            this.applyAuthoritativeParsedCueHtml(item.key, item.text, html);
            return html;
        }));
        missing.forEach((item, index) => this.pendingParsedHtml.set(item.key, parsedHtml[index]));
        void Promise.allSettled(parsedHtml).finally(() => {
            missing.forEach((item, index) => {
                if (this.pendingParsedHtml.get(item.key) === parsedHtml[index]) this.pendingParsedHtml.delete(item.key);
            });
        });
    }

    private applyAuthoritativeParsedCueHtml(key: string, text: string, html: string): void {
        this.updateTranscriptRowsForParseKey(key, html);
        if (this.currentPrimaryParseCacheKey() !== key) return;
        this.applyParsedPrimaryHtml(key, text, html, ++this.renderSerial);
    }

    private applyParsedPrimaryHtml(key: string, text: string, html: string, serial: number): void {
        const root = this.replacePrimaryHtml(html, serial);
        this.lastRenderedPrimaryKey = key;
        this.lastRenderedPrimaryText = text;
        this.lastRenderedPrimaryHtml = html;
        if (root) this.notifyParsedTokensForKey(key, true, [root]);
    }

    private currentPrimaryParseCacheKey(): string {
        const text = this.currentCue?.text.trim() ?? '';
        return text ? this.parseCacheKey(text, this.options.getSettings()) : '';
    }

    private async parseCueHtmlBatch(texts: string[], settings = this.options.getSettings(), options: { allowProvisional?: boolean } = {}): Promise<ParsedSubtitleHtmlResult[]> {
        const items = uniqueSubtitleParseTexts(texts).map(text => ({ text, key: this.parseCacheKey(text, settings) }));
        if (options.allowProvisional !== false && this.shouldUseProvisionalSubtitleParse(settings)) return await this.parseCueHtmlBatchWithProvisionalFallback(items, settings);

        const { ready, batch } = planSubtitleParseBatch(
            items,
            key => this.parsedHtmlCache.get(key) ?? this.freshEmptyParsedHtml(key),
            key => this.pendingParsedHtml.get(key),
        );
        if (!batch.length) return Promise.all(ready);
        if (!this.options.parseJapaneseBatch) {
            return Promise.all([...ready, ...batch.map(async item => ({
                key: item.key,
                html: await this.parseCueHtml(item.text, settings, options),
            }))]);
        }

        const parsed = this.options.parseJapaneseBatch(batch.map(item => item.text), subtitleParseOptions(settings));
        const parsedHtml = this.renderParsedHtmlBatch(batch, parsed, settings);
        return await this.resolveParsedHtmlBatch(ready, batch, parsedHtml, this.pendingParsedHtml);
    }

    private async parseCueHtmlBatchWithProvisionalFallback(items: SubtitleParseBatchItem[], settings: ReaderSettings): Promise<ParsedSubtitleHtmlResult[]> {
        this.ensureAuthoritativeParsedCueHtmlBatch(items, settings);
        const { ready, batch } = planProvisionalSubtitleParseBatch(
            items,
            this.parsedHtmlCache,
            this.provisionalParsedHtmlCache,
            this.pendingProvisionalParsedHtml,
        );
        if (!batch.length) return Promise.all(ready);
        const parsed = this.options.parseJapaneseBatch
            ? this.options.parseJapaneseBatch(batch.map(item => item.text), provisionalSubtitleParseOptions())
            : Promise.all(batch.map(item => this.options.parseJapanese(item.text, provisionalSubtitleParseOptions())));
        const parsedHtml = this.renderParsedHtmlBatch(batch, parsed, settings, { provisional: true });
        return await this.resolveParsedHtmlBatch(ready, batch, parsedHtml, this.pendingProvisionalParsedHtml);
    }

    private renderParsedHtmlBatch(
        batch: SubtitleParseBatchItem[],
        parsed: Promise<JPDBToken[][]>,
        settings: ReaderSettings,
        options: { provisional?: boolean } = {},
    ): Promise<ParsedSubtitleHtmlResult>[] {
        return batch.map((item, index) => parsed.then(tokens => {
            const tokenList = tokens[index] ?? [];
            const html = withBreaks(renderTokensToHtml(item.text, tokenList, settings));
            this.rememberParsedCueHtml(item.key, html, tokenList, options);
            return options.provisional ? { key: item.key, html, provisional: true } : { key: item.key, html };
        }));
    }

    private async resolveParsedHtmlBatch(
        ready: Promise<ParsedSubtitleHtmlResult>[],
        batch: SubtitleParseBatchItem[],
        parsedHtml: Promise<ParsedSubtitleHtmlResult>[],
        pendingCache: Map<string, Promise<string>>,
    ): Promise<ParsedSubtitleHtmlResult[]> {
        const pendingHtml = parsedHtml.map(promise => promise.then(result => result.html));
        batch.forEach((item, index) => pendingCache.set(item.key, pendingHtml[index]));
        try {
            return await Promise.all([...ready, ...parsedHtml]);
        } finally {
            batch.forEach((item, index) => {
                if (pendingCache.get(item.key) === pendingHtml[index]) pendingCache.delete(item.key);
            });
        }
    }

    private rememberParsedCueHtml(key: string, html: string, tokens: JPDBToken[] = [], options: { provisional?: boolean; forceNotify?: boolean } = {}): void {
        if (parsedSubtitleHtmlHasReaderWords(html)) {
            if (options.provisional) this.provisionalParsedHtmlCache.set(key, html);
            else {
                this.parsedHtmlCache.set(key, html);
                this.provisionalParsedHtmlCache.delete(key);
            }
            this.emptyParsedHtmlCache.delete(key);
            if (tokens.length) this.parsedTokenCache.set(key, tokens);
            this.pruneParsedSubtitleCaches();
        } else {
            if (!options.provisional) {
                this.emptyParsedHtmlCache.set(key, { html, expiresAt: Date.now() + SUBTITLE_EMPTY_PARSE_RETRY_MS });
                this.pruneParsedSubtitleCaches();
            }
        }
    }

    private pruneParsedSubtitleCaches(): void {
        this.pruneParsedSubtitleCache(this.parsedHtmlCache);
        this.pruneParsedSubtitleCache(this.provisionalParsedHtmlCache);
        while (this.emptyParsedHtmlCache.size > 180) this.deleteParsedSubtitleKey(this.emptyParsedHtmlCache.keys().next().value ?? '');
        while (this.parsedTokenCache.size > 180) this.deleteParsedSubtitleKey(this.parsedTokenCache.keys().next().value ?? '');
    }

    private pruneParsedSubtitleCache(cache: Map<string, string>): void {
        while (cache.size > 180) this.deleteParsedSubtitleKey(cache.keys().next().value ?? '');
    }

    private deleteParsedSubtitleKey(key: string): void {
        if (!key) return;
        this.parsedHtmlCache.delete(key);
        this.provisionalParsedHtmlCache.delete(key);
        this.emptyParsedHtmlCache.delete(key);
        this.pendingParsedHtml.delete(key);
        this.pendingProvisionalParsedHtml.delete(key);
        this.parsedTokenCache.delete(key);
        this.parsedTokenNotifiedAt.delete(key);
    }

    private notifyParsedTokensForKey(key: string, force = false, roots?: ParentNode[]): void {
        if (!this.options.afterParseTokens) return;
        const tokens = this.parsedTokenCache.get(key);
        if (!tokens?.length) return;
        const now = Date.now();
        const lastNotifiedAt = this.parsedTokenNotifiedAt.get(key) ?? 0;
        if (!force && now - lastNotifiedAt < SUBTITLE_TOKEN_ENRICHMENT_RETRY_MS) return;
        this.parsedTokenNotifiedAt.set(key, now);
        this.options.afterParseTokens(tokens, roots);
    }

    private shouldUseProvisionalSubtitleParse(_settings: ReaderSettings): boolean {
        // The provisional tier (skipJpdb + segmented fallback) is also the
        // keyless parse, so overlay cues render colorised immediately even
        // without an API key instead of waiting on the slow JPDB-timeout path.
        return isYouTubePage();
    }

    private hasFreshEmptyParsedHtml(key: string): boolean {
        return Boolean(this.freshEmptyParsedHtml(key));
    }

    private freshEmptyParsedHtml(key: string): string | undefined {
        const cached = this.emptyParsedHtmlCache.get(key);
        if (!cached) return undefined;
        if (cached.expiresAt > Date.now()) return cached.html;
        this.emptyParsedHtmlCache.delete(key);
        return undefined;
    }

    private warmParseAroundActiveCue(): void {
        if (!this.shouldParseSubtitles() || !this.cues.length) return;
        const active = this.activeTranscriptIndex();
        const start = Math.max(0, active >= 0 ? active - SUBTITLE_ACTIVE_PREPARSE_BEHIND : 0);
        const end = Math.min(
            this.cues.length,
            active >= 0
                ? active + SUBTITLE_ACTIVE_PREPARSE_AHEAD + 1
                : SUBTITLE_ACTIVE_PREPARSE_AHEAD + 1,
        );
        const serial = ++this.parseWarmupSerial;
        const settings = this.options.getSettings();
        const texts = this.subtitleWarmupTexts(start, end, settings);
        if (!texts.length) return;
        void (async () => {
            try {
                // Allow the provisional tier so upcoming overlay cues render
                // parsed immediately; the provisional path already enqueues the
                // authoritative upgrade, and the shared pending maps dedupe this
                // work against transcript-panel hydration.
                await this.parseCueHtmlBatch(texts, settings);
            } catch {
            }
            if (serial !== this.parseWarmupSerial) return;
            if (this.currentCue?.text.trim()) this.render();
        })();
    }

    private subtitleWarmupTexts(start: number, end: number, settings: ReaderSettings): string[] {
        const texts: string[] = [];
        const seen = new Set<string>();
        for (let index = start; index < end; index++) {
            const text = this.cues[index]?.text.trim();
            if (!text) continue;
            const key = this.parseCacheKey(text, settings);
            if (seen.has(key) || this.parsedHtmlCache.has(key) || this.hasFreshEmptyParsedHtml(key)) continue;
            seen.add(key);
            texts.push(text);
        }
        return texts;
    }

    private fitSubtitleTextToVideo(): void {
        if (!this.root || !this.subtitleEl) return;
        const settings = this.options.getSettings();
        const target = subtitleFrameTargetFontSize(this.root, settings);
        let fitted = target;
        this.root.style.setProperty('--subtitle-font-size-target', `${target}px`);
        this.root.style.setProperty('--subtitle-font-size', `${fitted}px`);
        const primary = this.subtitleEl.querySelector<HTMLElement>('.jpdb-subtitle-primary');
        if (!primary) return;
        const minimum = subtitleMinimumFontSize(this.root);
        fitted = this.fitSubtitleFontSize(fitted, minimum);
        this.root.style.setProperty('--subtitle-font-size', `${fitted}px`);
    }

    private fitSubtitleFontSize(fitted: number, minimum: number): number {
        if (!this.root || !this.subtitleEl) return fitted;
        return fittedSubtitleFontSize(this.subtitleEl, fitted, minimum, value => {
            this.root?.style.setProperty('--subtitle-font-size', `${value}px`);
        });
    }

    private applyKaraokeStateToPrimary(cue: SubtitleCue, time: number): void {
        const state = this.primaryKaraokeState(cue);
        if (!state) return;

        const progress = karaokeCharacterProgress(cue, state.words, time);
        let cursor = 0;
        for (const element of state.wordElements) {
            cursor = applyKaraokeClassToWordElement(element, cursor, progress);
        }
    }

    private primaryKaraokeState(cue: SubtitleCue): { words: SubtitleWordTiming[]; wordElements: HTMLElement[] } | null {
        const primary = this.subtitleEl?.querySelector<HTMLElement>('.jpdb-subtitle-primary');
        if (!primary || !cueHasExactWordTimings(cue)) return null;
        const words = cue.words;
        const wordElements = Array.from(primary.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        return words.length && wordElements.length ? { words, wordElements } : null;
    }

    private handleClick(event: MouseEvent): void {
        if ((event.target as HTMLElement).closest?.('.jpdb-reader-word')) return;
        const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
        const action = target?.dataset.action;
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        this.showControlsTemporarily();

        const handler = this.clickHandlers[action];
        if (!handler) return;
        handler(target);
        if (event.detail > 0) target.closest<HTMLButtonElement>('button')?.blur();
        if (action !== 'menu') this.syncControls();
    }

    private handleTranscriptPanelKeydown(event: KeyboardEvent): void {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const target = event.target as HTMLElement;
        if (target.closest('button, input, [data-resize-transcript], .jpdb-reader-word')) return;
        const row = target.closest<HTMLElement>('.jpdb-subtitle-list-row[data-row-index]');
        if (!row) return;
        event.preventDefault();
        event.stopPropagation();
        this.seekToTranscriptRow(this.rowIndexFromTarget(row));
    }

    private rowIndexFromTarget(target: HTMLElement): number {
        return Number(target.closest<HTMLElement>('[data-row-index]')?.dataset.rowIndex);
    }

    private trackIdFromTarget(target: HTMLElement): string | undefined {
        return target.closest<HTMLElement>('[data-track-id]')?.dataset.trackId;
    }

    private transcriptPlacementFromTarget(target: HTMLElement): ReaderSettings['subtitleTranscriptPlacement'] | undefined {
        const placement = target.closest<HTMLElement>('[data-placement]')?.dataset.placement;
        return placement === 'left' || placement === 'right' || placement === 'bottom' ? placement : undefined;
    }

    private changeTranscriptPlacement(target: HTMLElement): void {
        const placement = this.transcriptPlacementFromTarget(target);
        if (!placement) return;
        const settings = this.options.getSettings();
        const compact = shouldUseCompactSubtitleDrawer(Math.max(320, window.innerWidth));
        const effectivePlacement = compact ? 'bottom' : settings.subtitleTranscriptPlacement;
        if (placement === effectivePlacement) {
            // Re-pressing the active placement toggles the panel closed.
            this.closeTranscriptPanel();
            return;
        }
        settings.subtitleTranscriptPlacement = placement;
        if (placement !== 'bottom') this.clampStoredSideWidthForCurrentVideo(placement);
        this.options.onSettingsChange();
        this.renderOpenSubtitlePanel();
        this.videoInset.clear(this.video);
        this.positionTranscriptPanel({ realignAfterInset: true });
        this.syncControls();
    }

    private handlePointerActivity(event: PointerEvent): void {
        if (event.type === 'pointermove') {
            this.pendingPointerActivity = { x: event.clientX, y: event.clientY };
            if (this.pointerActivityFrame !== undefined) return;
            this.pointerActivityFrame = requestAnimationFrame(() => {
                this.pointerActivityFrame = undefined;
                const activity = this.pendingPointerActivity;
                this.pendingPointerActivity = undefined;
                if (activity) this.syncPointerActivity(activity.x, activity.y);
            });
            return;
        }
        this.syncPointerActivity(event.clientX, event.clientY);
    }

    private syncPointerActivity(clientX: number, clientY: number): void {
        if (this.isPointerNearSubtitleSurface(clientX, clientY)) {
            this.showControlsTemporarily();
        } else {
            this.hideControlsImmediately();
        }
    }

    private showControlsTemporarily(): void {
        if (!this.root) return;
        this.root.classList.remove('jpdb-subtitle-controls-idle');
        this.scheduleControlsIdle();
    }

    private hideControlsImmediately(): void {
        this.clearControlsIdleTimer();
        if (!this.root || !this.shouldAutoIdleControls()) return;
        this.root.classList.add('jpdb-subtitle-controls-idle');
    }

    private scheduleControlsIdle(): void {
        this.clearControlsIdleTimer();
        if (!this.shouldAutoIdleControls()) return;
        this.controlsIdleTimer = window.setTimeout(() => {
            this.controlsIdleTimer = undefined;
            this.hideControlsImmediately();
        }, SUBTITLE_CONTROLS_AUTO_IDLE_DELAY_MS);
    }

    private clearControlsIdleTimer(): void {
        this.controlsIdleTimer = clearWindowTimeout(this.controlsIdleTimer);
    }

    private shouldAutoIdleControls(): boolean {
        const settings = this.options.getSettings();
        if (!this.hasAutoIdleMode(settings)) return false;
        if (!this.canIdleSubtitleControls()) return false;
        return !this.video || this.videoIsLargeEnoughForIdleControls();
    }

    private hasAutoIdleMode(settings: ReaderSettings): boolean {
        return Boolean(this.root && settings.subtitleControlsMode === 'auto');
    }

    private canIdleSubtitleControls(): boolean {
        if (this.hasActiveSubtitleUi()) return false;
        return this.hasSubtitleIdleSurface();
    }

    private hasActiveSubtitleUi(): boolean {
        return Boolean(this.root?.matches(':focus-within'));
    }

    private hasSubtitleIdleSurface(): boolean {
        return Boolean(this.video || this.cues.length || this.currentCue?.text);
    }

    private videoIsLargeEnoughForIdleControls(): boolean {
        const rect = this.video?.getBoundingClientRect();
        return Boolean(rect && rect.width > 120 && rect.height > 90);
    }

    private isPointerNearSubtitleSurface(x: number, y: number): boolean {
        if (!this.root) return false;
        if (this.pointInElement(this.root.querySelector('.jpdb-subtitle-rail'), x, y)) return true;
        if (this.pointInOpenTranscriptPanel(x, y)) return true;
        if (!this.video) return true;
        if (this.videoPlayerChromeHidden()) return false;
        return pointInRect(x, y, this.video.getBoundingClientRect());
    }

    private videoPlayerChromeHidden(): boolean {
        // m.youtube.com renders its controls in #player-control-overlay and
        // toggles a fadein class; the desktop ytp-* classes never appear there.
        const mobileOverlay = document.querySelector<HTMLElement>('#player-control-overlay');
        if (mobileOverlay) return !mobileOverlay.classList.contains('fadein');
        const player = this.video?.closest<HTMLElement>('#movie_player, .html5-video-player');
        return Boolean(player?.classList.contains('ytp-autohide')
            || player?.classList.contains('ytp-hide-controls')
            || player?.classList.contains('ytp-player-minimized'));
    }

    private pointInOpenTranscriptPanel(x: number, y: number): boolean {
        return Boolean(this.transcriptPanel
            && !this.transcriptPanel.hidden
            && !this.transcriptPanelClosing
            && this.pointInElement(this.transcriptPanel, x, y));
    }

    private pointInElement(element: Element | null, x: number, y: number): boolean {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    private handleKeydown(event: KeyboardEvent): void {
        const settings = this.options.getSettings();
        if (!settings.subtitlePlayerEnabled) return;
        if (matchesShortcut(event, settings.shortcuts.previousSubtitle)) {
            event.preventDefault();
            this.seekSubtitle(-1);
        } else if (matchesShortcut(event, settings.shortcuts.nextSubtitle)) {
            event.preventDefault();
            this.seekSubtitle(1);
        } else if (matchesShortcut(event, settings.shortcuts.copySubtitle)) {
            event.preventDefault();
            void this.copySubtitle();
        }
    }

    private seekSubtitle(direction: -1 | 1): void {
        if (!this.video) return;
        if (!this.cues.length) {
            this.seekVideoTo(Math.max(0, this.video.currentTime + direction * 5));
            return;
        }

        const time = this.video.currentTime;
        const activeIndex = this.cues.findIndex(cue => time >= cue.start && time <= cue.end);
        const nextFuture = this.cues.findIndex(cue => cue.start > time);
        const baseIndex = activeIndex >= 0 ? activeIndex : Math.max(0, nextFuture);
        const index = Math.max(0, Math.min(this.cues.length - 1, baseIndex + direction));
        this.seekToCue(index);
    }

    private seekToCue(index: number): void {
        const cue = Number.isFinite(index) ? this.cues[index] : undefined;
        if (!cue) return;
        this.seekToCueObject(cue);
    }

    private seekToTranscriptRow(index: number): void {
        const row = Number.isFinite(index) ? this.transcriptRows()[index] : undefined;
        if (!row) return;
        if (row.cueIndex >= 0) {
            const cue = this.cues[row.cueIndex];
            if (cue) this.seekToCueObject(cue, { exact: true });
            return;
        }
        this.seekToCueObject(row.cue, { exact: true });
    }

    private seekToCueObject(cue: SubtitleCue, options: { exact?: boolean } = {}): void {
        const padding = options.exact ? 0 : this.options.getSettings().subtitleSeekPadding;
        this.seekVideoTo(Math.max(0, cue.start + padding));
        this.currentCue = cue;
        this.secondaryCue = this.secondaryCues.find(item => cue.start >= item.start - 0.35 && cue.start <= item.end + 0.35);
        this.render();
        this.syncControls();
        this.renderTranscriptPanel();
    }

    private seekVideoTo(time: number): void {
        const video = this.video;
        if (!video) return;
        const shouldResume = !video.paused && !video.ended;
        video.currentTime = time;
        if (shouldResume) this.resumeVideoAfterSeek(video);
    }

    private resumeVideoAfterSeek(video: HTMLVideoElement): void {
        const requestPlay = () => {
            if (this.video !== video || !video.paused) return;
            void video.play().catch(() => undefined);
        };
        const handleSeeked = () => requestPlay();
        requestPlay();
        video.addEventListener('seeked', handleSeeked, { once: true });
        window.setTimeout(() => {
            video.removeEventListener('seeked', handleSeeked);
            requestPlay();
        }, 160);
    }

    private async copySubtitle(index?: number): Promise<void> {
        const text = this.subtitleCopyText(Number.isInteger(index) ? index as number : undefined);
        if (!text) return;
        await this.writeSubtitleClipboard(text, 'Subtitle clipboard copy failed');
    }

    private subtitleCopyText(rowIndex: number | undefined): string {
        const cue = rowIndex !== undefined ? this.cues[rowIndex] : this.currentCue;
        const secondary = rowIndex !== undefined && cue ? findAlignedCue(this.secondaryCues, cue) : this.secondaryCue;
        return subtitleClipboardText(cue, secondary);
    }

    private async copyTranscriptRow(index: number): Promise<void> {
        const row = Number.isFinite(index) ? this.transcriptRows()[index] : undefined;
        if (!row) return;
        if (row.cueIndex >= 0) {
            await this.copySubtitle(row.cueIndex);
            return;
        }
        const secondary = findAlignedCue(this.secondaryCues, row.cue);
        const text = subtitleClipboardText(row.cue, secondary);
        if (!text) return;
        await this.writeSubtitleClipboard(text, 'Subtitle clipboard copy failed');
    }

    private async writeSubtitleClipboard(text: string, failureMessage: string): Promise<void> {
        await navigator.clipboard?.writeText(text).catch(error => log.warn(failureMessage, error));
    }

    private async autoCopyCurrentCue(): Promise<void> {
        if (!this.options.getSettings().subtitleAutoCopyLine || !this.currentCue?.text.trim()) return;
        const signature = subtitleCueSignature(this.currentCue);
        if (signature === this.lastAutoCopiedCueSignature) return;
        this.lastAutoCopiedCueSignature = signature;
        await navigator.clipboard?.writeText(this.currentCue.text.trim())
            .catch(error => log.warn('Subtitle auto-copy failed', error));
    }

    private openSubtitleFilePicker(kind: 'primary' | 'secondary'): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = SUBTITLE_FILE_ACCEPT;
        input.style.setProperty('display', 'none', 'important');
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            input.remove();
            if (file) void this.loadSubtitleFile(kind, file);
        }, { once: true });
        input.addEventListener('cancel', () => input.remove(), { once: true });
        (document.body || document.documentElement).appendChild(input);
        input.click();
    }

    private async loadSubtitleFile(kind: 'primary' | 'secondary', file: File): Promise<void> {
        if (!file) return;
        const text = await file.text();
        const cues = normalizeSubtitleCues(parseSubtitleText(text), { transcriptEligible: kind === 'primary' });
        const track: SubtitleTrackOption = {
            id: `file-${kind}-${Date.now()}`,
            label: file.name.replace(/\.(srt|vtt|ass|ssa)$/i, ''),
            kind: 'file',
            cues,
        };
        this.tracks.push(track);
        if (kind === 'primary') await this.selectTrack(track.id);
        else await this.selectSecondaryTrack(track.id);
        this.updateFromLoadedCues();
        log.info('Subtitle file loaded', { kind, name: file.name, cues: cues.length });
    }

    private async selectTrack(id: string): Promise<void> {
        const requestId = this.preparePrimaryTrackSelection(id);
        this.revealPrimarySubtitleOverlay();
        const loaded = await this.loadPrimaryTrackSelection(id, requestId);
        if (!loaded) return;
        this.applyPrimaryTrackSelection(loaded);
        this.finishPrimaryTrackSelection(id, loaded.track);
    }

    private preparePrimaryTrackSelection(id: string): number {
        const requestId = this.beginTrackSelection('primary');
        this.selectedTrackId = id;
        this.lastAutoCopiedCueSignature = '';
        if (this.secondaryTrackId === id) this.clearSecondaryTrackSelection();
        this.cues = [];
        this.currentCue = undefined;
        this.pendingDomCaption = undefined;
        return requestId;
    }

    private clearSecondaryTrackSelection(): void {
        this.invalidateTrackSelection('secondary');
        this.secondaryTrackId = '';
        this.secondaryCues = [];
        this.secondaryCue = undefined;
    }

    private revealPrimarySubtitleOverlay(): void {
        const settings = this.options.getSettings();
        if (!settings.subtitleOverlayVisible) {
            settings.subtitleOverlayVisible = true;
            this.options.onSettingsChange();
        }
        this.root?.classList.remove('jpdb-subtitle-hidden');
    }

    private async loadPrimaryTrackSelection(id: string, requestId: number): Promise<LoadedSubtitleTrackSelection | null> {
        return this.loadTrackSelection({ id, requestId, role: 'primary', transcriptEligible: true });
    }

    private markTrackLoading(track: SubtitleTrackOption): void {
        track.loadingState = 'loading';
        this.renderTrackPanel();
    }

    private async loadTrackSelection(request: SubtitleTrackSelectionLoadRequest): Promise<LoadedSubtitleTrackSelection | null> {
        const selected = this.tracks.find(option => option.id === request.id);
        if (!selected) return this.currentTrackSelection(request.role, request.requestId, request.id, undefined, []);
        this.markTrackLoading(selected);
        this.setNativeTrackModes();
        const loaded = await loadSubtitleTrackCues(selected, {
            ...TRACK_LOAD_OPTIONS,
            tracks: this.tracks,
            transcriptEligible: request.transcriptEligible,
        });
        return this.loadedTrackSelection(request, loaded.track, loaded.cues);
    }

    private loadedTrackSelection(
        request: SubtitleTrackSelectionLoadRequest,
        selected: SubtitleTrackOption,
        cues: SubtitleCue[],
    ): LoadedSubtitleTrackSelection | null {
        if (!this.isTrackSelectionCurrent(request.role, request.requestId, request.id)) return null;
        const trackId = selected.id;
        this.setSelectedTrackId(request.role, trackId);
        return this.currentTrackSelection(request.role, request.requestId, trackId, selected, cues);
    }

    private currentTrackSelection(
        role: SubtitleTrackSelectionRole,
        requestId: number,
        trackId: string,
        track: SubtitleTrackOption | undefined,
        cues: SubtitleCue[],
    ): LoadedSubtitleTrackSelection | null {
        return this.isTrackSelectionCurrent(role, requestId, trackId) ? { track, trackId, cues } : null;
    }

    private setSelectedTrackId(role: SubtitleTrackSelectionRole, trackId: string): void {
        if (role === 'primary') this.selectedTrackId = trackId;
        else this.secondaryTrackId = trackId;
    }

    private applyPrimaryTrackSelection(selection: LoadedSubtitleTrackSelection): void {
        this.cues = selection.cues;
        if (selection.trackId !== this.selectedTrackId) this.selectedTrackId = selection.trackId;
        this.applyYouTubeCaptionFallback(selection.track, selection.trackId);
        if (selection.track) selection.track.loadingState = loadedTrackState(this.cues);
    }

    private applyYouTubeCaptionFallback(track: SubtitleTrackOption | undefined, trackId: string): void {
        if (track?.kind !== 'youtube') {
            this.youtubeDomCaptionFallbackTrackId = '';
            return;
        }
        this.youtubeDomCaptionFallbackTrackId = this.cues.length ? '' : trackId;
        this.lastYouTubeCaptionActivationAt = 0;
        if (!this.cues.length) this.ensureYouTubeDomCaptionFallbackActive(track);
    }

    private finishPrimaryTrackSelection(id: string, selected: SubtitleTrackOption | undefined): void {
        this.finishTrackSelection('Primary', id, selected, this.cues.length);
    }

    private async selectSecondaryTrack(id: string): Promise<void> {
        const requestId = this.prepareSecondaryTrackSelection(id);
        this.revealSecondarySubtitleOverlay();
        const loaded = await this.loadSecondaryTrackSelection(id, requestId);
        if (!loaded) return;
        this.applySecondaryTrackSelection(loaded);
        this.finishSecondaryTrackSelection(id, loaded.track);
    }

    private prepareSecondaryTrackSelection(id: string): number {
        if (this.selectedTrackId === id) {
            this.suppressYouTubeAutoSelectForCurrentVideo();
            this.invalidateTrackSelection('primary');
            this.selectedTrackId = '';
            this.cues = [];
            this.currentCue = undefined;
            this.pendingDomCaption = undefined;
            this.youtubeDomCaptionFallbackTrackId = '';
        }
        const requestId = this.beginTrackSelection('secondary');
        this.secondaryTrackId = id;
        this.secondaryCues = [];
        this.secondaryCue = undefined;
        return requestId;
    }

    private revealSecondarySubtitleOverlay(): void {
        const settings = this.options.getSettings();
        if (!settings.subtitleSecondaryVisible) {
            settings.subtitleSecondaryVisible = true;
            this.options.onSettingsChange();
        }
    }

    private async loadSecondaryTrackSelection(id: string, requestId: number): Promise<LoadedSubtitleTrackSelection | null> {
        return this.loadTrackSelection({ id, requestId, role: 'secondary', transcriptEligible: false });
    }

    private applySecondaryTrackSelection(selection: LoadedSubtitleTrackSelection): void {
        this.secondaryCues = selection.cues;
        if (selection.trackId !== this.secondaryTrackId) this.secondaryTrackId = selection.trackId;
        if (selection.track) selection.track.loadingState = loadedTrackState(this.secondaryCues);
    }

    private finishSecondaryTrackSelection(id: string, selected: SubtitleTrackOption | undefined): void {
        this.finishTrackSelection('Secondary', id, selected, this.secondaryCues.length);
    }

    private finishTrackSelection(role: 'Primary' | 'Secondary', id: string, selected: SubtitleTrackOption | undefined, cues: number): void {
        this.setNativeTrackModes();
        this.updateFromLoadedCues();
        this.warmParseAroundActiveCue();
        this.render();
        this.refreshTranscriptPanelAfterTrackChange();
        this.syncControls();
        log.info(`${role} subtitle track selected`, { id, label: selected?.label ?? '', kind: selected?.kind ?? 'unknown', cues });
    }

    private setNativeTrackModes(): void {
        const settings = this.options.getSettings();
        this.lastYomuCaptionsActive = applySubtitleNativeTrackModes({
            tracks: this.tracks,
            selectedTrackId: this.selectedTrackId,
            secondaryTrackId: this.secondaryTrackId,
            overlayVisible: settings.subtitleOverlayVisible || this.isTranscriptPanelOpen(),
            hasPrimaryCues: Boolean(this.cues.length),
            currentCueText: this.currentCue?.text,
            youtubeDomCaptionFallbackTrackId: this.youtubeDomCaptionFallbackTrackId,
            lastYomuCaptionsActive: this.lastYomuCaptionsActive,
        });
    }

    private async discoverYouTubeTracksThrottled(force = false): Promise<void> {
        if (this.youtubeTrackDiscoveryInFlight) return;
        const now = performance.now();
        const interval = this.tracks.some(track => track.kind === 'youtube') ? 5000 : 1500;
        if (!force && now - this.lastYouTubeTrackDiscoveryAt < interval) return;
        this.lastYouTubeTrackDiscoveryAt = now;
        this.youtubeTrackDiscoveryInFlight = true;
        try {
            await this.discoverYouTubeTracks();
        } finally {
            this.youtubeTrackDiscoveryInFlight = false;
        }
    }

    private async discoverYouTubeTracks(): Promise<void> {
        if (!location.hostname.includes('youtube.com')) return;
        const videoId = getYouTubeVideoId();
        if (!videoId) return;

        this.updateYouTubeDiscoveryVideo(videoId);

        const tracks = await discoverYouTubeCaptionTracks();
        if (!tracks.length) return;

        this.removeYouTubeDomCaptionFallbackTracks();
        const { added, updatedSelectedTrack } = this.mergeYouTubeCaptionTracks(tracks);
        this.finishYouTubeTrackDiscovery(added, updatedSelectedTrack);
    }

    private removeYouTubeDomCaptionFallbackTracks(): void {
        this.removeSubtitleTracks(track => track.sourceKey === YOUTUBE_DOM_CAPTION_FALLBACK_SOURCE_KEY);
    }

    private updateYouTubeDiscoveryVideo(videoId: string): void {
        if (videoId === this.youtubeVideoId) return;
        this.youtubeVideoId = videoId;
        this.clearTransientSubtitleState();
        this.removeSubtitleTracks(track => track.kind === 'youtube');
        this.youtubeDomCaptionFallbackTrackId = '';
        this.youtubeAutoSelectSuppressedVideoId = '';
        this.lastYouTubeTrackDiscoveryAt = 0;
    }

    private mergeYouTubeCaptionTracks(tracks: YouTubeCaptionTrackCandidate[]): { added: number; updatedSelectedTrack: boolean } {
        let added = 0;
        let updatedSelectedTrack = false;
        for (const track of tracks) {
            const existing = this.findExistingYouTubeTrack(track);
            if (existing) {
                updatedSelectedTrack ||= this.updateExistingYouTubeTrack(existing, track);
                continue;
            }
            this.addYouTubeCaptionTrack(track);
            added += 1;
        }
        return { added, updatedSelectedTrack };
    }

    private findExistingYouTubeTrack(track: YouTubeCaptionTrackCandidate): SubtitleTrackOption | undefined {
        const key = youtubeCaptionTrackIdentity(track);
        return this.tracks.find(option => option.kind === 'youtube' && youtubeCaptionTrackIdentity(option) === key);
    }

    private updateExistingYouTubeTrack(existing: SubtitleTrackOption, track: YouTubeCaptionTrackCandidate): boolean {
        let updatedSelectedTrack = false;
        if (shouldRefreshYouTubeTrackUrl(track.url, existing.url)) {
            existing.url = track.url;
            updatedSelectedTrack = existing.id === this.selectedTrackId && !this.cues.length;
        }
        existing.youtubeTrack = track.raw;
        existing.autoGenerated = track.autoGenerated;
        existing.sourceType = track.sourceType;
        existing.sourceLanguage = track.sourceLanguage;
        existing.targetLanguage = track.targetLanguage;
        existing.vssId = track.vssId;
        existing.youtubeIdentity = track.youtubeIdentity;
        return updatedSelectedTrack;
    }

    private addYouTubeCaptionTrack(track: YouTubeCaptionTrackCandidate): void {
        this.tracks.push({
            id: `youtube-${this.tracks.length}`,
            label: track.label,
            kind: 'youtube',
            language: track.language,
            autoGenerated: track.autoGenerated,
            url: track.url,
            youtubeTrack: track.raw,
            sourceType: track.sourceType,
            sourceLanguage: track.sourceLanguage,
            targetLanguage: track.targetLanguage,
            vssId: track.vssId,
            youtubeIdentity: track.youtubeIdentity,
        });
    }

    private finishYouTubeTrackDiscovery(added: number, updatedSelectedTrack: boolean): void {
        const generated = this.ensureTranslatedJapaneseTrack();
        const autoPrimaryTrack = this.findAutoPrimaryYouTubeTrack();
        const autoSecondaryTrack = this.findAutoSecondaryYouTubeTrack(autoPrimaryTrack?.id);
        const primaryTrackId = autoPrimaryTrack?.id || (this.shouldReloadUpdatedSelectedTrack(updatedSelectedTrack) ? this.selectedTrackId : '');
        if (primaryTrackId) {
            void this.selectTrack(primaryTrackId);
            if (autoSecondaryTrack) void this.selectSecondaryTrack(autoSecondaryTrack.id);
            return;
        }
        if (autoSecondaryTrack) {
            void this.selectSecondaryTrack(autoSecondaryTrack.id);
            return;
        }
        if (!added && !generated) return;
        this.renderTrackPanel();
        this.syncControls();
    }

    private ensureTranslatedJapaneseTrack(): boolean {
        const hasJapanese = this.tracks.some(track => isJapaneseSubtitleTrack(track));
        if (hasJapanese) return false;

        const englishTracks = this.tracks.filter(track => isEnglishSubtitleTrack(track)).sort(compareSubtitleTrackOptions);
        if (!englishTracks.length) return false;

        const source = englishTracks[0];
        const existing = this.tracks.find(t => t.translatedFromTrackId === source.id);
        if (existing) return false;

        const settings = this.options.getSettings();
        const synthetic: SubtitleTrackOption = {
            id: `translated-${source.id}`,
            label: `${uiText(settings.interfaceLanguage, 'translation')} (${source.label})`,
            kind: source.kind,
            language: 'ja',
            autoGenerated: true,
            translatedFromTrackId: source.id,
        };
        this.tracks.push(synthetic);
        return true;
    }

    private shouldReloadUpdatedSelectedTrack(updatedSelectedTrack: boolean): boolean {
        return updatedSelectedTrack && Boolean(this.selectedTrackId);
    }

    private findAutoPrimaryYouTubeTrack(): SubtitleTrackOption | undefined {
        // A synthetic translated selection stays replaceable by a real Japanese track.
        if (this.selectedTrackId && !this.isSyntheticTranslatedSelection()) return undefined;
        if (this.youtubeAutoSelectSuppressedVideoId && this.youtubeAutoSelectSuppressedVideoId === this.youtubeVideoId) return undefined;
        const candidate = [...this.tracks]
            .filter(track => track.kind === 'youtube' && isJapaneseSubtitleTrack(track))
            .sort((a, b) => Number(Boolean(a.translatedFromTrackId)) - Number(Boolean(b.translatedFromTrackId))
                || compareSubtitleTrackOptions(a, b))[0];
        return candidate?.id === this.selectedTrackId ? undefined : candidate;
    }

    private findAutoSecondaryYouTubeTrack(primaryTrackId = this.selectedTrackId): SubtitleTrackOption | undefined {
        if (!primaryTrackId || this.secondaryTrackId) return undefined;
        return [...this.tracks]
            .filter(track => track.kind === 'youtube' && track.id !== primaryTrackId && isEnglishSubtitleTrack(track))
            .sort(compareNativeOverlaySubtitleTrackOptions)[0];
    }

    private syncControls(): void {
        const hasLines = this.hasVisibleSubtitleLines();
        this.root?.classList.toggle('jpdb-subtitle-panel-open', this.isTranscriptPanelOpen());
        this.root?.classList.toggle('jpdb-subtitle-has-lines', hasLines);
        this.root?.classList.toggle('jpdb-subtitle-has-track', hasSelectedSubtitleTrackOrLines(this.selectedTrackId, hasLines));
        this.syncTranscriptPlacementClass();
        this.syncLineNavigationButtons(hasLines);
        this.syncDrawerButtons(hasLines);
        this.syncStatus();
        this.setNativeTrackModes();
    }

    private hasVisibleSubtitleLines(): boolean {
        return Boolean(this.cues.length || this.currentCue?.text);
    }

    private syncStatus(): void {
        const status = this.root?.querySelector<HTMLElement>('.jpdb-subtitle-status');
        if (!status) return;
        syncSubtitleTrackStatus(status, this.tracks.length, this.options.getSettings().interfaceLanguage);
    }

    private syncLineNavigationButtons(hasLines: boolean): void {
        const panelOpen = this.isTranscriptPanelDockedOpen();
        const hideRailNavigation = panelOpen || this.options.getSettings().subtitleControlsMode === 'hidden';
        const language = this.options.getSettings().interfaceLanguage;
        for (const action of ['previous', 'next'] as const) {
            const railButton = this.root?.querySelector<HTMLButtonElement>(`.jpdb-subtitle-rail [data-action="${action}"]`);
            if (railButton) syncSubtitleLineNavigationButton(railButton, action, hasLines, Boolean(this.video), hideRailNavigation, language);
            for (const button of this.panelLineNavigationButtons(action)) syncSubtitleLineNavigationButton(button, action, hasLines, Boolean(this.video), false, language);
        }
    }

    private isTranscriptPanelDockedOpen(): boolean {
        return Boolean(this.isTranscriptPanelOpen() && !this.fullscreen);
    }

    private panelLineNavigationButtons(action: 'previous' | 'next'): HTMLButtonElement[] {
        return Array.from(this.transcriptPanel?.querySelectorAll<HTMLButtonElement>(`.jpdb-subtitle-panel-nav [data-action="${action}"]`) ?? []);
    }

    private syncDrawerButtons(hasLines: boolean): void {
        const panelButton = this.root?.querySelector<HTMLButtonElement>('[data-action="panel"]');
        if (!panelButton) return;
        const state = subtitleDrawerButtonState({
            panelOpen: this.isTranscriptPanelOpen(),
            hasLines,
            hasTranscriptSurface: this.hasTranscriptSurface(),
            hasVideo: Boolean(this.video),
            trackCount: this.tracks.length,
        });
        syncSubtitleDrawerButton(panelButton, {
            disabled: state.disabled,
            pressed: state.panelOpen,
            placement: state.panelOpen ? this.effectiveTranscriptPlacement : this.options.getSettings().subtitleTranscriptPlacement,
            language: this.options.getSettings().interfaceLanguage,
        });
    }

    private syncPanelState(): void {
        const hasLines = Boolean(this.cues.length || this.currentCue?.text);
        const panel = this.transcriptPanel;
        if (this.isTranscriptPanelOpen() && panel) {
            panel.classList.toggle('jpdb-subtitle-lines-panel', this.panelMode === 'lines');
            panel.classList.toggle('jpdb-subtitle-tracks-panel', this.panelMode === 'tracks');
        }
        this.syncLineNavigationButtons(hasLines);
    }

    private syncTranscriptPlacementClass(): void {
        if (!this.root) return;
        for (const element of [this.root, this.transcriptPanel].filter((item): item is HTMLElement => Boolean(item))) {
            element.classList.toggle('jpdb-subtitle-transcript-right', this.effectiveTranscriptPlacement === 'right');
            element.classList.toggle('jpdb-subtitle-transcript-left', this.effectiveTranscriptPlacement === 'left');
            element.classList.toggle('jpdb-subtitle-transcript-bottom', this.effectiveTranscriptPlacement === 'bottom');
        }
        this.root.dataset.transcriptPlacement = this.effectiveTranscriptPlacement;
        if (this.transcriptPanel) this.transcriptPanel.dataset.transcriptPlacement = this.effectiveTranscriptPlacement;
        this.syncPanelPlacementButtons();
    }

    private syncPanelPlacementButtons(): void {
        syncTranscriptPlacementButtons(
            this.transcriptPanel ?? null,
            this.effectiveTranscriptPlacement,
            this.options.getSettings().interfaceLanguage,
        );
    }

    private hasTranscriptSurface(): boolean {
        return Boolean(this.cues.length || this.currentCue?.text || this.selectedTrackId);
    }

    private preferredTranscriptDrawerMode(): 'lines' | 'tracks' {
        if (this.panelMode === 'lines' && this.hasTranscriptSurface()) return 'lines';
        if (this.panelMode === 'tracks') return 'tracks';
        return this.hasTranscriptSurface() ? 'lines' : 'tracks';
    }

    private toggleTranscriptDrawer(): void {
        if (!this.transcriptPanel) return;
        if (this.isTranscriptPanelOpen()) {
            this.closeTranscriptPanel();
            return;
        }
        if (this.preferredTranscriptDrawerMode() === 'tracks') this.openTracksPanel();
        else this.openLinesPanel();
    }

    private showTranscriptPanelElement(): void {
        const panel = this.transcriptPanel;
        if (!panel) return;
        this.clearTranscriptPanelAnimation();
        this.transcriptPanelClosing = false;
        panel.hidden = false;
        panel.classList.remove('jpdb-subtitle-panel-closing');
        panel.classList.add('jpdb-subtitle-panel-entering');
        this.transcriptPanelAnimationFrame = requestAnimationFrame(() => this.finishTranscriptPanelEnter(panel));
    }

    private finishTranscriptPanelEnter(panel: HTMLElement): void {
        this.transcriptPanelAnimationFrame = undefined;
        if (!this.shouldFinishTranscriptPanelEnter(panel)) return;
        panel.classList.remove('jpdb-subtitle-panel-entering');
        panel.classList.add('jpdb-subtitle-panel-opened');
    }

    private shouldFinishTranscriptPanelEnter(panel: HTMLElement): boolean {
        return Boolean(this.transcriptPanel && this.transcriptPanel === panel && !panel.hidden && !this.transcriptPanelClosing);
    }

    private hideTranscriptPanelElement(options: { immediate?: boolean } = {}): void {
        const panel = this.transcriptPanel;
        if (!panel) return;
        this.clearTranscriptPanelAnimation();
        this.transcriptPanelClosing = true;
        panel.classList.remove('jpdb-subtitle-panel-entering', 'jpdb-subtitle-panel-opened');
        if (options.immediate || panel.hidden) {
            this.finishTranscriptPanelHide(panel);
            return;
        }
        panel.classList.add('jpdb-subtitle-panel-closing');
        this.transcriptPanelHideTimer = window.setTimeout(() => this.finishTranscriptPanelHide(panel), TRANSCRIPT_PANEL_ANIMATION_MS);
    }

    private finishTranscriptPanelHide(panel: HTMLElement): void {
        if (this.transcriptPanel !== panel) return;
        this.clearTranscriptPanelAnimation();
        panel.hidden = true;
        panel.classList.remove('jpdb-subtitle-panel-entering', 'jpdb-subtitle-panel-opened', 'jpdb-subtitle-panel-closing');
        this.transcriptPanelClosing = false;
        this.syncControls();
    }

    private clearTranscriptPanelAnimation(): void {
        this.transcriptPanelAnimationFrame = clearWindowAnimationFrame(this.transcriptPanelAnimationFrame);
        this.transcriptPanelHideTimer = clearWindowTimeout(this.transcriptPanelHideTimer);
    }

    private openLinesPanel(options: TranscriptPanelOptions = {}): void {
        if (!this.transcriptPanel || !this.hasTranscriptSurface()) return;
        const persist = options.persist ?? true;
        if (!options.autoPause) this.pausePanelDismissed = false;
        this.pausePanelOpen = this.shouldAutoHideOpenPanel(options);
        this.panelMode = 'lines';
        this.showTranscriptPanelElement();
        if (persist) {
            this.options.getSettings().subtitleTranscriptVisible = true;
            this.options.onSettingsChange();
        }
        this.renderTranscriptPanel(true);
        this.positionTranscriptPanel({ realignAfterInset: true });
        this.syncControls();
    }

    private toggleNativeSubtitleBlur(): void {
        const settings = this.options.getSettings();
        settings.subtitleNativeBlurred = !settings.subtitleNativeBlurred;
        this.options.onSettingsChange();
        this.render();
        log.info('Native subtitle blur toggled', { blurred: settings.subtitleNativeBlurred });
    }

    private togglePausePanelMode(): void {
        const settings = this.options.getSettings();
        settings.subtitlePausePanel = !settings.subtitlePausePanel;
        if (settings.subtitlePausePanel) {
            settings.subtitleTranscriptVisible = false;
            if (this.video && this.video.paused && !this.video.ended && this.hasTranscriptSurface()) {
                this.openLinesPanel({ persist: false, autoPause: true });
            } else if (this.isTranscriptPanelOpen()) {
                this.closeTranscriptPanel({ persist: false, autoPause: true });
            }
        } else {
            this.pausePanelOpen = false;
        }
        this.options.onSettingsChange();
        this.renderOpenSubtitlePanel();
        this.syncControls();
    }

    private refreshTranscriptPanelAfterTrackChange(): void {
        if (this.shouldRestoreTranscriptPanel()) {
            this.openLinesPanel();
            return;
        }
        if (!this.isTranscriptPanelOpen()) return;
        if (this.panelMode === 'lines') {
            if (this.hasTranscriptSurface()) this.renderTranscriptPanel(true);
            else this.closeTranscriptPanel();
            return;
        }
        this.renderTrackPanel();
        this.positionTranscriptPanel({ realignAfterInset: true });
        this.syncPanelState();
    }

    private shouldRestoreTranscriptPanel(): boolean {
        return this.options.getSettings().subtitleTranscriptVisible && this.hasTranscriptSurface();
    }

    private isTranscriptPanelOpen(): boolean {
        return Boolean(this.transcriptPanel && !this.transcriptPanel.hidden && !this.transcriptPanelClosing);
    }

    private openTracksPanel(options: TranscriptPanelOptions = {}): void {
        if (!this.transcriptPanel) return;
        const persist = options.persist ?? true;
        if (!options.autoPause) this.pausePanelDismissed = false;
        this.pausePanelOpen = this.shouldAutoHideOpenPanel(options);
        this.panelMode = 'tracks';
        this.showTranscriptPanelElement();
        if (persist) {
            this.options.getSettings().subtitleTranscriptVisible = false;
            this.options.onSettingsChange();
        }
        this.renderTrackPanel();
        this.positionTranscriptPanel({ realignAfterInset: true });
        this.syncPanelState();
    }

    private shouldAutoHideOpenPanel(options: TranscriptPanelOptions): boolean {
        if (options.autoPause) return true;
        const settings = this.options.getSettings();
        return Boolean(settings.subtitlePausePanel && this.video && this.video.paused && !this.video.ended);
    }

    private closeTranscriptPanel(options: TranscriptPanelOptions = {}): void {
        if (!this.transcriptPanel) return;
        const persist = options.persist ?? true;
        if (!options.autoPause) {
            this.pausePanelOpen = false;
            // An explicit close while paused must stick: otherwise the "open panel
            // when paused" feature reopens it on the next tick and the toggle can
            // never close it. Re-arm on the next play (see the play listener).
            if (this.options.getSettings().subtitlePausePanel) this.pausePanelDismissed = true;
        }
        this.hideTranscriptPanelElement();
        if (persist) {
            this.options.getSettings().subtitleTranscriptVisible = false;
            this.options.onSettingsChange();
        }
        this.clearVideoInsetForTranscriptPanel();
        this.syncControls();
    }

    private schedulePauseTranscriptPanelSync(): void {
        // Opening the pause panel rebuilds the transcript DOM and triggers
        // layout work; doing that synchronously inside the pause event makes
        // pausing feel sluggish. Defer past the next paint so the player's
        // pause feedback renders first (rAF runs before paint; the nested
        // timeout lands after it).
        if (this.pausePanelSyncScheduled) return;
        this.pausePanelSyncScheduled = true;
        requestAnimationFrame(() => window.setTimeout(() => {
            this.pausePanelSyncScheduled = false;
            if (this.destroyed) return;
            this.syncPauseTranscriptPanel();
        }, 0));
    }

    private syncPauseTranscriptPanel(): void {
        const settings = this.options.getSettings();
        if (!settings.subtitlePausePanel || !this.video || !this.video.paused || this.video.ended || !this.hasTranscriptSurface()) {
            this.closePauseTranscriptPanel();
            return;
        }
        if (this.pausePanelDismissed || this.isTranscriptPanelOpen()) return;
        this.openLinesPanel({ persist: false, autoPause: true });
    }

    private closePauseTranscriptPanel(): void {
        if (!this.pausePanelOpen) return;
        this.pausePanelOpen = false;
        this.closeTranscriptPanel({ persist: false, autoPause: true });
    }

    private openSubtitleTracksPanelFromHost(): void {
        this.openTracksPanel({ persist: false });
        this.showControlsTemporarily();
        this.syncControls();
    }

    private renderTranscriptPanel(force = false): void {
        const panel = this.renderableTranscriptPanel();
        if (!panel) return;
        const state = this.transcriptPanelRenderState();
        if (this.canRefreshTranscriptPanel(force, state)) return;
        this.lastTranscriptSignature = state.signature;
        setInnerHtml(panel, this.renderTranscriptPanelHtml(state));
        this.afterTranscriptPanelRender(state);
    }

    private renderableTranscriptPanel(): HTMLElement | null {
        if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing) return null;
        return this.panelMode === 'lines' ? this.transcriptPanel : null;
    }

    private canRefreshTranscriptPanel(force: boolean, state: TranscriptPanelRenderState): boolean {
        if (force) return false;
        return this.refreshExistingTranscriptPanel(state);
    }

    private transcriptPanelRenderState(): TranscriptPanelRenderState {
        const rows = this.transcriptRows();
        const currentCueIndex = this.activeTranscriptIndex();
        const currentRowIndex = this.activeTranscriptRowIndex(rows, currentCueIndex);
        const settings = this.options.getSettings();
        const signature = [
            rows.length,
            this.selectedTrackId,
            this.tracks.find(track => track.id === this.selectedTrackId)?.loadingState ?? '',
            !this.cues.length && this.currentCue ? subtitleCueSignature(this.currentCue) : '',
            this.parseCacheKey('', settings),
        ].join(':');
        return { rows, currentRowIndex, signature };
    }

    private refreshExistingTranscriptPanel(state: TranscriptPanelRenderState): boolean {
        if (this.lastTranscriptSignature !== state.signature) return false;
        this.updateTranscriptActiveLine(state.currentRowIndex);
        this.scheduleTranscriptHydration(state.currentRowIndex);
        this.scheduleTranscriptCacheWarmup(state.rows, state.currentRowIndex);
        return true;
    }

    private renderTranscriptPanelHtml(state: TranscriptPanelRenderState): string {
        const settings = this.options.getSettings();
        const language = settings.interfaceLanguage;
        return `
            <div class="jpdb-subtitle-drawer-head">
                <div class="jpdb-subtitle-drawer-brand">
                    <strong class="jpdb-subtitle-drawer-title">${escapeHtml(uiText(language, 'subtitlesTitle'))}</strong>
                    <span class="jpdb-subtitle-drawer-meta">${escapeHtml(subtitleDrawerMetaText({
                        mode: 'lines',
                        count: state.rows.length,
                        tracks: this.tracks,
                        selectedTrackId: this.selectedTrackId,
                        secondaryTrackId: this.secondaryTrackId,
                        language,
                    }))}</span>
                </div>
                <div class="jpdb-subtitle-drawer-actions">
                    ${renderPanelModeControls('lines', this.hasTranscriptSurface(), language)}
                    ${renderPanelNavigationControls(Boolean(this.video && state.rows.length), language)}
                    ${renderPanelPlacementControls(this.effectiveTranscriptPlacement, language)}
                    ${renderPausePanelToggle(settings.subtitlePausePanel, language)}
                </div>
            </div>
            <div class="jpdb-subtitle-list-scroll">
                ${state.rows.length
                    ? state.rows.map((row, index) => this.renderTranscriptRow(row, index, state.currentRowIndex)).join('')
                    : this.renderTranscriptWaitingState()}
            </div>
            <div class="jpdb-subtitle-resize" data-resize-transcript role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${escapeHtml(uiText(language, 'resizeTranscriptPanel'))}"></div>
        `;
    }

    private afterTranscriptPanelRender(state: TranscriptPanelRenderState): void {
        this.indexTranscriptTextTargets();
        this.bindTranscriptScroller();
        this.bindTranscriptResizeHandle();
        this.positionTranscriptPanel();
        this.scrollTranscriptToActive();
        this.scheduleTranscriptHydration(state.currentRowIndex);
        this.scheduleTranscriptCacheWarmup(state.rows, state.currentRowIndex);
        this.syncPanelState();
    }

    private renderTranscriptRow(row: TranscriptRow, index: number, currentIndex: number): string {
        const cue = row.cue;
        const settings = this.options.getSettings();
        const parsedKey = this.parseCacheKey(cue.text, settings);
        const parsed = this.parsedHtmlCache.get(parsedKey) ?? this.provisionalParsedHtmlCache.get(parsedKey);
        const parsedKeyAttribute = parsed ? ` data-parsed-key="${escapeHtml(parsedKey)}"` : '';
        const provisionalAttribute = parsed && !this.parsedHtmlCache.has(parsedKey) ? ' data-parsed-provisional="true"' : '';
        const seekLabel = `${uiText(settings.interfaceLanguage, 'seekSubtitleLine')} ${formatSubtitleTime(cue.start)}`;
        return `
            <div class="jpdb-subtitle-list-row ${index === currentIndex ? 'active' : ''}" data-action="cue" data-row-index="${index}" data-cue-index="${row.cueIndex}" role="button" tabindex="0" aria-label="${escapeHtml(seekLabel)}">
                <div class="jpdb-subtitle-row-body">
                    <strong class="jpdb-subtitle-row-text" lang="ja" data-transcript-text data-row-index="${index}" data-parse-key="${escapeHtml(parsedKey)}"${parsedKeyAttribute}${provisionalAttribute}>${parsed ?? escapeWithBreaks(cue.text)}</strong>
                </div>
                <div class="jpdb-subtitle-row-tools">
                    <button class="jpdb-subtitle-row-copy" type="button" data-action="copy-row" data-row-index="${index}" title="${escapeHtml(uiText(settings.interfaceLanguage, 'copySubtitleLine'))}" aria-label="${escapeHtml(uiText(settings.interfaceLanguage, 'copySubtitleLine'))}">${subtitleIcon('copy')}</button>
                    <span class="jpdb-subtitle-row-time">${formatSubtitleTime(cue.start)}</span>
                </div>
            </div>
        `;
    }

    private transcriptRows(): TranscriptRow[] {
        if (this.cues.length) {
            return this.cues
                .map((cue, cueIndex) => ({ cue, cueIndex }))
                .filter(row => row.cue.transcriptEligible !== false);
        }
        return this.currentCue && this.currentCue.transcriptEligible !== false
            ? [{ cue: this.currentCue, cueIndex: -1 }]
            : [];
    }

    private renderTranscriptWaitingState(): string {
        const selected = this.tracks.find(track => track.id === this.selectedTrackId);
        const language = this.options.getSettings().interfaceLanguage;
        const label = selected?.label ? `: ${escapeHtml(selected.label)}` : '';
        const status = selected?.loadingState === 'loading' ? uiText(language, 'loadingSubtitleLines') : uiText(language, 'waitingForCaptionLines');
        return `<div class="jpdb-subtitle-list-empty">${escapeHtml(status)}${label}. ${escapeHtml(uiText(language, 'subtitleCurrentLineWillAppear'))}</div>`;
    }

    private updateTranscriptActiveLine(currentIndex: number): void {
        if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing || this.panelMode !== 'lines') return;
        this.transcriptPanel.querySelectorAll<HTMLElement>('.jpdb-subtitle-list-row.active')
            .forEach(row => row.classList.remove('active'));
        const active = this.transcriptPanel.querySelector<HTMLElement>(`.jpdb-subtitle-list-row[data-row-index="${currentIndex}"]`);
        if (active) active.classList.add('active');
        this.scrollTranscriptToActive();
    }

    private scrollTranscriptToActive(): void {
        if (!this.options.getSettings().subtitleTranscriptAutoScroll || !this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing) return;
        if (this.transcriptScrollFrame) cancelAnimationFrame(this.transcriptScrollFrame);
        this.transcriptScrollFrame = requestAnimationFrame(() => {
            this.transcriptScrollFrame = undefined;
            if (this.destroyed) return;
            const active = this.transcriptPanel?.querySelector<HTMLElement>('.jpdb-subtitle-list-row.active');
            active?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
        });
    }

    private bindTranscriptScroller(): void {
        const scroller = this.transcriptPanel?.querySelector<HTMLElement>('.jpdb-subtitle-list-scroll');
        if (!scroller || scroller.dataset.transcriptHydrationBound === 'true') return;
        scroller.dataset.transcriptHydrationBound = 'true';
        scroller.addEventListener('scroll', () => this.scheduleTranscriptHydration(), { passive: true });
    }

    private bindTranscriptResizeHandle(): void {
        const handle = this.transcriptPanel?.querySelector<HTMLElement>('[data-resize-transcript]');
        if (!handle || handle.dataset.transcriptResizeBound === 'true') return;
        handle.dataset.transcriptResizeBound = 'true';
        handle.addEventListener('pointerdown', event => this.startTranscriptResize(event));
        handle.addEventListener('keydown', event => this.resizeTranscriptPanelFromKeyboard(event));
        this.syncTranscriptResizeHandle();
    }

    private startTranscriptResize(event: PointerEvent): void {
        if (!this.transcriptPanel) return;
        event.preventDefault();
        event.stopPropagation();
        const placement = this.effectiveTranscriptPlacement;
        const panelRect = this.transcriptPanel.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const startWidth = panelRect.width;
        const startHeight = panelRect.height;
        (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);

        const onMove = (moveEvent: PointerEvent) => {
            Object.assign(this.transcriptPanelSize, transcriptResizePatchForPointerDrag({
                bounds: transcriptResizeBounds(window.innerWidth, window.innerHeight),
                currentX: moveEvent.clientX,
                currentY: moveEvent.clientY,
                placement,
                startHeight,
                startWidth,
                startX,
                startY,
            }));
            this.positionTranscriptPanel({ skipInset: true });
        };

        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            saveTranscriptPanelSize(this.transcriptPanelSize);
            this.positionTranscriptPanel({ realignAfterInset: true });
        };

        window.addEventListener('pointermove', onMove, this.eventOptions());
        window.addEventListener('pointerup', onUp, this.eventOptions({ once: true }));
    }

    private resizeTranscriptPanelFromKeyboard(event: KeyboardEvent): void {
        const panel = this.transcriptPanel;
        if (!panel) return;
        const placement = this.effectiveTranscriptPlacement;
        const direction = transcriptResizeKeyboardDirection(placement, event.key);
        if (!direction) return;
        event.preventDefault();
        event.stopPropagation();

        Object.assign(this.transcriptPanelSize, transcriptResizePatchForKeyboard({
            bounds: transcriptResizeBounds(window.innerWidth, window.innerHeight),
            direction,
            panelRect: panel.getBoundingClientRect(),
            placement,
        }));
        saveTranscriptPanelSize(this.transcriptPanelSize);
        this.positionTranscriptPanel();
    }

    private syncTranscriptResizeHandle(layout?: TranscriptPanelLayout): void {
        const handle = this.transcriptPanel?.querySelector<HTMLElement>('[data-resize-transcript]');
        if (!handle) return;
        const metrics = transcriptResizeHandleMetrics({
            bounds: transcriptResizeBounds(window.innerWidth, window.innerHeight),
            layout,
            panelRect: this.transcriptPanel?.getBoundingClientRect(),
            placement: this.effectiveTranscriptPlacement,
        });
        handle.setAttribute('role', 'separator');
        handle.setAttribute('tabindex', '0');
        handle.setAttribute('aria-orientation', metrics.orientation);
        handle.setAttribute('aria-valuemin', String(metrics.min));
        handle.setAttribute('aria-valuemax', String(metrics.max));
        handle.setAttribute('aria-valuenow', String(Math.round(metrics.current)));
    }

    private scheduleTranscriptHydration(preferredIndex = this.activeTranscriptRowIndex()): void {
        if (this.transcriptHydrateFrame) return;
        this.transcriptHydrateFrame = requestAnimationFrame(() => {
            this.transcriptHydrateFrame = undefined;
            if (this.destroyed) return;
            void this.hydrateTranscriptRows(preferredIndex);
        });
    }

    private activeTranscriptIndex(): number {
        if (!this.currentCue) return -1;
        const exact = this.cues.findIndex(cue => cue === this.currentCue);
        if (exact >= 0) return exact;
        return this.cues.findIndex(cue =>
            Math.abs(cue.start - this.currentCue!.start) < 0.05
            && Math.abs(cue.end - this.currentCue!.end) < 0.05
            && cue.text.trim() === this.currentCue!.text.trim());
    }

    private activeTranscriptRowIndex(rows = this.transcriptRows(), activeCueIndex = this.activeTranscriptIndex()): number {
        if (!rows.length) return -1;
        const exact = this.currentTranscriptRowIndex(rows);
        if (exact >= 0) return exact;
        if (activeCueIndex >= 0) return rows.findIndex(row => row.cueIndex === activeCueIndex);
        return this.cues.length ? -1 : 0;
    }

    private currentTranscriptRowIndex(rows: TranscriptRow[]): number {
        return this.currentCue ? rows.findIndex(row => row.cue === this.currentCue) : -1;
    }

    private async hydrateTranscriptRows(preferredIndex: number): Promise<void> {
        const request = this.transcriptHydrationRequest();
        if (!request) return;
        const serial = ++this.transcriptHydrationSerial;
        const indexes = this.transcriptHydrationIndexes(preferredIndex, request.rows.length);
        const targets: TranscriptRowHydrationTarget[] = [];
        for (const index of indexes) {
            if (serial !== this.transcriptHydrationSerial) return;
            const hydration = this.transcriptRowHydrationTarget(index, request.settings, request.rows);
            if (!hydration) continue;
            const cached = this.parsedHtmlCache.get(hydration.key);
            if (cached) this.applyCachedTranscriptRowHtml(hydration, cached);
            else targets.push(hydration);
        }
        if (targets.length) await this.hydrateTranscriptRowTargets(targets, request.settings, serial);
    }

    private transcriptHydrationRequest(): { settings: ReaderSettings; rows: TranscriptRow[] } | null {
        if (!this.canHydrateTranscriptRows()) return null;
        const settings = this.options.getSettings();
        if (!canParseSubtitleTranscriptRows(settings)) return null;
        const rows = this.transcriptRows();
        return rows.length ? { settings, rows } : null;
    }

    private canHydrateTranscriptRows(): boolean {
        return Boolean(this.transcriptPanel && !this.transcriptPanel.hidden && !this.transcriptPanelClosing && this.panelMode === 'lines');
    }

    private transcriptHydrationIndexes(preferredIndex: number, rowCount: number): number[] {
        const scroller = this.transcriptPanel?.querySelector<HTMLElement>('.jpdb-subtitle-list-scroll');
        const plan = planTranscriptHydrationIndexes({
            preferredIndex,
            rowCount,
            scroller,
            cursor: this.transcriptHydrationCursor,
            activeBehind: TRANSCRIPT_ACTIVE_HYDRATION_BEHIND,
            activeAhead: TRANSCRIPT_ACTIVE_HYDRATION_AHEAD,
            maxRows: TRANSCRIPT_HYDRATION_MAX_ROWS,
            backgroundBatch: TRANSCRIPT_BACKGROUND_HYDRATION_BATCH,
        });
        this.transcriptHydrationCursor = plan.nextCursor;
        return plan.indexes;
    }

    private async hydrateTranscriptRowTargets(targets: TranscriptRowHydrationTarget[], settings: ReaderSettings, serial: number): Promise<void> {
        try {
            const parsed = await this.parseCueHtmlBatch(targets.map(target => target.cue.text), settings);
            if (serial !== this.transcriptHydrationSerial) return;
            for (const item of parsed) this.updateTranscriptRowsForParseKey(item.key, item.html, { provisional: item.provisional === true });
        } catch {
            targets.forEach(hydration => {
                hydration.target.dataset.parseFailedKey = hydration.key;
                hydration.target.dataset.parseFailedAt = String(Date.now());
                delete hydration.target.dataset.parsedKey;
            });
        }
    }

    private transcriptRowHydrationTarget(index: number, settings: ReaderSettings, rows: TranscriptRow[]): TranscriptRowHydrationTarget | null {
        const cue = rows[index]?.cue;
        const target = this.transcriptPanel?.querySelector<HTMLElement>(`.jpdb-subtitle-row-text[data-row-index="${index}"]`);
        if (!cue || !target) return null;
        const key = this.parseCacheKey(cue.text, settings);
        return hasAttemptedTranscriptParse(target, key) ? null : { cue, target, key };
    }

    private applyCachedTranscriptRowHtml(hydration: TranscriptRowHydrationTarget, html: string): void {
        hydration.target.dataset.parsedKey = hydration.key;
        delete hydration.target.dataset.parsedProvisional;
        delete hydration.target.dataset.parseEmptyKey;
        delete hydration.target.dataset.parseEmptyAt;
        delete hydration.target.dataset.parseFailedKey;
        delete hydration.target.dataset.parseFailedAt;
        setInnerHtml(hydration.target, html);
    }

    private scheduleTranscriptCacheWarmup(rows = this.transcriptRows(), preferredIndex = this.activeTranscriptRowIndex(rows)): void {
        const settings = this.options.getSettings();
        if (!this.shouldParseSubtitles(settings) || !rows.length) return;
        const signature = this.transcriptCacheWarmupKey(rows, settings, preferredIndex);
        if (signature === this.transcriptCacheWarmupSignature) return;
        this.transcriptCacheWarmupSignature = signature;
        const serial = ++this.transcriptCacheWarmupSerial;
        void this.warmTranscriptParseCache(rows, preferredIndex, settings, serial);
    }

    private transcriptCacheWarmupKey(rows: TranscriptRow[], settings: ReaderSettings, preferredIndex: number): string {
        const first = rows[0]?.cue;
        const last = rows.at(-1)?.cue;
        return [
            this.selectedTrackId,
            rows.length,
            preferredIndex >= 0 ? Math.floor(preferredIndex / TRANSCRIPT_WARMUP_SIGNATURE_BUCKET_SIZE) : 'start',
            first ? subtitleCueSignature(first) : '',
            last ? subtitleCueSignature(last) : '',
            this.parseCacheKey('', settings),
        ].join('|');
    }

    private async warmTranscriptParseCache(rows: TranscriptRow[], preferredIndex: number, settings: ReaderSettings, serial: number): Promise<void> {
        const planned = this.transcriptWarmupPlan(rows, preferredIndex, settings);
        if (!planned.length) return;

        let cursor = 0;
        const pauseMs = this.transcriptBackgroundParsePauseMs();
        const worker = async () => {
            while (cursor < planned.length) {
                if (serial !== this.transcriptCacheWarmupSerial) return;
                const batch = this.nextTranscriptWarmupBatch(planned, () => cursor++);
                if (!batch.length) continue;
                try {
                    const parsed = await this.parseCueHtmlBatch(batch.map(item => item.text), settings, { allowProvisional: false });
                    if (serial !== this.transcriptCacheWarmupSerial) return;
                    for (const item of parsed) this.updateTranscriptRowsForParseKey(item.key, item.html, { provisional: item.provisional === true });
                } catch {
                }
                // The plan is priority-ordered (visible + lookahead first):
                // never pace the head of the queue, only the background tail.
                if (cursor < planned.length && cursor > TRANSCRIPT_WARMUP_PRIORITY_ROWS) {
                    await waitForBackgroundTranscriptParseTurn(pauseMs);
                }
            }
        };

        const workers = Array.from(
            { length: Math.min(TRANSCRIPT_BACKGROUND_PARSE_CONCURRENCY, planned.length) },
            () => worker(),
        );
        await Promise.all(workers);
    }

    private nextTranscriptWarmupBatch(
        planned: Array<{ rowIndex: number; text: string; key: string }>,
        takeNextIndex: () => number,
    ): Array<{ rowIndex: number; text: string; key: string }> {
        const batchSize = this.options.parseJapaneseBatch ? TRANSCRIPT_BACKGROUND_PARSE_BATCH : 1;
        const batch: Array<{ rowIndex: number; text: string; key: string }> = [];
        while (batch.length < batchSize) {
            const item = planned[takeNextIndex()];
            if (!item) break;
            if (this.parsedHtmlCache.has(item.key) || this.hasFreshEmptyParsedHtml(item.key)) continue;
            batch.push(item);
        }
        return batch;
    }

    private transcriptWarmupPlan(rows: TranscriptRow[], preferredIndex: number, settings: ReaderSettings): Array<{ rowIndex: number; text: string; key: string }> {
        const priority = this.transcriptHydrationIndexes(preferredIndex, rows.length);
        const focusIndex = preferredIndex >= 0 ? preferredIndex : 0;
        const orderedIndexes = transcriptWarmupIndexes(priority, focusIndex, rows.length);
        const seen = new Set<string>();
        const plan: Array<{ rowIndex: number; text: string; key: string }> = [];
        for (const rowIndex of orderedIndexes) {
            this.addTranscriptWarmupPlanItem(plan, seen, rows, rowIndex, settings);
            if (plan.length >= TRANSCRIPT_BACKGROUND_PARSE_LIMIT) break;
        }
        return plan;
    }

    private addTranscriptWarmupPlanItem(
        plan: Array<{ rowIndex: number; text: string; key: string }>,
        seen: Set<string>,
        rows: TranscriptRow[],
        rowIndex: number,
        settings: ReaderSettings,
    ): void {
        const text = rows[rowIndex]?.cue.text.trim();
        if (!text) return;
        const key = this.parseCacheKey(text, settings);
        if (seen.has(key) || this.parsedHtmlCache.has(key)) return;
        seen.add(key);
        plan.push({ rowIndex, text, key });
    }

    private transcriptBackgroundParsePauseMs(): number {
        return isYouTubePage() ? YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_PAUSE_MS : 0;
    }

    private updateTranscriptRowsForParseKey(key: string, html: string, options: { provisional?: boolean } = {}): void {
        const panel = this.updatableTranscriptPanel();
        if (!panel) return;
        const hasReaderWords = parsedSubtitleHtmlHasReaderWords(html);
        const updatedRoots: HTMLElement[] = [];
        for (const target of this.transcriptTextTargetsForParseKey(panel, key)) {
            if (!shouldApplyParsedTranscriptHtml(target, key, options.provisional === true)) continue;
            if (hasReaderWords) {
                target.dataset.parsedKey = key;
                if (options.provisional) target.dataset.parsedProvisional = 'true';
                else delete target.dataset.parsedProvisional;
                delete target.dataset.parseEmptyKey;
                delete target.dataset.parseEmptyAt;
                delete target.dataset.parseFailedKey;
                delete target.dataset.parseFailedAt;
                setInnerHtml(target, html);
                updatedRoots.push(target);
            } else {
                target.dataset.parseEmptyKey = key;
                target.dataset.parseEmptyAt = String(Date.now());
                delete target.dataset.parsedKey;
                delete target.dataset.parsedProvisional;
                delete target.dataset.parseFailedKey;
                delete target.dataset.parseFailedAt;
            }
        }
        if (updatedRoots.length) this.notifyParsedTokensForKey(key, true, updatedRoots);
    }

    private indexTranscriptTextTargets(panel = this.updatableTranscriptPanel()): void {
        this.transcriptTextTargetsByParseKey.clear();
        if (!panel) return;
        for (const target of Array.from(panel.querySelectorAll<HTMLElement>('[data-transcript-text][data-parse-key]'))) {
            const key = target.dataset.parseKey;
            if (!key) continue;
            const targets = this.transcriptTextTargetsByParseKey.get(key);
            if (targets) targets.push(target);
            else this.transcriptTextTargetsByParseKey.set(key, [target]);
        }
    }

    private transcriptTextTargetsForParseKey(panel: HTMLElement, key: string): HTMLElement[] {
        if (!this.transcriptTextTargetsByParseKey.size) this.indexTranscriptTextTargets(panel);
        const targets = this.transcriptTextTargetsByParseKey.get(key) ?? [];
        return targets.filter(target => target.isConnected && panel.contains(target));
    }

    private updatableTranscriptPanel(): HTMLElement | null {
        if (!this.transcriptPanel) return null;
        if (this.transcriptPanel.hidden || this.transcriptPanelClosing) return null;
        if (this.panelMode !== 'lines') return null;
        return this.transcriptPanel;
    }

    private renderTrackPanel(): void {
        if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing || this.panelMode !== 'tracks') return;
        this.transcriptTextTargetsByParseKey.clear();
        const state = subtitleTrackPanelState(this.tracks);
        const settings = this.options.getSettings();
        setInnerHtml(this.transcriptPanel, renderSubtitleTrackPanel({
            ...state,
            selectedTrackId: this.selectedTrackId,
            secondaryTrackId: this.secondaryTrackId,
            hasTranscriptSurface: this.hasTranscriptSurface(),
            hasNavigableLines: Boolean(this.video && this.cues.length),
            pausePanelEnabled: settings.subtitlePausePanel,
            placement: this.effectiveTranscriptPlacement,
            language: settings.interfaceLanguage,
        }));
        this.bindTranscriptResizeHandle();
        this.syncPanelState();
    }

    private beginTrackSelection(role: 'primary' | 'secondary'): number {
        if (role === 'primary') {
            this.primarySelectionRequest += 1;
            return this.primarySelectionRequest;
        }
        this.secondarySelectionRequest += 1;
        return this.secondarySelectionRequest;
    }

    private invalidateTrackSelection(role: 'primary' | 'secondary'): void {
        this.beginTrackSelection(role);
    }

    private isTrackSelectionCurrent(role: 'primary' | 'secondary', requestId: number, trackId: string): boolean {
        return role === 'primary'
            ? this.primarySelectionRequest === requestId && this.selectedTrackId === trackId
            : this.secondarySelectionRequest === requestId && this.secondaryTrackId === trackId;
    }

    private resetPrimarySubtitleState(): void {
        this.invalidateTrackSelection('primary');
        this.selectedTrackId = '';
        this.cues = [];
        this.currentCue = undefined;
        this.lastDomCaption = '';
        this.pendingDomCaption = undefined;
        this.youtubeDomCaptionFallbackTrackId = '';
        this.lastAutoCopiedCueSignature = '';
        this.lastRenderedPrimaryText = '';
        this.lastRenderedPrimaryHtml = '';
        this.renderSerial += 1;
        this.parseWarmupSerial += 1;
    }

    private resetSecondarySubtitleState(): void {
        this.invalidateTrackSelection('secondary');
        this.secondaryTrackId = '';
        this.secondaryCues = [];
        this.secondaryCue = undefined;
    }

    private async choosePrimaryTrack(id?: string): Promise<void> {
        if (!id) return;
        if (id === this.selectedTrackId) {
            this.clearPrimaryTrack();
            return;
        }
        this.youtubeAutoSelectSuppressedVideoId = '';
        await this.discoverYouTubeTracksThrottled(true);
        await this.selectTrack(id);
    }

    private async chooseSecondaryTrack(id?: string): Promise<void> {
        if (!id) return;
        if (id === this.secondaryTrackId) {
            this.clearSecondaryTrack();
            return;
        }
        await this.discoverYouTubeTracksThrottled(true);
        await this.selectSecondaryTrack(id);
    }

    private clearPrimaryTrack(): void {
        this.suppressYouTubeAutoSelectForCurrentVideo();
        this.resetPrimarySubtitleState();
        this.clearPrimaryTrackLoadingStates();
        this.setNativeTrackModes();
        this.render();
        this.refreshOpenTranscriptPanelAfterPrimaryClear();
        this.syncControls();
        log.info('Primary subtitle track cleared');
    }

    private clearPrimaryTrackLoadingStates(): void {
        for (const track of this.tracks) {
            if (track.loadingState && track.id !== this.secondaryTrackId) track.loadingState = 'idle';
        }
    }

    private refreshOpenTranscriptPanelAfterPrimaryClear(): void {
        if (!this.isTranscriptPanelOpen()) return;
        this.panelMode = 'tracks';
        this.renderTrackPanel();
    }

    private suppressYouTubeAutoSelectForCurrentVideo(): void {
        if (!isYouTubePage()) return;
        this.youtubeAutoSelectSuppressedVideoId = this.youtubeVideoId || getYouTubeVideoId();
    }

    private clearSecondaryTrack(): void {
        this.resetSecondarySubtitleState();
        this.clearSecondaryTrackLoadingStates();
        this.setNativeTrackModes();
        this.render();
        this.refreshOpenTranscriptPanelAfterSecondaryClear();
        this.syncControls();
        log.info('Secondary subtitle track cleared');
    }

    private clearSecondaryTrackLoadingStates(): void {
        for (const track of this.tracks) {
            if (track.loadingState && track.id !== this.selectedTrackId) track.loadingState = 'idle';
        }
    }

    private refreshOpenTranscriptPanelAfterSecondaryClear(): void {
        if (!this.isTranscriptPanelOpen()) return;
        if (this.panelMode === 'lines') this.renderTranscriptPanel(true);
        else this.renderTrackPanel();
    }

    private positionTranscriptPanel(options: { realignAfterInset?: boolean; skipInset?: boolean } = {}): void {
        if (this.fullscreen) {
            this.clearVideoInsetForTranscriptPanel();
            return;
        }
        if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing) {
            this.clearVideoInsetForTranscriptPanel();
            return;
        }
        const panel = this.transcriptPanel;
        const viewportWidth = Math.max(320, window.innerWidth);
        const viewportHeight = Math.max(240, window.innerHeight);
        const settings = this.options.getSettings();
        const referenceVideoRect = this.transcriptLayoutReferenceVideoRect(viewportWidth, viewportHeight);
        const layout = this.transcriptDrawerLayout({
            viewportWidth,
            viewportHeight,
            anchorTop: this.transcriptAnchorRect().top,
            compactPanel: shouldUseCompactSubtitleDrawer(viewportWidth),
            preferredPlacement: settings.subtitleTranscriptPlacement,
            size: this.transcriptPanelSize,
        }, referenceVideoRect);
        applyTranscriptPanelLayout(panel, layout);
        this.effectiveTranscriptPlacement = layout.placement;
        this.syncTranscriptPlacementClass();
        this.syncTranscriptResizeHandle(layout);
        this.syncDrawerButtons(this.hasVisibleSubtitleLines());
        if (!options.skipInset) {
            const insetChanged = this.applyVideoInsetForTranscriptLayout(layout, referenceVideoRect);
            if (options.realignAfterInset && insetChanged) this.scheduleTranscriptPanelRealignAfterInset();
        }
    }

    private transcriptDrawerLayout(options: SubtitleDrawerLayoutOptions, referenceVideoRect: DOMRect): TranscriptPanelLayout {
        const layoutOptions = this.withConstrainedSideTranscriptSize(options, referenceVideoRect);
        const layout = computeSubtitleDrawerLayout(layoutOptions);
        if (!this.shouldUseBottomTranscriptLayout(layout, referenceVideoRect)) return layout;
        return computeSubtitleDrawerLayout({
            ...layoutOptions,
            compactPanel: true,
            preferredPlacement: 'bottom',
        });
    }

    private withConstrainedSideTranscriptSize(options: SubtitleDrawerLayoutOptions, referenceVideoRect: DOMRect): SubtitleDrawerLayoutOptions {
        if (options.compactPanel || options.preferredPlacement === 'bottom' || !this.video) return options;
        const placement = options.preferredPlacement === 'left' ? 'left' : 'right';
        const sideWidth = this.constrainedSideTranscriptWidth(placement, options, referenceVideoRect);
        if (sideWidth === undefined || sideWidth === options.size?.sideWidth) return options;
        return {
            ...options,
            size: {
                ...(options.size ?? {}),
                sideWidth,
            },
        };
    }

    private constrainedSideTranscriptWidth(
        placement: Exclude<ReaderSettings['subtitleTranscriptPlacement'], 'bottom'>,
        options: SubtitleDrawerLayoutOptions,
        referenceVideoRect = this.transcriptLayoutReferenceVideoRect(options.viewportWidth, options.viewportHeight),
    ): number | undefined {
        const maxWidth = this.maxSideTranscriptWidthForVideo(placement, options, referenceVideoRect);
        if (maxWidth < TRANSCRIPT_PANEL_MIN_SIDE_WIDTH) return undefined;
        const currentWidth = options.size?.sideWidth ?? Math.min(460, options.viewportWidth * 0.32);
        return Math.round(Math.min(currentWidth, maxWidth));
    }

    private maxSideTranscriptWidthForVideo(
        _placement: Exclude<ReaderSettings['subtitleTranscriptPlacement'], 'bottom'>,
        options: SubtitleDrawerLayoutOptions,
        videoRect: DOMRect,
    ): number {
        if (videoRect.width <= 0) return 0;
        const margin = options.compactPanel ? 0 : TRANSCRIPT_PANEL_MARGIN;
        const minimumPlayerWidth = minimumSideTranscriptPlayerWidth(videoRect.width);
        // Both placements share the same span (videoRect.left → viewport edge):
        // when docking left the player shifts right, so the available panel width
        // is symmetric. Using videoRect.right for left wrongly assumed the player
        // stayed put, which forced the bottom fallback on smaller screens.
        return Math.floor(options.viewportWidth - videoRect.left - margin * 2 - minimumPlayerWidth);
    }

    private clampStoredSideWidthForCurrentVideo(placement: Exclude<ReaderSettings['subtitleTranscriptPlacement'], 'bottom'>): void {
        const constrained = this.constrainedSideTranscriptWidth(placement, {
            viewportWidth: Math.max(320, window.innerWidth),
            viewportHeight: Math.max(240, window.innerHeight),
            anchorTop: this.transcriptAnchorRect().top,
            compactPanel: shouldUseCompactSubtitleDrawer(Math.max(320, window.innerWidth)),
            preferredPlacement: placement,
            size: this.transcriptPanelSize,
        });
        if (constrained !== undefined) this.transcriptPanelSize.sideWidth = constrained;
    }

    private shouldUseBottomTranscriptLayout(layout: TranscriptPanelLayout, videoRect = this.videoLayoutRect()): boolean {
        if (!isYouTubePage()) return false;
        if (layout.placement === 'bottom' || !this.video) return false;
        if (isYouTubeTheaterMode()) return true;
        if (videoRect.width <= 0) return false;
        const availableWidth = this.availablePlayerWidthForSideLayout(layout, videoRect);
        return shouldUseBottomTranscriptLayoutForAvailableWidth(videoRect.width, availableWidth);
    }

    private scheduleTranscriptPanelRealignAfterInset(): void {
        if (this.transcriptInsetRealignFrame !== undefined) return;
        this.transcriptInsetRealignFrame = requestAnimationFrame(() => this.realignTranscriptPanelAfterInset());
    }

    private realignTranscriptPanelAfterInset(): void {
        this.transcriptInsetRealignFrame = undefined;
        if (!this.shouldRealignTranscriptPanelAfterInset()) return;
        this.alignToVideo();
    }

    private shouldRealignTranscriptPanelAfterInset(): boolean {
        return Boolean(!this.destroyed && this.transcriptPanel && !this.transcriptPanel.hidden && !this.transcriptPanelClosing);
    }

    private transcriptLayoutReferenceVideoRect(viewportWidth: number, viewportHeight: number): DOMRect {
        const current = this.videoInset.measureWithoutInset(this.video, () => this.videoLayoutRect());
        const viewportKey = `${viewportWidth}x${viewportHeight}`;
        // A degenerate rect (player mid-resize, e.g. exiting fullscreen) would
        // otherwise latch in as the reference and shrink the video to nothing.
        const degenerate = current.width < 200 || current.height < 120;
        if (degenerate) return this.transcriptLayoutReferenceRect ?? current;
        if (!this.transcriptLayoutReferenceRect
            || this.transcriptLayoutReferenceViewport !== viewportKey
            || current.width > this.transcriptLayoutReferenceRect.width + 20
            || current.height > this.transcriptLayoutReferenceRect.height + 20) {
            this.transcriptLayoutReferenceRect = current;
            this.transcriptLayoutReferenceViewport = viewportKey;
        }
        return this.transcriptLayoutReferenceRect;
    }

    private applyVideoInsetForTranscriptLayout(layout: TranscriptPanelLayout, videoRect = this.videoLayoutRect()): boolean {
        if (!this.video) {
            this.clearVideoInsetForTranscriptPanel();
            return false;
        }
        if (layout.placement === 'bottom') {
            return this.applyPageVideoInset('bottom', layout.top - videoRect.top - layout.margin, layout.height, videoRect);
        }
        const availableWidth = this.availablePlayerWidthForSideLayout(layout, videoRect);
        return this.applyPageVideoInset(layout.placement, Math.max(0, availableWidth), layout.width, videoRect);
    }

    private availablePlayerWidthForSideLayout(layout: TranscriptPanelLayout, videoRect: DOMRect): number {
        // For left docking the player shifts right toward the viewport edge, so
        // measure the room from the panel's right edge to the viewport — not the
        // player's current (pre-shift) right edge, which under-counted and forced
        // the bottom fallback on smaller screens.
        // The extra margin matches the doubled left-side inset gap applied by
        // the video inset adapter so the shifted player still fits on screen.
        return layout.placement === 'left'
            ? Math.max(window.innerWidth, videoRect.right) - (layout.left + layout.width + layout.margin * 2)
            : layout.left - videoRect.left - layout.margin;
    }

    private syncFullscreenState(): void {
        this.fullscreen = Boolean(document.fullscreenElement);
        document.documentElement.classList.toggle('jpdb-subtitle-fullscreen', this.fullscreen);
        this.root?.classList.toggle('jpdb-subtitle-fullscreen', this.fullscreen);
        if (this.fullscreen) {
            this.clearVideoInsetForTranscriptPanel();
            return;
        }
        this.transcriptLayoutReferenceRect = undefined;
        this.transcriptLayoutReferenceViewport = '';
        if (this.isTranscriptPanelOpen()) {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                if (!this.destroyed && !this.fullscreen) this.positionTranscriptPanel({ realignAfterInset: true });
            }));
        }
    }

    private scheduleAlignToVideo(): void {
        if (this.alignFrame) cancelAnimationFrame(this.alignFrame);
        this.alignFrame = requestAnimationFrame(() => {
            this.alignFrame = undefined;
            if (this.destroyed) return;
            this.alignToVideo();
        });
    }

    private videoLayoutRect(): DOMRect {
        return subtitleVideoLayoutRect(this.video);
    }

    private transcriptAnchorRect(): DOMRect {
        if (isYouTubePage()) return this.videoLayoutRect();
        if (!this.video) return this.videoLayoutRect();
        return transcriptAvoidanceTarget(this.video).getBoundingClientRect();
    }

    private clearVideoInsetForTranscriptPanel(): boolean {
        this.transcriptLayoutReferenceRect = undefined;
        this.transcriptLayoutReferenceViewport = '';
        return this.videoInset.clear(this.video);
    }

    private applyPageVideoInset(side: SubtitleVideoInsetSide, playerSize: number, panelSize?: number, videoRect = this.videoLayoutRect()): boolean {
        if (this.fullscreen) {
            this.clearVideoInsetForTranscriptPanel();
            return false;
        }
        const panelRect = this.transcriptPanel?.getBoundingClientRect();
        return this.videoInset.apply({
            video: this.video,
            side,
            playerSize,
            panelSize: panelSize ?? ((side === 'bottom' ? panelRect?.height : panelRect?.width) ?? 0),
            videoRect,
            margin: TRANSCRIPT_PANEL_MARGIN,
        });
    }
}
