// The keycap under each popup grade button ("1" … "5") teaches the grade
// shortcuts once. The stylesheet draws it only on a desktop pointer (fine
// pointer that can hover) and only while <html> carries HINTS_CLASS. The first
// grade the learner gives in a popup, by clicking or by its key, retires the
// keycaps for good: the record lives in Yomu's private storage, never in the
// page's. Until that record has been read the keycaps stay hidden, so a learner
// who already retired them never sees them flash.
import { gmPrivateStorageGet, gmPrivateStorageSet } from '../app/storage';

export const GRADE_KEY_HINTS_RETIRED_KEY = 'yomu:private:grade-key-hints-retired:v1';
const HINTS_CLASS = 'jpdb-reader-grade-key-hints';

let retired = false;

/** Shows the keycaps unless the learner has already retired them. */
export async function showGradeKeyHintsUntilRetired(root: HTMLElement = document.documentElement): Promise<void> {
    // Without storage the keycaps could not stay retired, so they never show.
    const stored = await gmPrivateStorageGet(GRADE_KEY_HINTS_RETIRED_KEY, false).catch(() => true);
    retired ||= stored === true;
    root.classList.toggle(HINTS_CLASS, !retired);
}

/** The learner graded from a popup: the keycaps have done their job. */
export function retireGradeKeyHints(): void {
    document.querySelectorAll(`.${HINTS_CLASS}`).forEach(element => element.classList.remove(HINTS_CLASS));
    if (retired) return;
    retired = true;
    void gmPrivateStorageSet(GRADE_KEY_HINTS_RETIRED_KEY, true).catch(() => undefined);
}

export function resetGradeKeyHintsForTests(): void {
    retired = false;
}
