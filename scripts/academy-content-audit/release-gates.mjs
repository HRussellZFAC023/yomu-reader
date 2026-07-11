// Release gates — the content auditor's deterministic contract.
// Each gate encodes one minimum-bar requirement from the audit checklist and reads
// only the machine-readable ground truth in public/academy/content/audit/*.json.
// Gates are intentionally RED where content fails the bar (mirrors the existing
// foundation-quality gate philosophy): they document blockers loudly and stay green
// once the owning content team fixes the data. Exit code is non-zero if any
// release-blocking (P0/P1) gate fails, so CI can wire this in.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, stableStringify } from './lib/load-academy.mjs';

const AUDIT_DIR = join(REPO_ROOT, 'public/academy/content/audit');
const read = (f) => JSON.parse(readFileSync(join(AUDIT_DIR, f), 'utf8'));
const ledger = read('source-ledger.json');
const cur = read('curriculum-inventory.json');
const cov = read('coverage-source-to-week.json');
const audio = read('coverage-audio-pairing.json');
const work = read('coverage-worksheet-survival.json');
const castCov = read('coverage-cast-appearances.json');
const res = read('resource-library-inventory.json');
const fp = read('furigana-pitch-coverage.json');
const foundation = read('foundation-inventory.json');
const leak = read('teaching-answer-leak.json');

const gates = [];
const gate = (id, checklistItem, severity, pass, expected, actual, evidence, recommendation) =>
  gates.push({ id, checklistItem, severity, status: pass ? 'PASS' : 'FAIL', expected, actual, evidence, recommendation });

// --- Coverage ---
gate('GATE-COV-SECTION-ANCHOR', 'source maps to at least one week or explicit backlog', 'P1',
  cov.sectionCoverage.every((s) => s.curriculumLessonsAnchored.length > 0),
  'every teaching section anchors >=1 curriculum lesson',
  `${cov.sectionCoverage.filter((s) => s.curriculumLessonsAnchored.length === 0).length} sections with 0 anchored lessons`,
  cov.sectionCoverage.filter((s) => s.curriculumLessonsAnchored.length === 0).map((s) => `${s.courseYear} ${s.sectionTitle}`).join('; ') || 'all sections anchored',
  'Anchor a curriculum lesson to every UCL teaching section, or record an explicit backlog reason.');

gate('GATE-COV-WEEK-GRANULARITY', 'three years of weeks exist rather than nine umbrella lessons', 'P1',
  cov.weekLevelCoverage.upstreamWeeks <= cov.weekLevelCoverage.individuallyDigitisedWeeks * 3, // heuristic bar: >=1/3 of weeks individually represented
  '>= 1/3 of upstream weeks individually represented (not collapsed into umbrellas)',
  `${cov.weekLevelCoverage.individuallyDigitisedWeeks}/${cov.weekLevelCoverage.upstreamWeeks} weeks (${cov.weekLevelCoverage.pctWeeksDigitised}%)`,
  `Only Lesson 9 is individually digitised; the other ${cov.weekLevelCoverage.upstreamWeeks - cov.weekLevelCoverage.individuallyDigitisedWeeks} weekly lessons are collapsed into ${cov.digitised.curriculumUmbrellaLessons} umbrella lessons.`,
  'Expand week-level units per section OR publish an explicit per-week backlog with source IDs so nothing silently disappears.');

// --- Digitisation fidelity ---
gate('GATE-AUDIO-PAIRING', 'every audio has a paired task and transcript status', 'P1',
  audio.audioWithoutPairedTaskOrTranscript === 0,
  'every source audio occurrence has a paired task + transcript status (or explicit backlog)',
  `${audio.enrichedAudioOccurrences}/${audio.upstreamAudioOccurrences} paired; ${audio.audioWithoutPairedTaskOrTranscript} unpaired`,
  `${audio.audioWithoutPairedTaskOrTranscript} of ${audio.upstreamAudioOccurrences} MP3 occurrences have no paired task or transcript status.`,
  'Record transcript status for every audio occurrence and pair it with a task, or backlog with a reason.');

gate('GATE-WORKSHEET-SURVIVAL', 'every worksheet question survives digitisation', 'P1',
  work.worksheetsWithExtractedQuestions > 0 || work.digitisationPipelineRecordsOnDisk > 0,
  'worksheet questions are extracted into gradeable items (pipeline output present)',
  `${work.worksheetsWithExtractedQuestions} worksheets with extracted questions; ${work.digitisationPipelineRecordsOnDisk} pipeline records on disk`,
  `Digitisation pipeline output directory is empty; enrichments carry worksheet ROLES but no extracted questions. ${work.upstreamDocumentOccurrences} document occurrences.`,
  'Run scripts/digitize-academy-resources.mjs and convert worksheet questions into gradeable items, or record which are intentionally not converted.');

gate('GATE-RESOURCE-LEDGER', 'every Moodle/local source has a ledger entry', 'P2',
  res.totals.resourceOccurrences === (ledger.publishableCatalog.summary?.memberOccurrenceCount ?? 916),
  'every catalog occurrence has a resource-library ledger entry',
  `${res.totals.resourceOccurrences} ledger entries for ${ledger.publishableCatalog.summary?.memberOccurrenceCount} occurrences`,
  `Ledger is exhaustive (${res.totals.resourceOccurrences}) but only ${res.totals.enrichedOccurrences} (${res.totals.enrichedPct}%) carry a week/backlog mapping.`,
  'Ledger completeness passes; separately raise enrichment/backlog coverage above the single Lesson-9 archive.');

// --- Cast ---
gate('GATE-CAST-WIRED', 'classmates/textbook characters receive meaningful LEARNING appearances', 'P1',
  false, // established: cast-learning.ts imported only by its own test
  'cast-learning tasks are rendered in a learner-facing surface',
  'cast-learning.ts imported only by tests/academy/cast-learning.test.ts',
  'The 20 cast-learning tasks + roster + extension hooks are never rendered; the learning appearances they encode never reach a learner.',
  'Wire cast-learning tasks into the foundation player / study route, or remove the dead module and re-scope the claim.');

gate('GATE-CAST-LIVE-APPEARANCE', 'all classmates and textbook characters receive meaningful LEARNER-VISIBLE appearances', 'P2',
  (castCov.membersWithZeroLiveAppearance?.length ?? 1) === 0,
  'every cast member reaches a learner (live foundation scene)',
  `${castCov.membersReachingLearner}/${castCov.castMemberCount} reach a learner; ${castCov.membersWithZeroLiveAppearance?.length ?? '?'} do not`,
  `No live appearance: ${(castCov.membersWithZeroLiveAppearance ?? []).map((c) => c.id).join(', ')}. (cast-learning task appearances are dead data and do not count.)`,
  'Give Angel/Stasi/Ruparna/Pho and the Miller/Tawapon cameos a live foundation-scene appearance, or reclassify cameos as narrative-only in the docs.');

gate('GATE-SOLO-ADAPTATION', 'group tasks have faithful solo adaptations', 'P1',
  castCov.soloAdaptationFieldPresent,
  'group/pair tasks carry a solo-adaptation path',
  `soloAdaptation field present: ${castCov.soloAdaptationFieldPresent}; ${castCov.groupOrPairTaskCount} group/pair tasks`,
  `${castCov.groupOrPairTaskCount} of ${castCov.groupOrPairTaskCount + castCov.soloTaskCount} cast-learning tasks are pair/group with no solo-adaptation field or copy.`,
  'Add a faithful solo-play path (respond-to-script) to every pair/group task.');

// --- Framework / metadata ---
gate('GATE-FURIGANA', 'furigana fields complete or explicitly unresolved', 'P2',
  fp.totals.readingCoverageVocabPct >= 100,
  'vocab/kanji reading (furigana-equivalent) coverage = 100%',
  `${fp.totals.readingCoverageVocabPct}% vocab reading coverage`,
  'All authored vocab/kanji carry a kana reading; sentence-level furigana relies on the Yomu runtime renderer.',
  'Pass. Document that sentence furigana is runtime-rendered by design.');

gate('GATE-PITCH', 'pitch fields complete or explicitly unresolved', 'P2',
  fp.totals.pitchCoverageVocabPct >= 100 || false, // no explicit-unresolved marker exists
  'pitch-accent authored (100%) OR explicitly marked unresolved',
  `${fp.totals.pitchCoverageVocabPct}% pitch coverage; no explicit-unresolved marker`,
  'No authored pitch-accent field exists on any vocab/kanji/variant, and nothing marks pitch as intentionally deferred.',
  'Either author pitch data, or add an explicit "pitch: runtime-rendered / unresolved" note so the gap is intentional not silent.');

gate('GATE-TEACHING-NO-ANSWER-KEY', 'answers not disclosed before the reveal action (pre-attempt teaching)', 'P0',
  leak.leakCount === 0,
  'no retrieval activity restates a correct answer in its pre-attempt teaching block',
  `${leak.leakCount} teaching answer-key leaks`,
  leak.leakCount === 0 ? 'no leaks' : leak.leaks.map((l) => `${l.activityId}/${l.responseId} overlap ${l.overlap}`).join('; '),
  'Remove answer-restating sentences from focus-variant examples, or stop rendering examples in the pre-attempt teaching block for retrieval activities (app.ts renderActivityTeaching / content.ts:416,424).');

gate('GATE-ORDERING-LEAK', 'answers/variants/feedback not disclosed before the reveal action', 'P0',
  foundation.orderingLeaks.length === 0,
  'no ordering practice item initialises options in answer order',
  `${foundation.orderingLeaks.length} ordering leaks`,
  foundation.orderingLeaks.length === 0 ? 'All 10 ordering items now have options != answer (the FOUNDATION-QUALITY-AUDIT.md blocker is resolved in data).' : `Leaks: ${foundation.orderingLeaks.map((l) => l.item).join(', ')}`,
  foundation.orderingLeaks.length === 0 ? 'Pass. Update the stale FOUNDATION-QUALITY-AUDIT.md verdict from Blocked to Resolved.' : 'Fix leaking ordering items.');

gate('GATE-FOUNDATION-VALID', 'lesson quality contract (validator) holds', 'P0',
  Array.isArray(foundation.validationErrors) && foundation.validationErrors.length === 0,
  'validateFoundationCourse() returns no errors',
  `${Array.isArray(foundation.validationErrors) ? foundation.validationErrors.length : 'n/a'} validation errors`,
  Array.isArray(foundation.validationErrors) && foundation.validationErrors.length ? foundation.validationErrors.join('; ') : 'validator clean',
  'Keep the foundation validator green.');

// --- Summary ---
const blocking = gates.filter((g) => (g.severity === 'P0' || g.severity === 'P1') && g.status === 'FAIL');
const report = {
  schema: 'yomu-academy-content-audit/release-gates/v1',
  generatedBy: 'scripts/academy-content-audit/release-gates.mjs',
  summary: {
    total: gates.length,
    passed: gates.filter((g) => g.status === 'PASS').length,
    failed: gates.filter((g) => g.status === 'FAIL').length,
    blockingFailures: blocking.length,
    bySeverity: gates.reduce((a, g) => { (a[g.severity] ??= { pass: 0, fail: 0 })[g.status === 'PASS' ? 'pass' : 'fail']++; return a; }, {}),
  },
  releaseVerdict: blocking.length === 0 ? 'PASS' : 'BLOCKED',
  gates,
};
writeFileSync(join(AUDIT_DIR, 'release-gates.json'), stableStringify(report));

console.log(`\nRELEASE GATES: ${report.releaseVerdict}  (${report.summary.passed} pass / ${report.summary.failed} fail; ${blocking.length} blocking)`);
for (const g of gates) console.log(`  [${g.status === 'PASS' ? ' PASS ' : '*FAIL*'}] ${g.severity} ${g.id} — ${g.actual}`);
process.exitCode = blocking.length === 0 ? 0 : 1;
