import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { normalizeReaderSettings } from '../../src/reader/settings';
import { executeHostedSettingsWriter } from './helpers/hosted-settings-writer';

const WRITER_ACTION = {
    theme: { functionName: 'saveThemePreference', invocation: "saveThemePreference('dark')" },
    language: { functionName: 'saveInterfaceLanguage', invocation: "saveInterfaceLanguage('ja')" },
} as const;

function functionSource(source: string, name: string, indentation: number): string {
    const spaces = ' '.repeat(indentation);
    const match = source.match(new RegExp(`^${spaces}function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^${spaces}\\}`, 'mu'));
    if (!match) throw new Error(`${name} is missing from the hosted appearance shell`);
    return match[0];
}

function runHostedAppearanceWriter(
    file: string,
    indentation: number,
    initial: Record<string, unknown> | null,
    action: 'theme' | 'language',
): Record<string, unknown> {
    const source = readFileSync(file, 'utf8');
    const writerAction = WRITER_ACTION[action];
    const functions = [
        'readSettings',
        'stampNeutralHostedTarget',
        writerAction.functionName,
    ].map(name => functionSource(source, name, indentation)).join('\n');
    const result = executeHostedSettingsWriter({
        initial,
        source: `const themeKey='theme', settingsChangeEvent='settings', languageEvent='language'; const applyTheme=()=>{}, applyAccent=()=>{}, applyInterfaceLanguage=()=>{}; ${functions}`,
        invocation: writerAction.invocation,
    });
    expect(result.events).toHaveLength(1);
    return result.settings;
}

describe.each([
    ['PDF', 'docs/public/pdf-reader/index.html', 4],
    ['Video', 'docs/public/video-player/index.html', 6],
] as const)('%s hosted appearance target provenance', (_label, file, indentation) => {
    it('stamps the first fresh appearance write as explicitly target-neutral', () => {
        expect(runHostedAppearanceWriter(file, indentation, null, 'theme')).toMatchObject({
            learningTargetChosen: false,
            theme: 'dark',
        });
    });

    it('preserves explicit choices and unrelated legacy settings', () => {
        expect(runHostedAppearanceWriter(file, indentation, {
            learningTargetChosen: true,
            theme: 'light',
        }, 'language')).toMatchObject({ learningTargetChosen: true });

        const legacy = runHostedAppearanceWriter(file, indentation, { subtitleFontSize: 48 }, 'theme');
        expect(legacy).not.toHaveProperty('learningTargetChosen');
        expect(normalizeReaderSettings(legacy).learningTargetChosen).toBe(true);
        const appearanceOnly = runHostedAppearanceWriter(file, indentation, { theme: 'light' }, 'language');
        expect(appearanceOnly).not.toHaveProperty('learningTargetChosen');
        expect(normalizeReaderSettings(appearanceOnly).learningTargetChosen).toBe(false);
    });
});
