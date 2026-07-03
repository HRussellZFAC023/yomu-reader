import type { JPDBCard } from '../app/types';
import { firstCardMeaning } from './index';

// Progressive hints for the ambiguous study steps. A hint NEVER prints the full
// answer before the reveal — kanji-draw hints stop at a component/keyword, recall
// hints stop at the first kana + length. Each step's hints are gated behind an
// explicit tap so a confident learner never sees them.
export type StudyHintStep = 'kanji-doodle' | 'recall-cloze';

export interface StudyHint {
    // 1-based hint tier (1 = gentlest). Used for the "used N hints" summary.
    level: number;
    // Short label ("Meaning", "Kanji", "First kana", "Length").
    labelKey: StudyHintLabelKey;
    // Rendered hint value. For kana-length this is the count as a string.
    text: string;
    // A kana-length hint is a mora count, not literal answer text — the caller
    // renders it as "3 kana" rather than as content to read out.
    kind: 'text' | 'count';
}

export type StudyHintLabelKey =
    | 'studyHintMeaning'
    | 'studyHintKanjiKeyword'
    | 'studyHintFirstKana'
    | 'studyHintLength';

export interface KanjiHintContext {
    // The word's gloss ("drink"). Shown as hint 1 only when it is not ALREADY
    // on the prompt (the draw prompt now carries the meaning by default, so the
    // meaning hint is usually skipped and the keyword becomes hint 1).
    meaningAlreadyShown: boolean;
    // A one-word keyword for THIS kanji ("drink", "read") when a source resolved
    // it — never the reading.
    kanjiKeyword: string;
    // The first kana of the word's reading ("の" for 飲み物) — a single-kana sound
    // cue, deliberately the LAST tier and far short of the full reading.
    firstKanaHint: string;
}

export function kanjiDrawHints(card: JPDBCard, context: KanjiHintContext): StudyHint[] {
    const hints: StudyHint[] = [];
    const meaning = firstCardMeaning(card).trim();
    if (meaning && !context.meaningAlreadyShown) {
        hints.push({ level: hints.length + 1, labelKey: 'studyHintMeaning', text: meaning, kind: 'text' });
    }
    const keyword = context.kanjiKeyword.trim();
    // Only surface a keyword hint when it adds signal beyond the word meaning
    // (e.g. a multi-kanji word where each kanji carries its own sense).
    if (keyword && !equalsIgnoreCase(keyword, meaning)) {
        hints.push({ level: hints.length + 1, labelKey: 'studyHintKanjiKeyword', text: keyword, kind: 'text' });
    }
    const firstKana = context.firstKanaHint.trim();
    if (firstKana) {
        hints.push({ level: hints.length + 1, labelKey: 'studyHintFirstKana', text: firstKana, kind: 'text' });
    }
    return hints;
}

export function recallHints(answer: string): StudyHint[] {
    const kana = Array.from(answer.trim());
    if (!kana.length) return [];
    const hints: StudyHint[] = [{ level: 1, labelKey: 'studyHintFirstKana', text: kana[0] ?? '', kind: 'text' }];
    // Length only helps once it is more than the single revealed kana, and never
    // when it would trivially spell out a two-kana word (first kana + "2 kana"
    // = the whole answer). Two-kana answers stop at the first-kana hint.
    if (kana.length > 2) {
        hints.push({ level: 2, labelKey: 'studyHintLength', text: String(kana.length), kind: 'count' });
    }
    return hints;
}

function equalsIgnoreCase(a: string, b: string): boolean {
    return a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

// Condense a card gloss to a short, front-worthy phrase so the kanji-draw prompt
// reads "drink — ＿み物", never a multi-clause dictionary dump ("5-dan transitive
// kana to sow to plant to seed to sow"). Takes the first sense, drops a leading
// grammar/POS tag, and caps the length.
const DRAW_MEANING_MAX_CHARS = 40;
const LEADING_POS_RE = /^(?:\d+-dan|\d+-adjective|transitive|intransitive|kana|godan|ichidan|suru|する|adj-[a-z]+|[nvi](?:-[a-z]+)?)\s+/iu;

export function conciseDrawMeaning(meaning: string): string {
    let first = (meaning.split(/[;；]/u)[0] ?? '').trim();
    // Peel repeated leading grammar tags ("5-dan transitive kana to sow" -> "to sow").
    for (let guard = 0; guard < 4 && LEADING_POS_RE.test(first); guard += 1) {
        first = first.replace(LEADING_POS_RE, '').trim();
    }
    if (!first) first = (meaning.split(/[;；]/u)[0] ?? '').trim();
    if (Array.from(first).length <= DRAW_MEANING_MAX_CHARS) return first;
    // Over the cap: keep up to the first comma-delimited sense that still fits.
    const clause = first.split(/[,，]/u)[0]?.trim() ?? first;
    const chars = Array.from(clause);
    return chars.length <= DRAW_MEANING_MAX_CHARS ? clause : `${chars.slice(0, DRAW_MEANING_MAX_CHARS).join('').trim()}…`;
}
