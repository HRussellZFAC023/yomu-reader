#!/usr/bin/env node
// Deterministic coverage audit: cross-check every authored week against the
// grounded plan and the source ledger. Reports missing files, source members
// not accounted for, all gaps flagged for human review, and per-term coverage.
// Complements the adversarial LLM coverage reviewer with a mechanical ground truth.
//
// Emits generated/coverage-audit.json and a human summary to stdout.
// Exit non-zero if any plan week is missing a file or any source member is
// unaccounted for (neither covered nor explicitly gap).

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const WEEKS_DIR = resolve(ROOT, 'public', 'academy', 'content', 'weeks');
const PLAN = resolve(HERE, 'generated', 'week-plan.json');
const OUT = resolve(HERE, 'generated', 'coverage-audit.json');

async function main() {
    const plan = JSON.parse(await readFile(PLAN, 'utf8'));
    const filesByName = {};
    try {
        for (const f of (await readdir(WEEKS_DIR)).filter((f) => /^\d{3}-.+\.json$/.test(f))) {
            try { filesByName[f] = JSON.parse(await readFile(resolve(WEEKS_DIR, f), 'utf8')); } catch { filesByName[f] = null; }
        }
    } catch { /* dir may be empty */ }
    const byId = {};
    for (const [f, w] of Object.entries(filesByName)) if (w && w.id) byId[w.id] = { file: f, week: w };

    const terms = {};
    const missing = [];
    const badJson = Object.entries(filesByName).filter(([, w]) => w === null).map(([f]) => f);
    const allGaps = [];
    let sourceMembersTotal = 0;
    let sourceMembersCovered = 0;
    let sourceMembersGap = 0;
    let sourceMembersUnaccounted = 0;

    for (const pw of plan.weeks) {
        const t = pw.identity.termId;
        terms[t] = terms[t] || { weeks: 0, present: 0, members: 0, covered: 0, gaps: 0, unaccounted: 0 };
        terms[t].weeks += 1;
        const entry = byId[pw.id];
        if (!entry) { missing.push(pw.id); continue; }
        terms[t].present += 1;
        const planShas = new Map((pw.sourceCoverage.members || []).map((m) => [m.payloadSha256, m.title]));
        const cov = new Map((entry.week.sourceCoverage?.coverageMap || []).map((c) => [c.payloadSha256, c]));
        for (const [sha, title] of planShas) {
            sourceMembersTotal += 1; terms[t].members += 1;
            const c = cov.get(sha);
            if (!c) { sourceMembersUnaccounted += 1; terms[t].unaccounted += 1; allGaps.push({ weekId: pw.id, worksheet: title, kind: 'unaccounted' }); }
            else if (c.status === 'gap') { sourceMembersGap += 1; terms[t].gaps += 1; allGaps.push({ weekId: pw.id, worksheet: title, kind: 'gap', howCovered: c.howCovered || null }); }
            else { sourceMembersCovered += 1; terms[t].covered += 1; }
        }
        // provenance-level gaps flagged by the author
        for (const g of entry.week.provenance?.gaps || []) allGaps.push({ weekId: pw.id, worksheet: null, kind: 'provenance-gap', note: g });
    }

    const audit = {
        schema: 'yomu-academy.coverage-audit.v1',
        summary: {
            planWeeks: plan.weeks.length,
            filesPresent: Object.keys(byId).length,
            missingWeeks: missing.length,
            badJson: badJson.length,
            sourceMembersTotal, sourceMembersCovered, sourceMembersGap, sourceMembersUnaccounted,
            coveragePercent: sourceMembersTotal ? Math.round((sourceMembersCovered / sourceMembersTotal) * 1000) / 10 : 0,
        },
        byTerm: terms,
        missingWeeks: missing,
        badJson,
        gapsForHumanReview: allGaps,
        curriculumGaps: plan.curriculumGaps || [],
    };
    await mkdir(resolve(OUT, '..'), { recursive: true });
    await writeFile(OUT, `${JSON.stringify(audit, null, 2)}\n`);

    const lines = [];
    lines.push(`Coverage audit — ${audit.summary.filesPresent}/${audit.summary.planWeeks} weeks present, ${audit.summary.coveragePercent}% worksheets covered`);
    lines.push(`  worksheets: ${sourceMembersCovered} covered · ${sourceMembersGap} gap · ${sourceMembersUnaccounted} UNACCOUNTED (of ${sourceMembersTotal})`);
    for (const [t, s] of Object.entries(terms)) lines.push(`  ${t}: ${s.present}/${s.weeks} weeks · ${s.covered}/${s.members} worksheets covered · ${s.gaps} gap · ${s.unaccounted} unaccounted`);
    if (missing.length) lines.push(`  MISSING WEEKS (${missing.length}): ${missing.join(', ')}`);
    if (badJson.length) lines.push(`  BAD JSON (${badJson.length}): ${badJson.join(', ')}`);
    const reviewGaps = allGaps.filter((g) => g.kind !== 'provenance-gap');
    lines.push(`  gaps + unaccounted flagged for human review: ${reviewGaps.length}`);
    process.stdout.write(`${lines.join('\n')}\n`);

    if (missing.length || sourceMembersUnaccounted || badJson.length) process.exitCode = 1;
}

main().catch((e) => { process.stderr.write(`${e.stack}\n`); process.exitCode = 2; });
