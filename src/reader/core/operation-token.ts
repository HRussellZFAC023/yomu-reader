/**
 * A handle to one begun operation within a named scope. `superseded` flips to
 * `true` the moment a newer operation begins in the same scope, letting async
 * continuations bail (latest-wins) instead of racing an obsolete result.
 */
export interface OperationToken {
    readonly superseded: boolean;
}

interface MutableOperationToken {
    superseded: boolean;
}

/**
 * Tracks the latest operation per named scope, superseding the previous one.
 *
 * Replaces hand-maintained integer "generation" counters. Instead of
 *   `const gen = ++this.fooGeneration; ...; if (gen !== this.fooGeneration) return;`
 * write
 *   `const op = this.operations.begin('foo'); ...; if (op.superseded) return;`
 *
 * Each scope is independent: beginning one scope never supersedes another. An
 * out-of-band invalidation (the old `this.fooGeneration++` with no captured gen)
 * maps to `this.operations.begin('foo')` — it supersedes any in-flight token
 * without anyone reading the returned handle.
 */
export class OperationTracker {
    private readonly latest = new Map<string, MutableOperationToken>();

    begin(scope: string): OperationToken {
        const previous = this.latest.get(scope);
        if (previous) previous.superseded = true;
        const token: MutableOperationToken = { superseded: false };
        this.latest.set(scope, token);
        return token;
    }
}
