/**
 * THE site navigation. One definition, every surface.
 *
 * Consumers:
 *  - the docs navbar and its 'More' dropdown, via `docsNav()` in
 *    docs/.vitepress/config.mts;
 *  - the docs overflow menu, via `hostedOverflowLinks()` in the VitePress theme;
 *  - the hosted Study shell, via `hostedShellNavRoutes()` in
 *    src/reader/newtab/controller.ts;
 *  - the standalone PDF Reader and Video Player shells, via
 *    `hostedShellNavMarkup()`, stamped into their HTML at build time by
 *    scripts/lib/hosted-site-nav.cjs.
 *
 * It lives under src/reader/app/ rather than docs/.vitepress/ because the last
 * two consumers cannot reach docs/.vitepress: the Study shell is compiled from
 * src/**, and the two static shells are served outside the VitePress theme
 * entirely. src/reader/app/ is where the reader already keeps the things the
 * docs build and the reader both read (constants.ts holds the hosted route
 * URLs, and the theme imports storage.ts and runtime-presence.ts from here), so
 * the docs side keeps importing across the boundary it already crosses.
 * docs/.vitepress/shared/nav.ts re-exports this file so the docs build's own
 * import path is unchanged.
 *
 * Every route is one URL shape on every surface: the directory form each hosted
 * shell declares as its `rel="canonical"`. The shells used to be linked as
 * `/pdf-reader/index.html` on the theory that the bare route 404s, so the site
 * pointed every link and the PWA shortcut at a URL that calls itself a
 * duplicate. Measured 2026-07-30: `/pdf-reader/`, `/video-player/`, `/study/`
 * and `/academy/` all return 200 with the same bytes as their `index.html`.
 *
 * Every entry carries its Japanese label. The PDF Reader and Video Player
 * stamp it as `data-nav-ja`, then their `applyInterfaceLanguage` loops update
 * `[data-site-nav-item]`. Study renders `link.ja` directly in
 * `renderSiteNavLink`; its anchors use `data-newtab-action="site-nav"` and do
 * not run through either static-shell loop. VitePress resolves these labels
 * through the semantic website catalogue and only rewrites a destination when
 * that route has reviewed Japanese body copy. The published-page test asserts
 * the shared labels and route ledger agree.
 */

export interface NavRoute {
    /** English label. Every label needs a ja entry in the theme's copy map. */
    text: string;
    /** Japanese label, shown by hosted app interface toggles and Japanese docs routes. */
    ja: string;
    /** VitePress-style route, used by the docs nav. */
    link: string;
    /** Hosted app routes are same-tab navigations, not docs links. */
    target?: '_self';
}

/**
 * Primary nav: the ordered learning path first, then the apps and destinations
 * a learner reaches for repeatedly. The path itself stays in the VitePress
 * sidebar, where all eleven steps fit without turning every hosted shell into a
 * catalogue.
 */
export const APPS_NAV_LABEL = 'Apps';

export const PRIMARY_NAV: readonly NavRoute[] = Object.freeze([
    { text: 'Learning path', ja: '学習の道筋', link: '/learn/' },
    { text: APPS_NAV_LABEL, ja: 'アプリ', link: '/learn/reference#apps' },
    { text: 'Study', ja: '学習', link: '/study/', target: '_self' },
    { text: 'Academy', ja: 'アカデミー', link: '/academy/', target: '_self' },
    // 'Help' rather than 'Support'. 'Support' answered two different questions at
    // once — "get help with Yomu" and "give money to Yomu" — and a visitor could
    // not tell which one the nav meant. Money now lives under MEMBERSHIP_NAV.
    { text: 'Help', ja: 'ヘルプ', link: '/support' },
]);

/**
 * Everything else, behind one overflow entry. These are real destinations that
 * simply are not daily: tools you open occasionally, reference, and policy.
 */
export const OVERFLOW_NAV: readonly NavRoute[] = Object.freeze([
    { text: 'Video Player', ja: '動画プレイヤー', link: '/video-player/', target: '_self' },
    { text: 'PDF Reader', ja: 'PDFリーダー', link: '/pdf-reader/', target: '_self' },
    { text: 'Stats', ja: '統計', link: '/study/?mode=stats', target: '_self' },
    { text: 'API', ja: 'API', link: '/api/', target: '_self' },
    { text: 'Local Audio', ja: 'ローカル音声', link: '/local-audio' },
    // Generated from DEFAULT_SETTINGS by scripts/settings-reference.mjs. It
    // stays in overflow because a learner reaches for it to find one control.
    { text: 'Settings reference', ja: '設定リファレンス', link: '/reference/settings' },
    { text: 'FAQ', ja: 'よくある質問', link: '/faq' },
    { text: 'Changelog', ja: '変更履歴', link: '/changelog' },
    { text: 'Privacy', ja: 'プライバシー', link: '/privacy' },
]);

/**
 * The one way to fund Yomu. Replaces three provider icons that sat in the
 * navbar (a Stripe mark, Patreon, Ko-fi) competing with each other and labelled
 * "Donate to Yomu with Stripe" — which named the processor rather than the
 * choice, and put a payment company's logo in a learner's way. One entry now
 * leads to a page where the visitor picks the method they already use.
 *
 * Not "Donate": the plan is that contributing unlocks Academy, so it is not
 * charity and calling it charity would misdescribe what you get.
 */
// target:'_self' is load-bearing, not decoration. VitePress's SPA router claims
// every in-site link click (window listener in dist/client/app/router.js) and
// calls preventDefault to route itself — which raced the popover and navigated
// away from the page it was meant to open over. That router explicitly skips any
// anchor carrying a `target`, so this is its own documented escape hatch: the
// entry stays a real link for no-JS and middle-click, and the popover handler is
// the only thing that acts on a plain press. Every surface renders it with the
// target for that reason, including the ones VitePress never touches: a hosted
// shell that dropped it would start breaking the moment its markup was reused.
export const MEMBERSHIP_NAV: NavRoute = Object.freeze({ text: 'Membership', ja: 'メンバーシップ', link: '/membership', target: '_self' });

/** The label of the entry every surface hides the overflow behind. */
export const OVERFLOW_LABEL = Object.freeze({ text: 'More', ja: 'その他' });

/** Every site route, in the order every surface shows them. */
export function siteNavRoutes(): readonly NavRoute[] {
    return [...PRIMARY_NAV, MEMBERSHIP_NAV, ...OVERFLOW_NAV];
}

/** The docs nav: primary entries, then Membership, then one 'More' dropdown. */
export function docsNav(): unknown[] {
    return [
        ...PRIMARY_NAV.map(route => docsEntry(route)),
        docsEntry(MEMBERSHIP_NAV),
        { text: OVERFLOW_LABEL.text, items: OVERFLOW_NAV.map(route => docsEntry(route)) },
    ];
}

/** The docs overflow menu: everything, since a narrow viewport has no room for a bar. */
export function hostedOverflowLinks(): { text: string; href: string; target?: '_self' }[] {
    return siteNavRoutes()
        .filter(route => route.text !== 'Study')
        .map(route => ({
            text: route.text,
            href: route.link,
            ...(route.target ? { target: route.target } : {}),
        }));
}

export interface HostedShellNavLink {
    text: string;
    ja: string;
    href: string;
    target?: '_self';
}

/**
 * The standalone shells' navigation. `base` is where the site root sits from the
 * page asking: '../' for a shell served one directory down (the static PDF
 * Reader and Video Player pages, which have to keep working under a local
 * preview as well as on yomureader.com), and the absolute docs origin for the
 * Study app, which also runs as a browser extension's new tab where a relative
 * route would resolve against the extension.
 */
export function hostedShellNavRoutes(base: string): HostedShellNavLink[] {
    return siteNavRoutes().map(route => ({
        text: route.text,
        ja: route.ja,
        href: `${base}${route.link.replace(/^\//, '')}`,
        ...(route.target ? { target: route.target } : {}),
    }));
}

/**
 * Study runs both on yomureader.com and as a packaged browser-extension page.
 * Its own Study and Stats destinations stay inside the current app origin when
 * the page is away from the hosted docs origin. Other destinations remain site
 * links because the extension does not package those surfaces.
 */
export function studyShellNavRoutes(base: string, pageUrl: string): HostedShellNavLink[] {
    const links = hostedShellNavRoutes(base);
    if (sameOrigin(base, pageUrl)) return links;
    return links.map(link => {
        if (link.text === 'Study') return { ...link, href: './' };
        if (link.text === 'Stats') return { ...link, href: './?mode=stats' };
        return link;
    });
}

/**
 * The same list as HTML, for the two shells that are static documents. Stamped
 * between the site-nav markers by scripts/lib/hosted-site-nav.cjs, so editing
 * this list and rebuilding is the whole change.
 */
export function hostedShellNavMarkup(base: string, indent = ''): string {
    return hostedShellNavRoutes(base).map(link => [
        `${indent}<a href="${escapeAttribute(link.href)}"`,
        link.target ? ` target="${link.target}"` : '',
        ` data-site-nav-item data-nav-ja="${escapeAttribute(link.ja)}">`,
        escapeText(link.text),
        '</a>',
    ].join('')).join('\n');
}

function docsEntry(route: NavRoute): Record<string, unknown> {
    return { text: route.text, link: route.link, ...(route.target ? { target: route.target } : {}) };
}

function escapeAttribute(value: string): string {
    return escapeText(value).replace(/"/g, '&quot;');
}

function escapeText(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sameOrigin(left: string, right: string): boolean {
    try {
        return new URL(left).origin === new URL(right).origin;
    } catch {
        return false;
    }
}
