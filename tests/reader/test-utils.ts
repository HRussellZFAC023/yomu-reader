// Positive-poll helper: returns at the first passing assertion, so a large
// budget costs nothing when green. CI runners execute four vitest shards on
// four cores — event-loop starvation there stretches waits that finish in
// milliseconds locally, so budgets get a CI floor instead of per-call raises.
const CI_MINIMUM_TIMEOUT_MS = 15_000;

export async function waitForExpect(assertion: () => void | Promise<void>, timeoutMs = 1000): Promise<void> {
    if (process.env.CI) timeoutMs = Math.max(timeoutMs, CI_MINIMUM_TIMEOUT_MS);
    const start = Date.now();
    let lastError: unknown;
    while (Date.now() - start < timeoutMs) {
        try {
            await assertion();
            return;
        } catch (error) {
            lastError = error;
            await new Promise(resolve => setTimeout(resolve, 20));
        }
    }
    if (lastError) throw lastError;
    await assertion();
}
