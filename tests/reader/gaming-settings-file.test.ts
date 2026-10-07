// @vitest-environment node
// Main-process code; Node's own modules are mocked only in a Node test environment.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const slowWrite = vi.hoisted(() => ({ gate: null as Promise<void> | null }));

// A slow disk, as the OS sees it: the file is truncated first, its text lands later.
vi.mock('node:fs/promises', async importOriginal => {
    const actual = await importOriginal<typeof import('node:fs/promises')>();
    return {
        ...actual,
        writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
            const gate = slowWrite.gate;
            slowWrite.gate = null;
            if (gate) {
                await actual.writeFile(args[0], '');
                await gate;
            }
            return actual.writeFile(...args);
        },
    };
});

const { settingsFileWriter } = await import('../../src/gaming/settings-file');

let directory = '';
afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = '';
});

function savedShortcutFile(): string {
    directory = mkdtempSync(path.join(tmpdir(), 'yomu-gaming-settings-'));
    const file = path.join(directory, 'capture-shortcut-v1.json');
    writeFileSync(file, '{"shortcut":"Control+Shift+Y"}\n');
    return file;
}

function waitTurn(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 20));
}

describe('Desktop settings file saves', () => {
    it('never leaves the saved file truncated while a save is on its way to disk', async () => {
        const file = savedShortcutFile();
        let finish = () => undefined as void;
        slowWrite.gate = new Promise(resolve => { finish = resolve; });
        const save = settingsFileWriter()(file, '{"shortcut":"Control+Shift+U"}\n');

        await waitTurn();
        expect(readFileSync(file, 'utf8')).toBe('{"shortcut":"Control+Shift+Y"}\n');
        finish();
        await save;
        expect(readFileSync(file, 'utf8')).toBe('{"shortcut":"Control+Shift+U"}\n');
    });

    it('keeps the later of two overlapping saves, even when the earlier one is slower', async () => {
        const file = savedShortcutFile();
        const save = settingsFileWriter();
        let finish = () => undefined as void;
        slowWrite.gate = new Promise(resolve => { finish = resolve; });
        const earlier = save(file, '{"shortcut":"Control+Shift+I"}\n');
        const later = save(file, '{"shortcut":"Control+Shift+U"}\n');

        await waitTurn();
        finish();
        await Promise.all([earlier, later]);
        expect(readFileSync(file, 'utf8')).toBe('{"shortcut":"Control+Shift+U"}\n');
    });
});
