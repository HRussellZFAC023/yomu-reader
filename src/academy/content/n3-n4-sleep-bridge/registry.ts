import { createN3N4SleepBridgePackage } from './package';
import { validateN3N4SleepBridge } from './plugin';
import type { N3N4SleepBridgePackage } from './types';

const packageRecord = createN3N4SleepBridgePackage();
const validationIssues = validateN3N4SleepBridge(packageRecord.activity);
if (validationIssues.length) {
    throw new TypeError(`Invalid N3/N4 sleep bridge package: ${validationIssues.map(issue => issue.path).join(', ')}`);
}

export const N3_N4_SLEEP_BRIDGE_PACKAGES: readonly N3N4SleepBridgePackage[] = Object.freeze([packageRecord]);

export function resolveN3N4SleepBridgePackage(id: string): N3N4SleepBridgePackage {
    const found = N3_N4_SLEEP_BRIDGE_PACKAGES.find(candidate => candidate.id === id);
    if (!found) throw new TypeError(`Unknown N3/N4 sleep bridge package: ${id}`);
    return found;
}
