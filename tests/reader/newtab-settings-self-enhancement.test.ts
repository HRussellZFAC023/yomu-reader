import { afterEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { canHoverLookupReaderWordElement, canLookupReaderWordElement } from '../../src/reader/app/dom-helpers';
import { NewTabRuntime } from '../../src/reader/newtab/runtime';
import { DEFAULT_SETTINGS as BASE_DEFAULT_SETTINGS } from '../../src/reader/settings';
import { localizeSettingsForm, renderSettingsForm } from '../../src/reader/settings/form';
import type { JPDBToken, ReaderSettings } from '../../src/reader/app/types';

const DEFAULT_SETTINGS: ReaderSettings = { ...BASE_DEFAULT_SETTINGS, interfaceLanguage: 'en' };

afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe('hosted newtab settings self enhancement', () => {
    it('parses Japanese settings chrome and search labels with the hosted runtime parser', async () => {
        const { runtime, form, parse, internals } = newTabSettingsJapaneseParserFixture({
            tokens: [
                { spelling: '検索', reading: 'けんさく', vid: 9753 },
                { spelling: '外観', reading: 'がいかん', vid: 9754 },
                { spelling: 'キャンセル', reading: 'キャンセル', vid: 9755 },
                { spelling: '保存', reading: 'ほぞん', vid: 9756 },
                { spelling: '学習', reading: 'がくしゅう', vid: 9757 },
                { spelling: '設定', reading: 'せってい', vid: 9758 },
            ],
        });

        try {
            await internals.parseSettingsJapanese(form);

            expect(parse).toHaveBeenCalledWith(
                expect.arrayContaining(['設定を検索']),
                expect.objectContaining({
                    allowJpdbTimeoutFallback: true,
                    allowSegmentedFallback: true,
                    includeLocalPitch: false,
                    requireJpdb: false,
                    skipJpdb: true,
                }),
            );
            const parsedTexts = parse.mock.calls[0]?.[0] ?? [];
            expect(parsedTexts).toEqual(expect.arrayContaining([
                '設定を検索',
                '外観',
                'キャンセル',
                '保存',
                '学習を開く',
                '設定JSONをインポート',
            ]));

            const parsedWord = form.querySelector<HTMLElement>('.jpdb-reader-settings-search .jpdb-reader-word[data-expression="検索"]');
            expect(parsedWord).toBeTruthy();
            expect(parsedWord?.dataset.jpdbReaderPassive).toBe('true');
            expect(parsedWord?.classList.contains('jpdb-reader-has-furi')).toBe(true);
            expect(parsedWord?.classList.contains('jpdb-pitch-heiban')).toBe(true);
            expect(parsedWord?.querySelector('.jpdb-reader-furi')?.textContent).toBe('けんさく');
            expect(form.querySelector<HTMLInputElement>('[data-settings-search]')).toBeTruthy();

            const appearanceTab = form.querySelector<HTMLElement>('.jpdb-reader-settings-tabs [data-panel="appearance"] .jpdb-reader-word[data-expression="外観"]');
            expect(appearanceTab).toBeTruthy();
            expect(appearanceTab?.closest('button[data-action="settings-panel"]')).toBeInstanceOf(HTMLButtonElement);
            expect(appearanceTab?.querySelector('.jpdb-reader-furi')?.textContent).toBe('がいかん');
            expect(appearanceTab?.classList.contains('jpdb-pitch-heiban')).toBe(true);
            expect(appearanceTab?.dataset.jpdbReaderPassive).toBe('true');
            expect(appearanceTab ? canHoverLookupReaderWordElement(appearanceTab, true) : false).toBe(true);
            expect(appearanceTab ? canLookupReaderWordElement(appearanceTab) : true).toBe(false);

            const cancelWord = form.querySelector<HTMLElement>('.footer [data-action="cancel"] .jpdb-reader-word[data-expression="キャンセル"]');
            expect(cancelWord).toBeTruthy();
            expect(cancelWord?.closest('button[data-action="cancel"]')).toBeInstanceOf(HTMLButtonElement);
            expect(cancelWord?.dataset.jpdbReaderPassive).toBe('true');
            expect(cancelWord ? canHoverLookupReaderWordElement(cancelWord, true) : false).toBe(true);
            expect(cancelWord ? canLookupReaderWordElement(cancelWord) : true).toBe(false);
            expect(cancelWord?.classList.contains('jpdb-pitch-heiban')).toBe(true);

            const saveWord = form.querySelector<HTMLElement>('.footer button[type="submit"] .jpdb-reader-word[data-expression="保存"]');
            expect(saveWord).toBeTruthy();
            expect(saveWord?.closest('button[type="submit"]')).toBeInstanceOf(HTMLButtonElement);
            expect(saveWord?.dataset.jpdbReaderPassive).toBe('true');
            expect(saveWord?.querySelector('.jpdb-reader-furi')?.textContent).toBe('ほぞん');
            expect(saveWord?.classList.contains('jpdb-pitch-heiban')).toBe(true);

            const openStudyWord = form.querySelector<HTMLElement>('[data-newtab-url-link] .jpdb-reader-word[data-expression="学習"]');
            expect(openStudyWord).toBeTruthy();
            expect(openStudyWord?.closest('.jpdb-reader-btn')).toBeInstanceOf(HTMLAnchorElement);
            expect(openStudyWord?.querySelector('.jpdb-reader-furi')?.textContent).toBe('がくしゅう');
            expect(openStudyWord?.dataset.jpdbReaderPassive).toBe('true');

            const importWord = form.querySelector<HTMLElement>('[data-action="import-yomitan-settings"] .jpdb-reader-word[data-expression="設定"]');
            expect(importWord).toBeTruthy();
            expect(importWord?.closest('.jpdb-reader-btn')).toBeInstanceOf(HTMLButtonElement);
            expect(importWord?.querySelector('.jpdb-reader-furi')?.textContent).toBe('せってい');
            expect(importWord?.dataset.jpdbReaderPassive).toBe('true');

            const cancelKanaOnlyWord = form.querySelector<HTMLElement>('.footer [data-action="cancel"] .jpdb-reader-word[data-expression="キャンセル"]');
            expect(cancelKanaOnlyWord?.querySelector('rt,.jpdb-reader-furi')).toBeNull();
        } finally {
            runtime.destroy();
        }
    });

    it('renders settings labels when equivalent text nodes refresh while parsing', async () => {
        const runtime = new NewTabRuntime();
        const settings = {
            ...DEFAULT_SETTINGS,
            interfaceLanguage: 'ja' as const,
            showFurigana: true,
            furiganaMode: 'all' as const,
            showPitchAccent: true,
        };
        const form = document.createElement('form');
        form.className = 'jpdb-reader-settings';
        form.dataset.jpdbReaderRoot = 'true';
        form.innerHTML = `
            <h2>よむ 設定</h2>
            <fieldset data-settings-panel="appearance">
                <label><span class="jpdb-reader-settings-label-text">設定の表示言語</span><select name="furiganaMode"><option value="all">すべて</option></select></label>
            </fieldset>
        `;
        document.body.append(form);
        const labelText = form.querySelector<HTMLElement>('.jpdb-reader-settings-label-text')!;
        const parse = vi.fn(async (texts: string[], parseOptions?: unknown): Promise<JPDBToken[][]> => {
            void parseOptions;
            labelText.replaceChildren(document.createTextNode('設定の表示言語'));
            return texts.map(text => settingsJapaneseTokenForText(text, {
                tokens: [{ spelling: '設定', reading: 'せってい', vid: 9820 }],
            }));
        });
        const internals = runtime as unknown as {
            settings: typeof settings;
            activeDialog?: HTMLElement;
            parser: { canParse: () => boolean; parse: typeof parse };
            parseSettingsJapanese(form: HTMLFormElement): Promise<void>;
            enrichPublicVocabularyWords(tokens: JPDBToken[]): Promise<void>;
            enrichPitchWords(tokens: JPDBToken[]): Promise<void>;
        };
        internals.settings = settings;
        internals.activeDialog = form;
        internals.parser = { canParse: () => true, parse };
        internals.enrichPublicVocabularyWords = vi.fn(async () => undefined);
        internals.enrichPitchWords = vi.fn(async () => undefined);

        try {
            await internals.parseSettingsJapanese(form);

            const labelWord = labelText.querySelector<HTMLElement>('.jpdb-reader-word[data-expression="設定"]');
            expect(labelWord).toBeTruthy();
            expect(labelWord?.querySelector('.jpdb-reader-furi')?.textContent).toBe('せってい');
            expect(labelWord?.classList.contains('jpdb-pitch-heiban')).toBe(true);
            expect(form.querySelector('option .jpdb-reader-word')).toBeNull();
        } finally {
            runtime.destroy();
        }
    });
});

function newTabSettingsJapaneseParserFixture(options: {
    tokens: Array<{ spelling: string; reading: string; vid: number }>;
    settings?: Partial<ReaderSettings>;
}) {
    const runtime = new NewTabRuntime();
    const settings = {
        ...DEFAULT_SETTINGS,
        interfaceLanguage: 'ja' as const,
        showFurigana: true,
        furiganaMode: 'all' as const,
        showPitchAccent: true,
        ...options.settings,
    };
    const form = document.createElement('form');
    form.className = 'jpdb-reader-settings';
    form.dataset.jpdbReaderRoot = 'true';
    form.innerHTML = renderSettingsForm(settings, 'https://jpdb.io/settings');
    localizeSettingsForm(form, 'ja');
    document.body.append(form);

    const parse = vi.fn(async (texts: string[], parseOptions?: unknown): Promise<JPDBToken[][]> => {
        void parseOptions;
        return texts.map(text => settingsJapaneseTokenForText(text, options));
    });
    const internals = runtime as unknown as {
        settings: typeof settings;
        activeDialog?: HTMLElement;
        parser: { canParse: () => boolean; parse: typeof parse };
        parseSettingsJapanese(form: HTMLFormElement): Promise<void>;
        enrichPublicVocabularyWords(tokens: JPDBToken[]): Promise<void>;
        enrichPitchWords(tokens: JPDBToken[]): Promise<void>;
    };
    internals.settings = settings;
    internals.activeDialog = form;
    internals.parser = {
        canParse: () => true,
        parse,
    };
    internals.enrichPublicVocabularyWords = vi.fn(async () => undefined);
    internals.enrichPitchWords = vi.fn(async () => undefined);
    return { runtime, form, parse, internals };
}

function settingsJapaneseTokenForText(
    text: string,
    options: { tokens: Array<{ spelling: string; reading: string; vid: number }> },
): JPDBToken[] {
    const found: JPDBToken[] = [];
    for (const token of options.tokens) {
        const start = text.indexOf(token.spelling);
        if (start < 0) continue;
        const end = start + token.spelling.length;
        found.push({
            card: {
                vid: token.vid,
                sid: 0,
                rid: 0,
                spelling: token.spelling,
                reading: token.reading,
                partOfSpeech: ['n'],
                meanings: [{ glosses: ['settings'], partOfSpeech: ['n'] }],
                frequencyRank: 650,
                cardState: ['not-in-deck'],
                pitchAccent: ['LHHH'],
                wordWithReading: null,
                source: 'jpdb',
            },
            start,
            end,
            length: token.spelling.length,
            rubies: [{ text: token.reading, start, end, length: token.spelling.length }],
            pitchClass: 'heiban',
            sentence: text,
        });
    }
    return found.sort((left, right) => left.start - right.start);
}
