import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { normalizeReaderSettings } from '../../src/reader/settings';
import { executeHostedSettingsWriter } from './helpers/hosted-settings-writer';

const DOCS_NEW_TAB = readFileSync('docs/newtab/index.html', 'utf8');

function runDocsLanguageWriter(
    initial: Record<string, unknown> | null,
    interfaceLanguage: 'en' | 'ja',
): Record<string, unknown> {
    const writer = DOCS_NEW_TAB.match(/^        const saveLanguage = value => \{[\s\S]*?^        \};/mu)?.[0];
    if (!writer) throw new Error('docs/newtab language writer is missing');
    const result = executeHostedSettingsWriter({
        initial,
        source: writer,
        invocation: `saveLanguage(${JSON.stringify(interfaceLanguage)})`,
    });
    expect(result.events).toHaveLength(1);
    return result.settings;
}

describe('docs new-tab target-choice provenance', () => {
    it('stamps only the first fresh hosted write with an explicit false', () => {
        expect(runDocsLanguageWriter(null, 'en')).toEqual({
            learningTargetChosen: false,
            interfaceLanguage: 'en',
        });
        const passiveAppearance = runDocsLanguageWriter({ interfaceLanguage: 'ja' }, 'en');
        expect(passiveAppearance).not.toHaveProperty('learningTargetChosen');
        expect(normalizeReaderSettings(passiveAppearance).learningTargetChosen).toBe(false);
    });

    it('preserves explicit choices and does not relabel an unrelated legacy record', () => {
        expect(runDocsLanguageWriter({ learningTargetChosen: true, theme: 'dark' }, 'ja')).toMatchObject({
            learningTargetChosen: true,
            theme: 'dark',
            interfaceLanguage: 'ja',
        });
        expect(runDocsLanguageWriter({ learningTargetChosen: false, theme: 'light' }, 'en')).toMatchObject({
            learningTargetChosen: false,
            theme: 'light',
            interfaceLanguage: 'en',
        });

        const legacy = runDocsLanguageWriter({ subtitleFontSize: 48 }, 'en');
        expect(legacy).not.toHaveProperty('learningTargetChosen');
        expect(normalizeReaderSettings(legacy).learningTargetChosen).toBe(true);
    });
});
