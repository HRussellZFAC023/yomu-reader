import { createN3PetHousingPackage } from './package';
import { validateN3PetHousing } from './plugin';
import type { N3PetHousingPackage } from './types';

const packageRecord = createN3PetHousingPackage();
const validationIssues = validateN3PetHousing(packageRecord.activity);
if (validationIssues.length) {
    throw new TypeError(`Invalid N3 pet-housing package: ${validationIssues.map(issue => issue.path).join(', ')}`);
}

export const N3_PET_HOUSING_PACKAGES: readonly N3PetHousingPackage[] = Object.freeze([packageRecord]);
