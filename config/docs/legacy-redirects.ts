/**
 * Public documentation routes that were merged into fewer, shorter pages.
 *
 * GitHub Pages cannot issue server redirects, so VitePress adds a refresh tag
 * and an early location.replace script to these pages at build time. The files
 * remain small, real pages so old bookmarks return 200 and no published route
 * disappears while search engines learn the new canonical destinations.
 * Japanese routes that were published redirect to their Japanese destination.
 */
export const LEGACY_DOC_REDIRECTS = Object.freeze({
    'getting-started.md': '/install',
    'features.md': '/learn/',
    'guides/index.md': '/learn/',
    'guides/comprehensible-input-youtube.md': '/learn/#what-to-start-with',
    'guides/mine-sentences-to-anki.md': '/faq#anki',
    'guides/read-manga-in-japanese.md': '/faq#manga',
    'guides/study-setup.md': '/learn/#already-use-anki',
    'tools/index.md': '/learn/#what-to-start-with',
    'tools/furigana-reader.md': '/learn/',
    'tools/japanese-ocr.md': '/faq#manga',
    'tools/japanese-subtitle-reader.md': '/learn/#what-to-start-with',
    'tools/kanji-stroke-order.md': '/learn/',
    'tools/study-page.md': '/learn/#every-day',
    'tools/yomu-gaming.md': '/desktop',
    'tools/youtube-japanese.md': '/learn/#what-to-start-with',
    'learn/approach.md': '/learn/',
    'learn/building-a-core.md': '/learn/',
    'learn/staying-with-it.md': '/learn/#rules',
    'learn/reference.md': '/learn/',
    'learn/week-one.md': '/install',
    'reference/grammar.md': '/learn/#rules',
    'support.md': '/faq',
    // The six-page guide became one page and the FAQ on 2026-10-07: a newcomer
    // should not need a manual, and every answer here fits in a few lines.
    'learn/reading.md': '/learn/#what-to-start-with',
    'learn/watching.md': '/learn/#what-to-start-with',
    'learn/manga-and-games.md': '/faq#manga',
    'learn/keeping-words.md': '/learn/#every-day',
    'learn/your-own-setup.md': '/faq',
    'local-audio.md': '/faq#audio',
    'reference/settings.md': '/faq',
    'ja/learn/reading.md': '/ja/learn/#what-to-start-with',
    'ja/learn/watching.md': '/ja/learn/#what-to-start-with',
    'ja/learn/manga-and-games.md': '/ja/faq#manga',
    'ja/learn/keeping-words.md': '/ja/learn/#every-day',
    'ja/learn/your-own-setup.md': '/ja/faq',
} as const);

// The reader's Mining help links the phone-Anki section by its old anchor
// (MOBILE_ANKI_SETUP_DOCS_URL in src/reader/settings/status-lines.ts), and so
// do installed builds that will never update that link.
const PHONE_ANKI = '#use-desktop-anki-from-a-phone-ipad-or-android';

export const LEGACY_DOC_HASH_REDIRECTS = Object.freeze({
    'getting-started.md': Object.freeze({ [PHONE_ANKI]: '/faq#anki-on-a-phone' }),
    'learn/week-one.md': Object.freeze({
        '#press-your-first-word': '/install#then',
        '#leave-furigana-on': '/learn/#rules',
    }),
    'learn/reference.md': Object.freeze({ '#apps': '/learn/#what-to-start-with' }),
    'learn/your-own-setup.md': Object.freeze({
        [PHONE_ANKI]: '/faq#anki-on-a-phone',
        '#bring-your-dictionaries': '/faq#dictionary',
        '#bring-your-audio': '/faq#audio',
        '#keep-one-review-home': '/faq#other-services',
        '#sync-yomu-between-devices': '/faq#new-device',
    }),
    'ja/learn/your-own-setup.md': Object.freeze({
        [PHONE_ANKI]: '/ja/faq#anki-on-a-phone',
        '#bring-your-dictionaries': '/ja/faq#dictionary',
        '#bring-your-audio': '/ja/faq#audio',
        '#keep-one-review-home': '/ja/faq#other-services',
        '#sync-yomu-between-devices': '/ja/faq#new-device',
    }),
} as const);

export type LegacyDocPath = keyof typeof LEGACY_DOC_REDIRECTS;

export function legacyDocsRedirect(relativePath: string): string | undefined {
    return LEGACY_DOC_REDIRECTS[relativePath as LegacyDocPath];
}

export function legacyDocsHashRedirects(relativePath: string): Readonly<Record<string, string>> {
    return LEGACY_DOC_HASH_REDIRECTS[relativePath as keyof typeof LEGACY_DOC_HASH_REDIRECTS] ?? {};
}
