import { escapeHtml } from '../dom/index';
import { cardStateLabel, uiText } from '../app/i18n';
import type { InterfaceLanguage, JPDBGrade, ReaderSettings } from '../app/types';
import { formatSubtitleTime } from './subtitle-cues';
import type { SubtitleBatchMiningCandidate, SubtitleBatchMiningSummary } from './subtitle-batch-mining';
import { formatSubtitleText, subtitleText } from './i18n';
import { renderDrawerHead, subtitleIcon } from './subtitle-surface';
import { subtitleContentAttributes, type SubtitleContentLanguage } from './subtitle-language-context';

export type SubtitleBatchMiningStatus = 'idle' | 'scanning' | 'ready' | 'failed';

export interface SubtitleBatchMiningPanelRenderState {
    status: SubtitleBatchMiningStatus;
    candidates: SubtitleBatchMiningCandidate[];
    selectedKeys: ReadonlySet<string>;
    summary: SubtitleBatchMiningSummary;
    reviewGrades: SubtitleBatchMiningGradeOption[];
    errorMessage?: string;
    hasTranscriptSurface: boolean;
    pausePanelEnabled: boolean;
    placement: ReaderSettings['subtitleTranscriptPlacement'];
    optionsMenuOpen: boolean;
    language: InterfaceLanguage;
    targetContent: SubtitleContentLanguage;
}

export interface SubtitleBatchMiningGradeOption {
    grade: JPDBGrade;
    label: string;
}

export function renderSubtitleBatchMiningPanel(state: SubtitleBatchMiningPanelRenderState): string {
    const language = state.language;
    return `<div class="jpdb-subtitle-batch-sticky">${renderDrawerHead({
        mode: 'mine',
        title: subtitleText(language, 'bmTitle'),
        meta: batchMiningMetaText(state),
        canShowLines: state.hasTranscriptSurface,
        options: { placement: state.placement, pausePanelEnabled: state.pausePanelEnabled, menuOpen: state.optionsMenuOpen, language },
    })}${renderBatchMiningToolbar(state)}</div><div class="jpdb-subtitle-list-scroll jpdb-subtitle-batch-scroll">${renderBatchMiningBody(state)}</div><div class="jpdb-subtitle-resize" data-resize-transcript role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${escapeHtml(uiText(language, 'resizeTranscriptPanel'))}"></div>`;
}

function renderBatchMiningToolbar(state: SubtitleBatchMiningPanelRenderState): string {
    const buttons = [
        renderBatchMiningScanButton(state),
        ...renderBatchMiningCandidateActions(state),
    ];
    return `<div class="jpdb-subtitle-batch-toolbar" role="toolbar" aria-label="${escapeHtml(subtitleText(state.language, 'bmToolbar'))}">${buttons.join('')}</div>`;
}

function renderBatchMiningScanButton(state: SubtitleBatchMiningPanelRenderState): string {
    const key = state.status === 'ready' ? 'bmRescan' : 'bmScan';
    const label = subtitleText(state.language, key);
    return `<button type="button" data-action="bm-scan" ${disabledAttribute(state.status === 'scanning')}>${subtitleIcon('transcript')}<span>${escapeHtml(label)}</span></button>`;
}

function renderBatchMiningCandidateActions(state: SubtitleBatchMiningPanelRenderState): string[] {
    if (!state.candidates.length) return [];
    const selectedCount = state.selectedKeys.size;
    const language = state.language;
    return [
        `<button type="button" data-action="bm-add" ${disabledAttribute(selectedCount === 0)}>${subtitleIcon('check')}<span>${escapeHtml(subtitleText(language, 'bmAdd'))}</span></button>`,
        `<button type="button" data-action="bm-copy" ${disabledAttribute(selectedCount === 0)}>${subtitleIcon('copy')}<span>${escapeHtml(subtitleText(language, 'bmCopy'))}</span></button>`,
        renderBatchMiningGradeGroup({
            action: 'bm-grade-selected',
            label: subtitleText(language, 'bmGradeSelected'),
            grades: state.reviewGrades,
            disabled: selectedCount === 0,
            className: 'jpdb-subtitle-batch-grade-selected',
        }),
        `<button type="button" data-action="bm-all" ${disabledAttribute(selectedCount === state.candidates.length)}>${escapeHtml(subtitleText(language, 'selectAll'))}</button>`,
        ...renderBatchMiningClearAction(state),
    ];
}

function renderBatchMiningClearAction(state: SubtitleBatchMiningPanelRenderState): string[] {
    if (!state.selectedKeys.size) return [];
    return [`<button type="button" data-action="bm-clear">${escapeHtml(subtitleText(state.language, 'clearSelection'))}</button>`];
}

function disabledAttribute(disabled: boolean): string {
    return disabled ? 'disabled' : '';
}

function renderBatchMiningBody(state: SubtitleBatchMiningPanelRenderState): string {
    return BATCH_MINING_BODY_RENDERERS[state.status](state);
}

const BATCH_MINING_BODY_RENDERERS: Record<
    SubtitleBatchMiningStatus,
    (state: SubtitleBatchMiningPanelRenderState) => string
> = {
    failed: state => batchMiningEmptyState(state.errorMessage || subtitleText(state.language, 'bmFailed')),
    scanning: state => batchMiningEmptyState(formatSubtitleText(state.language, 'bmScanning', {
        count: state.summary.parsedRows,
        total: state.summary.rows,
    })),
    idle: state => batchMiningEmptyState(subtitleText(state.language, 'bmReady')),
    ready: state => renderReadyBatchMiningBody(state),
};

function renderReadyBatchMiningBody(state: SubtitleBatchMiningPanelRenderState): string {
    if (!state.candidates.length) return batchMiningEmptyState(subtitleText(state.language, 'bmNoCandidates'));
    return `<div class="jpdb-subtitle-batch-list" role="list">${state.candidates.map(candidate => renderBatchMiningCandidate(candidate, state)).join('')}</div>`;
}

function batchMiningEmptyState(message: string): string {
    return `<div class="jpdb-subtitle-list-empty">${escapeHtml(message)}</div>`;
}

function renderBatchMiningCandidate(candidate: SubtitleBatchMiningCandidate, state: SubtitleBatchMiningPanelRenderState): string {
    const language = state.language;
    const selected = state.selectedKeys.has(candidate.key);
    const selectLabel = subtitleText(language, batchMiningSelectLabelKey(selected));
    const wordLabel = `${selectLabel}: ${candidate.card.spelling}`;
    const content = subtitleContentAttributes(state.targetContent);
    return `<div class="jpdb-subtitle-batch-row" role="listitem" data-batch-candidate-key="${escapeHtml(candidate.key)}" data-selected="${selected}"><button class="jpdb-subtitle-batch-check" type="button" data-action="bm-toggle" aria-pressed="${selected}" aria-label="${escapeHtml(wordLabel)}">${batchMiningSelectedIcon(selected)}</button><button class="jpdb-subtitle-batch-word" type="button" data-action="bm-open"><span class="jpdb-subtitle-batch-expression" ${content}>${escapeHtml(candidate.card.spelling)}</span>${renderBatchMiningReading(candidate, content)}</button><div class="jpdb-subtitle-batch-meta">${renderBatchMiningIPlusOneBadge(candidate, language)}<span>${escapeHtml(cardStateLabel(candidate.state, language))}</span><span>${escapeHtml(formatSubtitleText(language, 'bmOccurrences', { count: candidate.occurrences }))}</span><span>${escapeHtml(formatSubtitleTime(candidate.start))}</span></div><div class="jpdb-subtitle-batch-sentence" ${content}>${escapeHtml(candidate.sentence)}</div>${renderBatchMiningCandidateGrades(candidate, state)}</div>`;
}

function batchMiningSelectLabelKey(selected: boolean): 'bmDeselect' | 'bmSelect' {
    return selected ? 'bmDeselect' : 'bmSelect';
}

function batchMiningSelectedIcon(selected: boolean): string {
    return selected ? subtitleIcon('check') : '';
}

function renderBatchMiningReading(candidate: SubtitleBatchMiningCandidate, content: string): string {
    if (!candidate.card.reading || candidate.card.reading === candidate.card.spelling) return '';
    return `<span class="jpdb-subtitle-batch-reading" ${content}>${escapeHtml(candidate.card.reading)}</span>`;
}

function renderBatchMiningIPlusOneBadge(candidate: SubtitleBatchMiningCandidate, language: InterfaceLanguage): string {
    if (!candidate.iPlusOne) return '';
    return `<span class="jpdb-subtitle-batch-badge">${escapeHtml(subtitleText(language, 'bmIPlusOne'))}</span>`;
}

function renderBatchMiningCandidateGrades(candidate: SubtitleBatchMiningCandidate, state: SubtitleBatchMiningPanelRenderState): string {
    if (!state.reviewGrades.length) return '';
    const label = `${subtitleText(state.language, 'bmGradeWord')}: ${candidate.card.spelling}`;
    return `<div class="jpdb-subtitle-batch-row-grades" role="group" aria-label="${escapeHtml(label)}">${renderBatchMiningGradeButtons({
        action: 'bm-grade',
        grades: state.reviewGrades,
        ariaContext: label,
    })}</div>`;
}

function renderBatchMiningGradeGroup(options: {
    action: string;
    label: string;
    grades: SubtitleBatchMiningGradeOption[];
    disabled?: boolean;
    className?: string;
}): string {
    if (!options.grades.length) return '';
    return `<div class="jpdb-subtitle-batch-grade-group ${escapeHtml(options.className ?? '')}" role="group" aria-label="${escapeHtml(options.label)}"><span class="jpdb-subtitle-batch-grade-label">${escapeHtml(options.label)}</span><div class="jpdb-subtitle-batch-grade-buttons">${renderBatchMiningGradeButtons(options)}</div></div>`;
}

function renderBatchMiningGradeButtons(options: {
    action: string;
    grades: SubtitleBatchMiningGradeOption[];
    disabled?: boolean;
    ariaContext?: string;
}): string {
    return options.grades.map(({ grade, label }) => {
        const ariaLabel = options.ariaContext ? `${label}: ${options.ariaContext}` : label;
        return `<button class="jpdb-subtitle-batch-grade-button" type="button" data-action="${escapeHtml(options.action)}" data-grade="${escapeHtml(grade)}" ${options.disabled ? 'disabled' : ''} aria-label="${escapeHtml(ariaLabel)}">${escapeHtml(label)}</button>`;
    }).join('');
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
