import { createN2EventInformationPackage } from './package';
import { validateN2EventInformation } from './plugin';
import type { N2EventInformationPackage } from './types';

const packageRecord = createN2EventInformationPackage();
const validationIssues = validateN2EventInformation(packageRecord.activity);
if (validationIssues.length) {
    throw new TypeError(`Invalid N2 event-information package: ${validationIssues.map(issue => issue.path).join(', ')}`);
}

export const N2_EVENT_INFORMATION_PACKAGES: readonly N2EventInformationPackage[] = Object.freeze([packageRecord]);
