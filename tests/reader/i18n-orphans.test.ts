import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// Guards against i18n copy keys that survive in the en COPY table after their only
// call site is deleted (the "88 dead keys" purge). Extracts every en key straight
// from the app i18n source and its focused copy leaves, then asserts each is
// still referenced by real consumer code. A future dead key therefore trips CI
// instead of quietly bloating the bundle and both translation tables.

const SRC_DIR = join(process.cwd(), 'src');
const I18N_PATH = join(SRC_DIR, 'reader/app/i18n.ts');
const SUBTITLE_SETTINGS_COPY_PATH = join(SRC_DIR, 'reader/app/subtitle-settings-copy.ts');
const I18N_COPY_PATHS = new Set([I18N_PATH, SUBTITLE_SETTINGS_COPY_PATH]);

function collectTsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...collectTsFiles(full));
        else if (full.endsWith('.ts') && !I18N_COPY_PATHS.has(full)) out.push(full);
    }
    return out;
}

// Blank out the three translation-table bodies (the en COPY object literal and the
// two parseUiCopyTable(String.raw`...`) blocks) so a key can only count as "used"
// through genuine consumer code — uiText() call sites and the CARD_STATE /
// AUDIO_SOURCE label maps — never by its own translation entry in i18n.ts.
function i18nConsumerText(i18n: string): { consumer: string; keys: string[] } {
    const lines = i18n.split('\n');
    const enStart = lines.findIndex(line => /^ {4}en:\s*\{/.test(line));
    if (enStart === -1) throw new Error('en COPY table not found in i18n.ts');
    let enEnd = -1;
    for (let i = enStart + 1; i < lines.length; i += 1) {
        if (/^ {4}\},?\s*$/.test(lines[i])) { enEnd = i; break; }
    }
    if (enEnd === -1) throw new Error('end of en COPY table not found in i18n.ts');
    const keys = [...lines.slice(enStart + 1, enEnd).join('\n').matchAll(/^ {8}([A-Za-z][A-Za-z0-9_]*)\s*:/gm)].map(match => match[1]);

    const blanked = [...lines];
    for (let i = enStart + 1; i < enEnd; i += 1) blanked[i] = '';
    // Blank each parseUiCopyTable(String.raw`...`) body (ja copy tables).
    for (let i = 0; i < blanked.length; i += 1) {
        if (/parseUiCopyTable\(String\.raw`/.test(blanked[i])) {
            for (let j = i + 1; j < blanked.length; j += 1) {
                if (/^`\)[,;]/.test(blanked[j])) { i = j; break; }
                blanked[j] = '';
            }
        }
    }
    return { consumer: blanked.join('\n'), keys };
}

function subtitleSettingsCopyInventory(source: string): { consumer: string; keys: string[] } {
    const lines = source.split('\n');
    const enStart = lines.findIndex(line => /^const EN_SUBTITLE_SETTINGS_COPY = \{/.test(line));
    const enEnd = lines.findIndex((line, index) => index > enStart && /^} as const;/.test(line));
    if (enStart === -1 || enEnd === -1) throw new Error('English subtitle settings copy table not found');
    const keys = [...lines.slice(enStart + 1, enEnd).join('\n').matchAll(/^ {4}([A-Za-z][A-Za-z0-9_]*)\s*:/gm)]
        .map(match => match[1]);
    return { consumer: '', keys };
}

// Every identifier that appears between a matching pair of quotes, collected in one
// pass. Rescanning the multi-megabyte haystack four times per key, for over a
// thousand keys, is what made this the slowest single test in the suite; the closing
// quote stays unconsumed via lookahead so back-to-back literals still both register.
function quotedIdentifiers(haystack: string): Set<string> {
    const found = new Set<string>();
    for (const match of haystack.matchAll(/(['"`])([A-Za-z][A-Za-z0-9_]*)(?=\1)/g)) found.add(match[2]);
    return found;
}

describe('i18n en copy keys', () => {
    it('are all referenced by consumer code (no orphans)', () => {
        const inventories = [
            i18nConsumerText(readFileSync(I18N_PATH, 'utf8')),
            subtitleSettingsCopyInventory(readFileSync(SUBTITLE_SETTINGS_COPY_PATH, 'utf8')),
        ];
        const keys = inventories.flatMap(inventory => inventory.keys);
        expect(keys.length).toBeGreaterThan(500);

        const haystack = [
            ...inventories.map(inventory => inventory.consumer),
            ...collectTsFiles(SRC_DIR).map(file => readFileSync(file, 'utf8')),
        ].join('\n');
        // The property-access form stays a substring scan (`.key` also counts inside a
        // longer member name), but only the handful of keys no quoted literal claimed
        // ever reach it.
        const quoted = quotedIdentifiers(haystack);
        const orphans = keys.filter(key => !(quoted.has(key) || haystack.includes(`.${key}`)));

        expect(orphans, `Orphaned i18n copy keys (defined in i18n.ts en table but referenced by no consumer code):\n${orphans.join('\n')}`).toEqual([]);
    });
});
