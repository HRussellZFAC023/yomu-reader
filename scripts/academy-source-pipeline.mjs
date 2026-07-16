#!/usr/bin/env node
import { EXPECTED_MANIFEST_SHA256, resolveRoots } from './academy-source-pipeline/paths.mjs';
import { buildPrivateLedger } from './academy-source-pipeline/ledger.mjs';
import { runPdfCensus } from './academy-source-pipeline/pdf-census.mjs';
import { runAudioCensus } from './academy-source-pipeline/audio-census.mjs';
import { migrateDonorPacks } from './academy-source-pipeline/packs.mjs';
import { buildListeningPairings } from './academy-source-pipeline/pairing.mjs';
import { generateTeacherComparison } from './academy-source-pipeline/compare.mjs';
import {
    buildPublicCatalog, buildCorpusStatus, buildPackMigrationSummary, writePublicOutputs,
} from './academy-source-pipeline/public-outputs.mjs';
import { collectPrivateTokens, findLeakedTokens } from './academy-source-pipeline/privacy.mjs';
import { updateResourceLedger } from './academy-source-pipeline/resource-ledger.mjs';
import { publicOutputsPresent, validatePublicOutputs } from './academy-source-pipeline/validate.mjs';
import { loadManifest } from './academy-source-pipeline/manifest.mjs';
import {
    normalizeLessonSourcePayloadOwnership,
    validateLessonSourceOwnershipManifest,
    writeLessonSourceOwnershipManifest,
} from './academy-source-pipeline/lesson-source-ownership.mjs';

const COMMANDS = new Set(['ledger', 'census', 'packs', 'publish', 'ownership', 'validate', 'all']);

async function main() {
    const command = process.argv[2] ?? 'all';
    if (!COMMANDS.has(command)) {
        console.error(`Usage: node scripts/academy-source-pipeline.mjs <${[...COMMANDS].join('|')}>`);
        process.exitCode = 2;
        return;
    }
    const roots = resolveRoots();
    const log = message => console.log(`[source-pipeline] ${message}`);

    if (command === 'validate') {
        // Ordinary CI must not require the private corpus: a completely absent
        // output set only warns; anything present is validated strictly.
        if (!publicOutputsPresent(roots.publicRoot)) {
            console.warn('[source-pipeline] public outputs not generated yet; run `npm run academy:source:pipeline` locally against the private corpus.');
            return;
        }
        const violations = [
            ...validatePublicOutputs(roots.publicRoot),
            ...validateLessonSourceOwnershipManifest(roots),
        ];
        report('public output validation', violations);
        return;
    }

    if (command === 'ownership') {
        normalizeLessonSourcePayloadOwnership(roots, { log });
        const ownershipManifest = writeLessonSourceOwnershipManifest(roots);
        log(`lesson source ownership written: ${ownershipManifest}`);
        report('lesson source ownership validation', validateLessonSourceOwnershipManifest(roots));
        return;
    }

    const options = { log, expectedManifestSha256: process.env.ACADEMY_SOURCE_MANIFEST_SHA256 ?? EXPECTED_MANIFEST_SHA256 };
    const ledger = buildPrivateLedger(roots, options);
    log(`ledger: ${ledger.archiveOccurrences.length} archives, ${ledger.memberOccurrences.length} member occurrences, ${ledger.uniquePayloads.length} unique payloads (incl. direct resources)`);
    if (command === 'ledger') return;

    const retryFailures = process.env.ACADEMY_SOURCE_RETRY_FAILURES === '1';
    const pdfCensus = runPdfCensus(roots, ledger, { log, retryFailures });
    const audioCensus = runAudioCensus(roots, ledger, { log, retryFailures });
    log(`census: ${pdfCensus.documents.length} unique PDFs, ${audioCensus.payloads.length} unique audio payloads`);
    if (command === 'census') return;

    const packCandidates = migrateDonorPacks(roots, ledger, { log });
    const pairings = buildListeningPairings(roots, packCandidates, audioCensus);
    log(`packs: ${packCandidates.totals.packCount} packs, ${packCandidates.totals.sourceCandidateCount} source item candidates`);
    if (command === 'packs') return;

    const compareRoot = generateTeacherComparison(roots, packCandidates, {
        packWorkspacesRoot: process.env.ACADEMY_SOURCE_PACK_WORKSPACES_ROOT
            ?? '/Users/heru/Documents/Projects/yomu/scratchpad-wpacks',
    });
    log(`teacher comparison: ${compareRoot}/index.html`);

    const outputs = {
        catalog: buildPublicCatalog(ledger),
        corpusStatus: buildCorpusStatus(ledger, pdfCensus, audioCensus, packCandidates),
        packMigration: buildPackMigrationSummary(packCandidates, pairings),
    };
    const { manifest } = loadManifest(roots.corpusRoot, options.expectedManifestSha256);
    const tokens = collectPrivateTokens({ ledger, manifest, packCandidates });
    const leaks = findLeakedTokens(JSON.stringify(outputs), tokens);
    if (leaks.length > 0) {
        throw new Error(`Refusing to publish: private tokens would leak into public outputs: ${leaks.slice(0, 5).join(', ')}`);
    }
    const written = writePublicOutputs(roots, outputs);
    normalizeLessonSourcePayloadOwnership(roots, { log });
    const ownershipManifest = writeLessonSourceOwnershipManifest(roots);
    updateResourceLedger(roots, outputs);
    log(`public outputs written under ${roots.publicRoot}`);

    const violations = validatePublicOutputs(roots.publicRoot);
    report('post-publish validation', violations);
    Object.values(written).forEach(filePath => log(`wrote ${filePath}`));
    log(`wrote ${ownershipManifest}`);
}

function report(label, violations) {
    if (violations.length === 0) {
        console.log(`[source-pipeline] ${label}: OK`);
        return;
    }
    console.error(`[source-pipeline] ${label}: ${violations.length} violation(s)`);
    for (const violation of violations) console.error(`  - ${violation}`);
    process.exitCode = 1;
}

main().catch(error => {
    console.error(`[source-pipeline] fatal: ${error?.stack ?? error}`);
    process.exitCode = 1;
});
