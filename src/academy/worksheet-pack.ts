// Worksheet packs are the teacher-made class handouts, digitised into JSON by
// the offline pipeline (see docs/academy/content/DIGITISATION-PIPELINE.md). Each
// pack carries printed instructions, exercise items, vocabulary, and listening
// scaffolding. This module is the one place that understands the raw pack shape
// and turns a pack into a playable `AcademyActivity` the existing activity player
// already knows how to render and grade.
//
// Answer-gating (P0): correct answers and model answers never enter the
// serialized response. `provided` items become exact-match short-text responses
// whose accepted answers live in the response object (the renderer emits the
// input, not the answer). Open items become self-reviewed long-text — their
// model answers are deliberately dropped from the runtime object so no
// pre-attempt DOM can restate them. Printed worked examples (れい) are teaching,
// not graded exercises, and are surfaced separately as reference notes.

import type {
    AcademyActivity,
    ActivityKind,
    ActivityResponse,
    ShortTextResponse,
    LongTextResponse,
} from './content';

/* ------------------------------------------------------------- the raw shape */

export interface WorksheetItemAnswer {
    status?: 'provided' | 'model-answer' | 'free-response' | 'manual-review' | string | null;
    accepted?: readonly string[] | null;
    variants?: readonly string[] | null;
    modelAnswer?: string | null;
    explanation?: string | null;
}

export interface WorksheetItem {
    id: string;
    type?: string;
    promptOriginal?: string;
    promptTranslation?: string | null;
    furigana?: string | null;
    answer?: WorksheetItemAnswer | null;
}

export interface WorksheetPackCurriculum {
    course?: string | null;
    textbook?: string | null;
    chapter?: number | null;
    section?: number | null;
    grammarForms?: readonly string[];
    kinds?: readonly string[];
    delivery?: string | null;
    skills?: readonly string[];
    topic?: string | null;
}

export interface WorksheetPack {
    schema?: string;
    packId: string;
    slug: string;
    title?: { original?: string; translitOrTranslation?: string } | null;
    pageCount?: number | null;
    curriculum?: WorksheetPackCurriculum | null;
    instructions?: readonly { id: string; originalText?: string; translation?: string | null }[];
    items?: readonly WorksheetItem[];
    freeWritingPrompts?: readonly unknown[];
    vocabulary?: readonly unknown[];
    listening?: unknown;
}

export interface WorksheetInventoryPack {
    packId: string;
    slug: string;
    tier?: string;
    curriculum?: WorksheetPackCurriculum | null;
}

export interface WorksheetInventory {
    schema?: string;
    summary?: { byChapter?: Record<string, number> };
    packs: readonly WorksheetInventoryPack[];
}

/* ------------------------------------------------------------ the conversion */

export interface PackCoverage {
    /** Items rendered as gradeable/self-reviewed responses. */
    interactive: number;
    /** Printed worked examples surfaced as reference, not graded. */
    reference: number;
    /** Items that carried no usable prompt and were skipped. */
    skipped: number;
    total: number;
    /** Human note when coverage is partial, shown per-unit. */
    note: string | null;
}

export interface ConvertedPack {
    activity: AcademyActivity;
    coverage: PackCoverage;
    /** Worked-example prompts kept for a reference panel, answers included (they are printed models, not graded). */
    referenceNotes: readonly string[];
}

const REI = /^(れい|例)|[)）]\s*(れい|例)|-rei$|\brei\b/i;

/**
 * Printed worked examples and determinate reference rows are teaching, not
 * exercises: their prompt legitimately shows the answer (a printed れい, or a
 * vocabulary row where the word and its meaning are both given, leaving nothing
 * for the learner to produce). These are surfaced as reference, never graded.
 */
export function isWorkedExample(item: WorksheetItem): boolean {
    if (item.type === 'vocabulary-matching') return true;
    if (REI.test(item.id)) return true;
    const t = (item.promptTranslation ?? '').toLowerCase();
    const o = item.promptOriginal ?? '';
    return /^\s*(ex\.?|example|e\.?g\.?)\b/.test(t) || /^\s*(れい|例)[)）]/.test(o);
}

function packKind(pack: WorksheetPack): ActivityKind {
    const kinds = pack.curriculum?.kinds ?? [];
    const skills = pack.curriculum?.skills ?? [];
    if (kinds.includes('listening') || skills.includes('listening')) return 'listening';
    if (kinds.includes('kanji') || skills.includes('kanji')) return 'kanji';
    if (kinds.includes('speaking') || kinds.includes('conversation') || skills.includes('speaking')) return 'speaking';
    if (kinds.includes('grammar') || skills.includes('grammar')) return 'grammar-practice';
    if (kinds.includes('reading') || kinds.includes('vocabulary')) return 'reflection';
    return 'writing';
}

function promptCopy(item: WorksheetItem): { en: string; ja?: string } | null {
    const ja = (item.promptOriginal ?? '').trim();
    const en = (item.promptTranslation ?? '').trim();
    if (!ja && !en) return null;
    // Never let the accepted answer stand in as the prompt for a graded item.
    return { en: en || 'Answer in Japanese, following the printed instructions.', ...(ja ? { ja } : {}) };
}

function toResponse(item: WorksheetItem, index: number): ActivityResponse | null {
    const prompt = promptCopy(item);
    if (!prompt) return null;
    const id = `resp-${item.id || index}`;
    const status = item.answer?.status ?? 'manual-review';
    const accepted = (item.answer?.accepted ?? []).filter((a): a is string => typeof a === 'string' && a.trim().length > 0);
    if (status === 'provided' && accepted.length > 0) {
        const response: ShortTextResponse = {
            id,
            kind: 'short-text',
            prompt,
            required: false,
            minimumCharacters: 1,
            maximumCharacters: 300,
            // Accepted answers ride in the graded object, not the rendered DOM.
            grading: { kind: 'exact', acceptedAnswers: [...accepted, ...((item.answer?.variants ?? []).filter((v): v is string => typeof v === 'string'))] },
        };
        return response;
    }
    // Open response: model answers are intentionally NOT carried, so no DOM can
    // restate them before the learner writes their own.
    const response: LongTextResponse = {
        id,
        kind: 'long-text',
        prompt,
        required: false,
        minimumCharacters: 1,
        recommendedCharacters: [10, 120],
        maximumCharacters: 600,
        reviewMode: 'self-review',
    };
    return response;
}

/**
 * Turn a worksheet pack into one playable activity plus a coverage report.
 * Every item is accounted for: graded/self-reviewed, kept as reference, or
 * counted as skipped — nothing is silently dropped.
 */
export function worksheetPackToActivity(pack: WorksheetPack): ConvertedPack {
    const items = pack.items ?? [];
    const responses: ActivityResponse[] = [];
    const referenceNotes: string[] = [];
    let reference = 0;
    let skipped = 0;
    for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (isWorkedExample(item)) {
            reference += 1;
            const note = (item.promptTranslation ?? item.promptOriginal ?? '').trim();
            if (note) referenceNotes.push(note);
            continue;
        }
        const response = toResponse(item, i);
        if (response) responses.push(response);
        else skipped += 1;
    }
    const total = items.length;
    const interactive = responses.length;
    const uncovered = reference + skipped;
    const note = uncovered > 0
        ? `${interactive} of ${total} items are interactive here. ${reference ? `${reference} printed worked example${reference === 1 ? '' : 's'} appear as reference` : ''}${reference && skipped ? '; ' : ''}${skipped ? `${skipped} item${skipped === 1 ? '' : 's'} are not yet interactive` : ''}.`.trim()
        : null;

    const titleEn = pack.title?.translitOrTranslation || pack.title?.original || pack.slug;
    const topic = pack.curriculum?.topic;
    const activity: AcademyActivity = {
        id: `pack-${pack.packId}`,
        kind: packKind(pack),
        title: { en: titleEn },
        instructions: { en: topic ? `${topic}. Work through each item; check as you go.` : 'Work through each item from the class handout; check your answers as you go.' },
        estimatedMinutes: Math.max(5, Math.min(30, (pack.pageCount ?? 1) * 8)),
        outcomeIds: [],
        focusVariantIds: [],
        assetUses: [],
        responses,
    };

    return { activity, coverage: { interactive, reference, skipped, total, note }, referenceNotes };
}
