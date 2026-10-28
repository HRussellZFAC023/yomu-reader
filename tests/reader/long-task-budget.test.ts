import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Page } from 'playwright';

import { splitLongTasksAt } from '../../scripts/lib/long-task-budget.mjs';
import { addScriptTagWithCspFallback } from '../../scripts/lib/smoke-test-helpers.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('splitLongTasksAt', () => {
    it('keeps the runtime tail of a task that also evaluated the bundle', () => {
        // Core evaluation ends at 600 inside a task that runs reader init
        // microtasks until 760: that init is runtime work and stays measured.
        const { before, after } = splitLongTasksAt([
            { startTime: 180, duration: 335 },
            { startTime: 450, duration: 310 },
            { startTime: 1080, duration: 250 },
        ], 600);

        expect(before).toEqual([
            { startTime: 180, duration: 335 },
            { startTime: 450, duration: 150 },
        ]);
        expect(after).toEqual([
            { startTime: 600, duration: 160 },
            { startTime: 1080, duration: 250 },
        ]);
    });

    it('counts a task that starts exactly at the boundary entirely as runtime', () => {
        expect(splitLongTasksAt([{ startTime: 600, duration: 80 }], 600))
            .toEqual({ before: [], after: [{ startTime: 600, duration: 80 }] });
    });
});

describe('addScriptTagWithCspFallback epilogue', () => {
    function builtUserscriptGraph(): string {
        const root = mkdtempSync(join(tmpdir(), 'yomu-epilogue-'));
        temporaryDirectories.push(root);
        mkdirSync(join(root, 'dist/greasyfork'), { recursive: true });
        writeFileSync(join(root, 'dist/greasyfork/yomu-runtime.user.js'), 'window.companion = 1;');
        const corePath = join(root, 'dist/yomu.user.js');
        writeFileSync(corePath, [
            '// @require https://yomureader.com/greasyfork/yomu-runtime.0123456789ab.user.js#sha256=x',
            'window.core = 1;',
        ].join('\n'));
        return corePath;
    }

    it('appends the epilogue to core only, inside core\'s own script text', async () => {
        const corePath = builtUserscriptGraph();
        const injected: Array<{ path?: string; content?: string }> = [];
        const page = { addScriptTag: async (options: { path?: string; content?: string }) => { injected.push(options); } };

        await addScriptTagWithCspFallback(page as unknown as Page, corePath, { epilogue: 'performance.mark("done");' });

        const companionPath = join(corePath, '../greasyfork/yomu-runtime.user.js');
        expect(injected).toEqual([
            { content: `window.companion = 1;\n//# sourceURL=${companionPath}` },
            { content: `${readFileSync(corePath, 'utf8')}\n;performance.mark("done");\n//# sourceURL=${corePath}` },
        ]);
    });

    it('evaluates the same epilogue-bearing text when CSP blocks the script tag', async () => {
        const corePath = builtUserscriptGraph();
        const evaluated: string[] = [];
        const page = {
            addScriptTag: async () => { throw new Error('Refused by CSP'); },
            context: () => ({
                newCDPSession: async () => ({
                    send: async (_method: string, params: { expression: string }) => { evaluated.push(params.expression); },
                }),
            }),
        };

        await addScriptTagWithCspFallback(page as unknown as Page, corePath, { epilogue: 'performance.mark("done");' });

        expect(evaluated).toHaveLength(2);
        expect(evaluated[0]).toMatch(/^window\.companion = 1;\n\/\/# sourceURL=/u);
        expect(evaluated[1]).toContain('window.core = 1;\n;performance.mark("done");\n//# sourceURL=');
    });
});
