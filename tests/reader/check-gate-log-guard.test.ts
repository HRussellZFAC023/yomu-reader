// Regression for the 2026-07-18 check-gate incident: a check run's [ci-tests]
// stage log contained "Test Files 2 failed" while the overall `npm run check`
// reported success. The gate now scans test-stage output as a backstop; this
// pins the detector's behaviour on real Vitest reporter shapes.
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script module without type declarations
import { vitestOutputIndicatesFailure } from '../../scripts/lib/check-log-guard.mjs';

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
