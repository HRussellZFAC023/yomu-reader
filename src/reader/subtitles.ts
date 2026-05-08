import { escapeHtml, renderTokensToHtml, setInnerHtml } from './dom';
import { matchesShortcut } from './settings';
import type { JPDBToken, ReaderSettings } from './types';

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

const CAPTION_SELECTORS = [
    '.ytp-caption-segment',
    '.caption-visual-line',
    '.captions-text span',
    '[data-purpose="captions-text"]',
].join(',');

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
    private selectedTrackId = '';
    private secondaryTrackId = '';
    private youtubeVideoId = '';
    private lastDomCaption = '';
    private parsedHtmlCache = new Map<string, string>();
    private renderSerial = 0;
    private panelMode: 'lines' | 'tracks' = 'lines';

    constructor(private options: SubtitlePlayerOptions) {}

    init(): void {
        this.install();
        this.observer = new MutationObserver(mutations => {
            if (mutations.every(mutationInsideReaderRoot)) return;
            this.scheduleDiscoverVideo();
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
        document.addEventListener('keydown', event => this.handleKeydown(event));
        this.discoverVideo();
        this.tick();
    }

    refresh(): void {
        if (!this.root) return;
        const settings = this.options.getSettings();
        this.root.hidden = !settings.subtitlePlayerEnabled || (!this.video && !this.cues.length);
        this.root.classList.toggle('jpdb-subtitle-hidden', !settings.subtitleOverlayVisible);
        this.root.style.setProperty('--subtitle-font-size', `${settings.subtitleFontSize}px`);
        this.root.style.setProperty('--subtitle-bottom', `${settings.subtitleBottomOffset}%`);
        this.syncControls();
        this.render();
    }

    private install(): void {
        if (this.root) return;

        const root = document.createElement('div');
        root.className = 'jpdb-subtitle-player';
        root.dataset.jpdbReaderRoot = 'true';
        setInnerHtml(root, `
            <div class="jpdb-subtitle-text" aria-live="polite"></div>
            <div class="jpdb-subtitle-rail">
                <button type="button" data-action="previous" title="Previous subtitle" aria-label="Previous subtitle">‹</button>
                <button type="button" data-action="list" title="Subtitle list">Lines</button>
                <span class="jpdb-subtitle-status" data-role="status">No subtitles</span>
                <button type="button" data-action="next" title="Next subtitle" aria-label="Next subtitle">›</button>
                <button type="button" data-action="menu" title="Subtitle options" aria-label="Subtitle options">...</button>
            </div>
            <div class="jpdb-subtitle-menu" hidden>
                <button type="button" data-action="tracks">Choose subtitle tracks</button>
                <button type="button" data-action="load">Load Japanese subtitles</button>
                <button type="button" data-action="load-secondary">Load native subtitles</button>
                <button type="button" data-action="copy">Copy current line</button>
                <button type="button" data-action="toggle-secondary">Native subtitles on</button>
                <button type="button" data-action="toggle">Hide subtitles</button>
            </div>
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
    }

    private addNativeTrack(track: TextTrack): void {
        if (this.tracks.some(item => item.track === track)) return;
        const id = `native-${this.tracks.length}`;
        const label = track.label || track.language || `Subtitle ${this.tracks.length + 1}`;
        this.tracks.push({ id, label, kind: 'native', track });

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
            this.root.style.width = '100%';
            this.root.style.height = '100%';
            return;
        }
        this.root.style.left = `${Math.max(0, rect.left)}px`;
        this.root.style.top = `${Math.max(0, rect.top)}px`;
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
        const text = [...document.querySelectorAll(CAPTION_SELECTORS)]
            .map(node => (node as HTMLElement).innerText || node.textContent || '')
            .map(textContent => textContent.trim())
            .filter(Boolean)
            .join('\n')
            .trim();
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
        if (this.options.getSettings().apiKey) void this.renderParsedPrimary(text);
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
        } catch {
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
    }

    private async copySubtitle(): Promise<void> {
        const text = [this.currentCue?.text.trim(), this.secondaryCue?.text.trim()].filter(Boolean).join('\n');
        if (!text) {
            this.options.onToast('No active subtitle to copy.');
            return;
        }
        await navigator.clipboard?.writeText(text).catch(() => undefined);
        this.options.onToast('Subtitle copied.');
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
        this.options.onToast(`Loaded ${cues.length} ${kind === 'primary' ? 'Japanese' : 'native'} subtitles.`);
        if (input) input.value = '';
        this.updateFromLoadedCues();
    }

    private async selectTrack(id: string): Promise<void> {
        this.selectedTrackId = id;
        if (this.secondaryTrackId === id) this.secondaryTrackId = '';
        this.cues = [];
        this.currentCue = undefined;

        const selected = this.tracks.find(option => option.id === id);
        if (selected?.cues) this.cues = selected.cues;
        if (selected?.track) this.cues = readTrackCues(selected.track);
        if (selected?.kind === 'youtube' && selected.url) {
            const text = await requestText(withYouTubeVttFormat(selected.url));
            this.cues = parseSubtitleText(text);
            selected.cues = this.cues;
            this.options.onToast(`Loaded ${this.cues.length} YouTube subtitles.`);
        }
        this.setNativeTrackModes();
        this.updateFromLoadedCues();
        this.render();
        this.renderTranscriptPanel();
        this.renderTrackPanel();
    }

    private async selectSecondaryTrack(id: string): Promise<void> {
        if (this.selectedTrackId === id) return;
        this.secondaryTrackId = id;
        this.secondaryCues = [];
        this.secondaryCue = undefined;

        const selected = this.tracks.find(option => option.id === id);
        if (selected?.cues) this.secondaryCues = selected.cues;
        if (selected?.track) this.secondaryCues = readTrackCues(selected.track);
        if (selected?.kind === 'youtube' && selected.url) {
            const text = await requestText(withYouTubeVttFormat(selected.url));
            this.secondaryCues = parseSubtitleText(text);
            selected.cues = this.secondaryCues;
        }
        this.setNativeTrackModes();
        this.updateFromLoadedCues();
        this.render();
        this.renderTrackPanel();
    }

    private setNativeTrackModes(): void {
        for (const option of this.tracks) {
            if (option.track) option.track.mode = option.id === this.selectedTrackId || option.id === this.secondaryTrackId ? 'hidden' : 'disabled';
        }
    }

    private async discoverYouTubeTracks(): Promise<void> {
        if (!location.hostname.includes('youtube.com')) return;
        const videoId = getYouTubeVideoId();
        if (!videoId || videoId === this.youtubeVideoId) return;

        const tracks = getYouTubeCaptionTracks();
        if (!tracks.length) return;
        this.youtubeVideoId = videoId;

        for (const track of tracks) {
            if (this.tracks.some(existing => existing.kind === 'youtube' && existing.url === track.url)) continue;
            this.tracks.push({ id: `youtube-${this.tracks.length}`, label: track.label, kind: 'youtube', url: track.url });
        }

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
        const secondaryToggle = this.menuEl?.querySelector<HTMLButtonElement>('[data-action="toggle-secondary"]');
        if (secondaryToggle) secondaryToggle.textContent = settings.subtitleSecondaryVisible ? 'Native subtitles on' : 'Native subtitles off';
        const subtitleToggle = this.menuEl?.querySelector<HTMLButtonElement>('[data-action="toggle"]');
        if (subtitleToggle) subtitleToggle.textContent = settings.subtitleOverlayVisible ? 'Hide subtitles' : 'Show subtitles';
        if (!this.statusEl) return;

        if (this.cues.length) {
            const index = this.currentCue ? this.cues.findIndex(cue => cue === this.currentCue) + 1 : 0;
            this.statusEl.textContent = `${index > 0 ? `${index}/` : ''}${this.cues.length}`;
        } else if (this.currentCue?.text) {
            this.statusEl.textContent = 'Page captions';
        } else if (this.tracks.length) {
            this.statusEl.textContent = `${this.tracks.length} tracks`;
        } else {
            this.statusEl.textContent = 'No subs';
        }
    }

    private toggleMenu(): void {
        if (!this.menuEl) return;
        this.menuEl.hidden = !this.menuEl.hidden;
    }

    private toggleSubtitles(): void {
        const settings = this.options.getSettings();
        settings.subtitleOverlayVisible = !settings.subtitleOverlayVisible;
        this.options.onSettingsChange();
        this.refresh();
    }

    private toggleSecondarySubtitles(): void {
        const settings = this.options.getSettings();
        settings.subtitleSecondaryVisible = !settings.subtitleSecondaryVisible;
        if (!settings.subtitleSecondaryVisible) this.secondaryCue = undefined;
        this.options.onSettingsChange();
        this.render();
    }

    private toggleTranscriptPanel(): void {
        if (!this.transcriptPanel) return;
        const shouldOpen = this.transcriptPanel.hidden || this.panelMode !== 'lines';
        this.panelMode = 'lines';
        this.transcriptPanel.hidden = !shouldOpen;
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
            setInnerHtml(this.transcriptPanel, '<div class="jpdb-subtitle-list-empty">No loaded Japanese subtitle lines.</div>');
            return;
        }
        const currentIndex = this.currentCue ? this.cues.findIndex(cue => cue === this.currentCue) : -1;
        const start = Math.max(0, currentIndex - 12);
        const visible = this.cues.slice(start, start + 28);
        setInnerHtml(this.transcriptPanel, `
            <div class="jpdb-subtitle-list-head">
                <span>${this.cues.length} lines</span>
                <button type="button" data-action="list">Close</button>
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
                <span>${tracks.length ? `${tracks.length} detected tracks` : 'No detected tracks'}</span>
                <button type="button" data-action="tracks">Close</button>
            </div>
            <div class="jpdb-subtitle-list-scroll">
                ${tracks.length ? tracks.map(track => `
                    <div class="jpdb-subtitle-track-row ${track.id === this.selectedTrackId || track.id === this.secondaryTrackId ? 'active' : ''}" data-track-id="${escapeHtml(track.id)}">
                        <strong>${escapeHtml(track.label)}</strong>
                        <span>${formatTrackKind(track.kind)}${track.id === this.selectedTrackId ? ' · Japanese' : ''}${track.id === this.secondaryTrackId ? ' · native language' : ''}</span>
                        <div>
                            <button type="button" data-action="primary-track">Japanese</button>
                            <button type="button" data-action="secondary-track">Native</button>
                        </div>
                    </div>
                `).join('') : '<div class="jpdb-subtitle-list-empty">Load SRT/VTT files or enable page captions, then choose tracks here.</div>'}
            </div>
        `);
    }

    private async choosePrimaryTrack(id?: string): Promise<void> {
        if (!id) return;
        await this.selectTrack(id);
        this.options.onToast('Japanese subtitle track selected.');
    }

    private async chooseSecondaryTrack(id?: string): Promise<void> {
        if (!id) return;
        await this.selectSecondaryTrack(id);
        this.options.onToast('Native subtitle track selected.');
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
        const marker = 'ytInitialPlayerResponse = ';
        const start = text.indexOf(marker);
        if (start < 0) continue;
        const raw = extractJsonObject(text, start + marker.length);
        if (!raw) continue;
        try {
            return JSON.parse(raw) as ReturnType<typeof getYouTubePlayerResponse>;
        } catch {
            continue;
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
    if (typeof GM_xmlhttpRequest === 'function') {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
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
    return fetch(url, { signal: AbortSignal.timeout(8000) }).then(response => {
        if (!response.ok) throw new Error(`Subtitle request failed (${response.status}).`);
        return response.text();
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
