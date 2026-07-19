import { createN1OpeningSequencePackage } from './package';
import { validateN1OpeningSequence } from './plugin';
import type { N1OpeningSequencePackage } from './types';

const packageRecord = createN1OpeningSequencePackage();
const validationIssues = validateN1OpeningSequence(packageRecord.activity);
if (validationIssues.length) {
    throw new TypeError(
        `Invalid N1 opening-sequence package: ${validationIssues.map(issue => issue.path).join(', ')}`,
    );
}

export const N1_OPENING_SEQUENCE_PACKAGES: readonly N1OpeningSequencePackage[] = Object.freeze([packageRecord]);

export function resolveN1OpeningSequencePackage(id: string): N1OpeningSequencePackage {
    const found = N1_OPENING_SEQUENCE_PACKAGES.find(candidate => candidate.id === id);
    if (!found) throw new TypeError(`Unknown N1 opening-sequence package: ${id}`);
    return found;
}
