#!/usr/bin/env node
// Generate the human-facing documentation for the weekly-lesson corpus from the
// grounded plan + authored week files. Deterministic and re-runnable.
// Writes docs/academy/content/weeks/{README,COVERAGE,GAPS,ORDERINGS}.md.

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const WEEKS_DIR = resolve(ROOT, 'public', 'academy', 'content', 'weeks');
const DOCS_DIR = resolve(ROOT, 'docs', 'academy', 'content', 'weeks');
const PLAN = resolve(HERE, 'generated', 'week-plan.json');

const TERM_ORDER = ['orientation', 'l1', 'l1plus', 'l2plus', 'l3-2', 'l3plus'];
const TERM_TITLE = {
    orientation: 'Orientation', l1: 'Year 1 · Level 1 (2023/24)', l1plus: 'Year 1 · Level 1+ (2023/24)',
    l2plus: 'Year 2 · Level 2+ (2024/25)', 'l3-2': 'Year 3 · Level 3-2 (2025/26)', l3plus: 'Year 3 · Level 3+ (2025/26)',
};

async function loadWeeks() {
    const byId = {};
    try {
        for (const f of (await readdir(WEEKS_DIR)).filter((f) => /^\d{3}-.+\.json$/.test(f))) {
            try { const w = JSON.parse(await readFile(resolve(WEEKS_DIR, f), 'utf8')); byId[w.id] = { file: f, week: w }; } catch { /* skip */ }
        }
    } catch { /* empty */ }
    return byId;
}

function esc(s) { return String(s ?? '').replace(/\|/g, '\\|'); }

async function main() {
    const plan = JSON.parse(await readFile(PLAN, 'utf8'));
    const authored = await loadWeeks();
    await mkdir(DOCS_DIR, { recursive: true });

    // README
    const readme = [
        '# Yomu Academy — Weekly Course (3 years)',
        '',
        'This is the complete weekly synthesis of a real three-year evening Japanese course,',
        'rebuilt as original Yomu Academy content. Lesson 0 (orientation) is followed by every',
        `discovered class week across five terms — **${plan.weeks.length} weeks** covering Minna no Nihongo I & II,`,
        'chapters 1–36 (N5 → N4).',
        '',
        '## How it is built',
        '',
        '1. **Discovery** — `scripts/academy-weeks/build-week-source-ledger.mjs` reads the raw UCL Moodle',
        '   harvest (96 ZIP archives, 916 worksheet files) into a metadata-only per-week ledger, cross-',
        '   referenced to `public/academy/catalog.json` by payload SHA-256. No source bytes are copied.',
        '2. **Plan** — `build-week-plan.mjs` turns the ledger into the grounded spine',
        '   (`generated/week-plan.json`): each week\'s identity, source coverage, Minna-chapter scope',
        '   (anchored to real worksheet titles), grammar points, kanji, prerequisites, spiral review,',
        '   cumulative checkpoints, and recommended cast.',
        '3. **Authoring** — one worker per week wrote an original lesson under',
        '   `public/academy/content/weeks/` covering that week\'s source function. Grammar and chapter',
        '   scope are public textbook facts; all wording, dialogue, exercises, and audio scripts are new.',
        '4. **Validation** — `validate-weeks.mjs` gates every file against `WEEK-SCHEMA.md`;',
        '   `coverage-audit.mjs` checks every source worksheet is accounted for.',
        '',
        '## What every week contains',
        '',
        '- A dialogue-led opening scene with named cast and expression cues, explanation before any',
        '  exercise, and the full component set: authentic input, vocabulary, grammar, listening',
        '  (with an original transcript revealed after the first attempt, paired to source audio),',
        '  reading, speaking (with recording + rubric), writing (rubric + model answer), kanji',
        '  (recognition **and** embedded handwriting), cumulative review, and a real-world mission.',
        '- Deterministic auto-grading with specific wrong-answer explanations; SRS extraction',
        '  (`[1,3,7,14,30]` day ladder) and cumulative checkpoints.',
        '- Source-coverage metadata naming exactly which worksheets the week covers, and any',
        '  unresolved gaps marked for human review.',
        '',
        '## Ordering modes',
        '',
        'Each week records `mapping` with `ucl` (class chronology), `minna`, `genki` (grammar overlay),',
        '`jlpt`, and `customOrders`, so the corpus can be sequenced by class chronology, by Minna no',
        'Nihongo, by Genki-equivalent grammar, by JLPT band, or a custom learning order. See',
        '[ORDERINGS.md](ORDERINGS.md).',
        '',
        'See [COVERAGE.md](COVERAGE.md) for the full week-by-week source map and [GAPS.md](GAPS.md)',
        'for everything flagged for human review.',
        '',
    ].join('\n');
    await writeFile(resolve(DOCS_DIR, 'README.md'), `${readme}\n`);

    // COVERAGE
    const cov = ['# Weekly Coverage Map', '', 'Every discovered class week, in class chronology, with its grounded Minna scope and the real', 'worksheets it covers. `✓` = authored file present. Chapter numbers are anchored to actual', 'worksheet titles in the source harvest.', ''];
    for (const termId of TERM_ORDER) {
        const weeks = plan.weeks.filter((w) => w.identity.termId === termId);
        if (!weeks.length) continue;
        cov.push(`## ${TERM_TITLE[termId] || termId}`, '');
        cov.push('| # | Week | Kind | Minna ch | Grammar focus | Worksheets | File |');
        cov.push('|---|---|---|---|---|---|---|');
        for (const w of weeks) {
            const a = authored[w.id];
            const grammar = (w.derivedScope.grammarPoints || []).slice(0, 3).map(esc).join('; ') || '—';
            const chs = (w.derivedScope.minnaChapters || []).join(', ') || '—';
            const sheets = w.sourceCoverage.members?.length || 0;
            cov.push(`| ${w.order} | ${esc(w.identity.title)} | ${w.weekKind} | ${chs} | ${grammar} | ${sheets} | ${a ? '✓ `' + a.file + '`' : '—'} |`);
        }
        cov.push('');
    }
    await writeFile(resolve(DOCS_DIR, 'COVERAGE.md'), `${cov.join('\n')}\n`);

    // ORDERINGS
    const ord = ['# Learning Orders', '', 'The same weeks, navigable five ways. Class chronology is the primary spine.', '',
        '## By class chronology (default)', '', plan.weeks.map((w) => `${String(w.order).padStart(3, '0')}. ${w.identity.title} — ${w.identity.termLabel}`).join('\n'), '',
        '## By Minna no Nihongo chapter', '',
        [...plan.weeks].filter((w) => w.derivedScope.minnaChapters?.length).sort((a, b) => Math.min(...a.derivedScope.minnaChapters) - Math.min(...b.derivedScope.minnaChapters)).map((w) => `Ch ${w.derivedScope.minnaChapters.join('/')} — ${w.identity.title} (${w.identity.termLabel})`).join('\n'), '',
        '## By JLPT band', '',
        ['pre-N5', 'N5', 'N4'].map((band) => `**${band}**: ` + plan.weeks.filter((w) => (w.derivedScope.jlpt || '').startsWith(band) || (band === 'pre-N5' && !w.derivedScope.minnaChapters?.length)).map((w) => w.identity.title).length + ' weeks').join('\n'), '',
        'Genki grammar equivalence and custom orders are recorded per-week in each file\'s `mapping`.',
        '',
    ].join('\n');
    await writeFile(resolve(DOCS_DIR, 'ORDERINGS.md'), `${ord}\n`);

    // GAPS
    const gaps = ['# Gaps for Human Review', '', 'Nothing here was invented. These are the honest edges of the source material.', '', '## Curriculum-level gaps', ''];
    for (const g of plan.curriculumGaps || []) gaps.push(`- ${g}`);
    gaps.push('', '## Per-week gaps flagged by authors', '');
    let anyWeekGap = false;
    for (const termId of TERM_ORDER) {
        for (const w of plan.weeks.filter((x) => x.identity.termId === termId)) {
            const a = authored[w.id];
            const wg = [...(w.sourceCoverage.gaps || []), ...(a?.week?.provenance?.gaps || [])];
            const mapGaps = (a?.week?.sourceCoverage?.coverageMap || []).filter((c) => c.status === 'gap');
            if (!wg.length && !mapGaps.length) continue;
            anyWeekGap = true;
            gaps.push(`### ${w.identity.title} (${w.id})`);
            for (const g of wg) gaps.push(`- ${g}`);
            for (const c of mapGaps) gaps.push(`- Worksheet gap: ${esc(c.worksheetTitle || c.payloadSha256)} — ${esc(c.howCovered || 'needs source recovery')}`);
            gaps.push('');
        }
    }
    if (!anyWeekGap) gaps.push('_No per-week gaps flagged (run after authoring completes to populate)._', '');
    await writeFile(resolve(DOCS_DIR, 'GAPS.md'), `${gaps.join('\n')}\n`);

    process.stdout.write(`Wrote README.md, COVERAGE.md, ORDERINGS.md, GAPS.md to ${DOCS_DIR}\n`);
}

main().catch((e) => { process.stderr.write(`${e.stack}\n`); process.exitCode = 1; });
