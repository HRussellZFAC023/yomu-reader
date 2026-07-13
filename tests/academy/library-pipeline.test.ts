// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
// @ts-expect-error Plain-JS pipeline tooling is exercised directly.
import { resolveLibraryRoots } from '../../scripts/academy-source-pipeline/library/paths.mjs';
// @ts-expect-error Plain-JS pipeline tooling is exercised directly.
import { buildLibraryLedger } from '../../scripts/academy-source-pipeline/library/ledger.mjs';
// @ts-expect-error Plain-JS pipeline tooling is exercised directly.
import { runArchiveCensus } from '../../scripts/academy-source-pipeline/library/archive-census.mjs';
// @ts-expect-error Plain-JS pipeline tooling is exercised directly.
import { runLibraryPdfCensus } from '../../scripts/academy-source-pipeline/library/pdf-census.mjs';
// @ts-expect-error Plain-JS pipeline tooling is exercised directly.
import { runLibraryMediaCensus } from '../../scripts/academy-source-pipeline/library/media-census.mjs';
// @ts-expect-error Plain-JS pipeline tooling is exercised directly.
import { createPayloadResolver } from '../../scripts/academy-source-pipeline/library/payload-resolver.mjs';
// @ts-expect-error Plain-JS pipeline tooling is exercised directly.
import { buildLibraryPublicStatus, writeLibraryPublicStatus, updateResourceLedgerLibrarySection } from '../../scripts/academy-source-pipeline/library/public-status.mjs';
// @ts-expect-error Plain-JS pipeline tooling is exercised directly.
import { validateLibraryStatus } from '../../scripts/academy-source-pipeline/library/validate.mjs';
// @ts-expect-error Plain-JS pipeline tooling is exercised directly.
import { sha256Hex } from '../../scripts/academy-source-pipeline/io.mjs';
import {
    buildLibraryFixture, LIBRARY_SECRET_TOKENS, SHARED_PDF, AUDIO_BYTES, ARCHIVE_MEMBER,
} from './helpers/library-fixture';

function scan(fixture = buildLibraryFixture()) {
    const roots = resolveLibraryRoots(fixture.env);
    const ledger = buildLibraryLedger(roots, {});
    return { fixture, roots, ledger };
}

function fullRun(fixture = buildLibraryFixture()) {
    const { roots, ledger } = scan(fixture);
    const resolver = createPayloadResolver(roots);
    const archives = runArchiveCensus(roots, ledger, {});
    const pdf = runLibraryPdfCensus(roots, ledger, resolver, {});
    const media = runLibraryMediaCensus(roots, ledger, resolver, {});
    const status = buildLibraryPublicStatus(ledger, archives, pdf, media);
    return { fixture, roots, ledger, archives, pdf, media, status };
}

describe('library ledger accounting', () => {
    it('accounts for every filesystem entry with an explicit state', () => {
        const { ledger } = scan();
        expect(ledger.summary.entryCount).toBe(13);
        expect(ledger.summary.regularFileCount).toBe(9);
        expect(ledger.summary.uniquePayloadCount).toBe(8);
        expect(ledger.summary.byState).toMatchObject({
            included: 3,
            duplicate: 1,
            'archive-container': 2,
            'excluded:compiler-build-output': 1,
            'excluded:filesystem-metadata': 1,
            'review:unknown-extension': 1,
            directory: 2,
            'excluded:symlink-escapes-root-not-followed': 1,
            'excluded:symlink-inside-root-not-followed': 1,
        });
        const stateTotal = Object.values(ledger.summary.byState as Record<string, number>).reduce((a, b) => a + b, 0);
        expect(stateTotal).toBe(ledger.summary.entryCount);
    });

    it('keeps browser exercise scripts and styles as learning-source dependencies', () => {
        const fixture = buildLibraryFixture();
        const resourceRoot = path.join(fixture.libraryRoot, 'Web exercise');
        mkdirSync(resourceRoot, { recursive: true });
        writeFileSync(path.join(resourceRoot, 'exercise.js'), 'window.exerciseAnswer = "みぎ";');
        writeFileSync(path.join(resourceRoot, 'exercise.css'), '.answer { writing-mode: vertical-rl; }');
        writeFileSync(path.join(resourceRoot, 'exercise.js.map'), '{}');

        const { ledger } = scan(fixture);
        const script = ledger.entries.find((entry: any) => entry.relativePath.endsWith('exercise.js'));
        const style = ledger.entries.find((entry: any) => entry.relativePath.endsWith('exercise.css'));
        const sourceMap = ledger.entries.find((entry: any) => entry.relativePath.endsWith('exercise.js.map'));

        expect(script).toMatchObject({ state: 'included', classification: { kind: 'web-dependency' } });
        expect(style).toMatchObject({ state: 'included', classification: { kind: 'web-dependency' } });
        expect(sourceMap).toMatchObject({
            state: 'excluded:compiler-build-output',
            classification: { kind: 'build-artifact' },
        });
    });

    it('never follows symlinks and records escape/confinement explicitly', () => {
        const { ledger } = scan();
        const symlinks = ledger.entries.filter((entry: any) => entry.entryKind === 'symlink');
        expect(symlinks).toHaveLength(2);
        expect(symlinks.map((entry: any) => entry.state).sort()).toEqual([
            'excluded:symlink-escapes-root-not-followed',
            'excluded:symlink-inside-root-not-followed',
        ]);
        // The escape target's bytes must not appear anywhere in the ledger.
        const outsideSha = sha256Hex(Buffer.from('outside payload'));
        expect(ledger.uniquePayloads.some((payload: any) => payload.sha256 === outsideSha)).toBe(false);
    });

    it('is deterministic and resumes from the hash cache; same-size edits invalidate', () => {
        const { fixture, roots, ledger } = scan();
        const second = buildLibraryLedger(roots, {});
        expect(JSON.stringify(second)).toBe(JSON.stringify(ledger));

        // Same byte length, different content, forced different mtime.
        const target = path.join(fixture.libraryRoot, 'Lessons', '秘密の教科書', 'Another Textbook.pdf');
        const original = readFileSync(target);
        const mutated = Buffer.from(original);
        mutated[mutated.length - 1] = mutated[mutated.length - 1] ^ 0xff;
        writeFileSync(target, mutated);
        utimesSync(target, new Date(), new Date(Date.now() + 5000));

        const third = buildLibraryLedger(roots, {});
        const relative = 'Lessons/秘密の教科書/Another Textbook.pdf';
        const before = ledger.entries.find((entry: any) => entry.relativePath === relative);
        const after = third.entries.find((entry: any) => entry.relativePath === relative);
        expect(after.sha256).not.toBe(before.sha256);
        expect(after.sha256).toBe(sha256Hex(mutated));
    });

    it('separates library denominators from Moodle and records overlap by hash only', () => {
        const fixture = buildLibraryFixture();
        const privateRoot = fixture.env.ACADEMY_SOURCE_PRIVATE_ROOT;
        mkdirSync(privateRoot, { recursive: true });
        const moodleLedger = {
            uniquePayloads: [{ sha256: sha256Hex(Buffer.from(SHARED_PDF)), byteLength: SHARED_PDF.length }],
            archiveOccurrences: [],
            directResources: [],
        };
        const moodleLedgerPath = path.join(privateRoot, 'private-ledger.v1.json');
        writeFileSync(moodleLedgerPath, JSON.stringify(moodleLedger));
        const moodleBytesBefore = readFileSync(moodleLedgerPath);

        const { ledger } = scan(fixture);
        expect(ledger.moodleLedgerPresent).toBe(true);
        expect(ledger.summary.moodleOverlapPayloadCount).toBe(1);
        const overlapping = ledger.uniquePayloads.find((payload: any) => payload.inMoodleCorpus === true);
        expect(overlapping.sha256).toBe(sha256Hex(Buffer.from(SHARED_PDF)));
        // The Moodle ledger itself must remain byte-identical.
        expect(readFileSync(moodleLedgerPath).equals(moodleBytesBefore)).toBe(true);
    });
});

describe('library archive census', () => {
    it('counts member occurrences and unique member payloads without copying bytes', () => {
        const { roots, archives } = fullRun();
        const apkg = archives.archives.find((archive: any) => archive.status === 'censused');
        expect(apkg.memberOccurrenceCount).toBe(2);
        expect(apkg.uniqueMemberPayloadCount).toBe(1);
        expect(apkg.members.every((member: any) => member.payloadSha256 === sha256Hex(Buffer.from(ARCHIVE_MEMBER)))).toBe(true);

        const broken = archives.archives.find((archive: any) => archive.status !== 'censused');
        expect(broken.status).toBe('failed:corrupt-or-unsupported');

        // No payload bytes may land under the library artifact root.
        const artifactFiles = walkFiles(roots.libraryPrivateRoot);
        for (const file of artifactFiles) expect(file.endsWith('.json')).toBe(true);
        expect(existsSync(path.join(roots.libraryPrivateRoot, 'payloads'))).toBe(false);
    });
});

describe('library census resolver reuse', () => {
    it('reuses Moodle PDF census and audio probes by hash instead of re-censusing', () => {
        const fixture = buildLibraryFixture();
        const privateRoot = fixture.env.ACADEMY_SOURCE_PRIVATE_ROOT;
        const pdfSha = sha256Hex(Buffer.from(SHARED_PDF));
        const audioSha = sha256Hex(Buffer.from(AUDIO_BYTES));
        mkdirSync(path.join(privateRoot, 'pdf-census', pdfSha), { recursive: true });
        writeFileSync(path.join(privateRoot, 'pdf-census', pdfSha, 'census.json'), JSON.stringify({
            payloadSha256: pdfSha,
            status: 'census-complete',
            pageCount: 3,
            textExtraction: 'extracted',
            summary: { imageObjectCount: 1, pagesWithoutTextLayer: 0, nativeMediaRegionCount: 1, textBoxCount: 4, questionSignalCandidateCount: 2, vectorReviewPageCount: 0 },
            vectorExtraction: { failedPageCount: 0 },
        }));
        writeFileSync(path.join(privateRoot, 'audio-census.v1.json'), JSON.stringify({
            payloads: [{ payloadSha256: audioSha, status: 'probed', durationSeconds: 12.5, codec: 'mp3' }],
        }));

        const { pdf, media } = fullRun(fixture);
        const reusedPdf = pdf.documents.find((document: any) => document.payloadSha256 === pdfSha);
        expect(reusedPdf.censusSource).toBe('reused-moodle-census');
        expect(reusedPdf.pageCount).toBe(3);
        const reusedAudio = media.payloads.find((entry: any) => entry.payloadSha256 === audioSha);
        expect(reusedAudio.probeSource).toBe('reused-moodle-probe');
        expect(reusedAudio.durationSeconds).toBe(12.5);
    });

    it('records explicit failure states for undecodable pdf/media payloads', () => {
        const { pdf, media } = fullRun();
        expect(pdf.documents.length).toBeGreaterThan(0);
        for (const document of pdf.documents) expect(document.status.startsWith('failed:')).toBe(true);
        for (const entry of media.payloads) expect(entry.status.startsWith('failed:')).toBe(true);
    });
});

describe('library public status', () => {
    it('publishes aggregate-only, privacy-clean, internally consistent status', () => {
        const { roots, ledger, status } = fullRun();
        const written = writeLibraryPublicStatus(roots, ledger, status);
        expect(validateLibraryStatus(written)).toEqual([]);
        const serialized = readFileSync(written, 'utf8');
        for (const token of LIBRARY_SECRET_TOKENS) expect(serialized.includes(token)).toBe(false);
        expect(serialized.includes('relativePath')).toBe(false);
        // Unknown extensions collapse so filename fragments cannot leak.
        expect(serialized.includes('.zzz')).toBe(false);
    });

    it('refuses to publish when a private token would leak', () => {
        const { roots, ledger, status } = fullRun();
        const poisoned = { ...status, scanRevision: 'Lessons/秘密の教科書' };
        expect(() => writeLibraryPublicStatus(roots, ledger, poisoned)).toThrow(/private tokens/);
    });

    it('never inflates Moodle claims and pins the mechanical-census claims false', () => {
        const { fixture, roots, status } = fullRun();
        expect(status.claims).toEqual({
            contributesToMoodleCounts: false,
            questionSignalCandidatesAreVerified: false,
            humanAuthoredCoverage: false,
        });
        const ledgerPath = path.join(fixture.base, 'RESOURCE-LEDGER.json');
        writeFileSync(ledgerPath, JSON.stringify({
            coverage: { sourceQuestionsAudited: 1, sourceQuestionsPlayable: 1 },
            baselineCounts: { uniquePayloads: 688 },
        }));
        const updated = updateResourceLedgerLibrarySection({ ...roots, resourceLedgerPath: ledgerPath }, status);
        expect(updated.coverage.sourceQuestionsAudited).toBe(1);
        expect(updated.baselineCounts.uniquePayloads).toBe(688);
        expect(updated.stage2LibraryCensus.denominators.entryCount).toBe(status.denominators.entryCount);

        writeFileSync(ledgerPath, JSON.stringify({
            coverage: { sourceQuestionsAudited: 5, sourceQuestionsPlayable: 1 },
        }));
        expect(() => updateResourceLedgerLibrarySection({ ...roots, resourceLedgerPath: ledgerPath }, status))
            .toThrow(/refusing to update/);
    });
});

function walkFiles(root: string): string[] {
    if (!existsSync(root)) return [];
    const out: string[] = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        const full = path.join(root, entry.name);
        if (entry.isDirectory()) out.push(...walkFiles(full));
        else out.push(full);
    }
    return out;
}
