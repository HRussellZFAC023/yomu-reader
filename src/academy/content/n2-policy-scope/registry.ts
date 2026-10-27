import { createN2PolicyScopePackage } from './package';
import { validateN2PolicyScope } from './plugin';
import type { N2PolicyScopePackage } from './types';

const packageRecord = createN2PolicyScopePackage();
const validationIssues = validateN2PolicyScope(packageRecord.activity);
if (validationIssues.length) {
    throw new TypeError(`Invalid N2 policy-scope package: ${validationIssues.map(issue => issue.path).join(', ')}`);
}

export const N2_POLICY_SCOPE_PACKAGES: readonly N2PolicyScopePackage[] = Object.freeze([packageRecord]);
