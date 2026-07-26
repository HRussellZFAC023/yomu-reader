// What yomureader.com is allowed to publish.
//
// docs/ doubles as the product site and as the team's working-notes folder, so
// every engineering note dropped in there quietly became a public URL: release
// runbooks, QA probes, delivery ledgers, backlog dumps, and reviewer-only store
// notes. They were unreachable from the site's own navigation but fully
// crawlable, listed in sitemap.xml, and pushed to search engines by
// scripts/submit-indexnow.mjs. An SEO audit found 17 of the 38 indexed URLs
// were notes like these.
//
// Two independent gates keep them off the site. `internalDocsExcludeGlobs`
// stops VitePress from routing them at all, so there is no page, no
// local-search entry, and no sitemap URL. `sitemapItemsForRoutes` then keeps
// the sitemap to pages the site actually links to, so a future note that lands
// somewhere these globs do not cover still cannot be advertised to crawlers.
//
// The source files stay in the repo — this stops them being *published*, not
// being written.

/**
 * VitePress `srcExclude` patterns, relative to `docs/`. A file matched here
 * keeps living in the repo but produces no route in the built site.
 */
export const internalDocsExcludeGlobs = [
    // Academy design, story, and evidence notes. Raw angle-bracket text in them
    // must never break the site build either.
    'academy/**/*.md',
    // Release runbooks, incident write-ups, and performance baselines.
    'dev/**/*.md',
    // Multilingual delivery workspace: coordinator rules, ledgers, and prompts.
    'multilingual/**/*.md',
    // QA probe plans and audits, written against specific commits.
    'qa/**/*.md',
    // docs/public is copied to the site root verbatim by Vite. Routing the
    // markdown in it as pages as well publishes a second, /public/-prefixed
    // copy of files that already ship at their real path.
    'public/**/*.md',
    // Dated session and review dumps at the docs root.
    'carryover-workstream-*.md',
    'nuclear-backlog-*.md',
    // Written for browser-store reviewers, not for readers. It was removed from
    // the site once already and came back as an unlinked route.
    'store-review-notes.md',
];

/**
 * Whether a `docs/`-relative markdown path is excluded from the built site.
 * Mirrors the glob syntax VitePress hands to its matcher for the two shapes
 * used above: a star inside a path segment, and a globstar segment standing in
 * for any number of intermediate directories.
 */
export function isInternalDocPath(relativePath: string): boolean {
    return internalDocsExcludeGlobs.some(glob => globToRegExp(glob).test(relativePath));
}

function globToRegExp(glob: string): RegExp {
    let source = '';
    for (let index = 0; index < glob.length; index += 1) {
        if (glob.startsWith('**/', index)) {
            source += '(?:[^/]+/)*';
            index += 2;
            continue;
        }
        if (glob[index] === '*') {
            source += '[^/]*';
            continue;
        }
        source += glob[index].replace(/[.+^${}()|[\]\\?]/, '\\$&');
    }
    return new RegExp(`^${source}$`);
}

/**
 * Reduces a navigation link or a VitePress sitemap `url` to a comparable key.
 * Sitemap urls are root-relative and slash-suffixed for directory index pages
 * (`privacy/`), while navigation links are absolute and usually are not
 * (`/privacy`), so both sides are stripped of leading and trailing slashes and
 * of any query or hash.
 */
export function sitemapRouteKey(value: string): string {
    return value.split(/[?#]/, 1)[0].replace(/^\/+/, '').replace(/\/+$/, '');
}

interface NavigationEntry {
    link?: unknown;
    items?: unknown;
}

/**
 * Collects every same-site route reachable from the theme's nav and sidebar.
 * Using the site's own navigation as the source of truth means a new public
 * page is in the sitemap as soon as it is linked, and a page nothing links to
 * is never advertised.
 */
export function navigationRoutes(entries: readonly unknown[]): Set<string> {
    const routes = new Set<string>();
    collectNavigationRoutes(entries, routes);
    return routes;
}

function collectNavigationRoutes(entries: readonly unknown[], routes: Set<string>): void {
    for (const entry of entries) {
        if (typeof entry !== 'object' || entry === null) continue;
        const { link, items } = entry as NavigationEntry;
        if (typeof link === 'string' && link.startsWith('/')) routes.add(sitemapRouteKey(link));
        if (Array.isArray(items)) collectNavigationRoutes(items, routes);
    }
}

/** Keeps only the sitemap entries whose route is linked from the site. */
export function sitemapItemsForRoutes<Item extends { url: string }>(
    items: readonly Item[],
    routes: ReadonlySet<string>,
): Item[] {
    return items.filter(item => routes.has(sitemapRouteKey(item.url)));
}
