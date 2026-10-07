import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { renderSettingsForm } from '../../src/reader/settings/form';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

// YQ-17: the manga guide sent readers to "Settings → Images" after the panel
// had become Media. Every "Settings → X" a public page or the README names must
// be a tab the Settings dialog actually shows.

const ROOT = path.resolve(__dirname, '../..');
const SKIPPED_DIRECTORIES = new Set(['public', 'dev', 'academy', 'qa', 'operations', 'api', '.vitepress', 'node_modules']);
// Operating-system settings paths, not Yomu's dialog.
const OS_SETTINGS_PREFIX = /(?:System|Safari|iOS|iPadOS|macOS)\s*(?:→|>|›)?\s*$/u;

function publicMarkdown(directory: string): string[] {
    return readdirSync(directory).flatMap(name => {
        const file = path.join(directory, name);
        if (statSync(file).isDirectory()) return SKIPPED_DIRECTORIES.has(name) ? [] : publicMarkdown(file);
        return name.endsWith('.md') && !name.startsWith('changelog') ? [file] : [];
    });
}

function settingsTabLabels(): Set<string> {
    const form = document.createElement('form');
    form.innerHTML = renderSettingsForm(DEFAULT_SETTINGS, 'https://yomureader.com/study/');
    return new Set([...form.querySelectorAll('.jpdb-reader-settings-tab')].map(tab => tab.textContent?.trim() ?? ''));
}

function namedSettingsTabs(text: string): string[] {
    const named: string[] = [];
    for (const match of text.matchAll(/Settings\s*(?:→|>|›|->)\s*([A-Z][A-Za-z]*(?: & [A-Za-z]+)?)/gu)) {
        if (OS_SETTINGS_PREFIX.test(text.slice(Math.max(0, match.index - 12), match.index))) continue;
        named.push(match[1]!);
    }
    return named;
}

describe('docs name only Settings tabs that exist', () => {
    it('finds no stale panel names in the public docs or the README', () => {
        const tabs = settingsTabLabels();
        expect(tabs).toEqual(new Set(['Appearance', 'Backup & sync', 'API', 'Sources', 'Media', 'Mining', 'Study', 'Shortcuts', 'Help']));
        const files = [path.join(ROOT, 'README.md'), ...publicMarkdown(path.join(ROOT, 'docs'))];
        const stale = files.flatMap(file => namedSettingsTabs(readFileSync(file, 'utf8'))
            .filter(tab => !tabs.has(tab))
            .map(tab => `${path.relative(ROOT, file)}: Settings → ${tab}`));
        expect(stale).toEqual([]);
    });

    it('reads a path the way a page writes it', () => {
        expect(namedSettingsTabs('Open Study → Settings → Backup & sync, then Settings > Audio.')).toEqual(['Backup & sync', 'Audio']);
        expect(namedSettingsTabs('Open System Settings → Privacy & Security; Safari → Settings → Extensions.')).toEqual([]);
    });
});
