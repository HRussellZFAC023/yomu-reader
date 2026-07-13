#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolveLibraryRoots } from './academy-source-pipeline/library/paths.mjs';
import { buildLibraryLedger } from './academy-source-pipeline/library/ledger.mjs';
import { runArchiveCensus } from './academy-source-pipeline/library/archive-census.mjs';
import { runLibraryPdfCensus } from './academy-source-pipeline/library/pdf-census.mjs';
import { runLibraryMediaCensus } from './academy-source-pipeline/library/media-census.mjs';
import { createPayloadResolver } from './academy-source-pipeline/library/payload-resolver.mjs';
import {
    buildLibraryPublicStatus, writeLibraryPublicStatus, updateResourceLedgerLibrarySection,
} from './academy-source-pipeline/library/public-status.mjs';
import { libraryStatusPresent, validateLibraryStatus } from './academy-source-pipeline/library/validate.mjs';

const COMMANDS = new Set(['scan', 'census', 'publish', 'validate', 'all']);

/**
 * Shared-Japanese-library harness. Resumable phases:
 *   scan    — walk + classify + hash every filesystem entry (private ledger);
 *   census  — archive members, PDFs, audio/video/images (per-hash caches);
 *   publish — aggregate-only public status + RESOURCE-LEDGER library section;
 *   validate — cheap committed-output checks (warns if not yet generated).
 * Ordinary CI must never require /Users/heru/Documents/Japanese: only
 * `validate` runs there, and it reads the committed public JSON alone.
 */
async function main() {
    const command = process.argv[2] ?? 'all';
    if (!COMMANDS.has(command)) {
        console.error(`Usage: node scripts/academy-library-pipeline.mjs <${[...COMMANDS].join('|')}>`);
        process.exitCode = 2;
        return;
    }
    const roots = resolveLibraryRoots();
    const log = message => console.log(`[library-pipeline] ${message}`);

    if (command === 'validate') {
        if (!libraryStatusPresent(roots.publicStatusPath)) {
            console.warn('[library-pipeline] library status not generated yet; run `npm run academy:library:pipeline` on the machine holding the library.');
            return;
        }
        report('library status validation', validateLibraryStatus(roots.publicStatusPath));
        return;
    }

    if (!existsSync(roots.libraryRoot)) {
        throw new Error(`Library root not found: ${roots.libraryRoot} (set ACADEMY_LIBRARY_ROOT)`);
    }
    const verifyHashes = process.env.ACADEMY_LIBRARY_VERIFY_HASHES === '1';
    const retryFailures = process.env.ACADEMY_LIBRARY_RETRY_FAILURES === '1';

    const ledger = buildLibraryLedger(roots, { log, verifyHashes });
    log(`scan: ${ledger.summary.entryCount} entries, ${ledger.summary.regularFileCount} regular files, `
        + `${ledger.summary.uniquePayloadCount} unique payloads, ${ledger.summary.moodleOverlapPayloadCount} overlap Moodle`);
    if (command === 'scan') return;

    const resolver = createPayloadResolver(roots);
    const archiveCensus = runArchiveCensus(roots, ledger, { log });
    log(`archives: ${archiveCensus.archives.length} containers, `
        + `${archiveCensus.archives.filter(archive => archive.status === 'censused').length} censused`);
    const pdfCensus = runLibraryPdfCensus(roots, ledger, resolver, { log, retryFailures });
    log(`pdf: ${pdfCensus.summary.documentCount} documents, ${pdfCensus.summary.complete} complete, `
        + `${pdfCensus.summary.reusedMoodleCensus} reused from Moodle census, ${pdfCensus.summary.failed} failed`);
    const mediaCensus = runLibraryMediaCensus(roots, ledger, resolver, { log, retryFailures });
    log(`media: ${mediaCensus.payloads.length} payloads, `
        + `${mediaCensus.payloads.filter(entry => entry.status === 'probed').length} probed`);
    if (command === 'census') return;

    const status = buildLibraryPublicStatus(ledger, archiveCensus, pdfCensus, mediaCensus);
    const written = writeLibraryPublicStatus(roots, ledger, status);
    updateResourceLedgerLibrarySection(roots, status);
    log(`public status written: ${written}`);
    report('post-publish validation', validateLibraryStatus(roots.publicStatusPath));
}

function report(label, violations) {
    if (violations.length === 0) {
        console.log(`[library-pipeline] ${label}: OK`);
        return;
    }
    console.error(`[library-pipeline] ${label}: ${violations.length} violation(s)`);
    for (const violation of violations) console.error(`  - ${violation}`);
    process.exitCode = 1;
}

main().catch(error => {
    console.error(`[library-pipeline] fatal: ${error?.stack ?? error}`);
    process.exitCode = 1;
});
