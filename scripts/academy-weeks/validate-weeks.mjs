#!/usr/bin/env node
// Deterministic gate for the weekly-lesson corpus (yomu-academy.week.v1).
// Validates every public/academy/content/weeks/*.json against WEEK-SCHEMA.md and
// the grounded week plan. Exit non-zero on any violation.

import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const WEEKS_DIR = resolve(ROOT, 'public', 'academy', 'content', 'weeks');
const PLAN = resolve(HERE, 'generated', 'week-plan.json');

const PAINTED = new Set(['rie', 'henry', 'aakash', 'alex', 'tom', 'sam', 'francis', 'shin', 'jodi', 'christian', 'jenny', 'robert', 'mika', 'sophie', 'xingyu', 'angel', 'stasi', 'ruparna', 'pho']);
const CAMEOS = new Set(['miller', 'tawapon']);
const EXPRESSIONS = new Set(['neutral', 'warm', 'thinking', 'determined', 'surprised', 'relieved']);
const REUSE = new Set(['metadata-only', 'structure-only', 'sequence-only', 'scope-only', 'original-yomu', 'public-domain-retelling', 'rights-review-required']);
const RELATION = new Set(['chronology', 'sequence', 'scope', 'placement', 'input-bank', 'practice-shape', 'continuation']);
const EX_KINDS = new Set(['exact', 'choice', 'multi-choice', 'order', 'cloze', 'match', 'open-writing', 'open-speaking']);
const DET_KINDS = new Set(['exact', 'choice', 'multi-choice', 'order', 'cloze', 'match']);
const WRONG_REQUIRED = new Set(['exact', 'choice', 'multi-choice', 'cloze']);
const REQUIRED_FULL = ['authentic-input', 'vocabulary', 'grammar', 'listening', 'reading', 'speaking', 'writing', 'kanji', 'review'];
const RELAXED_KINDS = new Set(['orientation', 'term-kickoff', 'script-hiragana', 'script-katakana', 'kanji-set']);
const INTERVALS = [1, 3, 7, 14, 30];

const AI_SLOP = ['journey', 'unlock', 'empower', 'seamless', 'tapestry', 'transformative', 'delve', 'dive in', 'supercharge', 'elevate', 'curated', 'at your own pace', 'takes shape', 'level up', 'game-changer', 'unleash'];
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+?\d[\s().-]*){9,}/;
const INSTITUTION = /\bUCL\b|\bmoodle\b/i;

// Keys whose string values are source metadata / identifiers — skip voice + privacy scans.
const META_KEYS = new Set(['payloadSha256', 'archiveSha256', 'sourceId', 'assetId', 'locator', 'sceneImage', 'reviewTag', 'id', 'pairedWith', 'schema', 'weekKind', 'type', 'kind', 'expression', 'pose', 'reuse', 'relation', 'authoringPolicy', 'reviewMode', 'modelAnswerPolicy', 'extension', 'role']);

function walkStrings(node, path, out, underSource) {
    if (typeof node === 'string') { out.push({ path, value: node, underSource }); return; }
    if (Array.isArray(node)) { node.forEach((v, i) => walkStrings(v, `${path}[${i}]`, out, underSource)); return; }
    if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
            if (META_KEYS.has(k)) continue;
            walkStrings(v, path ? `${path}.${k}` : k, out, underSource || path.startsWith('sourceCoverage') || k === 'sourceCoverage');
        }
    }
}

function validateExercise(ex, ctx, err) {
    if (!ex || typeof ex !== 'object') return err(`${ctx}: exercise not an object`);
    if (!ex.id) err(`${ctx}: exercise missing id`);
    if (!EX_KINDS.has(ex.kind)) return err(`${ctx}/${ex.id}: bad kind '${ex.kind}'`);
    if (!ex.prompt || !ex.prompt.en) err(`${ctx}/${ex.id}: missing prompt.en`);
    const open = ex.kind === 'open-writing' || ex.kind === 'open-speaking';
    if (open) {
        if (ex.autoGraded !== false) err(`${ctx}/${ex.id}: open exercise must set autoGraded:false`);
        if (!ex.rubric || !Array.isArray(ex.rubric.criteria) || !ex.rubric.criteria.length) err(`${ctx}/${ex.id}: open exercise needs rubric.criteria`);
    } else {
        if (!ex.explanation || !ex.explanation.trim()) err(`${ctx}/${ex.id}: deterministic exercise needs a non-empty explanation`);
        if (WRONG_REQUIRED.has(ex.kind) && !(Array.isArray(ex.wrongAnswerExplanations) && ex.wrongAnswerExplanations.length)) {
            err(`${ctx}/${ex.id}: ${ex.kind} needs ≥1 wrongAnswerExplanations`);
        }
    }
    if (ex.kind === 'exact' && !(ex.answer && ex.answer.primary)) err(`${ctx}/${ex.id}: exact needs answer.primary`);
    if (ex.kind === 'choice') {
        const opts = ex.options || [];
        if (opts.length < 2) err(`${ctx}/${ex.id}: choice needs ≥2 options`);
        if (opts.filter((o) => o.correct).length !== 1) err(`${ctx}/${ex.id}: choice needs exactly 1 correct option`);
    }
    if (ex.kind === 'multi-choice') {
        const opts = ex.options || [];
        if (opts.length < 2) err(`${ctx}/${ex.id}: multi-choice needs ≥2 options`);
        if (opts.filter((o) => o.correct).length < 1) err(`${ctx}/${ex.id}: multi-choice needs ≥1 correct option`);
    }
    if (ex.kind === 'order') {
        const ids = (ex.options || []).map((o) => o.id);
        if (!Array.isArray(ex.correctOrder) || ex.correctOrder.length !== ids.length || ids.length < 2) err(`${ctx}/${ex.id}: order needs options + correctOrder permutation`);
        else if ([...ex.correctOrder].sort().join() !== [...ids].sort().join()) err(`${ctx}/${ex.id}: correctOrder is not a permutation of option ids`);
    }
    if (ex.kind === 'cloze') {
        if (!Array.isArray(ex.blanks) || !ex.blanks.length) err(`${ctx}/${ex.id}: cloze needs blanks`);
        else for (const b of ex.blanks) if (!(b.id && b.answer && b.answer.primary)) err(`${ctx}/${ex.id}: cloze blank needs id + answer.primary`);
    }
    if (ex.kind === 'match') {
        if (!Array.isArray(ex.pairs) || ex.pairs.length < 2) err(`${ctx}/${ex.id}: match needs ≥2 pairs`);
    }
}

function componentByType(week) {
    const map = new Map();
    for (const c of week.components || []) if (c && c.type) map.set(c.type, c);
    return map;
}

async function validateWeek(week, plan, fileName) {
    const issues = [];
    const err = (m) => issues.push(m);
    if (week.schema !== 'yomu-academy.week.v1') err(`bad schema '${week.schema}'`);
    const planned = plan.byId.get(week.id);
    if (!planned) { err(`id '${week.id}' not in week plan`); return issues; }
    if (week.order !== planned.order) err(`order ${week.order} != plan order ${planned.order}`);
    if (week.weekKind !== planned.weekKind) err(`weekKind '${week.weekKind}' != plan '${planned.weekKind}'`);

    // identity + source coverage carried verbatim
    for (const k of ['termId', 'termLabel', 'courseYear', 'moduleId']) {
        if (JSON.stringify(week.identity?.[k]) !== JSON.stringify(planned.identity[k])) err(`identity.${k} not carried verbatim from plan`);
    }
    const planShas = new Set((planned.sourceCoverage.members || []).map((m) => m.payloadSha256));
    const weekShas = new Set((week.sourceCoverage?.members || []).map((m) => m.payloadSha256));
    if (planShas.size !== weekShas.size || [...planShas].some((s) => !weekShas.has(s))) err(`sourceCoverage.members must match plan (${planShas.size} members)`);
    // coverage map covers every source member
    const covered = new Map();
    for (const c of week.sourceCoverage?.coverageMap || []) covered.set(c.payloadSha256, c.status);
    for (const sha of planShas) {
        if (!covered.has(sha)) err(`coverageMap missing worksheet ${sha.slice(0, 12)}…`);
        else if (!['covered', 'gap'].includes(covered.get(sha))) err(`coverageMap status for ${sha.slice(0, 12)}… must be covered|gap`);
    }

    // core authored blocks
    if (!(Array.isArray(week.learningObjectives) && week.learningObjectives.length >= 4)) err('learningObjectives ≥ 4 required');
    if (!week.scene || !Array.isArray(week.scene.lines) || week.scene.lines.length < 4) err('scene.lines ≥ 4 required (dialogue-led)');
    for (const [i, line] of (week.scene?.lines || []).entries()) {
        if (!(PAINTED.has(line.speakerId) || CAMEOS.has(line.speakerId))) err(`scene.lines[${i}].speakerId '${line.speakerId}' not a known cast id`);
        if (!EXPRESSIONS.has(line.expression)) err(`scene.lines[${i}].expression '${line.expression}' invalid`);
        if (!line.japanese || !line.english) err(`scene.lines[${i}] needs japanese + english`);
    }
    for (const id of week.scene?.cast || []) if (!(PAINTED.has(id) || CAMEOS.has(id))) err(`scene.cast '${id}' not a paintable/cameo id`);

    // explanation before exercises
    const expOrder = week.explanation?.order;
    if (typeof expOrder !== 'number') err('explanation.order must be a number');
    if (!(week.explanation?.grammarPoints?.length >= 1)) err('explanation.grammarPoints ≥ 1 required');
    for (const [i, gp] of (week.explanation?.grammarPoints || []).entries()) {
        if (!gp.explanation || !gp.explanation.trim()) err(`explanation.grammarPoints[${i}] needs explanation text`);
        if (!(gp.examples?.length >= 2)) err(`explanation.grammarPoints[${i}] needs ≥2 examples`);
    }

    // components
    const comps = componentByType(week);
    const relaxed = RELAXED_KINDS.has(week.weekKind);
    if (!relaxed) for (const t of REQUIRED_FULL) if (!comps.has(t)) err(`missing required component '${t}'`);
    for (const c of week.components || []) {
        const cx = `component:${c.type}`;
        if (typeof c.order !== 'number' || c.order <= (expOrder ?? Infinity)) err(`${cx}: order must be a number > explanation.order`);
        for (const ex of c.exercises || []) validateExercise(ex, cx, err);
    }
    if (comps.has('listening')) {
        const l = comps.get('listening');
        if (l.transcript?.revealAfterFirstAttempt !== true) err('listening.transcript.revealAfterFirstAttempt must be true');
        if (!l.audio?.script) err('listening.audio.script required (original transcript)');
        if (!l.audioWorksheetPairing) err('listening.audioWorksheetPairing required');
        if (!(l.exercises?.length >= 2)) err('listening needs ≥2 exercises');
    }
    if (comps.has('kanji')) {
        for (const [i, it] of (comps.get('kanji').items || []).entries()) {
            if (!it.character) err(`kanji.items[${i}] missing character`);
            if (it.handwriting?.required !== true) err(`kanji.items[${i}].handwriting.required must be true`);
            if (!it.recognition) err(`kanji.items[${i}].recognition required`);
        }
    }
    if (comps.has('writing')) { const w = comps.get('writing'); if (w.modelAnswer?.revealAfterFirstAttempt !== true || !w.rubric?.criteria?.length) err('writing needs rubric + modelAnswer.revealAfterFirstAttempt'); }
    if (comps.has('speaking')) { const s = comps.get('speaking'); if (s.modelAnswer?.revealAfterFirstAttempt !== true || !s.rubric?.criteria?.length) err('speaking needs rubric + modelAnswer.revealAfterFirstAttempt'); }

    // mission
    if (!(week.mission?.successCriteria?.length >= 4)) err('mission.successCriteria ≥ 4 required');
    if (week.mission?.modelAnswer?.revealAfterFirstAttempt !== true) err('mission.modelAnswer.revealAfterFirstAttempt must be true');

    // srs
    if (JSON.stringify(week.srs?.intervalDays) !== JSON.stringify(INTERVALS)) err('srs.intervalDays must be [1,3,7,14,30]');
    const srsMin = relaxed ? 4 : 8;
    if (!(week.srs?.extracted?.length >= srsMin)) err(`srs.extracted ≥ ${srsMin} required`);

    // cumulative checkpoint
    if (planned.pedagogy.isCheckpoint) {
        const rc = comps.get('review')?.cumulativeCheckpoint;
        if (!rc || rc.isCheckpoint !== true || !(rc.targetsWeekIds?.length)) err('plan marks this a checkpoint: review.cumulativeCheckpoint.isCheckpoint must be true with targets');
    }

    // provenance
    if (week.provenance?.authoringPolicy !== 'original-yomu') err("provenance.authoringPolicy must be 'original-yomu'");
    for (const [i, m] of (week.provenance?.sourceMappings || []).entries()) {
        if (!RELATION.has(m.relation)) err(`provenance.sourceMappings[${i}].relation '${m.relation}' invalid`);
        if (!REUSE.has(m.reuse)) err(`provenance.sourceMappings[${i}].reuse '${m.reuse}' invalid (direct-copy forbidden)`);
    }
    if (!(week.provenance?.sourceMappings?.length >= 1)) err('provenance.sourceMappings ≥ 1 required');

    // voice + privacy scan over authored strings
    const strings = [];
    walkStrings(week, '', strings, false);
    for (const { path, value, underSource } of strings) {
        if (EMAIL.test(value) && !underSource) err(`privacy: email-like text in ${path}`);
        if (PHONE.test(value) && !underSource) err(`privacy: phone-like digit run in ${path}`);
        // Audit fields (source coverage, provenance, textbook mapping) legitimately cite the
        // real source ids; the "universal wording" rule is for learner-facing copy only.
        const isAudit = underSource || path.startsWith('provenance') || path.startsWith('mapping');
        if (isAudit) continue;
        if (INSTITUTION.test(value)) err(`voice: names an institution/platform ("${value.match(INSTITUTION)[0]}") in ${path} — keep it universal`);
        const low = value.toLowerCase();
        for (const slop of AI_SLOP) if (low.includes(slop)) { err(`voice: AI-slop term "${slop}" in ${path}`); break; }
    }
    return issues;
}

async function main() {
    const onlyIdx = process.argv.indexOf('--only');
    const onlyId = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;
    const plan = JSON.parse(await readFile(PLAN, 'utf8'));
    plan.byId = new Map(plan.weeks.map((w) => [w.id, w]));
    let files = [];
    try { files = (await readdir(WEEKS_DIR)).filter((f) => /^\d{3}-.+\.json$/.test(f)); } catch { /* dir may not exist yet */ }
    if (onlyId) files = files.filter((f) => f.includes(onlyId));

    const seen = new Set();
    let totalIssues = 0;
    const report = [];
    for (const f of files.sort()) {
        let week;
        try { week = JSON.parse(await readFile(resolve(WEEKS_DIR, f), 'utf8')); }
        catch (e) { report.push(`✗ ${f}: invalid JSON — ${e.message}`); totalIssues += 1; continue; }
        seen.add(week.id);
        const issues = await validateWeek(week, plan, f);
        if (issues.length) { report.push(`✗ ${f} (${week.id}): ${issues.length} issue(s)`); issues.forEach((i) => report.push(`    - ${i}`)); totalIssues += issues.length; }
        else report.push(`✓ ${f} (${week.id})`);
    }
    const missing = plan.weeks.filter((w) => !seen.has(w.id)).map((w) => w.id);
    process.stdout.write(`${report.join('\n')}\n`);
    process.stdout.write(`\nFiles: ${files.length}/${plan.weeks.length} plan weeks present. Issues: ${totalIssues}. Missing weeks: ${missing.length}${missing.length ? ` (${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''})` : ''}\n`);
    if (totalIssues > 0) process.exitCode = 1;
}

main().catch((e) => { process.stderr.write(`${e.stack}\n`); process.exitCode = 2; });
