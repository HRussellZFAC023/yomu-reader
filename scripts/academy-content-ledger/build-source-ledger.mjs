#!/usr/bin/env node
// Build the canonical Yomu Academy source ledger from the raw scan inventory.
//
// One record per source asset with: stable id, sha256, original absolute path,
// reference path, curriculum coordinates (course/year/term/week/lesson/chapter/date),
// source title, kind, worksheet family, language level, lesson concepts, paired
// audio/answers/slides/transcript, duplicate + supersession links, Moodle catalog
// reconciliation, rights/provenance, extraction status, and confidence.
//
// Reads:  public/academy/content/source-ledger/raw/inventory.ndjson
//         public/academy/catalog.json  (metadata-only Moodle corpus; matched by sha256)
//         public/academy/content/source-ledger/rules/synthesis.json  (optional; workflow-derived)
// Writes: public/academy/content/source-ledger/source-ledger.ndjson
//         public/academy/content/source-ledger/source-ledger.summary.json
//         public/academy/content/source-ledger/moodle-reconciliation.json

import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

import { LEDGER_SCHEMA, LEDGER_OUT_DIR, RAW_DIR, CATALOG_PATH, contentRoots } from './lib/roots.mjs';
import {
    sourceTitle, titleStem, isRevision, isCompleted, parseChapter, parseLessonFolder,
    parseGenkiLesson, grammarPoints, worksheetFamily, inferLevel, inferTextbook,
} from './lib/infer.mjs';
import { makeUnitOf, yearOf, resolveUnit } from './lib/chronology.mjs';

const RULES_PATH = join(LEDGER_OUT_DIR, 'rules', 'synthesis.json');

async function loadNdjson(path) {
    const records = [];
    const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    for await (const line of rl) { const t = line.trim(); if (t) records.push(JSON.parse(t)); }
    return records;
}

async function loadJsonMaybe(path) {
    try { await stat(path); return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}

// ---- provenance classification: curricular flag, dataset grouping, role, rights ----
// Every scanned file is retained (completeness), but precisely classified so non-class
// reference material (a Japan travel-planner demo, UI sample apps, packaged dictionaries,
// a scraped listening mirror) does not misrepresent the curriculum. `curricular`:
//   'yes'         real learning material (class handouts, textbooks, kanji/immersion refs)
//   'tool'        dictionaries / userscripts / configs used for study but not content
//   'no'          non-Japanese-learning craft/art/demo reference
//   'derivative'  already-digitised Yomu production output
function classifyProvenance(rootId, relPath) {
    const p = relPath.toLowerCase();
    if (rootId === 'japanese-library') {
        if (p.startsWith('lessons/')) return { curricular: 'yes', datasetGroup: 'class-lessons', role: 'class-material', rights: { class: 'personal-class-material', note: 'Paid-course handouts/homework/audio; personal study copies. Provenance + scope reference only — not for redistribution.' } };
        if (p.includes('genki-study-resources')) return { curricular: 'yes', datasetGroup: 'genki-study-site', role: 'study-site-backbone', rights: { class: 'open-source-study-site', note: 'Open-source Genki study resources site (has LICENSE). Backbone chronology reference.' } };
        if (p.startsWith('resource packs/japanese mega learning pack')) return { curricular: 'yes', datasetGroup: 'mega-pack', role: 'redistributed-collection', rights: { class: 'third-party-redistributed-collection', note: 'Bundled third-party textbooks/collections. Reference + provenance only; do not republish source bytes.' } };
        if (p.startsWith('resource packs/')) return { curricular: 'yes', datasetGroup: 'language-learning-pack', role: 'redistributed-collection', rights: { class: 'third-party-redistributed-collection', note: 'Bundled third-party learning pack. Reference + provenance only.' } };
        if (p.startsWith('dictionaries and tools/')) return { curricular: 'tool', datasetGroup: 'dictionaries-tools', role: 'dictionary-tool', rights: { class: 'third-party-dictionary-tool', note: 'Packaged dictionaries / tool data (yomitan, forvo, nhk, etc.). Tool reference only.' } };
        if (p.startsWith('subtitles/')) return { curricular: 'yes', datasetGroup: 'immersion-subtitles', role: 'immersion-supporting', rights: { class: 'third-party-subtitle-immersion', note: 'Subtitle/caption files (incl. commercial Netflix/Blu-ray rips) used for immersion. Third-party copyrighted underlying works — reference only, not republishable.' } };
        if (p.startsWith('vocabulary/')) return { curricular: 'yes', datasetGroup: 'user-vocab', role: 'user-notes', rights: { class: 'personal-user-notes', note: 'User-authored vocabulary lists.' } };
        return { curricular: 'yes', datasetGroup: 'reference-textbooks', role: 'reference-textbook', rights: { class: 'third-party-textbook', note: 'Loose textbook/reference PDF (e.g. Kanji Look and Learn). Reference + provenance only.' } };
    }
    if (rootId === 'soya-research') return { curricular: 'tool', datasetGroup: 'soya-listening-capture', role: 'research-reference', rights: { class: 'third-party-scraped-web-reference', note: 'Research capture of soya-eagle-online.com. Modality/provenance reference only; not republishable.' } };
    if (rootId === 'academy-references') {
        if (p.startsWith('rtk/')) return { curricular: 'yes', datasetGroup: 'rtk-kanji-site', role: 'kanji-reference-site', rights: { class: 'open-source-kanji-reference', note: 'Remembering-the-Kanji reference site clone (KanjiVG stroke data + per-kanji keyword pages).' } };
        if (p.startsWith('uchidb/') || p.startsWith('jpdb-immersion-kit-examples/') || p.startsWith('chatgptautomator/')) return { curricular: 'tool', datasetGroup: 'jp-userscripts', role: 'study-userscript', rights: { class: 'third-party-open-source-tool', note: 'Japanese-study userscript/tool (jpdb/immersion helpers).' } };
        if (p.startsWith('japlan/')) return { curricular: 'no', datasetGroup: 'japlan-travel', role: 'craft-reference', rights: { class: 'internal-craft-reference', note: 'Japan travel-planner demo (travel, not language learning).' } };
        return { curricular: 'no', datasetGroup: 'ui-demos', role: 'craft-reference', rights: { class: 'internal-craft-reference', note: 'Cloned UX/craft sample app; no curricular content.' } };
    }
    if (rootId === 'class-photos') return { curricular: 'no', datasetGroup: 'art-reference', role: 'art-reference', rights: { class: 'internal-art-reference', note: 'Character/cast art reference imagery.' } };
    if (rootId === 'academy-public') {
        // Not every academy-public asset is Yomu-original: CC0/licensed assets and reference
        // imagery are third-party. Detect them by filename/path markers rather than blanket-labelling.
        if (/\bcc0\b|cc-by|licen[cs]e|public-domain/.test(p) || /(^|\/)(refs?|reference|style-bible)\//.test(p)) {
            return { curricular: 'no', datasetGroup: 'yomu-production', role: 'licensed-or-reference-asset', rights: { class: 'third-party-licensed-asset', note: 'CC0/licensed or reference asset bundled into production — third-party provenance, not Yomu-original.' } };
        }
        return { curricular: 'derivative', datasetGroup: 'yomu-production', role: 'production', rights: { class: 'yomu-original-production', note: 'Yomu Academy production asset (already digitised / original).' } };
    }
    return { curricular: 'no', datasetGroup: 'unclassified', role: 'unclassified', rights: { class: 'unclassified', note: '' } };
}

function extractionFor(rootId, kind, recordType) {
    if (recordType === 'bulk-dataset') return { status: 'aggregate-reference', strategy: 'catalogued-as-dataset; individual extraction out of scope' };
    if (rootId === 'academy-public') return { status: 'already-digitised', strategy: 'none' };
    if (rootId === 'academy-references' || rootId === 'class-photos') return { status: 'reference-only', strategy: 'none' };
    switch (kind) {
        case 'audio': return { status: 'source-only', strategy: 'rights-review + transcode + transcript alignment' };
        case 'video': return { status: 'source-only', strategy: 'rights-review + subtitle/transcript extraction' };
        case 'subtitle': return { status: 'source-only', strategy: 'cue extraction + media pairing' };
        case 'image': return { status: 'source-only', strategy: 'rights-review + original-derivative' };
        case 'pdf': case 'document': case 'document-web': return { status: 'source-only', strategy: 'rights-review + text/structure extraction' };
        case 'deck': return { status: 'source-only', strategy: 'rights-review + slide text extraction' };
        case 'spreadsheet': return { status: 'source-only', strategy: 'tabular ingestion (vocab rows)' };
        case 'ebook': return { status: 'source-only', strategy: 'rights-review + chapter/text extraction' };
        case 'anki-deck': return { status: 'source-only', strategy: 'deck inspection (notes + media)' };
        case 'archive': return { status: 'source-only', strategy: 'inspect / extract-or-defer' };
        case 'disc-image': return { status: 'source-only', strategy: 'mount/extract disc contents (audio-course CD)' };
        case 'interactive': return { status: 'source-only', strategy: 'legacy Flash — transcode/re-author content (SWF no longer runnable)' };
        case 'study-game-deck': return { status: 'source-only', strategy: 'proprietary deck — extract vocab list if format decodable' };
        case 'dictionary-db': return { status: 'source-only', strategy: 'Access DB — export tables to structured vocab' };
        case 'data': return { status: 'catalogued', strategy: 'structured-reference (dictionary/config/map)' };
        default: return { status: 'source-only', strategy: 'triage' };
    }
}

// ---- per-record curriculum inference ----

function inferCurriculum(rec) {
    const rel = rec.relPath;
    const name = rec.name;
    const segs = rel.split('/');
    const c = {
        textbook: null, course: null, year: null, term: null, week: null,
        lesson: null, chapter: null, subsection: null, date: null,
        grammarConcepts: [], level: null, levelBasis: null,
        confidence: 'low', basis: [],
    };

    // Real class lesson folder: Lessons/Lesson N-YYYYMMDD/<sub>/<file>
    const lessonSeg = segs.find((s) => /lesson\s*\d+-\d{8}/i.test(s));
    if (lessonSeg) {
        const lf = parseLessonFolder(lessonSeg);
        if (lf) { c.lesson = lf.lesson; c.date = lf.dateISO; c.course = 'UCL Japanese class (captured term)'; c.basis.push('class-lesson-folder'); }
    }
    // genki-study-resources lesson-K
    const genkiSeg = segs.find((s) => /^lesson-\d{1,2}$/i.test(s));
    if (genkiSeg) { const gk = parseGenkiLesson(genkiSeg); if (gk !== null) { c.lesson = gk; c.textbook = 'Genki'; c.course = 'Genki study-site backbone'; c.basis.push('genki-study-lesson'); } }

    // Textbook from whole path.
    c.textbook = c.textbook || inferTextbook(rel.toLowerCase());

    // Chapter + subsection + grammar from filename (strongest curricular signal here).
    // NB: a bare "Chapter N" token does NOT itself name a textbook — the textbook for the
    // class chapters is an evidence-cited inference from the grammar-sequence analysis and is
    // filled from the chronology synthesis later (basis: textbook-from-chronology-synthesis),
    // not fabricated from the filename here.
    const ch = parseChapter(name) || parseChapter(rel);
    if (ch) { c.chapter = ch.chapter; c.subsection = ch.subsection; c.basis.push('chapter-token'); }
    c.grammarConcepts = grammarPoints(name);
    if (c.grammarConcepts.length) c.basis.push('grammar-point-token');

    // Level.
    const lvl = inferLevel(rel.toLowerCase());
    if (lvl) { c.level = lvl.level; c.levelBasis = lvl.basis; }

    // Confidence: chapter or lesson known + a date/grammar corroboration → higher.
    const strong = (c.chapter != null || c.lesson != null);
    if (strong && (c.date || c.grammarConcepts.length)) c.confidence = 'high';
    else if (strong) c.confidence = 'medium';
    else if (c.textbook || c.level) c.confidence = 'low';
    else c.confidence = 'none';
    return c;
}

// Sub-role within a lesson folder (Handouts/Homework/audio materials/Info gap).
function lessonSubRole(relPath) {
    const p = relPath.toLowerCase();
    if (/\/homework\//.test(p)) return 'homework';
    if (/\/handouts?\//.test(p)) return 'handout';
    if (/\/audio materials?\//.test(p)) return 'audio-material';
    if (/\/info gap/.test(p)) return 'info-gap';
    return null;
}

function main() { return run(); }

async function run() {
    const inv = await loadNdjson(join(RAW_DIR, 'inventory.ndjson'));
    const catalog = await loadJsonMaybe(CATALOG_PATH);
    const rules = await loadJsonMaybe(RULES_PATH);

    // Moodle sha maps.
    const assetSha = new Map();
    const archiveSha = new Map();
    if (catalog) {
        for (const a of catalog.assets ?? []) assetSha.set(a.sha256, a);
        for (const ar of catalog.archiveOccurrences ?? []) archiveSha.set(ar.sha256, ar);
    }

    // Build enriched records.
    const records = inv.map((rec) => {
        if (rec.recordType === 'bulk-dataset') {
            const prov = classifyProvenance(rec.rootId, rec.relPath);
            return {
                id: `${rec.rootId}:${rec.relPath}`,
                payloadId: null, sha256: null, recordType: 'bulk-dataset',
                rootId: rec.rootId, rootRole: rec.rootRole,
                curricular: prov.curricular, datasetGroup: prov.datasetGroup, role: prov.role,
                originalAbsPath: rec.absPath, referencePath: rec.relPath,
                sourceTitle: rec.relPath, kind: 'dataset', worksheetFamily: 'dataset',
                byteLength: rec.totalBytes, fileCount: rec.fileCount, byKind: rec.byKind,
                curriculum: { confidence: 'n/a', basis: ['aggregate-dataset'] },
                rights: prov.rights,
                extraction: extractionFor(rec.rootId, 'dataset', 'bulk-dataset'),
                provenance: { note: rec.note },
                confidence: 'n/a',
            };
        }
        const curriculum = inferCurriculum(rec);
        const prov = classifyProvenance(rec.rootId, rec.relPath);
        const shaHex = rec.sha256?.replace(/^sha256:/, '') ?? null;
        const asset = shaHex ? assetSha.get(shaHex) : null;
        const archive = shaHex ? archiveSha.get(shaHex) : null;
        const subRole = lessonSubRole(rec.relPath);
        return {
            id: `${rec.rootId}:${rec.relPath}`,
            payloadId: rec.sha256, sha256: rec.sha256, recordType: 'file',
            rootId: rec.rootId, rootRole: rec.rootRole,
            curricular: prov.curricular, datasetGroup: prov.datasetGroup, role: prov.role,
            originalAbsPath: rec.absPath, referencePath: rec.relPath,
            sourceTitle: sourceTitle(rec.name),
            kind: rec.kind, worksheetFamily: worksheetFamily(rec.name, rec.kind),
            lessonSubRole: subRole,
            ext: rec.ext, byteLength: rec.byteLength, mtimeISO: rec.mtimeISO,
            archiveMemberCount: rec.archiveMemberCount ?? null,
            curriculum,
            revisionMarker: isRevision(rec.name), completedMarker: isCompleted(rec.name),
            pairings: { audio: [], answers: [], slides: [], transcript: [], worksheet: [] },
            duplicate: { isDuplicate: false, payloadGroupSize: 1, occurrences: [] },
            supersession: { supersedes: null, supersededBy: null, basis: null },
            moodle: asset
                ? { matched: true, matchType: 'member-payload', payloadSha256: shaHex, occurrenceCount: asset.occurrenceCount, archiveOccurrenceCount: asset.archiveOccurrenceCount, classification: asset.classifications?.[0] ?? null, note: 'Same payload appears in the metadata-only Moodle corpus.' }
                : archive
                    ? { matched: true, matchType: 'archive-payload', payloadSha256: shaHex, note: 'Disk file is one of the Moodle folder archives.' }
                    : { matched: false },
            rights: prov.rights,
            extraction: extractionFor(rec.rootId, rec.kind, 'file'),
            provenance: { rootRole: rec.rootRole, datasetGroup: prov.datasetGroup },
            _stem: titleStem(rec.name),
            confidence: curriculum.confidence,
        };
    });

    // Dedup by payload sha256.
    const byPayload = new Map();
    for (const r of records) { if (!r.sha256) continue; (byPayload.get(r.sha256) ?? byPayload.set(r.sha256, []).get(r.sha256)).push(r); }
    for (const group of byPayload.values()) {
        if (group.length <= 1) continue;
        const ids = group.map((r) => r.id);
        for (const r of group) { r.duplicate = { isDuplicate: true, payloadGroupSize: group.length, occurrences: ids.filter((x) => x !== r.id) }; }
    }

    // Supersession (deliberately narrow). In this corpus the dated re-download batches are
    // byte-identical (handled as duplicates by sha256), so the only genuine revision signal
    // is the "New_" filename prefix marking a revised worksheet. A supersession link is
    // emitted only when, within the same curricular class material and the SAME chapter +
    // sub-section + title stem, a "New_" (revised) payload and a distinct plain payload both
    // exist. This never fires on generic web-clone fragments (they carry no chapter).
    const eligibleForSuper = (r) => r.recordType === 'file' && r.curricular === 'yes'
        && (r.datasetGroup === 'class-lessons' || r.datasetGroup === 'reference-textbooks')
        && r.curriculum.chapter != null;
    const superKey = (r) => `${r.datasetGroup}|${r.curriculum.chapter}|${r.curriculum.subsection ?? 'x'}|${r._stem}`;
    const bySuper = new Map();
    for (const r of records) { if (!eligibleForSuper(r)) continue; const k = superKey(r); (bySuper.get(k) ?? bySuper.set(k, []).get(k)).push(r); }
    let supersessionLinks = 0;
    for (const group of bySuper.values()) {
        // Distinct payloads only (identical payloads are duplicates, not supersessions).
        const distinct = [...new Map(group.map((r) => [r.sha256, r])).values()];
        if (distinct.length <= 1) continue;
        const revised = distinct.filter((r) => r.revisionMarker);
        const plain = distinct.filter((r) => !r.revisionMarker);
        // Require a genuine revised-vs-plain relationship.
        if (!revised.length || !plain.length) continue;
        // Order plain (older) before revised (newer); link the newest plain to the newest revised.
        const older = plain.sort((a, b) => (a.mtimeISO < b.mtimeISO ? -1 : 1)).slice(-1)[0];
        const newer = revised.sort((a, b) => (a.mtimeISO < b.mtimeISO ? -1 : 1)).slice(-1)[0];
        older.supersession.supersededBy = newer.id;
        newer.supersession.supersedes = older.id;
        older.supersession.basis = 'superseded by New_ revised worksheet (same chapter + title)';
        newer.supersession.basis = 'revises the plain worksheet (same chapter + title)';
        supersessionLinks += 1;
    }

    // Pairings within a class lesson folder: link worksheets<->audio<->answers by chapter.
    const lessonBuckets = new Map();
    for (const r of records) {
        if (r.rootId !== 'japanese-library' || r.curriculum.lesson == null || r.recordType !== 'file') continue;
        const k = `${r.curriculum.lesson}|${r.curriculum.date ?? ''}`;
        (lessonBuckets.get(k) ?? lessonBuckets.set(k, []).get(k)).push(r);
    }
    let pairingLinks = 0;
    for (const bucket of lessonBuckets.values()) {
        const audio = bucket.filter((r) => r.kind === 'audio');
        const answers = bucket.filter((r) => r.worksheetFamily === 'answer-key' || r.completedMarker);
        const slides = bucket.filter((r) => r.kind === 'deck');
        const transcript = bucket.filter((r) => r.worksheetFamily === 'transcript');
        const worksheets = bucket.filter((r) => /worksheet|exercise|handout|homework|info-gap|vocabulary-sheet|word-card|reading/.test(r.worksheetFamily));
        for (const w of worksheets) {
            w.pairings.audio = audio.map((a) => a.id);
            w.pairings.answers = answers.filter((a) => a.id !== w.id).map((a) => a.id);
            w.pairings.slides = slides.map((a) => a.id);
            w.pairings.transcript = transcript.map((a) => a.id);
            if (w.pairings.audio.length || w.pairings.answers.length || w.pairings.transcript.length) pairingLinks += 1;
        }
        for (const a of audio) a.pairings.worksheet = worksheets.map((w) => w.id);
    }

    // Stamp week (unit order) + year + term onto each placed record from the synthesised
    // chronology, so records are self-contained (mission requires course/year/term/week/date).
    // Runs after dedup so loose files can inherit a placed duplicate's week (resolveUnit).
    const model = rules?.chronologyModel ?? null;
    if (model?.units?.length) {
        const units = model.units.slice().sort((a, b) => a.order - b.order);
        const unitOf = makeUnitOf(units);
        const byId = new Map(records.map((r) => [r.id, r]));
        // Evidence-cited level per synthesis year (grammar-sequence analysis, not filename).
        const yearLevel = (year) => (year === 1 ? 'Genki I (beginner, ~N5)' : year === 2 ? 'Genki II (upper-beginner, ~N4)' : year === 3 ? 'upper-elementary (~N4, Minna no Nihongo Shokyū II)' : null);
        for (const r of records) {
            if (r.recordType !== 'file') continue;
            const unit = resolveUnit(r, unitOf, byId);
            if (!unit) continue;
            const y = yearOf(model, unit.order);
            r.curriculum.week = unit.order;
            r.curriculum.year = y.year;
            r.curriculum.term = y.label;
            r.curriculum.weekLabel = unit.label ?? null;
            // Textbook + level for class-chapter files are evidence-cited synthesis inferences,
            // NOT filename facts — tag the basis so this is transparent and never mistaken for
            // a literal filename token.
            if (!r.curriculum.textbook && unit.textbook) { r.curriculum.textbook = unit.textbook; r.curriculum.basis.push('textbook-from-chronology-synthesis'); }
            if (!r.curriculum.level) {
                const lvl = yearLevel(y.year);
                if (lvl) { r.curriculum.level = lvl; r.curriculum.levelBasis = 'level-from-chronology-synthesis'; r.curriculum.basis.push('level-from-chronology-synthesis'); }
            }
        }
    }

    // Strip internal helper field.
    for (const r of records) delete r._stem;

    // Moodle reconciliation report.
    const matchedShas = new Set(records.filter((r) => r.moodle?.matched).map((r) => r.sha256?.replace(/^sha256:/, '')));
    const catalogPayloadShas = new Set(assetSha.keys());
    const unmatchedCatalog = [...catalogPayloadShas].filter((s) => !matchedShas.has(s));
    const reconciliation = {
        schema: 'yomu-academy-moodle-reconciliation/v1',
        catalogPayloadCount: catalogPayloadShas.size,
        catalogArchiveCount: archiveSha.size,
        diskPayloadsMatchingCatalog: [...matchedShas].filter((s) => catalogPayloadShas.has(s)).length,
        catalogPayloadsUnrecoveredOnDisk: unmatchedCatalog.length,
        note: 'Reconciliation is by sha256 only; the metadata-only Moodle catalog withholds names/paths. Unrecovered payloads exist as classroom occurrences in the corpus but have no byte-identical file in the scanned roots.',
    };

    // Coverage summary.
    const fileRecords = records.filter((r) => r.recordType === 'file');
    const tally = (sel) => { const m = {}; for (const r of fileRecords) { const k = sel(r); m[k] = (m[k] ?? 0) + 1; } return m; };
    const summary = {
        schema: LEDGER_SCHEMA,
        generatedFrom: { inventory: join(RAW_DIR, 'inventory.ndjson'), catalog: CATALOG_PATH, rules: rules ? RULES_PATH : null },
        counts: {
            totalRecords: records.length,
            fileAssets: fileRecords.length,
            bulkDatasets: records.filter((r) => r.recordType === 'bulk-dataset').length,
            uniquePayloads: new Set(fileRecords.map((r) => r.sha256)).size,
            duplicateOccurrences: fileRecords.filter((r) => r.duplicate.isDuplicate).length,
            supersessionLinks, pairingLinks,
            revisionMarkers: fileRecords.filter((r) => r.revisionMarker).length,
            revisionsWithoutOnDiskPredecessor: fileRecords.filter((r) => r.revisionMarker && !r.supersession.supersedes).length,
            moodleMatchedAssets: fileRecords.filter((r) => r.moodle?.matched).length,
        },
        byRoot: tally((r) => r.rootId),
        byCurricular: tally((r) => r.curricular),
        byDatasetGroup: tally((r) => r.datasetGroup),
        byKind: tally((r) => r.kind),
        byWorksheetFamily: tally((r) => r.worksheetFamily),
        byRightsClass: tally((r) => r.rights.class),
        byExtractionStatus: tally((r) => r.extraction.status),
        byConfidence: tally((r) => r.confidence),
        byTextbook: tally((r) => r.curriculum.textbook ?? '(none)'),
        curricularClassAssets: fileRecords.filter((r) => r.curricular === 'yes').length,
        moodleReconciliation: reconciliation,
        rulesApplied: rules ? { source: RULES_PATH, chronologyUnits: rules?.synthesis?.chronologyModel?.units?.length ?? rules?.chronologyModel?.units?.length ?? 0 } : null,
    };

    await mkdir(LEDGER_OUT_DIR, { recursive: true });
    await writeFile(join(LEDGER_OUT_DIR, 'source-ledger.ndjson'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
    await writeFile(join(LEDGER_OUT_DIR, 'source-ledger.summary.json'), JSON.stringify(summary, null, 2) + '\n');
    await writeFile(join(LEDGER_OUT_DIR, 'moodle-reconciliation.json'), JSON.stringify(reconciliation, null, 2) + '\n');

    process.stdout.write(JSON.stringify(summary.counts, null, 2) + '\n');
    return summary;
}

main().catch((err) => { process.stderr.write(`${err?.stack || err}\n`); process.exitCode = 1; });
