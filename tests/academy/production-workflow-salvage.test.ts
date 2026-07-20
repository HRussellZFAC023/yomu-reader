import {
    buildSalvageReport,
    canonicalSalvageJson,
    indexRecoveryDocuments,
    salvageSha256,
    tokenizeSalvageTask,
    validateSalvageReport,
} from '../../scripts/lib/academy-workflow-salvage.mjs';

const task = {
    id: 'AUD-003',
    description: 'Produce pitch-aware Aivis voice lines and bind the audio runtime.',
};

const baseScan = {
    repository: '/repo/yomu-reader',
    head: '1111111111111111111111111111111111111111',
    originMain: '2222222222222222222222222222222222222222',
};

function fixtureSources() {
    return {
        documents: [
            { path: 'docs/recovery.md', text: 'Unrelated setup.\nThe Aivis voice pilot is half done.\nKeep the render script.' },
            { path: 'docs/other.md', text: 'No relevant prior work here.' },
        ],
        branches: [{
            name: 'audio/pitch-pass',
            head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            upstream: 'origin/audio/pitch-pass',
            ahead: 2,
            behind: 5,
            subject: 'Render Aivis voice pilot',
            changedTrackedPaths: ['scripts/render-audio.mjs'],
            statusText: ' M scripts/render-audio.mjs',
            diffText: '+ render voice',
        }],
        worktrees: [{
            path: '/tmp/yomu-audio-half-done',
            branch: 'audio/pitch-pass',
            head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            aheadBehind: { base: 'origin/main', ahead: 2, behind: 5 },
            changedTrackedPaths: ['src/academy/audio/voice-locks.ts'],
            untrackedPaths: ['public/academy/audio/aivis-preview.opus'],
            statusText: ' M src/academy/audio/voice-locks.ts\n?? public/academy/audio/aivis-preview.opus',
            diffText: '+ bind aivis preview',
        }],
        commits: [{
            hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            subject: 'feat: add pitch-aware voice lookup',
            changedPaths: ['src/academy/audio/pitch.ts'],
        }],
        stashes: [{
            ref: 'stash@{0}',
            hash: 'cccccccccccccccccccccccccccccccccccccccc',
            subject: 'WIP Aivis render batch',
            changedPaths: ['scripts/render-audio.mjs'],
        }],
        reflog: [{
            selector: 'HEAD@{8}',
            hash: 'dddddddddddddddddddddddddddddddddddddddd',
            subject: 'checkout: moving from audio-pitch',
        }],
        danglingCommits: [{
            hash: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
            subject: 'orphaned Aivis voice QA',
            changedPaths: ['tests/academy/audio-qa.test.ts'],
        }],
        transcripts: [{
            id: 'thread-audio-17',
            threadId: '019f-audio',
            taskIds: ['AUD-003'],
            title: 'Voice production handoff',
            summary: 'Aivis lines rendered; runtime binding remains.',
            changedPaths: ['docs/academy/audio/handoff.md'],
            commitHashes: ['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'],
        }],
    };
}

function completeDispositions(report: ReturnType<typeof buildSalvageReport>) {
    for (const candidate of report.candidates) {
        const reusablePath = candidate.references.paths[0];
        const reusableCommit = candidate.references.commits[0];
        if (reusablePath || reusableCommit) {
            candidate.disposition = {
                status: 'reuse',
                reason: 'This is an exact, inspectable continuation point.',
                reusablePaths: reusablePath ? [reusablePath] : [],
                reusableCommits: reusableCommit ? [reusableCommit] : [],
            };
        } else {
            candidate.disposition = {
                status: 'reject',
                reason: 'The metadata points to no recoverable path or commit.',
                reusablePaths: [],
                reusableCommits: [],
            };
        }
    }
    report.decision = {
        status: 'complete',
        candidateCount: report.candidates.length,
        reuseCount: report.candidates.filter(candidate => candidate.disposition.status === 'reuse').length,
        rejectCount: report.candidates.filter(candidate => candidate.disposition.status === 'reject').length,
    };
    return report;
}

describe('Academy production prior-work salvage', () => {
    it('matches task terms as tokens, never as short substrings', () => {
        const query = tokenizeSalvageTask(task);
        const documents = indexRecoveryDocuments([
            { path: 'claude.md', text: 'Claude wrote an unrelated UI review.' },
            { path: 'audio.md', text: 'AUD-003 has an Aivis audio render in progress.' },
        ], query);

        expect(documents.find(row => row.path === 'claude.md')?.excerpts).toEqual([]);
        expect(documents.find(row => row.path === 'audio.md')?.excerpts).toHaveLength(1);
    });

    it('indexes every recovery document with content hashes and all relevant excerpts', () => {
        const query = tokenizeSalvageTask(task);
        const lines = Array.from({ length: 37 }, (_, index) => `Aivis voice recovery line ${index + 1}`);
        const documents = indexRecoveryDocuments([{ path: 'recovery.md', text: lines.join('\n') }], query);

        expect(documents[0]).toMatchObject({
            bytes: Buffer.byteLength(lines.join('\n')),
            lineCount: 37,
            sha256: salvageSha256(lines.join('\n')),
        });
        expect(documents[0].excerpts).toHaveLength(37);
        expect(documents[0].excerpts!.at(-1)?.line).toBe(37);
    });

    it('captures uncommitted worktree state and hashes status and diff evidence', () => {
        const report = buildSalvageReport(task, fixtureSources(), { generatedAt: '2026-07-20T00:00:00.000Z', baseScan });
        const worktree = report.inventory.categories.worktrees[0];

        expect(worktree).toMatchObject({
            head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            branch: 'audio/pitch-pass',
            dirty: true,
            aheadBehind: { base: 'origin/main', ahead: 2, behind: 5 },
            changedTrackedPaths: ['src/academy/audio/voice-locks.ts'],
            untrackedPaths: ['public/academy/audio/aivis-preview.opus'],
        });
        expect(worktree.statusSha256).toMatch(/^[a-f0-9]{64}$/u);
        expect(worktree.diffSha256).toMatch(/^[a-f0-9]{64}$/u);
        expect(report.candidates.some(candidate => candidate.sourceId === worktree.sourceId)).toBe(true);
    });

    it('keeps generic transcript vocabulary in the exhaustive inventory without flooding the candidate queue', () => {
        const sources = fixtureSources();
        sources.transcripts = [{
            id: 'generic-thread',
            threadId: 'generic-thread',
            taskIds: [],
            title: 'General production notes',
            summary: 'audio voice work exists somewhere in the Academy production history',
            changedPaths: [],
            commitHashes: [],
        }];
        const report = buildSalvageReport(task, sources, { baseScan });

        expect(report.inventory.counts.transcripts).toBe(1);
        expect(report.candidates.filter(candidate => candidate.kind === 'transcript')).toEqual([]);
    });

    it('keeps an exhaustive transcript inventory while bounding and hashing the ranked manual-review queue', () => {
        const sources = fixtureSources();
        sources.transcripts = Array.from({ length: 150 }, (_, index) => ({
            id: `audio-thread-${index}`,
            threadId: `audio-thread-${index}`,
            taskIds: [],
            title: `Audio recovery ${index}`,
            summary: 'Aivis voice pitch audio runtime continuation',
            changedPaths: [],
            commitHashes: [],
        }));
        const report = buildSalvageReport(task, sources, { baseScan });

        expect(report.inventory.counts.transcripts).toBe(150);
        expect(report.candidates.filter(candidate => candidate.kind === 'transcript')).toHaveLength(100);
        expect(report.candidateSelection).toMatchObject({
            eligibleCounts: { transcript: 150 },
            selectedCounts: { transcript: 100 },
            omittedCounts: { transcript: 50 },
        });
        expect((report.candidateSelection as { omittedSha256: string }).omittedSha256).toMatch(/^[a-f0-9]{64}$/u);
    });

    it('indexes commits, stashes, reflog, dangling commits, and transcript metadata without caps', () => {
        const sources = fixtureSources();
        sources.stashes = Array.from({ length: 26 }, (_, index) => ({
            ref: `stash@{${index}}`,
            hash: index.toString(16).padStart(40, 'a').slice(-40),
            subject: `Aivis voice batch ${index}`,
            changedPaths: [`audio/batch-${index}.opus`],
        }));
        const report = buildSalvageReport(task, sources, { baseScan });

        expect(report.inventory.counts).toMatchObject({
            commits: 1,
            stashes: 26,
            reflog: 1,
            danglingCommits: 1,
            transcripts: 1,
        });
        expect(report.inventory.categories.stashes).toHaveLength(26);
        expect(report.candidates.filter(candidate => candidate.kind === 'stash')).toHaveLength(26);
    });

    it('produces stable source and candidate IDs independent of input order and timestamp', () => {
        const sources = fixtureSources();
        const reversed = Object.fromEntries(Object.entries(sources).map(([key, rows]) => [key, [...rows].reverse()]));
        const first = buildSalvageReport(task, sources, { generatedAt: '2026-07-20T00:00:00.000Z', baseScan });
        const second = buildSalvageReport(task, reversed, { generatedAt: '2026-07-21T00:00:00.000Z', baseScan });

        expect(second.inventory.sha256).toBe(first.inventory.sha256);
        expect(second.candidates.map(row => row.candidateId)).toEqual(first.candidates.map(row => row.candidateId));
    });

    it('requires an explicit reasoned disposition for every candidate and exact reuse references', () => {
        const report = buildSalvageReport(task, fixtureSources(), { baseScan });
        expect(validateSalvageReport(report, { task, baseScan, sources: fixtureSources() })
            .some(error => error.includes('is still pending'))).toBe(true);

        completeDispositions(report);
        const reused = report.candidates.find(candidate => candidate.disposition.status === 'reuse');
        expect(validateSalvageReport(report, { task, baseScan, sources: fixtureSources() })).toEqual([]);

        if (!reused) throw new Error('Fixture must yield a reusable candidate');
        reused.disposition.reusablePaths = ['/invented/path'];
        reused.disposition.reusableCommits = [];
        expect(validateSalvageReport(report, { task, baseScan, sources: fixtureSources() }))
            .toContain(`${reused.candidateId} names unscanned reusable path /invented/path`);
    });

    it('detects tampered source rows, source inputs, base scans, tasks, and report files', () => {
        const sources = fixtureSources();
        const report = completeDispositions(buildSalvageReport(task, sources, { baseScan }));
        const reportText = JSON.stringify(report, null, 2);
        expect(validateSalvageReport(report, {
            task,
            baseScan,
            sources,
            reportFile: { path: 'salvage/AUD-003.json', text: reportText, sha256: salvageSha256(reportText) },
        })).toEqual([]);

        report.inventory.categories.documents[0].sha256 = '0'.repeat(64);
        const errors = validateSalvageReport(report, {
            task: { ...task, description: `${task.description} changed` },
            baseScan: { ...baseScan, head: '3'.repeat(40) },
            sources,
            reportFile: { path: 'salvage/AUD-003.json', text: reportText, sha256: 'f'.repeat(64) },
        });
        expect(errors).toEqual(expect.arrayContaining([
            'Inventory category hashes do not match scanned source rows',
            'Inventory hash does not match scanned source rows',
            'Report task hash does not match expected task inputs',
            'Report base scan does not match expected scan inputs',
            'Report inventory does not match supplied source inputs',
            'Report file hash does not match file contents',
            'Report file contents do not match the report under validation',
        ]));
    });

    it('validates a compact task report against its separately hashed source snapshot', () => {
        const sources = fixtureSources();
        const report = completeDispositions(buildSalvageReport(task, sources, {
            baseScan,
            compactInventory: true,
            sourceSnapshot: {
                path: 'artifacts/academy-production/workflow/reuse-index/source-snapshots/test.json',
                sha256: 'a'.repeat(64),
            },
        }));

        expect((report.inventory as { categories?: unknown }).categories).toBeUndefined();
        expect(report.sourceSnapshot).toMatchObject({ sha256: 'a'.repeat(64) });
        expect(validateSalvageReport(report, { task, baseScan, sources })).toEqual([]);
    });

    it('has a canonical serializer suitable for external report-file hashing', () => {
        expect(canonicalSalvageJson({ z: 1, a: { y: 2, b: 3 } }))
            .toBe('{"a":{"b":3,"y":2},"z":1}');
    });
});
