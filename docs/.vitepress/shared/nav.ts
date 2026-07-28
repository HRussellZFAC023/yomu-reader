/**
 * THE navigation. One definition, three consumers.
 *
 * The docs pages get theirs from `config.mts` (build time, VitePress `nav`), and
 * the hosted app shells — Study, PDF Reader, Video Player — build their own
 * overflow menu at runtime in `theme/index.ts`. Those were two hand-maintained
 * lists that drifted: adding a page meant editing both and noticing you had to.
 * Both now read this file, so a nav change happens in exactly one place.
 *
 * Route shapes differ deliberately. VitePress rewrites clean `link` values, but
 * the hosted shells are static HTML served outside the router, so their entries
 * need the explicit `index.html` (a bare `/pdf-reader/` 404s on the published
 * site). `route()` keeps that distinction honest instead of leaving it to memory.
 */

export interface NavRoute {
    /** English label. Every label needs a ja entry in the theme's copy map. */
    text: string;
    /** VitePress-style route, used by the docs nav. */
    link: string;
    /** Explicit file route for the hosted shells; defaults to `link`. */
    hostedHref?: string;
    /** Hosted app routes are same-tab navigations, not docs links. */
    target?: '_self';
}

/**
 * Primary nav: learner VERBS and destinations, in the order a learner needs them
 * — get started, then the things you do, then help. Deliberately short: an
 * entry earns its place by being something a learner reaches for repeatedly.
 */
export const PRIMARY_NAV: readonly NavRoute[] = Object.freeze([
    { text: 'Get started', link: '/getting-started' },
    { text: 'Guides', link: '/guides/' },
    { text: 'Tools', link: '/tools/' },
    { text: 'Study', link: '/study/', target: '_self' },
    { text: 'Academy', link: '/academy/', target: '_self' },
    // 'Help' rather than 'Support'. 'Support' answered two different questions at
    // once — "get help with Yomu" and "give money to Yomu" — and a visitor could
    // not tell which one the nav meant. Money now lives under MEMBERSHIP_NAV.
    { text: 'Help', link: '/support' },
]);

/**
 * Everything else, behind one overflow entry. These are real destinations that
 * simply are not daily: tools you open occasionally, reference, and policy.
 */
export const OVERFLOW_NAV: readonly NavRoute[] = Object.freeze([
    { text: 'Video Player', link: '/video-player/index.html', hostedHref: '/video-player/index.html', target: '_self' },
    { text: 'PDF Reader', link: '/pdf-reader/index.html', hostedHref: '/pdf-reader/index.html', target: '_self' },
    { text: 'Stats', link: '/study/?mode=stats', target: '_self' },
    { text: 'API', link: '/api/', target: '_self' },
    { text: 'Local Audio', link: '/local-audio' },
    { text: 'FAQ', link: '/faq' },
    { text: 'Changelog', link: '/changelog' },
    { text: 'Privacy', link: '/privacy' },
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
// the only thing that acts on a plain press.
export const MEMBERSHIP_NAV: NavRoute = Object.freeze({ text: 'Membership', link: '/membership', target: '_self' });

/** The docs nav: primary entries, then Membership, then one 'More' dropdown. */
export function docsNav(): unknown[] {
    return [
        ...PRIMARY_NAV.map(route => docsEntry(route)),
        docsEntry(MEMBERSHIP_NAV),
        { text: 'More', items: OVERFLOW_NAV.map(route => docsEntry(route)) },
    ];
}

/** The hosted shells' overflow menu: everything, since they have no room for a bar. */
export function hostedOverflowLinks(): { text: string; href: string; target?: '_self' }[] {
    return [...PRIMARY_NAV, MEMBERSHIP_NAV, ...OVERFLOW_NAV]
        .filter(route => route.text !== 'Study')
        .map(route => ({
            text: route.text,
            href: route.hostedHref ?? route.link,
            ...(route.target ? { target: route.target } : {}),
        }));
}

/** Every label that needs a Japanese entry in the theme's copy map. */
export function navLabels(): string[] {
    return [...PRIMARY_NAV, MEMBERSHIP_NAV, ...OVERFLOW_NAV].map(route => route.text).concat('More');
}

function docsEntry(route: NavRoute): Record<string, unknown> {
    return { text: route.text, link: route.link, ...(route.target ? { target: route.target } : {}) };
}
