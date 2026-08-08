/**
 * D43 — one namespace vocabulary for every localisable string Yomu owns.
 *
 * Yomu had three localisation systems that could not see each other:
 *
 *   1. `src/reader/app/i18n.ts` — 1,202 semantic keys, English inline plus two
 *      tab-delimited Japanese tables parsed at runtime.
 *   2. `docs/.vitepress/theme/index.ts` — 3,662 entries whose *key is the
 *      English prose itself*, so editing a comma is a key change.
 *   3. `src/reader/locales/catalogs/*.ts` — 32 machine-draft catalogues with
 *      nine validated keys each. The older D43 ticket missed these entirely.
 *
 * The decision recorded in the plan is to unify the *pipeline*, not the content
 * namespaces: prose and compact controls keep separate files, translators and
 * release cadence, and share one ID vocabulary, one validator, one fallback
 * chain, one loader and one review ledger.
 *
 * A message ID is `<namespace>.<path>`:
 *
 *   chrome.*  reader chrome: settings, popover, study, audio, OCR, account
 *   setup.*   first-run and language setup (seeded from the 32 catalogues)
 *   errors.*  failure and degraded states
 *   a11y.*    accessible names and assistive-technology announcements
 *   docs.*    hosted documentation prose, `docs.<page>.<fragment>`
 *
 * Legacy keys are not rewritten at their ~2,000 call sites. Each legacy system
 * gets a compatibility resolver that maps its existing key to a stable ID
 * (`legacyChromeMessageId`, `legacyDocsMessageId`), so the ID vocabulary is
 * real today and call sites migrate namespace by namespace without a flag day.
 */

const MESSAGE_NAMESPACES = ['chrome', 'setup', 'errors', 'a11y', 'docs'] as const;

export type MessageNamespace = (typeof MESSAGE_NAMESPACES)[number];

/** A fully-qualified stable message ID, e.g. `chrome.settingsTitle`. */
export type MessageId = `${MessageNamespace}.${string}`;

const NAMESPACE_SET: ReadonlySet<string> = new Set(MESSAGE_NAMESPACES);

// A path segment is deliberately narrow: it has to survive being a JSON key, a
// file name, a URL fragment and a CSS attribute selector value unescaped.
const MESSAGE_ID_RE = /^[a-z]+\.[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)*$/;

export function isMessageId(value: string): value is MessageId {
    if (!MESSAGE_ID_RE.test(value)) return false;
    return NAMESPACE_SET.has(value.slice(0, value.indexOf('.')));
}

export function messageNamespaceOf(id: MessageId): MessageNamespace {
    return id.slice(0, id.indexOf('.')) as MessageNamespace;
}

/**
 * Compatibility resolver for the 1,202 reader-chrome keys.
 *
 * The keys are already stable semantic identifiers, so the mapping is the
 * identity under the `chrome.` namespace. This is what lets the tier table and
 * the readiness measurement cover all 1,202 strings today, before a single
 * call site changes.
 */
export function legacyChromeMessageId(key: string): MessageId {
    return `chrome.${key}` as MessageId;
}

/**
 * Compatibility resolver for the hosted-docs prose map.
 *
 * The docs map is keyed by the English source string, which means copy editing
 * silently orphans a translation. Until each page is migrated to
 * `docs.<page>.<fragment>`, the ID is derived from a stable hash of the source
 * string: editing the prose changes the ID, which the coverage gate reports as
 * a missing translation instead of losing it in silence.
 */
export function legacyDocsMessageId(sourceString: string): MessageId {
    return `docs.source-${fnv1a32(sourceString.trim())}` as MessageId;
}

/** Deterministic, dependency-free, stable across Node and browser builds. */
function fnv1a32(value: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}
