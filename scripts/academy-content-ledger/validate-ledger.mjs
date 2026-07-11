#!/usr/bin/env node
// Validate the Yomu Academy source ledger + week ledger against structural invariants
// and report coverage. Exits non-zero if any hard invariant fails. Designed to run in CI
// and as the assertion backbone of the content-ledger test.

import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

import { LEDGER_OUT_DIR, RAW_DIR, CATALOG_PATH } from './lib/roots.mjs';

const SHA_RE = /^sha256:[0-9a-f]{64}$/;

async function loadNdjson(path) {
    const out = [];
    const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    for await (const line of rl) { const t = line.trim(); if (t) out.push(JSON.parse(t)); }
    return out;
}
async function loadJson(path) { return JSON.parse(await readFile(path, 'utf8')); }

export async function validate({ sampleExistence = 40, checkExistence = true } = {}) {
    const errors = [];
    const warnings = [];
    const err = (m) => errors.push(m);
    const warn = (m) => warnings.push(m);

    const ledger = await loadNdjson(join(LEDGER_OUT_DIR, 'source-ledger.ndjson'));
    const summary = await loadJson(join(LEDGER_OUT_DIR, 'source-ledger.summary.json'));
    const rawInv = await loadNdjson(join(RAW_DIR, 'inventory.ndjson'));
    const catalog = await loadJson(CATALOG_PATH).catch(() => null);

    const byId = new Map();
    const files = ledger.filter((r) => r.recordType === 'file');
    const bulk = ledger.filter((r) => r.recordType === 'bulk-dataset');

    // 1. Unique ids; required fields on every file record.
    for (const r of ledger) {
        if (byId.has(r.id)) err(`duplicate id: ${r.id}`);
        byId.set(r.id, r);
    }
    for (const r of files) {
        if (!SHA_RE.test(r.sha256 || '')) err(`bad sha256 on ${r.id}: ${r.sha256}`);
        if (!r.originalAbsPath?.startsWith('/')) err(`non-absolute originalAbsPath on ${r.id}`);
        if (!r.referencePath) err(`missing referencePath on ${r.id}`);
        if (!r.kind) err(`missing kind on ${r.id}`);
        if (!r.worksheetFamily) err(`missing worksheetFamily on ${r.id}`);
        if (!r.rights?.class) err(`missing rights.class on ${r.id}`);
        if (!r.extraction?.status) err(`missing extraction.status on ${r.id}`);
        if (!r.confidence) err(`missing confidence on ${r.id}`);
        if (!r.curriculum) err(`missing curriculum on ${r.id}`);
    }

    // 2. Coverage: every raw file record is represented (no silent drops).
    const rawFileCount = rawInv.filter((r) => r.recordType === 'file').length;
    const rawBulkCount = rawInv.filter((r) => r.recordType === 'bulk-dataset').length;
    if (files.length !== rawFileCount) err(`coverage mismatch: ledger fileAssets ${files.length} != raw file records ${rawFileCount}`);
    if (bulk.length !== rawBulkCount) err(`bulk mismatch: ledger ${bulk.length} != raw ${rawBulkCount}`);
    if (summary.counts.fileAssets !== files.length) err(`summary.counts.fileAssets ${summary.counts.fileAssets} != actual ${files.length}`);

    // 3. Duplicate integrity: isDuplicate <=> shares sha with another record; occurrences resolve.
    const byPayload = new Map();
    for (const r of files) { const g = byPayload.get(r.sha256) ?? []; g.push(r); byPayload.set(r.sha256, g); }
    for (const r of files) {
        const groupSize = byPayload.get(r.sha256).length;
        if (r.duplicate.isDuplicate !== groupSize > 1) err(`duplicate flag wrong on ${r.id} (groupSize ${groupSize})`);
        for (const occ of r.duplicate.occurrences) if (!byId.has(occ)) err(`duplicate occurrence id missing: ${occ} (on ${r.id})`);
    }

    // 4. Supersession: bidirectional, resolvable, acyclic, distinct payloads.
    for (const r of files) {
        const { supersedes, supersededBy } = r.supersession;
        if (supersedes) {
            if (!byId.has(supersedes)) err(`supersedes id missing: ${supersedes} (on ${r.id})`);
            else if (byId.get(supersedes).supersession.supersededBy !== r.id) err(`supersession not bidirectional: ${r.id} <- ${supersedes}`);
            if (supersedes === r.id) err(`self supersession on ${r.id}`);
            if (byId.get(supersedes)?.sha256 === r.sha256) err(`supersession between identical payloads on ${r.id}`);
        }
        if (supersededBy && !byId.has(supersededBy)) err(`supersededBy id missing: ${supersededBy} (on ${r.id})`);
    }

    // 5. Pairing ids resolve.
    for (const r of files) {
        for (const key of ['audio', 'answers', 'slides', 'transcript', 'worksheet']) {
            for (const id of r.pairings?.[key] ?? []) if (!byId.has(id)) err(`pairing.${key} id missing: ${id} (on ${r.id})`);
        }
    }

    // 6. Moodle matches are real catalog payloads.
    if (catalog) {
        const assetShas = new Set((catalog.assets ?? []).map((a) => a.sha256));
        const archiveShas = new Set((catalog.archiveOccurrences ?? []).map((a) => a.sha256));
        for (const r of files) {
            if (r.moodle?.matched) {
                const hex = r.sha256.replace(/^sha256:/, '');
                if (!assetShas.has(hex) && !archiveShas.has(hex)) err(`moodle.matched but sha not in catalog: ${r.id}`);
            }
        }
    }

    // 7. Existence spot-check: sampled originalAbsPaths still exist (no invented content).
    // Skippable because absolute paths are machine-specific; run when the corpus is present.
    if (checkExistence) {
        const sample = files.filter((_, i) => i % Math.max(1, Math.floor(files.length / sampleExistence)) === 0).slice(0, sampleExistence);
        for (const r of sample) {
            try { await stat(r.originalAbsPath); } catch { err(`originalAbsPath does not exist: ${r.originalAbsPath} (${r.id})`); }
        }
    }

    // 8. Week ledger (if present): strictly ordered, no orphaned class-lesson worksheets.
    let week = null;
    try { week = await loadJson(join(LEDGER_OUT_DIR, 'week-ledger.json')); } catch { warn('week-ledger.json not present yet'); }
    if (week) {
        const orders = week.weeks.map((w) => w.order);
        for (let i = 1; i < orders.length; i += 1) if (!(orders[i] > orders[i - 1])) err(`week order not strictly increasing at index ${i}: ${orders[i - 1]} -> ${orders[i]}`);
        const placed = new Set();
        for (const w of week.weeks) for (const fam of Object.values(w.assetsByFamily ?? {})) for (const id of fam) placed.add(id);
        for (const id of week.supportingMaterialIds ?? []) placed.add(id);
        const classWorksheets = files.filter((r) => r.rootId === 'japanese-library' && r.curriculum.lesson != null && /worksheet|exercise|handout|homework|info-gap|vocabulary-sheet|word-card|reading|audio-track/.test(r.worksheetFamily));
        const orphaned = classWorksheets.filter((r) => !placed.has(r.id));
        if (orphaned.length) err(`${orphaned.length} class-lesson assets not placed in any week or supporting list (e.g. ${orphaned[0].id})`);
    }

    return { ok: errors.length === 0, errors, warnings, coverage: { fileAssets: files.length, bulkDatasets: bulk.length, uniquePayloads: byPayload.size, rawFileCount, rawBulkCount } };
}

if (process.argv[1] && process.argv[1].endsWith('validate-ledger.mjs')) {
    validate().then((r) => {
        process.stdout.write(JSON.stringify({ ok: r.ok, coverage: r.coverage, warnings: r.warnings, errorCount: r.errors.length }, null, 2) + '\n');
        for (const e of r.errors) process.stderr.write(`ERROR: ${e}\n`);
        if (!r.ok) process.exitCode = 1;
    }).catch((e) => { process.stderr.write(`${e?.stack || e}\n`); process.exitCode = 1; });
}
