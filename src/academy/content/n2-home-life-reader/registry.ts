import { createN2HomeLifeReaderPackage } from './package';
import { validateN2HomeLifeReader } from './plugin';
import type { N2HomeLifeReaderPackage } from './types';
const packageRecord = createN2HomeLifeReaderPackage();
const issues = validateN2HomeLifeReader(packageRecord.activity);
if (issues.length) throw new TypeError(`Invalid N2 home-life reader package: ${issues.map(issue => issue.path).join(', ')}`);
export const N2_HOME_LIFE_READER_PACKAGES: readonly N2HomeLifeReaderPackage[] = Object.freeze([packageRecord]);
export function resolveN2HomeLifeReaderPackage(id: string): N2HomeLifeReaderPackage {
    const found = N2_HOME_LIFE_READER_PACKAGES.find(candidate => candidate.id === id);
    if (!found) throw new TypeError(`Unknown N2 home-life reader package: ${id}`);
    return found;
}
