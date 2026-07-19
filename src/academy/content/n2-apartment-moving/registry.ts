import { createN2ApartmentMovingPackage } from './package';
import { validateN2ApartmentMoving } from './plugin';
import type { N2ApartmentMovingPackage } from './types';

const packageRecord = createN2ApartmentMovingPackage();
const issues = validateN2ApartmentMoving(packageRecord.activity);
if (issues.length) throw new TypeError(`Invalid N2 apartment-moving package: ${issues.map(issue => issue.path).join(', ')}`);

export const N2_APARTMENT_MOVING_PACKAGES: readonly N2ApartmentMovingPackage[] = Object.freeze([packageRecord]);

export function resolveN2ApartmentMovingPackage(id: string): N2ApartmentMovingPackage {
    const found = N2_APARTMENT_MOVING_PACKAGES.find(candidate => candidate.id === id);
    if (!found) throw new TypeError(`Unknown N2 apartment-moving package: ${id}`);
    return found;
}
