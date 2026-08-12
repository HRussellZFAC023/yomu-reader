import { el } from '../dom/builder';
import { ACADEMY_SRS_LABEL } from '../app/constants';
import type { JPDBGrade } from '../app/types';
import type { NewTabReviewTarget } from './review-targets';
import { newTabAction, newTabActionSelector } from './actions';
import {
    bindPrivateCommandCapability,
    readReviewTargetCapability,
} from '../dom/private-command-capabilities';

export interface NewTabLookupReviewTarget {
    id: string;
    kind: 'jpdb' | 'jiten' | 'bunpro' | 'wanikani' | 'yomu-local' | 'anki';
    label: string;
    shortLabel: string;
    ankiCardId?: number;
}

export interface NewTabLookupReviewTargetSelection {
    kind: NewTabLookupReviewTarget['kind'];
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
    hasBunpro: boolean;
    hasWanikani: boolean;
    hasYomuLocal: boolean;
    hasAnki: boolean;
}

interface NewTabGradeTargetLabels {
    all: string;
    anki: string;
    bunpro: string;
    jiten: string;
    jitenAndAnki: string;
    jpdb: string;
    jpdbAndAnki: string;
    jpdbAndJiten: string;
    wanikani: string;
    yomuLocal: string;
}

interface RenderNewTabGradeControlsOptions {
    apiShortLabel: string;
    bothLabel: string;
    grades: Array<[JPDBGrade, string]>;
    intervals?: Partial<Record<JPDBGrade, { buttonLabel?: string; intervalLabel?: string; label?: string }>>;
    keyHints?: Partial<Record<JPDBGrade, string>>;
    showShortcutHints?: boolean;
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
        hasBunpro: targets.includes('bunpro-api'),
        hasWanikani: targets.includes('wanikani-api'),
        hasYomuLocal: targets.includes('yomu-local'),
        hasAnki: targets.includes('anki'),
    };
}

function isJpdbReviewTarget(target: NewTabReviewTarget): boolean {
    return target === 'jpdb-api' || target === 'jpdb-live';
}

export function newTabGradeTargetLabel(summary: NewTabReviewSourceSummary, labels: NewTabGradeTargetLabels): string {
    if (summary.hasBunpro) return labels.bunpro;
    if (summary.hasWanikani) return labels.wanikani;
    if (summary.hasYomuLocal) return labels.yomuLocal;
    if (summary.hasJpdb && summary.hasJiten) return summary.hasAnki ? labels.all : labels.jpdbAndJiten;
    if (summary.hasJiten && summary.hasAnki) return labels.jitenAndAnki;
    if (summary.hasJpdb && summary.hasAnki) return labels.jpdbAndAnki;
    if (summary.hasAnki) return labels.anki;
    if (summary.hasJiten) return labels.jiten;
    return labels.jpdb;
}

export function newTabApiGradeTargetShortLabel(summary: NewTabReviewSourceSummary): string {
    if (summary.hasBunpro) return 'Bunpro';
    if (summary.hasWanikani) return 'WaniKani';
    if (summary.hasYomuLocal) return ACADEMY_SRS_LABEL;
    if (summary.hasJpdb && summary.hasJiten) return 'Jiten + JPDB';
    return summary.hasJiten ? 'Jiten' : 'JPDB';
}

export function newTabMainGradeTargetOptions(
    targets: NewTabLookupReviewTarget[],
    combinedLabel: string,
    bothLabel: string,
): NewTabMainGradeTargetOption[] {
    const hasApi = targets.some(target => target.kind !== 'anki');
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
        ...options.grades.map(([grade, label]) => renderNewTabGradeButton(grade, label, options.targetLabel, options.intervals?.[grade], options.keyHints?.[grade], options.showShortcutHints !== false)),
        renderNewTabGradeTargetControl(options),
    ];
}

export function selectedNewTabMainGradeTarget(root: HTMLElement): NewTabLookupReviewTargetSelection | undefined {
    const target = readReviewTargetCapability(selectedNewTabGradeTargetOption(root));
    if (!target || target.target === 'both') return undefined;
    return newTabLookupReviewTargetSelection(target);
}

function selectedNewTabGradeTargetOption(root: HTMLElement): HTMLOptionElement | null {
    const select = root.querySelector<HTMLSelectElement>('[data-newtab-grade-target-select]');
    if (!select) return null;
    return select.options[select.selectedIndex] ?? null;
}

function newTabLookupReviewTargetSelection(target: NonNullable<ReturnType<typeof readReviewTargetCapability>>): NewTabLookupReviewTargetSelection {
    if (target.target === 'anki' && target.ankiCardId) return { kind: 'anki', ankiCardId: target.ankiCardId };
    return { kind: target.target as NewTabLookupReviewTarget['kind'] };
}

export function updateNewTabMainGradeTargetLabel(root: HTMLElement, option: HTMLOptionElement | null, bothLabel: string): void {
    const selection = readReviewTargetCapability(option);
    if (!selection) return;
    const label = selection.label;
    const shortLabel = selection.shortLabel || bothLabel;
    updateNewTabGradeTargetText(root, label, shortLabel);
    updateMainGradeButtonLabels(root, label);
}

function updateNewTabGradeTargetText(root: HTMLElement, label: string, shortLabel: string): void {
    const target = root.querySelector<HTMLElement>('[data-newtab-grade-target]');
    const text = target?.querySelector<HTMLElement>('[data-newtab-grade-target-text]');
    if (target) target.setAttribute('aria-label', label || shortLabel);
    if (text) text.textContent = shortLabel;
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
    }, ...options.map((option, index) => privateReviewTargetOption(option, index)));
}

function privateReviewTargetOption(option: NewTabMainGradeTargetOption, index: number): HTMLOptionElement {
    const element = el('option', {
            value: option.id,
            selected: index === 0,
            title: option.label,
            dataset: {
                newtabReviewTarget: option.kind,
                newtabGradeTargetLabel: option.label,
                newtabGradeTargetShortLabel: option.shortLabel,
                ...(option.ankiCardId ? { ankiCardId: String(option.ankiCardId) } : {}),
            },
        }, option.shortLabel) as HTMLOptionElement;
    bindPrivateCommandCapability(element, {
        kind: 'review-target',
        target: option.kind,
        gradeProfile: 'standard',
        label: option.label,
        shortLabel: option.shortLabel,
        ankiCardId: option.ankiCardId,
    });
    return element;
}

function renderNewTabGradeButton(
    grade: JPDBGrade,
    label: string,
    targetLabel: string,
    interval?: { buttonLabel?: string; intervalLabel?: string; label?: string },
    keyHint?: string,
    showShortcutHints = true,
): HTMLButtonElement {
    const intervalText = gradeIntervalText(interval);
    const aria = [label, intervalText.button].filter(Boolean).join(', ');
    const title = [targetLabel, intervalText.title].filter(Boolean).join(' · ');
    const button = el('button', {
        type: 'button',
        dataset: { newtabAction: newTabAction('grade'), grade, ...(intervalText.button ? { gradeInterval: intervalText.button } : {}) },
        title,
        'aria-label': `${aria}: ${targetLabel}`,
    },
    el('span', { class: 'jpdb-reader-newtab-grade-label' }, label),
    // jpdb.io/Jiten parity: both advertise their grading keys on the controls.
    // UT-54: touch-only devices never render the hint at all (the CSS
    // pointer:coarse rule stays as a belt for hybrid devices).
    gradeKeyHint(keyHint, showShortcutHints)) as HTMLButtonElement;
    bindPrivateCommandCapability(button, { kind: 'card-action', action: 'grade', grade });
    return button;
}

function gradeIntervalText(interval: { buttonLabel?: string; intervalLabel?: string; label?: string } | undefined): { button: string; title: string } {
    if (!interval) return { button: '', title: '' };
    const button = gradeIntervalButtonText(interval);
    return { button, title: interval.label || button };
}

function gradeIntervalButtonText(interval: { buttonLabel?: string; intervalLabel?: string }): string {
    return interval.buttonLabel || interval.intervalLabel || '';
}

function gradeKeyHint(keyHint: string | undefined, showShortcutHints: boolean): HTMLElement | null {
    const hint = keyHint?.trim() ?? '';
    return hint && newTabKeyHintsRenderable(showShortcutHints)
        ? el('kbd', { class: 'jpdb-reader-newtab-key-hint', 'aria-hidden': 'true' }, hint)
        : null;
}

export function newTabKeyHintsRenderable(showShortcutHints = true): boolean {
    if (!showShortcutHints) return false;
    if (typeof matchMedia !== 'function') return true;
    try {
        const hasFinePointer = matchMedia('(pointer: fine)').matches || matchMedia('(any-pointer: fine)').matches;
        const hasHover = matchMedia('(hover: hover)').matches || matchMedia('(any-hover: hover)').matches;
        return hasFinePointer || hasHover;
    } catch {
        return true;
    }
}

function visibleGradeTargetLabel(label: string): string {
    const parts = label.split(': ');
    return parts.length > 1 ? (parts[parts.length - 1] ?? '').trim() : '';
}

function updateMainGradeButtonLabels(root: HTMLElement, label: string): void {
    root.querySelectorAll<HTMLButtonElement>(newTabActionSelector('grade', '[data-grade]')).forEach(gradeButton => {
        const gradeLabel = [
            gradeButton.querySelector<HTMLElement>('.jpdb-reader-newtab-grade-label')?.textContent?.trim(),
            gradeButton.dataset.gradeInterval,
        ].filter(Boolean).join(', ') || gradeButton.textContent?.trim() || '';
        gradeButton.title = [label, gradeButton.dataset.gradeInterval].filter(Boolean).join(' · ');
        gradeButton.setAttribute('aria-label', gradeLabel ? `${gradeLabel}: ${label}` : label);
    });
}
