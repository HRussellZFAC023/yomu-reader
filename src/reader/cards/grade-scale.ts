import { uiText } from '../app/i18n';
import type { JPDBCard, JPDBGrade, ReaderSettings } from '../app/types';

export type ReviewGradeProfile = 'standard' | 'jiten' | 'anki' | 'bunpro-regular' | 'bunpro-fsrs';
export type ReviewShortcutKey = keyof ReaderSettings['shortcuts'];
type GradeEntry = [JPDBGrade, Parameters<typeof uiText>[1], ReviewShortcutKey];

const five: GradeEntry[] = [
    ['nothing', 'gradeNothingLabel', 'gradeNothing'],
    ['something', 'gradeSomethingLabel', 'gradeSomething'],
    ['hard', 'gradeHardLabel', 'gradeHard'],
    ['okay', 'gradeOkayLabel', 'gradeOkay'],
    ['easy', 'gradeEasyLabel', 'gradeEasy'],
];
const four: GradeEntry[] = [
    ['nothing', 'gradeAgainLabel', 'gradeNothing'],
    ['hard', 'gradeHardLabel', 'gradeSomething'],
    ['okay', 'gradeGoodLabel', 'gradeHard'],
    ['easy', 'gradeEasyLabel', 'gradeOkay'],
];
const two: GradeEntry[] = [['fail', 'gradeFailLabel', 'gradeFail'], ['pass', 'gradePassLabel', 'gradePass']];
const ankiTwo: GradeEntry[] = [['fail', 'gradeAgainLabel', 'gradeFail'], ['pass', 'gradeGoodLabel', 'gradePass']];
const bunproRegular: GradeEntry[] = [['fail', 'gradeHardLabel', 'gradeFail'], ['pass', 'gradeGoodLabel', 'gradePass']];

/** Resolve from the review destination, not the dictionary that supplied the word. */
export function reviewGradeProfile(card?: JPDBCard, target?: string): ReviewGradeProfile {
    const destination = target && target !== 'both' ? target : card?.reviewSource ?? card?.source;
    if (destination === 'bunpro' || destination === 'bunpro-api') return card?.bunproReviewInputMode === 'fsrs' ? 'bunpro-fsrs' : 'bunpro-regular';
    if (destination === 'jiten' || destination === 'jiten-api') return 'jiten';
    if (destination === 'anki') return 'anki';
    return 'standard';
}

export function reviewGradeScale(settings: Pick<ReaderSettings, 'twoButtonReviews' | 'interfaceLanguage'>, profile: ReviewGradeProfile = 'standard') {
    // Bunpro's session input mode takes precedence over the saved preference.
    const entries = profile === 'bunpro-fsrs' ? four : profile === 'bunpro-regular' ? bunproRegular
        : settings.twoButtonReviews ? (profile === 'anki' ? ankiTwo : two)
        : profile === 'standard' ? five : four;
    return {
        grades: entries.map(([grade, label]): [JPDBGrade, string] => [grade, uiText(settings.interfaceLanguage, label)]),
        shortcuts: entries.map(([grade, , key]): [ReviewShortcutKey, JPDBGrade] => [key, grade]),
        twoButton: entries.length === 2,
    };
}

/**
 * The key that grades this button, for the button to show: four-button
 * Jiten/Anki scales map keys by position (1 Again, 2 Hard, 3 Good, 4 Easy), not
 * by the five-button meaning, so the popover must say which key does what.
 * The stylesheet draws `data-grade-key` on a desktop pointer until the
 * learner's first popup grade (grade-key-hints.ts); `aria-keyshortcuts`
 * always announces it without changing the button's name. A cleared shortcut
 * has no key to show.
 */
export function gradeKeyHintAttributes(settings: Pick<ReaderSettings, 'shortcuts'>, shortcut: ReviewShortcutKey | undefined): string {
    const key = shortcut ? settings.shortcuts[shortcut]?.trim() ?? '' : '';
    if (!key) return '';
    const escaped = key.replace(/[&<>"']/gu, character => `&#${character.charCodeAt(0)};`);
    return ` data-grade-key="${escaped}" aria-keyshortcuts="${escaped}"`;
}
