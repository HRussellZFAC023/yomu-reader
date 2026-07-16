import { createAdvancedImmersionPackage } from './package';
import { validateAdvancedImmersion } from './plugin';
import type { AdvancedImmersionPackage } from './types';

const packageRecord = createAdvancedImmersionPackage();
const validationIssues = validateAdvancedImmersion(packageRecord.activity);
if (validationIssues.length) {
    throw new TypeError(`Invalid advanced immersion package: ${validationIssues.map(issue => issue.path).join(', ')}`);
}

export const ADVANCED_IMMERSION_PACKAGES: readonly AdvancedImmersionPackage[] = Object.freeze([packageRecord]);

export function resolveAdvancedImmersionPackage(id: string): AdvancedImmersionPackage {
    const found = ADVANCED_IMMERSION_PACKAGES.find(candidate => candidate.id === id);
    if (!found) throw new TypeError(`Unknown advanced immersion package: ${id}`);
    return found;
}
