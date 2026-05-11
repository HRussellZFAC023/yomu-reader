import { escapeHtml, renderTokensToHtml, setInnerHtml } from './dom';
import { Logger } from './logger';
import { accentToRgba, matchesShortcut } from './settings';
import type { JPDBToken, ReaderSettings } from './types';
import { getUserscriptHttpRequest } from './userscript';

interface SubtitleCue {
    start: number;
    end: number;
    text: string;
}

interface SubtitleTrackOption {
    id: string;
    label: string;
    kind: 'native' | 'file' | 'youtube';
    track?: TextTrack;
    cues?: SubtitleCue[];
    url?: string;
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
        window.addEventListener('resize', () => this.scheduleAlignToVideo(), { passive: true });
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
        this.root.style.setProperty('--subtitle-font-size', `${settings.subtitleFontSize}px`);
        this.root.style.setProperty('--subtitle-bottom', `${settings.subtitleBottomOffset}%`);
        this.root.style.setProperty('--subtitle-color', settings.subtitleTextColor);
        this.root.style.setProperty('--subtitle-outline', settings.subtitleOutlineColor);
        this.root.style.setProperty('--subtitle-background-rgba', accentToRgba(settings.subtitleBackgroundColor, settings.subtitleBackgroundOpacity));
        this.root.style.setProperty('--subtitle-family', settings.subtitleFontFamily);
        this.root.style.setProperty('--subtitle-weight', String(settings.subtitleFontWeight));
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
                <button class="jpdb-subtitle-toggle" type="button" data-action="toggle" title="Show or hide subtitles" aria-label="Show or hide subtitles">Subs</button>
                <button type="button" data-action="previous" title="Previous subtitle" aria-label="Previous subtitle">‹</button>
                <button type="button" data-action="list" title="Subtitle lines">Lines</button>
                <span class="jpdb-subtitle-status" data-role="status" hidden></span>
                <button type="button" data-action="next" title="Next subtitle" aria-label="Next subtitle">›</button>
                <button type="button" data-action="tracks" title="Subtitle tracks">Tracks</button>
                <button type="button" data-action="menu" title="Subtitle options" aria-label="Subtitle options">...</button>
            </div>
            <div class="jpdb-subtitle-menu" hidden></div>
            <div class="jpdb-subtitle-list" hidden></div>
            <input hidden type="file" data-file="primary" accept=".srt,.vtt,text/vtt">
            <input hidden type="file" data-file="secondary" accept=".srt,.vtt,text/vtt">
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
        if (!this.root || !this.video) return;
        const rect = this.video.getBoundingClientRect();
        if (rect.width < 120 || rect.height < 80) {
            this.root.style.left = '0';
            this.root.style.top = '0';
            this.root.style.right = 'auto';
            this.root.style.bottom = 'auto';
            this.root.style.width = '100%';
            this.root.style.height = '100%';
            return;
        }
        this.root.style.left = `${rect.left}px`;
        this.root.style.top = `${rect.top}px`;
        this.root.style.right = 'auto';
        this.root.style.bottom = 'auto';
        this.root.style.width = `${Math.max(260, rect.width)}px`;
        this.root.style.height = `${Math.max(160, rect.height)}px`;
    }

    private updateFromLoadedCues(): void {
        if (!this.video) return;
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
        if (action === 'load') this.primaryFileInput?.click();
        if (action === 'load-secondary') this.secondaryFileInput?.click();
        if (action === 'list') this.toggleTranscriptPanel();
        if (action === 'tracks') this.toggleTrackPanel();
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
            label: file.name.replace(/\.(srt|vtt)$/i, ''),
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
        this.root?.classList.toggle('jpdb-subtitle-menu-open', !this.menuEl?.hidden);
        this.root?.classList.toggle('jpdb-subtitle-panel-open', !this.transcriptPanel?.hidden);
        this.root?.classList.toggle('jpdb-subtitle-has-lines', Boolean(this.cues.length || this.currentCue?.text));
        this.root?.classList.toggle('jpdb-subtitle-has-track', Boolean(this.selectedTrackId || this.cues.length || this.currentCue?.text));
        if (this.menuEl && !this.menuEl.hidden) this.renderMenu();
        const secondaryToggle = this.menuEl?.querySelector<HTMLButtonElement>('[data-action="toggle-secondary"]');
        if (secondaryToggle) secondaryToggle.textContent = settings.subtitleSecondaryVisible ? 'Native subtitles on' : 'Native subtitles off';
        const subtitleToggle = this.root?.querySelector<HTMLButtonElement>('.jpdb-subtitle-toggle');
        if (subtitleToggle) {
            subtitleToggle.textContent = settings.subtitleOverlayVisible ? 'Hide' : 'Show';
            subtitleToggle.setAttribute('aria-pressed', String(settings.subtitleOverlayVisible));
            subtitleToggle.title = settings.subtitleOverlayVisible ? 'Hide subtitles' : 'Show subtitles';
            subtitleToggle.setAttribute('aria-label', subtitleToggle.title);
        }
        const previous = this.root?.querySelector<HTMLButtonElement>('[data-action="previous"]');
        const next = this.root?.querySelector<HTMLButtonElement>('[data-action="next"]');
        const list = this.root?.querySelector<HTMLButtonElement>('[data-action="list"]');
        const tracks = this.root?.querySelector<HTMLButtonElement>('[data-action="tracks"]');
        const hasLines = Boolean(this.cues.length || this.currentCue?.text);
        if (previous) {
            previous.hidden = !hasLines;
            previous.disabled = !this.video || !hasLines;
        }
        if (next) {
            next.hidden = !hasLines;
            next.disabled = !this.video || !hasLines;
        }
        if (list) {
            list.hidden = !hasLines;
            list.textContent = 'Lines';
        }
        if (tracks) {
            tracks.hidden = false;
            tracks.textContent = this.selectedTrackId ? 'Tracks' : 'Choose subs';
            tracks.setAttribute('aria-pressed', String(Boolean(this.selectedTrackId)));
        }
        if (!this.statusEl) return;

        if (this.cues.length) {
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
        if (!this.transcriptPanel.hidden && this.menuEl) this.menuEl.hidden = true;
        this.renderTranscriptPanel();
    }

    private toggleTrackPanel(): void {
        if (!this.transcriptPanel) return;
        const shouldOpen = this.transcriptPanel.hidden || this.panelMode !== 'tracks';
        this.panelMode = 'tracks';
        this.transcriptPanel.hidden = !shouldOpen;
        if (this.menuEl) this.menuEl.hidden = true;
        this.renderTrackPanel();
    }

    private renderTranscriptPanel(): void {
        if (!this.transcriptPanel || this.transcriptPanel.hidden || this.panelMode !== 'lines') return;
        if (!this.cues.length) {
            this.panelMode = 'tracks';
            this.renderTrackPanel();
            return;
        }
        const currentIndex = this.currentCue ? this.cues.findIndex(cue => cue === this.currentCue) : -1;
        const start = Math.max(0, currentIndex - 12);
        const visible = this.cues.slice(start, start + 28);
        setInnerHtml(this.transcriptPanel, `
            <div class="jpdb-subtitle-list-head">
                <span>Subtitle lines</span>
                <button class="jpdb-subtitle-close" type="button" data-action="list" aria-label="Close subtitle lines">×</button>
            </div>
            <div class="jpdb-subtitle-list-scroll">
                ${visible.map((cue, offset) => {
                    const index = start + offset;
                    return `
                        <button class="jpdb-subtitle-list-row ${index === currentIndex ? 'active' : ''}" type="button" data-action="cue" data-index="${index}">
                            <span>${formatSubtitleTime(cue.start)}</span>
                            <strong>${escapeHtml(cue.text)}</strong>
                        </button>
                    `;
                }).join('')}
            </div>
        `);
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

    private scheduleAlignToVideo(): void {
        if (this.alignFrame) cancelAnimationFrame(this.alignFrame);
        this.alignFrame = requestAnimationFrame(() => {
            this.alignFrame = undefined;
            this.alignToVideo();
        });
    }
}

function formatTrackKind(kind: SubtitleTrackOption['kind']): string {
    if (kind === 'native') return 'page track';
    if (kind === 'youtube') return 'YouTube captions';
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
    const match = value.match(/(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{3})/);
    if (!match) return Number.NaN;
    const [, hours = '0', minutes, seconds, millis] = match;
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(millis) / 1000;
}

function formatSubtitleTime(value: number): string {
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
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
