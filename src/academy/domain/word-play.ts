import type { LearnerEventInput } from './learner-record';

export interface ShiritoriWord {
    readonly expression: string;
    readonly reading: string;
    readonly noun: boolean;
    readonly conceptIds: readonly string[];
}

export interface ShiritoriState {
    readonly usedReadings: readonly string[];
    readonly requiredKana: readonly string[];
    readonly rules?: {
        readonly laxDakuten: boolean;
        readonly laxLongVowels: boolean;
        readonly smallLetters: boolean;
    };
}

export type ShiritoriRejection = 'unknown-word' | 'reading-used' | 'ends-with-n' | 'wrong-start' | 'not-noun';

type ShiritoriEvidence = Extract<LearnerEventInput, { kind: 'learning-evidence-recorded' }>;

export type ShiritoriResult =
    | { readonly accepted: true; readonly state: ShiritoriState; readonly evidence: ShiritoriEvidence }
    | { readonly accepted: false; readonly reason: ShiritoriRejection; readonly expectedKana: readonly string[]; readonly evidence?: ShiritoriEvidence };

// Per docs/academy/KOTOBA-ADAPTATION.md the Adapt decision treats every rejected turn as a
// language lesson rather than a lost life: a dead-end (final ん), a loop (reading reused) or any
// other rule break is recorded as a `lapse` so the learner record can schedule contrastive repair.
// Only an unrecognised word carries no evidence, because there is no known concept to attribute.
function shiritoriEvidence(
    word: ShiritoriWord,
    reading: string,
    at: number,
    outcome: 'pass' | 'lapse',
): ShiritoriEvidence {
    return {
        kind: 'learning-evidence-recorded',
        at,
        activityId: `shiritori:${reading}`,
        modeId: 'shiritori',
        skill: 'vocabulary',
        action: 'produce',
        outcome,
        conceptIds: word.conceptIds,
        independent: true,
    };
}

export function playShiritoriTurn(
    state: ShiritoriState,
    word: ShiritoriWord | null,
    at: number,
): ShiritoriResult {
    if (!word) return { accepted: false, reason: 'unknown-word', expectedKana: state.requiredKana };
    const reading = toHiragana(word.reading.trim());
    const reject = (reason: ShiritoriRejection): ShiritoriResult => ({
        accepted: false,
        reason,
        expectedKana: state.requiredKana,
        evidence: shiritoriEvidence(word, reading, at, 'lapse'),
    });
    if (state.usedReadings.includes(reading)) return reject('reading-used');
    if (!word.noun) return reject('not-noun');
    if (reading.endsWith('ん')) return reject('ends-with-n');
    if (state.requiredKana.length && !state.requiredKana.some(kana => reading.startsWith(kana))) {
        return reject('wrong-start');
    }
    const nextKana = nextStartSequences(reading, state.rules ?? DEFAULT_RULES);
    return {
        accepted: true,
        state: { usedReadings: [...state.usedReadings, reading], requiredKana: nextKana, ...(state.rules ? { rules: state.rules } : {}) },
        evidence: shiritoriEvidence(word, reading, at, 'pass'),
    };
}

const DEFAULT_RULES = { laxDakuten: false, laxLongVowels: false, smallLetters: true } as const;
const SMALL_TO_LARGE: Readonly<Record<string, string>> = { 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お' };
const NO_START_SMALL = new Set(['ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ']);
const DAKUTEN: Readonly<Record<string, readonly string[]>> = {
    'か': ['が'], 'き': ['ぎ'], 'く': ['ぐ'], 'け': ['げ'], 'こ': ['ご'], 'が': ['か'], 'ぎ': ['き'], 'ぐ': ['く'], 'げ': ['け'], 'ご': ['こ'],
    'さ': ['ざ'], 'し': ['じ'], 'す': ['ず'], 'せ': ['ぜ'], 'そ': ['ぞ'], 'ざ': ['さ'], 'じ': ['し'], 'ず': ['す'], 'ぜ': ['せ'], 'ぞ': ['そ'],
    'た': ['だ'], 'ち': ['ぢ'], 'つ': ['づ'], 'て': ['で'], 'と': ['ど'], 'だ': ['た'], 'ぢ': ['ち'], 'づ': ['つ'], 'で': ['て'], 'ど': ['と'],
    'は': ['ば', 'ぱ'], 'ひ': ['び', 'ぴ'], 'ふ': ['ぶ', 'ぷ'], 'へ': ['べ', 'ぺ'], 'ほ': ['ぼ', 'ぽ'],
};
const LONG_VOWEL: Readonly<Record<string, string>> = {
    'あ': 'あ', 'か': 'あ', 'さ': 'あ', 'た': 'あ', 'な': 'あ', 'は': 'あ', 'ま': 'あ', 'や': 'あ', 'ら': 'あ', 'わ': 'あ',
    'い': 'い', 'き': 'い', 'し': 'い', 'ち': 'い', 'に': 'い', 'ひ': 'い', 'み': 'い', 'り': 'い',
    'う': 'う', 'く': 'う', 'す': 'う', 'つ': 'う', 'ぬ': 'う', 'ふ': 'う', 'む': 'う', 'ゆ': 'う', 'る': 'う',
    'え': 'い', 'け': 'い', 'せ': 'い', 'て': 'い', 'ね': 'い', 'へ': 'い', 'め': 'い', 'れ': 'い',
    'お': 'う', 'こ': 'う', 'そ': 'う', 'と': 'う', 'の': 'う', 'ほ': 'う', 'も': 'う', 'よ': 'う', 'ろ': 'う',
    'が': 'あ', 'ぎ': 'い', 'ぐ': 'う', 'げ': 'い', 'ご': 'う', 'ざ': 'あ', 'じ': 'い', 'ず': 'う', 'ぜ': 'い', 'ぞ': 'う',
    'だ': 'あ', 'ぢ': 'い', 'づ': 'う', 'で': 'い', 'ど': 'う', 'ば': 'あ', 'び': 'い', 'ぶ': 'う', 'べ': 'い', 'ぼ': 'う',
    'ぱ': 'あ', 'ぴ': 'い', 'ぷ': 'う', 'ぺ': 'い', 'ぽ': 'う', 'ゔ': 'う',
    'ゃ': 'あ', 'ゅ': 'う', 'ょ': 'う', 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'い', 'ぉ': 'お',
};

function toHiragana(value: string): string {
    let previous = '';
    return Array.from(value.normalize('NFKC')).map(character => {
        if (character === 'ー') return LONG_VOWEL[previous] ?? character;
        const code = character.charCodeAt(0);
        const converted = code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : character;
        previous = converted;
        return converted;
    }).join('');
}

function nextStartSequences(reading: string, rules: NonNullable<ShiritoriState['rules']>): string[] {
    const last = reading.at(-1) ?? '';
    const previous = reading.at(-2) ?? '';
    const head = reading.slice(0, -1);
    if (rules.laxLongVowels && LONG_VOWEL[previous] === last) {
        return unique([...nextStartSequences(reading, { ...rules, laxLongVowels: false }), ...nextStartSequences(head, { ...rules, laxLongVowels: false })]);
    }
    if (rules.smallLetters && SMALL_TO_LARGE[last]) {
        return unique([SMALL_TO_LARGE[last], ...nextStartSequences(reading, { ...rules, smallLetters: false })]);
    }
    if (!rules.smallLetters && NO_START_SMALL.has(last)) return nextStartSequences(head, rules);
    if (SMALL_TO_LARGE[last]) return variants(previous, rules).map(prefix => `${prefix}${last}`);
    return variants(last, rules);
}

function variants(character: string, rules: NonNullable<ShiritoriState['rules']>): string[] {
    const special: Readonly<Record<string, readonly string[]>> = { 'ぢ': ['じ', 'ぢ'], 'づ': ['ず', 'づ'], 'を': ['お', 'を'], 'っ': ['つ', 'っ'], 'ゔ': ['ゔ', 'う'] };
    return unique([...(special[character] ?? [character]), ...(rules.laxDakuten ? DAKUTEN[character] ?? [] : [])]);
}

function unique(values: readonly string[]): string[] {
    return [...new Set(values.filter(Boolean))];
}
