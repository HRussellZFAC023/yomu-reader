import type { JPDBGrade } from '../app/types';
import type { NewTabStudyStepKind } from './study-session';

// Every per-step mini result normalizes to one of these three, so the final
// reveal can summarize a mixed flow (doodle pass, recall correct, pitch wrong,
// type-word skipped) without each step re-inventing its own vocabulary.
// `undefined` means the step was never attempted this session.
export type StudyStepOutcome = 'correct' | 'wrong' | 'skipped';

export type StudyStepOutcomes = Partial<Record<NewTabStudyStepKind, StudyStepOutcome>>;

// The DOM summary strip uses 'none' where a step has no recorded outcome, so the
// icon layer never has to branch on undefined. Kept separate from the logic
// vocabulary above to keep the map values plain strings for the data attribute.
export type StudySummaryState = StudyStepOutcome | 'none';

export function studySummaryState(outcome: StudyStepOutcome | undefined): StudySummaryState {
    return outcome ?? 'none';
}

// Map the aggregate mini-outcomes onto ONE of the grade buttons the final reveal
// actually renders (5-button nothing/something/hard/okay/easy, or 2-button
// fail/pass). This is a suggestion the UI highlights — it never auto-grades, and
// the learner's manual choice always wins. Rules (owner intent):
//   - nothing attempted (empty, or only skips) -> no suggestion (null)
//   - every attempted step correct             -> the strong pass button
//   - some attempted wrong (but not all)       -> the mild-fail button
//   - every attempted step wrong               -> the hard-fail button
//   - skips never drag the suggestion down (they are neither right nor wrong)
export function suggestedStudyGrade(outcomes: StudyStepOutcomes, grades: JPDBGrade[]): JPDBGrade | null {
    const attempted = Object.values(outcomes).filter((outcome): outcome is StudyStepOutcome => outcome === 'correct' || outcome === 'wrong');
    if (!attempted.length) return null;
    const wrong = attempted.filter(outcome => outcome === 'wrong').length;
    if (wrong === 0) return firstGrade(grades, ['pass', 'okay', 'easy']);
    if (wrong === attempted.length) return firstGrade(grades, ['fail', 'nothing', 'something', 'hard']);
    return firstGrade(grades, ['fail', 'hard', 'something', 'nothing']);
}

function firstGrade(grades: JPDBGrade[], preference: JPDBGrade[]): JPDBGrade | null {
    for (const grade of preference) {
        if (grades.includes(grade)) return grade;
    }
    return grades[0] ?? null;
}
