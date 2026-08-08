import { describe, expect, it } from 'vitest';
import {
    DEFAULT_DICTIONARY_LOOKUP_LINKS,
    defaultDictionaryLookupLinks,
    dictionaryLookupLinksForTarget,
    normalizeDictionaryLookupLinkSettings,
    MAX_EXTRA_LOOKUP_LINKS,
    MAX_LOOKUP_LINK_ROWS,
} from '../../../src/reader/settings/dictionary';
import {
    hasTargetLookupSites,
    lookupSiteComponents,
    missingLookupComponents,
    targetLookupSiteIds,
    targetLookupSites,
} from '../../../src/reader/settings/lookup-links';
import { formatLookupUrl } from '../../../src/reader/dictionaries/display';
import { renderDictionaryLookupLinkEditor } from '../../../src/reader/settings/form-editors';
import { LEARNING_TARGET_ROSTER } from '../../../src/reader/languages';
import { uiText } from '../../../src/reader/app/i18n';

const ROSTER_IDS = LEARNING_TARGET_ROSTER.map(entry => entry.id);
const NON_JAPANESE_TARGETS = ROSTER_IDS.filter(id => id !== 'ja');
const DIACRITIC_PATH_PROBES: Readonly<Record<string, string>> = {
    sq: 'ujë',
    grc: 'ὕδωρ',
    ar: 'كِتاب',
    yue: '食飯',
    zh: '學習',
    da: 'blå',
    nl: 'café',
    en: 'café',
    fi: 'yö',
    fr: 'élève',
    de: 'Bär',
    el: 'νερό',
    hu: 'víz',
    id: 'résumé',
    it: 'perché',
    km: 'ទឹក',
    ko: '물',
    lo: 'ເສືອ',
    la: 'cūrā',
    mn: 'үг',
    fa: 'آب',
    pl: 'żółć',
    pt: 'água',
    ro: 'apă',
    ru: 'ёлка',
    sh: 'kuća',
    es: 'año',
    sv: 'blå',
    tl: 'áso',
    th: 'น้ำ',
    tr: 'ağız',
    vi: 'nước',
};

const ASCII_PATH_EXPECTATIONS: Readonly<Record<string, string>> = {
    'it/demauro': 'perche',
    'pt/dicio': 'agua',
};

function lookupValues(query: string) {
    return { query, word: query, reading: '', vid: '', sid: '' };
}

function carriesLookupQueryInPath(template: string): boolean {
    const sentinel = 'yomu-path-query-probe';
    const resolved = template.replace(/\{query(?:Ascii)?\}/i, sentinel);
    return new URL(resolved).pathname.includes(sentinel);
}

describe('U46 per-target lookup hotlinks', () => {
    it('leaves the Japanese pill row exactly as it shipped', () => {
        // The non-negotiable. Every existing install is Japanese, so a moved pill,
        // a flipped toggle or an extra entry here is a regression for all of them.
        expect(defaultDictionaryLookupLinks('local', 'ja').map(({ priority, ...link }) => link))
            .toEqual(DEFAULT_DICTIONARY_LOOKUP_LINKS.map(({ priority, ...link }) => link));
        expect(hasTargetLookupSites('ja')).toBe(false);
        expect(targetLookupSiteIds()).not.toContain('ja');
    });

    it('gives every other rostered target its own verified set', () => {
        for (const id of NON_JAPANESE_TARGETS) {
            expect(hasTargetLookupSites(id), id).toBe(true);
            const links = defaultDictionaryLookupLinks('local', id);
            expect(links.length + MAX_EXTRA_LOOKUP_LINKS, id).toBeLessThanOrEqual(MAX_LOOKUP_LINK_ROWS);
            // Yomu's own search leads and Copy closes, exactly as in Japanese.
            expect(links.at(0)?.id, id).toBe('yomu-search');
            expect(links.at(-1)?.id, id).toBe('copy');
            // The Japanese-only parser pills must never reach another target:
            // pointing a Spanish word at jiten.moe or jpdb.io returns nothing.
            expect(links.map(link => link.id), id)
                .not.toEqual(expect.arrayContaining(['jiten', 'jpdb', 'bunpro', 'jisho', 'weblio']));
        }
    });

    it('ships only templates that substitute a query into a resolvable URL', () => {
        for (const id of NON_JAPANESE_TARGETS) {
            for (const site of targetLookupSites(id)) {
                expect(site.urlTemplate, `${id}/${site.id}`).toMatch(/\{query(?:Ascii)?\}/i);
                // An unresolved code token would ship a literal `%code%` in the URL.
                expect(site.urlTemplate, `${id}/${site.id}`).not.toContain('%code%');
                const url = new URL(site.urlTemplate.replace(/\{query(?:Ascii)?\}/i, 'x'));
                expect(['http:', 'https:'], `${id}/${site.id}`).toContain(url.protocol);
            }
        }
    });

    it('probes every path-slug template with a diacritic-bearing word', () => {
        const pathSites = NON_JAPANESE_TARGETS.flatMap(targetLanguage => (
            targetLookupSites(targetLanguage)
                .filter(site => carriesLookupQueryInPath(site.urlTemplate))
                .map(site => ({ targetLanguage, site }))
        ));
        expect(pathSites.length).toBeGreaterThan(0);

        for (const { targetLanguage, site } of pathSites) {
            const probe = DIACRITIC_PATH_PROBES[targetLanguage];
            expect(probe, `${targetLanguage}/${site.id} has a path probe`).toBeTruthy();
            expect(probe, `${targetLanguage}/${site.id} probe is non-ASCII`).toMatch(/[^\x00-\x7F]/);

            const formatted = formatLookupUrl(site.urlTemplate, lookupValues(probe));
            const decodedPath = decodeURIComponent(new URL(formatted).pathname);
            const siteKey = `${targetLanguage}/${site.id}`;
            const expected = ASCII_PATH_EXPECTATIONS[siteKey] ?? probe;
            expect(decodedPath, siteKey).toContain(expected);
            expect(site.urlTemplate.includes('{queryAscii}'), siteKey)
                .toBe(Object.hasOwn(ASCII_PATH_EXPECTATIONS, siteKey));
        }
    });

    it('uses the verified diacritic-safe routes for the affected dictionaries', () => {
        const nativeTemplate = (targetLanguage: string, siteId: string) => (
            targetLookupSites(targetLanguage).find(site => site.id === siteId)?.urlTemplate
        );
        expect(nativeTemplate('de', 'duden')).toBe('https://www.duden.de/suchen/dudenonline/{query}');
        expect(nativeTemplate('it', 'demauro')).toBe('https://dizionario.internazionale.it/parola/{queryAscii}');
        expect(nativeTemplate('pt', 'dicio')).toBe('https://www.dicio.com.br/{queryAscii}/');
        expect(nativeTemplate('ar', 'maajim')).toBe('https://maajim.com/dictionary/{query}');
        expect(nativeTemplate('km', 'khmerdict')).toBe('https://khmerdict.com/{query}');
        expect(nativeTemplate('lo', 'laoswords')).toBe('https://www.laoswords.com/{query}');
        expect(nativeTemplate('th', 'longdo')).toBe('https://dict.longdo.com/search/{query}');

        expect(formatLookupUrl(nativeTemplate('de', 'duden') ?? '', lookupValues('Bär')))
            .toBe('https://www.duden.de/suchen/dudenonline/B%C3%A4r');
        expect(formatLookupUrl(nativeTemplate('it', 'demauro') ?? '', lookupValues('perché')))
            .toBe('https://dizionario.internazionale.it/parola/perche');
        expect(formatLookupUrl(nativeTemplate('pt', 'dicio') ?? '', lookupValues('água')))
            .toBe('https://www.dicio.com.br/agua/');
        expect(formatLookupUrl(nativeTemplate('ar', 'maajim') ?? '', lookupValues('كِتاب')))
            .toBe('https://maajim.com/dictionary/%D9%83%D9%90%D8%AA%D8%A7%D8%A8');
        expect(formatLookupUrl(nativeTemplate('km', 'khmerdict') ?? '', lookupValues('ទឹក')))
            .toBe('https://khmerdict.com/%E1%9E%91%E1%9E%B9%E1%9E%80');
        expect(formatLookupUrl(nativeTemplate('lo', 'laoswords') ?? '', lookupValues('ເສືອ')))
            .toBe('https://www.laoswords.com/%E0%BB%80%E0%BA%AA%E0%BA%B7%E0%BA%AD');
        expect(formatLookupUrl(nativeTemplate('th', 'longdo') ?? '', lookupValues('น้ำ')))
            .toBe('https://dict.longdo.com/search/%E0%B8%99%E0%B9%89%E0%B8%B3');
    });

    it('claims a component only where a site in the set supplies it', () => {
        for (const id of NON_JAPANESE_TARGETS) {
            const sites = targetLookupSites(id);
            const present = new Set(sites.flatMap(site => site.components));
            // Definitions and sentences are the floor: every target has at least
            // one dictionary and Tatoeba.
            expect([...present], id).toContain('definition');
            expect([...present], id).toContain('sentences');
            for (const missing of missingLookupComponents(id)) {
                expect(present.has(missing), `${id} claims ${missing}`).toBe(false);
            }
        }
    });

    it('states the components a language has no site for instead of hiding them', () => {
        // Ancient Greek has no verified pronunciation site and no image one.
        expect(missingLookupComponents('grc')).toEqual(['audio', 'images']);
        const greek = renderDictionaryLookupLinkEditor(defaultDictionaryLookupLinks('local', 'grc'), [], 'grc');
        expect(greek).toContain('data-lookup-link-gap="audio images"');
        expect(greek).toContain('No verified site for this language offers audio, images');
        // The live words.hk entry has no content image, so Cantonese says so.
        expect(missingLookupComponents('yue')).toEqual(['images']);
        expect(renderDictionaryLookupLinkEditor(defaultDictionaryLookupLinks('local', 'yue'), [], 'yue'))
            .toContain('data-lookup-link-gap="images"');
    });

    it('labels each row with what that site actually returns', () => {
        const html = renderDictionaryLookupLinkEditor(defaultDictionaryLookupLinks('local', 'yue'), [], 'yue');
        expect(lookupSiteComponents('yue', 'words-hk')).toEqual(['definition', 'sentences']);
        expect(html).toContain('data-lookup-link-components="definition sentences"');
        expect(html).not.toContain('data-lookup-link-components="definition sentences audio images"');
        // Tatoeba is a sentence corpus and nothing else; it must not claim audio.
        expect(html).toContain('data-lookup-link-components="sentences"');
        // Japanese has no catalogue entry, so no row claims components there.
        expect(renderDictionaryLookupLinkEditor(defaultDictionaryLookupLinks('local', 'ja'), [], 'ja'))
            .not.toContain('data-lookup-link-note="components"');
    });

    describe('measured opt-outs stay opted out', () => {
        const siteIds = (id: string) => targetLookupSites(id).map(site => site.id);

        // YouGlish was dropped entirely after a sweep saw "a bot or quota page" on every
        // route. That conclusion was wrong, and the reason matters: youglish.com serves
        // a page TITLED "Bot detection!" to any automated client, so a 200 measured by
        // curl — or by an automated browser — says nothing about whether the link works.
        // Every "verification" of it was reading the same bot page.
        //
        // The authoritative source is YouGlish itself: its own footer enumerates the
        // languages it covers and its own links emit the URL shape
        // `https://youglish.com/pronounce/hola/spanish` (read 2026-07-31). A real user
        // clicking from the popover is a real browser with a real session and never
        // meets the bot filter, so the link works for them regardless.
        //
        // Deliberately NOT fetched here. A test that live-fetched YouGlish would be
        // flaky, slow, and rude to a free third party; what belongs in a test is that
        // every language it covers gets the link with the right slug, and no language
        // it does not cover gets one at all.
        const YOUGLISH_TARGETS = [
            'ar', 'de', 'el', 'en', 'es', 'fa', 'fr', 'id', 'it', 'ko',
            'nl', 'pl', 'pt', 'ro', 'ru', 'sv', 'th', 'tr', 'vi', 'zh',
        ] as const;

        it('offers YouGlish for every language YouGlish actually covers', () => {
            for (const id of YOUGLISH_TARGETS) {
                const site = targetLookupSites(id).find(candidate => candidate.id === 'youglish');
                expect(site, `${id} should offer YouGlish`).toBeDefined();
                // The word goes in the PATH, so a diacritic- or non-Latin-bearing query
                // must survive it — the same trap that broke de/duden and it/demauro.
                expect(site?.urlTemplate).toMatch(/^https:\/\/youglish\.com\/pronounce\/\{query\}\/[a-z]+$/u);
                expect(site?.components).toEqual(expect.arrayContaining(['sentences', 'audio']));
            }
        });

        it('omits YouGlish only where YouGlish has no such language', () => {
            const covered = new Set<string>(YOUGLISH_TARGETS);
            for (const id of NON_JAPANESE_TARGETS) {
                if (covered.has(id)) continue;
                expect(siteIds(id), `${id} is not a YouGlish language`).not.toContain('youglish');
            }
        });

        it('omits Linguee, Reverso and WordReference where the pair does not exist', () => {
            for (const id of ['da', 'fi', 'hu']) {
                expect(siteIds(id), id).not.toContain('reverso');
                expect(siteIds(id), id).not.toContain('wordreference');
            }
            // Linguee DOES have Danish and Finnish, but only under the full
            // language name — the two-letter code renders German.
            const danish = targetLookupSites('da').find(site => site.id === 'linguee');
            expect(danish?.urlTemplate).toBe('https://www.linguee.com/english-danish/search?source=danish&query={query}');
            expect(siteIds('de')).not.toContain('linguee');
            for (const id of NON_JAPANESE_TARGETS) {
                const linguee = targetLookupSites(id).find(site => site.id === 'linguee');
                if (linguee) expect(linguee.urlTemplate, id).not.toMatch(/english-[a-z]{2}\//);
            }
        });

        it('keeps Glosbe for Lao and Thai despite word-specific misses', () => {
            expect(siteIds('lo')).toContain('glosbe');
            expect(siteIds('th')).toContain('glosbe');
        });

        it('marks plaintext HTTP lookup links in Settings', () => {
            const vietnamese = renderDictionaryLookupLinkEditor(defaultDictionaryLookupLinks('local', 'vi'), [], 'vi');
            expect(vietnamese).toContain('data-lookup-link-transport');
            expect(vietnamese).toContain(uiText('en', 'plaintextHttpLink'));
            expect(uiText('ja', 'plaintextHttpLink')).toBe('プレーンテキストHTTPで開きます。');
        });

        it('uses Forvo language section ids rather than inert fragments', () => {
            for (const id of NON_JAPANESE_TARGETS) {
                const forvo = targetLookupSites(id).find(site => site.id === 'forvo');
                if (!forvo) continue;
                expect(forvo.urlTemplate, id).toMatch(/#language-[a-z-]+$/);
            }
        });

        it('uses the Tatoeba codes that were proven to filter', () => {
            // `khk` is not a Tatoeba code: it is ignored and the search runs across
            // every language, so a Mongolian pill would return Turkish rows.
            const tatoeba = (id: string) => targetLookupSites(id).find(site => site.id === 'tatoeba')?.urlTemplate;
            expect(tatoeba('mn')).toContain('from=mon');
            expect(tatoeba('fa')).toContain('from=pes');
            expect(tatoeba('zh')).toContain('from=cmn');
            expect(tatoeba('tl')).toContain('from=tgl');
            for (const id of NON_JAPANESE_TARGETS) {
                expect(tatoeba(id), id).toMatch(/from=[a-z]{3}&/);
            }
        });
    });

    describe('switching target', () => {
        it('reconciles a pre-target Japanese row at startup for every non-Japanese target', () => {
            const custom = {
                id: 'custom-mine',
                label: 'Mine',
                urlTemplate: 'https://example.com/{query}',
                enabled: true,
            };
            for (const target of NON_JAPANESE_TARGETS) {
                const normalized = normalizeDictionaryLookupLinkSettings({
                    // This is the exact upgrade shape: the profile target was
                    // persisted by a build whose global pill row was still JA.
                    dictionaryLookupLinks: [...defaultDictionaryLookupLinks('local', 'ja'), custom],
                }, target);
                const ids = normalized.map(link => link.id);

                expect(ids, target).toContain('custom-mine');
                expect(ids, target).toEqual(expect.arrayContaining(
                    defaultDictionaryLookupLinks('local', target).map(link => link.id),
                ));
                expect(ids, target).not.toEqual(expect.arrayContaining([
                    'jiten', 'jiten-frequency', 'jpdb', 'jpdb-frequency',
                    'bunpro', 'bunpro-frequency', 'jisho', 'weblio',
                    'kotobank', 'takoboto', 'wiktionary-ja', 'immersion-kit',
                    'nadeshiko', 'uchisen',
                ]));
            }
        });

        it('adopts the incoming target set and drops the outgoing one', () => {
            const spanish = dictionaryLookupLinksForTarget(defaultDictionaryLookupLinks('local', 'ja'), 'es');
            expect(spanish.map(link => link.id)).toContain('rae');
            expect(spanish.map(link => link.id)).not.toContain('jisho');
            expect(spanish.find(link => link.id === 'wiktionary-en')?.urlTemplate)
                .toBe('https://en.wiktionary.org/wiki/{query}#Spanish');
        });

        it('keeps a shared pill switched off and carries custom links across', () => {
            const french = defaultDictionaryLookupLinks('local', 'fr').map(link => (
                link.id === 'forvo' ? { ...link, enabled: false } : link
            ));
            const custom = { id: 'custom-mine', label: 'Mine', urlTemplate: 'https://example.com/{query}', enabled: true };
            const german = dictionaryLookupLinksForTarget([...french, custom], 'de');
            expect(german.find(link => link.id === 'forvo')?.enabled).toBe(false);
            expect(german.find(link => link.id === 'custom-mine')).toMatchObject({ urlTemplate: 'https://example.com/{query}' });
            expect(german.find(link => link.id === 'dwds')?.urlTemplate).toBe('https://www.dwds.de/wb/{query}');
            expect(german.map(link => link.id)).not.toContain('cnrtl');
        });

        it('keeps a disabled local-frequency pill and its priority across target switches', () => {
            const localFrequency = {
                id: 'frequency-local:BCCWJ',
                label: 'BCCWJ',
                urlTemplate: '',
                enabled: false,
                action: 'frequency-local' as const,
                priority: 3,
            };
            const spanish = dictionaryLookupLinksForTarget(
                [...defaultDictionaryLookupLinks('local', 'ja'), localFrequency],
                'es',
            );
            expect(spanish.find(link => link.id === localFrequency.id)).toMatchObject({
                enabled: false,
                action: 'frequency-local',
                priority: 3,
            });

            const japanese = dictionaryLookupLinksForTarget(spanish, 'ja');
            expect(japanese.find(link => link.id === localFrequency.id)).toMatchObject({
                enabled: false,
                action: 'frequency-local',
                priority: 3,
            });
        });

        it('returns Japanese unchanged when Japanese is the incoming target', () => {
            // `action` is filled in by the normalizer for every link that lacks
            // one, so compare the four fields the catalogue is responsible for.
            const shape = (link: { id: string; label: string; urlTemplate: string; enabled: boolean }) => ({
                id: link.id, label: link.label, urlTemplate: link.urlTemplate, enabled: link.enabled,
            });
            expect(dictionaryLookupLinksForTarget([], 'ja').map(shape))
                .toEqual(DEFAULT_DICTIONARY_LOOKUP_LINKS.map(shape));
        });
    });

    it('has no Burmese entry, because the roster has no Burmese target', () => {
        // A37.4 in backlog.md records the supply findings behind this: one
        // Tatoeba sentence, no en.wiktionary audio, and a 488-word Forvo hub.
        expect(ROSTER_IDS).not.toContain('my');
        expect(targetLookupSiteIds()).not.toContain('my');
    });
});
