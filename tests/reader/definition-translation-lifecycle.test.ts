import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReaderSettings } from '../../src/reader/app/types';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../../src/reader/settings';
import { localizeSettingsForm, readFormSettings, renderSettingsForm } from '../../src/reader/settings/form';
import { publishSettingsChange } from '../../src/reader/settings/settings-change-bus';
import { renderJpdbDefinitionSource } from '../../src/reader/sources/definition-render';
import { renderLocalDefinitionSourcesSection } from '../../src/reader/sources/definition-render';
import { installDefinitionTranslationBehaviors } from '../../src/reader/sources/definition-translation';
import { resetGoogleTranslationCacheForTests } from '../../src/reader/translation/google';
import { card, emptyCardRenderData, testCardPopoverRenderer } from './jpdb/fixtures';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';
import { setInnerHtml } from '../../src/reader/dom';
import { renderNewTabKanjiInfoSection } from '../../src/reader/newtab/kanji-render';
import { allowSyntheticReaderInteractionsForTests } from '../../src/reader/ui/trusted-interaction';

function settings(ids = ['__jpdb__'], outputLanguage = 'ko'): ReaderSettings {
    return { ...DEFAULT_SETTINGS, interfaceLanguage: 'en', languageProfiles: DEFAULT_SETTINGS.languageProfiles.map(profile => ({ ...profile, outputLanguage, definitionTranslationProviderIds: ids })) };
}

function popup(): HTMLElement {
    setInnerHtml(document.body, `<div id="root">${renderJpdbDefinitionSource({ ...card, spelling: '読む', reading: 'よむ', meanings: [{ glosses: ['to read'], partOfSpeech: ['verb'] }] }, () => 'open')}</div>`);
    return document.querySelector<HTMLElement>('#root')!;
}

function response(text: string): Response {
    return new Response(JSON.stringify({ sentences: [{ trans: text }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function retryButton(root: ParentNode): HTMLButtonElement {
    const button = root.querySelector<HTMLButtonElement>('[data-definition-translation-retry]');
    if (!button) throw new Error('Failed translation has no retry action.');
    return button;
}

describe('opt-in dictionary translation lifecycle (fixture provider responses)', () => {
    beforeEach(() => {
        resetGoogleTranslationCacheForTests();
        installGmStorageFixture();
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
    });

    it('sends English definitions to Korean and never translates generated output again', async () => {
        const root = popup();
        const fetch = vi.fn(async (_input: unknown) => response('읽다'));
        vi.stubGlobal('fetch', fetch);
        await installDefinitionTranslationBehaviors(root, settings());
        await installDefinitionTranslationBehaviors(root, settings());
        expect(fetch).toHaveBeenCalledTimes(1);
        const url = new URL(String(fetch.mock.calls.flat()[0]));
        expect(Object.fromEntries(['sl', 'tl', 'q'].map(key => [key, url.searchParams.get(key)]))).toEqual({ sl: 'en', tl: 'ko', q: 'to read' });
        expect(root.querySelector('[data-source="jpdb"] > summary')?.textContent).toBe('JPDB');
        expect(root.querySelector('[lang="ko"]')?.textContent).toBe('읽다');
        expect(root.querySelector('.jpdb-reader-definition-original')?.textContent).toContain('to read');
    });

    it('translates Japanese monolingual glossary to English without changing the headword or reading', async () => {
        const dictionary = '[JA-JA] 大辞泉';
        setInnerHtml(document.body, renderLocalDefinitionSourcesSection([dictionary], new Map([[dictionary, [{ dictionary, expression: '読む', reading: 'よむ', definitionTags: '', rules: '', score: 1, glossary: ['文字を見て、その意味を理解する。'], sequence: 1, termTags: '' }]]]), settings([dictionary], 'en'), () => 'open', value => value));
        const fetch = vi.fn(async (_input: unknown) => response('Understand the meaning of written text.'));
        vi.stubGlobal('fetch', fetch);
        await installDefinitionTranslationBehaviors(document.body, settings([dictionary], 'en'));
        const url = new URL(String(fetch.mock.calls.flat()[0]));
        expect(url.searchParams.get('sl')).toBe('ja');
        expect(url.searchParams.get('tl')).toBe('en');
        expect(url.searchParams.get('q')).toContain('文字を見て');
        expect(document.querySelector('.jpdb-reader-local-expression')?.textContent).toBe('読む');
        expect(document.querySelector('.jpdb-reader-local-reading')?.textContent).toBe('よむ');
        expect(document.querySelector('.jpdb-reader-local-head')?.closest('.jpdb-reader-definition-original')).toBeNull();
    });

    it('translates Jitendex definitions and source-owned English POS with only that dictionary opted in', async () => {
        const dictionary = '[JA-EN] Jitendex';
        const current = settings([dictionary]);
        setInnerHtml(document.body, renderLocalDefinitionSourcesSection([dictionary], new Map([[dictionary, [{ dictionary, expression: '読書', reading: 'どくしょ', definitionTags: 'n', rules: '', score: 1, glossary: ['reading books'], sequence: 1, termTags: '' }]]]), current, () => 'open', () => 'My Jitendex'));
        const fetch = vi.fn(async (input: unknown) => response(new URL(String(input)).searchParams.get('q') === 'noun' ? '명사' : '독서'));
        vi.stubGlobal('fetch', fetch);
        await installDefinitionTranslationBehaviors(document.body, current);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(document.querySelector('[data-source="local-dictionary"] > summary')?.textContent).toContain('My Jitendex');
        expect(document.querySelector('.jpdb-reader-local-expression')?.textContent).toBe('読書');
        expect(document.querySelector('.jpdb-reader-local-reading')?.textContent).toBe('どくしょ');
        expect([...document.querySelectorAll('[lang="ko"]')].map(element => element.textContent)).toEqual(['명사', '독서']);
        expect(document.querySelectorAll('.jpdb-reader-definition-original')).toHaveLength(2);
    });

    it('keeps originals visible on transport failure', async () => {
        const root = popup();
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('fixture unavailable'); }));
        await installDefinitionTranslationBehaviors(root, settings());
        expect(root.querySelector('[data-definition-translation]')).toBeNull();
        expect(root.querySelector('[data-definition-translation-text]')?.textContent).toContain('to read');
        expect(root.querySelector('.jpdb-reader-definition-original')).toBeNull();
    });

    it('recovers a failed translation on a later install while deduplicating concurrent recovery', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        const root = popup();
        let finish: (value: Response) => void = () => undefined;
        const fetch = vi.fn().mockRejectedValueOnce(new Error('fixture offline')).mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
        vi.stubGlobal('fetch', fetch);
        await installDefinitionTranslationBehaviors(root, settings());
        expect(root.querySelector('[data-definition-translation-state="error"]')).not.toBeNull();
        expect(root.textContent).toContain('to read');
        vi.setSystemTime(Date.now() + 60_000);
        const recovery = installDefinitionTranslationBehaviors(root, settings());
        const duplicate = installDefinitionTranslationBehaviors(root, settings());
        finish(response('읽다'));
        await Promise.all([recovery, duplicate]);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(root.querySelector('[lang="ko"]')?.textContent).toBe('읽다');
        expect(root.querySelectorAll('[data-definition-translation]')).toHaveLength(1);
        expect(root.querySelectorAll('.jpdb-reader-definition-original')).toHaveLength(1);
        await installDefinitionTranslationBehaviors(root, settings());
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('does not turn repeated failed hydration into a tight request loop', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        const root = popup();
        const fetch = vi.fn(async () => { throw new Error('fixture still offline'); });
        vi.stubGlobal('fetch', fetch);
        await installDefinitionTranslationBehaviors(root, settings());
        for (let index = 0; index < 20; index += 1) {
            root.append(document.createElement('span'));
            await installDefinitionTranslationBehaviors(root, settings());
        }
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(root.querySelector('[data-definition-translation]')).toBeNull();
        vi.setSystemTime(Date.now() + 60_000);
        for (let index = 0; index < 20; index += 1) await installDefinitionTranslationBehaviors(root, settings());
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(root.textContent).toContain('to read');
    });

    it('lets a user retry immediately with the frozen payload while rejecting page-forged clicks', async () => {
        const root = popup();
        const fetch = vi.fn().mockRejectedValueOnce(new Error('fixture offline')).mockResolvedValue(response('읽다'));
        vi.stubGlobal('fetch', fetch);
        await installDefinitionTranslationBehaviors(root, settings());
        const button = retryButton(root);
        expect(button.textContent).toBe('Try again');
        root.querySelector('[data-definition-translation-text]')?.setAttribute('data-definition-translation-payload', 'PRIVATE_SUBSTITUTION');
        allowSyntheticReaderInteractionsForTests(false);
        button.click();
        expect(fetch).toHaveBeenCalledTimes(1);
        allowSyntheticReaderInteractionsForTests(true);
        button.click();
        await vi.waitFor(() => expect(root.querySelector('[lang="ko"]')?.textContent).toBe('읽다'));
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(new URL(String(fetch.mock.calls.map(call => call[0])[1])).searchParams.get('q')).toBe('to read');
        expect(root.querySelector('[data-definition-translation-retry]')).toBeNull();
    });

    it('does not retry a failed source from an aborted or changed-profile popup', async () => {
        const root = popup();
        let current = settings();
        const controller = new AbortController();
        const fetch = vi.fn(async () => { throw new Error('fixture offline'); });
        vi.stubGlobal('fetch', fetch);
        await installDefinitionTranslationBehaviors(root, current, { signal: controller.signal, getSettings: () => current });
        const button = retryButton(root);
        current = settings([], 'fr');
        button.click();
        expect(fetch).toHaveBeenCalledTimes(1);
        current = settings();
        controller.abort();
        button.click();
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(root.querySelector('[data-definition-translation]')).toBeNull();
    });

    it('ignores forged markers and sends the frozen public payload when page data attributes change', async () => {
        const root = popup();
        root.querySelector<HTMLElement>('[data-definition-translation-text]')!.dataset.definitionTranslationPayload = 'PRIVATE_SUBSTITUTED_NOTE';
        root.insertAdjacentHTML('beforeend', '<div data-definition-translation-text data-definition-translation-payload="PRIVATE_FORGED_NOTE" data-definition-translation-source-id="__jpdb__">PRIVATE_FORGED_NOTE</div>');
        const fetch = vi.fn(async (_input: unknown) => response('읽다'));
        vi.stubGlobal('fetch', fetch);
        await installDefinitionTranslationBehaviors(root, settings());
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(new URL(String(fetch.mock.calls.flat()[0])).searchParams.get('q')).toBe('to read');
    });

    it('aborts a closed popup and never paints its late response', async () => {
        const root = popup();
        let signal: AbortSignal | null | undefined;
        vi.stubGlobal('fetch', vi.fn((_input: unknown, init?: RequestInit) => {
            signal = init?.signal;
            return new Promise<Response>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
        }));
        const pending = installDefinitionTranslationBehaviors(root, settings());
        await vi.waitFor(() => expect(signal).toBeDefined());
        root.remove();
        await pending;
        expect(signal?.aborted).toBe(true);
        expect(root.querySelector('[data-definition-translation]')).toBeNull();
    });

    it('cancels stale profile requests, restores originals and translates only for the active profile', async () => {
        const root = popup();
        let current = settings();
        let signal: AbortSignal | null | undefined;
        const fetch = vi.fn((_input: unknown, init?: RequestInit) => {
            signal = init?.signal;
            return new Promise<Response>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
        });
        vi.stubGlobal('fetch', fetch);
        const pending = installDefinitionTranslationBehaviors(root, current, { getSettings: () => current });
        await vi.waitFor(() => expect(signal).toBeDefined());
        current = settings([], 'fr');
        publishSettingsChange({ settings: current });
        await pending;
        expect(signal?.aborted).toBe(true);
        expect(root.querySelector('[data-definition-translation]')).toBeNull();
        vi.stubGlobal('fetch', vi.fn(async () => response('lire')));
        current = settings(['__jpdb__'], 'fr');
        await installDefinitionTranslationBehaviors(root, current, { getSettings: () => current });
        expect(root.querySelector('[lang="fr"]')?.textContent).toBe('lire');
        await installDefinitionTranslationBehaviors(root, settings([]));
        expect(root.querySelector('[data-definition-translation]')).toBeNull();
        expect(root.querySelector('.jpdb-reader-meanings')?.textContent).toBe('to read');
    });

    it('marks actual popup POS independently of Japanese headwords and UI controls', async () => {
        const current = settings();
        const word = { ...card, source: 'jpdb' as const, spelling: '読む', reading: 'よむ', partOfSpeech: ['verb'], meanings: [{ glosses: ['to read'], partOfSpeech: ['verb'] }] };
        setInnerHtml(document.body, testCardPopoverRenderer(current).render(word, '', 'modal', emptyCardRenderData()));
        const headword = document.querySelector('[data-yomu-headword]');
        if (!headword) throw new Error('Popup fixture has no headword.');
        const originalHeadword = headword.innerHTML;
        const fetch = vi.fn(async (_input: unknown) => response('동사'));
        vi.stubGlobal('fetch', fetch);
        await installDefinitionTranslationBehaviors(document.body, current);
        expect(new URL(String(fetch.mock.calls.flat()[0])).searchParams.get('q')).toBe('verb');
        expect(headword.innerHTML).toBe(originalHeadword);
        expect(headword.closest('.jpdb-reader-definition-original')).toBeNull();
    });

    it('translates the JPDB keyword in the DOM-built Study kanji card while keeping readings separate', async () => {
        document.body.replaceChildren(renderNewTabKanjiInfoSection(card, [['Keyword', 'call']], ['よ', 'こ'], [], {
            kanji: '呼', keyword: 'call', frequency: '', type: '', kanken: '', heisig: '', oldForms: [], readings: [], components: [], mnemonic: '', vocabulary: [], actions: [], loggedIn: false, kanjiReviewsEnabled: false,
        }, () => 'open', 'JPDB', 'en'));
        vi.stubGlobal('fetch', vi.fn(async () => response('부르다')));
        await installDefinitionTranslationBehaviors(document.body, settings());
        expect(document.querySelector('[lang="ko"]')?.textContent).toBe('부르다');
        expect(document.querySelector('.jpdb-reader-kanji-readings')?.textContent).toBe('よこ');
        expect(document.querySelector('.jpdb-reader-kanji-readings')?.closest('.jpdb-reader-definition-original')).toBeNull();
    });

    it('persists source opt-ins on the active profile and retains hidden saved choices on an untouched Save', async () => {
        const current = settings(['__jpdb__', 'uninstalled dictionary']);
        document.body.innerHTML = `<form>${renderSettingsForm(current, 'https://jpdb.io/settings', undefined, { includeCatalogBrowse: false })}</form>`;
        const form = document.querySelector('form')!;
        const jiten = form.querySelector<HTMLInputElement>('input[name="definitionTranslationProviderIds"][value="__jiten__"]');
        if (!jiten) throw new Error('Source checklist has no Jiten option.');
        expect(jiten.checked).toBe(false);
        jiten.checked = true;
        const changed = readFormSettings(new FormData(form), current);
        await saveSettings(changed, { explicitUserChoiceKeys: ['languageProfiles'] });
        const reloaded = await loadSettings();
        const [saved] = reloaded.languageProfiles;
        if (!saved) throw new Error('Saved profile disappeared.');
        expect(saved.definitionTranslationProviderIds).toEqual(expect.arrayContaining(['__jpdb__', '__jiten__', 'uninstalled dictionary']));
        expect(saved.definitionTranslationProviderIds).toHaveLength(3);
        expect(readFormSettings(new FormData(), reloaded).languageProfiles).toEqual(reloaded.languageProfiles);
        localizeSettingsForm(form, 'ja');
        expect(form.textContent).toContain('辞書の語義を翻訳');
        expect(form.textContent).not.toContain('未翻訳');
    });
});
