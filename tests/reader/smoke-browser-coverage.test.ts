import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script module without type declarations
import { isMissingBrowserExecutable, requestedBrowserCoverageFailures } from '../../scripts/lib/smoke-harness.mjs';

describe('release smoke browser coverage', () => {
    it('does not misclassify missing host dependencies as a missing executable', () => {
        const hostDependencies = new Error([
            'Host system is missing dependencies to run browsers.',
            'Run: npx playwright install-deps',
        ].join('\n'));
        expect(isMissingBrowserExecutable(hostDependencies)).toBe(false);
        expect(isMissingBrowserExecutable(new Error("Executable doesn't exist at /tmp/webkit"))).toBe(true);
    });

    it('fails coverage when one requested engine is skipped', () => {
        expect(requestedBrowserCoverageFailures(
            new Set(['chromium', 'webkit']),
            [
                { engine: 'chromium', assertions: 12 },
                { engine: 'webkit', skipped: true, reason: "Executable doesn't exist" },
            ],
        )).toEqual([
            "webkit: requested engine was skipped (Executable doesn't exist)",
        ]);
    });

    it('fails coverage when a requested engine produces no summary', () => {
        expect(requestedBrowserCoverageFailures(
            new Set(['chromium', 'webkit']),
            [{ engine: 'chromium', assertions: 12 }],
        )).toEqual(['webkit: requested engine produced no summary']);
    });
});
