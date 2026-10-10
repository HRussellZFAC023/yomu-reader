import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('nightly smoke selection', () => {
    it('rejects an unknown name before running even a valid requested guard', () => {
        const result = spawnSync(process.execPath, ['scripts/run-nightly-smokes.mjs', 'smoke:anki-template', 'smoke:missing-guard'], { encoding: 'utf8' });
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('Unknown nightly smoke script(s): smoke:missing-guard');
        expect(result.stdout).not.toContain('running');
    });
});
