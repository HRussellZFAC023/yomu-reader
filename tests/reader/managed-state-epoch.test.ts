import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
    ManagedStateEpochSession,
    StaleManagedStateEpochError,
    managedStateLogicalValue,
    managedStateResetEnumerationValue,
    managedStateStoredValue,
    managedStateEpochTokenRelation,
    nextManagedStateEpoch,
    parseManagedStateEpoch,
} from '../../src/reader/app/managed-state-epoch';

describe('managed state reset epoch', () => {
    it('keeps legacy generation-zero values raw until the first reset', () => {
        const initial = parseManagedStateEpoch(undefined);
        const value = { theme: 'dark' };

        expect(initial).toMatchObject({ generation: 0, resetId: 'legacy' });
        expect(managedStateStoredValue(value, initial)).toBe(value);
        expect(managedStateLogicalValue(value, initial, null)).toBe(value);
    });

    it('makes only the current post-reset envelope readable', () => {
        const initial = parseManagedStateEpoch(undefined);
        const first = nextManagedStateEpoch(initial, 'reset-one', 100);
        const second = nextManagedStateEpoch(first, 'reset-two', 200);
        const stored = managedStateStoredValue({ theme: 'dark' }, first);

        expect(managedStateLogicalValue(stored, first, null)).toEqual({ theme: 'dark' });
        expect(managedStateLogicalValue(stored, second, null)).toBeNull();
        expect(managedStateLogicalValue({ theme: 'dark' }, first, null)).toBeNull();
    });

    it('lets reset enumerate every valid physical envelope but rejects malformed markers', () => {
        const initial = parseManagedStateEpoch(undefined);
        const first = nextManagedStateEpoch(initial, 'reset-one', 100);
        const stored = managedStateStoredValue({ cardIds: ['stale-child'] }, first);

        expect(managedStateResetEnumerationValue(stored)).toEqual({ cardIds: ['stale-child'] });
        expect(managedStateResetEnumerationValue({ cardIds: ['legacy-child'] })).toEqual({ cardIds: ['legacy-child'] });
        expect(() => managedStateResetEnumerationValue({
            __yomuManagedStateEnvelope: 1,
            epoch: 12,
            value: { cardIds: ['hidden-child'] },
        })).toThrow('envelope is malformed');
    });

    it('never advances a live realm silently after it captures an epoch', async () => {
        const session = new ManagedStateEpochSession();
        const initial = parseManagedStateEpoch(undefined);
        const next = nextManagedStateEpoch(initial, 'factory-reset', 100);
        let authoritative: unknown = undefined;

        await expect(session.assertCurrent(async () => authoritative)).resolves.toEqual(initial);
        authoritative = next;

        await expect(session.assertCurrent(async () => authoritative)).rejects.toBeInstanceOf(StaleManagedStateEpochError);
        expect(session.current()).toEqual(initial);
    });

    it('shares one capture across independently bundled IIFEs in the same realm', () => {
        const proof = `
            import { build } from 'esbuild';
            import { JSDOM } from 'jsdom';
            const source = [
                "import { managedStateEpochSessionForRealm } from './src/reader/app/managed-state-epoch.ts';",
                'const session = managedStateEpochSessionForRealm();',
                'export const capture = raw => session.capture(async () => raw);',
                'export const assertCurrent = raw => session.assertCurrent(async () => raw);',
            ].join('\\n');
            const bundle = async name => (await build({
                stdin: { contents: source, resolveDir: process.cwd(), sourcefile: name + '.ts', loader: 'ts' },
                bundle: true,
                write: false,
                format: 'iife',
                globalName: name,
                platform: 'browser',
                target: 'es2022',
                logLevel: 'silent',
            })).outputFiles[0].text;
            const [bundleA, bundleB] = await Promise.all([bundle('EpochBundleA'), bundle('EpochBundleB')]);
            const next = { version: 1, generation: 1, resetId: 'factory-reset', committedAt: 100 };

            const shared = new JSDOM('<!doctype html>', { url: 'https://jpdb.io/', runScripts: 'outside-only' });
            shared.window.eval(bundleA);
            await shared.window.EpochBundleA.capture(undefined);
            shared.window.eval(bundleB);
            let stale;
            try { await shared.window.EpochBundleB.assertCurrent(next); } catch (error) { stale = error; }
            if (!stale || stale.name !== 'StaleManagedStateEpochError') {
                throw new Error('second bundle accepted a newer epoch in the same realm');
            }

            const fresh = new JSDOM('<!doctype html>', { url: 'https://jiten.moe/', runScripts: 'outside-only' });
            fresh.window.eval(bundleB);
            const captured = await fresh.window.EpochBundleB.capture(next);
            if (captured.generation !== 1 || captured.resetId !== 'factory-reset') {
                throw new Error('fresh realm did not accept the current epoch');
            }
            shared.window.close();
            fresh.window.close();
            process.stdout.write('shared bundled epoch session passed');
        `;

        const output = execFileSync(process.execPath, ['--input-type=module', '-e', proof], {
            cwd: process.cwd(),
            encoding: 'utf8',
        });
        expect(output).toContain('shared bundled epoch session passed');
    }, 30_000);

    it('fails closed on a malformed durable epoch', () => {
        expect(() => parseManagedStateEpoch({ version: 1, generation: 1 })).toThrow('malformed');
        expect(() => parseManagedStateEpoch({ version: 1, generation: 0, resetId: 'legacy', committedAt: 0 })).toThrow('malformed');
    });

    it('orders database markers without treating equal-generation reset ids as interchangeable', () => {
        const first = nextManagedStateEpoch(parseManagedStateEpoch(undefined), 'reset-one', 100);

        expect(managedStateEpochTokenRelation('0:legacy', first)).toBe('older');
        expect(managedStateEpochTokenRelation('1:reset-one', first)).toBe('same');
        expect(managedStateEpochTokenRelation('1:other-reset', first)).toBe('conflict');
        expect(managedStateEpochTokenRelation('2:future-reset', first)).toBe('newer');
        expect(managedStateEpochTokenRelation('not-an-epoch', first)).toBe('malformed');
    });
});
