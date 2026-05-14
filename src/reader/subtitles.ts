import { escapeHtml, renderTokensToHtml, setInnerHtml } from './dom';
import { Logger } from './logger';
import { accentToRgba, matchesShortcut } from './settings';
import { gmStorageGetSync, gmStorageSetSync } from './storage';
import type { JPDBToken, ReaderSettings } from './types';
import { getUserscriptHttpRequest } from './userscript';

export interface SubtitleWordTiming {
    text: string;
    start: number;
    end: number;
}

export interface SubtitleCue {
    start: number;
    end: number;
    text: string;
    originalText?: string;
    words?: SubtitleWordTiming[];
    wordTimingsExact?: boolean;
    transcriptEligible?: boolean;
}

interface SubtitleTrackOption {
    id: string;
    label: string;
    kind: 'native' | 'file' | 'youtube' | 'remote';
    language?: string;
    track?: TextTrack;
    cues?: SubtitleCue[];
    url?: string;
    youtubeTrack?: unknown;
    sourceKey?: string;
    loadingState?: 'idle' | 'loading' | 'ready' | 'waiting' | 'error';
}

export interface PageSubtitleSource {
    url: string;
    label: string;
    language?: string;
    sourceKey: string;
}

interface SubtitlePlayerOptions {
    getSettings: () => ReaderSettings;
    parseJapanese: (text: string) => Promise<JPDBToken[]>;
    onSettingsChange: () => void;
}

const CAPTION_SELECTOR_LIST = [
    '.caption-visual-line',
    '.captions-text',
    '[data-purpose="captions-text"]',
    '.ytp-caption-segment',
];

const CAPTION_SELECTORS = CAPTION_SELECTOR_LIST.join(',');
const CAPTION_CONTAINER_SELECTORS = '.caption-visual-line,.captions-text,[data-purpose="captions-text"],.caption-window,.ytp-caption-segment';
const TRANSCRIPT_PREPARSE_WINDOW = 18;
const TRANSCRIPT_BACKGROUND_HYDRATION_BATCH = 8;
const log = Logger.scope('Subtitles');

export class SubtitlePlayerController {
    private root?: HTMLElement;
    private subtitleEl?: HTMLElement;
    private menuEl?: HTMLElement;
    private transcriptPanel?: HTMLElement;
    private primaryFileInput?: HTMLInputElement;
    private secondaryFileInput?: HTMLInputElement;
    private video?: HTMLVideoElement;
    private cues: SubtitleCue[] = [];
    private secondaryCues: SubtitleCue[] = [];
    private tracks: SubtitleTrackOption[] = [];
    private currentCue?: SubtitleCue;
    private secondaryCue?: SubtitleCue;
    private observer?: MutationObserver;
    private videoResizeObserver?: ResizeObserver;
    private discoverTimer?: number;
    private alignFrame?: number;
    private selectedTrackId = '';
    private secondaryTrackId = '';
    private youtubeVideoId = '';
    private youtubeAutoSelectSuppressedVideoId = '';
    private lastDomCaption = '';
    private pendingDomCaption?: { text: string; firstSeenAt: number };
    private parsedHtmlCache = new Map<string, string>();
    private pendingParsedHtml = new Map<string, Promise<string>>();
    private renderSerial = 0;
    private panelMode: 'lines' | 'tracks' = 'lines';
    private lastMenuSignature = '';
    private lastTranscriptSignature = '';
    private transcriptScrollFrame?: number;
    private transcriptHydrateFrame?: number;
    private transcriptHydrationSerial = 0;
    private transcriptPanelSize = loadTranscriptPanelSize();
    private lastInsetSignature = '';
    private lastYomuCaptionsActive = false;
    private youtubeDomCaptionFallbackTrackId = '';
    private fullscreen = false;
    private lastRenderedPrimaryText = '';
    private lastRenderedPrimaryHtml = '';
    private parseWarmupSerial = 0;
    private transcriptHydrationCursor = 0;
    private effectiveTranscriptPlacement: ReaderSettings['subtitleTranscriptPlacement'] = 'right';
    private lastAutoCopiedCueSignature = '';
    private youtubeTrackDiscoveryInFlight = false;
    private lastYouTubeTrackDiscoveryAt = 0;
    private primarySelectionRequest = 0;
    private secondarySelectionRequest = 0;

    constructor(private options: SubtitlePlayerOptions) {}

    init(): void {
        this.install();
        this.observer = new MutationObserver(mutations => {
            if (mutations.every(mutationInsideReaderRoot)) return;
            if (!mutations.some(mutationCouldAffectVideoDiscovery)) return;
            this.scheduleDiscoverVideo();
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
        document.addEventListener('keydown', event => this.handleKeydown(event));
        document.addEventListener('pointermove', event => this.handlePointerActivity(event), { passive: true });
        document.addEventListener('fullscreenchange', () => {
            this.fullscreen = Boolean(document.fullscreenElement);
            this.syncFullscreenState();
            this.scheduleAlignToVideo();
            this.render();
        });
        window.addEventListener('scroll', () => this.scheduleAlignToVideo(), { passive: true });
        window.addEventListener('resize', () => {
            this.scheduleAlignToVideo();
        }, { passive: true });
        this.discoverVideo();
        this.tick();
        log.info('Subtitle controller initialized');
    }

    refresh(): void {
        if (!this.root) return;
        const settings = this.options.getSettings();
        this.root.hidden = !settings.subtitlePlayerEnabled || (!this.video && !this.cues.length);
        this.root.classList.toggle('jpdb-subtitle-hidden', !settings.subtitleOverlayVisible);
        this.root.classList.toggle('jpdb-subtitle-controls-auto', settings.subtitleControlsMode === 'auto');
        this.root.classList.toggle('jpdb-subtitle-controls-hidden', settings.subtitleControlsMode === 'hidden');
        this.root.classList.toggle('jpdb-subtitle-controls-always', settings.subtitleControlsMode === 'always');
        this.root.classList.toggle('jpdb-subtitle-controls-idle', settings.subtitleControlsMode === 'auto' && this.root.classList.contains('jpdb-subtitle-controls-idle'));
        this.syncTranscriptPlacementClass();
        this.syncFullscreenState();
        setStylePropertyIfChanged(this.root, '--subtitle-font-size-target', `${settings.subtitleFontSize}px`);
        setStylePropertyIfChanged(this.root, '--subtitle-font-size', `${settings.subtitleFontSize}px`);
        this.root.style.setProperty('--subtitle-bottom', `${settings.subtitleBottomOffset}%`);
        this.root.style.setProperty('--subtitle-color', settings.subtitleTextColor);
        this.root.style.setProperty('--subtitle-outline', settings.subtitleOutlineColor);
        this.root.style.setProperty('--subtitle-background-rgba', accentToRgba(settings.subtitleBackgroundColor, settings.subtitleBackgroundOpacity));
        this.root.style.setProperty('--subtitle-family', settings.subtitleFontFamily);
        this.root.style.setProperty('--subtitle-weight', String(settings.subtitleFontWeight));
        if (settings.subtitleTranscriptVisible && this.hasTranscriptSurface() && this.transcriptPanel?.hidden) {
            this.panelMode = 'lines';
            this.transcriptPanel.hidden = false;
            this.renderTranscriptPanel(true);
        }
        this.scheduleAlignToVideo();
        this.syncControls();
        this.render();
        this.hideControlsImmediately();
        log.debugThrottled('refresh', 2500, 'Subtitle player refreshed', {
            enabled: settings.subtitlePlayerEnabled,
            hasVideo: Boolean(this.video),
            cues: this.cues.length,
            tracks: this.tracks.length,
        });
    }

    private install(): void {
        if (this.root) return;

        const root = document.createElement('div');
        root.className = 'jpdb-subtitle-player';
        root.dataset.jpdbReaderRoot = 'true';
        setInnerHtml(root, `
            <div class="jpdb-subtitle-text" aria-live="polite"></div>
            <div class="jpdb-subtitle-status" aria-live="polite"></div>
            <div class="jpdb-subtitle-rail">
                <button class="jpdb-subtitle-toggle" type="button" data-action="toggle" title="Show or hide subtitles" aria-label="Show or hide subtitles">${subtitleIcon('eye')}</button>
                <button type="button" data-action="previous" title="Previous subtitle" aria-label="Previous subtitle">‹</button>
                <button type="button" data-action="next" title="Next subtitle" aria-label="Next subtitle">›</button>
                <button type="button" data-action="panel" title="Open subtitle drawer" aria-label="Open subtitle drawer">${subtitleIcon('transcript')}</button>
            </div>
            <div class="jpdb-subtitle-menu" hidden></div>
            <div class="jpdb-subtitle-list" hidden></div>
            <input hidden type="file" data-file="primary" accept=".srt,.vtt,.ass,.ssa,text/vtt">
            <input hidden type="file" data-file="secondary" accept=".srt,.vtt,.ass,.ssa,text/vtt">
        `);
        root.addEventListener('click', event => this.handleClick(event));
        this.subtitleEl = root.querySelector('.jpdb-subtitle-text') as HTMLElement;
        this.menuEl = root.querySelector<HTMLElement>('.jpdb-subtitle-menu') ?? undefined;
        this.transcriptPanel = root.querySelector('.jpdb-subtitle-list') as HTMLElement;
        this.primaryFileInput = root.querySelector('input[data-file="primary"]') as HTMLInputElement;
        this.secondaryFileInput = root.querySelector('input[data-file="secondary"]') as HTMLInputElement;
        this.primaryFileInput.addEventListener('change', () => void this.loadSubtitleFile('primary'));
        this.secondaryFileInput.addEventListener('change', () => void this.loadSubtitleFile('secondary'));
        document.body.appendChild(root);
        this.root = root;
        this.refresh();
        log.debug('Subtitle player DOM installed');
    }

    private scheduleDiscoverVideo(): void {
        if (this.discoverTimer !== undefined) return;
        this.discoverTimer = window.setTimeout(() => {
            this.discoverTimer = undefined;
            this.discoverVideo();
        }, 120);
    }

    private discoverVideo(): void {
        const settings = this.options.getSettings();
        if (!settings.subtitlePlayerEnabled || !settings.subtitleAutoDetect) {
            this.refresh();
            return;
        }

        const candidate = [...document.querySelectorAll('video')]
            .map(video => video as HTMLVideoElement)
            .filter(video => video.readyState >= 1 || video.clientWidth > 120 || video.getBoundingClientRect().width > 120)
            .sort((a, b) => (b.getBoundingClientRect().width * b.getBoundingClientRect().height) - (a.getBoundingClientRect().width * a.getBoundingClientRect().height))[0];

        if (candidate && candidate !== this.video) {
            this.video = candidate;
            this.attachTextTracks(candidate);
            this.observeVideoLayout(candidate);
            log.info('Subtitle video detected', videoSummary(candidate));
        }
        this.discoverPageSubtitleTracks();
        void this.discoverYouTubeTracksThrottled(true);
        this.refresh();
    }

    private attachTextTracks(video: HTMLVideoElement): void {
        for (const track of Array.from(video.textTracks)) this.addNativeTrack(track);
        video.textTracks.addEventListener?.('addtrack', event => {
            const track = (event as TrackEvent).track as TextTrack | null;
            if (track) this.addNativeTrack(track);
        });
        log.debug('Attached native text track listeners', { tracks: video.textTracks.length });
    }

    private observeVideoLayout(video: HTMLVideoElement): void {
        this.videoResizeObserver?.disconnect();
        this.videoResizeObserver = new ResizeObserver(() => this.scheduleAlignToVideo());
        this.videoResizeObserver.observe(video);
        video.addEventListener('loadedmetadata', () => this.scheduleAlignToVideo(), { passive: true });
        video.addEventListener('loadeddata', () => this.scheduleAlignToVideo(), { passive: true });
        video.addEventListener('play', () => this.scheduleAlignToVideo(), { passive: true });
        this.scheduleAlignToVideo();
    }

    private addNativeTrack(track: TextTrack): void {
        if (this.tracks.some(item => item.track === track)) return;
        const id = `native-${this.tracks.length}`;
        const label = track.label || track.language || `Subtitle ${this.tracks.length + 1}`;
        const option: SubtitleTrackOption = { id, label, kind: 'native', language: track.language, track };
        this.tracks.push(option);
        log.debug('Native subtitle track added', { id, label, language: track.language });

        track.addEventListener('cuechange', () => this.updateFromNativeTrack(track));
        this.maybeAutoSelectNativeTrack(option);
        window.setTimeout(() => {
            this.setNativeTrackModes();
            this.syncControls();
        }, 0);
        this.syncControls();
    }

    private discoverPageSubtitleTracks(): void {
        const sources = collectPageSubtitleSources(document);
        if (!sources.length) return;

        let added = 0;
        for (const source of sources) {
            if (this.tracks.some(track => track.sourceKey === source.sourceKey || (track.url && sameSubtitleUrl(track.url, source.url)))) continue;
            const track: SubtitleTrackOption = {
                id: `remote-${this.tracks.length}`,
                label: source.label,
                kind: 'remote',
                language: source.language,
                url: source.url,
                sourceKey: source.sourceKey,
            };
            this.tracks.push(track);
            this.maybeAutoSelectPageSubtitleTrack(track);
            added += 1;
        }

        if (added) {
            log.debug('Page subtitle files discovered', { added, total: this.tracks.length });
            this.renderTrackPanel();
            this.syncControls();
        }
    }

    private maybeAutoSelectPageSubtitleTrack(option: SubtitleTrackOption): void {
        if (option.kind !== 'remote' || !option.url) return;
        const selected = this.tracks.find(track => track.id === this.selectedTrackId);
        const secondary = this.tracks.find(track => track.id === this.secondaryTrackId);
        if (isJapaneseSubtitleTrack(option)
            && (!this.selectedTrackId || shouldReplaceWaitingNativeTrack(selected, option, this.cues))) {
            void this.selectTrack(option.id);
            log.debug('Auto-selected Japanese page subtitle file', { id: option.id, label: option.label, host: safeHost(option.url) });
        } else if (isEnglishSubtitleTrack(option)
            && (!this.secondaryTrackId || shouldReplaceWaitingNativeTrack(secondary, option, this.secondaryCues))) {
            void this.selectSecondaryTrack(option.id);
            log.debug('Auto-selected secondary page subtitle file', { id: option.id, label: option.label, host: safeHost(option.url) });
        }
    }

    private maybeAutoSelectNativeTrack(option: SubtitleTrackOption): void {
        if (!option.track) return;
        if (!this.selectedTrackId && isJapaneseSubtitleTrack(option)) {
            const requestId = this.beginTrackSelection('primary');
            this.selectedTrackId = option.id;
            ensureTextTrackReadable(option.track);
            void this.loadNativeTrackCues(option, 'primary', requestId);
            log.debug('Auto-selected Japanese native subtitle track', { id: option.id, label: option.label });
        } else if (!this.secondaryTrackId && isEnglishSubtitleTrack(option)) {
            const requestId = this.beginTrackSelection('secondary');
            this.secondaryTrackId = option.id;
            ensureTextTrackReadable(option.track);
            void this.loadNativeTrackCues(option, 'secondary', requestId);
            log.debug('Auto-selected secondary native subtitle track', { id: option.id, label: option.label });
        }
    }

    private async loadNativeTrackCues(option: SubtitleTrackOption, role: 'primary' | 'secondary', requestId: number): Promise<void> {
        const track = option.track;
        if (!track) return;
        const cues = readTrackCues(track);
        const loadedCues = cues.length ? cues : await waitForTextTrackCues(track);
        if (!this.isTrackSelectionCurrent(role, requestId, option.id)) return;
        if (!loadedCues.length) return;
        if (role === 'primary' && this.selectedTrackId === option.id) this.cues = loadedCues;
        if (role === 'secondary' && this.secondaryTrackId === option.id) this.secondaryCues = loadedCues;
        option.loadingState = 'ready';
        this.updateFromLoadedCues();
        this.render();
        this.syncControls();
    }

    private updateFromNativeTrack(track: TextTrack): void {
        const primary = this.tracks.find(item => item.id === this.selectedTrackId);
        const secondary = this.tracks.find(item => item.id === this.secondaryTrackId);
        const active = track.activeCues?.[0] as VTTCue | TextTrackCue | undefined;
        if (!active) return;

        if (primary?.track === track) {
            this.currentCue = normalizeSubtitleCues([{ start: active.startTime, end: active.endTime, text: getCueText(active) }])[0];
            if (!this.cues.length) this.cues = readTrackCues(track);
            void this.autoCopyCurrentCue();
        }
        if (secondary?.track === track) {
            this.secondaryCue = normalizeSubtitleCues([{ start: active.startTime, end: active.endTime, text: getCueText(active), transcriptEligible: false }])[0];
            if (!this.secondaryCues.length) this.secondaryCues = readTrackCues(track);
        }
        this.render();
        this.renderTranscriptPanel();
        this.syncControls();
    }

    private tick(): void {
        const settings = this.options.getSettings();
        if (settings.subtitlePlayerEnabled) {
            if (isYouTubePage() && (!this.selectedTrackId || (this.selectedTrackId && !this.cues.length))) {
                void this.discoverYouTubeTracksThrottled();
            }
            this.refreshNativeCueLists();
            this.updateFromLoadedCues();
            if (settings.subtitleKaraokeMode && cueHasExactWordTimings(this.currentCue)) this.render();
            if (!isYouTubePage() || (this.selectedTrackId && !this.cues.length)) this.updateFromDomCaptions();
        }
        window.setTimeout(() => this.tick(), 250);
    }

    private refreshNativeCueLists(): void {
        const primary = this.tracks.find(item => item.id === this.selectedTrackId);
        const secondary = this.tracks.find(item => item.id === this.secondaryTrackId);
        if (primary?.track) {
            const cues = readTrackCues(primary.track);
            if (cues.length && cues.length !== this.cues.length) this.cues = cues;
        }
        if (secondary?.track) {
            const cues = readTrackCues(secondary.track);
            if (cues.length && cues.length !== this.secondaryCues.length) this.secondaryCues = cues;
        }
    }

    private alignToVideo(): void {
        if (!this.root || !this.video) {
            this.positionTranscriptPanel();
            return;
        }
        const rect = this.videoLayoutRect();
        this.applyVideoLayout(rect);
    }

    private applyVideoLayout(rect: DOMRect): void {
        if (!this.root) return;
        this.root.classList.toggle('jpdb-subtitle-compact-video', rect.width < 560 || rect.height < 260);
        if (rect.width < 120 || rect.height < 80) {
            applyElementLayout(this.root, { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight });
            this.positionTranscriptPanel();
            return;
        }
        applyElementLayout(this.root, { left: rect.left, top: rect.top, width: Math.max(260, rect.width), height: Math.max(160, rect.height) });
        this.positionTranscriptPanel();
    }

    private updateFromLoadedCues(): void {
        if (!this.video) return;
        const time = this.video.currentTime;
        const cue = this.selectedTrackId ? findActiveSubtitleCue(this.cues, time) : undefined;
        const secondary = this.secondaryTrackId ? findActiveSubtitleCue(this.secondaryCues, time) : undefined;
        let changed = false;
        if (cue && cue !== this.currentCue) {
            this.currentCue = cue;
            changed = true;
        } else if (!cue && this.currentCue && time > this.currentCue.end + 0.12) {
            this.currentCue = undefined;
            changed = true;
        }
        if (secondary !== this.secondaryCue) {
            this.secondaryCue = secondary;
            changed = true;
        }
        if (changed) {
            this.render();
            this.renderTranscriptPanel();
            this.syncControls();
            this.warmParseAroundActiveCue();
            void this.autoCopyCurrentCue();
        }
    }

    private updateFromDomCaptions(): void {
        if (this.cues.length) return;
        const selected = this.tracks.find(track => track.id === this.selectedTrackId);
        const selectedNativeTrackNeedsDomFallback = Boolean(selected?.kind === 'native' && selected.track && !this.cues.length);
        if (isYouTubePage() && !this.selectedTrackId) return;
        if (!isYouTubePage() && this.selectedTrackId && !selectedNativeTrackNeedsDomFallback) return;
        if (!this.options.getSettings().subtitleOverlayVisible) return;
        const text = readPageCaptionText(this.video, this.root);
        if (!text) {
            this.pendingDomCaption = undefined;
            if (!this.cues.length && this.currentCue && (this.video?.currentTime ?? 0) > this.currentCue.end) {
                this.currentCue = undefined;
                this.lastDomCaption = '';
                this.render();
                this.syncControls();
            }
            return;
        }
        const nowMs = performance.now();
        if (this.pendingDomCaption?.text !== text) {
            this.pendingDomCaption = { text, firstSeenAt: nowMs };
            return;
        }
        if (nowMs - this.pendingDomCaption.firstSeenAt < 450 || text === this.lastDomCaption) return;

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
            setInnerHtml(this.subtitleEl, this.secondaryCue?.text ? this.renderSecondarySubtitle(this.secondaryCue.text, settings) : '');
            return;
        }

        const secondary = settings.subtitleSecondaryVisible && this.secondaryCue?.text
            ? this.renderSecondarySubtitle(this.secondaryCue.text, settings)
            : '';
        const parsed = this.parsedHtmlCache.get(this.parseCacheKey(text, settings));
        const hasParser = this.shouldParseSubtitles(settings);
        const activeCue = this.currentCue;
        const karaokeActive = settings.subtitleKaraokeMode && cueHasExactWordTimings(activeCue);
        const parsedHasReaderWords = parsed?.includes('jpdb-reader-word') ?? false;
        const primary = karaokeActive && parsedHasReaderWords
            ? parsed
            : karaokeActive && activeCue
                ? this.renderKaraokeCue(activeCue, this.video?.currentTime ?? activeCue.start)
                : parsed
            ? parsed
            : hasParser && this.lastRenderedPrimaryText === text && this.lastRenderedPrimaryHtml
                ? this.lastRenderedPrimaryHtml
                : hasParser
                    ? `<span class="jpdb-subtitle-primary-loading">${escapeWithBreaks(text)}</span>`
                    : escapeWithBreaks(text);
        setInnerHtml(this.subtitleEl, `<div class="jpdb-subtitle-primary">${primary}</div>${secondary}`);
        if (karaokeActive && activeCue) this.applyKaraokeStateToPrimary(activeCue, this.video?.currentTime ?? activeCue.start);
        this.fitSubtitleTextToVideo();
        if (karaokeActive && !parsed) {
            this.lastRenderedPrimaryText = text;
            this.lastRenderedPrimaryHtml = '';
            if (hasParser) void this.renderParsedPrimary(text);
        } else if (parsed) {
            this.lastRenderedPrimaryText = text;
            this.lastRenderedPrimaryHtml = parsed;
        } else if (hasParser) {
            void this.renderParsedPrimary(text);
        }
    }

    private renderSecondarySubtitle(text: string, settings: ReaderSettings): string {
        const blurClass = settings.subtitleNativeBlurred ? 'jpdb-subtitle-secondary-blurred' : 'jpdb-subtitle-secondary-clear';
        return `<button class="jpdb-subtitle-secondary ${blurClass}" type="button" data-action="toggle-native-blur" title="Toggle native subtitle blur" aria-label="Toggle native subtitle blur">${escapeWithBreaks(text)}</button>`;
    }

    private renderKaraokeCue(cue: SubtitleCue | undefined, time: number): string {
        if (!cue?.text.trim()) return '';
        if (!cueHasExactWordTimings(cue)) return escapeWithBreaks(cue.text);
        const words = cue.words;
        if (!words.length) return '';
        const progress = karaokeCharacterProgress(cue, words, time);
        return renderKaraokeTextParts(cue.text, progress);
    }

    private async renderParsedPrimary(text: string): Promise<void> {
        const settings = this.options.getSettings();
        const key = this.parseCacheKey(text, settings);
        const serial = ++this.renderSerial;
        const cached = this.parsedHtmlCache.get(key);
        if (cached) {
            this.replacePrimaryHtml(cached, serial);
            return;
        }

        try {
            const html = await this.parseCueHtml(text, settings);
            this.replacePrimaryHtml(html, serial);
            this.lastRenderedPrimaryText = text;
            this.lastRenderedPrimaryHtml = html;
            log.debug('Subtitle line parsed', { length: text.length });
        } catch (error) {
            log.debug('Subtitle line parse failed quietly', { length: text.length }, error);
            // Keep plain selectable subtitles if JPDB is unavailable.
        }
    }

    private replacePrimaryHtml(html: string, serial: number): void {
        if (serial !== this.renderSerial) return;
        const primary = this.subtitleEl?.querySelector('.jpdb-subtitle-primary');
        if (primary) {
            const settings = this.options.getSettings();
            const currentCue = this.currentCue;
            const shouldKaraoke = Boolean(settings.subtitleKaraokeMode && currentCue
                && cueHasExactWordTimings(currentCue)
                && primary.textContent?.replace(/\s+/g, ' ').trim() === currentCue.text.replace(/\s+/g, ' ').trim());
            setInnerHtml(primary, shouldKaraoke && currentCue && !html.includes('jpdb-reader-word')
                ? this.renderKaraokeCue(currentCue, this.video?.currentTime ?? currentCue.start)
                : html);
            if (shouldKaraoke && currentCue) {
                this.applyKaraokeStateToPrimary(currentCue, this.video?.currentTime ?? currentCue.start);
            }
            this.fitSubtitleTextToVideo();
        }
    }

    private shouldParseSubtitles(settings = this.options.getSettings()): boolean {
        return Boolean(settings.apiKey || settings.localDictionariesEnabled);
    }

    private parseCacheKey(text: string, settings = this.options.getSettings()): string {
        return [
            settings.showFurigana,
            settings.furiganaMode,
            settings.hideKnownFurigana,
            settings.wordHighlightMode,
            settings.wordHighlightColorSource,
            settings.wordUnderlineColorSource,
            settings.wordTextColorSource,
            settings.subtitleHighlightColorSource,
            settings.subtitleUnderlineColorSource,
            settings.subtitleTextColorSource,
            text,
        ].join(':');
    }

    private async parseCueHtml(text: string, settings = this.options.getSettings()): Promise<string> {
        const key = this.parseCacheKey(text, settings);
        const cached = this.parsedHtmlCache.get(key);
        if (cached) return cached;
        const pending = this.pendingParsedHtml.get(key);
        if (pending) return pending;
        const promise = (async () => {
            const tokens = await this.options.parseJapanese(text);
            const html = withBreaks(renderTokensToHtml(text, tokens, settings));
            this.parsedHtmlCache.set(key, html);
            if (this.parsedHtmlCache.size > 180) this.parsedHtmlCache.delete(this.parsedHtmlCache.keys().next().value ?? '');
            return html;
        })();
        this.pendingParsedHtml.set(key, promise);
        try {
            return await promise;
        } finally {
            this.pendingParsedHtml.delete(key);
        }
    }

    private warmParseAroundActiveCue(): void {
        if (!this.shouldParseSubtitles() || !this.cues.length) return;
        const active = this.activeTranscriptIndex();
        const start = Math.max(0, active >= 0 ? active - 5 : 0);
        const end = Math.min(this.cues.length, start + TRANSCRIPT_PREPARSE_WINDOW);
        const serial = ++this.parseWarmupSerial;
        const settings = this.options.getSettings();
        void (async () => {
            for (let index = start; index < end; index++) {
                if (serial !== this.parseWarmupSerial) return;
                const text = this.cues[index]?.text.trim();
                if (!text || this.parsedHtmlCache.has(this.parseCacheKey(text, settings))) continue;
                try {
                    await this.parseCueHtml(text, settings);
                } catch (error) {
                    log.debug('Subtitle pre-parse failed quietly', { index, length: text.length }, error);
                }
            }
            if (this.currentCue?.text.trim()) this.render();
        })();
    }

    private fitSubtitleTextToVideo(): void {
        if (!this.root || !this.subtitleEl) return;
        const settings = this.options.getSettings();
        const target = settings.subtitleFontSize;
        let fitted = target;
        this.root.style.setProperty('--subtitle-font-size', `${fitted}px`);
        const primary = this.subtitleEl.querySelector<HTMLElement>('.jpdb-subtitle-primary');
        if (!primary) return;
        const rootRect = this.root.getBoundingClientRect();
        const minimum = rootRect.width < 420 || rootRect.height < 260 ? 11 : 14;
        for (let attempt = 0; attempt < 10; attempt++) {
            const overflowsHeight = this.subtitleEl.scrollHeight > this.subtitleEl.clientHeight + 1;
            const overflowsWidth = this.subtitleEl.scrollWidth > this.subtitleEl.clientWidth + 1;
            if (!overflowsHeight && !overflowsWidth) return;
            const heightScale = this.subtitleEl.clientHeight / Math.max(1, this.subtitleEl.scrollHeight);
            const widthScale = this.subtitleEl.clientWidth / Math.max(1, this.subtitleEl.scrollWidth);
            const next = Math.max(minimum, Math.floor(fitted * Math.min(.92, heightScale, widthScale)));
            if (next >= fitted) break;
            fitted = next;
            this.root.style.setProperty('--subtitle-font-size', `${fitted}px`);
        }
        this.root.style.setProperty('--subtitle-font-size', `${fitted}px`);
    }

    private applyKaraokeStateToPrimary(cue: SubtitleCue, time: number): void {
        const primary = this.subtitleEl?.querySelector<HTMLElement>('.jpdb-subtitle-primary');
        if (!primary) return;
        if (!cueHasExactWordTimings(cue)) return;
        const words = cue.words;
        if (!words.length) return;
        const wordElements = Array.from(primary.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        if (!wordElements.length) return;

        const progress = karaokeCharacterProgress(cue, words, time);
        let cursor = 0;
        for (const element of wordElements) {
            element.classList.remove('jpdb-subtitle-word-pending', 'jpdb-subtitle-word-spoken', 'jpdb-subtitle-word-current');
            const surface = element.textContent?.replace(/\s+/g, '') ?? '';
            if (!surface) continue;
            const start = cursor;
            const end = cursor + compactTextLength(surface);
            cursor = end;
            if (progress >= end) element.classList.add('jpdb-subtitle-word-spoken');
            else if (progress > start) element.classList.add('jpdb-subtitle-word-current');
            else element.classList.add('jpdb-subtitle-word-pending');
        }
    }

    private handleClick(event: MouseEvent): void {
        const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        this.showControlsTemporarily();
        log.debug('Subtitle control clicked', { action });

        if (action === 'cue') this.seekToCue(Number((event.target as HTMLElement).closest<HTMLElement>('[data-index]')?.dataset.index));
        if (action === 'previous') this.seekSubtitle(-1);
        if (action === 'next') this.seekSubtitle(1);
        if (action === 'copy') void this.copySubtitle();
        if (action === 'copy-row') void this.copySubtitle(Number((event.target as HTMLElement).closest<HTMLElement>('[data-index]')?.dataset.index));
        if (action === 'load') this.primaryFileInput?.click();
        if (action === 'load-secondary') this.secondaryFileInput?.click();
        if (action === 'menu') {
            this.toggleMenu();
            return;
        }
        if (action === 'panel') this.toggleTranscriptDrawer();
        if (action === 'list') this.toggleTranscriptPanel();
        if (action === 'tracks') this.toggleTrackPanel();
        if (action === 'panel-lines') this.openLinesPanel();
        if (action === 'panel-tracks') this.openTracksPanel();
        if (action === 'close-panel') this.closeTranscriptPanel();
        if (action === 'primary-track') void this.choosePrimaryTrack((event.target as HTMLElement).closest<HTMLElement>('[data-track-id]')?.dataset.trackId);
        if (action === 'secondary-track') void this.chooseSecondaryTrack((event.target as HTMLElement).closest<HTMLElement>('[data-track-id]')?.dataset.trackId);
        if (action === 'toggle') this.toggleSubtitles();
        if (action === 'toggle-secondary') this.toggleSecondarySubtitles();
        if (action === 'toggle-native-blur') this.toggleNativeSubtitleBlur();
        this.syncControls();
    }

    private handlePointerActivity(event: PointerEvent): void {
        if (this.isPointerNearSubtitleSurface(event.clientX, event.clientY)) {
            this.showControlsTemporarily();
        } else {
            this.hideControlsImmediately();
        }
    }

    private showControlsTemporarily(): void {
        if (!this.root) return;
        this.root.classList.remove('jpdb-subtitle-controls-idle');
    }

    private hideControlsImmediately(): void {
        if (!this.root || !this.shouldAutoIdleControls()) return;
        this.root.classList.add('jpdb-subtitle-controls-idle');
    }

    private shouldAutoIdleControls(): boolean {
        const settings = this.options.getSettings();
        if (!this.root || settings.subtitleControlsMode !== 'auto') return false;
        if (this.transcriptPanel && !this.transcriptPanel.hidden) return false;
        if (this.root.classList.contains('jpdb-subtitle-menu-open')) return false;
        if (this.root.matches(':focus-within')) return false;
        if (!this.video && !this.cues.length && !this.currentCue?.text) return false;
        if (!this.video) return true;
        const rect = this.video.getBoundingClientRect();
        return rect.width > 120 && rect.height > 90;
    }

    private isPointerNearSubtitleSurface(x: number, y: number): boolean {
        if (!this.root) return false;
        if (this.pointInElement(this.root.querySelector('.jpdb-subtitle-rail'), x, y)) return true;
        if (this.transcriptPanel && !this.transcriptPanel.hidden && this.pointInElement(this.transcriptPanel, x, y)) return true;
        if (!this.video) return true;
        const rect = this.video.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
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
            this.video.currentTime = Math.max(0, this.video.currentTime + direction * 5);
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
        if (this.video) this.video.currentTime = Math.max(0, cue.start + this.options.getSettings().subtitleSeekPadding);
        this.currentCue = cue;
        this.secondaryCue = this.secondaryCues.find(item => cue.start >= item.start - 0.35 && cue.start <= item.end + 0.35);
        this.render();
        this.syncControls();
        this.renderTranscriptPanel();
        log.debug('Subtitle cue selected', { index, start: cue.start, end: cue.end });
    }

    private async copySubtitle(index?: number): Promise<void> {
        const rowIndex = Number.isInteger(index) ? index as number : undefined;
        const cue = rowIndex !== undefined ? this.cues[rowIndex] : this.currentCue;
        const secondary = rowIndex !== undefined && cue ? findAlignedCue(this.secondaryCues, cue) : this.secondaryCue;
        const text = [cue?.text.trim(), secondary?.text.trim()].filter(Boolean).join('\n');
        if (!text) return;
        await navigator.clipboard?.writeText(text).catch(error => log.warn('Subtitle clipboard copy failed', error));
        log.debug('Subtitle copied', { length: text.length });
    }

    private async autoCopyCurrentCue(): Promise<void> {
        if (!this.options.getSettings().subtitleAutoCopyLine || !this.currentCue?.text.trim()) return;
        const signature = subtitleCueSignature(this.currentCue);
        if (signature === this.lastAutoCopiedCueSignature) return;
        this.lastAutoCopiedCueSignature = signature;
        await navigator.clipboard?.writeText(this.currentCue.text.trim())
            .catch(error => log.warn('Subtitle auto-copy failed', error));
    }

    private async loadSubtitleFile(kind: 'primary' | 'secondary'): Promise<void> {
        const input = kind === 'primary' ? this.primaryFileInput : this.secondaryFileInput;
        const file = input?.files?.[0];
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
        if (input) input.value = '';
        this.updateFromLoadedCues();
        log.info('Subtitle file loaded', { kind, name: file.name, cues: cues.length });
    }

    private async selectTrack(id: string): Promise<void> {
        const requestId = this.beginTrackSelection('primary');
        this.selectedTrackId = id;
        this.lastAutoCopiedCueSignature = '';
        if (this.secondaryTrackId === id) {
            this.invalidateTrackSelection('secondary');
            this.secondaryTrackId = '';
            this.secondaryCues = [];
            this.secondaryCue = undefined;
        }
        this.cues = [];
        this.currentCue = undefined;
        this.pendingDomCaption = undefined;
        const settings = this.options.getSettings();
        if (!settings.subtitleOverlayVisible) {
            settings.subtitleOverlayVisible = true;
            this.options.onSettingsChange();
        }
        this.root?.classList.remove('jpdb-subtitle-hidden');

        let selected = this.tracks.find(option => option.id === id);
        let currentTrackId = id;
        if (selected) {
            selected.loadingState = 'loading';
            this.renderTrackPanel();
        }
        let nextCues = selected?.cues ?? [];
        if (selected?.track) {
            ensureTextTrackReadable(selected.track);
            this.setNativeTrackModes();
            nextCues = readTrackCues(selected.track);
            if (!nextCues.length) nextCues = await waitForTextTrackCues(selected.track);
            if (!this.isTrackSelectionCurrent('primary', requestId, currentTrackId)) return;
        }
        if (selected?.kind === 'remote' && selected.url) {
            nextCues = await this.loadRemoteTrackCues(selected, true);
            if (!this.isTrackSelectionCurrent('primary', requestId, currentTrackId)) return;
            selected.cues = nextCues;
        }
        if (selected?.kind === 'youtube' && selected.url) {
            nextCues = await this.loadYouTubeTrackCues(selected);
            if (!this.isTrackSelectionCurrent('primary', requestId, currentTrackId)) return;
            if (!nextCues.length) {
                const fallback = await this.loadFirstUsableYouTubeSibling(selected);
                if (!this.isTrackSelectionCurrent('primary', requestId, currentTrackId)) return;
                if (fallback) {
                    selected = fallback.track;
                    currentTrackId = fallback.track.id;
                    this.selectedTrackId = currentTrackId;
                    nextCues = fallback.cues;
                }
            }
            selected.cues = nextCues;
        }
        if (!this.isTrackSelectionCurrent('primary', requestId, currentTrackId)) return;
        this.cues = nextCues;
        if (currentTrackId !== this.selectedTrackId) {
            this.selectedTrackId = currentTrackId;
        }
        if (selected?.kind === 'youtube') {
            this.youtubeDomCaptionFallbackTrackId = this.cues.length ? '' : currentTrackId;
            if (!this.cues.length) activateYouTubeCaptionTrack(selected);
        } else {
            this.youtubeDomCaptionFallbackTrackId = '';
        }
        if (selected) selected.loadingState = this.cues.length ? 'ready' : 'waiting';
        this.setNativeTrackModes();
        this.updateFromLoadedCues();
        this.warmParseAroundActiveCue();
        this.render();
        this.openLinesPanel();
        this.syncControls();
        log.info('Primary subtitle track selected', { id, label: selected?.label ?? '', kind: selected?.kind ?? 'unknown', cues: this.cues.length });
    }

    private async selectSecondaryTrack(id: string): Promise<void> {
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
        const settings = this.options.getSettings();
        if (!settings.subtitleSecondaryVisible) {
            settings.subtitleSecondaryVisible = true;
            this.options.onSettingsChange();
        }

        let selected = this.tracks.find(option => option.id === id);
        let currentTrackId = id;
        if (selected) {
            selected.loadingState = 'loading';
            this.renderTrackPanel();
        }
        let nextCues = selected?.cues ?? [];
        if (selected?.track) {
            ensureTextTrackReadable(selected.track);
            this.setNativeTrackModes();
            nextCues = readTrackCues(selected.track);
            if (!nextCues.length) nextCues = await waitForTextTrackCues(selected.track);
            if (!this.isTrackSelectionCurrent('secondary', requestId, currentTrackId)) return;
        }
        if (selected?.kind === 'remote' && selected.url) {
            nextCues = await this.loadRemoteTrackCues(selected, false);
            if (!this.isTrackSelectionCurrent('secondary', requestId, currentTrackId)) return;
            selected.cues = nextCues;
        }
        if (selected?.kind === 'youtube' && selected.url) {
            nextCues = await this.loadYouTubeTrackCues(selected);
            if (!this.isTrackSelectionCurrent('secondary', requestId, currentTrackId)) return;
            if (!nextCues.length) {
                const fallback = await this.loadFirstUsableYouTubeSibling(selected);
                if (!this.isTrackSelectionCurrent('secondary', requestId, currentTrackId)) return;
                if (fallback) {
                    selected = fallback.track;
                    currentTrackId = fallback.track.id;
                    this.secondaryTrackId = currentTrackId;
                    nextCues = fallback.cues;
                }
            }
            selected.cues = nextCues;
        }
        if (!this.isTrackSelectionCurrent('secondary', requestId, currentTrackId)) return;
        this.secondaryCues = nextCues;
        if (currentTrackId !== this.secondaryTrackId) {
            this.secondaryTrackId = currentTrackId;
        }
        if (selected) selected.loadingState = this.secondaryCues.length ? 'ready' : 'waiting';
        this.setNativeTrackModes();
        this.updateFromLoadedCues();
        this.warmParseAroundActiveCue();
        this.render();
        if (this.hasTranscriptSurface()) this.openLinesPanel();
        else if (this.panelMode === 'lines') this.renderTranscriptPanel(true);
        else this.renderTrackPanel();
        this.syncControls();
        log.info('Secondary subtitle track selected', { id, label: selected?.label ?? '', kind: selected?.kind ?? 'unknown', cues: this.secondaryCues.length });
    }

    private setNativeTrackModes(): void {
        const yomuCaptionsActive = Boolean(this.options.getSettings().subtitleOverlayVisible && (this.selectedTrackId || this.cues.length || this.currentCue?.text));
        const needsYouTubeDomFallback = Boolean(this.youtubeDomCaptionFallbackTrackId && this.youtubeDomCaptionFallbackTrackId === this.selectedTrackId);
        if (!isYouTubePage()) {
            for (const option of this.tracks) {
                if (option.track && (option.id === this.selectedTrackId || option.id === this.secondaryTrackId)) ensureTextTrackReadable(option.track);
            }
            document.documentElement.classList.remove('jpdb-subtitle-yomu-captions-active');
            this.lastYomuCaptionsActive = false;
            return;
        }
        for (const option of this.tracks) {
            if (option.track) option.track.mode = option.id === this.selectedTrackId || option.id === this.secondaryTrackId ? 'hidden' : 'disabled';
        }
        document.documentElement.classList.toggle('jpdb-subtitle-yomu-captions-active', yomuCaptionsActive);
        if (yomuCaptionsActive && !needsYouTubeDomFallback && !this.lastYomuCaptionsActive) disableYouTubeNativeCaptions();
        if (!yomuCaptionsActive && this.lastYomuCaptionsActive) {
            const selected = this.tracks.find(track => track.id === this.selectedTrackId && track.kind === 'youtube');
            if (selected) activateYouTubeCaptionTrack(selected);
        }
        this.lastYomuCaptionsActive = yomuCaptionsActive;
    }

    private async loadYouTubeTrackCues(track: SubtitleTrackOption): Promise<SubtitleCue[]> {
        if (!track.url) return [];
        const preferred = findPreferredYouTubeCaptionCandidate(track);
        if (preferred && shouldPreferYouTubeTrackUrl(preferred.url, track.url)) {
            track.url = preferred.url;
            track.youtubeTrack = preferred.raw;
        }
        for (const url of youtubeSubtitleRequestUrls(track.url)) {
            try {
                const cues = normalizeSubtitleCues(parseSubtitleText(await requestText(url)));
                if (cues.length) return cues;
            } catch (error) {
                log.debug('YouTube subtitle track request failed quietly', { id: track.id, label: track.label, host: safeHost(url) }, error);
            }
        }
        return [];
    }

    private async loadRemoteTrackCues(track: SubtitleTrackOption, transcriptEligible: boolean): Promise<SubtitleCue[]> {
        if (!track.url) return [];
        try {
            const cues = normalizeSubtitleCues(parseSubtitleText(await requestText(track.url)), { transcriptEligible });
            if (cues.length) return cues;
            log.debug('Page subtitle file contained no cues', { id: track.id, label: track.label, host: safeHost(track.url) });
        } catch (error) {
            log.debug('Page subtitle file request failed quietly', { id: track.id, label: track.label, host: safeHost(track.url) }, error);
        }
        return [];
    }

    private async loadFirstUsableYouTubeSibling(track: SubtitleTrackOption): Promise<{ track: SubtitleTrackOption; cues: SubtitleCue[] } | null> {
        const siblings = this.tracks.filter(candidate => candidate.kind === 'youtube'
            && candidate.id !== track.id
            && candidate.language === track.language
            && candidate.url);
        for (const sibling of siblings) {
            const cues = sibling.cues?.length ? sibling.cues : await this.loadYouTubeTrackCues(sibling);
            if (!cues.length) continue;
            sibling.cues = cues;
            return { track: sibling, cues };
        }
        return null;
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

        if (videoId !== this.youtubeVideoId) {
            this.youtubeVideoId = videoId;
            this.tracks = this.tracks.filter(track => track.kind !== 'youtube');
            this.selectedTrackId = this.tracks.some(track => track.id === this.selectedTrackId) ? this.selectedTrackId : '';
            this.secondaryTrackId = this.tracks.some(track => track.id === this.secondaryTrackId) ? this.secondaryTrackId : '';
            this.cues = this.selectedTrackId ? this.cues : [];
            this.secondaryCues = this.secondaryTrackId ? this.secondaryCues : [];
            this.currentCue = undefined;
            this.secondaryCue = undefined;
            this.pendingDomCaption = undefined;
            this.youtubeDomCaptionFallbackTrackId = '';
            this.youtubeAutoSelectSuppressedVideoId = '';
            this.lastYouTubeTrackDiscoveryAt = 0;
            log.debug('YouTube video changed for subtitle discovery', { videoId });
        }

        const tracks = getYouTubeCaptionTracks();
        if (!tracks.length) return;

        let added = 0;
        let updatedSelectedTrack = false;
        const existingKeys = new Set(this.tracks
            .filter(existing => existing.kind === 'youtube')
            .map(existing => youtubeCaptionTrackIdentity(existing)));
        for (const track of tracks) {
            const key = youtubeCaptionTrackIdentity(track);
            const existing = this.tracks.find(option => option.kind === 'youtube' && youtubeCaptionTrackIdentity(option) === key);
            if (existing) {
                if (shouldPreferYouTubeTrackUrl(track.url, existing.url)) {
                    existing.url = track.url;
                    updatedSelectedTrack ||= existing.id === this.selectedTrackId && !this.cues.length;
                }
                existing.youtubeTrack = track.raw;
                continue;
            }
            existingKeys.add(key);
            this.tracks.push({ id: `youtube-${this.tracks.length}`, label: track.label, kind: 'youtube', language: track.language, url: track.url, youtubeTrack: track.raw });
            added += 1;
        }

        if (added || updatedSelectedTrack) {
            log.debug('YouTube caption tracks discovered', { discovered: tracks.length, added, updatedSelectedTrack, total: this.tracks.length });
        }
        const autoTrack = this.findAutoYouTubeTrack();
        if (autoTrack) {
            void this.selectTrack(autoTrack.id);
            return;
        }
        if (updatedSelectedTrack && this.selectedTrackId) {
            void this.selectTrack(this.selectedTrackId);
            return;
        }
        if (!added) return;
        this.renderTrackPanel();
        this.syncControls();
    }

    private findAutoYouTubeTrack(): SubtitleTrackOption | undefined {
        if (this.selectedTrackId) return undefined;
        if (this.youtubeAutoSelectSuppressedVideoId && this.youtubeAutoSelectSuppressedVideoId === this.youtubeVideoId) return undefined;
        return [...this.tracks]
            .filter(track => track.kind === 'youtube' && isJapaneseSubtitleTrack(track))
            .sort(compareSubtitleTrackOptions)[0];
    }

    private syncControls(): void {
        const settings = this.options.getSettings();
        const hasLines = Boolean(this.cues.length || this.currentCue?.text);
        const menuOpen = Boolean(this.menuEl && !this.menuEl.hidden);
        this.root?.classList.toggle('jpdb-subtitle-menu-open', menuOpen);
        this.root?.classList.toggle('jpdb-subtitle-panel-open', !this.transcriptPanel?.hidden);
        this.root?.classList.toggle('jpdb-subtitle-has-lines', hasLines);
        this.root?.classList.toggle('jpdb-subtitle-has-track', Boolean(this.selectedTrackId || hasLines));
        this.syncTranscriptPlacementClass();
        if (menuOpen) this.renderMenu();
        const secondaryToggle = this.menuEl?.querySelector<HTMLButtonElement>('[data-action="toggle-secondary"]');
        if (secondaryToggle) secondaryToggle.textContent = settings.subtitleSecondaryVisible ? 'Native subtitles on' : 'Native subtitles off';
        this.syncSubtitleToggle(settings);
        this.syncLineNavigationButtons(hasLines);
        this.syncPanelButton(hasLines);
        this.syncStatus();
        this.setNativeTrackModes();
    }

    private syncStatus(): void {
        const status = this.root?.querySelector<HTMLElement>('.jpdb-subtitle-status');
        if (!status) return;
        if (this.tracks.length) {
            status.textContent = `${this.tracks.length} subtitle track${this.tracks.length === 1 ? '' : 's'} detected`;
        } else {
            status.textContent = 'No subtitle tracks detected yet.';
        }
    }

    private syncSubtitleToggle(settings: ReaderSettings): void {
        const subtitleToggle = this.root?.querySelector<HTMLButtonElement>('.jpdb-subtitle-toggle');
        if (!subtitleToggle) return;
        setInnerHtml(subtitleToggle, subtitleIcon(settings.subtitleOverlayVisible ? 'eye-off' : 'eye'));
        subtitleToggle.setAttribute('aria-pressed', String(settings.subtitleOverlayVisible));
        subtitleToggle.title = settings.subtitleOverlayVisible ? 'Hide subtitles' : 'Show subtitles';
        subtitleToggle.setAttribute('aria-label', subtitleToggle.title);
    }

    private syncLineNavigationButtons(hasLines: boolean): void {
        const panelOpen = Boolean(this.transcriptPanel && !this.transcriptPanel.hidden && !this.fullscreen);
        for (const action of ['previous', 'next'] as const) {
            const railButton = this.root?.querySelector<HTMLButtonElement>(`.jpdb-subtitle-rail [data-action="${action}"]`);
            if (railButton) {
                railButton.hidden = !hasLines || panelOpen;
                railButton.disabled = !this.video || !hasLines;
            }
            const panelButtons = Array.from(this.transcriptPanel?.querySelectorAll<HTMLButtonElement>(`.jpdb-subtitle-panel-nav [data-action="${action}"]`) ?? []);
            for (const button of panelButtons) {
                button.hidden = !hasLines;
                button.disabled = !this.video || !hasLines;
            }
        }
    }

    private syncPanelButton(hasLines: boolean): void {
        const button = this.root?.querySelector<HTMLButtonElement>('[data-action="panel"]');
        if (!button) return;
        const panelOpen = Boolean(this.transcriptPanel && !this.transcriptPanel.hidden);
        const wantsTracks = this.preferredTranscriptDrawerMode() === 'tracks' && !hasLines;
        setInnerHtml(button, subtitleIcon(wantsTracks ? 'tracks' : 'transcript'));
        button.hidden = false;
        button.disabled = !this.video && !this.tracks.length && !hasLines;
        button.title = panelOpen ? 'Close subtitle drawer' : wantsTracks ? 'Choose subtitles' : 'Open subtitle drawer';
        button.setAttribute('aria-label', button.title);
        button.setAttribute('aria-pressed', String(panelOpen));
    }

    private syncPanelState(): void {
        const hasLines = Boolean(this.cues.length || this.currentCue?.text);
        if (this.transcriptPanel && !this.transcriptPanel.hidden) {
            this.transcriptPanel.classList.toggle('jpdb-subtitle-lines-panel', this.panelMode === 'lines');
            this.transcriptPanel.classList.toggle('jpdb-subtitle-tracks-panel', this.panelMode === 'tracks');
        }
        this.syncLineNavigationButtons(hasLines);
    }

    private syncTranscriptPlacementClass(): void {
        if (!this.root) return;
        this.root.classList.toggle('jpdb-subtitle-transcript-right', this.effectiveTranscriptPlacement === 'right');
        this.root.classList.toggle('jpdb-subtitle-transcript-left', this.effectiveTranscriptPlacement === 'left');
        this.root.classList.toggle('jpdb-subtitle-transcript-bottom', this.effectiveTranscriptPlacement === 'bottom');
        this.root.dataset.transcriptPlacement = this.effectiveTranscriptPlacement;
    }

    private shouldStayInTrackSetup(): boolean {
        return Boolean(this.transcriptPanel && !this.transcriptPanel.hidden && this.panelMode === 'tracks');
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
        if (!this.transcriptPanel.hidden) {
            this.closeTranscriptPanel();
            return;
        }
        if (this.preferredTranscriptDrawerMode() === 'tracks') this.openTracksPanel();
        else this.openLinesPanel();
    }

    private openLinesPanel(): void {
        if (!this.transcriptPanel || !this.hasTranscriptSurface()) return;
        this.panelMode = 'lines';
        this.transcriptPanel.hidden = false;
        this.options.getSettings().subtitleTranscriptVisible = true;
        this.options.onSettingsChange();
        if (this.menuEl) this.menuEl.hidden = true;
        this.renderTranscriptPanel(true);
        this.positionTranscriptPanel();
        this.syncControls();
    }

    private renderMenu(): void {
        if (!this.menuEl) return;
        const hasLines = Boolean(this.cues.length || this.currentCue?.text);
        const hasSecondary = Boolean(this.secondaryTrackId || this.secondaryCues.length || this.secondaryCue?.text);
        const signature = [
            hasLines,
            hasSecondary,
            this.options.getSettings().subtitleSecondaryVisible,
            this.transcriptPanel?.hidden,
            this.panelMode,
        ].join(':');
        if (!this.menuEl.hidden && this.lastMenuSignature === signature) return;
        this.lastMenuSignature = signature;
        const panelOpen = Boolean(this.transcriptPanel && !this.transcriptPanel.hidden);
        setInnerHtml(this.menuEl, `
            <div class="jpdb-subtitle-menu-head">
                <span>Options</span>
                <button class="jpdb-reader-icon-mini" type="button" data-action="menu" title="Close subtitle options" aria-label="Close subtitle options">${closeIcon()}</button>
            </div>
            <button type="button" data-action="load">Load Japanese subtitles</button>
            <button type="button" data-action="load-secondary">Load native subtitles</button>
            ${(hasLines || this.tracks.length) ? `<button type="button" data-action="panel">${panelOpen ? 'Close subtitle drawer' : 'Open subtitle drawer'}</button>` : ''}
            ${hasLines ? `<button type="button" data-action="copy">Copy current line</button>` : ''}
            ${hasSecondary ? `<button type="button" data-action="toggle-secondary" aria-pressed="${this.options.getSettings().subtitleSecondaryVisible}">${this.options.getSettings().subtitleSecondaryVisible ? 'Native subtitles on' : 'Native subtitles off'}</button>` : ''}
        `);
    }

    private toggleMenu(): void {
        if (!this.menuEl) return;
        this.lastMenuSignature = '';
        this.renderMenu();
        this.menuEl.hidden = !this.menuEl.hidden;
        if (!this.menuEl.hidden && this.transcriptPanel) this.transcriptPanel.hidden = true;
        this.root?.classList.toggle('jpdb-subtitle-menu-open', !this.menuEl.hidden);
        this.root?.classList.toggle('jpdb-subtitle-panel-open', Boolean(this.transcriptPanel && !this.transcriptPanel.hidden));
    }

    private toggleSubtitles(): void {
        const settings = this.options.getSettings();
        settings.subtitleOverlayVisible = !settings.subtitleOverlayVisible;
        this.options.onSettingsChange();
        this.setNativeTrackModes();
        this.refresh();
        log.info('Subtitle overlay toggled', { visible: settings.subtitleOverlayVisible });
    }

    private toggleSecondarySubtitles(): void {
        const settings = this.options.getSettings();
        settings.subtitleSecondaryVisible = !settings.subtitleSecondaryVisible;
        if (!settings.subtitleSecondaryVisible) this.secondaryCue = undefined;
        this.options.onSettingsChange();
        this.render();
        log.info('Secondary subtitles toggled', { visible: settings.subtitleSecondaryVisible });
    }

    private toggleNativeSubtitleBlur(): void {
        const settings = this.options.getSettings();
        settings.subtitleNativeBlurred = !settings.subtitleNativeBlurred;
        this.options.onSettingsChange();
        this.render();
        log.info('Native subtitle blur toggled', { blurred: settings.subtitleNativeBlurred });
    }

    private toggleTranscriptPanel(): void {
        if (!this.transcriptPanel) return;
        if (!this.cues.length && !this.currentCue?.text) {
            this.toggleTrackPanel();
            return;
        }
        const shouldOpen = this.transcriptPanel.hidden || this.panelMode !== 'lines';
        this.panelMode = 'lines';
        this.transcriptPanel.hidden = !shouldOpen;
        this.options.getSettings().subtitleTranscriptVisible = shouldOpen;
        this.options.onSettingsChange();
        if (!this.transcriptPanel.hidden && this.menuEl) this.menuEl.hidden = true;
        this.renderTranscriptPanel(true);
        this.positionTranscriptPanel();
        this.syncPanelState();
    }

    private openTracksPanel(): void {
        if (!this.transcriptPanel) return;
        this.panelMode = 'tracks';
        this.transcriptPanel.hidden = false;
        this.options.getSettings().subtitleTranscriptVisible = false;
        this.options.onSettingsChange();
        if (this.menuEl) this.menuEl.hidden = true;
        this.renderTrackPanel();
        this.positionTranscriptPanel();
        this.syncPanelState();
    }

    private closeTranscriptPanel(): void {
        if (!this.transcriptPanel) return;
        this.transcriptPanel.hidden = true;
        this.options.getSettings().subtitleTranscriptVisible = false;
        this.options.onSettingsChange();
        this.positionTranscriptPanel();
        this.syncControls();
    }

    private toggleTrackPanel(): void {
        if (!this.transcriptPanel) return;
        if (!this.transcriptPanel.hidden && this.panelMode === 'tracks') {
            this.closeTranscriptPanel();
            return;
        }
        this.openTracksPanel();
    }

    private renderTranscriptPanel(force = false): void {
        if (!this.transcriptPanel || this.transcriptPanel.hidden || this.panelMode !== 'lines') return;
        const rows = (this.cues.length ? this.cues : this.currentCue ? [this.currentCue] : [])
            .filter(cue => cue.transcriptEligible !== false);
        const currentIndex = this.cues.length ? this.activeTranscriptIndex() : rows.length ? 0 : -1;
        const signature = [
            rows.length,
            currentIndex,
            this.selectedTrackId,
            this.tracks.find(track => track.id === this.selectedTrackId)?.loadingState ?? '',
        ].join(':');
        if (!force && this.lastTranscriptSignature === signature) {
            this.updateTranscriptActiveLine(currentIndex);
            return;
        }
        this.lastTranscriptSignature = signature;
        setInnerHtml(this.transcriptPanel, `
            <div class="jpdb-subtitle-drawer-head">
                <div class="jpdb-subtitle-drawer-brand">
                    <strong class="jpdb-subtitle-drawer-title">Subtitles</strong>
                    <span class="jpdb-subtitle-drawer-meta">${escapeHtml(this.drawerMetaText('lines', rows.length))}</span>
                </div>
                <div class="jpdb-subtitle-drawer-actions">
                    ${renderPanelModeControls('lines', this.hasTranscriptSurface())}
                    ${renderPanelNavigationControls(Boolean(this.video && rows.length))}
                    <button class="jpdb-subtitle-drawer-close" type="button" data-action="close-panel" title="Close subtitle drawer" aria-label="Close subtitle drawer">${closeIcon()}</button>
                </div>
            </div>
            <div class="jpdb-subtitle-list-scroll">
                ${rows.length
                    ? rows.map((cue, index) => this.renderTranscriptRow(cue, index, this.cues.length ? currentIndex : 0)).join('')
                    : this.renderTranscriptWaitingState()}
            </div>
            <button class="jpdb-subtitle-resize" type="button" data-resize-transcript aria-label="Resize transcript panel"></button>
        `);
        this.bindTranscriptResizeHandle();
        this.positionTranscriptPanel();
        this.scrollTranscriptToActive();
        this.syncPanelState();
    }

    private renderTranscriptRow(cue: SubtitleCue, index: number, currentIndex: number): string {
        return `
            <div class="jpdb-subtitle-list-row ${index === currentIndex ? 'active' : ''}" data-action="cue" data-index="${index}" data-row-index="${index}">
                <div class="jpdb-subtitle-row-body">
                    <strong class="jpdb-subtitle-row-text" lang="ja" data-transcript-text data-row-index="${index}">${escapeWithBreaks(cue.text)}</strong>
                </div>
                <div class="jpdb-subtitle-row-tools">
                    <button class="jpdb-subtitle-row-copy" type="button" data-action="copy-row" data-index="${index}" title="Copy subtitle line" aria-label="Copy subtitle line">${subtitleIcon('copy')}</button>
                    <span class="jpdb-subtitle-row-time">${formatSubtitleTime(cue.start)}</span>
                </div>
            </div>
        `;
    }

    private renderTranscriptWaitingState(): string {
        const selected = this.tracks.find(track => track.id === this.selectedTrackId);
        const label = selected?.label ? ` for ${escapeHtml(selected.label)}` : '';
        const status = selected?.loadingState === 'loading' ? 'Loading subtitle lines' : 'Waiting for caption lines';
        return `<div class="jpdb-subtitle-list-empty">${status}${label}. The current line will appear here as soon as captions are available.</div>`;
    }

    private updateTranscriptActiveLine(currentIndex: number): void {
        if (!this.transcriptPanel || this.transcriptPanel.hidden || this.panelMode !== 'lines') return;
        this.transcriptPanel.querySelectorAll<HTMLElement>('.jpdb-subtitle-list-row.active')
            .forEach(row => row.classList.remove('active'));
        const active = this.transcriptPanel.querySelector<HTMLElement>(`.jpdb-subtitle-list-row[data-row-index="${currentIndex}"]`);
        if (active) active.classList.add('active');
        this.scrollTranscriptToActive();
    }

    private scrollTranscriptToActive(): void {
        if (!this.options.getSettings().subtitleTranscriptAutoScroll || !this.transcriptPanel || this.transcriptPanel.hidden) return;
        if (this.transcriptScrollFrame) cancelAnimationFrame(this.transcriptScrollFrame);
        this.transcriptScrollFrame = requestAnimationFrame(() => {
            this.transcriptScrollFrame = undefined;
            const active = this.transcriptPanel?.querySelector<HTMLElement>('.jpdb-subtitle-list-row.active');
            active?.scrollIntoView({ block: 'center', inline: 'nearest' });
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
            if (placement === 'bottom') {
                const nextHeight = clampNumber(startHeight + startY - moveEvent.clientY, 220, Math.max(220, window.innerHeight - TRANSCRIPT_PANEL_MARGIN * 3));
                this.transcriptPanelSize.bottomHeight = Math.round(nextHeight);
            } else {
                const nextWidth = clampNumber(startWidth + startX - moveEvent.clientX, 340, Math.max(340, window.innerWidth - TRANSCRIPT_PANEL_MARGIN * 3));
                this.transcriptPanelSize.sideWidth = Math.round(nextWidth);
            }
            this.positionTranscriptPanel();
        };

        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            saveTranscriptPanelSize(this.transcriptPanelSize);
            this.positionTranscriptPanel();
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
    }

    private scheduleTranscriptHydration(preferredIndex = this.activeTranscriptIndex()): void {
        if (this.transcriptHydrateFrame) return;
        this.transcriptHydrateFrame = requestAnimationFrame(() => {
            this.transcriptHydrateFrame = undefined;
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

    private async hydrateTranscriptRows(preferredIndex: number): Promise<void> {
        if (!this.transcriptPanel || this.transcriptPanel.hidden || this.panelMode !== 'lines') return;
        const settings = this.options.getSettings();
        if (!settings.apiKey && !settings.localDictionariesEnabled) return;
        const serial = ++this.transcriptHydrationSerial;
        const indexes = this.transcriptHydrationIndexes(preferredIndex);
        for (const index of indexes) {
            if (serial !== this.transcriptHydrationSerial) return;
            await this.hydrateTranscriptRow(index, settings);
        }
    }

    private transcriptHydrationIndexes(preferredIndex: number): number[] {
        const indexes = new Set<number>();
        if (preferredIndex >= 0) {
            for (let index = preferredIndex - 4; index <= preferredIndex + 4; index++) {
                if (index >= 0 && index < this.cues.length) indexes.add(index);
            }
        } else {
            for (let index = 0; index < Math.min(10, this.cues.length); index++) indexes.add(index);
        }

        const scroller = this.transcriptPanel?.querySelector<HTMLElement>('.jpdb-subtitle-list-scroll');
        const scrollerRect = scroller?.getBoundingClientRect();
        if (scroller && scrollerRect) {
            for (const row of Array.from(scroller.querySelectorAll<HTMLElement>('.jpdb-subtitle-list-row'))) {
                const rect = row.getBoundingClientRect();
                if (rect.bottom < scrollerRect.top || rect.top > scrollerRect.bottom) continue;
                const index = Number(row.dataset.rowIndex);
                if (Number.isInteger(index)) indexes.add(index);
                if (indexes.size >= 18) break;
            }
        }

        for (let count = 0; count < TRANSCRIPT_BACKGROUND_HYDRATION_BATCH && this.cues.length; count++) {
            const index = this.transcriptHydrationCursor % this.cues.length;
            this.transcriptHydrationCursor = (this.transcriptHydrationCursor + 1) % this.cues.length;
            indexes.add(index);
        }

        return [...indexes].sort((a, b) => a - b);
    }

    private async hydrateTranscriptRow(index: number, settings: ReaderSettings): Promise<void> {
        const cue = this.cues[index];
        const target = this.transcriptPanel?.querySelector<HTMLElement>(`.jpdb-subtitle-row-text[data-row-index="${index}"]`);
        if (!cue || !target) return;
        const key = this.parseCacheKey(cue.text, settings);
        if (target.dataset.parsedKey === key) return;

        const cached = this.parsedHtmlCache.get(key);
        if (cached) {
            target.dataset.parsedKey = key;
            setInnerHtml(target, cached);
            return;
        }

        try {
            const html = await this.parseCueHtml(cue.text, settings);
            const currentTarget = this.transcriptPanel?.querySelector<HTMLElement>(`.jpdb-subtitle-row-text[data-row-index="${index}"]`);
            if (currentTarget?.textContent?.replace(/\s+/g, ' ').trim() === cue.text.replace(/\s+/g, ' ').trim()) {
                currentTarget.dataset.parsedKey = key;
                setInnerHtml(currentTarget, html);
            }
        } catch (error) {
            target.dataset.parsedKey = key;
            log.debug('Transcript row parse failed quietly', { index, length: cue.text.length }, error);
        }
    }

    private renderTrackPanel(): void {
        if (!this.transcriptPanel || this.transcriptPanel.hidden || this.panelMode !== 'tracks') return;
        const tracks = [...this.tracks].sort(compareSubtitleTrackOptions);
        const autoDetected = tracks.filter(track => track.kind === 'youtube' || track.kind === 'native' || track.kind === 'remote').length;
        setInnerHtml(this.transcriptPanel, `
            <div class="jpdb-subtitle-drawer-head">
                <div class="jpdb-subtitle-drawer-brand">
                    <strong class="jpdb-subtitle-drawer-title">Subtitles</strong>
                    <span class="jpdb-subtitle-drawer-meta">${escapeHtml(this.drawerMetaText('tracks', tracks.length))}</span>
                </div>
                <div class="jpdb-subtitle-drawer-actions">
                    ${renderPanelModeControls('tracks', this.hasTranscriptSurface())}
                    ${this.video && this.cues.length ? renderPanelNavigationControls(true) : ''}
                    <button class="jpdb-subtitle-drawer-close" type="button" data-action="close-panel" title="Close subtitle drawer" aria-label="Close subtitle drawer">${closeIcon()}</button>
                </div>
            </div>
            <div class="jpdb-subtitle-list-scroll">
                <div class="jpdb-subtitle-track-tools">
                    <button type="button" data-action="load">Load Japanese subtitles</button>
                    <button type="button" data-action="load-secondary">Load native subtitles</button>
                </div>
                <div class="jpdb-subtitle-track-summary">${autoDetected ? `${autoDetected} auto-detected option${autoDetected === 1 ? '' : 's'}` : 'Auto-detected YouTube/native tracks will appear here.'}</div>
                ${tracks.length ? tracks.map(track => {
                    const isPrimary = track.id === this.selectedTrackId;
                    const isSecondary = track.id === this.secondaryTrackId;
                    return `
                    <div class="jpdb-subtitle-track-row ${track.id === this.selectedTrackId || track.id === this.secondaryTrackId ? 'active' : ''}" data-track-id="${escapeHtml(track.id)}">
                        <div class="jpdb-subtitle-track-title">
                            <strong>${escapeHtml(track.label)}</strong>
                            <span>${escapeHtml(formatTrackKind(track.kind))}</span>
                        </div>
                        <span>${escapeHtml(track.language ? track.language.toUpperCase() : 'Detected')}${isPrimary ? ' · Japanese overlay' : ''}${isSecondary ? ' · native overlay' : ''}${trackStatusText(track)}</span>
                        <div class="jpdb-subtitle-track-actions">
                            <button type="button" data-action="primary-track" aria-pressed="${isPrimary}">${isPrimary ? 'Unset Japanese' : 'Japanese'}</button>
                            <button type="button" data-action="secondary-track" aria-pressed="${isSecondary}">${isSecondary ? 'Unset native' : 'Native'}</button>
                        </div>
                    </div>
                `;
                }).join('') : '<div class="jpdb-subtitle-list-empty">No auto-detected subtitle tracks yet. Load a file, open YouTube captions once, or play the video for a moment.</div>'}
            </div>
            <button class="jpdb-subtitle-resize" type="button" data-resize-transcript aria-label="Resize subtitle tracks panel"></button>
        `);
        this.bindTranscriptResizeHandle();
        this.syncPanelState();
    }

    private drawerMetaText(mode: 'lines' | 'tracks', count: number): string {
        const primary = this.tracks.find(track => track.id === this.selectedTrackId)?.label;
        const secondary = this.tracks.find(track => track.id === this.secondaryTrackId)?.label;
        if (mode === 'tracks') {
            return [
                `${count} option${count === 1 ? '' : 's'}`,
                primary ? `Japanese: ${primary}` : 'Choose Japanese subtitles',
                secondary ? `Native: ${secondary}` : '',
            ].filter(Boolean).join(' · ');
        }
        return [
            primary || 'Transcript',
            `${count} line${count === 1 ? '' : 's'}`,
            secondary ? `Native: ${secondary}` : '',
        ].filter(Boolean).join(' · ');
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
        this.invalidateTrackSelection('primary');
        this.selectedTrackId = '';
        this.cues = [];
        this.currentCue = undefined;
        this.lastDomCaption = '';
        this.pendingDomCaption = undefined;
        this.youtubeDomCaptionFallbackTrackId = '';
        this.lastRenderedPrimaryText = '';
        this.lastRenderedPrimaryHtml = '';
        for (const track of this.tracks) {
            if (track.loadingState && track.id !== this.secondaryTrackId) track.loadingState = 'idle';
        }
        this.setNativeTrackModes();
        this.render();
        if (this.transcriptPanel && !this.transcriptPanel.hidden) {
            this.panelMode = 'tracks';
            this.renderTrackPanel();
        }
        this.syncControls();
        log.info('Primary subtitle track cleared');
    }

    private suppressYouTubeAutoSelectForCurrentVideo(): void {
        if (!isYouTubePage()) return;
        this.youtubeAutoSelectSuppressedVideoId = this.youtubeVideoId || getYouTubeVideoId();
    }

    private clearSecondaryTrack(): void {
        this.invalidateTrackSelection('secondary');
        this.secondaryTrackId = '';
        this.secondaryCues = [];
        this.secondaryCue = undefined;
        for (const track of this.tracks) {
            if (track.loadingState && track.id !== this.selectedTrackId) track.loadingState = 'idle';
        }
        this.setNativeTrackModes();
        this.render();
        if (this.transcriptPanel && !this.transcriptPanel.hidden) {
            if (this.panelMode === 'lines') this.renderTranscriptPanel(true);
            else this.renderTrackPanel();
        }
        this.syncControls();
        log.info('Secondary subtitle track cleared');
    }

    private positionTranscriptPanel(): void {
        if (this.fullscreen) {
            this.clearVideoInsetForTranscriptPanel();
            return;
        }
        if (!this.transcriptPanel || this.transcriptPanel.hidden) {
            this.clearVideoInsetForTranscriptPanel();
            return;
        }
        const panel = this.transcriptPanel;
        const viewportWidth = Math.max(320, window.innerWidth);
        const viewportHeight = Math.max(240, window.innerHeight);
        const layout = computeSubtitleDrawerLayout({
            viewportWidth,
            viewportHeight,
            anchorTop: this.transcriptAnchorRect().top,
            compactPanel: shouldUseCompactSubtitleDrawer(viewportWidth),
            size: this.transcriptPanelSize,
        });
        applyTranscriptPanelLayout(panel, layout);
        this.effectiveTranscriptPlacement = layout.placement;
        this.syncTranscriptPlacementClass();
        this.clearVideoInsetForTranscriptPanel();
    }

    private syncFullscreenState(): void {
        this.fullscreen = Boolean(document.fullscreenElement);
        document.documentElement.classList.toggle('jpdb-subtitle-fullscreen', this.fullscreen);
        this.root?.classList.toggle('jpdb-subtitle-fullscreen', this.fullscreen);
        if (this.fullscreen) this.clearVideoInsetForTranscriptPanel();
    }

    private scheduleAlignToVideo(): void {
        if (this.alignFrame) cancelAnimationFrame(this.alignFrame);
        this.alignFrame = requestAnimationFrame(() => {
            this.alignFrame = undefined;
            this.alignToVideo();
        });
    }

    private videoLayoutRect(): DOMRect {
        if (isYouTubePage()) {
            const rect = youtubeVisiblePlayerRect();
            if (rect) return rect;
        }
        return this.video?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    }

    private transcriptAnchorRect(): DOMRect {
        if (isYouTubePage()) return this.videoLayoutRect();
        if (isCijVideoPage()) return this.videoLayoutRect();
        if (!this.video) return this.videoLayoutRect();
        return transcriptAvoidanceTarget(this.video).getBoundingClientRect();
    }

    private clearVideoInsetForTranscriptPanel(): void {
        if (!this.lastInsetSignature
            && !document.documentElement.classList.contains('jpdb-subtitle-video-inset-left')
            && !document.documentElement.classList.contains('jpdb-subtitle-video-inset-right')
            && !document.documentElement.classList.contains('jpdb-subtitle-video-inset-bottom')) return;
        this.lastInsetSignature = '';
        document.documentElement.classList.remove('jpdb-subtitle-video-inset-left', 'jpdb-subtitle-video-inset-right', 'jpdb-subtitle-video-inset-bottom');
        document.documentElement.style.removeProperty('--jpdb-subtitle-video-inset');
        const watchFlexy = document.querySelector<HTMLElement>('ytd-watch-flexy');
        watchFlexy?.style.removeProperty('--ytd-watch-flexy-player-width');
        watchFlexy?.style.removeProperty('--ytd-watch-flexy-player-height');
        watchFlexy?.style.removeProperty('--ytd-watch-flexy-min-player-height');
        for (const element of youtubePlayerContainers()) clearYouTubePlayerContainerInset(element);
        if (this.video) clearGenericVideoInset(this.video);
    }

    private applyPageVideoInset(side: 'left' | 'right' | 'bottom', playerSize: number): void {
        if (this.fullscreen) {
            this.clearVideoInsetForTranscriptPanel();
            return;
        }
        const panelRect = this.transcriptPanel?.getBoundingClientRect();
        const insetPixels = Math.max(0, Math.round((side === 'bottom' ? panelRect?.height : panelRect?.width) ?? 0) + TRANSCRIPT_PANEL_MARGIN);
        const inset = `${insetPixels}px`;
        const videoRect = this.videoLayoutRect();
        const width = side === 'bottom'
            ? Math.max(320, Math.round(videoRect?.width ?? 0))
            : Math.max(320, Math.round(playerSize));
        const aspect = this.video && this.video.videoWidth && this.video.videoHeight
            ? this.video.videoHeight / this.video.videoWidth
            : this.video ? this.video.getBoundingClientRect().height / Math.max(1, this.video.getBoundingClientRect().width) : 9 / 16;
        const height = side === 'bottom'
            ? Math.max(180, Math.round(playerSize))
            : Number.isFinite(aspect) && aspect > 0 ? Math.round(width * aspect) : 0;
        const signature = `${side}:${inset}:${width}:${height}`;
        if (signature === this.lastInsetSignature) return;
        this.lastInsetSignature = signature;
        document.documentElement.classList.toggle('jpdb-subtitle-video-inset-left', side === 'left');
        document.documentElement.classList.toggle('jpdb-subtitle-video-inset-right', side === 'right');
        document.documentElement.classList.toggle('jpdb-subtitle-video-inset-bottom', side === 'bottom');
        document.documentElement.style.setProperty('--jpdb-subtitle-video-inset', inset);
        const watchFlexy = document.querySelector<HTMLElement>('ytd-watch-flexy');
        if (side !== 'bottom') watchFlexy?.style.setProperty('--ytd-watch-flexy-player-width', `${width}px`);
        if (height) watchFlexy?.style.setProperty('--ytd-watch-flexy-player-height', `${height}px`);
        if (side === 'bottom' && height) watchFlexy?.style.setProperty('--ytd-watch-flexy-min-player-height', `${height}px`);
        if (side !== 'bottom') {
            for (const element of youtubePlayerContainers()) applyYouTubePlayerContainerInset(element, side, width, insetPixels);
        } else {
            for (const element of youtubePlayerContainers()) applyYouTubePlayerContainerInset(element, side, width, insetPixels, height);
        }
        if (!isYouTubePage() && this.video) applyGenericVideoInset(this.video, side, side === 'bottom' ? height : width);
        requestYouTubePlayerResize(width, height);
    }
}

export interface TranscriptPanelLayoutOptions {
    placement: ReaderSettings['subtitleTranscriptPlacement'];
    videoRect?: DOMRect;
    viewportWidth: number;
    viewportHeight: number;
    compactPanel: boolean;
    allowVideoInset?: boolean;
}

export interface TranscriptPanelLayout {
    placement: ReaderSettings['subtitleTranscriptPlacement'];
    left: number;
    top: number;
    width: number;
    height: number;
    viewportWidth: number;
    viewportHeight: number;
    margin: number;
    maxWidth?: number;
}

const TRANSCRIPT_PANEL_MARGIN = 10;
const TRANSCRIPT_PANEL_SIZE_KEY = 'jpdb-reader-transcript-panel-size';
const TRANSCRIPT_PANEL_MAX_SIDE_RATIO = 0.46;
const TRANSCRIPT_PANEL_MIN_SIDE_WIDTH = 300;
const TRANSCRIPT_PANEL_DEFAULT_SIDE_WIDTH = 400;
const TRANSCRIPT_PANEL_MIN_VIDEO_WIDTH = 500;

export interface TranscriptPanelSize {
    sideWidth?: number;
    bottomHeight?: number;
}

export interface SubtitleDrawerLayoutOptions {
    viewportWidth: number;
    viewportHeight: number;
    anchorTop?: number;
    compactPanel: boolean;
    size?: TranscriptPanelSize;
}

export function computeSubtitleDrawerLayout(options: SubtitleDrawerLayoutOptions): TranscriptPanelLayout {
    const margin = TRANSCRIPT_PANEL_MARGIN;
    const size = options.size ?? {};
    if (options.compactPanel) {
        const height = clampNumber(
            size.bottomHeight ?? Math.min(420, options.viewportHeight * 0.46),
            220,
            Math.max(220, options.viewportHeight - margin * 3),
        );
        return {
            placement: 'bottom',
            left: margin,
            top: Math.max(margin, options.viewportHeight - height - margin),
            width: options.viewportWidth - margin * 2,
            height,
            viewportWidth: options.viewportWidth,
            viewportHeight: options.viewportHeight,
            margin,
        };
    }

    const top = clampNumber(options.anchorTop ?? 72, margin, Math.max(margin, options.viewportHeight - 280));
    const width = clampNumber(
        size.sideWidth ?? Math.min(460, options.viewportWidth * 0.32),
        340,
        Math.max(340, options.viewportWidth - margin * 3),
    );
    return {
        placement: 'right',
        left: Math.max(margin, options.viewportWidth - width - margin),
        top,
        width,
        height: Math.max(260, options.viewportHeight - top - margin),
        viewportWidth: options.viewportWidth,
        viewportHeight: options.viewportHeight,
        margin,
        maxWidth: Math.max(340, options.viewportWidth - margin * 3),
    };
}

export function computeTranscriptPanelLayout(options: TranscriptPanelLayoutOptions): TranscriptPanelLayout {
    const margin = TRANSCRIPT_PANEL_MARGIN;
    const videoRect = usableVideoRect(options.videoRect) ? options.videoRect : undefined;
    if (options.compactPanel) return compactTranscriptPanelLayout(options.viewportWidth, options.viewportHeight, margin);
    if (videoRect) {
        return videoAnchoredTranscriptLayout(options.placement, videoRect, options.viewportWidth, options.viewportHeight, margin, options.allowVideoInset ?? true);
    }
    return viewportTranscriptPanelLayout(options.placement, options.viewportWidth, options.viewportHeight, margin);
}

function shouldUseCompactTranscriptPanel(placement: ReaderSettings['subtitleTranscriptPlacement'], viewportWidth: number): boolean {
    void placement;
    return viewportWidth < 520;
}

function shouldUseCompactSubtitleDrawer(viewportWidth: number): boolean {
    return viewportWidth < 900 || Boolean(window.matchMedia?.('(pointer: coarse)').matches);
}

function compactTranscriptPanelLayout(viewportWidth: number, viewportHeight: number, margin: number): TranscriptPanelLayout {
    const top = Math.max(margin, viewportHeight - Math.min(390, viewportHeight * 0.48) - margin);
    return {
        placement: 'bottom',
        left: margin,
        top,
        width: viewportWidth - margin * 2,
        height: viewportHeight - top - margin,
        viewportWidth,
        viewportHeight,
        margin,
    };
}

function videoAnchoredTranscriptLayout(
    placement: ReaderSettings['subtitleTranscriptPlacement'],
    videoRect: DOMRect,
    viewportWidth: number,
    viewportHeight: number,
    margin: number,
    allowVideoInset: boolean,
): TranscriptPanelLayout {
    const availableRight = viewportWidth - videoRect.right - margin * 2;
    const availableLeft = videoRect.left - margin * 2;
    const availableBottom = viewportHeight - videoRect.bottom - margin * 2;
    const effectivePlacement = placement;
    const sideMaxWidth = Math.floor(viewportWidth - margin * 3 - TRANSCRIPT_PANEL_MIN_VIDEO_WIDTH);
    const canFitSidePanel = allowVideoInset && sideMaxWidth >= TRANSCRIPT_PANEL_MIN_SIDE_WIDTH;
    const rightFits = availableRight >= TRANSCRIPT_PANEL_MIN_SIDE_WIDTH;
    const leftFits = availableLeft >= TRANSCRIPT_PANEL_MIN_SIDE_WIDTH;
    const bottomFits = availableBottom >= 120;

    if (effectivePlacement === 'right' && (rightFits || canFitSidePanel)) {
        return rightTranscriptPanelLayout(videoRect, viewportWidth, viewportHeight, margin, availableRight, sideMaxWidth, allowVideoInset);
    }
    if (effectivePlacement === 'left' && (leftFits || canFitSidePanel)) {
        return leftTranscriptPanelLayout(videoRect, viewportWidth, viewportHeight, margin, availableLeft, sideMaxWidth, allowVideoInset);
    }
    if (effectivePlacement === 'bottom' && (bottomFits || allowVideoInset)) {
        return bottomTranscriptPanelLayout(videoRect, viewportWidth, viewportHeight, margin, allowVideoInset);
    }
    if (!allowVideoInset && !bottomFits) {
        if (rightFits) return rightTranscriptPanelLayout(videoRect, viewportWidth, viewportHeight, margin, availableRight, sideMaxWidth, allowVideoInset);
        if (leftFits) return leftTranscriptPanelLayout(videoRect, viewportWidth, viewportHeight, margin, availableLeft, sideMaxWidth, allowVideoInset);
    }
    return bottomTranscriptPanelLayout(videoRect, viewportWidth, viewportHeight, margin, allowVideoInset);
}

function rightTranscriptPanelLayout(videoRect: DOMRect, viewportWidth: number, viewportHeight: number, margin: number, availableRight: number, sideMaxWidth: number, allowVideoInset = true): TranscriptPanelLayout {
    const maxAvailableWidth = allowVideoInset ? sideMaxWidth : availableRight;
    const maxWidth = Math.max(TRANSCRIPT_PANEL_MIN_SIDE_WIDTH, Math.min(viewportWidth - margin * 2, maxAvailableWidth));
    const width = clampNumber(
        availableRight >= TRANSCRIPT_PANEL_MIN_SIDE_WIDTH ? availableRight : TRANSCRIPT_PANEL_DEFAULT_SIDE_WIDTH,
        TRANSCRIPT_PANEL_MIN_SIDE_WIDTH,
        maxWidth,
    );
    if (availableRight < TRANSCRIPT_PANEL_MIN_SIDE_WIDTH) {
        const top = Math.max(margin, videoRect.top);
        return { placement: 'right', left: Math.max(margin, viewportWidth - width - margin), top, width, height: viewportHeight - top - margin, viewportWidth, viewportHeight, margin, maxWidth };
    }
    const top = Math.max(margin, videoRect.top);
    return { placement: 'right', left: videoRect.right + margin, top, width, height: viewportHeight - top - margin, viewportWidth, viewportHeight, margin, maxWidth };
}

function leftTranscriptPanelLayout(videoRect: DOMRect, viewportWidth: number, viewportHeight: number, margin: number, availableLeft: number, sideMaxWidth: number, allowVideoInset = true): TranscriptPanelLayout {
    const top = Math.max(margin, videoRect.top);
    const maxAvailableWidth = allowVideoInset ? sideMaxWidth : availableLeft;
    const maxWidth = Math.max(TRANSCRIPT_PANEL_MIN_SIDE_WIDTH, Math.min(viewportWidth - margin * 2, maxAvailableWidth));
    const width = clampNumber(
        availableLeft >= TRANSCRIPT_PANEL_MIN_SIDE_WIDTH ? availableLeft : TRANSCRIPT_PANEL_DEFAULT_SIDE_WIDTH,
        TRANSCRIPT_PANEL_MIN_SIDE_WIDTH,
        maxWidth,
    );
    const fallback = { placement: 'left' as const, left: margin, top, width, height: viewportHeight - top - margin, viewportWidth, viewportHeight, margin, maxWidth };
    if (availableLeft < TRANSCRIPT_PANEL_MIN_SIDE_WIDTH) return fallback;
    return { ...fallback, left: Math.max(margin, videoRect.left - width - margin) };
}

function bottomTranscriptPanelLayout(videoRect: DOMRect, viewportWidth: number, viewportHeight: number, margin: number, allowVideoInset = true): TranscriptPanelLayout {
    const width = Math.min(Math.max(320, videoRect.width), viewportWidth - margin * 2);
    const left = Math.max(margin, Math.min(videoRect.left, viewportWidth - width - margin));
    const preferredTop = videoRect.bottom + margin;
    const preferredHeight = Math.min(360, Math.max(150, viewportHeight * 0.36));
    if (!allowVideoInset) {
        const top = Math.min(preferredTop, Math.max(margin, viewportHeight - 80 - margin));
        return { placement: 'bottom', left, top, width, height: Math.max(80, viewportHeight - top - margin), viewportWidth, viewportHeight, margin };
    }
    const top = Math.min(preferredTop, Math.max(margin, viewportHeight - preferredHeight - margin));
    const height = Math.max(80, viewportHeight - top - margin);
    return { placement: 'bottom', left, top, width, height, viewportWidth, viewportHeight, margin };
}

function viewportTranscriptPanelLayout(
    placement: ReaderSettings['subtitleTranscriptPlacement'],
    viewportWidth: number,
    viewportHeight: number,
    margin: number,
): TranscriptPanelLayout {
    const width = placement === 'bottom' ? viewportWidth - margin * 2 : Math.min(Math.max(360, viewportWidth * 0.32), viewportWidth - margin * 2);
    if (placement === 'bottom') {
        const top = Math.max(96, viewportHeight - Math.min(360, viewportHeight * 0.44) - margin);
        return { placement, left: margin, top, width, height: viewportHeight - top - margin, viewportWidth, viewportHeight, margin };
    }
    const top = 68;
    const left = placement === 'left' ? margin : Math.max(margin, viewportWidth - width - margin);
    return { placement, left, top, width, height: viewportHeight - top - margin, viewportWidth, viewportHeight, margin };
}

export function resizeTranscriptPanelLayout(layout: TranscriptPanelLayout, size: TranscriptPanelSize): TranscriptPanelLayout {
    const maxWidth = layout.viewportWidth - layout.margin * 2;
    if (layout.placement === 'bottom') {
        const maxHeight = Math.max(80, layout.viewportHeight - layout.margin * 2);
        const height = size.bottomHeight ? clampNumber(size.bottomHeight, 80, maxHeight) : layout.height;
        const top = size.bottomHeight ? Math.max(layout.margin, layout.viewportHeight - height - layout.margin) : layout.top;
        return { ...layout, top, height };
    }

    const maxSideWidth = Math.max(TRANSCRIPT_PANEL_MIN_SIDE_WIDTH, Math.min(
        maxWidth,
        layout.maxWidth ?? Math.round(layout.viewportWidth * TRANSCRIPT_PANEL_MAX_SIDE_RATIO),
    ));
    const width = size.sideWidth
        ? clampNumber(size.sideWidth, TRANSCRIPT_PANEL_MIN_SIDE_WIDTH, maxSideWidth)
        : Math.min(layout.width, maxSideWidth);
    if (layout.placement === 'right') {
        const right = Math.min(layout.viewportWidth - layout.margin, layout.left + layout.width);
        return { ...layout, left: Math.max(layout.margin, right - width), width };
    }
    const right = Math.min(layout.viewportWidth - layout.margin, layout.left + width);
    return { ...layout, left: Math.max(layout.margin, right - width), width };
}

function applyTranscriptPanelLayout(panel: HTMLElement, layout: TranscriptPanelLayout): void {
    setStylePropertyIfChanged(panel, 'left', `${Math.round(layout.left)}px`);
    setStylePropertyIfChanged(panel, 'top', `${Math.round(layout.top)}px`);
    setStylePropertyIfChanged(panel, 'right', 'auto');
    setStylePropertyIfChanged(panel, 'bottom', 'auto');
    setStylePropertyIfChanged(panel, 'width', `${Math.round(Math.max(260, Math.min(layout.width, layout.viewportWidth - layout.margin * 2)))}px`);
    const minHeight = layout.placement === 'bottom' ? 80 : 150;
    const height = `${Math.round(Math.max(minHeight, layout.height))}px`;
    setStylePropertyIfChanged(panel, 'height', height);
    setStylePropertyIfChanged(panel, 'max-height', height);
}

function renderPanelNavigationControls(enabled: boolean): string {
    return `
        <div class="jpdb-subtitle-panel-nav" aria-label="Subtitle navigation">
            <button type="button" data-action="previous" title="Previous subtitle" aria-label="Previous subtitle" ${enabled ? '' : 'disabled'}>‹</button>
            <button type="button" data-action="next" title="Next subtitle" aria-label="Next subtitle" ${enabled ? '' : 'disabled'}>›</button>
        </div>
    `;
}

function renderPanelModeControls(mode: 'lines' | 'tracks', canShowLines: boolean): string {
    return `
        <div class="jpdb-subtitle-panel-mode" aria-label="Subtitle panel mode">
            <button type="button" data-action="panel-lines" aria-pressed="${mode === 'lines'}" ${canShowLines ? '' : 'disabled'}>Lines</button>
            <button type="button" data-action="panel-tracks" aria-pressed="${mode === 'tracks'}">Tracks</button>
        </div>
    `;
}

function loadTranscriptPanelSize(): TranscriptPanelSize {
    try {
        const parsed = gmStorageGetSync<TranscriptPanelSize>(TRANSCRIPT_PANEL_SIZE_KEY, {});
        return {
            sideWidth: Number.isFinite(parsed.sideWidth) ? parsed.sideWidth : undefined,
            bottomHeight: Number.isFinite(parsed.bottomHeight) ? parsed.bottomHeight : undefined,
        };
    } catch {
        return {};
    }
}

function saveTranscriptPanelSize(size: TranscriptPanelSize): void {
    try {
        gmStorageSetSync(TRANSCRIPT_PANEL_SIZE_KEY, size);
    } catch {
        // Best-effort preference only.
    }
}

function applyElementLayout(element: HTMLElement, layout: { left: number; top: number; width: number; height: number }): void {
    setStylePropertyIfChanged(element, 'left', `${Math.round(layout.left)}px`);
    setStylePropertyIfChanged(element, 'top', `${Math.round(layout.top)}px`);
    setStylePropertyIfChanged(element, 'right', 'auto');
    setStylePropertyIfChanged(element, 'bottom', 'auto');
    setStylePropertyIfChanged(element, 'width', `${Math.round(layout.width)}px`);
    setStylePropertyIfChanged(element, 'height', `${Math.round(layout.height)}px`);
}

function setStylePropertyIfChanged(element: HTMLElement, property: string, value: string): void {
    if (element.style.getPropertyValue(property) === value) return;
    element.style.setProperty(property, value);
}

function youtubePlayerContainers(): HTMLElement[] {
    if (!isYouTubePage()) return [];
    return [
        document.querySelector<HTMLElement>('ytd-watch-flexy #primary'),
        document.querySelector<HTMLElement>('ytd-watch-flexy #primary-inner'),
    ].filter((element): element is HTMLElement => Boolean(element));
}

function applyYouTubePlayerContainerInset(element: HTMLElement, side: 'left' | 'right' | 'bottom', width: number, inset: number, height = 0): void {
    if (side === 'bottom') {
        if (height) {
            setStylePropertyIfChanged(element, 'height', `${height}px`);
            setStylePropertyIfChanged(element, 'max-height', `${height}px`);
            setStylePropertyIfChanged(element, 'min-height', '0px');
        }
        return;
    }
    const widthValue = `${width}px`;
    setStylePropertyIfChanged(element, 'width', widthValue);
    setStylePropertyIfChanged(element, 'max-width', widthValue);
    setStylePropertyIfChanged(element, 'min-width', '0px');
    const margin = side === 'left'
        ? `${Math.max(0, Math.round(inset - element.getBoundingClientRect().left))}px`
        : `${Math.max(0, Math.round(element.getBoundingClientRect().right - (window.innerWidth - inset)))}px`;
    setStylePropertyIfChanged(element, side === 'left' ? 'margin-left' : 'margin-right', margin);
    setStylePropertyIfChanged(element, side === 'left' ? 'margin-right' : 'margin-left', '0px');
}

function youtubeVisiblePlayerRect(): DOMRect | undefined {
    for (const selector of [
        '#movie_player',
        'ytd-watch-flexy #player-container-inner',
        'ytd-watch-flexy #player-container-outer',
        'ytd-watch-flexy #player',
    ]) {
        const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
        if (usableVideoRect(rect)) return rect;
    }
    return undefined;
}

function requestYouTubePlayerResize(width: number, height: number): void {
    if (!isYouTubePage()) return;
    const player = document.querySelector('#movie_player') as {
        setSize?: (width: number, height: number) => void;
    } | null;
    if (player?.setSize && width > 0 && height > 0) {
        try {
            player.setSize(Math.round(width), Math.round(height));
        } catch (error) {
            log.debug('YouTube player setSize failed quietly', error);
        }
    }
    window.dispatchEvent(new Event('resize'));
    window.setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
}

function clearYouTubePlayerContainerInset(element: HTMLElement): void {
    for (const property of ['width', 'max-width', 'min-width', 'height', 'max-height', 'min-height', 'margin-left', 'margin-right']) {
        if (element.style.getPropertyValue(property)) element.style.removeProperty(property);
    }
}

type GenericInsetProperty = 'width' | 'height' | 'maxWidth' | 'maxHeight' | 'minWidth' | 'minHeight' | 'marginLeft' | 'marginRight';

const genericVideoInsetStyles = new WeakMap<HTMLElement, Partial<Record<GenericInsetProperty, string>>>();
const genericVideoInsetTargets = new WeakMap<HTMLVideoElement, HTMLElement>();

function applyGenericVideoInset(video: HTMLVideoElement, side: 'left' | 'right' | 'bottom', size: number): void {
    const target = genericVideoLayoutTarget(video);
    const previousTarget = genericVideoInsetTargets.get(video);
    if (previousTarget && previousTarget !== target) clearGenericVideoInsetTarget(previousTarget);
    genericVideoInsetTargets.set(video, target);

    if (!genericVideoInsetStyles.has(target)) {
        genericVideoInsetStyles.set(target, {
            width: target.style.width,
            height: target.style.height,
            maxWidth: target.style.maxWidth,
            maxHeight: target.style.maxHeight,
            minWidth: target.style.minWidth,
            minHeight: target.style.minHeight,
            marginLeft: target.style.marginLeft,
            marginRight: target.style.marginRight,
        });
    }
    if (side === 'bottom') {
        setStylePropertyIfChanged(target, 'height', `${Math.round(size)}px`);
        setStylePropertyIfChanged(target, 'max-height', `${Math.round(size)}px`);
        setStylePropertyIfChanged(target, 'min-height', '0px');
        return;
    }
    const rect = target.getBoundingClientRect();
    const inset = Number.parseFloat(document.documentElement.style.getPropertyValue('--jpdb-subtitle-video-inset')) || 0;
    const margin = side === 'left'
        ? Math.max(0, Math.round(inset - rect.left))
        : Math.max(0, Math.round(rect.right - (window.innerWidth - inset)));
    setStylePropertyIfChanged(target, 'width', `${Math.round(size)}px`);
    setStylePropertyIfChanged(target, 'max-width', `${Math.round(size)}px`);
    setStylePropertyIfChanged(target, 'min-width', '0px');
    setStylePropertyIfChanged(target, side === 'left' ? 'margin-left' : 'margin-right', `${margin}px`);
    setStylePropertyIfChanged(target, side === 'left' ? 'margin-right' : 'margin-left', '0px');
}

function clearGenericVideoInset(video: HTMLVideoElement): void {
    const target = genericVideoInsetTargets.get(video) ?? genericVideoLayoutTarget(video);
    clearGenericVideoInsetTarget(target);
    genericVideoInsetTargets.delete(video);
}

function clearGenericVideoInsetTarget(target: HTMLElement): void {
    const previous = genericVideoInsetStyles.get(target);
    if (!previous) return;
    setRestoredStyleProperty(target, 'width', previous.width);
    setRestoredStyleProperty(target, 'height', previous.height);
    setRestoredStyleProperty(target, 'max-width', previous.maxWidth);
    setRestoredStyleProperty(target, 'max-height', previous.maxHeight);
    setRestoredStyleProperty(target, 'min-width', previous.minWidth);
    setRestoredStyleProperty(target, 'min-height', previous.minHeight);
    setRestoredStyleProperty(target, 'margin-left', previous.marginLeft);
    setRestoredStyleProperty(target, 'margin-right', previous.marginRight);
    genericVideoInsetStyles.delete(target);
}

function genericVideoLayoutTarget(video: HTMLVideoElement): HTMLElement {
    const parent = video.parentElement;
    if (!parent || parent === document.body || parent === document.documentElement) return video;
    const parentRect = parent.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    if (Math.abs(parentRect.width - videoRect.width) <= 3 && Math.abs(parentRect.height - videoRect.height) <= 3) return video;
    if (parentRect.width >= videoRect.width && parentRect.height >= videoRect.height) return parent;
    return video;
}

function transcriptAvoidanceTarget(video: HTMLVideoElement): HTMLElement {
    const videoRect = video.getBoundingClientRect();
    let best: HTMLElement = genericVideoLayoutTarget(video);
    for (let ancestor = video.parentElement; ancestor && ancestor !== document.body && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
        const rect = ancestor.getBoundingClientRect();
        if (!usableVideoRect(rect)) continue;
        if (!rectContainsRect(rect, videoRect, 2)) continue;
        if (rect.width > window.innerWidth * 0.92 || rect.height > window.innerHeight * 0.9) continue;
        const meaningfulExtraWidth = rect.width - videoRect.width >= 180;
        const meaningfulExtraHeight = rect.height - videoRect.height >= 80;
        if (!meaningfulExtraWidth && !meaningfulExtraHeight) continue;
        best = ancestor;
    }
    return best;
}

function rectContainsRect(container: DOMRect, child: DOMRect, tolerance = 0): boolean {
    return container.left <= child.left + tolerance
        && container.top <= child.top + tolerance
        && container.right >= child.right - tolerance
        && container.bottom >= child.bottom - tolerance;
}

function setRestoredStyleProperty(element: HTMLElement, property: string, value: string | undefined): void {
    if (value) {
        element.style.setProperty(property, value);
    } else {
        element.style.removeProperty(property);
    }
}

function disableYouTubeNativeCaptions(): void {
    if (!isYouTubePage()) return;
    const player = document.querySelector('#movie_player') as {
        unloadModule?: (name: string) => void;
        setOption?: (module: string, option: string, value: unknown) => void;
    } | null;
    try {
        player?.setOption?.('captions', 'track', {});
        player?.unloadModule?.('captions');
    } catch {
        // YouTube's player API is private and best-effort.
    }
}

function activateYouTubeCaptionTrack(track: SubtitleTrackOption): void {
    if (!isYouTubePage()) return;
    const player = document.querySelector('#movie_player') as {
        loadModule?: (name: string) => void;
        setOption?: (module: string, option: string, value: unknown) => void;
        getOption?: (module: string, option: string) => unknown;
        getAudioTrack?: () => { captionTracks?: unknown[] };
    } | null;
    if (!player?.setOption) return;
    try {
        player.loadModule?.('captions');
        const candidate = findMatchingYouTubePlayerTrack(track, player) ?? track.youtubeTrack;
        if (candidate) player.setOption('captions', 'track', candidate);
        player.setOption('captions', 'reload', true);
    } catch {
        // YouTube's player API is private and best-effort.
    }
}

function trackStatusText(track: SubtitleTrackOption): string {
    if (track.loadingState === 'loading') return ' · loading';
    if (track.loadingState === 'waiting') return ' · waiting for captions';
    if (track.loadingState === 'error') return ' · failed';
    return '';
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), Math.max(min, max));
}

function usableVideoRect(rect?: DOMRect): rect is DOMRect {
    return Boolean(rect && rect.width >= 120 && rect.height >= 80);
}

type SubtitleIconName = 'copy' | 'eye' | 'eye-off' | 'menu' | 'panel-bottom' | 'panel-left' | 'panel-right' | 'play' | 'tracks' | 'transcript';

function subtitleIcon(name: SubtitleIconName): string {
    const paths: Record<SubtitleIconName, string> = {
        copy: '<path d="M14 3H6a2 2 0 0 0-2 2v12"/><path d="M10 7h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><path d="M14 11v6"/><path d="M11 14h6"/>',
        eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
        'eye-off': '<path d="m3 3 18 18"/><path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-3.2 3.8"/><path d="M6.6 6.8A18 18 0 0 0 2 12s3.5 6 10 6c1.5 0 2.8-.3 4-.8"/>',
        menu: '<path d="M5 7h14"/><path d="M5 12h14"/><path d="M5 17h14"/>',
        'panel-bottom': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 14h16"/>',
        'panel-left': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M10 5v14"/>',
        'panel-right': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M14 5v14"/>',
        play: '<path d="M8 5v14l11-7-11-7Z"/>',
        tracks: '<path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h16"/>',
        transcript: '<path d="M5 4h14v16H5z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/>',
    };
    return `<svg class="jpdb-subtitle-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}

function closeIcon(): string {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
}

function formatTrackKind(kind: SubtitleTrackOption['kind']): string {
    if (kind === 'native') return 'page track';
    if (kind === 'remote') return 'page file';
    if (kind === 'youtube') return 'YouTube captions';
    return 'loaded file';
}

function compareSubtitleTrackOptions(a: SubtitleTrackOption, b: SubtitleTrackOption): number {
    return subtitleTrackRank(a) - subtitleTrackRank(b)
        || (a.language ?? '').localeCompare(b.language ?? '', undefined, { sensitivity: 'base' })
        || a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
}

function subtitleTrackRank(track: SubtitleTrackOption): number {
    if (track.kind === 'file') return 0;
    if (track.kind === 'remote' && isJapaneseSubtitleTrack(track) && !isAutoGeneratedSubtitleTrack(track)) return 1;
    if (isJapaneseSubtitleTrack(track) && !isAutoGeneratedSubtitleTrack(track)) return 1;
    if (isJapaneseSubtitleTrack(track)) return 2;
    if (isAutoGeneratedSubtitleTrack(track)) return 3;
    if (isEnglishSubtitleTrack(track)) return 4;
    if (track.kind === 'native') return 4;
    return 5;
}

function isAutoGeneratedSubtitleTrack(track: SubtitleTrackOption): boolean {
    return /asr|auto(?:matic)?|auto-generated|自動生成|自動字幕/i.test(`${track.label} ${track.language ?? ''}`);
}

function isEnglishSubtitleTrack(track: SubtitleTrackOption): boolean {
    return /(^|\b)(en|eng|english)(\b|$)/i.test(`${track.label} ${track.language ?? ''}`);
}

export function collectPageSubtitleSources(root: ParentNode = document): PageSubtitleSource[] {
    const sources: PageSubtitleSource[] = [];
    for (const track of Array.from(root.querySelectorAll<HTMLTrackElement>('track[src]'))) {
        if (track.kind && !/subtitles|captions/i.test(track.kind)) continue;
        const url = resolveSubtitleSourceUrl(track.src || track.getAttribute('src') || '');
        if (!url || !isSupportedSubtitleSourceUrl(url)) continue;
        const label = subtitleSourceLabel(track.label || track.srclang || track.getAttribute('aria-label') || '', url);
        sources.push({
            url,
            label,
            language: normalizeSubtitleLanguage(track.srclang || inferSubtitleLanguage(label, url)),
            sourceKey: pageSubtitleSourceKey('track', url),
        });
    }

    for (const link of Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
        const url = resolveSubtitleSourceUrl(link.href || link.getAttribute('href') || '');
        if (!url || !isSupportedSubtitleSourceUrl(url)) continue;
        const label = subtitleSourceLabel(
            link.getAttribute('download')
                || link.getAttribute('aria-label')
                || link.getAttribute('title')
                || link.textContent
                || '',
            url,
        );
        sources.push({
            url,
            label,
            language: normalizeSubtitleLanguage(link.lang || inferSubtitleLanguage(label, url)),
            sourceKey: pageSubtitleSourceKey('link', url),
        });
    }

    const seen = new Set<string>();
    return sources.filter(source => {
        const key = source.sourceKey;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function resolveSubtitleSourceUrl(value: string): string {
    try {
        const url = new URL(value, document.baseURI);
        if (!/^(https?|blob|data):$/i.test(url.protocol)) return '';
        return url.href;
    } catch {
        return '';
    }
}

function isSupportedSubtitleSourceUrl(value: string): boolean {
    try {
        const url = new URL(value, document.baseURI);
        const haystack = [
            decodeURIComponent(url.pathname),
            ...Array.from(url.searchParams.values()).map(part => decodeURIComponent(part)),
        ].join(' ');
        return /\.(vtt|srt|ass|ssa)(?:$|[?#\s])/i.test(`${haystack} `);
    } catch {
        return /\.(vtt|srt|ass|ssa)(?:$|[?#\s])/i.test(value);
    }
}

function subtitleSourceLabel(value: string, url: string): string {
    const cleaned = value.replace(/\s+/g, ' ').trim();
    if (cleaned && !/^(vtt|srt|subtitles?)$/i.test(cleaned)) {
        return cleaned.replace(/\.(vtt|srt|ass|ssa)$/i, '').trim();
    }
    try {
        const parsed = new URL(url, document.baseURI);
        const filename = parsed.searchParams.get('filename') || parsed.pathname.split('/').pop() || '';
        return decodeURIComponent(filename).replace(/\.(vtt|srt|ass|ssa)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Subtitle file';
    } catch {
        return 'Subtitle file';
    }
}

function inferSubtitleLanguage(label: string, url: string): string | undefined {
    const text = `${label} ${url}`;
    if (/(^|[\s._/-])(ja|jp|jpn|japanese|日本語)(?=$|[\s._/-])/i.test(text) || /[\u3040-\u30ff\u3400-\u9fff]/u.test(label)) return 'ja';
    if (/(^|[\s._/-])(en|eng|english|native)(?=$|[\s._/-])/i.test(text)) return 'en';
    return undefined;
}

function normalizeSubtitleLanguage(language: string | undefined): string | undefined {
    if (!language) return undefined;
    if (/^(ja|jp|jpn)(?:-|$)/i.test(language)) return 'ja';
    if (/^(en|eng)(?:-|$)/i.test(language)) return 'en';
    return language;
}

function pageSubtitleSourceKey(kind: 'link' | 'track', url: string): string {
    return `${kind}:${normalizedSubtitleUrl(url)}`;
}

function normalizedSubtitleUrl(value: string): string {
    try {
        const url = new URL(value, document.baseURI);
        url.searchParams.delete('v');
        url.hash = '';
        return url.href;
    } catch {
        return value;
    }
}

function sameSubtitleUrl(a: string, b: string): boolean {
    return normalizedSubtitleUrl(a) === normalizedSubtitleUrl(b);
}

function shouldReplaceWaitingNativeTrack(selected: SubtitleTrackOption | undefined, replacement: SubtitleTrackOption, cues: SubtitleCue[]): boolean {
    if (!selected || selected.kind !== 'native' || cues.length) return false;
    const sameRole = (isJapaneseSubtitleTrack(selected) && isJapaneseSubtitleTrack(replacement))
        || (isEnglishSubtitleTrack(selected) && isEnglishSubtitleTrack(replacement));
    if (sameRole) return true;
    const selectedLanguage = normalizeSubtitleLanguage(selected.language);
    const replacementLanguage = normalizeSubtitleLanguage(replacement.language);
    return Boolean(selectedLanguage && replacementLanguage && selectedLanguage === replacementLanguage);
}

function getCueText(cue: VTTCue | TextTrackCue): string {
    if ('text' in cue && typeof cue.text === 'string') return cue.text;
    return '';
}

function readTrackCues(track: TextTrack): SubtitleCue[] {
    return normalizeSubtitleCues(Array.from(track.cues ?? [])
        .map(cue => ({ start: cue.startTime, end: cue.endTime, text: getCueText(cue as VTTCue | TextTrackCue).trim() }))
        .filter(cue => cue.text)
        .sort((a, b) => a.start - b.start));
}

function waitForTextTrackCues(track: TextTrack, timeoutMs = 900): Promise<SubtitleCue[]> {
    const startedAt = performance.now();
    return new Promise(resolve => {
        const poll = () => {
            const cues = readTrackCues(track);
            if (cues.length || performance.now() - startedAt >= timeoutMs) {
                resolve(cues);
                return;
            }
            window.setTimeout(poll, 50);
        };
        poll();
    });
}

function ensureTextTrackReadable(track: TextTrack): void {
    if (track.mode === 'disabled') track.mode = 'hidden';
}

export function normalizeSubtitleCues(cues: SubtitleCue[], options: { transcriptEligible?: boolean } = {}): SubtitleCue[] {
    const normalized: SubtitleCue[] = [];
    cues.forEach(cue => {
        const text = normalizeCaptionText(cue.text);
        if (!text || !Number.isFinite(cue.start) || !Number.isFinite(cue.end)) return;
        const words = exactSubtitleWords(cue, cue.start, Math.max(cue.end, cue.start + 0.12));
        const base = {
            ...cue,
            text,
            start: cue.start,
            end: Math.max(cue.end, cue.start + 0.12),
            originalText: cue.originalText ?? text,
            words,
            wordTimingsExact: Boolean(words?.length),
            transcriptEligible: options.transcriptEligible ?? cue.transcriptEligible ?? true,
        };
        const sentenceParts = splitCueDisplayText(text);
        if (sentenceParts.length <= 1) {
            normalized.push({ ...base, transcriptEligible: base.transcriptEligible });
            return;
        }

        const timedParts = distributeCueParts(base, sentenceParts);
        for (const part of timedParts) {
            const partWords = sliceCueWords(base, part.start, part.end);
            normalized.push({
                start: part.start,
                end: part.end,
                text: part.text,
                originalText: base.originalText,
                words: partWords,
                wordTimingsExact: Boolean(partWords?.length),
                transcriptEligible: base.transcriptEligible,
            });
        }
        if (!timedParts.length) normalized.push({ ...base, transcriptEligible: base.transcriptEligible });
    });
    return normalized.sort((a, b) => a.start - b.start);
}

function splitCueDisplayText(text: string): string[] {
    const normalized = normalizeCaptionText(text);
    if (!normalized) return [];
    const sentenceParts = splitSentencesByPunctuation(normalized);
    if (sentenceParts.length > 1) return sentenceParts;
    if (displayTextWeight(normalized) <= 38) return [normalized];
    return splitOverlongCue(normalized);
}

function splitSentencesByPunctuation(text: string): string[] {
    const parts: string[] = [];
    let start = 0;
    const chars = Array.from(text);
    let offset = 0;
    for (const char of chars) {
        offset += char.length;
        if (!/[。！？!?]/u.test(char)) continue;
        while (offset < text.length && /["'」』）\]]/u.test(text[offset])) offset++;
        const part = text.slice(start, offset).trim();
        if (part) parts.push(part);
        start = offset;
    }
    const rest = text.slice(start).trim();
    if (rest) parts.push(rest);
    return parts.length ? parts : [text];
}

function splitOverlongCue(text: string): string[] {
    const parts: string[] = [];
    const tokens = text.includes(' ')
        ? text.split(/(\s+)/u).filter(Boolean)
        : Array.from(text);
    let current = '';
    for (const token of tokens) {
        if (displayTextWeight(current + token) > 32 && current.trim()) {
            parts.push(current.trim());
            current = token.trimStart();
        } else {
            current += token;
        }
    }
    if (current.trim()) parts.push(current.trim());
    return parts.length > 1 ? parts : [text];
}

function distributeCueParts(cue: SubtitleCue, parts: string[]): Array<{ text: string; start: number; end: number }> {
    const duration = Math.max(0.12, cue.end - cue.start);
    const weights = parts.map(part => Math.max(1, displayTextWeight(part)));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || parts.length;
    let cursor = cue.start;
    return parts.map((part, index) => {
        const partDuration = index === parts.length - 1
            ? cue.end - cursor
            : duration * (weights[index] / totalWeight);
        const start = cursor;
        const end = index === parts.length - 1 ? cue.end : Math.min(cue.end, cursor + Math.max(0.12, partDuration));
        cursor = end;
        return { text: part, start, end: Math.max(end, start + 0.12) };
    });
}

function exactSubtitleWords(cue: SubtitleCue, start: number, end: number): SubtitleWordTiming[] | undefined {
    if (!cue.wordTimingsExact || !cue.words?.length) return undefined;
    const words = cue.words
        .filter(word => word.text.trim() && Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > start && word.start < end)
        .map(word => ({ ...word, start: clampNumber(word.start, start, end), end: clampNumber(word.end, start, end) }))
        .filter(word => word.end > word.start);
    return words.length ? words : undefined;
}

function sliceCueWords(cue: SubtitleCue, start: number, end: number): SubtitleWordTiming[] | undefined {
    return exactSubtitleWords(cue, start, end);
}

function renderKaraokeTextParts(text: string, progress: number): string {
    const chars = Array.from(text);
    const split = clampNumber(Math.round(progress), 0, chars.length);
    const past = chars.slice(0, split).join('');
    const current = chars.slice(split, split + 1).join('');
    const upcoming = chars.slice(split + 1).join('');
    return [
        past ? `<span class="jpdb-subtitle-karaoke-word jpdb-subtitle-word-spoken">${escapeHtml(past)}</span>` : '',
        current ? `<span class="jpdb-subtitle-karaoke-word jpdb-subtitle-word-current">${escapeHtml(current)}</span>` : '',
        upcoming ? `<span class="jpdb-subtitle-karaoke-word jpdb-subtitle-word-pending">${escapeHtml(upcoming)}</span>` : '',
    ].join('');
}

function karaokeCharacterProgress(cue: SubtitleCue, words: SubtitleWordTiming[], time: number): number {
    const total = compactTextLength(cue.text);
    if (!total) return 0;
    if (time <= cue.start) return 0;
    if (time >= cue.end) return total;

    const sorted = [...words]
        .filter(word => word.text.trim() && Number.isFinite(word.start) && Number.isFinite(word.end))
        .sort((a, b) => a.start - b.start);
    let cursor = 0;
    for (const word of sorted) {
        const length = compactTextLength(word.text);
        if (!length) continue;
        if (time >= word.end) {
            cursor += length;
            continue;
        }
        if (time <= word.start) return Math.min(total, cursor);
        const ratio = clampNumber((time - word.start) / Math.max(0.04, word.end - word.start), 0, 1);
        return Math.min(total, cursor + Math.max(1, Math.floor(length * ratio)));
    }
    return Math.min(total, cursor);
}

function compactTextLength(text: string): number {
    return Array.from(text.replace(/\s+/gu, '')).length;
}

function displayTextWeight(text: string): number {
    return Array.from(text.replace(/\s+/gu, '')).length;
}

function parseVttCuePayload(raw: string, cueStart: number, cueEnd: number): { text: string; words?: SubtitleWordTiming[]; wordTimingsExact?: boolean } {
    const timestampPattern = /<((?:(?:\d+:)?\d{2}:)?\d{2}[,.]\d{3})>/g;
    const markers: Array<{ time: number; index: number; endIndex: number }> = [];
    raw.replace(timestampPattern, (match, rawTime: string, index: number) => {
        const time = parseSubtitleTime(rawTime.includes(':') ? rawTime : `00:${rawTime}`);
        if (Number.isFinite(time)) markers.push({ time, index, endIndex: index + match.length });
        return match;
    });
    const text = raw.replace(timestampPattern, '').replace(/<[^>]+>/g, '').trim();
    if (!markers.length) return { text };

    const words: SubtitleWordTiming[] = [];
    for (let index = 0; index < markers.length; index++) {
        const marker = markers[index];
        const next = markers[index + 1];
        const segmentRaw = raw.slice(marker.endIndex, next?.index ?? raw.length).replace(timestampPattern, '').replace(/<[^>]+>/g, '');
        const segmentText = segmentRaw.trim();
        if (!segmentText) continue;
        if (/\s/u.test(segmentText)) return { text };
        const start = clampNumber(marker.time, cueStart, cueEnd);
        const end = clampNumber(next?.time ?? cueEnd, cueStart, cueEnd);
        words.push({ text: segmentText, start, end: Math.max(start + 0.04, end) });
    }
    return { text, words: words.length ? words : undefined, wordTimingsExact: Boolean(words.length) };
}

export function parseSubtitleText(text: string): SubtitleCue[] {
    const youtubeJson = parseYouTubeJson3SubtitleText(text);
    if (youtubeJson.length) return youtubeJson;
    const youtubeXml = parseYouTubeXmlSubtitleText(text);
    if (youtubeXml.length) return youtubeXml;
    if (/^\s*\[Script Info\]/im.test(text) || /^\s*Dialogue:/im.test(text)) return parseAssSubtitleText(text);

    const blocks = text
        .replace(/\r/g, '')
        .replace(/^WEBVTT.*?\n\n/s, '')
        .split(/\n{2,}/)
        .map(block => block.trim())
        .filter(Boolean);

    const cues: SubtitleCue[] = [];
    for (const block of blocks) {
        const lines = block.split('\n').filter(Boolean);
        const timeIndex = lines.findIndex(line => line.includes('-->'));
        if (timeIndex < 0) continue;
        const [startRaw, endRaw] = lines[timeIndex].split('-->').map(part => part.trim().split(/\s+/)[0]);
        const start = parseSubtitleTime(startRaw);
        const end = parseSubtitleTime(endRaw);
        const payload = parseVttCuePayload(lines.slice(timeIndex + 1).join('\n'), start, end);
        if (Number.isFinite(start) && Number.isFinite(end) && payload.text) cues.push({ start, end, text: payload.text, words: payload.words, wordTimingsExact: payload.wordTimingsExact });
    }
    return cues.sort((a, b) => a.start - b.start);
}

function parseYouTubeJson3SubtitleText(text: string): SubtitleCue[] {
    if (!/^\s*\{/.test(text)) return [];
    try {
        const parsed = JSON.parse(text) as {
            events?: Array<{ tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string; tOffsetMs?: number }> }>;
        };
        const cues = (parsed.events ?? [])
            .map(event => {
                const start = Number(event.tStartMs ?? Number.NaN) / 1000;
                const duration = Number(event.dDurationMs ?? 0) / 1000;
                const cueText = (event.segs ?? []).map(seg => seg.utf8 ?? '').join('').replace(/\s+/g, ' ').trim();
                const end = start + Math.max(duration, 0.75);
                const words = youtubeJson3WordTimings(event.segs ?? [], start, end);
                return { start, end, text: cueText, words, wordTimingsExact: Boolean(words?.length) };
            })
            .filter(cue => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.text)
            .sort((a, b) => a.start - b.start);
        return smoothFragmentedYouTubeCues(cues);
    } catch {
        return [];
    }
}

function youtubeJson3WordTimings(segs: Array<{ utf8?: string; tOffsetMs?: number }>, cueStart: number, cueEnd: number): SubtitleWordTiming[] | undefined {
    const visible = segs
        .map(seg => ({ text: seg.utf8 ?? '', offset: Number(seg.tOffsetMs) }))
        .filter(seg => seg.text.trim());
    const timed = visible.filter(seg => Number.isFinite(seg.offset) && !/\s/u.test(seg.text.trim()));
    if (!timed.length || timed.length !== visible.length) return undefined;
    return timed.map((seg, index) => {
        const nextOffset = timed[index + 1]?.offset;
        const start = cueStart + seg.offset / 1000;
        const end = nextOffset === undefined ? cueEnd : cueStart + nextOffset / 1000;
        return { text: seg.text, start: clampNumber(start, cueStart, cueEnd), end: clampNumber(end, cueStart, cueEnd) };
    }).filter(word => word.end > word.start);
}

function parseYouTubeXmlSubtitleText(text: string): SubtitleCue[] {
    if (!/^\s*</.test(text) || !/(<text\b|<p\b)/i.test(text)) return [];
    try {
        const document = new DOMParser().parseFromString(text, 'text/xml');
        const cues: SubtitleCue[] = [];
        for (const element of Array.from(document.querySelectorAll('text[start]'))) {
            const start = Number(element.getAttribute('start'));
            const duration = Number(element.getAttribute('dur') ?? 0);
            const cueText = normalizeCaptionText(element.textContent ?? '');
            if (Number.isFinite(start) && cueText) cues.push({ start, end: start + Math.max(duration, 0.75), text: cueText });
        }
        for (const element of Array.from(document.querySelectorAll('p[begin]'))) {
            const start = parseSubtitleClockValue(element.getAttribute('begin') ?? '');
            const end = parseSubtitleClockValue(element.getAttribute('end') ?? '');
            const cueText = normalizeCaptionText(element.textContent ?? '');
            if (Number.isFinite(start) && Number.isFinite(end) && cueText) cues.push({ start, end, text: cueText });
        }
        for (const element of Array.from(document.querySelectorAll('p[t], p[_t]'))) {
            const startMs = Number(element.getAttribute('t') ?? element.getAttribute('_t'));
            const durationMs = Number(element.getAttribute('d') ?? element.getAttribute('_d') ?? 0);
            const start = startMs / 1000;
            const end = start + Math.max(durationMs / 1000, 0.75);
            const words = parseYouTubeSrv3WordNodes(element, start, end);
            const cueText = normalizeCaptionText(words.length
                ? words.map(word => word.text).join('')
                : element.textContent ?? '');
            if (Number.isFinite(start) && cueText) cues.push({ start, end, text: cueText, words: words.length ? words : undefined, wordTimingsExact: Boolean(words.length) });
        }
        return smoothFragmentedYouTubeCues(cues.sort((a, b) => a.start - b.start));
    } catch {
        return [];
    }
}

function smoothFragmentedYouTubeCues(cues: SubtitleCue[]): SubtitleCue[] {
    if (cues.length < 3 || !looksLikeFragmentedYouTubeCues(cues)) return cues;
    const merged: SubtitleCue[] = [];
    let current: SubtitleCue | undefined;

    for (const cue of cues) {
        const normalized = {
            ...cue,
            text: normalizeCaptionText(cue.text),
            words: cueHasExactWordTimings(cue) ? cue.words : undefined,
            wordTimingsExact: cueHasExactWordTimings(cue),
        };
        if (!normalized.text) continue;

        if (!current || shouldBreakYouTubeLine(current, normalized)) {
            if (current) merged.push(current);
            current = normalized;
            continue;
        }

        current = mergeYouTubeCueFragments(current, normalized);
    }
    if (current) merged.push(current);
    return merged;
}

function looksLikeFragmentedYouTubeCues(cues: SubtitleCue[]): boolean {
    const sampled = cues.slice(0, 80);
    const fragments = sampled.filter(cue => displayTextWeight(cue.text) <= 14 || cue.end - cue.start <= 1.35).length;
    return fragments / sampled.length >= 0.42;
}

function shouldBreakYouTubeLine(current: SubtitleCue, next: SubtitleCue): boolean {
    const gap = next.start - current.end;
    if (isTrailingPunctuationFragment(next.text)) return false;
    if (gap > 2.6) return true;
    if (gap < -0.2 && !isProgressiveYouTubeCaption(current.text, next.text)) return true;
    if (/[。！？!?]$/u.test(current.text.trim())) return true;
    if (current.end - current.start >= 12) return true;
    if (displayTextWeight(current.text) >= 68) return true;
    return false;
}

function mergeYouTubeCueFragments(current: SubtitleCue, next: SubtitleCue): SubtitleCue {
    const progressive = isProgressiveYouTubeCaption(current.text, next.text);
    const text = progressive ? next.text : joinYouTubeCaptionFragments(current.text, next.text);
    const currentWords = cueHasExactWordTimings(current) ? current.words : undefined;
    const nextWords = cueHasExactWordTimings(next) ? next.words : undefined;
    const allowsUntimedPunctuation = isTrailingPunctuationFragment(next.text);
    const words = progressive ? nextWords : currentWords && (nextWords || allowsUntimedPunctuation) ? [...currentWords, ...(nextWords ?? [])] : undefined;
    return {
        ...current,
        end: Math.max(current.end, next.end),
        text,
        originalText: text,
        words,
        wordTimingsExact: Boolean(words?.length),
    };
}

function isProgressiveYouTubeCaption(current: string, next: string): boolean {
    const compactCurrent = current.replace(/\s+/gu, '');
    const compactNext = next.replace(/\s+/gu, '');
    return compactCurrent.length >= 2 && compactNext.length > compactCurrent.length && compactNext.startsWith(compactCurrent);
}

function joinYouTubeCaptionFragments(left: string, right: string): string {
    const a = left.trim();
    const b = right.trim();
    if (!a) return b;
    if (!b) return a;
    if (/^[、。，．！？!?））」』\]}]/u.test(b)) return `${a}${b}`;
    if (/[\s「『（([{]$/u.test(a)) return `${a}${b}`;
    if (/[A-Za-z0-9]$/u.test(a) && /^[A-Za-z0-9]/u.test(b)) return `${a} ${b}`;
    return `${a}${b}`;
}

function isTrailingPunctuationFragment(text: string): boolean {
    return /^[、。，．！？!?…・]+$/u.test(text.trim());
}

function parseYouTubeSrv3WordNodes(element: Element, cueStart: number, cueEnd: number): SubtitleWordTiming[] {
    const nodes = Array.from(element.querySelectorAll('s'));
    if (!nodes.length) return [];
    if (nodes.some(node => /\s/u.test((node.textContent ?? '').trim()))) return [];
    const starts = nodes.map(node => {
        const raw = Number(node.getAttribute('t') ?? node.getAttribute('_t'));
        return Number.isFinite(raw) ? cueStart + raw / 1000 : Number.NaN;
    });
    return nodes.map((node, index) => {
        const text = node.textContent ?? '';
        if (!text) return null;
        const start = Number.isFinite(starts[index]) ? starts[index] : cueStart;
        const nextStart = starts.slice(index + 1).find(value => Number.isFinite(value));
        const end = typeof nextStart === 'number' && Number.isFinite(nextStart) ? nextStart : cueEnd;
        return { text, start: clampNumber(start, cueStart, cueEnd), end: clampNumber(end, cueStart, cueEnd) };
    }).filter((word): word is SubtitleWordTiming => Boolean(word?.text.trim() && word.end > word.start));
}

function parseAssSubtitleText(text: string): SubtitleCue[] {
    const cues: SubtitleCue[] = [];
    let inEvents = false;
    let format = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];

    for (const rawLine of text.replace(/\r/g, '').split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith(';')) continue;
        if (/^\[Events\]/i.test(line)) {
            inEvents = true;
            continue;
        }
        if (/^\[.+\]/.test(line)) {
            inEvents = false;
            continue;
        }
        if (!inEvents && !/^Dialogue:/i.test(line)) continue;
        if (/^Format:/i.test(line)) {
            format = line.slice(line.indexOf(':') + 1).split(',').map(part => part.trim().toLowerCase());
            continue;
        }
        if (!/^Dialogue:/i.test(line)) continue;

        const values = splitAssDialogue(line.slice(line.indexOf(':') + 1), format.length);
        const startIndex = format.indexOf('start');
        const endIndex = format.indexOf('end');
        const textIndex = format.indexOf('text');
        const start = parseSubtitleTime(values[startIndex] ?? '');
        const end = parseSubtitleTime(values[endIndex] ?? '');
        const cueText = cleanAssSubtitleText(values.slice(textIndex >= 0 ? textIndex : values.length - 1).join(','));
        if (Number.isFinite(start) && Number.isFinite(end) && cueText) cues.push({ start, end, text: cueText });
    }
    return cues.sort((a, b) => a.start - b.start);
}

function splitAssDialogue(value: string, fieldCount: number): string[] {
    const parts: string[] = [];
    let start = 0;
    const maxSplits = Math.max(0, fieldCount - 1);
    for (let index = 0; index < value.length && parts.length < maxSplits; index++) {
        if (value[index] !== ',') continue;
        parts.push(value.slice(start, index).trim());
        start = index + 1;
    }
    parts.push(value.slice(start).trim());
    return parts;
}

function cleanAssSubtitleText(value: string): string {
    return value
        .replace(/\{[^}]*}/g, '')
        .replace(/\\[Nn]/g, '\n')
        .replace(/\\h/g, ' ')
        .replace(/<[^>]+>/g, '')
        .split('\n')
        .map(line => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');
}

export function readPageCaptionText(video?: HTMLVideoElement, readerRoot?: HTMLElement): string {
    const direct = collectCaptionTexts(
        [...document.querySelectorAll<HTMLElement>(CAPTION_SELECTORS)],
        video,
        readerRoot,
        false,
    );
    if (direct || !video || !isYouTubePage()) {
        if (direct || !video) return direct;
    } else {
        return readHiddenYouTubeCaptionText(readerRoot);
    }
    return collectCaptionTexts(
        [...document.querySelectorAll<HTMLElement>('span, p, div')],
        video,
        readerRoot,
        true,
    );
}

function readHiddenYouTubeCaptionText(readerRoot?: HTMLElement): string {
    const lines: string[] = [];
    const seen = new Set<string>();
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('.ytp-caption-segment, .caption-window'))) {
        if (isCaptionElementExcluded(element, readerRoot)) continue;
        const text = normalizeCaptionText(element.innerText || element.textContent || '');
        if (!text || seen.has(text) || !/[\u3040-\u30ff\u3400-\u9fff]/.test(text)) continue;
        seen.add(text);
        lines.push(text);
        if (lines.length >= 2) break;
    }
    return lines.join(' ').replace(/\s+/g, ' ').trim();
}

function parseSubtitleTime(value: string): number {
    const match = value.trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/);
    if (!match) return Number.NaN;
    const [, hours = '0', minutes, seconds, fraction] = match;
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(fraction.padEnd(3, '0')) / 1000;
}

function parseSubtitleClockValue(value: string): number {
    const trimmed = value.trim();
    if (!trimmed) return Number.NaN;
    if (/^\d+(?:\.\d+)?s$/i.test(trimmed)) return Number(trimmed.slice(0, -1));
    if (/^\d+(?:\.\d+)?ms$/i.test(trimmed)) return Number(trimmed.slice(0, -2)) / 1000;
    if (/^\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
    return parseSubtitleTime(trimmed);
}

function formatSubtitleTime(value: number): string {
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
}

function findAlignedCue(cues: SubtitleCue[], cue: SubtitleCue): SubtitleCue | undefined {
    return cues
        .map(item => ({
            item,
            overlap: Math.max(0, Math.min(cue.end, item.end) - Math.max(cue.start, item.start)),
            startDistance: Math.abs(cue.start - item.start),
        }))
        .filter(candidate => candidate.overlap > 0 || candidate.startDistance <= 0.45)
        .sort((a, b) => b.overlap - a.overlap || a.startDistance - b.startDistance)[0]?.item;
}

function findActiveSubtitleCue(cues: SubtitleCue[], time: number): SubtitleCue | undefined {
    return cues
        .filter(cue => time >= cue.start - 0.05 && time < cue.end + 0.12)
        .sort((a, b) => b.start - a.start || b.end - a.end)[0];
}

function subtitleCueSignature(cue: SubtitleCue): string {
    return `${cue.start.toFixed(2)}:${cue.end.toFixed(2)}:${cue.text.trim()}`;
}

function cueHasExactWordTimings(cue: SubtitleCue | undefined): cue is SubtitleCue & { words: SubtitleWordTiming[]; wordTimingsExact: true } {
    return Boolean(cue?.wordTimingsExact && cue.words?.length);
}

function isJapaneseTrack(label = '', language = ''): boolean {
    return /(^|\b)(ja|jpn|japanese|日本語)(\b|$)/i.test(`${label} ${language}`);
}

function collectCaptionTexts(elements: HTMLElement[], video?: HTMLVideoElement, readerRoot?: HTMLElement, nearVideoOnly = false): string {
    const lines: string[] = [];
    const seen = new Set<string>();
    for (const element of elements) {
        if (!isLikelyCaptionElement(element, video, readerRoot, nearVideoOnly)) continue;
        const text = normalizeCaptionText(element.innerText || element.textContent || '');
        if (!text || seen.has(text)) continue;
        seen.add(text);
        lines.push(text);
        if (lines.length >= 2) break;
    }
    return lines.join(' ').replace(/\s+/g, ' ').trim();
}

function isLikelyCaptionElement(element: HTMLElement, video?: HTMLVideoElement, readerRoot?: HTMLElement, nearVideoOnly = false): boolean {
    if (isCaptionElementExcluded(element, readerRoot)) return false;
    const text = normalizeCaptionText(element.innerText || element.textContent || '');
    if (!isCaptionTextShape(element, text)) return false;

    const rect = element.getBoundingClientRect();
    if (!isVisibleCaptionRect(element, rect)) return false;

    if (!video) return !nearVideoOnly;
    const videoRect = video.getBoundingClientRect();
    if (videoRect.width < 120 || videoRect.height < 80) return !nearVideoOnly;
    return isCaptionNearVideo(rect, videoRect);
}

function isCaptionElementExcluded(element: HTMLElement, readerRoot?: HTMLElement): boolean {
    return !element.isConnected
        || Boolean(readerRoot && (element === readerRoot || readerRoot.contains(element)))
        || Boolean(element.closest([
            '[data-jpdb-reader-root]',
            '.asbplayer-offscreen',
            '.asbplayer-subtitles-container-bottom',
            '.asbplayer-subtitle',
            '.asbplayer-drag-zone',
            '.asbplayer-overlay-container',
            'script',
            'style',
            'noscript',
            'textarea',
            'input',
            'select',
            'button',
        ].join(',')));
}

function isCaptionTextShape(element: HTMLElement, text: string): boolean {
    const allowsChildText = element.matches(CAPTION_CONTAINER_SELECTORS);
    return text.length >= 2
        && text.length <= 180
        && /[\u3040-\u30ff\u3400-\u9fff]/.test(text)
        && text.split('\n').length <= 4
        && (allowsChildText || ![...element.children].some(child => /[\u3040-\u30ff\u3400-\u9fff]/.test(child.textContent ?? '')));
}

function isVisibleCaptionRect(element: HTMLElement, rect: DOMRect): boolean {
    if (rect.width < 24 || rect.height < 10 || rect.bottom < 0 || rect.top > window.innerHeight) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || '1') > 0;
}

function isCaptionNearVideo(rect: DOMRect, videoRect: DOMRect): boolean {
    const horizontalOverlap = Math.max(0, Math.min(rect.right, videoRect.right) - Math.max(rect.left, videoRect.left));
    const overlapRatio = horizontalOverlap / Math.max(1, Math.min(rect.width, videoRect.width));
    const overlapsVideo = rect.bottom >= videoRect.top && rect.top <= videoRect.bottom && overlapRatio > 0.25;
    const belowVideo = rect.top >= videoRect.bottom && rect.top <= videoRect.bottom + 90 && overlapRatio > 0.25;
    const tooLarge = rect.width * rect.height > videoRect.width * videoRect.height * 0.45;
    return !tooLarge && (overlapsVideo || belowVideo);
}

function normalizeCaptionText(value: string): string {
    return value
        .replace(/\u00a0/g, ' ')
        .split('\n')
        .map(line => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join(' ');
}

function escapeWithBreaks(value: string): string {
    return withBreaks(escapeHtml(value));
}

function withBreaks(value: string): string {
    return value.replace(/\n/g, '<br>');
}

function getYouTubeVideoId(): string {
    const url = new URL(location.href);
    return url.searchParams.get('v') ?? url.pathname.match(/\/shorts\/([^/?]+)/)?.[1] ?? '';
}

function isYouTubePage(): boolean {
    return /(^|\.)youtube\.com$/i.test(location.hostname);
}

function isCijVideoPage(): boolean {
    return /(^|\.)cijapanese\.com$/i.test(location.hostname) && /^\/video\//i.test(location.pathname);
}

function isJapaneseSubtitleTrack(track: SubtitleTrackOption): boolean {
    const language = track.language?.toLowerCase() ?? '';
    const label = track.label.toLowerCase();
    return language === 'ja' || language.startsWith('ja-') || /日本語|japanese/.test(label);
}

interface YouTubeCaptionTrackCandidate {
    label: string;
    language?: string;
    url: string;
    raw: unknown;
}

function getYouTubeCaptionTracks(): YouTubeCaptionTrackCandidate[] {
    const playerTracks = getYouTubePlayerCaptionTracks();
    const response = getYouTubePlayerResponse();
    const rawTracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    return uniqueYouTubeCaptionTracks([
        ...playerTracks,
        ...(Array.isArray(rawTracks) ? rawTracks : []),
    ]);
}

function getYouTubePlayerCaptionTracks(): unknown[] {
    const player = document.querySelector('#movie_player') as {
        getVideoData?: () => { video_id?: string };
        getAudioTrack?: () => { captionTracks?: unknown[] };
    } | null;
    const videoId = getYouTubeVideoId();
    const playerVideoId = player?.getVideoData?.()?.video_id;
    const tracks = player?.getAudioTrack?.()?.captionTracks;
    return (!playerVideoId || !videoId || playerVideoId === videoId) && Array.isArray(tracks) ? tracks : [];
}

function uniqueYouTubeCaptionTracks(rawTracks: unknown[]): YouTubeCaptionTrackCandidate[] {
    const tracks: YouTubeCaptionTrackCandidate[] = [];
    const seen = new Set<string>();
    for (const track of rawTracks) {
        const parsed = parseYouTubeCaptionTrack(track);
        if (!parsed) continue;
        const key = youtubeCaptionTrackIdentity(parsed);
        if (seen.has(key)) continue;
        seen.add(key);
        tracks.push(parsed);
    }
    return tracks;
}

function parseYouTubeCaptionTrack(track: unknown): YouTubeCaptionTrackCandidate | null {
    const record = track as {
        url?: string;
        baseUrl?: string;
        languageCode?: string;
        displayName?: string;
        languageName?: string;
        name?: { simpleText?: string; runs?: Array<{ text?: string }> };
    };
    const rawUrl = typeof record.url === 'string' ? record.url : typeof record.baseUrl === 'string' ? record.baseUrl : '';
    if (!rawUrl) return null;
    const url = new URL(rawUrl, location.href);
    url.searchParams.set('fmt', 'srv3');
    const clientName = readYouTubeClientName();
    if (clientName && !url.searchParams.has('c')) url.searchParams.set('c', clientName);
    const language = record.languageCode;
    const label = record.name?.simpleText
        ?? record.name?.runs?.map(run => run.text ?? '').join('')
        ?? record.displayName
        ?? record.languageName
        ?? language
        ?? 'YouTube subtitles';
    return { label: `${label}${language ? ` (${language})` : ''}`, language, url: url.toString(), raw: track };
}

function youtubeCaptionTrackIdentity(track: { label: string; language?: string }): string {
    return `${track.language ?? ''}:${track.label
        .replace(/\([^)]*\)\s*$/u, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()}`;
}

function findMatchingYouTubePlayerTrack(track: SubtitleTrackOption, player: {
    getOption?: (module: string, option: string) => unknown;
    getAudioTrack?: () => { captionTracks?: unknown[] };
}): unknown {
    const rawTracks = [
        ...extractYouTubeTrackArray(player.getAudioTrack?.()?.captionTracks),
        ...extractYouTubeTrackArray(player.getOption?.('captions', 'tracklist')),
    ];
    const targetIdentity = youtubeCaptionTrackIdentity(track);
    const exact = rawTracks.find(raw => {
        const parsed = parseYouTubeCaptionTrack(raw);
        return parsed && youtubeCaptionTrackIdentity(parsed) === targetIdentity;
    });
    if (exact) return exact;
    return rawTracks.find(raw => {
        const parsed = parseYouTubeCaptionTrack(raw);
        return parsed?.language && track.language && parsed.language.toLowerCase() === track.language.toLowerCase();
    }) ?? null;
}

function findPreferredYouTubeCaptionCandidate(track: SubtitleTrackOption): YouTubeCaptionTrackCandidate | null {
    if (track.kind !== 'youtube') return null;
    const candidates = uniqueYouTubeCaptionTracks([
        ...getYouTubePlayerCaptionTracks(),
        ...(getYouTubePlayerResponse()?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []),
    ]);
    const targetIdentity = youtubeCaptionTrackIdentity(track);
    return candidates
        .filter(candidate => youtubeCaptionTrackIdentity(candidate) === targetIdentity
            || Boolean(candidate.language && track.language && candidate.language.toLowerCase() === track.language.toLowerCase()))
        .sort((a, b) => youtubeTrackUrlScore(b.url) - youtubeTrackUrlScore(a.url))[0] ?? null;
}

function extractYouTubeTrackArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    const record = value as { captionTracks?: unknown[] } | null;
    return Array.isArray(record?.captionTracks) ? record.captionTracks : [];
}

type YouTubePlayerResponse = {
    videoDetails?: { videoId?: string };
    captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: unknown[] } };
};

function getYouTubePlayerResponse(): YouTubePlayerResponse | null {
    const videoId = getYouTubeVideoId();
    const fromWindow = (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse;
    if (isMatchingYouTubePlayerResponse(fromWindow, videoId)) return fromWindow as YouTubePlayerResponse;

    const fromConfig = readYouTubePlayerResponseFromConfig(videoId);
    if (fromConfig) return fromConfig;

    for (const script of Array.from(document.scripts)) {
        const text = script.textContent ?? '';
        for (const marker of ['ytInitialPlayerResponse = ', 'ytInitialPlayerResponse=', 'var ytInitialPlayerResponse = ']) {
            const start = text.indexOf(marker);
            if (start < 0) continue;
            const raw = extractJsonObject(text, start + marker.length);
            if (!raw) continue;
            try {
                const parsed = JSON.parse(raw) as unknown;
                if (isMatchingYouTubePlayerResponse(parsed, videoId)) return parsed as YouTubePlayerResponse;
            } catch {
                // Try the next known marker.
            }
        }
        const escaped = text.match(/"playerResponse"\s*:\s*"((?:\\.|[^"\\])+)"/);
        if (escaped?.[1]) {
            try {
                const parsed = JSON.parse(JSON.parse(`"${escaped[1]}"`)) as unknown;
                if (isMatchingYouTubePlayerResponse(parsed, videoId)) return parsed as YouTubePlayerResponse;
            } catch {
                // Keep looking through later scripts.
            }
        }
    }
    return null;
}

function readYouTubePlayerResponseFromConfig(videoId: string): YouTubePlayerResponse | null {
    const ytcfg = (window as Window & { ytcfg?: { data_?: Record<string, unknown>; get?: (key: string) => unknown } }).ytcfg;
    const candidates = [
        ytcfg?.get?.('PLAYER_RESPONSE'),
        ytcfg?.get?.('PLAYER_VARS'),
        ytcfg?.data_?.PLAYER_RESPONSE,
        ytcfg?.data_?.PLAYER_VARS,
    ];
    for (const candidate of candidates) {
        const response = readYouTubePlayerResponseCandidate(candidate);
        if (isMatchingYouTubePlayerResponse(response, videoId)) return response as YouTubePlayerResponse;
    }
    return null;
}

function readYouTubePlayerResponseCandidate(candidate: unknown): unknown {
    if (!candidate) return null;
    if (typeof candidate === 'string') {
        try {
            return JSON.parse(candidate);
        } catch {
            return null;
        }
    }
    if (typeof candidate === 'object') {
        const record = candidate as { player_response?: unknown; raw_player_response?: unknown };
        return readYouTubePlayerResponseCandidate(record.player_response ?? record.raw_player_response) ?? candidate;
    }
    return null;
}

function isMatchingYouTubePlayerResponse(value: unknown, videoId: string): boolean {
    if (!value || typeof value !== 'object') return false;
    const response = value as YouTubePlayerResponse;
    const responseVideoId = response.videoDetails?.videoId;
    return Boolean(response.captions?.playerCaptionsTracklistRenderer?.captionTracks)
        && (!videoId || !responseVideoId || responseVideoId === videoId);
}

function extractJsonObject(text: string, start: number): string | null {
    const objectStart = text.indexOf('{', start);
    if (objectStart < 0) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = objectStart; index < text.length; index++) {
        const char = text[index];
        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') {
            inString = true;
            continue;
        }
        if (char === '{') depth++;
        if (char === '}') {
            depth--;
            if (depth === 0) return text.slice(objectStart, index + 1);
        }
    }
    return null;
}

function youtubeSubtitleRequestUrls(url: string): string[] {
    return uniqueStrings([
        withYouTubeSubtitleFormat(url, 'srv3'),
        withYouTubeSubtitleFormat(url, 'json3'),
        withYouTubeSubtitleFormat(url, 'vtt'),
        url,
    ]);
}

function withYouTubeSubtitleFormat(url: string, format: 'srv3' | 'vtt' | 'json3'): string {
    const parsed = new URL(url);
    parsed.searchParams.set('fmt', format);
    const clientName = readYouTubeClientName();
    if (clientName && !parsed.searchParams.has('c')) parsed.searchParams.set('c', clientName);
    return parsed.href;
}

function readYouTubeClientName(): string {
    const ytcfg = (window as Window & { ytcfg?: { get?: (key: string) => unknown } }).ytcfg;
    const value = ytcfg?.get?.('INNERTUBE_CLIENT_NAME');
    return typeof value === 'string' && value ? value : '';
}

function shouldPreferYouTubeTrackUrl(next: string | undefined, current: string | undefined): boolean {
    return youtubeTrackUrlScore(next) > youtubeTrackUrlScore(current);
}

function youtubeTrackUrlScore(value: string | undefined): number {
    if (!value) return 0;
    try {
        const url = new URL(value, location.href);
        return [
            url.searchParams.has('pot') ? 8 : 0,
            url.searchParams.has('potc') ? 4 : 0,
            url.searchParams.has('signature') ? 2 : 0,
            url.searchParams.has('kind') ? 1 : 0,
        ].reduce((sum, item) => sum + item, 0);
    } catch {
        return 0;
    }
}

function uniqueStrings(values: string[]): string[] {
    return [...new Set(values)];
}

function requestText(url: string): Promise<string> {
    if (/^(blob|data):/i.test(url)) {
        log.debug('Subtitle request via fetch', { host: safeHost(url) });
        return fetch(url, { signal: AbortSignal.timeout(8000) }).then(response => {
            if (!response.ok) throw new Error(`Subtitle request failed (${response.status}).`);
            return response.text();
        });
    }
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        log.debug('Subtitle request via userscript API', { host: safeHost(url) });
        return new Promise((resolve, reject) => {
            userscriptRequest({
                method: 'GET',
                url,
                responseType: 'text',
                timeout: 8000,
                onload: response => response.status >= 200 && response.status < 300
                    ? resolve(String(response.responseText ?? response.response ?? ''))
                    : reject(new Error(`Subtitle request failed (${response.status}).`)),
                onerror: reject,
                ontimeout: () => reject(new Error('Subtitle request timed out.')),
            });
        });
    }
    log.debug('Subtitle request via fetch', { host: safeHost(url) });
    return fetch(url, { signal: AbortSignal.timeout(8000) }).then(response => {
        if (!response.ok) throw new Error(`Subtitle request failed (${response.status}).`);
        return response.text();
    });
}

function videoSummary(video: HTMLVideoElement): Record<string, unknown> {
    return {
        currentSrcHost: safeHost(video.currentSrc || video.src),
        width: video.videoWidth || video.clientWidth,
        height: video.videoHeight || video.clientHeight,
        textTracks: video.textTracks.length,
    };
}

function safeHost(value: string): string {
    try {
        return new URL(value, location.href).host;
    } catch {
        return value ? 'inline-or-invalid' : '';
    }
}

function mutationInsideReaderRoot(mutation: MutationRecord): boolean {
    const nodes = [
        mutation.target,
        ...Array.from(mutation.addedNodes),
        ...Array.from(mutation.removedNodes),
    ];
    return nodes.every(node => {
        const element = node.nodeType === 1
            ? node as Element
            : node.parentElement;
        return Boolean(element?.closest?.('[data-jpdb-reader-root]'));
    });
}

function mutationCouldAffectVideoDiscovery(mutation: MutationRecord): boolean {
    const nodes = [
        ...Array.from(mutation.addedNodes),
        ...Array.from(mutation.removedNodes),
    ];
    return nodes.some(nodeContainsVideoElement);
}

function nodeContainsVideoElement(node: Node): boolean {
    if (node instanceof HTMLVideoElement) return true;
    return node instanceof Element && Boolean(node.querySelector('video'));
}
