// Worksheet-pack schema contract + deterministic validator for Yomu Academy.
//
// A "pack" is the lossless digitisation of ONE unique source worksheet payload. The validator
// is intentionally strict about the rules that keep the corpus honest:
//   - every extracted item preserves its ORIGINAL text;
//   - unknown furigana / pitch-accent stay null (never invented);
//   - any answer the source did not supply is flagged manual-review or free-response, never
//     silently fabricated;
//   - required tag/mapping/SRS/scene structures exist (values may be empty when unknown).
//
// The validator returns { ok, errors, warnings } and never throws on bad data.

export const WORKSHEET_PACK_SCHEMA = 'yomu-academy-worksheet-pack/v1';

export const ITEM_TYPES = new Set([
    'fill-blank',
    'multiple-choice',
    'short-answer',
    'transformation',
    'matching',
    'ordering',
    'sentence-composition',
    'translation',
    'free-writing',
    'listening-response',
    'listening-fill',
    'dictation',
    'speaking-prompt',
    'conversation-roleplay',
    'info-gap',
    'reading-comprehension',
    'kanji-recognition',
    'kanji-production',
    'kanji-reading',
    'vocabulary-matching',
    'other',
]);

export const ANSWER_STATUS = new Set([
    'provided', // answer key present in the source
    'model-answer', // no fixed key; a faithful model answer is supplied and labelled
    'manual-review', // answer unknown / not recoverable — needs a human
    'free-response', // open-ended by design (free writing / speaking) — rubric instead of key
]);

const SKILL_TAGS = new Set([
    'grammar', 'vocabulary', 'kanji', 'listening', 'reading', 'writing', 'speaking', 'culture',
]);

// ---- small assertion helpers ----------------------------------------------

function isObj(v) { return v != null && typeof v === 'object' && !Array.isArray(v); }
function isArr(v) { return Array.isArray(v); }
function isStr(v) { return typeof v === 'string'; }
function isNullableStr(v) { return v === null || typeof v === 'string'; }
function isNullableNum(v) { return v === null || typeof v === 'number'; }

class Ctx {
    constructor() { this.errors = []; this.warnings = []; }
    err(path, msg) { this.errors.push(`${path}: ${msg}`); }
    warn(path, msg) { this.warnings.push(`${path}: ${msg}`); }
    req(path, cond, msg) { if (!cond) this.err(path, msg); return cond; }
}

// ---- validators -----------------------------------------------------------

function validateInstruction(ctx, ins, p) {
    if (!isObj(ins)) return ctx.err(p, 'instruction must be an object');
    ctx.req(`${p}.id`, isStr(ins.id), 'id required');
    ctx.req(`${p}.originalText`, isStr(ins.originalText) && ins.originalText.length > 0, 'originalText required (verbatim)');
    ctx.req(`${p}.translation`, isNullableStr(ins.translation), 'translation must be string|null');
    ctx.req(`${p}.furigana`, ins.furigana === null || isStr(ins.furigana), 'furigana must be string|null');
}

function validateAnswer(ctx, ans, p) {
    if (!isObj(ans)) return ctx.err(p, 'answer must be an object');
    ctx.req(`${p}.status`, ANSWER_STATUS.has(ans.status), `status must be one of ${[...ANSWER_STATUS].join('|')}`);
    ctx.req(`${p}.accepted`, ans.accepted === null || isArr(ans.accepted), 'accepted must be array|null');
    ctx.req(`${p}.variants`, isArr(ans.variants), 'variants must be an array (may be empty)');
    ctx.req(`${p}.modelAnswer`, isNullableStr(ans.modelAnswer), 'modelAnswer must be string|null');
    ctx.req(`${p}.explanation`, isNullableStr(ans.explanation), 'explanation must be string|null');
    ctx.req(`${p}.scoringRule`, isNullableStr(ans.scoringRule), 'scoringRule must be string|null');
    ctx.req(`${p}.rubric`, ans.rubric === null || isArr(ans.rubric), 'rubric must be array|null');

    // Honesty rules:
    if (ans.status === 'provided') {
        if (!(isArr(ans.accepted) && ans.accepted.length > 0)) {
            ctx.err(`${p}.accepted`, 'status "provided" requires a non-empty accepted[]');
        }
    }
    if (ans.status === 'free-response') {
        if (!(isArr(ans.rubric) && ans.rubric.length > 0)) {
            ctx.warn(`${p}.rubric`, 'free-response should carry a rubric[]');
        }
    }
}

function validateItem(ctx, item, p) {
    if (!isObj(item)) return ctx.err(p, 'item must be an object');
    ctx.req(`${p}.id`, isStr(item.id), 'id required');
    ctx.req(`${p}.type`, ITEM_TYPES.has(item.type), `type must be one of the known item types (got ${JSON.stringify(item.type)})`);
    ctx.req(`${p}.promptOriginal`, isStr(item.promptOriginal), 'promptOriginal required (verbatim source text; use "" only for pure-media items)');
    ctx.req(`${p}.promptTranslation`, isNullableStr(item.promptTranslation), 'promptTranslation must be string|null');
    ctx.req(`${p}.furigana`, item.furigana === null || isStr(item.furigana), 'furigana must be string|null (null when unknown)');
    ctx.req(`${p}.pitchAccent`, item.pitchAccent === null || isArr(item.pitchAccent) || isStr(item.pitchAccent), 'pitchAccent must be string|array|null (null when unknown)');

    if (isObj(item.media)) {
        ctx.req(`${p}.media.audioRefs`, isArr(item.media.audioRefs), 'media.audioRefs must be array');
        ctx.req(`${p}.media.imageRefs`, isArr(item.media.imageRefs), 'media.imageRefs must be array');
        ctx.req(`${p}.media.timecode`, isNullableStr(item.media.timecode), 'media.timecode must be string|null');
    } else {
        ctx.err(`${p}.media`, 'media object required ({audioRefs,imageRefs,timecode})');
    }

    if (item.answer !== undefined) validateAnswer(ctx, item.answer, `${p}.answer`);
    else ctx.err(`${p}.answer`, 'answer object required');

    ctx.req(`${p}.hints`, isArr(item.hints), 'hints must be an array (ladder; may be empty)');
    ctx.req(`${p}.commonErrors`, isArr(item.commonErrors), 'commonErrors must be an array');

    if (isObj(item.tags)) {
        for (const k of ['grammar', 'vocabulary', 'kanji', 'skills', 'culture']) {
            ctx.req(`${p}.tags.${k}`, isArr(item.tags[k]), `tags.${k} must be an array`);
        }
        if (isArr(item.tags.skills)) {
            for (const s of item.tags.skills) {
                if (!SKILL_TAGS.has(s)) ctx.warn(`${p}.tags.skills`, `unknown skill tag "${s}"`);
            }
        }
    } else {
        ctx.err(`${p}.tags`, 'tags object required');
    }

    if (isObj(item.srs)) {
        ctx.req(`${p}.srs.items`, isArr(item.srs.items), 'srs.items must be array');
        ctx.req(`${p}.srs.prerequisites`, isArr(item.srs.prerequisites), 'srs.prerequisites must be array');
        ctx.req(`${p}.srs.reviewLinks`, isArr(item.srs.reviewLinks), 'srs.reviewLinks must be array');
    } else {
        ctx.err(`${p}.srs`, 'srs object required');
    }

    ctx.req(`${p}.reviewFlags`, isArr(item.reviewFlags), 'reviewFlags must be an array');
}

function validateMappings(ctx, m, p) {
    if (!isObj(m)) return ctx.err(p, 'mappings object required');
    for (const k of ['class', 'genki', 'minnaNoNihongo', 'jlpt', 'jfCanDo']) {
        if (!(k in m)) ctx.err(`${p}.${k}`, 'mapping key required (use {value:null,basis:...} when unknown)');
    }
}

function validateScene(ctx, s, p) {
    if (!isObj(s)) return ctx.err(p, 'sceneSuggestions object required');
    for (const k of ['characters', 'expressions', 'poses', 'locations', 'scenes']) {
        ctx.req(`${p}.${k}`, isArr(s[k]), `sceneSuggestions.${k} must be an array`);
    }
}

export function validatePack(pack) {
    const ctx = new Ctx();
    if (!isObj(pack)) { ctx.err('$', 'pack must be an object'); return result(ctx); }

    ctx.req('schema', pack.schema === WORKSHEET_PACK_SCHEMA, `schema must be "${WORKSHEET_PACK_SCHEMA}"`);
    ctx.req('packId', isStr(pack.packId), 'packId required');
    ctx.req('slug', isStr(pack.slug), 'slug required');
    ctx.req('sourceId', isStr(pack.sourceId), 'sourceId required');
    ctx.req('sha256', isStr(pack.sha256) && pack.sha256.startsWith('sha256:'), 'sha256 required (sha256:...)');
    ctx.req('byteLength', typeof pack.byteLength === 'number', 'byteLength required');
    ctx.req('pageCount', isNullableNum(pack.pageCount), 'pageCount must be number|null');

    if (isObj(pack.provenance)) {
        ctx.req('provenance.occurrences', isArr(pack.provenance.occurrences) && pack.provenance.occurrences.length > 0, 'provenance.occurrences[] required');
        ctx.req('provenance.rights', isStr(pack.provenance.rights), 'provenance.rights required');
        ctx.req('provenance.tier', pack.provenance.tier === 'digitise', 'provenance.tier must be "digitise" for a pack');
    } else ctx.err('provenance', 'provenance object required');

    if (isObj(pack.curriculum)) {
        ctx.req('curriculum.course', isStr(pack.curriculum.course), 'curriculum.course required');
        ctx.req('curriculum.chapter', isNullableNum(pack.curriculum.chapter), 'curriculum.chapter must be number|null');
        ctx.req('curriculum.grammarForms', isArr(pack.curriculum.grammarForms), 'curriculum.grammarForms must be array');
        ctx.req('curriculum.kinds', isArr(pack.curriculum.kinds), 'curriculum.kinds must be array');
    } else ctx.err('curriculum', 'curriculum object required');

    if (isObj(pack.title)) {
        ctx.req('title.original', isStr(pack.title.original), 'title.original required');
    } else ctx.err('title', 'title object required');

    ctx.req('instructions', isArr(pack.instructions), 'instructions[] required');
    if (isArr(pack.instructions)) pack.instructions.forEach((ins, i) => validateInstruction(ctx, ins, `instructions[${i}]`));

    ctx.req('items', isArr(pack.items) && pack.items.length > 0, 'items[] required and non-empty');
    if (isArr(pack.items)) pack.items.forEach((it, i) => validateItem(ctx, it, `items[${i}]`));

    ctx.req('freeWritingPrompts', isArr(pack.freeWritingPrompts), 'freeWritingPrompts[] required (may be empty)');
    if (isObj(pack.kanjiActivities)) {
        ctx.req('kanjiActivities.recognition', isArr(pack.kanjiActivities.recognition), 'kanjiActivities.recognition must be array');
        ctx.req('kanjiActivities.production', isArr(pack.kanjiActivities.production), 'kanjiActivities.production must be array');
    } else ctx.err('kanjiActivities', 'kanjiActivities object required');

    if (isObj(pack.groupTask)) {
        ctx.req('groupTask.original', 'original' in pack.groupTask, 'groupTask.original required (null when none)');
        ctx.req('groupTask.soloAdaptation', 'soloAdaptation' in pack.groupTask, 'groupTask.soloAdaptation required (null when none)');
    } else ctx.err('groupTask', 'groupTask object required');

    if (isObj(pack.listening)) {
        ctx.req('listening.transcripts', isArr(pack.listening.transcripts), 'listening.transcripts must be array');
    } else ctx.err('listening', 'listening object required');

    validateMappings(ctx, pack.mappings, 'mappings');
    validateScene(ctx, pack.sceneSuggestions, 'sceneSuggestions');
    ctx.req('vocabulary', isArr(pack.vocabulary), 'vocabulary[] required (may be empty)');
    ctx.req('reviewFlags', isArr(pack.reviewFlags), 'reviewFlags[] required (may be empty)');

    return result(ctx);
}

function result(ctx) {
    return { ok: ctx.errors.length === 0, errors: ctx.errors, warnings: ctx.warnings };
}
