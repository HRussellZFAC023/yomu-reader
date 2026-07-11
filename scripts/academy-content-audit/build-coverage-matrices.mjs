// Coverage matrix builder.
// Deterministically joins the upstream source ledger to the digitised content
// inventories and emits machine-readable coverage matrices. Pure computation —
// these matrices are the reproducible backbone for the audit's release gates.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, stableStringify } from './lib/load-academy.mjs';

const AUDIT_DIR = join(REPO_ROOT, 'public/academy/content/audit');
mkdirSync(AUDIT_DIR, { recursive: true });
const read = (f) => JSON.parse(readFileSync(join(AUDIT_DIR, f), 'utf8'));

const ledger = read('source-ledger.json');
const curriculum = read('curriculum-inventory.json');
const foundation = read('foundation-inventory.json');
const encoded = read('encoded-lessons-inventory.json');
const contentGraph = read('content-graph-inventory.json');
const cast = read('cast-inventory.json');
const resources = read('resource-library-inventory.json');

// ---- Matrix 1: source section/week -> digitised coverage ----
// Which UCL teaching sections and weekly lessons are individually represented as
// digitised Academy units. A section is "chronology-only" if a curriculum lesson
// anchors to it; a week is "digitised" only if a dedicated unit encodes that week.
const uclNodeById = new Map(curriculum.uclChronology.map((n) => [n.id, n]));
const lessonsByUclNode = new Map();
for (const l of curriculum.lessons) {
  const nodeId = l.chronology?.uclNodeId;
  if (!nodeId) continue;
  if (!lessonsByUclNode.has(nodeId)) lessonsByUclNode.set(nodeId, []);
  lessonsByUclNode.get(nodeId).push(l);
}

// Map ledger sections to ucl chronology nodes by exact (year + normalized title).
// The UCL chronology sectionTitle values mirror the ledger sectionTitle verbatim.
const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
function matchUclNode(section) {
  return curriculum.uclChronology.find(
    (n) => n.courseYear === section.courseYear && norm(n.sectionTitle) === norm(section.sectionTitle),
  ) ?? null;
}

const sectionCoverage = ledger.sections.map((s) => {
  const node = matchUclNode(s);
  const lessonsHere = node ? (lessonsByUclNode.get(node.id) ?? []) : [];
  const encodedHere = lessonsHere.filter((l) => l.status === 'encoded');
  return {
    courseYear: s.courseYear,
    sectionTitle: s.sectionTitle,
    level: s.level,
    weeklyLessonCount: s.weeklyLessonCount,
    teachingFolderCount: s.teachingFolderCount,
    externalResourceCount: s.urlModuleCount,
    matchedUclChronologyNode: node?.id ?? null,
    curriculumLessonsAnchored: lessonsHere.map((l) => l.id),
    encodedLessonCount: encodedHere.length,
    weeklyLessonsIndividuallyDigitised: 0, // no per-week units exist; see coverageVerdict
    coverageVerdict: node
      ? (encodedHere.length > 0 ? 'chronology + one-encoded-week' : 'chronology-only (umbrella)')
      : 'unmapped',
  };
});

const totalWeeks = ledger.totals.weeklyLessonFolders;
const totalTeachingFolders = ledger.totals.allTeachingFolders;
const encodedWeeks = encoded.lessonCount + curriculum.lessons.filter((l) => l.status === 'encoded').length; // 3 minna + lesson-9 slice overlap; report both
const matrix1 = {
  schema: 'yomu-academy-content-audit/coverage-source-to-week/v1',
  description: 'Upstream teaching weeks vs individually digitised Academy weeks.',
  upstream: {
    teachingSections: ledger.totals.teachingSections,
    weeklyLessonFolders: totalWeeks,
    allTeachingFolders: totalTeachingFolders,
    externalUrlModules: ledger.totals.externalUrlModules,
    distinctExternalUrls: ledger.totals.distinctExternalUrls,
    modulesCarryingAnExternalUrl: ledger.totals.modulesCarryingAnExternalUrl,
  },
  digitised: {
    curriculumUmbrellaLessons: curriculum.lessonCount,
    foundationRouteUnits: foundation.lessonCount,
    encodedVerticalSliceLessons: encoded.lessonCount,
    curriculumLessonsWithEncodedStatus: curriculum.lessons.filter((l) => l.status === 'encoded').map((l) => l.id),
  },
  weekLevelCoverage: {
    upstreamWeeks: totalWeeks,
    individuallyDigitisedWeeks: sectionCoverage.reduce((a, s) => a + s.encodedLessonCount, 0),
    pctWeeksDigitised: Number(((sectionCoverage.reduce((a, s) => a + s.encodedLessonCount, 0) / totalWeeks) * 100).toFixed(2)),
  },
  sectionCoverage,
};
writeFileSync(join(AUDIT_DIR, 'coverage-source-to-week.json'), stableStringify(matrix1));

// ---- Matrix 2: audio -> paired task + transcript ----
const audioOccurrences = resources.totals.byMediaKind?.audio ?? 0;
const enrichedAudio = resources.enrichedResources.filter((r) => r.mediaKind === 'audio');
const contentGraphAudioAssets = contentGraph.assets.filter((a) => (a.kind || '').includes('audio') || (a.id || '').includes('audio'));
const contentGraphAudioWithTranscript = contentGraphAudioAssets.filter((a) => a.hasTranscript);
const matrix2 = {
  schema: 'yomu-academy-content-audit/coverage-audio-pairing/v1',
  description: 'Every source audio should have a paired learning task and a transcript status.',
  upstreamAudioOccurrences: audioOccurrences,
  enrichedAudioOccurrences: enrichedAudio.length,
  enrichedAudioRoles: enrichedAudio.map((a) => a.semanticRoles),
  contentGraphAudioAssets: contentGraphAudioAssets.length,
  contentGraphAudioWithTranscript: contentGraphAudioWithTranscript.length,
  audioWithoutPairedTaskOrTranscript: audioOccurrences - enrichedAudio.length,
  pctAudioPaired: audioOccurrences ? Number(((enrichedAudio.length / audioOccurrences) * 100).toFixed(2)) : 0,
};
writeFileSync(join(AUDIT_DIR, 'coverage-audio-pairing.json'), stableStringify(matrix2));

// ---- Matrix 3: worksheet -> digitised question survival ----
const docOccurrences = resources.totals.byMediaKind?.document ?? 0;
const enrichedWorksheets = resources.enrichedResources.filter((r) => r.semanticRoles.some((s) => s.includes('worksheet') || s.includes('sheet') || s.includes('homework') || s.includes('reading')));
// The digitisation pipeline output (records/, text/) is the only place extracted questions can live.
let pipelineRecords = 0;
try {
  const { readdirSync } = await import('node:fs');
  pipelineRecords = readdirSync(join(REPO_ROOT, 'public/academy/content/digitized/records')).length;
} catch { pipelineRecords = 0; }
const matrix3 = {
  schema: 'yomu-academy-content-audit/coverage-worksheet-survival/v1',
  description: 'Every worksheet question should survive digitisation into a gradeable item.',
  upstreamDocumentOccurrences: docOccurrences,
  enrichedWorksheetOccurrences: enrichedWorksheets.length,
  digitisationPipelineRecordsOnDisk: pipelineRecords,
  worksheetsWithExtractedQuestions: 0, // pipeline output is empty; enrichment carries roles, not questions
  note: 'Enrichments assert a worksheet ROLE but do not carry extracted questions. Actual gradeable items exist only inside the hand-authored foundation route and content graph, not derived per-worksheet.',
};
writeFileSync(join(AUDIT_DIR, 'coverage-worksheet-survival.json'), stableStringify(matrix3));

// ---- Matrix 4: cast learning appearances ----
// IMPORTANT: cast-learning "appearances" are dead data (orphaned module). The
// only learner-visible surface is the foundation scene. Coverage is measured on
// LIVE appearances; dead-data counts are reported separately, never conflated.
const matrix4 = {
  schema: 'yomu-academy-content-audit/coverage-cast-appearances/v2',
  description: 'Every classmate and textbook character should get a meaningful LEARNER-VISIBLE appearance. cast-learning task appearances are dead data and do NOT count.',
  wiring: cast.wiring,
  castMemberCount: cast.castMemberCount,
  membersReachingLearner: cast.castMembers.filter((c) => c.reachesLearner).length,
  membersWithZeroLiveAppearance: cast.castMembers.filter((c) => !c.reachesLearner).map((c) => ({ id: c.id, kind: c.kind, deadDataTasks: c.castLearningTaskAppearances_deadData })),
  membersWithZeroLearningTasks: cast.castMembers.filter((c) => c.castLearningTaskAppearances_deadData === 0).map((c) => ({ id: c.id, kind: c.kind })),
  soloAdaptationFieldPresent: cast.learningTasks.hasSoloAdaptationField,
  groupOrPairTaskCount: cast.learningTasks.groupOrPairTaskCount,
  soloTaskCount: cast.learningTasks.soloTaskCount,
  perMember: cast.castMembers.map((c) => ({ id: c.id, kind: c.kind, reachesLearner: c.reachesLearner, liveSceneAppearances: c.liveFoundationSceneAppearances, liveSpeakingLines: c.liveFoundationSpeakingLines, deadDataTaskAppearances: c.castLearningTaskAppearances_deadData, studyLinkCount: c.studyLinkCount })),
};
writeFileSync(join(AUDIT_DIR, 'coverage-cast-appearances.json'), stableStringify(matrix4));

console.log('coverage matrices written:');
console.log(`  M1 source->week: ${matrix1.weekLevelCoverage.upstreamWeeks} upstream weeks, ${matrix1.weekLevelCoverage.individuallyDigitisedWeeks} individually digitised (${matrix1.weekLevelCoverage.pctWeeksDigitised}%)`);
console.log(`  M2 audio: ${matrix2.upstreamAudioOccurrences} audio, ${matrix2.enrichedAudioOccurrences} paired, ${matrix2.audioWithoutPairedTaskOrTranscript} unpaired (${matrix2.pctAudioPaired}%)`);
console.log(`  M3 worksheets: ${matrix3.upstreamDocumentOccurrences} docs, ${matrix3.worksheetsWithExtractedQuestions} with extracted questions, ${matrix3.digitisationPipelineRecordsOnDisk} pipeline records on disk`);
console.log(`  M4 cast: ${matrix4.membersWithZeroLearningTasks.length} members with 0 learning tasks, solo-adaptation field present: ${matrix4.soloAdaptationFieldPresent}`);
