#!/usr/bin/env node
// Build the three-year week ledger from Lesson 0 onward.
//
// Spine = the workflow-synthesised chronology model (rules/synthesis.json): 34 ordered
// units across 3 years (Genki I lesson-0..12, Genki II lesson-13..23, post-Genki Minna no
// Nihongo Shokyu II chapters 24-30). Each captured class unit keeps EVERY worksheet as a
// distinct occurrence; byte-identical re-download batches are preserved as duplicate
// occurrences, never collapsed. Assets that carry no chronology (dictionaries, immersion
// subtitles, mega-pack textbooks, kanji reference site, research capture) are listed as
// supporting materials, not folded into weeks.
//
// Reads:  source-ledger.ndjson, rules/synthesis.json
// Writes: week-ledger.json  (+ docs are generated separately)

import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

import { LEDGER_OUT_DIR } from './lib/roots.mjs';
import { makeUnitOf, yearOf as yearOfUnit, resolveUnit } from './lib/chronology.mjs';

const RULES_PATH = join(LEDGER_OUT_DIR, 'rules', 'synthesis.json');

async function loadNdjson(path) {
    const out = [];
    const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    for await (const line of rl) { const t = line.trim(); if (t) out.push(JSON.parse(t)); }
    return out;
}
async function loadJson(path) { return JSON.parse(await readFile(path, 'utf8')); }

async function main() {
    const ledger = await loadNdjson(join(LEDGER_OUT_DIR, 'source-ledger.ndjson'));
    let synthesis = null;
    try { synthesis = await loadJson(RULES_PATH); } catch { /* fall back below */ }

    const files = ledger.filter((r) => r.recordType === 'file');
    const model = synthesis?.chronologyModel;
    const units = (model?.units ?? []).slice().sort((a, b) => a.order - b.order);
    if (!units.length) throw new Error('No chronology units found in synthesis; cannot build week ledger.');

    // Assign each file to at most one unit (deterministic), then group by unit order.
    const unitOf = makeUnitOf(units);
    const byId = new Map(files.map((r) => [r.id, r]));
    const attachedByOrder = new Map();
    const placed = new Set();
    for (const r of files) {
        const u = resolveUnit(r, unitOf, byId);
        if (!u) continue;
        (attachedByOrder.get(u.order) ?? attachedByOrder.set(u.order, []).get(u.order)).push(r);
        placed.add(r.id);
    }

    const weeks = units.map((unit) => {
        const attached = attachedByOrder.get(unit.order) ?? [];
        const byFamily = {};
        for (const r of attached) { (byFamily[r.worksheetFamily] ??= []).push(r.id); }
        // Distinct captured session dates for this unit (class units carry dates).
        const dates = [...new Set(attached.map((r) => r.curriculum.date).filter(Boolean))].sort();
        const grammar = [...new Set([...(unit.grammarPoints ?? []), ...attached.flatMap((r) => r.curriculum.grammarConcepts)])];
        return {
            order: unit.order,
            weekId: unit.unitId,
            label: unit.label,
            textbook: unit.textbook,
            chapter: unit.chapter,
            year: yearOfUnit(model, unit.order).year,
            capturedDates: dates,
            grammarPoints: grammar,
            confidence: unit.confidence,
            evidence: unit.evidence,
            assetCount: attached.length,
            assetsByFamily: byFamily,
            worksheetOccurrences: attached
                .filter((r) => r.kind !== 'audio')
                .map((r) => ({ id: r.id, title: r.sourceTitle, family: r.worksheetFamily, date: r.curriculum.date, isDuplicateOccurrence: r.duplicate.isDuplicate, revisionMarker: r.revisionMarker, sha256: r.sha256 })),
            audioOccurrences: attached
                .filter((r) => r.kind === 'audio')
                .map((r) => ({ id: r.id, title: r.sourceTitle, date: r.curriculum.date, sha256: r.sha256 })),
        };
    });

    // Supporting (non-chronology) materials: everything curricular/tool not placed in a week.
    const supporting = files.filter((r) => !placed.has(r.id));
    const supportingByGroup = {};
    for (const r of supporting) { (supportingByGroup[r.datasetGroup] ??= { count: 0, curricular: r.curricular, kinds: {} }); supportingByGroup[r.datasetGroup].count += 1; supportingByGroup[r.datasetGroup].kinds[r.kind] = (supportingByGroup[r.datasetGroup].kinds[r.kind] ?? 0) + 1; }

    const out = {
        schema: 'yomu-academy-week-ledger/v1',
        overview: model.overview ?? null,
        years: model.years ?? [],
        note: 'Three-year chronological spine from Lesson 0. Every captured worksheet is preserved as a distinct occurrence; byte-identical re-download batches are retained as duplicate occurrences (see source ledger duplicate links). Un-captured structural bridge units (orders 24-27) are low-confidence placeholders derived from the class chapter counter, not from observed files.',
        weekCount: weeks.length,
        placedAssetCount: placed.size,
        weeks,
        supportingMaterials: { note: 'Curricular/reference material that carries no single-week chronology.', byDatasetGroup: supportingByGroup },
        supportingMaterialIds: supporting.map((r) => r.id),
    };
    await writeFile(join(LEDGER_OUT_DIR, 'week-ledger.json'), JSON.stringify(out, null, 2) + '\n');

    process.stdout.write(JSON.stringify({
        weeks: weeks.length,
        placedAssets: placed.size,
        weeksWithAssets: weeks.filter((w) => w.assetCount > 0).length,
        supportingAssets: supporting.length,
    }, null, 2) + '\n');
}
main().catch((err) => { process.stderr.write(`${err?.stack || err}\n`); process.exitCode = 1; });
