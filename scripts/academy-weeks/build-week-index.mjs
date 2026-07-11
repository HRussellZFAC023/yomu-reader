#!/usr/bin/env node
// Emit public/academy/content/weeks/index.json — a machine-readable ordered
// index of the week corpus for a runtime loader to consume without parsing 73
// files. Derived from the plan + authored files; deterministic.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const WEEKS_DIR = resolve(ROOT, 'public', 'academy', 'content', 'weeks');
const PLAN = resolve(HERE, 'generated', 'week-plan.json');
const WEEK_FILE = /^\d{3}-.+\.json$/;

async function main() {
    const plan = JSON.parse(await readFile(PLAN, 'utf8'));
    const files = {};
    for (const f of (await readdir(WEEKS_DIR)).filter((f) => WEEK_FILE.test(f))) {
        try { const w = JSON.parse(await readFile(resolve(WEEKS_DIR, f), 'utf8')); if (w.id) files[w.id] = { file: f, title: w.title }; } catch { /* skip */ }
    }
    const entries = plan.weeks.map((w) => ({
        order: w.order,
        id: w.id,
        file: files[w.id]?.file ?? null,
        weekKind: w.weekKind,
        title: files[w.id]?.title ?? { en: w.identity.title },
        academyYear: w.identity.academyYear,
        termId: w.identity.termId,
        termLabel: w.identity.termLabel,
        courseYear: w.identity.courseYear,
        weekNumberInTerm: w.identity.weekNumberInTerm,
        minnaChapters: w.derivedScope.minnaChapters,
        jlpt: w.derivedScope.jlpt,
        isCheckpoint: w.pedagogy.isCheckpoint,
        prerequisiteWeekIds: w.pedagogy.prerequisiteWeekIds,
        mapping: { ucl: `${w.identity.courseYear || ''} · ${w.identity.termLabel} · ${w.identity.title}`.trim(), minna: w.derivedScope.minnaChapters?.length ? `II/I · ${w.derivedScope.minnaChapters.join(',')}` : null },
    }));
    const index = {
        schema: 'yomu-academy.week-index.v1',
        generated: plan.generatedFrom,
        spine: plan.spine,
        summary: { weekCount: entries.length, authored: entries.filter((e) => e.file).length, checkpoints: entries.filter((e) => e.isCheckpoint).map((e) => e.id) },
        orderings: {
            chronology: entries.map((e) => e.id),
            minna: entries.filter((e) => e.minnaChapters?.length).sort((a, b) => Math.min(...a.minnaChapters) - Math.min(...b.minnaChapters)).map((e) => e.id),
        },
        weeks: entries,
    };
    await writeFile(resolve(WEEKS_DIR, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
    process.stdout.write(`Wrote index.json — ${index.summary.authored}/${index.summary.weekCount} authored.\n`);
}

main().catch((e) => { process.stderr.write(`${e.stack}\n`); process.exitCode = 1; });
