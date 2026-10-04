import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    RECOMMENDED_JAPANESE_DICTIONARIES,
    catalogBrowseLanguageSectionsForLearnerLanguage,
    catalogRecommendedDictionaryId,
    recommendedDictionaryImportOptions,
} from '../../../src/reader/dictionaries/recommended';
import type { ImportSummary, YomitanDictionaryInfo } from '../../../src/reader/dictionaries/yomitan';
import { renderRecommendedDictionaries } from '../../../src/reader/settings/dictionary-recommendations-view';
import { importRecommendedDictionary, syncRecommendedDictionaryCards } from '../../../src/reader/settings/recommended-dictionary-card';
import {
    DEFAULT_SETTINGS,
    findRecommendedDictionary,
    localizeSettingsForm,
    recommendedDictionaryButton,
    recommendedDictionaryGuideOrNull,
    recommendedDictionaryHelp,
    registerSettingsFormCleanup,
    renderSettingsTestForm,
    settingsText,
} from './fixtures';

describe('recommended dictionary settings buttons', () => {
    registerSettingsFormCleanup();

    it('does not claim a recommended dictionary is installed from synced preferences alone', () => {
        const form = renderSettingsTestForm({
            ...DEFAULT_SETTINGS,
            dictionaryPreferences: [
                { name: 'Jitendex.org [2025-12-02]', alias: 'Jitendex', enabled: true, priority: 0, type: 'terms' },
                { name: 'Kanjium Pitch Accents', alias: 'Pitch', enabled: true, priority: 1, type: 'metadata' },
                { name: 'JPDB v2.2 Frequency Kana', alias: 'JPDB Frequency', enabled: true, priority: 1, type: 'frequency' },
            ],
        });

        expect(recommendedDictionaryButton(form, 'jitendex').textContent?.trim()).toBe('Install');
        expect(recommendedDictionaryButton(form, 'kanjium-pitch').textContent?.trim()).toBe('Install');
        expect(recommendedDictionaryGuideOrNull(form, 'kanjium-pitch')).toBeNull();
        expect(recommendedDictionaryButton(form, JPDB_KANA_SEED).textContent?.trim()).toBe('Install');
    });

    it('shows pitch dictionaries as their own recommended group before frequency dictionaries', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        // The mirrored-catalogue browse list below carries its own category
        // titles; this assertion is about the curated recommendations.
        const groupTitles = Array.from(
            form.querySelectorAll<HTMLElement>('.jpdb-reader-recommended-group-title:not([data-catalog-browse-category])'),
            title => title.textContent,
        );

        expect(groupTitles).toEqual(['Term dictionaries', 'Kanji dictionaries', 'Pitch dictionaries', 'Frequency dictionaries']);
        expect(settingsText(form, '[data-recommended-dictionary-help]')).toContain('Install a term dictionary first');
        expect(settingsText(form, '[data-recommended-dictionary-help]')).toContain('not normal definition text');
        expect(recommendedDictionaryHelp(form, 'kanjium-pitch')).toContain('Pitch accents only');
        expect(recommendedDictionaryHelp(form, 'jiten')).toContain('Frequency badges');
        expect(recommendedDictionaryButton(form, 'kanjium-pitch').textContent?.trim()).toBe('Install');
        expect(findRecommendedDictionary('kanjium-pitch')?.downloadUrl).toBe('https://raw.githubusercontent.com/FooSoft/yomichan/dictionaries/kanjium_pitch_accents.zip');
        expect(recommendedDictionaryButton(form, 'kanjium-pitch').compareDocumentPosition(recommendedDictionaryButton(form, 'jiten')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('localizes guide-only pitch help and clarifies frequency dictionaries are badges', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        localizeSettingsForm(form, 'ja');

        expect(settingsText(form, '[data-recommended-dictionary-help]')).toContain('通常の定義文は追加しません');
        expect(recommendedDictionaryHelp(form, 'kanjium-pitch')).toContain('ピッチアクセント専用');
        expect(recommendedDictionaryHelp(form, 'jiten')).toContain('頻度バッジ');
        // The backup panel's import line is a live status region now, not help copy.
        const importStatus = form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-backup [data-import-status]');
        expect(importStatus?.getAttribute('role')).toBe('status');
        expect(importStatus?.hidden).toBe(true);
    });

    it('does not treat Jitendex as the Jiten frequency dictionary', () => {
        const form = renderSettingsTestForm({
            ...DEFAULT_SETTINGS,
            dictionaryPreferences: [
                { name: 'Jitendex.org [2025-12-02]', alias: 'Jitendex', enabled: true, priority: 0, type: 'terms' },
            ],
        });

        expect(recommendedDictionaryButton(form, 'jitendex').textContent?.trim()).toBe('Install');
        expect(recommendedDictionaryButton(form, 'jiten').textContent?.trim()).toBe('Install');
    });
});

const JPDB_KANA_SEED = catalogRecommendedDictionaryId('en', 'ja', 'drive-japanese-ja-freq-jpdb-v2-2-frequency-kana-2024-10-13-p5yytox4s0');
const MIRROR = 'https://dictionaries.yomureader.com/objects/sha256/';

// Hosts without CORS (GitHub releases, api.jiten.moe) cannot be read by Study
// on its own, and a 51 MB archive does not fit through the Reader bridge.
describe('the hand-picked Japanese dictionary shelf', () => {
    it('leaves JMdict, JMnedict, KANJIDIC and JPDBv2㋕ to the seed above it', () => {
        expect(RECOMMENDED_JAPANESE_DICTIONARIES.map(dictionary => dictionary.id))
            .toEqual(['jitendex', 'wty-ja-ja', 'pixiv-light', 'jpdb-kanji', 'kanjium-pitch', 'jiten', 'bccwj']);
    });

    it('installs from the mirror with its digest, except the two upstream-only cards', () => {
        const upstream = RECOMMENDED_JAPANESE_DICTIONARIES.filter(dictionary => !dictionary.downloadUrl?.startsWith(MIRROR));
        expect(upstream.map(dictionary => dictionary.id)).toEqual(['wty-ja-ja', 'kanjium-pitch']);
        expect(upstream.map(dictionary => recommendedDictionaryImportOptions(dictionary))).toEqual([undefined, undefined]);
        for (const dictionary of RECOMMENDED_JAPANESE_DICTIONARIES.filter(item => !upstream.includes(item))) {
            expect(recommendedDictionaryImportOptions(dictionary)).toEqual({
                integrity: { sha256: expect.stringMatching(/^[0-9a-f]{64}$/u), bytes: dictionary.bytes },
            });
            expect(dictionary.downloadUrl).toBe(`${MIRROR}${dictionary.sha256}.zip`);
        }
        expect(findRecommendedDictionary('pixiv-light')?.bytes).toBe(51_170_783);
    });

    // The Kanjium card installs FooSoft's Yomichan repackaging of the Kanjium
    // data, which README used to say came "straight from" the Kanjium project.
    it('README and the privacy page say who serves each card that skips the mirror', () => {
        const servedBy: Record<string, RegExp> = {
            'wty-ja-ja': /WTY JA-JA comes from its project\b[^.]*Hugging Face/u,
            'kanjium-pitch': /Kanjium pitch accents from FooSoft's Yomichan repackaging/u,
            jitendex: /Jitendex and Jiten\b/u,
            jiten: /Jitendex and Jiten\b/u,
        };
        const skipsMirror = RECOMMENDED_JAPANESE_DICTIONARIES.filter(dictionary => dictionary.latestUrl || !dictionary.downloadUrl?.startsWith(MIRROR));
        expect(skipsMirror.map(dictionary => dictionary.id).sort()).toEqual(Object.keys(servedBy).sort());
        expect(findRecommendedDictionary('kanjium-pitch')?.downloadUrl).toMatch(/^https:\/\/raw\.githubusercontent\.com\/FooSoft\/yomichan\//u);
        for (const page of ['README.md', 'docs/privacy/index.md']) {
            const text = readFileSync(page, 'utf8');
            for (const [id, claim] of Object.entries(servedBy)) expect(text, `${page}: ${id}`).toMatch(claim);
        }
    });

    it('does not list the same archives again in the mirror browse below it', () => {
        const curated = new Set(RECOMMENDED_JAPANESE_DICTIONARIES.map(dictionary => dictionary.downloadUrl));
        for (const learnerLanguage of ['en', 'es'] as const) {
            const browsed = catalogBrowseLanguageSectionsForLearnerLanguage(learnerLanguage, 'ja')
                .flatMap(section => section.groups.flatMap(group => group.dictionaries));
            expect(browsed.length).toBeGreaterThan(0);
            expect(browsed.filter(dictionary => curated.has(dictionary.downloadUrl)).map(dictionary => dictionary.id)).toEqual([]);
        }
    });

    it('still counts a dictionary installed from a retired or upstream card as installed', () => {
        const installed = (title: string, downloadUrl: string): YomitanDictionaryInfo => ({ title, alias: title, enabled: true, priority: 0, downloadUrl });
        const host = document.createElement('div');
        // The titles are the archives' own index.json titles, as installed.
        host.innerHTML = renderRecommendedDictionaries([
            installed('Jitendex.org [2026-10-03]', 'https://github.com/stephenmk/stephenmk.github.io/releases/latest/download/jitendex-yomitan.zip'),
            installed('JMdict [2026-10-04]', 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMdict_english.zip'),
            installed('JMnedict [2026-10-04]', 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMnedict.zip'),
            installed('KANJIDIC [2026-277]', 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/KANJIDIC_english.zip'),
            installed('PixivLight [2023-11-24]', 'https://raw.githubusercontent.com/MarvNC/yomitan-dictionaries/master/dl/%5BMonolingual%5D%20PixivLight.zip'),
            installed('JPDBv2㋕', 'https://github.com/Kuuuube/yomitan-dictionaries/releases/download/yomitan-permalink/JPDB_v2.2_Frequency_Kana.zip'),
            installed('Jiten', 'https://api.jiten.moe/api/frequency-list/download?downloadType=yomitan'),
        ], 'en', false, 'ja');
        const button = (id: string) => host.querySelector<HTMLButtonElement>(`[data-dictionary-id="${id}"]`);

        for (const id of ['jmdict-en', 'jmnedict', 'kanjidic-en', 'drive-japanese-ja-freq-jpdb-v2-2-frequency-kana-2024-10-13-p5yytox4s0']) {
            expect(button(catalogRecommendedDictionaryId('en', 'ja', id))?.dataset.installed, id).toBe('true');
        }
        for (const id of ['jitendex', 'pixiv-light', 'jiten']) expect(button(id)?.dataset.installed, id).toBe('true');
        expect(button('bccwj')?.dataset.installed).toBe('false');
        expect(button(catalogRecommendedDictionaryId('en', 'ja', 'drive-japanese-pitch-nhk-lpvpeu-xlu'))?.dataset.installed).toBe('false');
    });
});

// Jitendex and Jiten publish newer builds than the mirror's copies, from hosts
// that send no CORS (GitHub releases, api.jiten.moe). 2.0.11's first cut pinned
// both cards to the mirror's July copies and called them "Update" over a newer
// install, so pressing Update replaced Jitendex 2026.10.03.0 with 2026.07.09.0.
describe('the newest Jitendex and Jiten a page can reach', () => {
    const JITENDEX_LATEST = 'https://github.com/stephenmk/stephenmk.github.io/releases/latest/download/jitendex-yomitan.zip';
    const JITEN_LATEST = 'https://api.jiten.moe/api/frequency-list/download?downloadType=yomitan';
    const BRIDGE_MARKERS = { yomuUserscriptHttpBridge: 'true', yomuHttpBridgeOwner: 'reader-under-test', yomuHttpBridgeKind: 'userscript' };
    const studyOnItsOwn = () => vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
    const studyWithReader = () => {
        studyOnItsOwn();
        Object.assign(document.documentElement.dataset, BRIDGE_MARKERS);
    };
    const installed = (title: string, revision?: string): YomitanDictionaryInfo => ({ title, alias: title, enabled: true, priority: 0, revision });
    const card = (id: string, installs: YomitanDictionaryInfo[], language: 'en' | 'ja' = 'en') => {
        const form = document.createElement('form');
        form.innerHTML = renderRecommendedDictionaries(installs, 'en', false, 'ja');
        syncRecommendedDictionaryCards(form, new Map(), language);
        return recommendedDictionaryButton(form, id);
    };
    const install = async (id: string) => {
        const importFromUrl = vi.fn(async (): Promise<ImportSummary> => ({ dictionaries: [], entries: 1, terms: 1, kanji: 0, termMeta: 0, kanjiMeta: 0 }));
        await importRecommendedDictionary({ importFromUrl }, findRecommendedDictionary(id)!, () => undefined);
        const [url, , , options] = importFromUrl.mock.calls[0] as unknown as [string, string, unknown, unknown];
        return { url, options };
    };

    afterEach(() => {
        for (const key of Object.keys(BRIDGE_MARKERS)) delete document.documentElement.dataset[key];
        vi.unstubAllGlobals();
    });

    it('records the revision of the mirror copy each card falls back to', () => {
        const catalog = JSON.parse(readFileSync('config/dictionaries/published/v1/catalog.json', 'utf8')) as {
            entries: Array<{ version: string; distribution: { object?: { sha256: string } } }>;
        };
        for (const id of ['jitendex', 'jiten']) {
            const dictionary = findRecommendedDictionary(id)!;
            const mirrored = catalog.entries.find(entry => entry.distribution.object?.sha256 === dictionary.sha256);
            expect(dictionary.revision, id).toBe(mirrored?.version);
        }
    });

    it('installs the mirror copy, checked by its digest, on Study without a Reader', async () => {
        studyOnItsOwn();
        for (const id of ['jitendex', 'jiten']) {
            const dictionary = findRecommendedDictionary(id)!;
            expect(await install(id)).toEqual({
                url: `${MIRROR}${dictionary.sha256}.zip`,
                options: { integrity: { sha256: dictionary.sha256, bytes: dictionary.bytes } },
            });
        }
    });

    it('installs the project\'s latest build where the Reader bridge can fetch it', async () => {
        studyWithReader();
        expect(await install('jitendex')).toEqual({ url: JITENDEX_LATEST, options: undefined });
        expect(await install('jiten')).toEqual({ url: JITEN_LATEST, options: undefined });
    });

    it('installs the latest build from an extension page, which holds host permission', async () => {
        vi.stubGlobal('location', new URL('chrome-extension://yomuextensionid/newtab/index.html'));
        expect(await install('jitendex')).toEqual({ url: JITENDEX_LATEST, options: undefined });
    });

    it('never offers the mirror copy over the same or a newer install', () => {
        studyOnItsOwn();
        for (const [id, installs] of [
            ['jitendex', [installed('Jitendex.org [2026-10-03]', '2026.10.03.0')]],
            ['jitendex', [installed('Jitendex.org [2026-07-09]', '2026.07.09.0')]],
            ['jiten', [installed('Jiten', 'Jiten 26-09-30')]],
        ] as const) {
            const button = card(id, [...installs]);
            expect(button.dataset.installed, id).toBe('true');
            expect(button.disabled, id).toBe(true);
            expect(button.textContent, id).toBe('Installed');
        }
        expect(card('jitendex', [installed('Jitendex.org [2026-10-03]', '2026.10.03.0')], 'ja').textContent).toBe('インストール済み');
    });

    it('updates an older install to the newest build the page can reach', async () => {
        studyOnItsOwn();
        const older = card('jitendex', [installed('Jitendex.org [2026-05-05]', '2026.05.05.0')]);
        expect([older.textContent, older.disabled]).toEqual(['Update', false]);
        // An install from before revisions were recorded is older than any mirror copy.
        expect(card('jiten', [installed('Jiten')]).textContent).toBe('Update');
        expect((await install('jitendex')).url).toBe(`${MIRROR}${findRecommendedDictionary('jitendex')!.sha256}.zip`);

        // With the Reader, Update fetches the project's latest build, which
        // nothing installed can be newer than.
        studyWithReader();
        const newer = card('jitendex', [installed('Jitendex.org [2026-10-03]', '2026.10.03.0')]);
        expect([newer.textContent, newer.disabled]).toEqual(['Update', false]);
        expect((await install('jitendex')).url).toBe(JITENDEX_LATEST);
    });
});

// The seed's JMdict card installs the mirror's July copy. Without a revision it
// read "Update" over 2.0.10's newer upstream install, and pressing it replaced
// JMdict [2026-10-04] with JMdict [2026-07-23]. A seed card carries a revision
// only where the catalogue's version orders like the archive's own.
describe('catalogue seed cards over an install of the same dictionary', () => {
    const installed = (title: string, revision: string): YomitanDictionaryInfo => ({ title, alias: title, enabled: true, priority: 0, revision });
    const seedButton = (dictionaryId: string, install: YomitanDictionaryInfo, targetLanguage: 'ja' | 'fr' = 'ja') => {
        const host = document.createElement('div');
        host.innerHTML = renderRecommendedDictionaries([install], 'en', false, targetLanguage);
        const id = catalogRecommendedDictionaryId('en', targetLanguage, dictionaryId);
        const button = host.querySelector<HTMLButtonElement>(`[data-dictionary-id="${id}"]`)!;
        return [button.textContent?.trim(), button.disabled];
    };

    it('never offers the mirror copy over the same or a newer upstream build', () => {
        expect(seedButton('jmdict-en', installed('JMdict [2026-10-04]', 'JMdict.2026-10-04'))).toEqual(['Installed', true]);
        expect(seedButton('jmdict-en', installed('JMdict [2026-07-23]', 'JMdict.2026-07-23'))).toEqual(['Installed', true]);
        expect(seedButton('jmnedict', installed('JMnedict [2026-10-04]', 'JMnedict.2026-10-04'))).toEqual(['Installed', true]);
    });

    it('updates an older build', () => {
        expect(seedButton('jmdict-en', installed('JMdict [2026-05-01]', 'JMdict.2026-05-01'))).toEqual(['Update', false]);
    });

    it('keeps offering Update where the catalogue version does not order like the archive revision', () => {
        // KANJIDIC numbers the days of a year, and WTY's catalogue version is a
        // dataset commit whose digits would outrank every dated revision.
        expect(findRecommendedDictionary(catalogRecommendedDictionaryId('en', 'ja', 'kanjidic-en'))?.revision).toBeUndefined();
        expect(seedButton('kanjidic-en', installed('KANJIDIC [2026-204]', 'kanjidic2.2026-204'))).toEqual(['Update', false]);
        expect(seedButton('kanjidic-en', installed('KANJIDIC [2026-277]', 'kanjidic2.2026-277'))).toEqual(['Update', false]);
        expect(seedButton('wty-fr-en', installed('wty-fr-en', '2026.03.05'), 'fr')).toEqual(['Update', false]);
    });
});
