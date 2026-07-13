import { existsSync } from 'node:fs';
import { LIBRARY_SCHEMA_VERSIONS } from './paths.mjs';
import { readJson } from '../io.mjs';
import { validatePublicValue } from '../privacy.mjs';

/**
 * Cheap validator for the COMMITTED public library status. Needs neither the
 * library nor the private artifacts, so ordinary CI can run it: absence only
 * warns (the library lives on one machine); once the file is committed the
 * checks are strict — structural privacy allowlist, internal count
 * consistency, and the non-inflation claim pins.
 */
export function libraryStatusPresent(publicStatusPath) {
    return existsSync(publicStatusPath);
}

export function validateLibraryStatus(publicStatusPath) {
    const status = readJson(publicStatusPath);
    const violations = [];
    if (status.schema !== LIBRARY_SCHEMA_VERSIONS.publicStatus) {
        violations.push(`library-status schema mismatch: ${status.schema}`);
    }
    violations.push(...validatePublicValue(status, { label: 'library-status' }));

    const stateTotal = (status.byState ?? []).reduce((total, row) => total + row.entryCount, 0);
    if (stateTotal !== status.denominators?.entryCount) {
        violations.push(`byState totals (${stateTotal}) must account for every filesystem entry (${status.denominators?.entryCount})`);
    }
    const kindTotal = (status.byKind ?? []).reduce((total, row) => total + row.entryCount, 0);
    if (kindTotal !== status.denominators?.regularFileCount) {
        violations.push(`byKind totals (${kindTotal}) must account for every regular file (${status.denominators?.regularFileCount})`);
    }
    const extensionTotal = (status.byExtension ?? []).reduce((total, row) => total + row.entryCount, 0);
    if (extensionTotal !== status.denominators?.regularFileCount) {
        violations.push(`byExtension totals (${extensionTotal}) must account for every regular file (${status.denominators?.regularFileCount})`);
    }
    if (status.denominators?.uniquePayloadCount > status.denominators?.regularFileCount) {
        violations.push('uniquePayloadCount cannot exceed regularFileCount');
    }
    const archives = status.archives ?? {};
    if ((archives.censused ?? 0) + (archives.failed ?? 0) !== archives.containerPayloadCount) {
        violations.push('archive censused+failed must cover every container payload');
    }
    const pdf = status.pdf ?? {};
    if ((pdf.complete ?? 0) + (pdf.failed ?? 0) !== pdf.documentCount) {
        violations.push('pdf complete+failed must cover every unique PDF payload');
    }
    const media = status.media ?? {};
    if ((media.probed ?? 0) + (media.failed ?? 0) !== media.payloadCount) {
        violations.push('media probed+failed must cover every unique media payload');
    }
    for (const [claim, expected] of Object.entries({
        contributesToMoodleCounts: false,
        questionSignalCandidatesAreVerified: false,
        humanAuthoredCoverage: false,
    })) {
        if (status.claims?.[claim] !== expected) {
            violations.push(`claims.${claim} must remain ${expected}: the library census is mechanical, not verified coverage`);
        }
    }
    if (status.moodleOverlap?.overlapPayloadCount > status.denominators?.uniquePayloadCount) {
        violations.push('Moodle overlap cannot exceed the library unique-payload universe');
    }
    return violations;
}
