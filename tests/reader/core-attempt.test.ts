/**
 * `attempt`/`attemptVoid`/`attemptAsync`/`parseJson` replace silent-swallow
 * `catch` blocks. Their whole value is that the fallback is unchanged and the
 * failure is no longer invisible, so both halves are pinned here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attempt, attemptAsync, attemptVoid, parseJson, setAttemptRecorder } from '../../src/reader/core/attempt';

describe('attempt helpers', () => {
    let debug: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        debug = vi.fn();
        setAttemptRecorder((label, error) => debug(`${label} failed`, error));
    });

    afterEach(() => {
        setAttemptRecorder(() => undefined);
        vi.restoreAllMocks();
    });

    it('returns the value and logs nothing on success', () => {
        expect(attempt(() => 41 + 1, 0, 'sum')).toBe(42);
        expect(debug).not.toHaveBeenCalled();
    });

    it('returns the fallback and records the failure', () => {
        const boom = new Error('nope');
        expect(attempt<number | null>(() => { throw boom; }, null, 'thrower')).toBeNull();
        expect(debug).toHaveBeenCalledWith('thrower failed', boom);
    });

    it('preserves falsy fallbacks exactly', () => {
        expect(attempt(() => { throw new Error('x'); }, false, 'a')).toBe(false);
        expect(attempt(() => { throw new Error('x'); }, '', 'b')).toBe('');
        expect(attempt(() => { throw new Error('x'); }, 0, 'c')).toBe(0);
        expect(attempt<undefined>(() => { throw new Error('x'); }, undefined, 'd')).toBeUndefined();
        expect(attempt(() => { throw new Error('x'); }, [], 'e')).toEqual([]);
    });

    it('never rethrows from attemptVoid', () => {
        const boom = new Error('effect blew up');
        expect(() => attemptVoid(() => { throw boom; }, 'effect')).not.toThrow();
        expect(debug).toHaveBeenCalledWith('effect failed', boom);
    });

    it('runs the effect when it does not throw', () => {
        const effect = vi.fn();
        attemptVoid(effect, 'effect');
        expect(effect).toHaveBeenCalledTimes(1);
        expect(debug).not.toHaveBeenCalled();
    });

    it('resolves the fallback for a rejected promise', async () => {
        const boom = new Error('rejected');
        await expect(attemptAsync(() => Promise.reject(boom), 'fallback', 'async')).resolves.toBe('fallback');
        expect(debug).toHaveBeenCalledWith('async failed', boom);
    });

    it('resolves the fallback for a synchronous throw inside an async attempt', async () => {
        await expect(attemptAsync<string>(() => { throw new Error('sync'); }, 'fallback', 'async-sync')).resolves.toBe('fallback');
        expect(debug).toHaveBeenCalledTimes(1);
    });

    it('resolves the value when nothing throws', async () => {
        await expect(attemptAsync(() => Promise.resolve('ok'), 'fallback', 'async-ok')).resolves.toBe('ok');
        expect(debug).not.toHaveBeenCalled();
    });

    describe('parseJson', () => {
        it('parses valid JSON', () => {
            expect(parseJson<{ a: number }>('{"a":1}', { a: 0 })).toEqual({ a: 1 });
            expect(debug).not.toHaveBeenCalled();
        });

        it('returns the fallback for absent input without logging', () => {
            expect(parseJson(null, 'fallback')).toBe('fallback');
            expect(parseJson(undefined, 'fallback')).toBe('fallback');
            expect(parseJson('', 'fallback')).toBe('fallback');
            expect(debug).not.toHaveBeenCalled();
        });

        it('returns the fallback and logs for malformed input', () => {
            expect(parseJson('{not json', 'fallback', 'settings-blob')).toBe('fallback');
            expect(debug).toHaveBeenCalledTimes(1);
            expect(debug.mock.calls[0][0]).toBe('settings-blob failed');
        });

        it('returns a parsed null as-is so it is a drop-in for JSON.parse', () => {
            expect(parseJson<string | null>('null', 'fallback')).toBeNull();
            expect(debug).not.toHaveBeenCalled();
        });
    });
});
