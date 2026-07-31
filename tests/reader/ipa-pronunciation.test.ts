import { afterEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { uiText } from '../../src/reader/app/i18n';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import { CardPopoverRenderer } from '../../src/reader/cards/popover-renderer';
import { YomitanDictionaryStore, type YomitanMetaEntry } from '../../src/reader/dictionaries/yomitan';
import { extractIpaPronunciations } from '../../src/reader/lookup/ipa-pronunciation';
import { renderPitch } from '../../src/reader/popup/pitch';
import { renderPronunciation } from '../../src/reader/popup/pronunciation';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { renderWordPills } from '../../src/reader/sources/word-pills';
import { yomitanZipBlob } from './zip-fixture';

const activeStores: YomitanDictionaryStore[] = [];

const spanishCard: JPDBCard = {
    vid: 0,
    sid: 0,
    rid: 0,
    spelling: 'gratis',
    reading: 'gratis',
    language: 'es',
    frequencyRank: null,
    partOfSpeech: [],
    meanings: [],
    cardState: ['not-in-deck'],
    pitchAccent: [],
    wordWithReading: null,
    source: 'local',
};

const realShapedIpaData = {
    reading: 'gratis',
    transcriptions: [
        { ipa: '/ˈɡɾatis/' },
        { ipa: '[ˈɡɾa.t̪is]' },
    ],
};

describe('international IPA metadata', () => {
    afterEach(async () => {
        document.body.replaceChildren();
        for (const store of activeStores.splice(0).reverse()) {
            await store.deleteDatabase({ timeoutMs: 2000 }).catch(() => undefined);
        }
    });

    it('extracts real Yomitan IPA payloads only for the matching expression and reading', () => {
        const entries: YomitanMetaEntry[] = [
            { expression: 'GRATIS', mode: 'ipa', data: realShapedIpaData, dictionary: 'Spanish IPA' },
            { expression: 'gratis', mode: 'ipa', data: { ...realShapedIpaData, transcriptions: [{ ipa: '/ˈɡɾatis/' }] }, dictionary: 'Duplicate IPA' },
            { expression: 'gratis', mode: 'ipa', data: { ...realShapedIpaData, reading: 'gratís' }, dictionary: 'Wrong reading' },
            { expression: 'pies', mode: 'ipa', data: { reading: 'pies', transcriptions: [{ ipa: '[ˈpjes]' }] }, dictionary: 'Wrong expression' },
            { expression: 'gratis', mode: 'pitch', data: realShapedIpaData, dictionary: 'Japanese pitch' },
        ];

        expect(extractIpaPronunciations(entries, { expression: 'gratis', reading: 'gratis' })).toEqual([
            { ipa: '/ˈɡɾatis/', dictionary: 'Spanish IPA' },
            { ipa: '[ˈɡɾa.t̪is]', dictionary: 'Spanish IPA' },
        ]);
    });

    it('renders visible, accessible IPA pronunciation and respects disabled dictionary preferences', () => {
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: false,
            dictionaryLookupLinks: [],
            dictionaryPreferences: [{
                name: 'Spanish IPA',
                alias: 'Pronunciación',
                enabled: true,
                priority: 0,
                type: 'pronunciation',
            }],
        };
        const metaEntries: YomitanMetaEntry[] = [
            { expression: 'gratis', mode: 'ipa', data: realShapedIpaData, dictionary: 'Spanish IPA' },
        ];

        document.body.innerHTML = renderPronunciation({
            card: spanishCard,
            settings,
            metaEntries,
            dictionaryLabel: name => name === 'Spanish IPA' ? 'Pronunciación' : name,
        });

        const variants = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-pronunciation-variant'));
        expect(variants.map(variant => variant.textContent)).toEqual(['IPA /ˈɡɾatis/', 'IPA [ˈɡɾa.t̪is]']);
        expect(variants[0]?.getAttribute('data-pronunciation-source')).toBe('local');
        expect(variants[0]?.getAttribute('aria-label')).toBe('IPA /ˈɡɾatis/. Pronunciación');

        expect(renderPronunciation({
            card: spanishCard,
            settings: {
                ...settings,
                dictionaryPreferences: settings.dictionaryPreferences.map(preference => ({ ...preference, enabled: false })),
            },
            metaEntries,
            dictionaryLabel: name => name,
        })).toBe('');

        expect(renderWordPills({
            card: spanishCard,
            jpdbUrl: '',
            settings,
            metaEntries,
            isJpdbBackedCard: () => false,
            dictionaryLabel: name => name,
        })).toBe('');
    });

    it('renders Spanish IPA as pronunciation without a Japanese pitch status row', () => {
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            interfaceLanguage: 'en',
            ankiEnabled: false,
            dictionaryLookupLinks: [],
            dictionaryPreferences: [{
                name: 'Spanish IPA',
                alias: 'Pronunciación',
                enabled: true,
                priority: 0,
                type: 'pronunciation',
            }],
        };
        const metaEntries: YomitanMetaEntry[] = [
            { expression: 'gratis', mode: 'ipa', data: realShapedIpaData, dictionary: 'Spanish IPA' },
        ];
        const renderer = new CardPopoverRenderer({
            getSettings: () => settings,
            isJpdbBackedCard: () => false,
            renderWordHistory: () => '',
            renderWordPills: (card, jpdbUrl, entries) => renderWordPills({
                card,
                jpdbUrl,
                settings,
                metaEntries: entries,
                isJpdbBackedCard: () => false,
                dictionaryLabel: name => name === 'Spanish IPA' ? 'Pronunciación' : name,
            }),
            renderDefinitionSources: () => '',
            dictionarySourceAttributes: () => '',
            dictionaryLabel: name => name,
        });

        document.body.innerHTML = renderer.render(spanishCard, 'Es gratis.', 'modal', {
            localEntries: [],
            kanjiEntries: [],
            metaEntries,
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            loading: false,
        });

        const pronunciation = document.querySelector<HTMLElement>('[data-pronunciation-kind="ipa"]');
        expect(pronunciation).not.toBeNull();
        expect(pronunciation!.textContent).toContain('/ˈɡɾatis/');
        expect(pronunciation!.textContent).toContain('[ˈɡɾa.t̪is]');
        expect(document.querySelector('[data-pitch-status]')).toBeNull();
        expect(document.body.textContent).not.toContain('Exact pitch unavailable');
    });

    it('keeps Japanese pitch metadata on the existing pitch path', () => {
        const japaneseCard: JPDBCard = {
            ...spanishCard,
            spelling: '読む',
            reading: 'よむ',
            language: 'ja',
        };
        const pitchMeta: YomitanMetaEntry[] = [{
            expression: '読む',
            mode: 'pitch',
            data: { reading: 'よむ', pitches: [{ position: 0 }] },
            dictionary: 'Japanese pitch',
        }];

        expect(extractIpaPronunciations(pitchMeta, { expression: '読む', reading: 'よむ' })).toEqual([]);
        expect(renderPitch(japaneseCard, pitchMeta)).toContain('jpdb-reader-pitch');
        expect(renderPronunciation({
            card: japaneseCard,
            settings: DEFAULT_SETTINGS,
            metaEntries: pitchMeta,
            dictionaryLabel: name => name,
        })).toContain('data-pronunciation-kind="pitch-accent"');
    });

    it('classifies and preserves IPA metadata imported from a real-shaped ZIP archive', async () => {
        const store = createStore();
        await store.clear();

        const summary = await store.importFile(new File([yomitanZipBlob({
            'index.json': { title: 'Spanish Wiktionary IPA', format: 3 },
            'term_meta_bank_1.json': [['gratis', 'ipa', realShapedIpaData]],
        })], 'wty-es-en-ipa.zip', { type: 'application/zip' }));

        expect(summary).toMatchObject({
            dictionaryTypes: { 'Spanish Wiktionary IPA': 'pronunciation' },
            termMeta: 1,
            entries: 1,
        });
        expect(await store.lookupTermMeta('gratis', 5)).toMatchObject([{
            expression: 'gratis',
            mode: 'ipa',
            data: realShapedIpaData,
            dictionary: 'Spanish Wiktionary IPA',
        }]);
        expect((await store.summary()).dictionaries).toMatchObject([{
            title: 'Spanish Wiktionary IPA',
            type: 'pronunciation',
        }]);

        const pitchSummary = await store.importFile(new File([yomitanZipBlob({
            'index.json': { title: 'Japanese pitch', format: 3 },
            'term_meta_bank_1.json': [['読む', 'pitch', { reading: 'よむ', pitches: [{ position: 0 }] }]],
        })], 'japanese-pitch.zip', { type: 'application/zip' }));
        expect(pitchSummary.dictionaryTypes).toEqual({ 'Japanese pitch': 'frequency' });

        const mixedSummary = await store.importFile(new File([yomitanZipBlob({
            'index.json': { title: 'Mixed metadata', format: 3 },
            'term_meta_bank_1.json': [
                ['gratis', 'ipa', realShapedIpaData],
                ['gratis', 'freq', { frequency: 100 }],
            ],
        })], 'mixed-metadata.zip', { type: 'application/zip' }));
        expect(mixedSummary.dictionaryTypes).toEqual({ 'Mixed metadata': 'frequency' });
    });

    it('classifies and preserves IPA metadata through Dexie and reader JSON imports', async () => {
        const store = createStore();
        await store.clear();
        const dexieSummary = await store.importFile(new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [
                    {
                        tableName: 'dictionaries',
                        rows: [{ $: [1, {
                            title: 'Dexie Spanish IPA',
                            alias: 'Dexie Spanish IPA',
                            enabled: true,
                            priority: 0,
                            type: 'frequency',
                        }] }],
                    },
                    {
                        tableName: 'termMeta',
                        rows: [{ $: [1, {
                            expression: 'gratis',
                            mode: 'ipa',
                            data: realShapedIpaData,
                            dictionary: 'Dexie Spanish IPA',
                        }] }],
                    },
                ],
            },
        })], 'ipa-dexie.json', { type: 'application/json' }));

        expect(dexieSummary.dictionaryTypes).toEqual({ 'Dexie Spanish IPA': 'pronunciation' });
        expect(await store.lookupTermMeta('gratis', 5)).toMatchObject([{
            mode: 'ipa',
            data: realShapedIpaData,
        }]);

        await store.clear();
        const readerSummary = await store.importFile(new File([JSON.stringify({
            formatName: 'yomu-yomitan-dictionaries',
            dictionaries: [{
                title: 'Reader Spanish IPA',
                alias: 'Reader Spanish IPA',
                enabled: true,
                priority: 0,
                type: 'frequency',
            }],
            termMeta: [{
                expression: 'gratis',
                mode: 'ipa',
                data: realShapedIpaData,
                dictionary: 'Reader Spanish IPA',
            }],
        })], 'ipa-reader.json', { type: 'application/json' }));

        expect(readerSummary.dictionaryTypes).toEqual({ 'Reader Spanish IPA': 'pronunciation' });
        expect((await store.summary()).dictionaries).toMatchObject([{
            title: 'Reader Spanish IPA',
            type: 'pronunciation',
        }]);
        expect(await store.lookupTermMeta('gratis', 5)).toMatchObject([{
            mode: 'ipa',
            data: realShapedIpaData,
        }]);
    });

    it('provides distinct English and Japanese pronunciation dictionary copy', () => {
        expect(uiText('en', 'pronunciationDictionaries')).toBe('Pronunciation dictionaries');
        expect(uiText('ja', 'pronunciationDictionaries')).toBe('発音辞書');
        expect(uiText('en', 'dictionaryImportHelp')).toContain('pronunciation (IPA), Japanese pitch');
        expect(uiText('ja', 'dictionaryInstallQueueHelp')).toContain('発音（IPA）/日本語ピッチ');
        expect(uiText('en', 'mirroredDictionaryLanguageNote')).toBe('Dictionaries for reading {language}.');
        expect(uiText('ja', 'mirroredDictionaryLanguageNote')).toBe('{language}を読むための辞書です。');
    });
});

function createStore(): YomitanDictionaryStore {
    const store = new YomitanDictionaryStore();
    activeStores.push(store);
    return store;
}
