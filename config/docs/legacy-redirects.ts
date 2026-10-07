/**
 * Public documentation routes replaced by the ordered learning path.
 *
 * GitHub Pages cannot issue server redirects, so VitePress adds a refresh tag
 * and an early location.replace script to these pages at build time. The files
 * remain small, real pages so old bookmarks return 200 and no published route
 * disappears while search engines learn the new canonical destinations.
 */
export const LEGACY_DOC_REDIRECTS = Object.freeze({
    'getting-started.md': '/learn/#install-yomu',
    'features.md': '/learn/',
    'guides/index.md': '/learn/',
    'guides/comprehensible-input-youtube.md': '/learn/watching#retune-youtube',
    'guides/mine-sentences-to-anki.md': '/learn/keeping-words#mine-the-whole-moment',
    'guides/read-manga-in-japanese.md': '/learn/manga-and-games#read-manga',
    'guides/study-setup.md': '/learn/your-own-setup#keep-one-review-home',
    'tools/index.md': '/learn/#try-yomu-without-installing',
    'tools/furigana-reader.md': '/learn/#leave-furigana-on',
    'tools/japanese-ocr.md': '/learn/manga-and-games#read-manga',
    'tools/japanese-subtitle-reader.md': '/learn/watching#read-one-line',
    'tools/kanji-stroke-order.md': '/learn/reading#slow-down-on-one-kanji',
    'tools/study-page.md': '/learn/keeping-words#open-study',
    'tools/yomu-gaming.md': '/desktop',
    'tools/youtube-japanese.md': '/learn/watching#retune-youtube',
    // Folded into Start here and Save and review on 2026-10-07, when the
    // eleven-step path became six pages.
    'learn/approach.md': '/learn/#how-to-learn-with-yomu',
    'learn/building-a-core.md': '/learn/#how-to-learn-with-yomu',
    'learn/staying-with-it.md': '/learn/keeping-words#when-reviews-pile-up',
    'learn/reference.md': '/learn/',
    'learn/week-one.md': '/learn/#install-yomu',
    // Yomu is for learning Japanese, so the per-language coverage table went
    // with the other learning targets. Japanese grammar is described on Reading.
    'reference/grammar.md': '/learn/reading#let-the-page-help',
    // Its Discord and bug-report buttons now head the FAQ, which Help opens.
    'support.md': '/faq',
} as const);

export const LEGACY_DOC_HASH_REDIRECTS = Object.freeze({
    'getting-started.md': Object.freeze({
        '#use-desktop-anki-from-a-phone-ipad-or-android':
            '/learn/your-own-setup#use-desktop-anki-from-a-phone-ipad-or-android',
    }),
    'learn/week-one.md': Object.freeze({
        '#press-your-first-word': '/learn/#press-your-first-word',
        '#leave-furigana-on': '/learn/#leave-furigana-on',
    }),
    'learn/reference.md': Object.freeze({
        '#apps': '/learn/#try-yomu-without-installing',
    }),
} as const);

export type LegacyDocPath = keyof typeof LEGACY_DOC_REDIRECTS;

export function legacyDocsRedirect(relativePath: string): string | undefined {
    return LEGACY_DOC_REDIRECTS[relativePath as LegacyDocPath];
}

export function legacyDocsHashRedirects(relativePath: string): Readonly<Record<string, string>> {
    return LEGACY_DOC_HASH_REDIRECTS[relativePath as keyof typeof LEGACY_DOC_HASH_REDIRECTS] ?? {};
}
