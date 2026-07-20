import { createN2PpoiImpressionPackage } from './package';
import { validateN2PpoiImpression } from './plugin';
import type { N2PpoiImpressionPackage } from './types';

const packageRecord = createN2PpoiImpressionPackage();
const issues = validateN2PpoiImpression(packageRecord.activity);
if (issues.length) throw new TypeError(`Invalid N2 -ppoi package: ${issues.map(issue => issue.path).join(', ')}`);
export const N2_PPOI_IMPRESSION_PACKAGES: readonly N2PpoiImpressionPackage[] = Object.freeze([packageRecord]);
