import { el } from '../dom-builder';
import type { JPDBGrade } from '../types';
import type { NewTabReviewTarget } from './review-targets';

export interface NewTabLookupReviewTarget {
    id: string;
    kind: 'jpdb' | 'jiten' | 'anki';
    label: string;
    shortLabel: string;
    ankiCardId?: number;
}

export interface NewTabLookupReviewTargetSelection {
    kind: 'jpdb' | 'jiten' | 'anki';
    ankiCardId?: number;
}

export interface NewTabMainGradeTargetOption {
    id: string;
    kind: 'both' | NewTabLookupReviewTarget['kind'];
    label: string;
    shortLabel: string;
    ankiCardId?: number;
}

export interface NewTabReviewSourceSummary {
    targets: NewTabReviewTarget[];
    hasJpdb: boolean;
    hasJiten: boolean;
    hasAnki: boolean;
}

interface NewTabGradeTargetLabels {
    anki: string;
    jiten: string;
    jitenAndAnki: string;
    jpdb: string;
    jpdbAndAnki: string;
}

interface RenderNewTabGradeControlsOptions {
    apiShortLabel: string;
    bothLabel: string;
    grades: Array<[JPDBGrade, string]>;
    selectorLabel: string;
    selectedOption?: NewTabMainGradeTargetOption;
    summary: NewTabReviewSourceSummary;
    targetLabel: string;
    targetOptions: NewTabMainGradeTargetOption[];
}

export function summarizeNewTabReviewSources(targets: NewTabReviewTarget[]): NewTabReviewSourceSummary {
    return {
        targets,
        hasJpdb: targets.some(target => isJpdbReviewTarget(target)),
        hasJiten: targets.includes('jiten-api'),
        hasAnki: targets.includes('anki'),
    };
}

function isJpdbReviewTarget(target: NewTabReviewTarget): boolean {
    return target === 'jpdb-api' || target === 'jpdb-live';
}

export function newTabGradeTargetLabel(summary: NewTabReviewSourceSummary, labels: NewTabGradeTargetLabels): string {
    if (summary.hasJiten && summary.hasAnki) return labels.jitenAndAnki;
    if (summary.hasJpdb && summary.hasAnki) return labels.jpdbAndAnki;
    if (summary.hasAnki) return labels.anki;
    if (summary.hasJiten) return labels.jiten;
    return labels.jpdb;
}

export function newTabApiGradeTargetShortLabel(summary: NewTabReviewSourceSummary): string {
    return summary.hasJiten ? 'Jiten' : 'JPDB';
}

export function newTabMainGradeTargetOptions(
    targets: NewTabLookupReviewTarget[],
    combinedLabel: string,
    bothLabel: string,
): NewTabMainGradeTargetOption[] {
    const hasApi = targets.some(target => target.kind === 'jpdb' || target.kind === 'jiten');
    const ankiTargets = targets.filter(target => target.kind === 'anki' && target.ankiCardId);
    const options = targets.map(newTabMainGradeTargetOptionFromLookupTarget);
    if (hasApi && ankiTargets.length) {
        return [
            {
                id: 'both',
                kind: 'both',
                label: combinedLabel,
                shortLabel: bothLabel,
            },
            ...options,
        ];
    }
    return ankiTargets.length > 1 ? options.filter(option => option.kind === 'anki') : [];
}

export function renderNewTabGradeControlButtons(options: RenderNewTabGradeControlsOptions): HTMLElement[] {
    return [
        renderNewTabGradeTargetLabel(options),
        ...(options.targetOptions.length > 1 ? [renderNewTabMainGradeTargetSelector(options.targetOptions, options.selectorLabel)] : []),
        ...options.grades.map(([grade, label]) => renderNewTabGradeButton(grade, label, options.targetLabel)),
    ];
}

export function selectedNewTabMainGradeTarget(root: HTMLElement): NewTabLookupReviewTargetSelection | undefined {
    const option = root.querySelector<HTMLSelectElement>('[data-newtab-grade-target-select]')?.selectedOptions[0] ?? null;
    if (!option) return undefined;
    if (option.dataset.newtabReviewTarget === 'jpdb') return { kind: 'jpdb' };
    if (option.dataset.newtabReviewTarget === 'jiten') return { kind: 'jiten' };
    if (option.dataset.newtabReviewTarget !== 'anki') return undefined;
    const ankiCardId = Number(option.dataset.ankiCardId);
    return Number.isFinite(ankiCardId) && ankiCardId > 0
        ? { kind: 'anki', ankiCardId }
        : undefined;
}

export function updateNewTabMainGradeTargetLabel(root: HTMLElement, option: HTMLOptionElement | null, bothLabel: string): void {
    if (!option) return;
    const label = option.dataset.newtabGradeTargetLabel ?? '';
    const target = root.querySelector<HTMLElement>('[data-newtab-grade-target]');
    const chip = target?.querySelector<HTMLElement>('[data-newtab-grade-target-chip]');
    const text = target?.querySelector<HTMLElement>('[data-newtab-grade-target-text]');
    if (chip) {
        chip.dataset.newtabGradeTargetChip = mainGradeTargetKind(option);
        chip.textContent = mainGradeTargetShortLabel(option, bothLabel);
    }
    if (text) text.textContent = label;
    updateMainGradeButtonLabels(root, label);
}

function newTabMainGradeTargetOptionFromLookupTarget(target: NewTabLookupReviewTarget): NewTabMainGradeTargetOption {
    return {
        id: target.id,
        kind: target.kind,
        label: target.label,
        shortLabel: target.shortLabel,
        ankiCardId: target.ankiCardId,
    };
}

function renderNewTabGradeTargetLabel(options: RenderNewTabGradeControlsOptions): HTMLElement {
    return el('div', { class: 'jpdb-reader-newtab-grade-target', dataset: { newtabGradeTarget: true } },
        renderNewTabGradeTargetChip(options),
        el('span', { dataset: { newtabGradeTargetText: true } }, options.targetLabel),
    );
}

function renderNewTabGradeTargetChip(options: RenderNewTabGradeControlsOptions): HTMLElement {
    const chip = newTabGradeTargetChipState(options);
    return el('span', { class: 'jpdb-reader-newtab-grade-target-chip', dataset: { newtabGradeTargetChip: chip.source } }, chip.label);
}

function newTabGradeTargetChipState(options: RenderNewTabGradeControlsOptions): { label: string; source: NewTabMainGradeTargetOption['kind'] } {
    if (options.selectedOption) return { label: options.selectedOption.shortLabel, source: options.selectedOption.kind };
    const hasApi = options.summary.hasJpdb || options.summary.hasJiten;
    return {
        label: gradeTargetChipLabel(hasApi, options.summary.hasAnki, options.apiShortLabel, options.bothLabel),
        source: gradeTargetChipSource(hasApi, options.summary.hasAnki, options.summary.hasJiten),
    };
}

function renderNewTabMainGradeTargetSelector(options: NewTabMainGradeTargetOption[], selectorLabel: string): HTMLElement {
    return el('label', {
        class: 'jpdb-reader-newtab-grade-target-selector',
        dataset: { newtabGradeTargetSelector: true },
    },
        el('span', { class: 'jpdb-reader-newtab-grade-target-selector-label' }, selectorLabel),
        el('select', {
            class: 'jpdb-reader-newtab-grade-target-select',
            dataset: { newtabGradeTargetSelect: true },
            'aria-label': selectorLabel,
        }, ...options.map((option, index) => el('option', {
            value: option.id,
            selected: index === 0,
            dataset: {
                newtabReviewTarget: option.kind,
                newtabGradeTargetLabel: option.label,
                newtabGradeTargetShortLabel: option.shortLabel,
                ...(option.ankiCardId ? { ankiCardId: String(option.ankiCardId) } : {}),
            },
        }, option.shortLabel))),
    );
}

function renderNewTabGradeButton(grade: JPDBGrade, label: string, targetLabel: string): HTMLButtonElement {
    return el('button', {
        type: 'button',
        dataset: { newtabAction: 'grade', grade },
        title: targetLabel,
        'aria-label': `${label}: ${targetLabel}`,
    }, label);
}

function mainGradeTargetKind(option: HTMLOptionElement): NewTabMainGradeTargetOption['kind'] {
    const kind = option.dataset.newtabReviewTarget;
    return kind === 'jpdb' || kind === 'jiten' || kind === 'anki' ? kind : 'both';
}

function mainGradeTargetShortLabel(option: HTMLOptionElement, fallback: string): string {
    return option.dataset.newtabGradeTargetShortLabel || option.textContent?.trim() || fallback;
}

function updateMainGradeButtonLabels(root: HTMLElement, label: string): void {
    root.querySelectorAll<HTMLButtonElement>('[data-newtab-action="grade"][data-grade]').forEach(gradeButton => {
        const gradeLabel = gradeButton.textContent?.trim() || '';
        gradeButton.title = label;
        gradeButton.setAttribute('aria-label', gradeLabel ? `${gradeLabel}: ${label}` : label);
    });
}

function gradeTargetChipLabel(hasApi: boolean, hasAnki: boolean, apiLabel: string, bothLabel: string): string {
    if (hasApi && hasAnki) return bothLabel;
    return hasAnki ? 'Anki' : apiLabel;
}

function gradeTargetChipSource(hasApi: boolean, hasAnki: boolean, hasJiten: boolean): NewTabMainGradeTargetOption['kind'] {
    if (hasApi && hasAnki) return 'both';
    if (hasAnki) return 'anki';
    return hasJiten ? 'jiten' : 'jpdb';
}
