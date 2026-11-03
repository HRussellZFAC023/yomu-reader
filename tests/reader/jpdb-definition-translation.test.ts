// @vitest-environment-options {"url":"https://jpdb.io/vocabulary/1266440/call"}
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installJpdbDefinitionTranslation } from '../../src/reader/jpdb/jpdb-definition-translation';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { resetGoogleTranslationCacheForTests } from '../../src/reader/translation/google';

// Structural excerpt of the public 呼ぶ / 呼 DOM fetched on 3 November 2026.
// Provider replies are deterministic fixtures, not live translation-quality evidence.
const vocabulary = `<div class="result vocabulary"><div class="subsection-spelling">呼ぶ<ruby>呼<rt>よ</rt></ruby></div><div class="subsection-meanings"><h6>Meanings</h6><div class="subsection"><div class="part-of-speech"><div>Verb (5-dan, ぶ, transitive)</div></div><div class="description">to call</div></div></div><div class="subsection-composed-of-kanji"><h6>Kanji used</h6><div class="subsection"><div><a href="/kanji/呼">呼</a><div class="description">call</div></div></div></div><div class="mnemonic">PRIVATE_NOTE</div><div class="account">PRIVATE_PROGRESS</div></div>`;
const kanji = `<div class="result kanji"><div class="kanji">呼</div><div><h6 class="subsection-label">Keyword</h6><div class="subsection">call</div></div><table><tr><td>Readings</td><td>よ、こ</td></tr></table><div class="mnemonic">PRIVATE_MNEMONIC</div></div>`;

function settings(enabled = true) {
    return { ...DEFAULT_SETTINGS, languageProfiles: DEFAULT_SETTINGS.languageProfiles.map(profile => ({ ...profile, outputLanguage: 'ko', definitionTranslationProviderIds: enabled ? ['__jpdb__'] : [] })) };
}

function setup(path = '/vocabulary/1266440/call', html = vocabulary) {
    history.replaceState(null, '', path);
    document.head.innerHTML = `<link rel="canonical" href="https://jpdb.io${path}">`;
    document.body.innerHTML = html;
}

describe('public native JPDB definition translation', () => {
    beforeEach(() => {
        resetGoogleTranslationCacheForTests();
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        setup();
    });

    it('makes zero native-page or translation requests by default', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        await installJpdbDefinitionTranslation(document, settings(false));
        expect(fetch).not.toHaveBeenCalled();
    });

    it('does not fetch a public copy when the selected destination is already English', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        const current = settings();
        await installJpdbDefinitionTranslation(document, { ...current, languageProfiles: current.languageProfiles.map(profile => ({ ...profile, outputLanguage: 'en-GB' })) });
        expect(fetch).not.toHaveBeenCalled();
    });

    it('omits account cookies in the userscript-manager fallback too', async () => {
        setup('/vocabulary/1266440/anonymous-gm');
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('fixture fetch unavailable'); }));
        const gm = vi.fn((details: { url: string; anonymous?: boolean; withCredentials?: boolean; onload?: (response: { status: number; responseText: string }) => void }) => {
            const responseText = new URL(details.url).hostname === 'jpdb.io' ? vocabulary : JSON.stringify({ sentences: [{ trans: '부르다' }] });
            queueMicrotask(() => details.onload?.({ status: 200, responseText }));
            return { abort: () => undefined };
        });
        vi.stubGlobal('GM_xmlhttpRequest', gm);
        await installJpdbDefinitionTranslation(document, settings());
        expect(gm.mock.calls[0]?.[0]).toMatchObject({ anonymous: true, withCredentials: false });
        expect(document.querySelector('[lang="ko"]')?.textContent).toBe('부르다');
    });

    it.each([['/vocabulary/1266440/call', vocabulary, 'to call'], ['/kanji/call', kanji, 'call']])('translates only public lexical data on %s while retaining Japanese text', async (path, html, gloss) => {
        setup(path, html);
        const requests: Array<{ url: URL; credentials?: RequestCredentials }> = [];
        vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
            const url = new URL(String(input));
            requests.push({ url, credentials: init?.credentials });
            return url.hostname === 'jpdb.io'
                ? new Response(html)
                : new Response(JSON.stringify({ sentences: [{ trans: '부르다' }] }));
        }));
        await installJpdbDefinitionTranslation(document, settings());
        expect(requests[0]?.credentials).toBe('omit');
        const translatedText = requests.filter(request => request.url.hostname !== 'jpdb.io').map(request => request.url.searchParams.get('q')).join(' ');
        expect(translatedText).toContain(gloss);
        expect(translatedText).not.toContain('PRIVATE_');
        expect(translatedText).not.toContain('Readings');
        expect(document.body.textContent).toContain('呼');
        expect(document.body.textContent).toContain('PRIVATE_');
        expect(document.querySelector('[lang="ko"]')?.textContent).toBe('부르다');
    });

    it('refuses private/review/search pages even with a public canonical link', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        for (const path of ['/review?c=v,1', '/deck/123', '/search?q=call']) {
            setup();
            history.replaceState(null, '', path);
            await installJpdbDefinitionTranslation(document, settings());
        }
        expect(fetch).not.toHaveBeenCalled();
    });

    it('does not send a live definition that differs from the anonymous public page', async () => {
        document.querySelector('.subsection-composed-of-kanji')!.remove();
        document.querySelector('.description')!.textContent = 'PRIVATE_CUSTOM_MEANING';
        const fetch = vi.fn(async (_input: unknown) => new Response(vocabulary));
        vi.stubGlobal('fetch', fetch);
        await installJpdbDefinitionTranslation(document, settings());
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(document.querySelector('[data-definition-translation]')).toBeNull();
    });

    it('does not apply a response after native navigation reuses the page', async () => {
        setup('/vocabulary/1266440/spa-test');
        let finish: (value: Response) => void = () => undefined;
        vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
        const pending = installJpdbDefinitionTranslation(document, settings());
        history.replaceState(null, '', '/vocabulary/another');
        finish(new Response(vocabulary));
        await pending;
        expect(document.querySelector('[data-definition-translation]')).toBeNull();
    });

    it('gives a new profile its own public request when the preceding subscriber aborts', async () => {
        setup('/vocabulary/1266440/abort-race');
        const urls: URL[] = [];
        vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
            const url = new URL(String(input));
            urls.push(url);
            if (urls.length === 1) return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => queueMicrotask(() => reject(new DOMException('Aborted', 'AbortError')))));
            return url.hostname === 'jpdb.io' ? new Response(vocabulary) : new Response(JSON.stringify({ sentences: [{ trans: '부르다' }] }));
        }));
        const first = new AbortController();
        const pendingA = installJpdbDefinitionTranslation(document, settings(), { signal: first.signal });
        await vi.waitFor(() => expect(urls).toHaveLength(1));
        first.abort();
        const secondSettings = { ...settings(), activeLanguageProfileId: 'profile-b', languageProfiles: settings().languageProfiles.map(profile => ({ ...profile, id: 'profile-b' })) };
        const pendingB = installJpdbDefinitionTranslation(document, secondSettings, { signal: new AbortController().signal });
        await Promise.all([pendingA, pendingB]);
        expect(urls.filter(url => url.hostname === 'jpdb.io')).toHaveLength(2);
        expect(document.querySelector('[lang="ko"]')?.textContent).toBe('부르다');
    });

    it('cannot translate an old native binding after its node is reused on a private route', async () => {
        setup('/vocabulary/1266440/reused-node');
        let finish: (value: Response) => void = () => undefined;
        vi.stubGlobal('fetch', vi.fn(async (input: unknown) => new URL(String(input)).hostname === 'jpdb.io'
            ? new Response(vocabulary)
            : new Promise<Response>(resolve => { finish = resolve; })));
        const pending = installJpdbDefinitionTranslation(document, settings());
        await vi.waitFor(() => expect(document.querySelector('[data-definition-translation-text]')).not.toBeNull());
        history.replaceState(null, '', '/deck/private');
        document.querySelector('.description')!.textContent = 'PRIVATE_REUSED_NODE';
        await installJpdbDefinitionTranslation(document, settings());
        finish(new Response(JSON.stringify({ sentences: [{ trans: 'STALE' }] })));
        await pending;
        expect(document.body.textContent).toContain('PRIVATE_REUSED_NODE');
        expect(document.querySelector('[data-definition-translation]')).toBeNull();
    });
});
