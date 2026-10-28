import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, '../..');
const baselineDir = process.env.YOMU_PROFILE_BASELINE_DIR;
const candidateDir = process.env.YOMU_PROFILE_CANDIDATE_DIR;
const enabled = Boolean(baselineDir && candidateDir && process.env.YOMU_PROFILE_E2E === '1');

it.runIf(enabled)(
    'executes baseline and candidate profiler replays past exact preparation',
    async () => {
        const output = resolve(
            process.env.YOMU_PROFILE_COMPARISON_OUTPUT ??
                join(repositoryRoot, 'qa-artifacts/yomu-reader/youtube-performance/test-comparison-smoke'),
        );
        await execFileAsync(process.execPath, ['scripts/manual/youtube-performance-comparison-smoke.mjs'], {
            cwd: repositoryRoot,
            timeout: 240_000,
            maxBuffer: 20 * 1024 * 1024,
            env: {
                ...process.env,
                YOMU_PROFILE_BASELINE_DIR: baselineDir,
                YOMU_PROFILE_CANDIDATE_DIR: candidateDir,
                YOMU_PROFILE_COMPARISON_OUTPUT: output,
            },
        });
        const evidence = JSON.parse(readFileSync(join(output, 'comparison-smoke.json'), 'utf8'));

        expect(evidence.status).toBe('complete');
        expect(evidence.runs.map((run: { name: string }) => run.name)).toEqual(['baseline', 'candidate']);
        for (const run of evidence.runs) {
            expect(run.fixedAmbient.cycles).toBe(2);
            expect(run.lookup.samples).toBe(2);
            expect(run.replayModes.workloadIdentity).toBe('asserted-across-all-replays');
        }
    },
    250_000,
);
