import { escapeHtml } from '../dom/index';
import { cardStateLabel, uiText } from '../app/i18n';
import type { InterfaceLanguage, ReaderSettings } from '../app/types';
import { formatSubtitleTime } from './subtitle-cues';
import type { SubtitleBatchMiningCandidate, SubtitleBatchMiningSummary } from './subtitle-batch-mining';
import { formatSubtitleText, subtitleText } from './i18n';
import {
    renderPanelModeControls,
    renderPanelNavigationControls,
    renderPanelPlacementControls,
    renderPausePanelToggle,
    subtitleIcon,
} from './subtitle-surface';

export type SubtitleBatchMiningStatus = 'idle' | 'scanning' | 'ready' | 'failed';

export interface SubtitleBatchMiningPanelRenderState {
    status: SubtitleBatchMiningStatus;
    candidates: SubtitleBatchMiningCandidate[];
    selectedKeys: ReadonlySet<string>;
    summary: SubtitleBatchMiningSummary;
    errorMessage?: string;
    hasTranscriptSurface: boolean;
    hasNavigableLines: boolean;
    pausePanelEnabled: boolean;
    placement: ReaderSettings['subtitleTranscriptPlacement'];
    language: InterfaceLanguage;
}

export function renderSubtitleBatchMiningPanel(state: SubtitleBatchMiningPanelRenderState): string {
    const language = state.language;
    return `<div class="jpdb-subtitle-drawer-head"><div class="jpdb-subtitle-drawer-brand"><strong class="jpdb-subtitle-drawer-title">${escapeHtml(subtitleText(language, 'bmTitle'))}</strong><span class="jpdb-subtitle-drawer-meta">${escapeHtml(batchMiningMetaText(state))}</span></div><div class="jpdb-subtitle-drawer-actions">${renderPanelModeControls('mine', state.hasTranscriptSurface, language)}${renderPanelNavigationControls(state.hasNavigableLines, language)}${renderPanelPlacementControls(state.placement, language)}${renderPausePanelToggle(state.pausePanelEnabled, language)}</div></div>${renderBatchMiningToolbar(state)}<div class="jpdb-subtitle-list-scroll jpdb-subtitle-batch-scroll">${renderBatchMiningBody(state)}</div><div class="jpdb-subtitle-resize" data-resize-transcript role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${escapeHtml(uiText(language, 'resizeTranscriptPanel'))}"></div>`;
}

function renderBatchMiningToolbar(state: SubtitleBatchMiningPanelRenderState): string {
    const language = state.language;
    const selectedCount = state.selectedKeys.size;
    const candidateCount = state.candidates.length;
    const scanLabel = subtitleText(language, state.status === 'ready' ? 'bmRescan' : 'bmScan');
    const buttons = [
        `<button type="button" data-action="bm-scan" ${state.status === 'scanning' ? 'disabled' : ''}>${subtitleIcon('transcript')}<span>${escapeHtml(scanLabel)}</span></button>`,
    ];
    if (candidateCount) {
        buttons.push(
            `<button type="button" data-action="bm-add" ${selectedCount ? '' : 'disabled'}>${subtitleIcon('check')}<span>${escapeHtml(subtitleText(language, 'bmAdd'))}</span></button>`,
            `<button type="button" data-action="bm-copy" ${selectedCount ? '' : 'disabled'}>${subtitleIcon('copy')}<span>${escapeHtml(subtitleText(language, 'bmCopy'))}</span></button>`,
            `<button type="button" data-action="bm-all" ${selectedCount === candidateCount ? 'disabled' : ''}>${escapeHtml(subtitleText(language, 'selectAll'))}</button>`,
        );
        if (selectedCount) buttons.push(`<button type="button" data-action="bm-clear">${escapeHtml(subtitleText(language, 'clearSelection'))}</button>`);
    }
    return `<div class="jpdb-subtitle-batch-toolbar" role="toolbar" aria-label="${escapeHtml(subtitleText(language, 'bmToolbar'))}">${buttons.join('')}</div>`;
}

function renderBatchMiningBody(state: SubtitleBatchMiningPanelRenderState): string {
    if (state.status === 'failed') {
        return `<div class="jpdb-subtitle-list-empty">${escapeHtml(state.errorMessage || subtitleText(state.language, 'bmFailed'))}</div>`;
    }
    if (state.status === 'scanning') {
        return `<div class="jpdb-subtitle-list-empty">${escapeHtml(formatSubtitleText(state.language, 'bmScanning', {
            count: state.summary.parsedRows,
            total: state.summary.rows,
        }))}</div>`;
    }
    if (state.status === 'idle') {
        return `<div class="jpdb-subtitle-list-empty">${escapeHtml(subtitleText(state.language, 'bmReady'))}</div>`;
    }
    if (!state.candidates.length) {
        return `<div class="jpdb-subtitle-list-empty">${escapeHtml(subtitleText(state.language, 'bmNoCandidates'))}</div>`;
    }
    return `<div class="jpdb-subtitle-batch-list" role="list">${state.candidates.map(candidate => renderBatchMiningCandidate(candidate, state)).join('')}</div>`;
}

function renderBatchMiningCandidate(candidate: SubtitleBatchMiningCandidate, state: SubtitleBatchMiningPanelRenderState): string {
    const language = state.language;
    const selected = state.selectedKeys.has(candidate.key);
    const selectLabel = subtitleText(language, selected ? 'bmDeselect' : 'bmSelect');
    const wordLabel = `${selectLabel}: ${candidate.card.spelling}`;
    return `<div class="jpdb-subtitle-batch-row" role="listitem" data-batch-candidate-key="${escapeHtml(candidate.key)}" data-selected="${selected}"><button class="jpdb-subtitle-batch-check" type="button" data-action="bm-toggle" aria-pressed="${selected}" aria-label="${escapeHtml(wordLabel)}">${selected ? subtitleIcon('check') : ''}</button><button class="jpdb-subtitle-batch-word" type="button" data-action="bm-open"><span class="jpdb-subtitle-batch-expression" lang="ja">${escapeHtml(candidate.card.spelling)}</span>${candidate.card.reading && candidate.card.reading !== candidate.card.spelling ? `<span class="jpdb-subtitle-batch-reading" lang="ja">${escapeHtml(candidate.card.reading)}</span>` : ''}</button><div class="jpdb-subtitle-batch-meta">${candidate.iPlusOne ? `<span class="jpdb-subtitle-batch-badge">${escapeHtml(subtitleText(language, 'bmIPlusOne'))}</span>` : ''}<span>${escapeHtml(cardStateLabel(candidate.state, language))}</span><span>${escapeHtml(formatSubtitleText(language, 'bmOccurrences', { count: candidate.occurrences }))}</span><span>${escapeHtml(formatSubtitleTime(candidate.start))}</span></div><div class="jpdb-subtitle-batch-sentence" lang="ja">${escapeHtml(candidate.sentence)}</div></div>`;
}

function batchMiningMetaText(state: SubtitleBatchMiningPanelRenderState): string {
    if (state.status === 'scanning') {
        return formatSubtitleText(state.language, 'bmScanning', {
            count: state.summary.parsedRows,
            total: state.summary.rows,
        });
    }
    if (state.status === 'failed') return subtitleText(state.language, 'bmFailed');
    if (state.status === 'ready') {
        return formatSubtitleText(state.language, 'bmSummary', {
            count: state.summary.candidates,
            iPlusOne: state.summary.iPlusOne,
            selected: state.summary.selected,
        });
    }
    return formatSubtitleText(state.language, 'bmRowsReady', { count: state.summary.rows });
}
