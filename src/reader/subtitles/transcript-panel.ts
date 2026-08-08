import { escapeHtml, setInnerHtml } from '../dom/index';
import {
    escapeWithBreaks,
    findAlignedCue,
    formatSubtitleTime,
    type SubtitleCue,
} from './subtitle-cues';
import { renderDrawerHead, subtitleIcon, type PanelOptionsControlsState } from './subtitle-surface';
import { subtitleDrawerMetaText, type SubtitleTrackPanelTrack } from './subtitle-track-panel';
import { uiText } from '../app/i18n';
import type { InterfaceLanguage, ReaderSettings } from '../app/types';
import type { SubtitleParsedHtmlCache } from './parsed-html-cache';

export interface TranscriptRow {
    cue: SubtitleCue;
    cueIndex: number;
}

export interface TranscriptPanelVirtualWindow {
    start: number;
    end: number;
    scrollTop: number;
    topSpacer: number;
    bottomSpacer: number;
}

export interface TranscriptPanelRenderState {
    rows: TranscriptRow[];
    warmupRows?: TranscriptRow[];
    currentRowIndex: number;
    // Track/loading/current-fallback/parse settings only -- excludes row count
    // and virtual bounds, so it stays stable across a cue-list append.
    structureSignature: string;
    // structureSignature + row count.
    baseSignature: string;
    // baseSignature + virtual bounds.
    signature: string;
    rowIndexOffset?: number;
    totalRowCount?: number;
    virtual?: TranscriptPanelVirtualWindow;
}

// Everything the transcript panel reads back off the controller, made
// explicit: the live settings, the track/cue data the drawer head + rows are
// built from, the parsed-HTML cache the rows pre-colour out of, the per-row
// parse-key derivation, and the controller callbacks the list's DOM event
// handlers dispatch into.
export interface SubtitleTranscriptPanelDeps {
    getSettings(): ReaderSettings;
    getTracks(): SubtitleTrackPanelTrack[];
    getSelectedTrackId(): string;
    getSecondaryTrackId(): string;
    getSecondaryCues(): SubtitleCue[];
    getTranscriptRows(): TranscriptRow[];
    getHtmlCache(): SubtitleParsedHtmlCache;
    getPanel(): HTMLElement | undefined;
    hasTranscriptSurface(): boolean;
    panelOptionsState(pausePanelEnabled: boolean, language: InterfaceLanguage): PanelOptionsControlsState;
    transcriptRowParseKey(row: TranscriptRow, rowIndex: number, rows: TranscriptRow[], settings: ReaderSettings): string;
    isPanelOptionsMenuOpen(): boolean;
    closePanelOptionsMenu(): void;
    seekToTranscriptRow(index: number): void;
    rowIndexFromTarget(target: HTMLElement): number;
    handleClick(event: MouseEvent): void;
}

// Transcript (Lines) drawer surface extracted from the controller: owns the
// drawer/panel HTML construction, per-row rendering, the row translation-peek
// toggle, and the transcript list's DOM event handlers (click/keydown/pointer
// propagation). The controller keeps the render orchestration (render-state
// computation, hydration/warmup, virtualization, open/close lifecycle,
// layout/positioning) and delegates the DOM-building + list-interaction surface
// here; every controller input flows through SubtitleTranscriptPanelDeps.
export class SubtitleTranscriptPanel {
    constructor(private readonly deps: SubtitleTranscriptPanelDeps) {}

    renderPanelHtml(state: TranscriptPanelRenderState): string {
        const settings = this.deps.getSettings();
        const language = settings.interfaceLanguage;
        const rowCount = state.totalRowCount ?? state.rows.length;
        const rowIndexOffset = state.rowIndexOffset ?? 0;
        const transcriptRows = this.deps.getTranscriptRows();
        return `
            ${renderDrawerHead({
                mode: 'lines',
                title: uiText(language, 'subtitlesTitle'),
                meta: subtitleDrawerMetaText({
                    mode: 'lines',
                    count: rowCount,
                    tracks: this.deps.getTracks(),
                    selectedTrackId: this.deps.getSelectedTrackId(),
                    secondaryTrackId: this.deps.getSecondaryTrackId(),
                    language,
                }),
                metaTitle: subtitleDrawerMetaText({
                    mode: 'lines',
                    count: rowCount,
                    tracks: this.deps.getTracks(),
                    selectedTrackId: this.deps.getSelectedTrackId(),
                    secondaryTrackId: this.deps.getSecondaryTrackId(),
                    language,
                    compact: false,
                }),
                canShowLines: this.deps.hasTranscriptSurface(),
                options: this.deps.panelOptionsState(settings.subtitlePausePanel, language),
                extraActions: `<button class="jpdb-subtitle-jump-current" type="button" data-action="jump-current" title="${escapeHtml(uiText(language, 'jumpToCurrentSubtitle'))}" aria-label="${escapeHtml(uiText(language, 'jumpToCurrentSubtitle'))}">${subtitleIcon('locate')}</button>`,
            })}
            <div class="jpdb-subtitle-list-scroll" data-total-rows="${rowCount}"${state.virtual ? ' data-virtualized="true"' : ''}>
                ${state.virtual ? this.renderVirtualSpacer(state.virtual.topSpacer) : ''}
                ${state.rows.length
                    ? state.rows.map((row, index) => this.renderRow(row, rowIndexOffset + index, state.currentRowIndex, transcriptRows)).join('')
                    : this.renderWaitingState()}
                ${state.virtual ? this.renderVirtualSpacer(state.virtual.bottomSpacer) : ''}
            </div>
            <div class="jpdb-subtitle-resize" data-resize-transcript role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${escapeHtml(uiText(language, 'resizeTranscriptPanel'))}"></div>
        `;
    }

    renderVirtualSpacer(height: number): string {
        return height > 0
            ? `<div class="jpdb-subtitle-list-spacer" aria-hidden="true" style="height:${Math.round(height)}px"></div>`
            : '';
    }

    renderRow(row: TranscriptRow, index: number, currentIndex: number, rows: TranscriptRow[] = this.deps.getTranscriptRows()): string {
        const cue = row.cue;
        const settings = this.deps.getSettings();
        const htmlCache = this.deps.getHtmlCache();
        const parsedKey = this.deps.transcriptRowParseKey(row, index, rows, settings);
        const parsed = this.parsedRowHtml(parsedKey, settings, htmlCache);
        const parsedKeyAttribute = parsed ? ` data-parsed-key="${escapeHtml(parsedKey)}"` : '';
        const provisionalAttribute = parsed && !htmlCache.parsedHtmlCache.has(parsedKey) ? ' data-parsed-provisional="true"' : '';
        const seekLabel = `${uiText(settings.interfaceLanguage, 'seekSubtitleLine')} ${formatSubtitleTime(cue.start)}`;
        return `
            <div class="jpdb-subtitle-list-row ${index === currentIndex ? 'active' : ''}" data-action="cue" data-row-index="${index}" data-cue-index="${row.cueIndex}" role="button" tabindex="0" aria-label="${escapeHtml(seekLabel)}">
                <div class="jpdb-subtitle-row-body">
                    <strong class="jpdb-subtitle-row-text" lang="ja" data-transcript-text data-row-index="${index}" data-parse-key="${escapeHtml(parsedKey)}"${parsedKeyAttribute}${provisionalAttribute}>${parsed ?? escapeWithBreaks(cue.text)}</strong>
                </div>
                <div class="jpdb-subtitle-row-tools">
                    ${this.renderRowPeekButton(cue, index, settings)}
                    <button class="jpdb-subtitle-row-copy" type="button" data-action="copy-row" data-row-index="${index}" title="${escapeHtml(uiText(settings.interfaceLanguage, 'copySubtitleLine'))}" aria-label="${escapeHtml(uiText(settings.interfaceLanguage, 'copySubtitleLine'))}">${subtitleIcon('copy')}</button>
                    <span class="jpdb-subtitle-row-time">${formatSubtitleTime(cue.start)}</span>
                </div>
            </div>
        `;
    }

    private parsedRowHtml(
        parsedKey: string,
        settings: ReaderSettings,
        htmlCache: SubtitleParsedHtmlCache,
    ): string | undefined {
        if (settings.annotationsPaused) return undefined;
        return htmlCache.parsedHtmlCache.get(parsedKey) ?? htmlCache.provisionalParsedHtmlCache.get(parsedKey);
    }

    // UT-68c: when the Lines list shows only Japanese, each row with an
    // aligned translation gets an eye toggle to peek it.
    private renderRowPeekButton(cue: SubtitleCue, index: number, settings: ReaderSettings): string {
        const secondary = findAlignedCue(this.deps.getSecondaryCues(), cue);
        if (!secondary?.text.trim()) return '';
        const label = uiText(settings.interfaceLanguage, 'peekSubtitleTranslation');
        return `<button class="jpdb-subtitle-row-peek" type="button" data-action="peek-row" data-row-index="${index}" aria-pressed="false" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${subtitleIcon('eye')}</button>`;
    }

    renderWaitingState(): string {
        const selected = this.deps.getTracks().find(track => track.id === this.deps.getSelectedTrackId());
        const language = this.deps.getSettings().interfaceLanguage;
        const label = selected?.label ? `: ${escapeHtml(selected.label)}` : '';
        const status = selected?.loadingState === 'loading' ? uiText(language, 'loadingSubtitleLines') : uiText(language, 'waitingForCaptionLines');
        return `<div class="jpdb-subtitle-list-empty">${escapeHtml(status)}${label}. ${escapeHtml(uiText(language, 'subtitleCurrentLineWillAppear'))}</div>`;
    }

    toggleRowTranslationPeek(target: HTMLElement): void {
        const button = target.closest<HTMLElement>('[data-action="peek-row"]');
        const row = target.closest<HTMLElement>('.jpdb-subtitle-list-row');
        if (!button || !row) return;
        const existing = row.querySelector<HTMLElement>('.jpdb-subtitle-row-secondary');
        const language = this.deps.getSettings().interfaceLanguage;
        if (existing) {
            existing.remove();
            button.setAttribute('aria-pressed', 'false');
            button.setAttribute('title', uiText(language, 'peekSubtitleTranslation'));
            button.setAttribute('aria-label', uiText(language, 'peekSubtitleTranslation'));
            setInnerHtml(button, subtitleIcon('eye'));
            return;
        }
        const cue = this.deps.getTranscriptRows()[this.deps.rowIndexFromTarget(button)]?.cue;
        const secondary = cue ? findAlignedCue(this.deps.getSecondaryCues(), cue) : undefined;
        if (!secondary?.text.trim()) return;
        const body = row.querySelector<HTMLElement>('.jpdb-subtitle-row-body') ?? row;
        const peek = document.createElement('div');
        peek.className = 'jpdb-subtitle-row-secondary';
        peek.lang = 'en';
        peek.textContent = secondary.text.trim();
        body.append(peek);
        button.setAttribute('aria-pressed', 'true');
        button.setAttribute('title', uiText(language, 'hideSubtitleTranslation'));
        button.setAttribute('aria-label', uiText(language, 'hideSubtitleTranslation'));
        setInnerHtml(button, subtitleIcon('eye-off'));
    }

    handlePanelClick(event: MouseEvent): void {
        this.deps.handleClick(event);
        event.stopPropagation();
    }

    stopPanelPropagation(event: Event): void {
        event.stopPropagation();
    }

    handlePanelKeydown(event: KeyboardEvent): void {
        if (event.key === 'Escape' && this.deps.isPanelOptionsMenuOpen()) {
            event.preventDefault();
            event.stopPropagation();
            this.deps.closePanelOptionsMenu();
            this.deps.getPanel()?.querySelector<HTMLButtonElement>('[data-action="panel-options"]')?.focus();
            return;
        }
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const target = event.target as HTMLElement;
        if (target.closest('button, input, [data-resize-transcript], .jpdb-reader-word')) return;
        const row = target.closest<HTMLElement>('.jpdb-subtitle-list-row[data-row-index]');
        if (!row) return;
        event.preventDefault();
        event.stopPropagation();
        this.deps.seekToTranscriptRow(this.deps.rowIndexFromTarget(row));
    }
}
