import { JPDB_DEFINITION_SOURCE_ID } from '../app/constants';
import type { ReaderSettings } from '../app/types';
import { parseHtmlDocument } from '../dom';
import { activeLanguageProfile } from '../languages/profiles';
import { requestText } from '../network/http';
import { installDefinitionTranslationBehaviors, type DefinitionTranslationOptions } from '../sources/definition-translation';
import { translationOutputLanguage } from '../translation/languages';
import { bindDefinitionTranslation } from '../sources/definition-translation-markup';

interface PublicPage {
    url: string;
    html: string;
}
const publicPages = new WeakMap<Document, PublicPage>();
const activeRefreshes = new WeakMap<Document, { key: string; pending: Promise<void>; signal: AbortSignal | undefined }>();

/** Native JPDB definitions must match an anonymous public page before any text is sent. */
export function installJpdbDefinitionTranslation(document: Document, settings: ReaderSettings, options: DefinitionTranslationOptions = {}): Promise<void> {
    const profile = activeLanguageProfile(settings.languageProfiles, settings.activeLanguageProfileId);
    const url = publicDictionaryUrl(document);
    const enabled = profile?.definitionTranslationProviderIds.includes(JPDB_DEFINITION_SOURCE_ID) && new Intl.Locale(translationOutputLanguage(settings)).language !== 'en';
    if (!url || !profile || !enabled) return installDefinitionTranslationBehaviors(document, settings, options);
    const key = JSON.stringify([url, profile.id, profile.outputLanguage, settings.interfaceLanguage]);
    const active = activeRefreshes.get(document);
    if (active?.key === key && active.signal === options.signal && !active.signal?.aborted) return active.pending;
    const pending = translatePublicPage(document, url, settings, options);
    activeRefreshes.set(document, { key, pending, signal: options.signal });
    void pending.finally(() => {
        if (activeRefreshes.get(document)?.pending === pending) activeRefreshes.delete(document);
    });
    return pending;
}

async function translatePublicPage(document: Document, url: string, settings: ReaderSettings, options: DefinitionTranslationOptions): Promise<void> {
    const pagePath = document.location.pathname;
    try {
        const page = publicPages.get(document);
        const html = page?.url === url ? page.html : await requestText(url, {
            credentials: 'omit',
            anonymous: true,
            withCredentials: false,
            preferFetch: true,
            allowConfiguredProxy: false,
            allowPublicProxies: false,
            timeoutMs: 8000,
            signal: options.signal,
        });
        if (publicDictionaryUrl(document) !== url || document.location.pathname !== pagePath || options.signal?.aborted) return;
        publicPages.set(document, { url, html });
        const publicDocument = parseHtmlDocument(html);
        const publicText = new Set(publicLexicalElements(publicDocument).map(element => lexicalText(element)));
        for (const element of publicLexicalElements(document)) {
            const payload = lexicalText(element);
            if (!payload || !publicText.has(payload)) continue;
            groupNativeKanjiGloss(element);
            bindDefinitionTranslation(element, { payload, sourceId: JPDB_DEFINITION_SOURCE_ID, sourceLanguage: 'en' },
                () => publicDictionaryUrl(document) === url && document.location.pathname === pagePath && lexicalText(element) === payload);
        }
        await installDefinitionTranslationBehaviors(document, settings, {
            ...options,
            isCurrentRoot: () => publicDictionaryUrl(document) === url && document.location.pathname === pagePath && (options.isCurrentRoot?.() ?? true),
        });
    } catch { /* Keep the native original when public verification fails. */ }
}

function groupNativeKanjiGloss(element: HTMLElement): void {
    if (!element.matches('.subsection-composed-of-kanji .description')) return;
    if (element.parentElement?.classList.contains('jpdb-reader-native-definition')) return;
    const group = element.ownerDocument.createElement('div');
    group.className = 'jpdb-reader-native-definition';
    element.replaceWith(group);
    group.append(element);
}

function publicDictionaryUrl(document: Document): string | null {
    const location = document.location;
    if (location?.hostname !== 'jpdb.io') return null;
    if (!/^\/(?:vocabulary|kanji)\//u.test(location.pathname)) return null;
    return new URL(location.pathname, 'https://jpdb.io').href;
}

function publicLexicalElements(document: Document): HTMLElement[] {
    const meanings = Array.from(document.querySelectorAll<HTMLElement>('.result.vocabulary .subsection-meanings > .subsection'));
    const kanjiGlosses = Array.from(document.querySelectorAll<HTMLElement>('.result.vocabulary .subsection-composed-of-kanji .description'));
    const keywords = Array.from(document.querySelectorAll<HTMLElement>('.result.kanji h6.subsection-label'))
        .filter(heading => heading.textContent?.trim() === 'Keyword')
        .flatMap(heading => {
            const section = heading.nextElementSibling;
            return section instanceof HTMLElement && section.matches('.subsection') ? [section] : [];
        });
    return [...meanings, ...kanjiGlosses, ...keywords].filter(element => !element.closest('[data-yomu-jpdb-addon], .jpdb-reader-source-card'));
}

function lexicalText(element: HTMLElement): string {
    return element.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
}
