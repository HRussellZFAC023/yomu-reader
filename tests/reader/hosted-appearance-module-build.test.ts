import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('built standalone appearance module', () => {
    it('matches the authored module and is included in generated-asset publication bookkeeping', () => {
        const source = execFileSync(process.execPath, ['-e',
            'process.stdout.write(require("./scripts/lib/hosted-appearance-settings.cjs").buildHostedAppearanceSettings(process.cwd()).source)',
        ], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
        expect(readFileSync('docs/public/hosted-appearance-settings.js', 'utf8')).toBe(source);
        expect(readFileSync('scripts/lib/generated-artifacts.mjs', 'utf8')).toContain("'docs/public/hosted-appearance-settings.js'");
    });
    it('executes the actual emitted ESM before Reader startup using standalone storage', () => {
        const output = execFileSync(process.execPath, ['--experimental-vm-modules', 'tests/reader/helpers/hosted-appearance-module-proof.mjs'], {
            encoding: 'utf8', timeout: 15_000,
        });
        const { settings, ledger } = JSON.parse(output);
        expect(settings).toMatchObject({ theme: 'dark', interfaceLanguage: 'ja', learningTargetChosen: false });
        expect(ledger).toMatchObject({ revision: 2, records: { theme: { value: 'dark' }, interfaceLanguage: { value: 'ja' } } });
        expect(settings.__yomuSettingsPersistenceCommitV1).toEqual(expect.any(String));
        expect(ledger.__yomuSettingsPersistenceCommitV1).toBe(settings.__yomuSettingsPersistenceCommitV1);
    });
});
