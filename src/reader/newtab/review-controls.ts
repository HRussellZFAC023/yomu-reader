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
        ...options.grades.map(([grade, label], index) => renderNewTabGradeButton(grade, label, options.targetLabel, options.intervals?.[grade], index + 1)),
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
        const handle = el('span', {
            class: 'jpdb-reader-mining-collapse jpdb-reader-mining-drawer-handle',
            dataset: { expanded: 'false' },
            'aria-hidden': 'true',
        });
        const details = el('details', {
            class: 'jpdb-reader-newtab-grade-target jpdb-reader-newtab-grade-target-context',
            dataset: { newtabGradeTarget: true, expanded: 'false' },
            'aria-label': options.targetLabel,
            'aria-expanded': 'false',
        },
            el('summary', { class: 'jpdb-reader-newtab-grade-target-summary', title: options.targetLabel, 'aria-label': options.targetLabel },
                el('span', { class: 'jpdb-reader-review-target-current jpdb-reader-newtab-grade-target-current', dataset: { newtabGradeTargetText: true } }, visibleLabel),
                handle,
            ),
            el('label', { class: 'jpdb-reader-mining-panel jpdb-reader-review-target-panel jpdb-reader-newtab-grade-target-panel' },
                el('span', { class: 'jpdb-reader-newtab-grade-target-selector-label' }, options.selectorLabel),
                renderNewTabMainGradeTargetSelector(options.targetOptions, options.selectorLabel),
            ),
        );
        details.addEventListener('toggle', () => {
            const expanded = String(details.open);
            details.dataset.expanded = expanded;
            details.setAttribute('aria-expanded', expanded);
            handle.dataset.expanded = expanded;
        });
        return details;
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
    keyHint?: number,
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
    el('span', { class: 'jpdb-reader-newtab-grade-label' }, label),
    // jpdb.io/Jiten parity: both advertise their grading keys on the
    // controls; digits map to rendered order (handleGradeDigitKeydown).
    // Hidden on touch via CSS.
    keyHint ? el('kbd', { class: 'jpdb-reader-newtab-key-hint', 'aria-hidden': 'true' }, String(keyHint)) : null);
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
