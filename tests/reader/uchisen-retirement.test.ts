import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../src/reader/settings';
import { defaultDictionaryLookupLinks } from '../../src/reader/settings/dictionary';
import { kanjiSourceRows } from '../../src/reader/sources/sections';

const RETIRED_RUNTIME_PATHS = [
    'src/reader/dictionaries/uchisen.ts',
    'src/reader/dictionaries/uchisen-carousel.ts',
    'src/reader/dictionaries/uchisen-images.ts',
    'src/reader/dictionaries/uchisen-image-prompt-replacements.json',
    'scripts/uchisen-bulk-publish.mjs',
] as const;

const RUNTIME_BOUNDARIES = [
    'src/reader/app/main.ts',
    'src/reader/newtab/controller.ts',
    'src/reader/newtab/search-controller.ts',
    'src/reader/newtab/runtime.ts',
    'src/reader/network/proxy-fetch-rules.ts',
    'src/reader/companions/kanji-study.ts',
    'workers/jpdb-public-proxy/src/index.ts',
    'scripts/qa-audit.mjs',
    'scripts/profile-performance.mjs',
] as const;

// Match the executable/provider vocabulary retired from shipping artifacts,
// while allowing the disabled outbound lookup link and colour token to remain.
const RETIRED_UCHISEN_EXECUTABLE_SEAM = /\b(?:KANJI_UCHISEN_SOURCE_ID|__kanji_uchisen__)\b|\b(?:absolute|attachRendered|canStart|canonical|default|empty|find|fit|format|generate|install|is|load|localized|main|mount|no|ordered|parse|plain|post|preferred|render|request|safe|storyBacked|unique|valid)[A-Za-z0-9]*Uchisen[A-Za-z0-9]*\b|data-(?:newtab-)?uchisen\b|save_mnemonic\.php|(?:^|\/)generateimage(?:[/?#'"`]|$)|ik\.imagekit\.io\/uchisen|host\s*===?\s*['"]uchisen\.com['"]|uchisen-image-prompt-replacements/iu;

describe('Uchisen retirement contract', () => {
    it('keeps only the explicit outbound lookup hotlink', () => {
        const link = defaultDictionaryLookupLinks('local').find(candidate => candidate.id === 'uchisen');

        expect(link).toEqual(expect.objectContaining({
            enabled: false,
            label: 'Uchisen',
            urlTemplate: 'https://uchisen.com/kanji/{query}',
        }));
    });

    it('drops the retired setting instead of carrying it in the current model', () => {
        const imported = { ...DEFAULT_SETTINGS, uchisenEnabled: true, uchisenAlias: 'Old source', uchisenPriority: 1 };
        const settings = normalizeReaderSettings(imported);
        for (const key of ['uchisenEnabled', 'uchisenAlias', 'uchisenPriority']) {
            expect(DEFAULT_SETTINGS).not.toHaveProperty(key);
            expect(settings).not.toHaveProperty(key);
            expect(normalizeReaderSettings(JSON.parse(JSON.stringify(settings)))).not.toHaveProperty(key);
        }
        expect(kanjiSourceRows(settings))
            .not.toContainEqual(expect.objectContaining({ id: '__kanji_uchisen__' }));
    });

    it('ships no extractor, image proxy, or provider write path', () => {
        expect(RETIRED_RUNTIME_PATHS.filter(path => existsSync(path))).toEqual([]);

        const runtime = RUNTIME_BOUNDARIES.map(path => readFileSync(path, 'utf8')).join('\n');
        expect(runtime).not.toMatch(RETIRED_UCHISEN_EXECUTABLE_SEAM);
    });

    it('allows outbound links without allowing executable provider paths', () => {
        for (const allowed of [
            "id: 'uchisen'",
            "urlTemplate: 'https://uchisen.com/kanji/{query}'",
            "uchisen: { bg: '#9a3412'",
        ]) {
            expect(allowed).not.toMatch(RETIRED_UCHISEN_EXECUTABLE_SEAM);
        }

        for (const retired of [
            'loadUchisenData',
            'renderUchisenCarouselHtml',
            'KANJI_UCHISEN_SOURCE_ID',
            'data-newtab-uchisen',
            '/save_mnemonic.php',
            '/generateimage',
            'host === "uchisen.com"',
        ]) {
            expect(retired).toMatch(RETIRED_UCHISEN_EXECUTABLE_SEAM);
        }
    });
});
