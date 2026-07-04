import { uiText } from '../app/i18n';
import { hasBunproFrontendCredential, hasJitenApiCredential, hasJpdbApiCredential, isBunproFrontendCredentialExpired } from '../settings/api-credential';
import type { JPDBCard, JPDBGrade, ReaderSettings } from '../app/types';

export type QueuedNewTabGradeTarget = 'anki' | 'jpdb-api' | 'jiten-api' | 'bunpro-api' | 'yomu-local';
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
    return source === 'anki'
        || source === 'jpdb-api'
        || source === 'jpdb-live'
        || source === 'jiten-api'
        || source === 'bunpro-api'
        || source === 'yomu-local';
}

export function isPositiveJpdbCard(card: JPDBCard): boolean {
    return card.source === 'jpdb' && card.vid > 0 && card.sid > 0;
}

export function isJitenSrsCard(card: JPDBCard): boolean {
    return card.source === 'jiten' || card.reviewSource === 'jiten-api';
}

// UT-60: a jpdb-primary card that merged with its Jiten twin keeps the Jiten
// identity (jitenWordId) without becoming a Jiten-sourced card — gradeability
// follows the identity, not the winning source.
function isJitenGradableCard(card: JPDBCard): boolean {
    return isJitenSrsCard(card) || (typeof card.jitenWordId === 'number' && card.jitenWordId > 0);
}

export function newTabCardSourceLabel(card: JPDBCard, language: ReaderSettings['interfaceLanguage']): string {
    if (card.source === 'anki' || card.reviewSource === 'anki') return ankiReviewSourceLabel(card, language);
    if (card.source === 'bunpro' || card.reviewSource === 'bunpro-api') return 'Bunpro';
    if (card.source === 'yomu-local' || card.reviewSource === 'yomu-local') return 'Yomu';
    // Built-in starter/practice words belong to Yomu, not an imported
    // dictionary — labeling them "Dictionary" made the keyless surface look
    // like it was reviewing a dictionary the user never added. Genuine local
    // dictionary content ('local' / dictionary review source) stays "Dictionary".
    if (card.source === 'fallback') return 'Yomu';
    if (card.source === 'local' || card.reviewSource === 'dictionary') return uiText(language, 'dictionary');
    if (isJitenSrsCard(card)) return 'Jiten';
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

export function reviewTargetsForNewTabCard(card: JPDBCard, settings: ReaderSettings, ankiCardId: number | null): NewTabReviewTarget[] {
    if (!settings.enableReviews) return [];
    const targets: NewTabReviewTarget[] = [];
    const add = (target: NewTabReviewTarget): void => {
        if (!targets.includes(target)) targets.push(target);
    };
    // UT-60: not an else-branch — a card living in both SRS queues offers
    // both API targets, exactly like the jpdb+anki pairing already does.
    if (card.reviewSource !== 'jpdb-live'
        && isJitenGradableCard(card)
        && settings.jpdbMiningEnabled
        && hasJitenApiCredential(settings)) {
        add('jiten-api');
    }
    if (card.reviewSource === 'jpdb-live') {
        if (settings.jpdbMiningEnabled) add('jpdb-live');
    } else if ((card.reviewSource === 'jpdb-api' || isPositiveJpdbCard(card))
        && settings.jpdbMiningEnabled
        && hasJpdbApiCredential(settings)) {
        add('jpdb-api');
    }
    if (card.reviewSource === 'bunpro-api'
        && settings.bunproMiningEnabled
        && hasBunproFrontendCredential(settings)
        && !isBunproFrontendCredentialExpired(settings)) {
        add('bunpro-api');
    }
    if (card.reviewSource === 'yomu-local' && settings.yomuLocalSrsEnabled) add('yomu-local');
    // Built-in starter/practice words grade into the local SRS: they're
    // labeled "Yomu" (source 'fallback') and the local adapter creates the
    // card on first review, so a keyless install's default deck is startable
    // from the starter carousel — not only from mined pages. Without this the
    // carousel branded itself "Yomu" while offering zero grade targets.
    if (card.source === 'fallback' && !card.reviewSource && settings.yomuLocalSrsEnabled) add('yomu-local');
    if (settings.ankiEnabled && settings.newTabAnkiEnabled && ankiCardId) add('anki');
    return targets;
}

export function queueableNewTabReviewTargets(targets: NewTabReviewTarget[]): QueuedNewTabGradeTarget[] {
    return targets.filter((target): target is QueuedNewTabGradeTarget => target === 'anki'
        || target === 'jpdb-api'
        || target === 'jiten-api'
        || target === 'bunpro-api'
        || target === 'yomu-local');
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


// jpdb fail set (nothing/something + the two-button fail): these repeat in
// the session loop. 'hard' is NOT a fail — it advances the card on every
// provider — so this is narrower than !passingNewTabGrade.
export function isFailedNewTabGrade(grade: JPDBGrade): boolean {
    return grade === 'nothing' || grade === 'fail' || grade === 'something';
}
