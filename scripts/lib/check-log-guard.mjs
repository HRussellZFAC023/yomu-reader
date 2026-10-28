// Backstop for the check gate's test stages: a child that prints a Vitest
// failure summary must fail the gate even if its exit code says 0. The
// 2026-07-18 incident was ultimately classified as an observation artifact:
// `npm run check | tail` returns tail's status in stock zsh. No in-repo swallow
// path was found, but this remains a cheap backstop against a future one.
// Exit-code propagation stays the primary signal; this only ever turns a
// "pass" into a "fail", never the reverse.

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

// A test worker can die without any test failing: V8 aborts on heap exhaustion,
// or the OS kills the process. Vitest then prints a summary in which EVERY
// reported test passed and only the FILE total is short — "Test Files 484 passed
// (486)" — and exits non-zero. Read as an ordinary red, that sends you looking
// for a broken test that does not exist. It cost three full re-runs on
// 2026-08-02 before anyone noticed the totals did not add up.
//
// Distinguishing this from a real failure is the whole point: a real red names a
// test, this one names nothing. Callers use it to say so out loud.
const RUNTIME_DEATH_SIGNATURES = [
    [/Reached heap limit|JavaScript heap out of memory/, 'a worker ran out of memory'],
    [/Worker exited unexpectedly/, 'a worker exited before finishing its files'],
    [/was killed by signal|SIGKILL/, 'a worker was killed by the operating system'],
];

export function runtimeDeathReason(output) {
    const text = String(output);
    for (const [pattern, reason] of RUNTIME_DEATH_SIGNATURES) {
        if (pattern.test(text)) return reason;
    }
    return null;
}

/**
 * The file counts Vitest reports, when they disagree. `Test Files 484 passed
 * (486)` means two files never reported at all — the single most reliable
 * evidence that the run measured less than it claims.
 */
export function unreportedTestFiles(output) {
    const match = /^\s*Test Files\s+(?:\d+\s+\w+\s*\|\s*)*(\d+)\s+passed\s+\((\d+)\)/m.exec(String(output));
    if (!match) return 0;
    return Math.max(0, Number(match[2]) - Number(match[1]));
}
