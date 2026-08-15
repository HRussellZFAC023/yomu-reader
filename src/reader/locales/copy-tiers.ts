import type { MessageId } from './message-ids';
import { messageNamespaceOf } from './message-ids';

/**
 * D43 — the machine-first, human-critical copy policy, as data.
 *
 * Machine translation is the only realistic first pass across 33 interface
 * locales, and it cannot meet the bar in
 * `docs/academy/story/TONE-AND-HUMANIZE.md`: short, specific, natural, with no
 * generic machine tells. So the strings a learner reads most, and every string
 * where a mistranslation costs them data, money, privacy or trust, stay
 * human-written or native-human-reviewed.
 *
 * The important design point is *where the tier lives*. If the tier is decided
 * at review time, it is a judgement call made by whoever happens to open the
 * pull request, and it drifts. Here the tier is a property of the string,
 * resolved deterministically from its stable ID by the ordered rule table
 * below, with every rule naming which of the plan's nine mandatory categories
 * it implements. A new string is classified the moment it is named.
 *
 * The default is `machine-draft-ok`, which is the policy the plan states for
 * low-frequency setting help, tooltips, diagnostic detail, reference tables and
 * deep technical docs — not a shrug. Because a default can still swallow a
 * string that deserved the human tier, `escalatesToHumanTier` re-reads the
 * English source text for the words that mark irreversible, financial,
 * privacy-bearing or network-bearing copy and forces the human tier regardless
 * of ID. `tests/reader/locales/copy-tiers.test.ts` asserts that no string left
 * in `machine-draft-ok` contains one of those words, so the safety net is
 * adversarially checked rather than trusted.
 */
export type CopyTier = 'human-critical' | 'machine-draft-ok';

/** The plan's nine mandatory categories, plus the documented default. */
export type CopyTierCategory =
    | 'first-run-and-language-choice'
    | 'lookup-primary-actions'
    | 'study-loop'
    | 'privacy-and-credentials'
    | 'destructive-actions'
    | 'degraded-and-empty-states'
    | 'accessibility-names'
    | 'product-claims-and-commerce'
    | 'critical-docs'
    | 'supplementary';

export interface CopyTierDecision {
    readonly id: MessageId;
    readonly tier: CopyTier;
    readonly category: CopyTierCategory;
    /** Which rule decided, so a surprising classification is traceable. */
    readonly rule: string;
}

interface CopyTierRule {
    readonly rule: string;
    readonly category: CopyTierCategory;
    readonly tier: CopyTier;
    readonly matches: (id: MessageId, path: string) => boolean;
}

const containsAny = (path: string, needles: readonly string[]): boolean => {
    const lowered = path.toLowerCase();
    return needles.some((needle) => lowered.includes(needle));
};

const startsWithAny = (path: string, prefixes: readonly string[]): boolean =>
    prefixes.some((prefix) => path.startsWith(prefix));

// Ranked by cost of a bad translation, not by frequency: a mistranslated delete
// confirmation costs a learner their deck, a mistranslated tooltip costs them a
// second. The first matching rule wins, and the rule name is reported.
const COPY_TIER_RULES: readonly CopyTierRule[] = /* @__PURE__ */ Object.freeze([
    {
        rule: 'destructive-and-irreversible',
        category: 'destructive-actions',
        tier: 'human-critical',
        matches: (_id, path) =>
            containsAny(path, [
                'delete',
                'remove',
                'reset',
                'clear',
                'overwrite',
                'restore',
                'import',
                'unlink',
                'revoke',
                'discard',
                'wipe',
                'purge',
                'forget',
                'blacklist',
                'suspend',
                'conflict',
                'replaceall',
            ]),
    },
    {
        rule: 'privacy-permissions-credentials-and-account',
        category: 'privacy-and-credentials',
        tier: 'human-critical',
        matches: (_id, path) =>
            containsAny(path, [
                'privacy',
                'permission',
                'consent',
                'apikey',
                'apitoken',
                'credential',
                'password',
                'secret',
                'token',
                'account',
                'signin',
                'signout',
                'login',
                'logout',
                'sync',
                'proxy',
                'remote',
                'cloud',
                'upload',
                'network',
                'sentto',
            ]),
    },
    {
        rule: 'first-run-setup-and-language-choice',
        category: 'first-run-and-language-choice',
        tier: 'human-critical',
        matches: (id, path) =>
            messageNamespaceOf(id) === 'setup'
            || containsAny(path, ['onboarding', 'welcome', 'firstrun'])
            || containsAny(path, [
                'interfacelanguage',
                'interfacelocale',
                'learnerlanguage',
                'targetlanguage',
                'outputlanguage',
                'settingslanguage',
                'languageprofile',
            ]),
    },
    {
        rule: 'degraded-empty-and-unavailable-states',
        category: 'degraded-and-empty-states',
        tier: 'human-critical',
        matches: (id, path) =>
            messageNamespaceOf(id) === 'errors'
            || startsWithAny(path, ['no', 'cannot', 'could'])
            || containsAny(path, [
                'unavailable',
                'unsupported',
                'offline',
                'empty',
                'failed',
                'failure',
                'error',
                'retry',
                'recovery',
                'missing',
                'notfound',
                'degraded',
                'unlicensed',
                'blocked',
                'pending',
                'expired',
                'timeout',
            ]),
    },
    {
        rule: 'lookup-primary-actions',
        category: 'lookup-primary-actions',
        tier: 'human-critical',
        matches: (_id, path) =>
            startsWithAny(path, ['add', 'save', 'mine', 'lookup', 'play', 'state', 'open', 'copy'])
            || containsAny(path, [
                'revealtranslation',
                'showtranslation',
                'hidetranslation',
                'playaudio',
                'opensource',
                'opendictionary',
                'markknown',
                'marklearning',
                'knownstate',
            ]),
    },
    {
        rule: 'study-loop-and-grading',
        category: 'study-loop',
        tier: 'human-critical',
        matches: (_id, path) =>
            startsWithAny(path, ['grade', 'study', 'review', 'due', 'session', 'reveal'])
            || containsAny(path, ['duetoday', 'sessioncomplete', 'nothingdue']),
    },
    {
        rule: 'accessible-names-and-announcements',
        category: 'accessibility-names',
        tier: 'human-critical',
        matches: (id, path) =>
            messageNamespaceOf(id) === 'a11y'
            || /(?:arialabel|screenreader|announce)/i.test(path)
            || /(?:^|[a-z])(?:AriaLabel|Announcement)$/.test(path),
    },
    {
        rule: 'install-update-support-membership-and-claims',
        category: 'product-claims-and-commerce',
        tier: 'human-critical',
        matches: (_id, path) =>
            containsAny(path, [
                'update',
                'install',
                'store',
                'support',
                'membership',
                'patreon',
                'payment',
                'subscribe',
                'donate',
                'price',
                'academyaccess',
                'feedback',
            ]),
    },
    {
        rule: 'learner-facing-docs-entry-pages',
        category: 'critical-docs',
        tier: 'human-critical',
        matches: (id) =>
            messageNamespaceOf(id) === 'docs'
            && /^docs\.(?:index|install|installation|getting-started|start|guide\.first)\b/.test(id),
    },
    {
        // The documented default. Setting help, tooltips, status detail,
        // reference tables, older changelog prose and deep technical docs may
        // ship as labelled machine drafts while native review catches up.
        rule: 'default-supplementary-copy',
        category: 'supplementary',
        tier: 'machine-draft-ok',
        matches: () => true,
    },
]);

/**
 * Words that mean a mistranslation can cost a learner data, money, privacy or
 * trust. Any string whose English source contains one is pulled into the human
 * tier no matter how its ID reads, so the default rule cannot quietly swallow a
 * confirmation dialog that happens to be named `pruneTail`.
 */
export const HUMAN_TIER_ESCALATION_PHRASES: readonly string[] = /* @__PURE__ */ Object.freeze([
    'cannot be undone',
    "can't be undone",
    'permanently',
    'irreversible',
    'will be deleted',
    'will be removed',
    'will be overwritten',
    'overwrite',
    'delete',
    'erase',
    'wipe',
    'reset',
    'revoke',
    'sign out',
    'unlink',
    'api key',
    'api token',
    'password',
    'credential',
    'your data',
    'sent to',
    'uploaded',
    'third party',
    'third-party',
    'permission',
    'consent',
    'privacy',
    'charge',
    'payment',
    'subscription',
    'refund',
]);

export function escalatesToHumanTier(sourceText: string): boolean {
    const lowered = sourceText.toLowerCase();
    return HUMAN_TIER_ESCALATION_PHRASES.some((phrase) => lowered.includes(phrase));
}

export function copyTierOf(id: MessageId, sourceText?: string): CopyTierDecision {
    const path = id.slice(id.indexOf('.') + 1);
    const matched = COPY_TIER_RULES.find((rule) => rule.matches(id, path));
    // The table ends in a catch-all, so `matched` is always defined; the guard
    // is here so a future edit that drops the catch-all fails loudly.
    if (!matched) throw new Error(`No copy tier rule matched ${id}`);
    if (matched.tier === 'machine-draft-ok' && sourceText && escalatesToHumanTier(sourceText)) {
        return {
            id,
            tier: 'human-critical',
            category: 'destructive-actions',
            rule: 'escalated-by-source-text',
        };
    }
    return { id, tier: matched.tier, category: matched.category, rule: matched.rule };
}

export const COPY_TIER_RULE_NAMES: readonly string[] = /* @__PURE__ */ Object.freeze(
    /* @__PURE__ */ COPY_TIER_RULES.map((rule) => rule.rule),
);
