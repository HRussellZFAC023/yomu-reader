// Regression for the 2026-07-18 check-gate incident: a check run's [ci-tests]
// stage log contained "Test Files 2 failed" while the observed pipeline status
// was zero. Investigation reproduced zsh returning tail's status (`1 0` for
// npm and tail) and found no in-repo swallow path. The gate still scans
// test-stage output as a backstop; this pins the detector on real reporter
// shapes.
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script module without type declarations
import { runtimeDeathReason, unreportedTestFiles, vitestOutputIndicatesFailure } from '../../scripts/lib/check-log-guard.mjs';

const failedSummary = [
    ' Test' + ' Files  2 failed | 314 passed (316)',
    '      Tests  5 failed | 4711 passed | 1 skipped (4717)',
    '   Duration  241.93s',
].join('\n');

const passedSummary = [
    ' Test' + ' Files  316 passed (316)',
    '      Tests  4717 passed (4717)',
    '   Duration  241.93s',
].join('\n');

describe('check gate vitest log guard', () => {
    it('flags a summary with failed test files', () => {
        expect(vitestOutputIndicatesFailure(failedSummary)).toMatch(/2 failed/);
    });

    it('flags a tests-only failed count', () => {
        const testsFailed = '      Tests  1 failed | 12 passed (13)';
        expect(vitestOutputIndicatesFailure(testsFailed)).toMatch(/1 failed/);
    });

    it('flags an unhandled-errors banner', () => {
        const banner = passedSummary + '\n⎯⎯⎯⎯\nUnhandled Errors\n⎯⎯⎯⎯';
        expect(vitestOutputIndicatesFailure(banner)).toMatch(/unhandled/);
    });

    it('stays silent on an all-green summary', () => {
        expect(vitestOutputIndicatesFailure(passedSummary)).toBeNull();
    });

    it('stays silent when "failed" appears only in prose, not a summary line', () => {
        const prose = '✓ tests/reader/foo.test.ts retries a failed fetch (3 tests) 12ms\n' + passedSummary;
        expect(vitestOutputIndicatesFailure(prose)).toBeNull();
    });
});

// A dead worker is not a failing test, and until 2026-08-02 the gate could not
// tell you which it had. The real transcript below cost three full re-runs to
// read correctly: every reported test passed, no line matched "FAIL tests/", and
// the only honest signal was that 486 files were collected and 484 reported.
describe('a worker that dies is not a failing test', () => {
    const REAL_OOM_TRANSCRIPT = [
        '<--- Last few GCs --->',
        'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
        '',
        '⎯⎯⎯ Unhandled Errors ⎯⎯⎯',
        'Error: Worker exited unexpectedly',
        '',
        ' Test Files  484 passed (486)',
        '      Tests  6524 passed | 1 skipped (6564)',
    ].join('\n');

    it('names memory exhaustion from the transcript that fooled us', () => {
        expect(runtimeDeathReason(REAL_OOM_TRANSCRIPT)).toBe('a worker ran out of memory');
    });

    it('counts the files that never reported, which is the only reliable tell', () => {
        // 486 collected, 484 reported: the two catalogue-browse files whose forks died.
        expect(unreportedTestFiles(REAL_OOM_TRANSCRIPT)).toBe(2);
    });

    it('stays silent on an ordinary green run, so the warning keeps its meaning', () => {
        const green = ' Test Files  486 passed (486)\n      Tests  6563 passed | 1 skipped (6564)';
        expect(runtimeDeathReason(green)).toBeNull();
        expect(unreportedTestFiles(green)).toBe(0);
    });

    it('stays silent on a genuine test failure, which needs the opposite advice', () => {
        const red = ' Test Files  1 failed | 485 passed (486)\n      Tests  3 failed | 6560 passed (6563)';
        expect(runtimeDeathReason(red)).toBeNull();
        // The existing guard is what should speak here, and it does — reporting the
        // Test Files line, which is the first failure summary in the output.
        expect(vitestOutputIndicatesFailure(red)).toContain('1 failed');
    });

    it('recognises an OS kill, which presents identically but is not a heap limit', () => {
        expect(runtimeDeathReason('shard was killed by signal SIGKILL'))
            .toBe('a worker was killed by the operating system');
    });
});
