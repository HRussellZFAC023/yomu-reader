import { uiText } from './i18n';
import type { JPDBCard, JPDBGrade, ReaderSettings } from './types';

export type QueuedNewTabGradeTarget = 'anki' | 'jpdb-api';
export type NewTabReviewTarget = QueuedNewTabGradeTarget | 'jpdb-live';

export interface NewTabGradeFailure {
    target: NewTabReviewTarget;
    error: unknown;
}

export class NewTabGradeSubmissionError extends Error {
    constructor(readonly failures: NewTabGradeFailure[]) {
        super(failures.map(failure => failure.error instanceof Error ? failure.error.message : String(failure.error)).join('; '));
        this.name = 'NewTabGradeSubmissionError';
    }
}

export function isReviewSource(source: JPDBCard['reviewSource']): boolean {
    return source === 'anki' || source === 'jpdb-api' || source === 'jpdb-live';
}

export function isPositiveJpdbCard(card: JPDBCard): boolean {
    return card.source === 'jpdb' && card.vid > 0 && card.sid > 0;
}

export function newTabCardSourceLabel(card: JPDBCard, language: ReaderSettings['interfaceLanguage']): string {
    if (card.source === 'anki' || card.reviewSource === 'anki') return ankiReviewSourceLabel(card, language);
    if (card.source === 'local' || card.source === 'fallback' || card.reviewSource === 'dictionary') return uiText(language, 'dictionary');
    if (card.source === 'jpdb' || card.reviewSource === 'jpdb-api' || card.reviewSource === 'jpdb-live') return 'JPDB';
    return card.vid > 0 && card.sid > 0 ? 'JPDB' : uiText(language, 'dictionary');
}

export function ankiReviewSourceLabel(card: JPDBCard, language: ReaderSettings['interfaceLanguage']): string {
    const kind = ankiCardKindLabel(card, language);
    return kind ? `Anki ${kind}` : 'Anki';
}

export function ankiCardKindLabel(card: JPDBCard, language: ReaderSettings['interfaceLanguage']): string {
    if (card.ankiCardKind === 'kanji') return uiText(language, 'kanji');
    if (card.ankiCardKind === 'kana') return language === 'ja' ? 'かな' : 'Kana';
    if (card.ankiCardKind === 'sentence') return language === 'ja' ? '文' : 'Sentence';
    if (card.ankiCardKind === 'other') return language === 'ja' ? 'その他' : 'Other';
    return '';
}

export function isLockedJpdbReviewCard(card: JPDBCard): boolean {
    return card.cardState.includes('locked') && (card.source === 'jpdb' || card.reviewSource === 'jpdb-api' || card.reviewSource === 'jpdb-live');
}

export function reviewTargetsForNewTabCard(card: JPDBCard, settings: ReaderSettings, ankiCardId: number | null): NewTabReviewTarget[] {
    if (!settings.enableReviews) return [];
    const targets: NewTabReviewTarget[] = [];
    const add = (target: NewTabReviewTarget): void => {
        if (!targets.includes(target)) targets.push(target);
    };
    if (card.reviewSource === 'jpdb-live') {
        if (settings.jpdbMiningEnabled) add('jpdb-live');
    } else if (!isLockedJpdbReviewCard(card)
        && (card.reviewSource === 'jpdb-api' || isPositiveJpdbCard(card))
        && settings.jpdbMiningEnabled
        && Boolean(settings.apiKey.trim())) {
        add('jpdb-api');
    }
    if (settings.newTabAnkiEnabled && ankiCardId) add('anki');
    return targets;
}

export function queueableNewTabReviewTargets(targets: NewTabReviewTarget[]): QueuedNewTabGradeTarget[] {
    return targets.filter((target): target is QueuedNewTabGradeTarget => target === 'anki' || target === 'jpdb-api');
}

export function passingNewTabGrade(grade: JPDBGrade): boolean {
    return grade === 'pass' || grade === 'easy' || grade === 'okay';
}

export function newTabGradeOptions(settings: ReaderSettings): Array<[JPDBGrade, string]> {
    return settings.twoButtonReviews
        ? [['fail', uiText(settings.interfaceLanguage, 'gradeFailLabel')], ['pass', uiText(settings.interfaceLanguage, 'gradePassLabel')]]
        : [
            ['nothing', uiText(settings.interfaceLanguage, 'gradeNothingLabel')],
            ['something', uiText(settings.interfaceLanguage, 'gradeSomethingLabel')],
            ['hard', uiText(settings.interfaceLanguage, 'gradeHardLabel')],
            ['okay', uiText(settings.interfaceLanguage, 'gradeOkayLabel')],
            ['easy', uiText(settings.interfaceLanguage, 'gradeEasyLabel')],
        ];
}
