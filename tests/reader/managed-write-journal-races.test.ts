import { afterEach, expect, it, vi } from 'vitest';
import { createConcreteManagedWriteJournal } from '../../src/reader/app/managed-write-journal';
import { writeLocalManagedValueOrThrow, captureLocalFallbackStoredState } from '../../src/reader/app/local-mirror-provenance';
import { parseManagedStateEpoch } from '../../src/reader/app/managed-state-epoch';

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

it('checks local ownership after an awaited authority rollback instead of overwriting a newer local write', async () => {
    vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
    const key = 'jpdb-popup-reader-settings';
    const epoch = parseManagedStateEpoch(null);
    const before = { theme: 'light' };
    let authority: unknown = before;
    writeLocalManagedValueOrThrow(key, before, epoch);
    let began!: () => void;
    const entered = new Promise<void>(resolve => { began = resolve; });
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const journal = createConcreteManagedWriteJournal({
        readAuthority: async () => ({ existed: true, value: authority }),
        writeAuthority: async (_key, value) => {
            authority = value;
            writeLocalManagedValueOrThrow(key, value, epoch);
        },
        restoreAuthority: async (_key, target) => {
            began();
            await hold;
            authority = target.value;
        },
        readLocalTarget: () => ({ existed: true, value: JSON.parse(localStorage.getItem(key)!) }),
        restoreLocalTarget: (_key, target) => writeLocalManagedValueOrThrow(key, target.value, epoch),
    }, true);
    const receipt = await journal.capture(key);
    await journal.write(receipt, { theme: 'dark' });
    const rollback = journal.rollback('Rollback failed').catch(error => error);
    await entered;
    writeLocalManagedValueOrThrow(key, { theme: 'auto', pending: 'newer-tab' }, epoch);
    const newer = captureLocalFallbackStoredState(key);
    release();
    expect(await rollback).toBeInstanceOf(AggregateError);
    expect(captureLocalFallbackStoredState(key)).toEqual(newer);
    expect(authority).toEqual(before);
});
