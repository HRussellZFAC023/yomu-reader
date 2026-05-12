import { escapeHtml, renderTokensToHtml, setInnerHtml } from './dom';
import { Logger } from './logger';
import { accentToRgba, matchesShortcut } from './settings';
import type { JPDBToken, ReaderSettings } from './types';
import { getUserscriptHttpRequest } from './userscript';

interface SubtitleCue {
    start: number;
    end: number;
    text: string;
    source?: 'page' | 'mpv';
    id?: string;
    mpvId?: number;
    mpvPort?: number;
}

interface SubtitleTrackOption {
    id: string;
    label: string;
    kind: 'native' | 'file' | 'youtube' | 'mpv';
    track?: TextTrack;
    cues?: SubtitleCue[];
    url?: string;
}

type MpvMediaType = 'audio' | 'thumbnail';

interface MpvMediaRequest {
    resolve: (dataUrl: string | undefined) => void;
    timeout: number;
    type: MpvMediaType;
}

interface SubtitlePlayerOptions {
    getSettings: () => ReaderSettings;
    parseJapanese: (text: string) => Promise<JPDBToken[]>;
    onSettingsChange: () => void;
    onToast: (message: string) => void;
}

const CAPTION_SELECTOR_LIST = [
    '.ytp-caption-segment',
    '.caption-visual-line',
    '.captions-text span',
    '[data-purpose="captions-text"]',
    '.asbplayer-subtitles-container-bottom span',
    '.asbplayer-subtitle',
    '[class*="subtitle"]',
    '[class*="caption"]',
    '[data-testid*="subtitle"]',
];

const CAPTION_SELECTORS = CAPTION_SELECTOR_LIST.join(',');
const MPV_TRACK_ID = 'mpv-live';
const MAX_MPV_CUES = 2000;
const log = Logger.scope('Subtitles');

export class SubtitlePlayerController {
    private root?: HTMLElement;
    private subtitleEl?: HTMLElement;
    private menuEl?: HTMLElement;
    private statusEl?: HTMLElement;
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
    private discoverTimer?: number;
    private alignFrame?: number;
    private selectedTrackId = '';
    private secondaryTrackId = '';
    private youtubeVideoId = '';
    private lastDomCaption = '';
    private parsedHtmlCache = new Map<string, string>();
    private renderSerial = 0;
    private panelMode: 'lines' | 'tracks' = 'lines';
    private lastMenuSignature = '';
    private lastTranscriptSignature = '';
    private transcriptScrollFrame?: number;
    private transcriptHydrateFrame?: number;
    private transcriptHydrationSerial = 0;
    private mpvSockets = new Map<number, WebSocket>();
    private mpvConnectedPorts = new Set<number>();
    private mpvMediaRequests = new Map<string, MpvMediaRequest>();
    private mpvMediaCache = new Map<string, string>();
    private mpvConnecting = false;
    private mpvReconnectTimer?: number;
    private mpvAudio?: HTMLAudioElement;

    constructor(private options: SubtitlePlayerOptions) {}

    init(): void {
        this.install();
        this.observer = new MutationObserver(mutations => {
            if (mutations.every(mutationInsideReaderRoot)) return;
            this.scheduleDiscoverVideo();
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
        document.addEventListener('keydown', event => this.handleKeydown(event));
        window.addEventListener('scroll', () => this.scheduleAlignToVideo(), { passive: true });
        window.addEventListener('resize', () => {
            this.scheduleAlignToVideo();
            this.positionTranscriptPanel();
        }, { passive: true });
        this.discoverVideo();
        if (this.options.getSettings().mpvSubtitleMiningEnabled && this.options.getSettings().mpvSubtitleAutoConnect) {
            window.setTimeout(() => this.connectMpv(false), 600);
        }
        this.tick();
        log.info('Subtitle controller initialized');
    }

    connectMpv(manual = true): void {
        const settings = this.options.getSettings();
        if (!settings.mpvSubtitleMiningEnabled) {
            settings.mpvSubtitleMiningEnabled = true;
            this.options.onSettingsChange();
        }
        if (this.mpvConnecting || this.mpvConnectedPorts.size) {
            this.refresh();
            return;
        }

        const ports = parseMpvPorts(settings.mpvSubtitlePorts);
        if (!ports.length) {
            this.options.onToast('No MPV bridge ports are configured.');
            return;
        }

        this.mpvConnecting = true;
        this.ensureMpvTrack();
        this.refresh();
        ports.forEach(port => this.openMpvSocket(settings.mpvSubtitleHost, port, manual));
        log.info('MPV subtitle bridge connect requested', { host: settings.mpvSubtitleHost, ports });
    }

    disconnectMpv(): void {
        window.clearTimeout(this.mpvReconnectTimer);
        this.mpvReconnectTimer = undefined;
        this.mpvConnecting = false;
        this.mpvConnectedPorts.clear();
        this.mpvSockets.forEach(socket => socket.close());
        this.mpvSockets.clear();
        this.rejectMpvMediaRequests();
        this.refresh();
        log.info('MPV subtitle bridge disconnected');
    }

    async captureCurrentMpvFrame(sentence?: string): Promise<string | undefined> {
        const cue = this.findMpvCueForSentence(sentence);
        if (!cue) return undefined;
        return this.requestMpvMedia(cue, 'thumbnail');
    }

    refresh(): void {
        if (!this.root) return;
        const settings = this.options.getSettings();
        const mpvActive = settings.mpvSubtitleMiningEnabled && (this.mpvConnecting || this.mpvConnectedPorts.size > 0 || this.selectedTrackId === MPV_TRACK_ID);
        this.root.hidden = !settings.subtitlePlayerEnabled || (!this.video && !this.cues.length && !mpvActive);
        this.root.classList.toggle('jpdb-subtitle-hidden', !settings.subtitleOverlayVisible);
        this.root.classList.toggle('jpdb-subtitle-controls-auto', settings.subtitleControlsMode === 'auto');
        this.root.classList.toggle('jpdb-subtitle-controls-hidden', settings.subtitleControlsMode === 'hidden');
        this.root.classList.toggle('jpdb-subtitle-controls-always', settings.subtitleControlsMode === 'always');
        this.root.classList.toggle('jpdb-subtitle-mpv-connected', this.mpvConnectedPorts.size > 0);
        this.root.classList.toggle('jpdb-subtitle-transcript-right', settings.subtitleTranscriptPlacement === 'right');
        this.root.classList.toggle('jpdb-subtitle-transcript-left', settings.subtitleTranscriptPlacement === 'left');
        this.root.classList.toggle('jpdb-subtitle-transcript-bottom', settings.subtitleTranscriptPlacement === 'bottom');
        this.root.style.setProperty('--subtitle-font-size', `${settings.subtitleFontSize}px`);
        this.root.style.setProperty('--subtitle-bottom', `${settings.subtitleBottomOffset}%`);
        this.root.style.setProperty('--subtitle-color', settings.subtitleTextColor);
        this.root.style.setProperty('--subtitle-outline', settings.subtitleOutlineColor);
        this.root.style.setProperty('--subtitle-background-rgba', accentToRgba(settings.subtitleBackgroundColor, settings.subtitleBackgroundOpacity));
        this.root.style.setProperty('--subtitle-family', settings.subtitleFontFamily);
        this.root.style.setProperty('--subtitle-weight', String(settings.subtitleFontWeight));
        if (settings.subtitleTranscriptVisible && this.cues.length && this.transcriptPanel?.hidden) {
            this.panelMode = 'lines';
            this.transcriptPanel.hidden = false;
            this.renderTranscriptPanel(true);
        }
        this.positionTranscriptPanel();
        this.syncControls();
        this.render();
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
            <div class="jpdb-subtitle-rail">
                <button class="jpdb-subtitle-toggle" type="button" data-action="toggle" title="Show or hide subtitles" aria-label="Show or hide subtitles">${subtitleIcon('eye')}</button>
                <button type="button" data-action="previous" title="Previous subtitle" aria-label="Previous subtitle">‹</button>
                <button type="button" data-action="list" title="Open transcript" aria-label="Open transcript">${subtitleIcon('transcript')}</button>
                <span class="jpdb-subtitle-status" data-role="status" hidden></span>
                <button type="button" data-action="next" title="Next subtitle" aria-label="Next subtitle">›</button>
                <button type="button" data-action="tracks" title="Subtitle tracks" aria-label="Subtitle tracks">${subtitleIcon('tracks')}</button>
                <button type="button" data-action="mpv-connect" title="Connect to MPV subtitle bridge" aria-label="Connect to MPV subtitle bridge">${subtitleIcon('plug')}</button>
                <button type="button" data-action="menu" title="Subtitle options" aria-label="Subtitle options">${subtitleIcon('menu')}</button>
            </div>
            <div class="jpdb-subtitle-menu" hidden></div>
            <div class="jpdb-subtitle-list" hidden></div>
            <input hidden type="file" data-file="primary" accept=".srt,.vtt,.ass,.ssa,text/vtt">
            <input hidden type="file" data-file="secondary" accept=".srt,.vtt,.ass,.ssa,text/vtt">
        `);
        root.addEventListener('click', event => this.handleClick(event));
        this.subtitleEl = root.querySelector('.jpdb-subtitle-text') as HTMLElement;
        this.menuEl = root.querySelector('.jpdb-subtitle-menu') as HTMLElement;
        this.statusEl = root.querySelector('[data-role="status"]') as HTMLElement;
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
        window.clearTimeout(this.discoverTimer);
        this.discoverTimer = window.setTimeout(() => this.discoverVideo(), 120);
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
            log.info('Subtitle video detected', videoSummary(candidate));
        }
        void this.discoverYouTubeTracks();
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

    private addNativeTrack(track: TextTrack): void {
        if (this.tracks.some(item => item.track === track)) return;
        const id = `native-${this.tracks.length}`;
        const label = track.label || track.language || `Subtitle ${this.tracks.length + 1}`;
        this.tracks.push({ id, label, kind: 'native', track });
        log.debug('Native subtitle track added', { id, label, language: track.language });

        track.addEventListener('cuechange', () => this.updateFromNativeTrack(track));
        window.setTimeout(() => {
            if (!this.selectedTrackId && (isJapaneseTrack(label, track.language) || this.tracks.length === 1)) void this.selectTrack(id);
            if (this.options.getSettings().subtitleSecondaryVisible && !this.secondaryTrackId && !isJapaneseTrack(label, track.language)) void this.selectSecondaryTrack(id);
            this.setNativeTrackModes();
            this.syncControls();
        }, 0);
        this.syncControls();
    }

    private updateFromNativeTrack(track: TextTrack): void {
        const primary = this.tracks.find(item => item.id === this.selectedTrackId);
        const secondary = this.tracks.find(item => item.id === this.secondaryTrackId);
        const active = track.activeCues?.[0] as VTTCue | TextTrackCue | undefined;
        if (!active) return;

        if (primary?.track === track) {
            this.currentCue = { start: active.startTime, end: active.endTime, text: getCueText(active) };
            if (!this.cues.length) this.cues = readTrackCues(track);
        }
        if (secondary?.track === track) {
            this.secondaryCue = { start: active.startTime, end: active.endTime, text: getCueText(active) };
            if (!this.secondaryCues.length) this.secondaryCues = readTrackCues(track);
        }
        this.render();
        this.renderTranscriptPanel();
        this.syncControls();
    }

    private tick(): void {
        const settings = this.options.getSettings();
        if (settings.subtitlePlayerEnabled) {
            this.alignToVideo();
            this.refreshNativeCueLists();
            this.updateFromLoadedCues();
            this.updateFromDomCaptions();
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
        const rect = this.video.getBoundingClientRect();
        this.root.classList.toggle('jpdb-subtitle-compact-video', rect.width < 560 || rect.height < 260);
        if (rect.width < 120 || rect.height < 80) {
            this.root.style.left = '0';
            this.root.style.top = '0';
            this.root.style.right = 'auto';
            this.root.style.bottom = 'auto';
            this.root.style.width = '100%';
            this.root.style.height = '100%';
            this.positionTranscriptPanel();
            return;
        }
        this.root.style.left = `${rect.left}px`;
        this.root.style.top = `${rect.top}px`;
        this.root.style.right = 'auto';
        this.root.style.bottom = 'auto';
        this.root.style.width = `${Math.max(260, rect.width)}px`;
        this.root.style.height = `${Math.max(160, rect.height)}px`;
        this.positionTranscriptPanel();
    }

    private updateFromLoadedCues(): void {
        if (!this.video) return;
        if (this.selectedTrackId === MPV_TRACK_ID) return;
        const time = this.video.currentTime;
        const cue = this.cues.find(item => time >= item.start && time <= item.end);
        const secondary = this.secondaryCues.find(item => time >= item.start && time <= item.end);
        let changed = false;
        if (cue && cue !== this.currentCue) {
            this.currentCue = cue;
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
        }
    }

    private updateFromDomCaptions(): void {
        if (this.cues.length || this.selectedTrackId) return;
        const text = readPageCaptionText(this.video, this.root);
        if (!text || text === this.lastDomCaption) return;

        this.lastDomCaption = text;
        const now = this.video?.currentTime ?? 0;
        this.currentCue = { start: now, end: now + 4, text };
        this.render();
        this.renderTranscriptPanel();
        this.syncControls();
    }

    private render(): void {
        if (!this.subtitleEl) return;
        const text = this.currentCue?.text.trim() ?? '';
        if (!text) {
            setInnerHtml(this.subtitleEl, this.secondaryCue?.text ? `<div class="jpdb-subtitle-secondary">${escapeWithBreaks(this.secondaryCue.text)}</div>` : '');
            return;
        }

        const secondary = this.options.getSettings().subtitleSecondaryVisible && this.secondaryCue?.text
            ? `<div class="jpdb-subtitle-secondary">${escapeWithBreaks(this.secondaryCue.text)}</div>`
            : '';
        setInnerHtml(this.subtitleEl, `<div class="jpdb-subtitle-primary">${escapeWithBreaks(text)}</div>${secondary}`);
        if (this.options.getSettings().apiKey || this.options.getSettings().localDictionariesEnabled) void this.renderParsedPrimary(text);
    }

    private async renderParsedPrimary(text: string): Promise<void> {
        const settings = this.options.getSettings();
        const key = `${settings.showFurigana}:${settings.hideKnownFurigana}:${text}`;
        const serial = ++this.renderSerial;
        const cached = this.parsedHtmlCache.get(key);
        if (cached) {
            this.replacePrimaryHtml(cached, serial);
            return;
        }

        try {
            const tokens = await this.options.parseJapanese(text);
            const html = withBreaks(renderTokensToHtml(text, tokens, settings));
            this.parsedHtmlCache.set(key, html);
            if (this.parsedHtmlCache.size > 80) this.parsedHtmlCache.delete(this.parsedHtmlCache.keys().next().value ?? '');
            this.replacePrimaryHtml(html, serial);
            log.debug('Subtitle line parsed', { length: text.length, tokens: tokens.length });
        } catch (error) {
            log.debug('Subtitle line parse failed quietly', { length: text.length }, error);
            // Keep plain selectable subtitles if JPDB is unavailable.
        }
    }

    private replacePrimaryHtml(html: string, serial: number): void {
        if (serial !== this.renderSerial) return;
        const primary = this.subtitleEl?.querySelector('.jpdb-subtitle-primary');
        if (primary) setInnerHtml(primary, html);
    }

    private handleClick(event: MouseEvent): void {
        const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        log.debug('Subtitle control clicked', { action });

        if (action === 'cue') this.seekToCue(Number((event.target as HTMLElement).closest<HTMLElement>('[data-index]')?.dataset.index));
        if (action === 'previous') this.seekSubtitle(-1);
        if (action === 'next') this.seekSubtitle(1);
        if (action === 'copy') void this.copySubtitle();
        if (action === 'replay-cue') void this.replayCue(Number((event.target as HTMLElement).closest<HTMLElement>('[data-index]')?.dataset.index));
        if (action === 'load') this.primaryFileInput?.click();
        if (action === 'load-secondary') this.secondaryFileInput?.click();
        if (action === 'list') this.toggleTranscriptPanel();
        if (action === 'tracks') this.toggleTrackPanel();
        if (action === 'mpv-connect') this.mpvConnectedPorts.size ? this.disconnectMpv() : this.connectMpv();
        if (action === 'transcript-left') this.setTranscriptPlacement('left');
        if (action === 'transcript-right') this.setTranscriptPlacement('right');
        if (action === 'transcript-bottom') this.setTranscriptPlacement('bottom');
        if (action === 'primary-track') void this.choosePrimaryTrack((event.target as HTMLElement).closest<HTMLElement>('[data-track-id]')?.dataset.trackId);
        if (action === 'secondary-track') void this.chooseSecondaryTrack((event.target as HTMLElement).closest<HTMLElement>('[data-track-id]')?.dataset.trackId);
        if (action === 'menu') this.toggleMenu();
        if (action === 'toggle') this.toggleSubtitles();
        if (action === 'toggle-secondary') this.toggleSecondarySubtitles();
        this.syncControls();
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

    private async copySubtitle(): Promise<void> {
        const text = [this.currentCue?.text.trim(), this.secondaryCue?.text.trim()].filter(Boolean).join('\n');
        if (!text) return;
        await navigator.clipboard?.writeText(text).catch(error => log.warn('Subtitle clipboard copy failed', error));
        log.debug('Subtitle copied', { length: text.length });
    }

    private async loadSubtitleFile(kind: 'primary' | 'secondary'): Promise<void> {
        const input = kind === 'primary' ? this.primaryFileInput : this.secondaryFileInput;
        const file = input?.files?.[0];
        if (!file) return;
        const text = await file.text();
        const cues = parseSubtitleText(text);
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
        this.selectedTrackId = id;
        if (this.secondaryTrackId === id) this.secondaryTrackId = '';
        this.cues = [];
        this.currentCue = undefined;
        const settings = this.options.getSettings();
        if (!settings.subtitleOverlayVisible) {
            settings.subtitleOverlayVisible = true;
            this.options.onSettingsChange();
        }

        const selected = this.tracks.find(option => option.id === id);
        if (selected?.cues) this.cues = selected.cues;
        if (selected?.track) {
            selected.track.mode = 'hidden';
            this.setNativeTrackModes();
            this.cues = readTrackCues(selected.track);
            if (!this.cues.length) this.cues = await waitForTextTrackCues(selected.track);
        }
        if (selected?.kind === 'youtube' && selected.url) {
            const text = await requestText(withYouTubeVttFormat(selected.url));
            this.cues = parseSubtitleText(text);
            selected.cues = this.cues;
        }
        if (selected?.kind === 'mpv' && this.cues.length) {
            this.currentCue = this.cues[this.cues.length - 1];
        }
        this.setNativeTrackModes();
        this.updateFromLoadedCues();
        this.render();
        this.renderTranscriptPanel();
        this.renderTrackPanel();
        this.syncControls();
        log.info('Primary subtitle track selected', { id, label: selected?.label ?? '', kind: selected?.kind ?? 'unknown', cues: this.cues.length });
    }

    private async selectSecondaryTrack(id: string): Promise<void> {
        if (this.selectedTrackId === id) return;
        this.secondaryTrackId = id;
        this.secondaryCues = [];
        this.secondaryCue = undefined;

        const selected = this.tracks.find(option => option.id === id);
        if (selected?.cues) this.secondaryCues = selected.cues;
        if (selected?.track) {
            selected.track.mode = 'hidden';
            this.setNativeTrackModes();
            this.secondaryCues = readTrackCues(selected.track);
            if (!this.secondaryCues.length) this.secondaryCues = await waitForTextTrackCues(selected.track);
        }
        if (selected?.kind === 'youtube' && selected.url) {
            const text = await requestText(withYouTubeVttFormat(selected.url));
            this.secondaryCues = parseSubtitleText(text);
            selected.cues = this.secondaryCues;
        }
        this.setNativeTrackModes();
        this.updateFromLoadedCues();
        this.render();
        this.renderTrackPanel();
        this.syncControls();
        log.info('Secondary subtitle track selected', { id, label: selected?.label ?? '', kind: selected?.kind ?? 'unknown', cues: this.secondaryCues.length });
    }

    private ensureMpvTrack(): SubtitleTrackOption {
        let track = this.tracks.find(option => option.id === MPV_TRACK_ID);
        if (!track) {
            track = { id: MPV_TRACK_ID, label: 'MPV live subtitles', kind: 'mpv', cues: [] };
            this.tracks.unshift(track);
        }
        return track;
    }

    private openMpvSocket(host: string, port: number, manual: boolean): void {
        if (this.mpvSockets.has(port)) return;
        const socket = new WebSocket(`ws://${host}:${port}`);
        this.mpvSockets.set(port, socket);
        socket.addEventListener('open', () => {
            this.mpvConnecting = false;
            this.mpvConnectedPorts.add(port);
            this.ensureMpvTrack();
            if (!this.video && !this.selectedTrackId) {
                this.selectedTrackId = MPV_TRACK_ID;
                this.cues = this.tracks.find(track => track.id === MPV_TRACK_ID)?.cues ?? [];
            }
            this.options.onToast(`MPV subtitles connected on ${port}.`);
            this.refresh();
            log.info('MPV subtitle bridge connected', { port });
        });
        socket.addEventListener('message', event => this.handleMpvMessage(event.data, port));
        socket.addEventListener('close', () => {
            this.mpvSockets.delete(port);
            this.mpvConnectedPorts.delete(port);
            this.resolveMpvMediaRequestsForPort(port, undefined);
            this.mpvConnecting = this.mpvSockets.size > 0 && this.mpvConnectedPorts.size === 0;
            this.refresh();
            if (!manual && this.options.getSettings().mpvSubtitleAutoConnect && this.options.getSettings().mpvSubtitleMiningEnabled) this.scheduleMpvReconnect();
            log.debug('MPV subtitle bridge socket closed', { port });
        });
        socket.addEventListener('error', () => {
            log.debug('MPV subtitle bridge socket error', { port });
        });
    }

    private scheduleMpvReconnect(): void {
        if (this.mpvReconnectTimer) return;
        this.mpvReconnectTimer = window.setTimeout(() => {
            this.mpvReconnectTimer = undefined;
            if (!this.mpvConnectedPorts.size && this.options.getSettings().mpvSubtitleAutoConnect) this.connectMpv(false);
        }, 8000);
    }

    private handleMpvMessage(data: unknown, port: number): void {
        if (typeof data !== 'string') return;
        let message: unknown;
        try {
            message = JSON.parse(data);
        } catch {
            return;
        }
        if (!message || typeof message !== 'object') return;
        const record = message as Record<string, unknown>;
        if (record.type === 'subtitle') {
            this.receiveMpvSubtitle(record, port);
            return;
        }
        if (record.type === 'audio' || record.type === 'thumbnail') {
            this.receiveMpvMedia(record, port, record.type);
        }
    }

    private receiveMpvSubtitle(record: Record<string, unknown>, port: number): void {
        const id = Number(record.id);
        const text = typeof record.subtitle === 'string' ? record.subtitle.trim() : '';
        const start = Number(record.sub_start);
        const end = Number(record.sub_end);
        if (!Number.isFinite(id) || !text || !Number.isFinite(start) || !Number.isFinite(end)) return;

        const track = this.ensureMpvTrack();
        const cues = track.cues ?? [];
        track.cues = cues;
        const cueId = `mpv-${port}-${id}`;
        let cue = cues.find(item => item.id === cueId);
        if (!cue) {
            cue = { id: cueId, source: 'mpv', mpvId: id, mpvPort: port, start, end, text };
            cues.push(cue);
            cues.sort((a, b) => a.start - b.start || (a.mpvId ?? 0) - (b.mpvId ?? 0));
            if (cues.length > MAX_MPV_CUES) cues.splice(0, cues.length - MAX_MPV_CUES);
        } else {
            cue.start = start;
            cue.end = end;
            cue.text = text;
        }

        if (!this.video || this.selectedTrackId === MPV_TRACK_ID || !this.selectedTrackId) {
            this.selectedTrackId = MPV_TRACK_ID;
            this.cues = cues;
            this.currentCue = cue;
            this.secondaryCue = undefined;
            this.render();
            this.renderTranscriptPanel();
        }
        this.syncControls();
        log.debug('MPV subtitle received', { port, id, length: text.length });
    }

    private receiveMpvMedia(record: Record<string, unknown>, port: number, type: MpvMediaType): void {
        const id = Number(record.id);
        const rawData = typeof record.data === 'string' ? record.data : '';
        if (!Number.isFinite(id)) return;
        const key = mpvMediaKey(type, port, id);
        const dataUrl = rawData ? mpvDataUrl(type, rawData) : undefined;
        if (dataUrl) this.mpvMediaCache.set(key, dataUrl);
        const pending = this.mpvMediaRequests.get(key);
        if (!pending) return;
        window.clearTimeout(pending.timeout);
        this.mpvMediaRequests.delete(key);
        pending.resolve(dataUrl);
    }

    private requestMpvMedia(cue: SubtitleCue, type: MpvMediaType): Promise<string | undefined> {
        if (cue.source !== 'mpv' || typeof cue.mpvId !== 'number' || typeof cue.mpvPort !== 'number' || !Number.isFinite(cue.mpvId) || !Number.isFinite(cue.mpvPort)) return Promise.resolve(undefined);
        const port = cue.mpvPort;
        const id = cue.mpvId;
        const key = mpvMediaKey(type, port, id);
        const cached = this.mpvMediaCache.get(key);
        if (cached) return Promise.resolve(cached);
        const socket = this.mpvSockets.get(port);
        if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.resolve(undefined);
        return new Promise(resolve => {
            const timeout = window.setTimeout(() => {
                this.mpvMediaRequests.delete(key);
                resolve(undefined);
            }, 12000);
            this.mpvMediaRequests.set(key, { resolve, timeout, type });
            socket.send(JSON.stringify({ request: type, id }));
        });
    }

    private async replayCue(index: number): Promise<void> {
        const cue = Number.isFinite(index) ? this.cues[index] : this.currentCue;
        if (!cue || cue.source !== 'mpv') return;
        const dataUrl = await this.requestMpvMedia(cue, 'audio');
        if (!dataUrl) {
            this.options.onToast('MPV audio was not available for that line.');
            return;
        }
        this.mpvAudio?.pause();
        this.mpvAudio = new Audio(dataUrl);
        await this.mpvAudio.play().catch(error => {
            log.warn('MPV audio playback failed', error);
            this.options.onToast('Browser blocked MPV audio playback.');
        });
    }

    private findMpvCueForSentence(sentence?: string): SubtitleCue | undefined {
        const clean = sentence?.replace(/\s+/g, ' ').trim();
        if (clean) {
            const matching = this.cues.find(cue => cue.source === 'mpv' && cue.text.replace(/\s+/g, ' ').trim() === clean);
            if (matching) return matching;
        }
        return this.currentCue?.source === 'mpv' ? this.currentCue : this.cues.slice().reverse().find(cue => cue.source === 'mpv');
    }

    private rejectMpvMediaRequests(): void {
        this.mpvMediaRequests.forEach(request => {
            window.clearTimeout(request.timeout);
            request.resolve(undefined);
        });
        this.mpvMediaRequests.clear();
    }

    private resolveMpvMediaRequestsForPort(port: number, value: string | undefined): void {
        [...this.mpvMediaRequests.entries()].forEach(([key, request]) => {
            if (!key.includes(`:${port}:`)) return;
            window.clearTimeout(request.timeout);
            this.mpvMediaRequests.delete(key);
            request.resolve(value);
        });
    }

    private setNativeTrackModes(): void {
        for (const option of this.tracks) {
            if (option.track) option.track.mode = option.id === this.selectedTrackId || option.id === this.secondaryTrackId ? 'hidden' : 'disabled';
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
            log.debug('YouTube video changed for subtitle discovery', { videoId });
        }

        const tracks = getYouTubeCaptionTracks();
        if (!tracks.length) return;

        for (const track of tracks) {
            if (this.tracks.some(existing => existing.kind === 'youtube' && existing.url === track.url)) continue;
            this.tracks.push({ id: `youtube-${this.tracks.length}`, label: track.label, kind: 'youtube', url: track.url });
        }
        log.debug('YouTube caption tracks discovered', { tracks: tracks.length });

        const primary = this.tracks.find(track => track.kind === 'youtube' && isJapaneseTrack(track.label))
            ?? this.tracks.find(track => track.kind === 'youtube');
        const secondary = this.tracks.find(track => track.kind === 'youtube' && !isJapaneseTrack(track.label));
        if (primary && !this.selectedTrackId) await this.selectTrack(primary.id);
        if (secondary && this.options.getSettings().subtitleSecondaryVisible && !this.secondaryTrackId) await this.selectSecondaryTrack(secondary.id);
        this.syncControls();
    }

    private syncControls(): void {
        const settings = this.options.getSettings();
        const hasLines = Boolean(this.cues.length || this.currentCue?.text);
        this.root?.classList.toggle('jpdb-subtitle-menu-open', !this.menuEl?.hidden);
        this.root?.classList.toggle('jpdb-subtitle-panel-open', !this.transcriptPanel?.hidden);
        this.root?.classList.toggle('jpdb-subtitle-has-lines', hasLines);
        this.root?.classList.toggle('jpdb-subtitle-has-track', Boolean(this.selectedTrackId || hasLines));
        if (this.menuEl && !this.menuEl.hidden) this.renderMenu();
        const secondaryToggle = this.menuEl?.querySelector<HTMLButtonElement>('[data-action="toggle-secondary"]');
        if (secondaryToggle) secondaryToggle.textContent = settings.subtitleSecondaryVisible ? 'Native subtitles on' : 'Native subtitles off';
        this.syncSubtitleToggle(settings);
        this.syncLineNavigationButtons(hasLines);
        this.syncTranscriptButton(hasLines);
        this.syncTrackButton();
        this.syncMpvButton(settings);
        this.syncStatusText();
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
        for (const action of ['previous', 'next']) {
            const button = this.root?.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
            if (!button) continue;
            button.hidden = !hasLines;
            button.disabled = !this.video || !hasLines;
        }
    }

    private syncTranscriptButton(hasLines: boolean): void {
        const list = this.root?.querySelector<HTMLButtonElement>('[data-action="list"]');
        if (!list) return;
        list.hidden = !hasLines;
        setInnerHtml(list, subtitleIcon('transcript'));
        list.title = this.transcriptPanel?.hidden || this.panelMode !== 'lines' ? 'Open transcript' : 'Close transcript';
        list.setAttribute('aria-label', list.title);
        list.setAttribute('aria-pressed', String(!this.transcriptPanel?.hidden && this.panelMode === 'lines'));
    }

    private syncTrackButton(): void {
        const tracks = this.root?.querySelector<HTMLButtonElement>('[data-action="tracks"]');
        if (!tracks) return;
        tracks.hidden = false;
        setInnerHtml(tracks, subtitleIcon('tracks'));
        tracks.title = this.selectedTrackId ? 'Subtitle tracks' : 'Choose subtitles';
        tracks.setAttribute('aria-label', tracks.title);
        tracks.setAttribute('aria-pressed', String(Boolean(this.selectedTrackId)));
    }

    private syncMpvButton(settings: ReaderSettings): void {
        const mpv = this.root?.querySelector<HTMLButtonElement>('[data-action="mpv-connect"]');
        if (!mpv) return;
        mpv.hidden = !settings.mpvSubtitleMiningEnabled && !this.mpvConnectedPorts.size;
        setInnerHtml(mpv, subtitleIcon(this.mpvConnectedPorts.size ? 'plug-on' : 'plug'));
        mpv.title = this.mpvConnectedPorts.size
            ? `Disconnect MPV bridge (${[...this.mpvConnectedPorts].join(', ')})`
            : this.mpvConnecting ? 'Connecting to MPV bridge' : 'Connect to MPV subtitle bridge';
        mpv.setAttribute('aria-label', mpv.title);
        mpv.setAttribute('aria-pressed', String(this.mpvConnectedPorts.size > 0));
    }

    private syncStatusText(): void {
        if (!this.statusEl) return;

        if (this.selectedTrackId === MPV_TRACK_ID && this.mpvConnectedPorts.size) {
            const index = this.currentCue ? this.cues.findIndex(cue => cue === this.currentCue) + 1 : 0;
            this.statusEl.textContent = index > 0 ? `MPV ${index}/${this.cues.length}` : `MPV ${this.cues.length}`;
            this.statusEl.hidden = false;
        } else if (this.cues.length) {
            const index = this.currentCue ? this.cues.findIndex(cue => cue === this.currentCue) + 1 : 0;
            this.statusEl.textContent = index > 0 ? `${index}/${this.cues.length}` : `${this.cues.length}`;
            this.statusEl.hidden = false;
        } else if (this.currentCue?.text) {
            this.statusEl.textContent = 'Page captions';
            this.statusEl.hidden = false;
        } else {
            this.statusEl.textContent = '';
            this.statusEl.hidden = true;
        }
    }

    private renderMenu(): void {
        if (!this.menuEl) return;
        const hasLines = Boolean(this.cues.length || this.currentCue?.text);
        const hasSecondary = Boolean(this.secondaryTrackId || this.secondaryCues.length || this.secondaryCue?.text);
        const signature = [
            hasLines,
            hasSecondary,
            this.options.getSettings().subtitleSecondaryVisible,
            this.currentCue?.source === 'mpv',
            this.mpvConnectedPorts.size,
            this.transcriptPanel?.hidden,
            this.panelMode,
        ].join(':');
        if (!this.menuEl.hidden && this.lastMenuSignature === signature) return;
        this.lastMenuSignature = signature;
        setInnerHtml(this.menuEl, `
            <div class="jpdb-subtitle-menu-head">
                <span>Options</span>
                <button class="jpdb-subtitle-close" type="button" data-action="menu" aria-label="Close subtitle options">×</button>
            </div>
            <button type="button" data-action="load">Load Japanese subtitles</button>
            <button type="button" data-action="load-secondary">Load native subtitles</button>
            <button type="button" data-action="mpv-connect">${this.mpvConnectedPorts.size ? 'Disconnect MPV bridge' : 'Connect MPV bridge'}</button>
            ${hasLines ? `<button type="button" data-action="list">${this.transcriptPanel?.hidden || this.panelMode !== 'lines' ? 'Open transcript panel' : 'Close transcript panel'}</button>` : ''}
            ${hasLines ? `<button type="button" data-action="copy">Copy current line</button>` : ''}
            ${this.currentCue?.source === 'mpv' ? '<button type="button" data-action="replay-cue">Replay current MPV line</button>' : ''}
            ${hasSecondary ? `<button type="button" data-action="toggle-secondary" aria-pressed="${this.options.getSettings().subtitleSecondaryVisible}">${this.options.getSettings().subtitleSecondaryVisible ? 'Native subtitles on' : 'Native subtitles off'}</button>` : ''}
        `);
    }

    private toggleMenu(): void {
        if (!this.menuEl) return;
        this.lastMenuSignature = '';
        this.renderMenu();
        this.menuEl.hidden = !this.menuEl.hidden;
        if (!this.menuEl.hidden && this.transcriptPanel) this.transcriptPanel.hidden = true;
    }

    private toggleSubtitles(): void {
        const settings = this.options.getSettings();
        settings.subtitleOverlayVisible = !settings.subtitleOverlayVisible;
        this.options.onSettingsChange();
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

    private toggleTranscriptPanel(): void {
        if (!this.transcriptPanel) return;
        if (!this.cues.length) {
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
    }

    private toggleTrackPanel(): void {
        if (!this.transcriptPanel) return;
        const shouldOpen = this.transcriptPanel.hidden || this.panelMode !== 'tracks';
        this.panelMode = 'tracks';
        this.transcriptPanel.hidden = !shouldOpen;
        if (shouldOpen) {
            this.options.getSettings().subtitleTranscriptVisible = false;
            this.options.onSettingsChange();
        }
        if (this.menuEl) this.menuEl.hidden = true;
        this.renderTrackPanel();
        this.positionTranscriptPanel();
    }

    private renderTranscriptPanel(force = false): void {
        if (!this.transcriptPanel || this.transcriptPanel.hidden || this.panelMode !== 'lines') return;
        if (!this.cues.length) {
            this.panelMode = 'tracks';
            this.renderTrackPanel();
            return;
        }
        const currentIndex = this.currentCue ? this.cues.findIndex(cue => cue === this.currentCue) : -1;
        const signature = [
            this.cues.length,
            this.secondaryCues.length,
            currentIndex,
            this.options.getSettings().subtitleTranscriptPlacement,
            this.mpvConnectedPorts.size ? [...this.mpvConnectedPorts].join(',') : '',
        ].join(':');
        if (!force && this.lastTranscriptSignature === signature) {
            this.updateTranscriptActiveLine(currentIndex);
            return;
        }
        this.lastTranscriptSignature = signature;
        const placement = this.options.getSettings().subtitleTranscriptPlacement;
        setInnerHtml(this.transcriptPanel, `
            <div class="jpdb-subtitle-list-head">
                <span>Transcript</span>
                <div class="jpdb-subtitle-placement" aria-label="Transcript position">
                    <button type="button" data-action="transcript-left" aria-pressed="${placement === 'left'}" title="Move transcript left" aria-label="Move transcript left">${subtitleIcon('panel-left')}</button>
                    <button type="button" data-action="transcript-right" aria-pressed="${placement === 'right'}" title="Move transcript right" aria-label="Move transcript right">${subtitleIcon('panel-right')}</button>
                    <button type="button" data-action="transcript-bottom" aria-pressed="${placement === 'bottom'}" title="Move transcript below" aria-label="Move transcript below">${subtitleIcon('panel-bottom')}</button>
                </div>
                <button class="jpdb-subtitle-close" type="button" data-action="list" aria-label="Close subtitle lines">×</button>
            </div>
            <div class="jpdb-subtitle-list-scroll">
                ${this.cues.map((cue, index) => this.renderTranscriptRow(cue, index, currentIndex)).join('')}
            </div>
        `);
        this.bindTranscriptScroller();
        this.positionTranscriptPanel();
        this.scrollTranscriptToActive();
        this.scheduleTranscriptHydration(currentIndex);
    }

    private renderTranscriptRow(cue: SubtitleCue, index: number, currentIndex: number): string {
        const secondary = findAlignedCue(this.secondaryCues, cue)?.text.trim();
        const replay = cue.source === 'mpv'
            ? `<button class="jpdb-subtitle-row-replay" type="button" data-action="replay-cue" data-index="${index}" title="Replay MPV audio" aria-label="Replay MPV audio">${subtitleIcon('play')}</button>`
            : '';
        return `
            <div class="jpdb-subtitle-list-row ${index === currentIndex ? 'active' : ''}" data-action="cue" data-index="${index}" data-row-index="${index}">
                <button class="jpdb-subtitle-row-seek" type="button" data-action="cue" data-index="${index}" title="Jump to ${formatSubtitleTime(cue.start)}" aria-label="Jump to subtitle at ${formatSubtitleTime(cue.start)}">${subtitleIcon('play')}</button>
                <div class="jpdb-subtitle-row-body">
                    <span class="jpdb-subtitle-row-time">${formatSubtitleTime(cue.start)}</span>
                    <strong class="jpdb-subtitle-row-text" lang="ja" data-transcript-text data-row-index="${index}">${escapeWithBreaks(cue.text)}</strong>
                    ${secondary ? `<em class="jpdb-subtitle-row-translation">${escapeWithBreaks(secondary)}</em>` : ''}
                </div>
                ${replay}
            </div>
        `;
    }

    private updateTranscriptActiveLine(currentIndex: number): void {
        if (!this.transcriptPanel || this.transcriptPanel.hidden || this.panelMode !== 'lines') return;
        this.transcriptPanel.querySelectorAll<HTMLElement>('.jpdb-subtitle-list-row.active')
            .forEach(row => row.classList.remove('active'));
        const active = this.transcriptPanel.querySelector<HTMLElement>(`.jpdb-subtitle-list-row[data-row-index="${currentIndex}"]`);
        if (active) active.classList.add('active');
        this.scrollTranscriptToActive();
        this.scheduleTranscriptHydration(currentIndex);
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

    private scheduleTranscriptHydration(preferredIndex = this.activeTranscriptIndex()): void {
        if (this.transcriptHydrateFrame) return;
        this.transcriptHydrateFrame = requestAnimationFrame(() => {
            this.transcriptHydrateFrame = undefined;
            void this.hydrateTranscriptRows(preferredIndex);
        });
    }

    private activeTranscriptIndex(): number {
        return this.currentCue ? this.cues.findIndex(cue => cue === this.currentCue) : -1;
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

        return [...indexes].sort((a, b) => a - b);
    }

    private async hydrateTranscriptRow(index: number, settings: ReaderSettings): Promise<void> {
        const cue = this.cues[index];
        const target = this.transcriptPanel?.querySelector<HTMLElement>(`.jpdb-subtitle-row-text[data-row-index="${index}"]`);
        if (!cue || !target) return;
        const key = `${settings.showFurigana}:${settings.hideKnownFurigana}:${cue.text}`;
        if (target.dataset.parsedKey === key) return;

        const cached = this.parsedHtmlCache.get(key);
        if (cached) {
            target.dataset.parsedKey = key;
            setInnerHtml(target, cached);
            return;
        }

        try {
            const tokens = await this.options.parseJapanese(cue.text);
            const html = withBreaks(renderTokensToHtml(cue.text, tokens, settings));
            this.parsedHtmlCache.set(key, html);
            if (this.parsedHtmlCache.size > 80) this.parsedHtmlCache.delete(this.parsedHtmlCache.keys().next().value ?? '');
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
        const tracks = this.tracks;
        setInnerHtml(this.transcriptPanel, `
            <div class="jpdb-subtitle-list-head">
                <span>Subtitle tracks</span>
                <button class="jpdb-subtitle-close" type="button" data-action="tracks" aria-label="Close subtitle tracks">×</button>
            </div>
            <div class="jpdb-subtitle-list-scroll">
                <div class="jpdb-subtitle-track-tools">
                    <button type="button" data-action="load">Load Japanese subtitles</button>
                    <button type="button" data-action="load-secondary">Load native subtitles</button>
                    <button type="button" data-action="mpv-connect">${this.mpvConnectedPorts.size ? 'Disconnect MPV' : 'Connect MPV'}</button>
                </div>
                ${tracks.length ? tracks.map(track => `
                    <div class="jpdb-subtitle-track-row ${track.id === this.selectedTrackId || track.id === this.secondaryTrackId ? 'active' : ''}" data-track-id="${escapeHtml(track.id)}">
                        <strong>${escapeHtml(track.label)}</strong>
                        <span>${formatTrackKind(track.kind)}${track.id === this.selectedTrackId ? ' · Japanese overlay' : ''}${track.id === this.secondaryTrackId ? ' · native overlay' : ''}</span>
                        <div>
                            <button type="button" data-action="primary-track" aria-pressed="${track.id === this.selectedTrackId}">Japanese</button>
                            <button type="button" data-action="secondary-track" aria-pressed="${track.id === this.secondaryTrackId}">Native</button>
                        </div>
                    </div>
                `).join('') : '<div class="jpdb-subtitle-list-empty">No subtitle tracks found yet. Load a file, turn on captions, or play the video for a moment.</div>'}
            </div>
        `);
    }

    private async choosePrimaryTrack(id?: string): Promise<void> {
        if (!id) return;
        await this.selectTrack(id);
    }

    private async chooseSecondaryTrack(id?: string): Promise<void> {
        if (!id) return;
        await this.selectSecondaryTrack(id);
    }

    private setTranscriptPlacement(placement: ReaderSettings['subtitleTranscriptPlacement']): void {
        const settings = this.options.getSettings();
        settings.subtitleTranscriptPlacement = placement;
        this.options.onSettingsChange();
        this.lastTranscriptSignature = '';
        this.renderTranscriptPanel(true);
        this.positionTranscriptPanel();
        this.syncControls();
        log.info('Subtitle transcript placement changed', { placement });
    }

    private positionTranscriptPanel(): void {
        if (!this.transcriptPanel || this.transcriptPanel.hidden) return;
        const panel = this.transcriptPanel;
        const viewportWidth = Math.max(320, window.innerWidth);
        const viewportHeight = Math.max(240, window.innerHeight);
        const layout = computeTranscriptPanelLayout({
            placement: this.options.getSettings().subtitleTranscriptPlacement,
            videoRect: this.video?.getBoundingClientRect(),
            viewportWidth,
            viewportHeight,
            compactPanel: viewportWidth <= 700 || window.matchMedia?.('(pointer: coarse)').matches,
        });
        applyTranscriptPanelLayout(panel, layout);
    }

    private scheduleAlignToVideo(): void {
        if (this.alignFrame) cancelAnimationFrame(this.alignFrame);
        this.alignFrame = requestAnimationFrame(() => {
            this.alignFrame = undefined;
            this.alignToVideo();
        });
    }
}

interface TranscriptPanelLayoutOptions {
    placement: ReaderSettings['subtitleTranscriptPlacement'];
    videoRect?: DOMRect;
    viewportWidth: number;
    viewportHeight: number;
    compactPanel: boolean;
}

interface TranscriptPanelLayout {
    left: number;
    top: number;
    width: number;
    height: number;
    viewportWidth: number;
    margin: number;
}

const TRANSCRIPT_PANEL_MARGIN = 10;

function computeTranscriptPanelLayout(options: TranscriptPanelLayoutOptions): TranscriptPanelLayout {
    const margin = TRANSCRIPT_PANEL_MARGIN;
    const videoRect = usableVideoRect(options.videoRect) ? options.videoRect : undefined;
    if (options.compactPanel) return compactTranscriptPanelLayout(options.viewportWidth, options.viewportHeight, margin);
    if (videoRect) {
        return videoAnchoredTranscriptLayout(options.placement, videoRect, options.viewportWidth, options.viewportHeight, margin);
    }
    return viewportTranscriptPanelLayout(options.placement, options.viewportWidth, options.viewportHeight, margin);
}

function compactTranscriptPanelLayout(viewportWidth: number, viewportHeight: number, margin: number): TranscriptPanelLayout {
    const top = Math.max(margin, viewportHeight - Math.min(390, viewportHeight * 0.48) - margin);
    return {
        left: margin,
        top,
        width: viewportWidth - margin * 2,
        height: viewportHeight - top - margin,
        viewportWidth,
        margin,
    };
}

function videoAnchoredTranscriptLayout(
    placement: ReaderSettings['subtitleTranscriptPlacement'],
    videoRect: DOMRect,
    viewportWidth: number,
    viewportHeight: number,
    margin: number,
): TranscriptPanelLayout {
    const availableRight = viewportWidth - videoRect.right - margin * 2;
    const availableLeft = videoRect.left - margin * 2;
    const belowVideo = viewportHeight - videoRect.bottom - margin;
    const effectivePlacement = shouldUseBottomTranscriptFallback(placement, availableLeft, availableRight, belowVideo)
        ? 'bottom'
        : placement;

    if (effectivePlacement === 'right') return rightTranscriptPanelLayout(videoRect, viewportWidth, viewportHeight, margin, availableRight);
    if (effectivePlacement === 'left') return leftTranscriptPanelLayout(videoRect, viewportWidth, viewportHeight, margin, availableLeft);
    return bottomTranscriptPanelLayout(videoRect, viewportWidth, viewportHeight, margin);
}

function shouldUseBottomTranscriptFallback(
    placement: ReaderSettings['subtitleTranscriptPlacement'],
    availableLeft: number,
    availableRight: number,
    belowVideo: number,
): boolean {
    return ((placement === 'right' && availableRight < 280) || (placement === 'left' && availableLeft < 280)) && belowVideo >= 150;
}

function rightTranscriptPanelLayout(videoRect: DOMRect, viewportWidth: number, viewportHeight: number, margin: number, availableRight: number): TranscriptPanelLayout {
    const width = Math.min(460, viewportWidth - margin * 2);
    if (availableRight < 280) {
        return { left: Math.max(margin, viewportWidth - width - margin), top: Math.max(margin, videoRect.top), width, height: Math.min(Math.max(280, videoRect.height), viewportHeight - margin), viewportWidth, margin };
    }
    const top = Math.max(margin, videoRect.top);
    return { left: videoRect.right + margin, top, width: Math.min(460, availableRight), height: Math.min(videoRect.height, viewportHeight - top - margin), viewportWidth, margin };
}

function leftTranscriptPanelLayout(videoRect: DOMRect, viewportWidth: number, viewportHeight: number, margin: number, availableLeft: number): TranscriptPanelLayout {
    const top = Math.max(margin, videoRect.top);
    const fallback = { left: margin, top, width: Math.min(460, viewportWidth - margin * 2), height: Math.min(videoRect.height, viewportHeight - top - margin), viewportWidth, margin };
    if (availableLeft < 280) return fallback;
    const width = Math.min(460, availableLeft);
    return { ...fallback, left: Math.max(margin, videoRect.left - width - margin), width };
}

function bottomTranscriptPanelLayout(videoRect: DOMRect, viewportWidth: number, viewportHeight: number, margin: number): TranscriptPanelLayout {
    const width = Math.min(Math.max(320, videoRect.width), viewportWidth - margin * 2);
    const left = Math.max(margin, Math.min(videoRect.left, viewportWidth - width - margin));
    const preferredTop = videoRect.bottom + margin;
    const below = viewportHeight - preferredTop - margin;
    const top = below < 150
        ? Math.max(margin, viewportHeight - Math.min(360, viewportHeight * 0.42) - margin)
        : preferredTop;
    return { left, top, width, height: Math.min(360, viewportHeight - top - margin), viewportWidth, margin };
}

function viewportTranscriptPanelLayout(
    placement: ReaderSettings['subtitleTranscriptPlacement'],
    viewportWidth: number,
    viewportHeight: number,
    margin: number,
): TranscriptPanelLayout {
    const width = placement === 'bottom' ? viewportWidth - margin * 2 : Math.min(460, viewportWidth - margin * 2);
    if (placement === 'bottom') {
        const top = Math.max(96, viewportHeight - Math.min(360, viewportHeight * 0.44) - margin);
        return { left: margin, top, width, height: viewportHeight - top - margin, viewportWidth, margin };
    }
    const top = 68;
    const left = placement === 'left' ? margin : Math.max(margin, viewportWidth - width - margin);
    return { left, top, width, height: viewportHeight - top - margin, viewportWidth, margin };
}

function applyTranscriptPanelLayout(panel: HTMLElement, layout: TranscriptPanelLayout): void {
    panel.style.left = `${Math.round(layout.left)}px`;
    panel.style.top = `${Math.round(layout.top)}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.width = `${Math.round(Math.max(260, Math.min(layout.width, layout.viewportWidth - layout.margin * 2)))}px`;
    panel.style.maxHeight = `${Math.round(Math.max(150, layout.height))}px`;
}

function usableVideoRect(rect?: DOMRect): rect is DOMRect {
    return Boolean(rect && rect.width >= 120 && rect.height >= 80);
}

type SubtitleIconName = 'eye' | 'eye-off' | 'menu' | 'panel-bottom' | 'panel-left' | 'panel-right' | 'play' | 'plug' | 'plug-on' | 'tracks' | 'transcript';

function subtitleIcon(name: SubtitleIconName): string {
    const paths: Record<SubtitleIconName, string> = {
        eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
        'eye-off': '<path d="m3 3 18 18"/><path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-3.2 3.8"/><path d="M6.6 6.8A18 18 0 0 0 2 12s3.5 6 10 6c1.5 0 2.8-.3 4-.8"/>',
        menu: '<path d="M5 7h14"/><path d="M5 12h14"/><path d="M5 17h14"/>',
        'panel-bottom': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 14h16"/>',
        'panel-left': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M10 5v14"/>',
        'panel-right': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M14 5v14"/>',
        play: '<path d="M8 5v14l11-7-11-7Z"/>',
        plug: '<path d="M9 7v5"/><path d="M15 7v5"/><path d="M7 12h10v2a5 5 0 0 1-10 0v-2Z"/><path d="M12 19v3"/>',
        'plug-on': '<path d="M9 7v5"/><path d="M15 7v5"/><path d="M7 12h10v2a5 5 0 0 1-10 0v-2Z"/><path d="M12 19v3"/><path d="M18 5l2-2"/><path d="M20 9h2"/>',
        tracks: '<path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h16"/>',
        transcript: '<path d="M5 4h14v16H5z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/>',
    };
    return `<svg class="jpdb-subtitle-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}

function formatTrackKind(kind: SubtitleTrackOption['kind']): string {
    if (kind === 'native') return 'page track';
    if (kind === 'youtube') return 'YouTube captions';
    if (kind === 'mpv') return 'MPV bridge';
    return 'loaded file';
}

function getCueText(cue: VTTCue | TextTrackCue): string {
    if ('text' in cue && typeof cue.text === 'string') return cue.text;
    return '';
}

function readTrackCues(track: TextTrack): SubtitleCue[] {
    return Array.from(track.cues ?? [])
        .map(cue => ({ start: cue.startTime, end: cue.endTime, text: getCueText(cue as VTTCue | TextTrackCue).trim() }))
        .filter(cue => cue.text)
        .sort((a, b) => a.start - b.start);
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

export function parseSubtitleText(text: string): SubtitleCue[] {
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
        const cueText = lines.slice(timeIndex + 1).join('\n').replace(/<[^>]+>/g, '').trim();
        if (Number.isFinite(start) && Number.isFinite(end) && cueText) cues.push({ start, end, text: cueText });
    }
    return cues.sort((a, b) => a.start - b.start);
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
    if (direct) return direct;

    if (!video) return '';
    return collectCaptionTexts(
        [...document.body.querySelectorAll<HTMLElement>('div, span, p')],
        video,
        readerRoot,
        true,
    );
}

function parseSubtitleTime(value: string): number {
    const match = value.trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/);
    if (!match) return Number.NaN;
    const [, hours = '0', minutes, seconds, fraction] = match;
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(fraction.padEnd(3, '0')) / 1000;
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

function parseMpvPorts(value: string): number[] {
    return [...new Set(value
        .split(/[\s,]+/)
        .map(item => Number(item))
        .filter(item => Number.isInteger(item) && item > 0 && item <= 65535))];
}

function mpvMediaKey(type: MpvMediaType, port: number, id: number): string {
    return `${type}:${port}:${id}`;
}

function mpvDataUrl(type: MpvMediaType, base64: string): string {
    return type === 'audio'
        ? `data:audio/mpeg;base64,${base64}`
        : `data:image/jpeg;base64,${base64}`;
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
        if (lines.length >= 3) break;
    }
    return lines.join('\n').trim();
}

function isLikelyCaptionElement(element: HTMLElement, video?: HTMLVideoElement, readerRoot?: HTMLElement, nearVideoOnly = false): boolean {
    if (!element.isConnected) return false;
    if (readerRoot && (element === readerRoot || readerRoot.contains(element))) return false;
    if (element.closest('[data-jpdb-reader-root], script, style, noscript, textarea, input, select, button')) return false;

    const text = normalizeCaptionText(element.innerText || element.textContent || '');
    if (text.length < 2 || text.length > 180 || !/[\u3040-\u30ff\u3400-\u9fff]/.test(text)) return false;
    if (text.split('\n').length > 4) return false;
    if ([...element.children].some(child => /[\u3040-\u30ff\u3400-\u9fff]/.test(child.textContent ?? ''))) return false;

    const rect = element.getBoundingClientRect();
    if (rect.width < 24 || rect.height < 10 || rect.bottom < 0 || rect.top > window.innerHeight) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') <= 0) return false;

    if (!video) return !nearVideoOnly;
    const videoRect = video.getBoundingClientRect();
    if (videoRect.width < 120 || videoRect.height < 80) return !nearVideoOnly;
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
        .join('\n');
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

function getYouTubeCaptionTracks(): Array<{ label: string; url: string }> {
    const response = getYouTubePlayerResponse();
    const rawTracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(rawTracks)) return [];

    return rawTracks
        .map(track => {
            const record = track as {
                baseUrl?: string;
                languageCode?: string;
                name?: { simpleText?: string; runs?: Array<{ text?: string }> };
            };
            const label = record.name?.simpleText
                ?? record.name?.runs?.map(run => run.text ?? '').join('')
                ?? record.languageCode
                ?? 'YouTube subtitles';
            return typeof record.baseUrl === 'string' ? { label: `${label} ${record.languageCode ?? ''}`.trim(), url: record.baseUrl } : null;
        })
        .filter((track): track is { label: string; url: string } => track !== null);
}

function getYouTubePlayerResponse(): { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: unknown[] } } } | null {
    const fromWindow = (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse;
    if (fromWindow && typeof fromWindow === 'object') return fromWindow as ReturnType<typeof getYouTubePlayerResponse>;

    for (const script of Array.from(document.scripts)) {
        const text = script.textContent ?? '';
        for (const marker of ['ytInitialPlayerResponse = ', 'ytInitialPlayerResponse=', 'var ytInitialPlayerResponse = ']) {
            const start = text.indexOf(marker);
            if (start < 0) continue;
            const raw = extractJsonObject(text, start + marker.length);
            if (!raw) continue;
            try {
                return JSON.parse(raw) as ReturnType<typeof getYouTubePlayerResponse>;
            } catch {
                // Try the next known marker.
            }
        }
        const escaped = text.match(/"playerResponse"\s*:\s*"((?:\\.|[^"\\])+)"/);
        if (escaped?.[1]) {
            try {
                return JSON.parse(JSON.parse(`"${escaped[1]}"`)) as ReturnType<typeof getYouTubePlayerResponse>;
            } catch {
                // Keep looking through later scripts.
            }
        }
    }
    return null;
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

function withYouTubeVttFormat(url: string): string {
    const parsed = new URL(url);
    parsed.searchParams.set('fmt', 'vtt');
    return parsed.href;
}

function requestText(url: string): Promise<string> {
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
        const element = node.nodeType === Node.ELEMENT_NODE
            ? node as Element
            : node.parentElement;
        return Boolean(element?.closest?.('[data-jpdb-reader-root]'));
    });
}
