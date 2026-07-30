import { uiText } from './i18n';
import type { InterfaceLanguage } from './types';
import {
    LEARNING_TARGET_ROSTER,
    learningTargetRosterEntry,
    type LearningTargetRosterEntry,
    type LearningTargetRosterId,
    type StudyTargetReadiness,
} from '../languages/roster';

const READINESS_LABEL_KEYS = {
    full: 'studyTargetReadinessFull',
    'reading-only': 'studyTargetReadinessReadingOnly',
    planned: 'studyTargetReadinessPlanned',
} as const satisfies Record<StudyTargetReadiness, Parameters<typeof uiText>[1]>;

const READINESS_REASON_KEYS = {
    full: 'studyTargetReadinessFullReason',
    'reading-only': 'studyTargetReadinessReadingOnlyReason',
    planned: 'studyTargetReadinessPlannedReason',
} as const satisfies Record<StudyTargetReadiness, Parameters<typeof uiText>[1]>;

export const STUDY_TARGET_READINESS_ATTRIBUTE = 'data-study-target-readiness';

export interface StudyTargetOption {
    id: LearningTargetRosterId;
    runtimeLocale: string;
    direction: string;
    label: string;
    readiness: StudyTargetReadiness;
    reason: string;
    disabled: boolean;
}

export function studyTargetOptions(
    language: InterfaceLanguage,
    targets: readonly LearningTargetRosterEntry[] = LEARNING_TARGET_ROSTER,
): readonly StudyTargetOption[] {
    return targets.map(target => {
        const readiness = target.studyTargetReadiness;
        const name = target.nativeName === target.englishName
            ? target.nativeName
            : `${target.nativeName} — ${target.englishName}`;
        return {
            id: target.id,
            runtimeLocale: target.runtimeLocale,
            direction: target.direction,
            label: `${name} · ${uiText(language, READINESS_LABEL_KEYS[readiness])}`,
            readiness,
            reason: uiText(language, READINESS_REASON_KEYS[readiness]),
            disabled: readiness === 'planned',
        };
    });
}

export function populateStudyTargetSelect(
    select: HTMLSelectElement,
    language: InterfaceLanguage,
    selected: LearningTargetRosterId,
): void {
    select.replaceChildren(...studyTargetOptions(language).map(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.lang = item.runtimeLocale;
        option.dir = item.direction;
        option.textContent = item.label;
        option.title = item.reason;
        option.disabled = item.disabled;
        option.setAttribute(STUDY_TARGET_READINESS_ATTRIBUTE, item.readiness);
        option.setAttribute('aria-label', `${item.label}. ${item.reason}`);
        option.selected = item.id === selected;
        return option;
    }));
}

export function isSelectableStudyTarget(id: LearningTargetRosterId): boolean {
    return learningTargetRosterEntry(id).studyTargetReadiness !== 'planned';
}
