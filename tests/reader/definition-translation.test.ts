import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WANIKANI_DEFINITION_SOURCE_ID } from '../../src/reader/app/constants';
import type { JPDBCard } from '../../src/reader/app/types';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { renderKanjiDefinitions } from '../../src/reader/sources/definition-render';
import {
    dictionaryDefinitionLanguage,
    installDefinitionTranslationBehaviors,
} from '../../src/reader/sources/definition-translation';
import { resetGoogleTranslationCacheForTests } from '../../src/reader/translation/google';
import type { WanikaniLookupInfo } from '../../src/reader/wanikani/wanikani-lookup';
import {
    renderWanikaniDefinitionMount,
    renderWanikaniSource,
    WanikaniSourceController,
} from '../../src/reader/wanikani/wanikani-source';

function koreanSettings(providerIds: string[]) {
    return {
        ...DEFAULT_SETTINGS,
        languageProfiles: [{
            ...DEFAULT_SETTINGS.languageProfiles[0]!,
            outputLanguage: 'ko',
            definitionTranslationProviderIds: providerIds,
        }],
    };
}

function translatedResponse(value = '번역됨'): Promise<Response> {
    return Promise.resolve(new Response(JSON.stringify({
        sentences: [{ trans: value }],
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    }));
}

interface FetchMockCalls {
    mock: {
        calls: ReadonlyArray<ReadonlyArray<unknown>>;
    };
}

function translationRequestUrl(fetchMock: FetchMockCalls): URL {
    const requestUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
    return new URL(requestUrl);
}

function translationRequestText(fetchMock: FetchMockCalls): string {
    return translationRequestUrl(fetchMock).searchParams.get('q') ?? '';
}

describe('definition translation enhancement', () => {
    beforeEach(() => {
        resetGoogleTranslationCacheForTests();
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
    });

    it('infers common Japanese dictionary definition languages', () => {
        expect(dictionaryDefinitionLanguage('[JA-EN] jitendex-yomitan')).toBe('en');
        expect(dictionaryDefinitionLanguage('[JA-JA] 大辞泉')).toBe('ja');
        expect(dictionaryDefinitionLanguage('[JA-DE] Wörterbuch')).toBe('de');
        expect(dictionaryDefinitionLanguage('KANJIDIC_english')).toBe('en');
        expect(dictionaryDefinitionLanguage('JMdict (en)')).toBe('en');
        expect(dictionaryDefinitionLanguage('JMdict (fr)')).toBe('fr');
        expect(dictionaryDefinitionLanguage('KANJIDIC (pt)')).toBe('pt');
        expect(dictionaryDefinitionLanguage('JMnedict (en)')).toBe('en');
        expect(dictionaryDefinitionLanguage('My private vocabulary notes')).toBe('auto');
        for (const [archive, language] of Object.entries({
            'JMdict_dutch.zip': 'nl',
            'JMdict_english.zip': 'en',
            'JMdict_french.zip': 'fr',
            'JMdict_german.zip': 'de',
            'JMdict_hungarian.zip': 'hu',
            'JMdict_russian.zip': 'ru',
            'JMdict_spanish.zip': 'es',
            'JMdict_swedish.zip': 'sv',
            'JMnedict.zip': 'en',
            'KANJIDIC_english.zip': 'en',
            'KANJIDIC_french.zip': 'fr',
            'KANJIDIC_portuguese.zip': 'pt',
            'KANJIDIC_spanish.zip': 'es',
        })) {
            expect(dictionaryDefinitionLanguage(archive)).toBe(language);
        }
    });

    it('keeps translation default-off', async () => {
        document.body.innerHTML = `<div id="root"><details class="jpdb-reader-source-card" data-source="jiten" open>
            <summary>Jiten</summary><div class="jpdb-reader-meanings" data-definition-translation-text>to read</div>
        </details></div>`;
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await installDefinitionTranslationBehaviors(document.querySelector('#root')!, koreanSettings([]));
        expect(fetchMock).not.toHaveBeenCalled();
        expect(document.querySelector('[data-definition-translation]')).toBeNull();
    });

    it('renders the selected provider translation first with expandable original', async () => {
        document.body.innerHTML = `<div id="root"><details class="jpdb-reader-source-card" data-source="jiten" open>
            <summary>Jiten</summary><div class="jpdb-reader-meanings" data-definition-translation-text>to read</div>
        </details></div>`;
        vi.stubGlobal('fetch', vi.fn(() => translatedResponse('읽다')));

        await installDefinitionTranslationBehaviors(document.querySelector('#root')!, koreanSettings(['__jiten__']));

        const source = document.querySelector<HTMLDetailsElement>('[data-source="jiten"]')!;
        expect(source.children[1]?.matches('[data-definition-translation="__jiten__"]')).toBe(true);
        expect(source.querySelector('[data-definition-translation]')?.textContent).toBe('읽다');
        expect(source.querySelector('.jpdb-reader-definition-original')?.hasAttribute('open')).toBe(false);
        expect(source.querySelector('.jpdb-reader-definition-original-body')?.textContent).toContain('to read');
        expect(source.querySelector<HTMLElement>('[data-definition-translation-text]')?.dataset.definitionTranslationState).toBe('ready');
    });

    it('does not translate a definition already native to the learner', async () => {
        document.body.innerHTML = `<div id="root"><details class="jpdb-reader-source-card" data-source="local-dictionary" data-dictionary="[JA-KO] Test">
            <summary>Test</summary><div data-definition-translation-text>읽다</div>
        </details></div>`;
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await installDefinitionTranslationBehaviors(
            document.querySelector('#root')!,
            koreanSettings(['[JA-KO] Test']),
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('treats canonical Tagalog and Serbo-Croatian profile tags as their native catalogue languages', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        for (const [dictionary, outputLanguage] of [
            ['[JA-TL] Test', 'fil'],
            ['[JA-SH] Test', 'sr-Latn'],
        ] as const) {
            document.body.innerHTML = `<div id="root"><details class="jpdb-reader-source-card" data-source="local-dictionary" data-dictionary="${dictionary}">
                <summary>Test</summary><div data-definition-translation-text>native definition</div>
            </details></div>`;
            await installDefinitionTranslationBehaviors(
                document.querySelector('#root')!,
                {
                    ...DEFAULT_SETTINGS,
                    languageProfiles: [{
                        ...DEFAULT_SETTINGS.languageProfiles[0]!,
                        outputLanguage,
                        definitionTranslationProviderIds: [dictionary],
                    }],
                },
            );
        }

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sends only explicitly public WaniKani glosses and leaves private UI outside the collapsed original', async () => {
        const settings = {
            ...koreanSettings([WANIKANI_DEFINITION_SOURCE_ID]),
            wanikaniApiToken: 'private-token',
        };
        document.body.innerHTML = `<div id="root">${renderWanikaniSource(
            wanikaniLookupInfo(),
            settings,
            'open',
        )}</div>`;
        const fetchMock = vi.fn(() => translatedResponse());
        vi.stubGlobal('fetch', fetchMock);

        await installDefinitionTranslationBehaviors(document.querySelector('#root')!, settings);

        expect(translationRequestText(fetchMock)).toBe([
            'Public Japan gloss',
            'Public Nippon gloss',
            'Public blocked gloss',
        ].join('\n'));
        for (const privateText of [
            'PRIVATE_READING',
            'PRIVATE_SYNONYM',
            'PRIVATE_MEANING_NOTE',
            'PRIVATE_READING_NOTE',
            'PRIVATE_MNEMONIC',
            'PRIVATE_EXAMPLE',
            'PRIVATE_COMPONENT',
            'PRIVATE_AUDIO',
        ]) {
            expect(translationRequestText(fetchMock)).not.toContain(privateText);
        }
        expect(translationRequestText(fetchMock)).not.toMatch(/Level|guru|correct|due|Meanings|primary|accepted/i);

        const source = document.querySelector<HTMLElement>('[data-source="wanikani"]')!;
        const audio = source.querySelector<HTMLElement>('[data-action="wanikani-audio"]')!;
        const link = source.querySelector<HTMLAnchorElement>('a[target="_blank"]')!;
        expect(audio.closest('.jpdb-reader-definition-original')).toBeNull();
        expect(link.closest('.jpdb-reader-definition-original')).toBeNull();
        expect(source.querySelector('.jpdb-reader-meta')?.closest('.jpdb-reader-definition-original')).toBeNull();
        expect(source.textContent).toContain('PRIVATE_SYNONYM');
        expect(source.textContent).toContain('PRIVATE_MEANING_NOTE');
        expect(source.textContent).toContain('PRIVATE_EXAMPLE');
        expect(source.querySelector('[data-definition-translation]')?.textContent).toBe('번역됨');
    });

    it('translates WaniKani only after the final public meanings have loaded', async () => {
        let finishLookup: (info: WanikaniLookupInfo) => void = () => undefined;
        const pendingLookup = new Promise<WanikaniLookupInfo>(resolve => {
            finishLookup = resolve;
        });
        const lookup = {
            lookupCard: vi.fn(() => pendingLookup),
            lookupKanji: vi.fn(() => Promise.resolve(null)),
        } as unknown as ConstructorParameters<typeof WanikaniSourceController>[0];
        const settings = {
            ...koreanSettings([WANIKANI_DEFINITION_SOURCE_ID]),
            wanikaniDefinitionsEnabled: true,
            wanikaniApiToken: 'private-token',
        };
        const card = wanikaniCard();
        document.body.innerHTML = `<div id="root">${renderWanikaniDefinitionMount(card, settings, () => 'open')}</div>`;
        const root = document.querySelector<HTMLElement>('#root')!;
        const fetchMock = vi.fn(() => translatedResponse());
        vi.stubGlobal('fetch', fetchMock);
        const onRendered = vi.fn((mount: HTMLElement) => {
            void installDefinitionTranslationBehaviors(mount, settings);
        });
        const controller = new WanikaniSourceController(lookup, () => settings, () => 'open', onRendered);

        await installDefinitionTranslationBehaviors(root, settings);
        expect(root.textContent).toContain('Loading WaniKani');
        expect(fetchMock).not.toHaveBeenCalled();

        controller.installDefinitionMounts(root, card);
        finishLookup(wanikaniLookupInfo());

        await vi.waitFor(() => expect(onRendered).toHaveBeenCalledTimes(1));
        await vi.waitFor(() => expect(root.querySelector('[data-definition-translation]')?.textContent).toBe('번역됨'));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(translationRequestText(fetchMock)).toContain('Public Japan gloss');
        expect(translationRequestText(fetchMock)).not.toContain('Loading WaniKani');
    });

    it('translates kanji meanings with each dictionary source identity while keeping readings visible', async () => {
        const dictionary = 'KANJIDIC_english.zip';
        document.body.innerHTML = `<div id="root">${renderKanjiDefinitions([{
            character: '日',
            onyomi: ['ニチ'],
            kunyomi: ['ひ'],
            tags: [],
            meanings: ['sun', 'day'],
            dictionary,
        }], () => 'open', name => name)}</div>`;
        const root = document.querySelector<HTMLElement>('#root')!;
        const fetchMock = vi.fn(() => translatedResponse('태양, 날'));
        vi.stubGlobal('fetch', fetchMock);

        await installDefinitionTranslationBehaviors(root, koreanSettings([dictionary]));

        expect(translationRequestText(fetchMock)).toBe('sun\nday');
        const requestUrl = translationRequestUrl(fetchMock);
        expect(requestUrl.searchParams.get('sl')).toBe('en');
        expect(root.querySelector('[data-definition-translation]')?.getAttribute('data-definition-translation')).toBe(dictionary);
        const readings = root.querySelector<HTMLElement>('.jpdb-reader-kanji-readings')!;
        expect(readings.textContent).toContain('ニチ');
        expect(readings.textContent).toContain('ひ');
        expect(readings.closest('.jpdb-reader-definition-original')).toBeNull();
        expect(root.querySelector('.jpdb-reader-kanji-char')?.textContent).toBe('日');
    });
});

function wanikaniCard(): JPDBCard {
    return {
        vid: 1,
        sid: 2,
        rid: 3,
        spelling: '日本',
        reading: 'にほん',
        frequencyRank: null,
        partOfSpeech: ['noun'],
        meanings: [{ glosses: ['Japan'], partOfSpeech: ['noun'] }],
        cardState: ['due'],
        pitchAccent: [],
        wordWithReading: '日本【にほん】',
        source: 'wanikani',
    };
}

function wanikaniLookupInfo(): WanikaniLookupInfo {
    return {
        subject: {
            id: 440,
            type: 'vocabulary',
            level: 5,
            slug: 'private-link-slug',
            characters: '日本',
            documentUrl: 'https://www.wanikani.com/vocabulary/private-link',
            meanings: [{ meaning: 'Public Japan gloss', primary: true, acceptedAsCorrect: true }],
            auxiliaryMeanings: [
                { meaning: 'Public Nippon gloss', type: 'whitelist' },
                { meaning: 'Public blocked gloss', type: 'blacklist' },
            ],
            readings: [{ reading: 'PRIVATE_READING', primary: true, acceptedAsCorrect: true }],
            meaningMnemonic: 'PRIVATE_MNEMONIC',
            readingMnemonic: 'PRIVATE_READING_MNEMONIC',
            componentSubjectIds: [1],
            amalgamationSubjectIds: [],
            visuallySimilarSubjectIds: [],
            contextSentences: [{ ja: '秘密の例', en: 'PRIVATE_EXAMPLE' }],
            audio: [{
                url: 'https://files.wanikani.com/private-audio.mp3',
                contentType: 'audio/mpeg',
                voiceActorName: 'PRIVATE_AUDIO',
            }],
            hiddenAt: null,
        },
        assignment: {
            id: 99,
            srsStage: 6,
            availableAt: '2026-07-21T10:00:00.000Z',
            burnedAt: null,
            unlockedAt: '2026-07-20T09:00:00.000Z',
        },
        studyMaterial: {
            meaningNote: 'PRIVATE_MEANING_NOTE',
            readingNote: 'PRIVATE_READING_NOTE',
            meaningSynonyms: ['PRIVATE_SYNONYM'],
        },
        reviewStatistic: {
            meaningCorrect: 9,
            meaningIncorrect: 1,
            readingCorrect: 8,
            readingIncorrect: 2,
            percentageCorrect: 85,
        },
        components: [{
            id: 1,
            type: 'radical',
            level: 1,
            slug: 'private-component',
            characters: null,
            documentUrl: 'https://www.wanikani.com/radicals/private-component',
            meanings: [{ meaning: 'PRIVATE_COMPONENT', primary: true, acceptedAsCorrect: true }],
            auxiliaryMeanings: [],
            readings: [],
            meaningMnemonic: '',
            componentSubjectIds: [],
            amalgamationSubjectIds: [],
            visuallySimilarSubjectIds: [],
            contextSentences: [],
            audio: [],
            hiddenAt: null,
        }],
        visuallySimilar: [],
        relatedVocabulary: [],
    };
}
