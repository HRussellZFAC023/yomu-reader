import { createN3PetHousingPackage } from './package';
import { validateN3PetHousing } from './plugin';
import type { N3PetHousingPackage } from './types';

const packageRecord = createN3PetHousingPackage();
const validationIssues = validateN3PetHousing(packageRecord.activity);
if (validationIssues.length) {
    throw new TypeError(`Invalid N3 pet-housing package: ${validationIssues.map(issue => issue.path).join(', ')}`);
}

export const N3_PET_HOUSING_PACKAGES: readonly N3PetHousingPackage[] = Object.freeze([packageRecord]);

export function resolveN3PetHousingPackage(id: string): N3PetHousingPackage {
    const found = N3_PET_HOUSING_PACKAGES.find(candidate => candidate.id === id);
    if (!found) throw new TypeError(`Unknown N3 pet-housing package: ${id}`);
    return found;
}
