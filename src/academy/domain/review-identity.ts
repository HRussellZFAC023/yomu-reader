import { canonicalStudyCardKey } from '../../reader/srs/shared';

/** Canonical Study identity shared by grounding, runtime authorization and scheduling. */
export function canonicalGroundedReviewKey(expression: string, reading: string | undefined): string {
    return canonicalStudyCardKey(expression, reading);
}

export function canonicalGroundedConceptReviewKey(
    expression: string,
    reading: string | undefined,
    conceptId: string,
): string {
    return `${canonicalGroundedReviewKey(expression, reading)}\u0000${conceptId}`;
}
