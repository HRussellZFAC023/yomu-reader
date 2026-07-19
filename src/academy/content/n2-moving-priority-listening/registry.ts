import { createN2MovingPriorityListeningPackage } from './package';
import { validateN2MovingPriorityListening } from './plugin';
import type { N2MovingPriorityListeningPackage } from './types';
const packageRecord = createN2MovingPriorityListeningPackage();
const issues = validateN2MovingPriorityListening(packageRecord.activity);
if (issues.length) throw new TypeError(`Invalid N2 moving-priority listening package: ${issues.map(issue => issue.path).join(', ')}`);
export const N2_MOVING_PRIORITY_LISTENING_PACKAGES: readonly N2MovingPriorityListeningPackage[] = Object.freeze([packageRecord]);
export function resolveN2MovingPriorityListeningPackage(id: string): N2MovingPriorityListeningPackage {
    const found = N2_MOVING_PRIORITY_LISTENING_PACKAGES.find(candidate => candidate.id === id);
    if (!found) throw new TypeError(`Unknown N2 moving-priority listening package: ${id}`);
    return found;
}
