import { el } from '../dom/builder';
import type { JPDBGrade } from '../app/types';
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
    intervals?: Partial<Record<JPDBGrade, { buttonLabel?: string; intervalLabel?: string; label?: string }>>;
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
        ...options.grades.map(([grade, label]) => renderNewTabGradeButton(grade, label, options.targetLabel, options.intervals?.[grade])),
        renderNewTabGradeTargetControl(options),
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
    const shortLabel = mainGradeTargetShortLabel(option, bothLabel);
    const target = root.querySelector<HTMLElement>('[data-newtab-grade-target]');
    const text = target?.querySelector<HTMLElement>('[data-newtab-grade-target-text]');
    if (target) target.setAttribute('aria-label', label || shortLabel);
    if (text) text.textContent = shortLabel;
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

function renderNewTabGradeTargetControl(options: RenderNewTabGradeControlsOptions): HTMLElement {
    const visibleLabel = options.selectedOption?.shortLabel || visibleGradeTargetLabel(options.targetLabel);
    if (options.targetOptions.length > 1) {
        return el('div', { class: 'jpdb-reader-newtab-grade-target jpdb-reader-newtab-grade-target-context', dataset: { newtabGradeTarget: true }, 'aria-label': options.targetLabel },
            el('span', { class: 'jpdb-reader-newtab-grade-target-current', dataset: { newtabGradeTargetText: true } }, visibleLabel),
            el('label', { class: 'jpdb-reader-newtab-sr-only' },
                el('span', { class: 'jpdb-reader-newtab-grade-target-selector-label' }, options.selectorLabel),
                renderNewTabMainGradeTargetSelector(options.targetOptions, options.selectorLabel),
            ),
        );
    }
    if (!visibleLabel) return el('span', { class: 'jpdb-reader-newtab-sr-only', dataset: { newtabGradeTarget: true, newtabGradeTargetText: true } }, options.targetLabel);
    return el('span', {
        class: 'jpdb-reader-newtab-grade-target jpdb-reader-newtab-grade-target-context',
        dataset: { newtabGradeTarget: true, newtabGradeTargetText: true },
        'aria-label': options.targetLabel,
    }, visibleLabel);
}

function renderNewTabMainGradeTargetSelector(options: NewTabMainGradeTargetOption[], selectorLabel: string): HTMLElement {
    return el('select', {
        class: 'jpdb-reader-newtab-grade-target-select',
        dataset: { newtabGradeTargetSelector: true, newtabGradeTargetSelect: true },
        'aria-label': selectorLabel,
    }, ...options.map((option, index) => el('option', {
            value: option.id,
            selected: index === 0,
            title: option.label,
            dataset: {
                newtabReviewTarget: option.kind,
                newtabGradeTargetLabel: option.label,
                newtabGradeTargetShortLabel: option.shortLabel,
                ...(option.ankiCardId ? { ankiCardId: String(option.ankiCardId) } : {}),
            },
        }, option.shortLabel)));
}

function renderNewTabGradeButton(
    grade: JPDBGrade,
    label: string,
    targetLabel: string,
    interval?: { buttonLabel?: string; intervalLabel?: string; label?: string },
): HTMLButtonElement {
    const intervalLabel = interval?.buttonLabel || interval?.intervalLabel || '';
    const aria = [label, intervalLabel].filter(Boolean).join(', ');
    const title = [targetLabel, interval?.label || intervalLabel].filter(Boolean).join(' · ');
    return el('button', {
        type: 'button',
        dataset: { newtabAction: 'grade', grade, ...(intervalLabel ? { gradeInterval: intervalLabel } : {}) },
        title,
        'aria-label': `${aria}: ${targetLabel}`,
    },
    el('span', { class: 'jpdb-reader-newtab-grade-label' }, label));
}

function mainGradeTargetShortLabel(option: HTMLOptionElement, fallback: string): string {
    return option.dataset.newtabGradeTargetShortLabel || option.textContent?.trim() || fallback;
}

function visibleGradeTargetLabel(label: string): string {
    const parts = label.split(': ');
    return parts.length > 1 ? (parts[parts.length - 1] ?? '').trim() : '';
}

function updateMainGradeButtonLabels(root: HTMLElement, label: string): void {
    root.querySelectorAll<HTMLButtonElement>('[data-newtab-action="grade"][data-grade]').forEach(gradeButton => {
        const gradeLabel = [
            gradeButton.querySelector<HTMLElement>('.jpdb-reader-newtab-grade-label')?.textContent?.trim(),
            gradeButton.dataset.gradeInterval,
        ].filter(Boolean).join(', ') || gradeButton.textContent?.trim() || '';
        gradeButton.title = [label, gradeButton.dataset.gradeInterval].filter(Boolean).join(' · ');
        gradeButton.setAttribute('aria-label', gradeLabel ? `${gradeLabel}: ${label}` : label);
    });
}
