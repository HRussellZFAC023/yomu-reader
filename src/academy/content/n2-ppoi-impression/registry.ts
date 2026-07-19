import { createN2PpoiImpressionPackage } from './package';
import { validateN2PpoiImpression } from './plugin';
import type { N2PpoiImpressionPackage } from './types';

const packageRecord = createN2PpoiImpressionPackage();
const issues = validateN2PpoiImpression(packageRecord.activity);
if (issues.length) throw new TypeError(`Invalid N2 -ppoi package: ${issues.map(issue => issue.path).join(', ')}`);
export const N2_PPOI_IMPRESSION_PACKAGES: readonly N2PpoiImpressionPackage[] = Object.freeze([packageRecord]);
export function resolveN2PpoiImpressionPackage(id: string): N2PpoiImpressionPackage {
    const found = N2_PPOI_IMPRESSION_PACKAGES.find(candidate => candidate.id === id);
    if (!found) throw new TypeError(`Unknown N2 -ppoi package: ${id}`);
    return found;
}
