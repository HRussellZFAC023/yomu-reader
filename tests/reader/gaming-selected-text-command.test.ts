import { beforeEach, describe, expect, it, vi } from 'vitest';
const command = vi.hoisted<{ error: boolean; stdout: string; stderr: string; options: unknown }>(() => ({ error: false, stdout: '', stderr: '', options: {} }));
vi.mock('node:child_process', () => {
    const execFile = (_file: string, _args: string[], options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        command.options = options;
        callback(command.error ? new Error('raw OS exception with private document name') : null, command.stdout, command.stderr);
    };
    return { default: { execFile }, execFile };
});
import { readSelectedText, runSelectionCommand } from '../../src/gaming/selected-text';

beforeEach(() => { command.error = false; command.stdout = ''; command.stderr = ''; });

describe('native selection command error boundary', () => {
    it('classifies permission errors without retaining another app’s raw streams or exception', async () => {
        command.error = true;
        command.stdout = 'private document content';
        command.stderr = 'private document title: not authorized (-1743)';
        let failure: unknown;
        try { await runSelectionCommand({ file: '/usr/bin/osascript', args: [] }); } catch (error) { failure = error; }
        expect(failure).toBeInstanceOf(Error);
        expect(JSON.stringify(failure)).not.toMatch(/private|stdout|stderr/);
        expect(String(failure)).toBe('Error: Selection access failed.');
        expect(command.options).toMatchObject({ windowsHide: true, timeout: 5_000, maxBuffer: 256_000 });
        await expect(readSelectedText({ platform: 'darwin', displayServer: '', run: runSelectionCommand, readPrimarySelection: () => 'stale' }))
            .resolves.toEqual({ kind: 'permission' });
    });

    it('reports a secure field or unsupported AX attribute as unavailable without reading any clipboard', async () => {
        command.error = true;
        command.stderr = 'AX attribute not supported (-25203)';
        const primary = vi.fn(() => 'private stale clipboard');
        await expect(readSelectedText({ platform: 'darwin', displayServer: '', run: runSelectionCommand, readPrimarySelection: primary }))
            .resolves.toEqual({ kind: 'unavailable' });
        expect(primary).not.toHaveBeenCalled();
    });
});
