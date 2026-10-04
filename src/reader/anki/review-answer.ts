import type { JPDBGrade } from '../app/types';
import { userFacingError } from '../app/user-facing-errors';

const nativeEase = new Map<JPDBGrade, 1 | 2 | 3 | 4>([
    ['nothing', 1],
    ['fail', 1],
    ['something', 2],
    ['hard', 2],
    ['okay', 3],
    ['pass', 3],
    ['easy', 4],
]);

export function ankiReviewAnswer(cardId: number, grade: JPDBGrade): { cardId: number; ease: 1 | 2 | 3 | 4 } {
    const ease = nativeEase.get(grade);
    if (!Number.isSafeInteger(cardId) || cardId <= 0
        || ease === undefined) throw userFacingError('ankiConnectActionFailed');
    return { cardId, ease };
}
