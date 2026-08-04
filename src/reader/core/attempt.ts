/**
 * Failure that is expected but must not be invisible.
 *
 * Yomu runs across realms it does not control: a sandboxed userscript, a
 * hosted page, an extension worker, an iframe whose `contentDocument` throws
 * on access, storage the browser has revoked. A great deal of code therefore
 * has to tolerate a throw and carry on with a fallback — that part is correct.
 * What was not correct is that ~420 of the repo's ~885 `catch` blocks
 * discarded the error entirely, so a permission change, a renamed API or a
 * cross-realm mishap looked exactly like "this feature is off".
 *
 * `attempt` keeps the same fallback and the same control flow, and adds one
 * `log.debug` line naming the site. Debug output is off unless the learner
 * enables logging, so this costs nothing in normal use and turns a silent
 * degradation into a diagnosable one.
 *
 * Use it where the fallback is genuinely fine. Where a failure should surface
 * to the learner, keep the explicit `catch` and report it — this helper is not
 * a licence to swallow more.
 */
/**
 * This module imports nothing, deliberately. `app/logger` sits on top of
 * `app/storage`, which sits on top of `userscript/storage-bridge` and
 * `platform/window-events` — and `window-events` reads window methods at
 * module-evaluation time. Importing the logger from here therefore made
 * `attempt` undefined at the moment `window-events` first called it (measured:
 * `TypeError: attempt is not a function` from window-events.ts during module
 * init). So the dependency is inverted: the logger registers itself, and until
 * it does the recorder is a no-op.
 */
type AttemptRecorder = (label: string, error: unknown) => void;

let recorder: AttemptRecorder = () => undefined;

/** Called once by app/logger so failures land on the existing debug channel. */
export function setAttemptRecorder(next: AttemptRecorder): void {
    recorder = next;
}

function record(label: string, error: unknown): void {
    recorder(label, error);
}

/**
 * Runs `fn`; on throw records the failure against `label` and returns
 * `fallback`. Behaviour is identical to `try { return fn(); } catch { return
 * fallback; }` plus the log line.
 */
export function attempt<T>(fn: () => T, fallback: T, label: string): T {
    try {
        return fn();
    } catch (error) {
        record(label, error);
        return fallback;
    }
}

/**
 * Runs `fn` for its effect only; on throw records the failure. Covers the
 * comment-only-catch shape, where there is no value to fall back to.
 */
export function attemptVoid(fn: () => void, label: string): void {
    try {
        fn();
    } catch (error) {
        record(label, error);
    }
}

/**
 * Awaits `fn()`; on throw or rejection records the failure and resolves to
 * `fallback`. Accepts a sync-throwing `fn` too, so the whole `try { await …
 * } catch { return fallback; }` shape is covered.
 */
export async function attemptAsync<T>(fn: () => Promise<T> | T, fallback: T, label: string): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        record(label, error);
        return fallback;
    }
}

/**
 * `JSON.parse` with a fallback instead of a throw. The repo had ~88 raw
 * `JSON.parse` calls and no safe helper, so every one of them was either
 * wrapped in its own silent `try` or was a latent crash on stored data written
 * by an older version.
 *
 * Returns `fallback` for null/undefined/empty input without logging — absent
 * data is not a failure. A parsed `null` is returned as-is, so this is a
 * drop-in for the sites it replaces; only a genuine parse error is recorded.
 */
export function parseJson<T>(text: string | null | undefined, fallback: T, label = 'parseJson'): T {
    if (text === null || text === undefined || text === '') return fallback;
    try {
        return JSON.parse(text) as T;
    } catch (error) {
        record(label, error);
        return fallback;
    }
}
