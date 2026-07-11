#!/usr/bin/env node
// Render human-readable ledger docs + machine gaps/extraction-queue from the JSON
// artifacts. Deterministic: docs are regenerated from data, never hand-edited out of sync.

import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

import { LEDGER_OUT_DIR, RAW_DIR, DOCS_DIR } from './lib/roots.mjs';

const P = (f) => join(LEDGER_OUT_DIR, f);
async function loadJson(p) { return JSON.parse(await readFile(p, 'utf8')); }
async function loadNdjson(p) { const out = []; const rl = createInterface({ input: createReadStream(p), crlfDelay: Infinity }); for await (const l of rl) { const t = l.trim(); if (t) out.push(JSON.parse(t)); } return out; }

function table(headers, rows) {
    const h = `| ${headers.join(' | ')} |`;
    const sep = `| ${headers.map(() => '---').join(' | ')} |`;
    const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
    return `${h}\n${sep}\n${body}`;
}
function countsTable(obj, k = 'Key', v = 'Count') {
    return table([k, v], Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([key, val]) => [key, String(val)]));
}

async function main() {
    const summary = await loadJson(P('source-ledger.summary.json'));
    const week = await loadJson(P('week-ledger.json'));
    const recon = await loadJson(P('moodle-reconciliation.json'));
    const sweep = await loadJson(P('sweep-manifest.json'));
    const scan = await loadJson(join(RAW_DIR, 'scan-summary.json'));
    let synthesis = null; try { synthesis = await loadJson(P('rules/synthesis.json')); } catch { /* optional */ }
    const ledger = await loadNdjson(P('source-ledger.ndjson'));
    const files = ledger.filter((r) => r.recordType === 'file');

    // ---------- COVERAGE.md ----------
    const cov = [`# Yomu Academy source-ledger coverage`, '',
        `Generated from \`source-ledger.summary.json\`. The ledger is the private source-of-truth inventory of every Japanese-learning asset discovered on this machine.`, '',
        `## Totals`, '',
        countsTable({
            'Total records': summary.counts.totalRecords,
            'File assets (hashed)': summary.counts.fileAssets,
            'Aggregate datasets': summary.counts.bulkDatasets,
            'Unique payloads (sha256)': summary.counts.uniquePayloads,
            'Duplicate occurrences': summary.counts.duplicateOccurrences,
            'Revision markers (New_)': summary.counts.revisionMarkers,
            'Pairing links': summary.counts.pairingLinks,
            'Moodle-matched assets': summary.counts.moodleMatchedAssets,
        }, 'Measure', 'Value'), '',
        `## By curricular class`, '', countsTable(summary.byCurricular), '',
        `> \`yes\` = real learning material · \`tool\` = dictionaries/userscripts/config · \`no\` = non-JP craft/art demo · \`derivative\` = already-digitised Yomu output.`, '',
        `## By source root`, '', countsTable(summary.byRoot), '',
        `## By dataset group`, '', countsTable(summary.byDatasetGroup), '',
        `## By asset kind`, '', countsTable(summary.byKind), '',
        `## By worksheet family`, '', countsTable(summary.byWorksheetFamily), '',
        `## By rights class`, '', countsTable(summary.byRightsClass), '',
        `## By extraction status`, '', countsTable(summary.byExtractionStatus), '',
        `## By curriculum confidence`, '', countsTable(summary.byConfidence), '',
        `## By textbook`, '', countsTable(summary.byTextbook), '',
        `## Moodle catalog reconciliation`, '',
        countsTable({
            'Catalog payloads (unique)': recon.catalogPayloadCount,
            'Catalog archives': recon.catalogArchiveCount,
            'Disk payloads matching catalog': recon.diskPayloadsMatchingCatalog,
            'Catalog payloads unrecovered on disk': recon.catalogPayloadsUnrecoveredOnDisk,
        }, 'Measure', 'Value'), '',
        `> ${recon.note}`, '',
        `## Scan provenance`, '',
        `Scanned ${scan.scannedRoots.filter((r) => r.available).length} roots; ${scan.counts.skippedUnclassified} non-content files skipped (code, icon libraries, fonts, compiler intermediates); ${scan.counts.errors} read errors.`, '',
    ].join('\n');

    // ---------- WEEK-LEDGER.md ----------
    const wk = [`# Yomu Academy three-year week ledger`, '',
        week.overview ? `${week.overview}` : '', '',
        `> ${week.note}`, '',
        `**${week.weekCount} units** · **${week.placedAssetCount} assets placed in weeks** · ${Object.keys(week.supportingMaterials.byDatasetGroup).length} supporting dataset groups.`, '',
        `## Years`, '',
        table(['Year', 'Label', 'Textbook', 'Unit range'], week.years.map((y) => [String(y.year), y.label, y.textbook, y.unitRange])), '',
        `## Weeks`, '',
    ];
    for (const w of week.weeks) {
        wk.push(`### Week ${w.order} — ${w.label}`);
        const meta = [`Year ${w.year ?? '?'}`, w.textbook, w.chapter ? `Chapter ${w.chapter}` : null, `confidence: **${w.confidence}**`, w.capturedDates.length ? `captured: ${w.capturedDates.join(', ')}` : null].filter(Boolean).join(' · ');
        wk.push(meta);
        if (w.grammarPoints.length) wk.push(`\n_Grammar / concepts:_ ${w.grammarPoints.map((g) => `\`${g}\``).join(', ')}`);
        if (w.assetCount === 0) {
            wk.push(`\n_No worksheets captured for this unit — structural placeholder (see gaps report)._`);
        } else {
            wk.push(`\n_${w.assetCount} assets._ Families: ${Object.entries(w.assetsByFamily).map(([f, ids]) => `${f} (${ids.length})`).join(', ')}`);
            if (w.worksheetOccurrences.length) {
                wk.push('');
                wk.push(table(['Worksheet', 'Family', 'Date', 'Dup', 'Rev'], w.worksheetOccurrences.slice(0, 60).map((o) => [
                    o.title.slice(0, 70).replace(/\|/g, '/'), o.family, o.date || '—', o.isDuplicateOccurrence ? '↺' : '', o.revisionMarker ? 'New_' : '',
                ])));
                if (w.worksheetOccurrences.length > 60) wk.push(`\n_…and ${w.worksheetOccurrences.length - 60} more._`);
            }
            if (w.audioOccurrences.length) wk.push(`\n_Audio (${w.audioOccurrences.length}):_ ${w.audioOccurrences.slice(0, 30).map((a) => a.title).join(', ')}`);
        }
        wk.push('');
    }
    wk.push(`## Supporting materials (no single-week chronology)`, '');
    wk.push(table(['Dataset group', 'Curricular', 'Assets'], Object.entries(week.supportingMaterials.byDatasetGroup).sort((a, b) => b[1].count - a[1].count).map(([g, v]) => [g, v.curricular, String(v.count)])));

    // ---------- GAPS ----------
    const missingAudio = files.filter((r) => r.datasetGroup === 'class-lessons' && /listening|homework|handout/.test(r.worksheetFamily) && r.pairings.audio.length === 0 && r.kind === 'pdf').length;
    const gapsObj = {
        schema: 'yomu-academy-gaps/v1',
        sweptCleanRoots: sweep.sweptCleanRoots,
        moodle: {
            catalogPayloadsUnrecoveredOnDisk: recon.catalogPayloadsUnrecoveredOnDisk,
            note: 'These payloads exist only as classroom occurrences in the metadata-only Moodle corpus; no byte-identical file was found in the scanned roots. Recovery would require re-harvesting the Moodle folder archives.',
        },
        emptyBridgeWeeks: week.weeks.filter((w) => w.assetCount === 0).map((w) => ({ order: w.order, label: w.label, confidence: w.confidence })),
        revisionsWithoutPredecessor: {
            count: summary.counts.revisionsWithoutOnDiskPredecessor,
            note: 'Worksheets marked with the New_ revision prefix whose plain predecessor is not present on disk (replaced in place, or survives only in the Moodle corpus). Recorded as revisions; no supersession link possible.',
        },
        aggregatedDatasets: (scan.bulkDatasets ?? []).map((b) => ({ ...b, note: 'Catalogued as one aggregate record; individual files not hashed.' })).concat([
            { rootId: 'academy-references', relPath: 'rtk', note: 'RTK kanji-reference website (KanjiVG stroke SVGs excluded from hashing as an icon/vector library; per-kanji keyword pages catalogued individually).' },
            { rootId: 'japanese-library', relPath: 'Dictionaries and Tools/*.zip', note: 'Packaged dictionaries catalogued opaque; members are third-party dictionary data, not class resources.' },
        ]),
        missingPairings: { classWorksheetsWithoutPairedAudio: missingAudio },
        synthesisGapsRollup: synthesis?.gapsRollup ?? [],
    };
    const gapsMd = [`# Yomu Academy source-ledger gaps report`, '',
        `Honest record of what is missing, ambiguous, or deliberately un-itemised. Nothing is deleted; every gap is a follow-up, not a loss.`, '',
        `## Locations searched and found clean`, '',
        table(['Location', 'Method', 'JA-learning assets'], gapsObj.sweptCleanRoots.map((r) => [r.absPath, (r.method || '').slice(0, 80), String(r.japaneseLearningAssetsFound ?? 0)])), '',
        `## Moodle corpus not recovered on disk`, '',
        `${gapsObj.moodle.catalogPayloadsUnrecoveredOnDisk} of ${recon.catalogPayloadCount} unique Moodle payloads have no byte-identical file in the scanned roots. ${gapsObj.moodle.note}`, '',
        `## Un-captured curriculum (structural bridge weeks)`, '',
        `The class continued its own chapter counter past Genki's lesson 23 into Minna no Nihongo Shokyū II. Chapters 24–27 were not captured on disk; they appear in the week ledger as empty, **low-confidence** placeholders so the chronology is not silently collapsed:`, '',
        table(['Week', 'Label', 'Confidence'], gapsObj.emptyBridgeWeeks.map((w) => [String(w.order), w.label.slice(0, 60), w.confidence])), '',
        `## Revisions without an on-disk predecessor`, '',
        `${gapsObj.revisionsWithoutPredecessor.count} worksheets carry the \`New_\` revision marker but their plain predecessor is not on disk. ${gapsObj.revisionsWithoutPredecessor.note}`, '',
        `## Aggregated datasets (not itemised per file)`, '',
        table(['Dataset', 'Files', 'Note'], gapsObj.aggregatedDatasets.map((d) => [`${d.rootId}/${d.relPath}`, String(d.fileCount ?? '—'), (d.note || '').slice(0, 90)])), '',
        `## Missing pairings`, '',
        `${gapsObj.missingPairings.classWorksheetsWithoutPairedAudio} class worksheets have no paired audio track in their lesson folder (some worksheets are text-only; flagged for review).`, '',
        `## Curriculum-map gaps surfaced by the mapping pass`, '',
        (gapsObj.synthesisGapsRollup.length ? gapsObj.synthesisGapsRollup.map((g) => `- ${g}`).join('\n') : '_none recorded_'), '',
        `## Skipped (non-content) file audit`, '',
        `The scanner skips files whose extension is not on the learning-content allowlist. This is the full per-extension breakdown so every exclusion is auditable — no genuine curricular file hides in an opaque count. Extensions below are code, icon/vector libraries, fonts, and compiler/build intermediates.`, '',
        table(['Ext', 'Skipped', 'Sample path'], Object.entries(scan.skippedByExtension ?? {}).sort((a, b) => b[1].count - a[1].count).slice(0, 30).map(([ext, v]) => [ext, String(v.count), (v.sample || '').slice(0, 70)])), '',
    ].join('\n');

    // ---------- EXTRACTION QUEUE ----------
    const PRIORITY = [
        { p: 'P1', name: 'Captured class worksheets + audio (Minna L28–30)', filter: (r) => r.datasetGroup === 'class-lessons' && r.extraction.status === 'source-only' },
        { p: 'P2', name: 'Genki study-site backbone (lessons 0–23)', filter: (r) => r.datasetGroup === 'genki-study-site' && r.extraction.status === 'source-only' },
        { p: 'P3', name: 'User vocabulary + immersion subtitles', filter: (r) => (r.datasetGroup === 'user-vocab' || r.datasetGroup === 'immersion-subtitles') && r.extraction.status === 'source-only' },
        { p: 'P4', name: 'Reference textbooks + learning packs (rights review first)', filter: (r) => (r.datasetGroup === 'mega-pack' || r.datasetGroup === 'language-learning-pack' || r.datasetGroup === 'reference-textbooks') && r.extraction.status === 'source-only' },
        { p: 'P5', name: 'RTK kanji reference site', filter: (r) => r.datasetGroup === 'rtk-kanji-site' && r.extraction.status === 'source-only' },
        { p: 'P6', name: 'Tools / dictionaries / research (reference-only, defer extraction)', filter: (r) => r.curricular === 'tool' || r.curricular === 'no' },
    ];
    const queue = PRIORITY.map((tier) => {
        const rs = files.filter(tier.filter);
        const byKind = {}; const byStatus = {};
        for (const r of rs) { byKind[r.kind] = (byKind[r.kind] ?? 0) + 1; byStatus[r.extraction.strategy] = (byStatus[r.extraction.strategy] ?? 0) + 1; }
        return { priority: tier.p, name: tier.name, assetCount: rs.length, byKind, byStrategy: byStatus };
    });
    const queueMd = [`# Yomu Academy per-source extraction queue`, '',
        `Prioritised digitisation work. Highest value first: the real captured class material, then the Genki backbone, then rights-encumbered reference collections, then tools/reference (no extraction).`, '',
        table(['Priority', 'Source', 'Assets', 'Kinds'], queue.map((q) => [q.priority, q.name, String(q.assetCount), Object.entries(q.byKind).map(([k, v]) => `${k}:${v}`).join(' ')])), '',
        ...queue.flatMap((q) => [`## ${q.priority} — ${q.name} (${q.assetCount})`, '', countsTable(q.byStrategy, 'Strategy', 'Assets'), '']),
    ].join('\n');

    // Write everything.
    await writeFile(P('gaps.json'), JSON.stringify(gapsObj, null, 2) + '\n');
    await writeFile(P('extraction-queue.json'), JSON.stringify({ schema: 'yomu-academy-extraction-queue/v1', tiers: queue }, null, 2) + '\n');
    await writeFile(join(DOCS_DIR, 'COVERAGE.md'), cov);
    await writeFile(join(DOCS_DIR, 'WEEK-LEDGER.md'), wk.join('\n') + '\n');
    await writeFile(join(DOCS_DIR, 'GAPS.md'), gapsMd);
    await writeFile(join(DOCS_DIR, 'EXTRACTION-QUEUE.md'), queueMd);

    process.stdout.write(`Rendered COVERAGE.md, WEEK-LEDGER.md, GAPS.md, EXTRACTION-QUEUE.md + gaps.json + extraction-queue.json\n`);
    process.stdout.write(JSON.stringify({ moodleUnrecovered: recon.catalogPayloadsUnrecoveredOnDisk, emptyBridgeWeeks: gapsObj.emptyBridgeWeeks.length, queueTiers: queue.map((q) => `${q.priority}:${q.assetCount}`) }) + '\n');
}

main().catch((err) => { process.stderr.write(`${err?.stack || err}\n`); process.exitCode = 1; });
