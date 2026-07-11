// Content inventory extractor.
// Loads the shipped typed data graphs and emits deterministic, machine-readable
// inventories of what the Academy actually digitised: curriculum, foundation route,
// encoded lessons, content graph, cast, cast-learning, resource library, JLPT.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, stableStringify, loadAcademyModules } from './lib/load-academy.mjs';

const OUT_DIR = join(REPO_ROOT, 'public/academy/content/audit');
mkdirSync(OUT_DIR, { recursive: true });

const m = await loadAcademyModules([
  'curriculum', 'foundation-course', 'lessons-content', 'content',
  'cast', 'cast-learning', 'resource-library', 'jlpt', 'study-bridge',
]);

// ---- Curriculum ----
const cur = m['curriculum'];
const lessons = cur.academyCurriculumGraph.lessons;
const curriculumInventory = {
  schema: 'yomu-academy-content-audit/curriculum-inventory/v1',
  lessonCount: lessons.length,
  uclChronologyNodeCount: cur.uclChronology.length,
  sourceCount: cur.curriculumSources.length,
  sources: cur.curriculumSources.map((s) => ({ id: s.id, kind: s.kind, label: s.label, locator: s.locator })),
  uclChronology: cur.uclChronology.map((n) => ({
    id: n.id, courseYear: n.courseYear, sectionTitle: n.sectionTitle, levelBand: n.levelBand,
    sequence: n.sequence, manifestModuleCount: n.manifestModuleCount, downloadedModuleCount: n.downloadedModuleCount,
  })),
  lessons: lessons.map((l) => ({
    id: l.id, order: l.order, status: l.status, levelBand: l.levelBand, jlptBand: l.jlptBand,
    titleEn: l.title?.en,
    chronology: l.chronology,
    componentKinds: (l.components ?? []).map((c) => c.kind),
    componentCount: (l.components ?? []).length,
    sourceMappings: (l.sourceMappings ?? []).map((sm) => ({ sourceId: sm.sourceId, relation: sm.relation, reference: sm.reference, reuse: sm.reuse })),
    review: l.review ?? null,
    delivery: l.delivery ?? null,
  })),
  digitizationQueue: (cur.academyCurriculumGraph.digitizationQueue ?? []).map((q) => ({ id: q.id, kind: q.kind, priority: q.priority ?? null, note: q.note ?? q.rationale ?? null })),
};
writeFileSync(join(OUT_DIR, 'curriculum-inventory.json'), stableStringify(curriculumInventory));

// ---- Foundation route ----
const fc = m['foundation-course'];
const foundation = fc.academyFoundationRoute;
const orderingLeaks = [];
const foundationInventory = {
  schema: 'yomu-academy-content-audit/foundation-inventory/v1',
  lessonCount: foundation.length,
  validationErrors: fc.validateFoundationCourse ? fc.validateFoundationCourse() : null,
  lessons: foundation.map((l) => {
    const orderingItems = (l.practice ?? []).filter((p) => p.kind === 'order');
    const leaks = orderingItems.filter((p) => Array.isArray(p.options) && Array.isArray(p.answer) && JSON.stringify(p.options) === JSON.stringify(p.answer));
    for (const p of leaks) orderingLeaks.push({ lesson: l.id, item: p.id });
    return {
      id: l.id, routeNumber: l.routeNumber, level: l.level, minutes: l.minutes ?? null,
      titleEn: l.title, japaneseTitle: l.japaneseTitle,
      cast: l.cast ?? [],
      mapping: l.mapping ?? null,
      counts: {
        vocabulary: (l.vocabulary ?? []).length,
        grammar: (l.grammar ?? []).length,
        kanji: (l.kanji ?? []).length,
        practice: (l.practice ?? []).length,
        practiceByKind: (l.practice ?? []).reduce((a, p) => { a[p.kind] = (a[p.kind] ?? 0) + 1; return a; }, {}),
        objectives: (l.objectives ?? []).length,
        openingLines: (l.opening ?? []).length,
      },
      hasFinalTask: Boolean(l.finalTask),
      finalTaskSuccessChecks: (l.finalTask?.success ?? []).length,
      reviewFrom: l.reviewFrom ?? [],
      practiceReviewTags: [...new Set((l.practice ?? []).map((p) => p.reviewTag).filter(Boolean))],
    };
  }),
  orderingLeaks,
};
writeFileSync(join(OUT_DIR, 'foundation-inventory.json'), stableStringify(foundationInventory));

// ---- Encoded lessons-content ----
const lc = m['lessons-content'];
const encodedInventory = {
  schema: 'yomu-academy-content-audit/encoded-lessons-inventory/v1',
  lessonCount: lc.ACADEMY_LESSONS.length,
  lessons: lc.ACADEMY_LESSONS.map((l) => ({
    id: l.id, chapter: l.chapter, unitId: l.unitId, titleEn: l.title?.en ?? l.title,
    minnaReference: l.minnaReference ?? null,
    counts: { grammar: (l.grammar ?? []).length, vocab: (l.vocab ?? []).length, kanji: (l.kanji ?? []).length, activityIds: (l.activityIds ?? []).length },
    activityIds: l.activityIds ?? [],
    hasGrading: Boolean(l.grading),
  })),
};
writeFileSync(join(OUT_DIR, 'encoded-lessons-inventory.json'), stableStringify(encodedInventory));

// ---- Content graph (Lesson 9 vertical slice) ----
const con = m['content'];
const g = con.academyContentGraph;
const contentGraphInventory = {
  schema: 'yomu-academy-content-audit/content-graph-inventory/v1',
  schemaVersion: g.schemaVersion,
  counts: {
    concepts: g.concepts.length, conceptVariants: g.conceptVariants.length, outcomes: g.outcomes.length,
    assets: g.assets.length, activities: g.activities.length, curriculumUnits: g.curriculumUnits.length, placements: g.placements.length,
  },
  activities: g.activities.map((a) => ({ id: a.id, kind: a.kind ?? a.type ?? null, title: a.title?.en ?? a.title ?? null })),
  assets: g.assets.map((a) => ({ id: a.id, kind: a.kind ?? a.type ?? null, hasTranscript: Boolean(a.transcript || a.transcriptId || a.captions) })),
  curriculumUnits: g.curriculumUnits.map((u) => ({ id: u.id, title: u.title?.en ?? u.title ?? null })),
};
writeFileSync(join(OUT_DIR, 'content-graph-inventory.json'), stableStringify(contentGraphInventory));

// ---- Cast ----
// NOTE: cast-learning.ts is orphaned (imported only by its own test). Its task
// "appearances" are DEAD DATA that never reach a learner. The only LIVE learning
// surface a cast member reaches is the hand-authored foundation-course scene
// (cast[] array + opening dialogue speakers). We report both, clearly separated,
// so no reader mistakes dead-data coverage for learner-visible coverage.
const cast = m['cast'];
const cl = m['cast-learning'];
const tasks = cl.CAST_LEARNING_TASKS;
const extensionChars = new Set((cl.CAST_LEARNING_EXTENSION_HOOKS ?? []).map((h) => h.characterId));
const soloModes = new Set(['listen-respond']);

// LIVE foundation-scene appearances (name -> id). Foundation uses display names.
const nameToId = new Map(cast.ACADEMY_CAST.map((c) => [c.name.toLowerCase(), c.id]));
nameToId.set('rie-sensei', 'rie');
nameToId.set('rie', 'rie');
const foundationSceneAppear = new Map(); // id -> {inCast, speaks}
for (const l of foundation) {
  for (const name of l.cast ?? []) { const id = nameToId.get(String(name).toLowerCase()); if (id) { const e = foundationSceneAppear.get(id) ?? { inCast: 0, speaks: 0 }; e.inCast++; foundationSceneAppear.set(id, e); } }
  for (const line of l.opening ?? []) { const id = nameToId.get(String(line.speaker).toLowerCase()); if (id) { const e = foundationSceneAppear.get(id) ?? { inCast: 0, speaks: 0 }; e.speaks++; foundationSceneAppear.set(id, e); } }
}

const castInventory = {
  schema: 'yomu-academy-content-audit/cast-inventory/v1',
  wiring: {
    castLearningModuleIsOrphaned: true,
    castLearningNote: 'cast-learning.ts imported only by tests/academy/cast-learning.test.ts — task appearances are DEAD DATA.',
    liveLearningSurface: 'foundation-course scenes (cast[] + opening speakers) are the only learner-visible cast appearances.',
  },
  castMemberCount: cast.ACADEMY_CAST.length,
  classmateCount: cast.CLASSMATES.length,
  textbookCameoCount: cast.TEXTBOOK_CAMEOS.length,
  learningRoster: cl.CAST_LEARNING_ROSTER.map((r) => ({ id: r.id, name: r.name, kind: r.kind, identitySource: r.identitySource ?? null })),
  expectedKnownClassmateIds: cl.EXPECTED_KNOWN_CLASSMATE_IDS,
  inventedClassmateIds: cl.INVENTED_CLASSMATE_IDS,
  textbookCounterpartIds: cl.TEXTBOOK_COUNTERPART_IDS,
  castMembers: cast.ACADEMY_CAST.map((c) => {
    const taskAppearances = tasks.filter((t) => t.participantIds.includes(c.id));
    const live = foundationSceneAppear.get(c.id) ?? { inCast: 0, speaks: 0 };
    return {
      id: c.id, name: c.name, kind: c.kind, home: c.home ?? null,
      studyLinkCount: (c.studyLinks ?? []).length,
      // LIVE, learner-visible:
      liveFoundationSceneAppearances: live.inCast,
      liveFoundationSpeakingLines: live.speaks,
      reachesLearner: live.inCast > 0 || live.speaks > 0,
      // DEAD DATA (orphaned module):
      castLearningTaskAppearances_deadData: taskAppearances.length,
      appearsAsSpeaker_deadData: taskAppearances.some((t) => t.dialogue.some((d) => d.speakerId === c.id)),
      hasExtensionHook_deadData: extensionChars.has(c.id),
    };
  }),
  learningTasks: {
    total: tasks.length,
    orphaned: true,
    byMode: tasks.reduce((a, t) => { a[t.mode] = (a[t.mode] ?? 0) + 1; return a; }, {}),
    soloTaskCount: tasks.filter((t) => soloModes.has(t.mode)).length,
    groupOrPairTaskCount: tasks.filter((t) => !soloModes.has(t.mode)).length,
    hasSoloAdaptationField: tasks.some((t) => 'soloAdaptation' in t || 'soloVariant' in t),
    byRoute: cl.FOUNDATION_ROUTE_NUMBERS.map((r) => ({ route: r, taskCount: tasks.filter((t) => t.routeNumber === r).length })),
    tasks: tasks.map((t) => ({ id: t.id, routeNumber: t.routeNumber, mode: t.mode, level: t.level, participantIds: t.participantIds, languageTargetCount: t.languageTargets.length, dialogueLineCount: t.dialogue.length })),
  },
};
writeFileSync(join(OUT_DIR, 'cast-inventory.json'), stableStringify(castInventory));

// ---- Resource library ----
const rl = m['resource-library'];
const catalog = JSON.parse((await import('node:fs')).readFileSync(join(REPO_ROOT, 'public/academy/catalog.json'), 'utf8'));
const library = rl.createResourceLibrary(catalog);
const summary = rl.summarizeResourceLibrary ? rl.summarizeResourceLibrary(library) : null;
const entries = rl.resourceEntries(library);
const isEnriched = (e) => (e.semanticRoles?.length ?? 0) > 0 || (e.mappings?.length ?? 0) > 0 || (e.targetLinks?.length ?? 0) > 0;
const enriched = entries.filter(isEnriched);
// Occurrences by media kind, to size audio/worksheet coverage against tasks/transcripts.
const byMediaKind = entries.reduce((a, e) => { const k = e.record?.mediaKind ?? 'unknown'; a[k] = (a[k] ?? 0) + 1; return a; }, {});
const byFormat = entries.reduce((a, e) => { const k = e.record?.format ?? 'unknown'; a[k] = (a[k] ?? 0) + 1; return a; }, {});
const resourceInventory = {
  schema: 'yomu-academy-content-audit/resource-library-inventory/v1',
  summary,
  totals: {
    resourceOccurrences: entries.length,
    enrichedOccurrences: enriched.length,
    enrichedPct: entries.length ? Number(((enriched.length / entries.length) * 100).toFixed(2)) : 0,
    byMediaKind,
    byFormat,
  },
  frameworks: ['ucl', 'class', 'genki', 'minna', 'jlpt'].map((fw) => ({
    framework: fw,
    mappedResourceCount: (rl.resourcesForMappingFramework ? rl.resourcesForMappingFramework(library, fw) : []).length,
  })),
  targetLinkCount: entries.reduce((a, e) => a + (e.targetLinks?.length ?? 0), 0),
  enrichedResources: enriched.map((e) => ({
    id: e.record?.id,
    mediaKind: e.record?.mediaKind,
    format: e.record?.format,
    semanticRoles: e.semanticRoles ?? [],
    mappingFrameworks: (e.mappings ?? []).map((mm) => mm.framework),
    conversionStatus: e.conversion?.status ?? null,
    targetLinkCount: (e.targetLinks ?? []).length,
  })),
};
writeFileSync(join(OUT_DIR, 'resource-library-inventory.json'), stableStringify(resourceInventory));

// ---- JLPT ----
const jlpt = m['jlpt'];
const jlptInventory = {
  schema: 'yomu-academy-content-audit/jlpt-inventory/v1',
  levels: jlpt.JLPT_LEVELS,
  activityKinds: jlpt.JLPT_ACTIVITY_KINDS,
  catalogItemCount: Array.isArray(jlpt.jlptPracticeCatalog) ? jlpt.jlptPracticeCatalog.length : (jlpt.jlptPracticeCatalog?.items?.length ?? null),
};
writeFileSync(join(OUT_DIR, 'jlpt-inventory.json'), stableStringify(jlptInventory));

console.log('content inventories written to public/academy/content/audit/');
console.log(`  curriculum lessons: ${curriculumInventory.lessonCount}  ucl nodes: ${curriculumInventory.uclChronologyNodeCount}`);
console.log(`  foundation lessons: ${foundationInventory.lessonCount}  ordering leaks: ${orderingLeaks.length}`);
console.log(`  encoded lessons: ${encodedInventory.lessonCount}`);
console.log(`  cast members: ${castInventory.castMemberCount}  learning tasks: ${tasks.length} (solo ${castInventory.learningTasks.soloTaskCount} / group-pair ${castInventory.learningTasks.groupOrPairTaskCount})`);
console.log(`  cast reaching a learner (live foundation scenes): ${castInventory.castMembers.filter((c) => c.reachesLearner).length}/${castInventory.castMemberCount}`);
console.log(`  cast with 0 LIVE appearance: ${castInventory.castMembers.filter((c) => !c.reachesLearner).map((c) => c.id).join(', ') || 'none'}`);
console.log(`  resource enrichment: ${resourceInventory.totals.enrichedOccurrences}/${resourceInventory.totals.resourceOccurrences} (${resourceInventory.totals.enrichedPct}%)`);
