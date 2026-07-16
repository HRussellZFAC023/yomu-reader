export interface DeinflectedTerm {
    term: string;
    rules: string[];
    reasons: string[];
    depth: number;
}

interface DeinflectionRule {
    from: string;
    to: string;
    rules: string[];
    reason: string;
}

const GODAN_ROWS = [
    { ending: 'う', a: 'わ', i: 'い', e: 'え', o: 'お', te: 'って', ta: 'った', rules: ['v5u', 'v5'] },
    { ending: 'く', a: 'か', i: 'き', e: 'け', o: 'こ', te: 'いて', ta: 'いた', rules: ['v5k', 'v5'] },
    { ending: 'ぐ', a: 'が', i: 'ぎ', e: 'げ', o: 'ご', te: 'いで', ta: 'いだ', rules: ['v5g', 'v5'] },
    { ending: 'す', a: 'さ', i: 'し', e: 'せ', o: 'そ', te: 'して', ta: 'した', rules: ['v5s', 'v5'] },
    { ending: 'つ', a: 'た', i: 'ち', e: 'て', o: 'と', te: 'って', ta: 'った', rules: ['v5t', 'v5'] },
    { ending: 'ぬ', a: 'な', i: 'に', e: 'ね', o: 'の', te: 'んで', ta: 'んだ', rules: ['v5n', 'v5'] },
    { ending: 'ぶ', a: 'ば', i: 'び', e: 'べ', o: 'ぼ', te: 'んで', ta: 'んだ', rules: ['v5b', 'v5'] },
    { ending: 'む', a: 'ま', i: 'み', e: 'め', o: 'も', te: 'んで', ta: 'んだ', rules: ['v5m', 'v5'] },
    { ending: 'る', a: 'ら', i: 'り', e: 'れ', o: 'ろ', te: 'って', ta: 'った', rules: ['v5r', 'v5'] },
];

const ICHIDAN_RULES = [
    ['ました', 'る', 'polite past'],
    ['ませんでした', 'る', 'polite negative past'],
    ['ません', 'る', 'polite negative'],
    ['ましょう', 'る', 'polite volitional'],
    ['ます', 'る', 'polite'],
    ['なかった', 'る', 'negative past'],
    ['なくて', 'る', 'negative te-form'],
    ['なければ', 'る', 'negative conditional'],
    ['ない', 'る', 'negative'],
    ['たかった', 'る', 'desiderative past'],
    ['たくなかった', 'る', 'desiderative negative past'],
    ['たくない', 'る', 'desiderative negative'],
    ['たい', 'る', 'desiderative'],
    ['なさい', 'る', 'polite request'],
    ['すぎる', 'る', 'excessive'],
    ['られなかった', 'る', 'potential/passive negative past'],
    ['られない', 'る', 'potential/passive negative'],
    ['られて', 'る', 'potential/passive te-form'],
    ['られた', 'る', 'potential/passive past'],
    ['られる', 'る', 'potential/passive'],
    ['させられた', 'る', 'causative passive past'],
    ['させられる', 'る', 'causative passive'],
    ['させない', 'る', 'causative negative'],
    ['させて', 'る', 'causative te-form'],
    ['させた', 'る', 'causative past'],
    ['させる', 'る', 'causative'],
    ['れば', 'る', 'conditional'],
    ['よう', 'る', 'volitional'],
    ['ろ', 'る', 'imperative'],
    ['て', 'る', 'te-form'],
    ['た', 'る', 'past'],
] satisfies Array<[string, string, string]>;

const I_ADJECTIVE_RULES = [
    ['くなかった', 'い', 'negative past'],
    ['くありませんでした', 'い', 'polite negative past'],
    ['くありません', 'い', 'polite negative'],
    ['かった', 'い', 'past'],
    ['くない', 'い', 'negative'],
    ['くて', 'い', 'te-form'],
    ['ければ', 'い', 'conditional'],
    ['そう', 'い', 'looks'],
    ['すぎる', 'い', 'excessive'],
    ['く', 'い', 'adverbial'],
] satisfies Array<[string, string, string]>;

const SURU_RULES = [
    ['しませんでした', 'する', 'polite negative past'],
    ['しません', 'する', 'polite negative'],
    ['しました', 'する', 'polite past'],
    ['しましょう', 'する', 'polite volitional'],
    ['します', 'する', 'polite'],
    ['しなかった', 'する', 'negative past'],
    ['しなくて', 'する', 'negative te-form'],
    ['しなければ', 'する', 'negative conditional'],
    ['しない', 'する', 'negative'],
    ['しなさい', 'する', 'polite request'],
    ['しすぎる', 'する', 'excessive'],
    ['された', 'する', 'passive past'],
    ['されて', 'する', 'passive te-form'],
    ['される', 'する', 'passive'],
    ['させた', 'する', 'causative past'],
    ['させて', 'する', 'causative te-form'],
    ['させる', 'する', 'causative'],
    ['できなかった', 'する', 'potential negative past'],
    ['できない', 'する', 'potential negative'],
    ['できた', 'する', 'potential past'],
    ['できて', 'する', 'potential te-form'],
    ['できる', 'する', 'potential'],
    ['すれば', 'する', 'conditional'],
    ['しよう', 'する', 'volitional'],
    ['しろ', 'する', 'imperative'],
    ['せよ', 'する', 'imperative'],
    ['した', 'する', 'past'],
    ['して', 'する', 'te-form'],
] satisfies Array<[string, string, string]>;

const KURU_RULES = [
    ['来ませんでした', '来る', 'polite negative past'],
    ['来ません', '来る', 'polite negative'],
    ['来ました', '来る', 'polite past'],
    ['来ます', '来る', 'polite'],
    ['来なかった', '来る', 'negative past'],
    ['来なくて', '来る', 'negative te-form'],
    ['来ない', '来る', 'negative'],
    ['来なさい', '来る', 'polite request'],
    ['来すぎる', '来る', 'excessive'],
    ['来られた', '来る', 'potential/passive past'],
    ['来られて', '来る', 'potential/passive te-form'],
    ['来られる', '来る', 'potential/passive'],
    ['来れば', '来る', 'conditional'],
    ['来よう', '来る', 'volitional'],
    ['来い', '来る', 'imperative'],
    ['来た', '来る', 'past'],
    ['来て', '来る', 'te-form'],
    ['きませんでした', 'くる', 'polite negative past'],
    ['きません', 'くる', 'polite negative'],
    ['きました', 'くる', 'polite past'],
    ['きます', 'くる', 'polite'],
    ['こなかった', 'くる', 'negative past'],
    ['こなくて', 'くる', 'negative te-form'],
    ['こない', 'くる', 'negative'],
    ['きなさい', 'くる', 'polite request'],
    ['きすぎる', 'くる', 'excessive'],
    ['こられた', 'くる', 'potential/passive past'],
    ['こられて', 'くる', 'potential/passive te-form'],
    ['こられる', 'くる', 'potential/passive'],
    ['くれば', 'くる', 'conditional'],
    ['こよう', 'くる', 'volitional'],
    ['こい', 'くる', 'imperative'],
    ['きた', 'くる', 'past'],
    ['きて', 'くる', 'te-form'],
] satisfies Array<[string, string, string]>;

const TE_ASPECT_SUFFIXES = [
    ['いる', 'progressive'],
    ['います', 'polite progressive'],
    ['いました', 'polite progressive past'],
    ['いません', 'polite progressive negative'],
    ['いませんでした', 'polite progressive negative past'],
    ['いた', 'progressive past'],
    ['いて', 'progressive te-form'],
    ['いない', 'progressive negative'],
    ['いなかった', 'progressive negative past'],
    ['いれば', 'progressive conditional'],
    ['る', 'contracted progressive'],
    ['ます', 'contracted polite progressive'],
    ['ました', 'contracted polite progressive past'],
    ['た', 'contracted progressive past'],
    ['て', 'contracted progressive te-form'],
    ['ない', 'contracted progressive negative'],
    ['なかった', 'contracted progressive negative past'],
] satisfies Array<[string, string]>;

const TE_COMPLETION_SUFFIXES = [
    ['しまう', 'completion'],
    ['しまった', 'completion past'],
    ['しまって', 'completion te-form'],
    ['しまわない', 'completion negative'],
    ['しまいます', 'polite completion'],
    ['しまいました', 'polite completion past'],
] satisfies Array<[string, string]>;

const CONTRACTED_COMPLETION_SUFFIXES = [
    ['う', 'contracted completion'],
    ['った', 'contracted completion past'],
    ['って', 'contracted completion te-form'],
    ['わない', 'contracted completion negative'],
    ['います', 'contracted polite completion'],
    ['いました', 'contracted polite completion past'],
] satisfies Array<[string, string]>;

const RULES: DeinflectionRule[] = [
    ...ICHIDAN_RULES.map(([from, to, reason]) => ({ from, to, reason, rules: ['v1'] })),
    ...teCompoundRules('て', 'る', ['v1']),
    ...I_ADJECTIVE_RULES.map(([from, to, reason]) => ({ from, to, reason, rules: ['adj-i', 'i-adj'] })),
    ...SURU_RULES.map(([from, to, reason]) => ({ from, to, reason, rules: ['vs', 'vs-s', 'suru'] })),
    ...teCompoundRules('して', 'する', ['vs', 'vs-s', 'suru']),
    ...KURU_RULES.map(([from, to, reason]) => ({ from, to, reason, rules: ['vk', 'kuru'] })),
    ...teCompoundRules('来て', '来る', ['vk', 'kuru']),
    ...teCompoundRules('きて', 'くる', ['vk', 'kuru']),
    ...GODAN_ROWS.flatMap(row => godanRules(row)),
    { from: '行って', to: '行く', reason: 'te-form', rules: ['v5k', 'v5'] },
    { from: '行った', to: '行く', reason: 'past', rules: ['v5k', 'v5'] },
    { from: '行っちゃう', to: '行く', reason: 'contracted completion', rules: ['v5k', 'v5'] },
    { from: '行っちゃった', to: '行く', reason: 'contracted completion past', rules: ['v5k', 'v5'] },
];

// deinflectJapaneseTerm is a pure, deterministic function of `source`, but the
// term-match candidate sweep calls it hundreds of times per line on heavily
// overlapping substrings (an O(n^2) window walk). Memoize it in a bounded cache
// — the single biggest local-parse CPU win (~21x on re-scans), with output
// unchanged. The cached array is shared by reference; callers must treat it as
// immutable (they only read .term/.rules/.depth and spread into fresh arrays).
const DEINFLECTION_CACHE_MAX = 4000;
const deinflectionCache = new Map<string, DeinflectedTerm[]>();

export function deinflectJapaneseTerm(source: string): DeinflectedTerm[] {
    const cached = deinflectionCache.get(source);
    if (cached) return cached;

    const results: DeinflectedTerm[] = [{ term: source, rules: [], reasons: [], depth: 0 }];
    const seen = new Set([candidateKey(results[0])]);
    const queue = [results[0]];
    expandDeinflectionQueue(queue, results, seen);

    const sorted = sortDeinflectedTerms(results);
    if (deinflectionCache.size >= DEINFLECTION_CACHE_MAX) {
        const oldest = deinflectionCache.keys().next().value;
        if (oldest !== undefined) deinflectionCache.delete(oldest);
    }
    deinflectionCache.set(source, sorted);
    return sorted;
}

function expandDeinflectionQueue(queue: DeinflectedTerm[], results: DeinflectedTerm[], seen: Set<string>): void {
    for (let index = 0; index < queue.length; index++) {
        expandDeinflectedTerm(queue[index], queue, results, seen);
    }
}

function expandDeinflectedTerm(current: DeinflectedTerm, queue: DeinflectedTerm[], results: DeinflectedTerm[], seen: Set<string>): void {
    if (isDeinflectionDepthLimitReached(current)) return;
    for (const rule of RULES) {
        rememberExpandedDeinflection(current, rule, queue, results, seen);
    }
}

function isDeinflectionDepthLimitReached(current: DeinflectedTerm): boolean {
    return current.depth >= 2;
}

function rememberExpandedDeinflection(current: DeinflectedTerm, rule: DeinflectionRule, queue: DeinflectedTerm[], results: DeinflectedTerm[], seen: Set<string>): void {
    const next = deinflectedCandidate(current, rule);
    if (!next) return;
    if (!rememberDeinflectedCandidate(next, seen)) return;
    results.push(next);
    queue.push(next);
}

function sortDeinflectedTerms(results: DeinflectedTerm[]): DeinflectedTerm[] {
    return results.sort((a, b) => a.depth - b.depth || b.term.length - a.term.length || a.term.localeCompare(b.term));
}

function deinflectedCandidate(current: DeinflectedTerm, rule: DeinflectionRule): DeinflectedTerm | null {
    if (!canApplyDeinflectionRule(current.term, rule)) return null;
    const term = `${current.term.slice(0, -rule.from.length)}${rule.to}`;
    if (!term || term === current.term) return null;
    return {
        term,
        rules: rule.rules,
        reasons: [...current.reasons, rule.reason],
        depth: current.depth + 1,
    };
}

function canApplyDeinflectionRule(term: string, rule: DeinflectionRule): boolean {
    return term.endsWith(rule.from)
        && (term.length > rule.from.length || rule.to.length > 0);
}

function rememberDeinflectedCandidate(candidate: DeinflectedTerm, seen: Set<string>): boolean {
    const key = candidateKey(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
}

export function termRulesMatch(entryRules: string | undefined, candidateRules: string[]): boolean {
    if (!candidateRules.length) return true;
    const entryRuleSet = entryRulesSet(entryRules);
    return entryRuleSet.size > 0 && candidateRules.some(rule => termRuleMatches(rule, entryRuleSet));
}

function entryRulesSet(entryRules: string | undefined): Set<string> {
    return new Set((entryRules ?? '').split(/\s+/).filter(Boolean));
}

function termRuleMatches(rule: string, entryRuleSet: Set<string>): boolean {
    return TERM_RULE_MATCHERS.some(matches => matches(rule, entryRuleSet));
}

const TERM_RULE_MATCHERS: Array<(rule: string, entryRuleSet: Set<string>) => boolean> = [
    (rule, entryRuleSet) => entryRuleSet.has(rule),
    (rule, entryRuleSet) => rule.startsWith('v5') && entryRuleSet.has('v5'),
    (rule, entryRuleSet) => rule === 'v5' && [...entryRuleSet].some(entryRule => entryRule.startsWith('v5')),
    (rule, entryRuleSet) => rule === 'i-adj' && entryRuleSet.has('adj-i'),
    (rule, entryRuleSet) => rule === 'adj-i' && entryRuleSet.has('i-adj'),
];

function godanRules(row: typeof GODAN_ROWS[number]): DeinflectionRule[] {
    const rules = row.rules;
    return [
        ...teCompoundRules(row.te, row.ending, rules),
        { from: row.te, to: row.ending, reason: 'te-form', rules },
        { from: row.ta, to: row.ending, reason: 'past', rules },
        { from: `${row.a}なかった`, to: row.ending, reason: 'negative past', rules },
        { from: `${row.a}なくて`, to: row.ending, reason: 'negative te-form', rules },
        { from: `${row.a}なければ`, to: row.ending, reason: 'negative conditional', rules },
        { from: `${row.a}ない`, to: row.ending, reason: 'negative', rules },
        { from: `${row.i}ませんでした`, to: row.ending, reason: 'polite negative past', rules },
        { from: `${row.i}ません`, to: row.ending, reason: 'polite negative', rules },
        { from: `${row.i}ました`, to: row.ending, reason: 'polite past', rules },
        { from: `${row.i}ましょう`, to: row.ending, reason: 'polite volitional', rules },
        { from: `${row.i}ます`, to: row.ending, reason: 'polite', rules },
        { from: `${row.i}たかった`, to: row.ending, reason: 'desiderative past', rules },
        { from: `${row.i}たくなかった`, to: row.ending, reason: 'desiderative negative past', rules },
        { from: `${row.i}たくない`, to: row.ending, reason: 'desiderative negative', rules },
        { from: `${row.i}たい`, to: row.ending, reason: 'desiderative', rules },
        { from: `${row.i}なさい`, to: row.ending, reason: 'polite request', rules },
        { from: `${row.i}すぎる`, to: row.ending, reason: 'excessive', rules },
        { from: `${row.e}ば`, to: row.ending, reason: 'conditional', rules },
        { from: `${row.o}う`, to: row.ending, reason: 'volitional', rules },
        { from: `${row.e}なかった`, to: row.ending, reason: 'potential negative past', rules },
        { from: `${row.e}ない`, to: row.ending, reason: 'potential negative', rules },
        { from: `${row.e}た`, to: row.ending, reason: 'potential past', rules },
        { from: `${row.e}て`, to: row.ending, reason: 'potential te-form', rules },
        { from: `${row.e}る`, to: row.ending, reason: 'potential', rules },
        { from: `${row.a}れなかった`, to: row.ending, reason: 'passive negative past', rules },
        { from: `${row.a}れない`, to: row.ending, reason: 'passive negative', rules },
        { from: `${row.a}れて`, to: row.ending, reason: 'passive te-form', rules },
        { from: `${row.a}れた`, to: row.ending, reason: 'passive past', rules },
        { from: `${row.a}れる`, to: row.ending, reason: 'passive', rules },
        { from: `${row.a}せない`, to: row.ending, reason: 'causative negative', rules },
        { from: `${row.a}せて`, to: row.ending, reason: 'causative te-form', rules },
        { from: `${row.a}せた`, to: row.ending, reason: 'causative past', rules },
        { from: `${row.a}せる`, to: row.ending, reason: 'causative', rules },
        { from: row.e, to: row.ending, reason: 'imperative', rules },
    ];
}

function teCompoundRules(te: string, to: string, rules: string[]): DeinflectionRule[] {
    return [
        ...TE_ASPECT_SUFFIXES.map(([suffix, reason]) => ({ from: `${te}${suffix}`, to, reason, rules })),
        ...TE_COMPLETION_SUFFIXES.map(([suffix, reason]) => ({ from: `${te}${suffix}`, to, reason, rules })),
        ...contractedCompletionRules(te, to, rules),
    ];
}

function contractedCompletionRules(te: string, to: string, rules: string[]): DeinflectionRule[] {
    const stem = contractedCompletionStem(te);
    return stem
        ? CONTRACTED_COMPLETION_SUFFIXES.map(([suffix, reason]) => ({ from: `${stem}${suffix}`, to, reason, rules }))
        : [];
}

function contractedCompletionStem(te: string): string {
    if (te.endsWith('て')) return `${te.slice(0, -1)}ちゃ`;
    if (te.endsWith('で')) return `${te.slice(0, -1)}じゃ`;
    return '';
}

function candidateKey(candidate: DeinflectedTerm): string {
    return `${candidate.term}\n${candidate.rules.join(' ')}\n${candidate.depth}`;
}
