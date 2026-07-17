import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// Guards against i18n copy keys that survive in the en COPY table after their only
// call site is deleted (the "88 dead keys" purge). Extracts every en key straight
// from src/reader/app/i18n.ts and asserts each is still referenced by real
// consumer code, so a future dead key trips CI instead of quietly bloating the
// bundle and both translation tables.

const SRC_DIR = join(process.cwd(), 'src');
const I18N_PATH = join(SRC_DIR, 'reader/app/i18n.ts');

function collectTsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...collectTsFiles(full));
        else if (full.endsWith('.ts') && full !== I18N_PATH) out.push(full);
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
                if (/^`\);/.test(blanked[j])) { i = j; break; }
                blanked[j] = '';
            }
        }
    }
    return { consumer: blanked.join('\n'), keys };
}

describe('i18n en copy keys', () => {
    it('are all referenced by consumer code (no orphans)', () => {
        const i18n = readFileSync(I18N_PATH, 'utf8');
        const { consumer, keys } = i18nConsumerText(i18n);
        expect(keys.length).toBeGreaterThan(500);

        const haystack = [consumer, ...collectTsFiles(SRC_DIR).map(file => readFileSync(file, 'utf8'))].join('\n');
        const orphans = keys.filter(key => !(
            haystack.includes(`'${key}'`)
            || haystack.includes(`"${key}"`)
            || haystack.includes('`' + key + '`')
            || haystack.includes(`.${key}`)
        ));

        expect(orphans, `Orphaned i18n copy keys (defined in i18n.ts en table but referenced by no consumer code):\n${orphans.join('\n')}`).toEqual([]);
    });
});
