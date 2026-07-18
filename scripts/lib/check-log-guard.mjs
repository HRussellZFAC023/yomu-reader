// Backstop for the check gate's test stages: a child that prints a Vitest
// failure summary must fail the gate even if its exit code says 0 (the
// 2026-07-18 incident: a check log showed "Test Files 2 failed" while the
// overall gate passed). Exit-code propagation stays the primary signal; this
// only ever turns a "pass" into a "fail", never the reverse.

// Matches the reporter summary lines, e.g.:
//   Test Files  2 failed | 314 passed (316)
//        Tests  5 failed | 4711 passed (4717)
// and the unhandled-error banner Vitest prints above a red summary.
const FAILURE_SUMMARY = /^\s*(?:Test Files|Tests)\s+(?:\d+\s+\w+\s*\|\s*)*(\d+)\s+failed\b/m;
const UNHANDLED_ERRORS = /^\s*Unhandled Errors?\b/m;

export function vitestOutputIndicatesFailure(output) {
    const text = String(output);
    const summary = text.match(FAILURE_SUMMARY);
    if (summary && Number(summary[1]) > 0) {
        return `vitest summary reports ${summary[1]} failed ("${summary[0].trim()}")`;
    }
    if (UNHANDLED_ERRORS.test(text)) {
        return 'vitest reported unhandled errors';
    }
    return null;
}
