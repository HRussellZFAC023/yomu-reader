import { escapeHtml, setInnerHtml } from '../dom/index';
import {
    escapeWithBreaks,
    findAlignedCue,
    formatSubtitleTime,
    type SubtitleCue,
} from './subtitle-cues';
import { renderDrawerHead, subtitleActionAttributes, subtitleIcon, type PanelOptionsControlsState } from './subtitle-surface';
import { subtitleDrawerMetaText, type SubtitleTrackPanelTrack } from './subtitle-track-panel';
import { uiText } from '../app/i18n';
import type { InterfaceLanguage, ReaderSettings } from '../app/types';
import type { SubtitleParsedHtmlCache } from './parsed-html-cache';
import {
    resolveSubtitleLanguageContext,
    subtitleContentAttributes,
    subtitleContentLanguage,
    syncSubtitleContentLanguage,
    type SubtitleContentLanguage,
} from './subtitle-language-context';

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
        const { rowCount, rowIndexOffset } = transcriptPanelRowBounds(state);
        const transcriptRows = this.deps.getTranscriptRows();
        const primaryContent = this.primaryContentLanguage();
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
                extraActions: `<button class="jpdb-subtitle-jump-current" type="button" data-action="jump-current"${subtitleActionAttributes('jump-current')} title="${escapeHtml(uiText(language, 'jumpToCurrentSubtitle'))}" aria-label="${escapeHtml(uiText(language, 'jumpToCurrentSubtitle'))}">${subtitleIcon('locate')}</button>`,
            })}
            <div class="jpdb-subtitle-list-scroll" data-total-rows="${rowCount}"${transcriptVirtualizedAttribute(state.virtual)}>
                ${this.renderTranscriptVirtualSpacer(state.virtual, 'topSpacer')}
                ${this.renderTranscriptRows(state, rowIndexOffset, transcriptRows, primaryContent)}
                ${this.renderTranscriptVirtualSpacer(state.virtual, 'bottomSpacer')}
            </div>
            <div class="jpdb-subtitle-resize" data-resize-transcript role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${escapeHtml(uiText(language, 'resizeTranscriptPanel'))}"></div>
        `;
    }

    private renderTranscriptRows(
        state: TranscriptPanelRenderState,
        rowIndexOffset: number,
        transcriptRows: TranscriptRow[],
        primaryContent: SubtitleContentLanguage,
    ): string {
        if (!state.rows.length) return this.renderWaitingState();
        return state.rows
            .map((row, index) => this.renderRow(row, rowIndexOffset + index, state.currentRowIndex, transcriptRows, primaryContent))
            .join('');
    }

    private renderTranscriptVirtualSpacer(
        virtual: TranscriptPanelVirtualWindow | undefined,
        side: 'topSpacer' | 'bottomSpacer',
    ): string {
        if (!virtual) return '';
        return this.renderVirtualSpacer(virtual[side]);
    }

    renderVirtualSpacer(height: number): string {
        return height > 0
            ? `<div class="jpdb-subtitle-list-spacer" aria-hidden="true" style="height:${Math.round(height)}px"></div>`
            : '';
    }

    renderRow(
        row: TranscriptRow,
        index: number,
        currentIndex: number,
        rows: TranscriptRow[] = this.deps.getTranscriptRows(),
        primaryContent = this.primaryContentLanguage(),
    ): string {
        const cue = row.cue;
        const settings = this.deps.getSettings();
        const htmlCache = this.deps.getHtmlCache();
        const parsedKey = this.deps.transcriptRowParseKey(row, index, rows, settings);
        const parsed = this.parsedRowHtml(parsedKey, settings, htmlCache);
        const parsedAttributes = transcriptParsedAttributes(parsed, parsedKey, htmlCache);
        const seekLabel = `${uiText(settings.interfaceLanguage, 'seekSubtitleLine')} ${formatSubtitleTime(cue.start)}`;
        return `
            <div class="jpdb-subtitle-list-row ${transcriptActiveRowClass(index, currentIndex)}" data-action="cue" data-row-index="${index}" data-cue-index="${row.cueIndex}"${subtitleActionAttributes('cue', { rowIndex: index })} role="button" tabindex="0" aria-label="${escapeHtml(seekLabel)}">
                <div class="jpdb-subtitle-row-body">
                    <strong class="jpdb-subtitle-row-text" ${subtitleContentAttributes(primaryContent)} data-transcript-text data-row-index="${index}" data-parse-key="${escapeHtml(parsedKey)}"${parsedAttributes}>${transcriptRowHtml(parsed, cue.text)}</strong>
                </div>
                <div class="jpdb-subtitle-row-tools">
                    ${this.renderRowPeekButton(cue, index, settings)}
                    <button class="jpdb-subtitle-row-copy" type="button" data-action="copy-row" data-row-index="${index}"${subtitleActionAttributes('copy-row', { rowIndex: index })} title="${escapeHtml(uiText(settings.interfaceLanguage, 'copySubtitleLine'))}" aria-label="${escapeHtml(uiText(settings.interfaceLanguage, 'copySubtitleLine'))}">${subtitleIcon('copy')}</button>
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
        return `<button class="jpdb-subtitle-row-peek" type="button" data-action="peek-row" data-row-index="${index}"${subtitleActionAttributes('peek-row', { rowIndex: index })} aria-pressed="false" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${subtitleIcon('eye')}</button>`;
    }

    renderWaitingState(): string {
        const selected = this.deps.getTracks().find(track => track.id === this.deps.getSelectedTrackId());
        const language = this.deps.getSettings().interfaceLanguage;
        const label = transcriptWaitingTrackLabel(selected);
        const status = transcriptWaitingStatus(selected, language);
        return `<div class="jpdb-subtitle-list-empty">${escapeHtml(status)}${label}. ${escapeHtml(uiText(language, 'subtitleCurrentLineWillAppear'))}</div>`;
    }

    toggleRowTranslationPeek(target: HTMLElement): void {
        const targets = transcriptTranslationPeekTargets(target);
        if (!targets) return;
        if (targets.existing) return this.closeRowTranslationPeek(targets);
        this.openRowTranslationPeek(targets);
    }

    private closeRowTranslationPeek(targets: TranscriptTranslationPeekTargets): void {
        targets.existing?.remove();
        const label = uiText(this.deps.getSettings().interfaceLanguage, 'peekSubtitleTranslation');
        targets.button.setAttribute('aria-pressed', 'false');
        targets.button.setAttribute('title', label);
        targets.button.setAttribute('aria-label', label);
        setInnerHtml(targets.button, subtitleIcon('eye'));
    }

    private openRowTranslationPeek(targets: TranscriptTranslationPeekTargets): void {
        const secondary = alignedPeekSubtitleCue(
            this.deps.getTranscriptRows(),
            this.deps.getSecondaryCues(),
            this.deps.rowIndexFromTarget(targets.button),
        );
        if (!secondary?.text.trim()) return;
        const body = transcriptPeekRowBody(targets.row);
        const peek = document.createElement('div');
        peek.className = 'jpdb-subtitle-row-secondary';
        syncSubtitleContentLanguage(peek, this.secondaryContentLanguage());
        peek.textContent = secondary.text.trim();
        body.append(peek);
        const label = uiText(this.deps.getSettings().interfaceLanguage, 'hideSubtitleTranslation');
        targets.button.setAttribute('aria-pressed', 'true');
        targets.button.setAttribute('title', label);
        targets.button.setAttribute('aria-label', label);
        setInnerHtml(targets.button, subtitleIcon('eye-off'));
    }

    private primaryContentLanguage(): SubtitleContentLanguage {
        const context = resolveSubtitleLanguageContext(this.deps.getSettings());
        const track = this.deps.getTracks().find(candidate => candidate.id === this.deps.getSelectedTrackId());
        return subtitleContentLanguage(track, context.targetContent);
    }

    private secondaryContentLanguage(): SubtitleContentLanguage {
        const context = resolveSubtitleLanguageContext(this.deps.getSettings());
        const track = this.deps.getTracks().find(candidate => candidate.id === this.deps.getSecondaryTrackId());
        return subtitleContentLanguage(track, context.outputContent);
    }

    handlePanelClick(event: MouseEvent): void {
        this.deps.handleClick(event);
        event.stopPropagation();
    }

    stopPanelPropagation(event: Event): void {
        event.stopPropagation();
    }

    handlePanelKeydown(event: KeyboardEvent): void {
        if (this.handlePanelOptionsEscape(event)) return;
        this.handleTranscriptRowActivation(event);
    }

    private handlePanelOptionsEscape(event: KeyboardEvent): boolean {
        if (event.key !== 'Escape') return false;
        if (!this.deps.isPanelOptionsMenuOpen()) return false;
        event.preventDefault();
        event.stopPropagation();
        this.deps.closePanelOptionsMenu();
        this.deps.getPanel()?.querySelector<HTMLButtonElement>('[data-action="panel-options"]')?.focus();
        return true;
    }

    private handleTranscriptRowActivation(event: KeyboardEvent): void {
        if (!TRANSCRIPT_ROW_ACTIVATION_KEYS.has(event.key)) return;
        const target = event.target as HTMLElement;
        if (target.closest('button, input, [data-resize-transcript], .jpdb-reader-word')) return;
        const row = target.closest<HTMLElement>('.jpdb-subtitle-list-row[data-row-index]');
        if (!row) return;
        event.preventDefault();
        event.stopPropagation();
        this.deps.seekToTranscriptRow(this.deps.rowIndexFromTarget(row));
    }
}

const TRANSCRIPT_ROW_ACTIVATION_KEYS = new Set(['Enter', ' ']);

function transcriptPanelRowBounds(state: TranscriptPanelRenderState): { rowCount: number; rowIndexOffset: number } {
    return {
        rowCount: state.totalRowCount ?? state.rows.length,
        rowIndexOffset: state.rowIndexOffset ?? 0,
    };
}

function transcriptVirtualizedAttribute(virtual: TranscriptPanelVirtualWindow | undefined): string {
    return virtual ? ' data-virtualized="true"' : '';
}

function transcriptParsedAttributes(
    parsed: string | undefined,
    parsedKey: string,
    htmlCache: SubtitleParsedHtmlCache,
): string {
    if (!parsed) return '';
    const provisional = htmlCache.parsedHtmlCache.has(parsedKey) ? '' : ' data-parsed-provisional="true"';
    return ` data-parsed-key="${escapeHtml(parsedKey)}"${provisional}`;
}

function transcriptActiveRowClass(index: number, currentIndex: number): string {
    return index === currentIndex ? 'active' : '';
}

function transcriptRowHtml(parsed: string | undefined, text: string): string {
    return parsed ?? escapeWithBreaks(text);
}

function transcriptWaitingTrackLabel(track: SubtitleTrackPanelTrack | undefined): string {
    return track?.label ? `: ${escapeHtml(track.label)}` : '';
}

function transcriptWaitingStatus(track: SubtitleTrackPanelTrack | undefined, language: InterfaceLanguage): string {
    return uiText(language, track?.loadingState === 'loading' ? 'loadingSubtitleLines' : 'waitingForCaptionLines');
}

interface TranscriptTranslationPeekTargets {
    button: HTMLElement;
    row: HTMLElement;
    existing: HTMLElement | null;
}

function transcriptTranslationPeekTargets(target: HTMLElement): TranscriptTranslationPeekTargets | undefined {
    const button = target.closest<HTMLElement>('[data-action="peek-row"]');
    const row = target.closest<HTMLElement>('.jpdb-subtitle-list-row');
    if (!button || !row) return undefined;
    return {
        button,
        row,
        existing: row.querySelector<HTMLElement>('.jpdb-subtitle-row-secondary'),
    };
}

function alignedPeekSubtitleCue(
    rows: TranscriptRow[],
    secondaryCues: SubtitleCue[],
    rowIndex: number,
): SubtitleCue | undefined {
    const cue = rows[rowIndex]?.cue;
    return cue ? findAlignedCue(secondaryCues, cue) : undefined;
}

function transcriptPeekRowBody(row: HTMLElement): HTMLElement {
    return row.querySelector<HTMLElement>('.jpdb-subtitle-row-body') ?? row;
}
