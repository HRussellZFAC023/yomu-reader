import { Logger } from './logger';

export interface DeinflectedTerm {
    term: string;
    rules: string[];
    reasons: string[];
    depth: number;
}

const log = Logger.scope('Deinflect');

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
    ['こられた', 'くる', 'potential/passive past'],
    ['こられて', 'くる', 'potential/passive te-form'],
    ['こられる', 'くる', 'potential/passive'],
    ['くれば', 'くる', 'conditional'],
    ['こよう', 'くる', 'volitional'],
    ['こい', 'くる', 'imperative'],
    ['きた', 'くる', 'past'],
    ['きて', 'くる', 'te-form'],
] satisfies Array<[string, string, string]>;

const RULES: DeinflectionRule[] = [
    ...ICHIDAN_RULES.map(([from, to, reason]) => ({ from, to, reason, rules: ['v1'] })),
    ...I_ADJECTIVE_RULES.map(([from, to, reason]) => ({ from, to, reason, rules: ['adj-i', 'i-adj'] })),
    ...SURU_RULES.map(([from, to, reason]) => ({ from, to, reason, rules: ['vs', 'vs-s', 'suru'] })),
    ...KURU_RULES.map(([from, to, reason]) => ({ from, to, reason, rules: ['vk', 'kuru'] })),
    ...GODAN_ROWS.flatMap(row => godanRules(row)),
    { from: '行って', to: '行く', reason: 'te-form', rules: ['v5k', 'v5'] },
    { from: '行った', to: '行く', reason: 'past', rules: ['v5k', 'v5'] },
];

export function deinflectJapaneseTerm(source: string): DeinflectedTerm[] {
    const results: DeinflectedTerm[] = [{ term: source, rules: [], reasons: [], depth: 0 }];
    const seen = new Set([candidateKey(results[0])]);
    const queue = [results[0]];

    for (let index = 0; index < queue.length; index++) {
        const current = queue[index];
        if (current.depth >= 2) continue;

        for (const rule of RULES) {
            if (!current.term.endsWith(rule.from)) continue;
            if (current.term.length <= rule.from.length && rule.to.length === 0) continue;

            const term = `${current.term.slice(0, -rule.from.length)}${rule.to}`;
            if (!term || term === current.term) continue;

            const next: DeinflectedTerm = {
                term,
                rules: rule.rules,
                reasons: [...current.reasons, rule.reason],
                depth: current.depth + 1,
            };
            const key = candidateKey(next);
            if (seen.has(key)) continue;
            seen.add(key);
            results.push(next);
            queue.push(next);
        }
    }

    const sorted = results.sort((a, b) => a.depth - b.depth || b.term.length - a.term.length || a.term.localeCompare(b.term));
    log.debugThrottled('deinflect-term', 1000, 'Deinflected Japanese term', {
        source,
        candidates: sorted.length,
        derived: sorted.filter(candidate => candidate.depth > 0).length,
    });
    return sorted;
}

export function termRulesMatch(entryRules: string | undefined, candidateRules: string[]): boolean {
    if (!candidateRules.length) return true;
    const entryRuleSet = new Set((entryRules ?? '').split(/\s+/).filter(Boolean));
    if (!entryRuleSet.size) return false;

    for (const rule of candidateRules) {
        if (entryRuleSet.has(rule)) return true;
        if (rule.startsWith('v5') && entryRuleSet.has('v5')) return true;
        if (rule === 'v5' && [...entryRuleSet].some(entryRule => entryRule.startsWith('v5'))) return true;
        if (rule === 'i-adj' && entryRuleSet.has('adj-i')) return true;
        if (rule === 'adj-i' && entryRuleSet.has('i-adj')) return true;
    }
    return false;
}

function godanRules(row: typeof GODAN_ROWS[number]): DeinflectionRule[] {
    const rules = row.rules;
    return [
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

function candidateKey(candidate: DeinflectedTerm): string {
    return `${candidate.term}\n${candidate.rules.join(' ')}\n${candidate.depth}`;
}
