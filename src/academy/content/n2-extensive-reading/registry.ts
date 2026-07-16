import { createN2ExtensiveReadingPackage } from './package';
import { validateN2ExtensiveReading } from './plugin';
import type { N2ExtensiveReadingPackage } from './types';

const packageRecord = createN2ExtensiveReadingPackage();
const validationIssues = validateN2ExtensiveReading(packageRecord.activity);
if (validationIssues.length) {
    throw new TypeError(`Invalid N2 extensive-reading package: ${validationIssues.map(issue => issue.path).join(', ')}`);
}

export const N2_EXTENSIVE_READING_PACKAGES: readonly N2ExtensiveReadingPackage[] = Object.freeze([packageRecord]);

export function resolveN2ExtensiveReadingPackage(id: string): N2ExtensiveReadingPackage {
    const found = N2_EXTENSIVE_READING_PACKAGES.find(candidate => candidate.id === id);
    if (!found) throw new TypeError(`Unknown N2 extensive-reading package: ${id}`);
    return found;
}
