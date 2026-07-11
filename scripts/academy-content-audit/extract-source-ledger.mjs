// Source ledger extractor.
// Ground truth of the upstream corpus: every UCL Moodle course/section/weekly-lesson
// module, plus publishable-catalog aggregate stats and the local Japanese library.
// Metadata only — no source bytes, member names, or private paths are emitted.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, stableStringify } from './lib/load-academy.mjs';

const MOODLE_RAW = '/Users/heru/Documents/Projects/yomu/resources/yomu-academy/moodle-raw/manifest.json';
const CATALOG = join(REPO_ROOT, 'public/academy/catalog.json');
const OUT_DIR = join(REPO_ROOT, 'public/academy/content/audit');
mkdirSync(OUT_DIR, { recursive: true });

const weekTitle = /^(lesson|introduction|hiragana|katakana|kanji|self[ _-]?study|pre[ _-]?study|summer\s*homework|look-?alike)/i;
const lessonNum = /lesson\s*([0-9０-９]+)/i;

function classifyModule(m) {
  const title = m.title ?? '';
  if (m.type !== 'folder') return { role: m.type, isWeek: false };
  if (lessonNum.test(title)) return { role: 'weekly-lesson', isWeek: true };
  if (/^introduction/i.test(title)) return { role: 'section-intro', isWeek: true };
  if (/^(hiragana|katakana)/i.test(title)) return { role: 'kana-pack', isWeek: true };
  if (/^kanji/i.test(title)) return { role: 'kanji-pack', isWeek: true };
  if (/self[ _-]?study|pre[ _-]?study/i.test(title)) return { role: 'study-pack', isWeek: true };
  if (/summer\s*homework/i.test(title)) return { role: 'homework-pack', isWeek: true };
  return { role: 'folder-other', isWeek: true };
}

const raw = JSON.parse(readFileSync(MOODLE_RAW, 'utf8'));
const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));

const sections = [];
let totalWeeklyLessons = 0;
let totalTeachingFolders = 0;
let totalUrlModules = 0;
const distinctExternalUrls = new Set();
let totalModulesWithExternalUrl = 0;
for (const course of raw.courses) {
  for (const section of course.sections) {
    if (section.id === 'welcome') continue; // administrative, not a teaching section
    const mods = section.modules ?? [];
    const classified = mods.map((m) => ({ id: m.id ?? null, type: m.type, title: m.title, externalUrl: m.externalUrl ?? null, ...classifyModule(m) }));
    const weeklyLessons = classified.filter((c) => c.role === 'weekly-lesson');
    const teachingFolders = classified.filter((c) => c.isWeek);
    const urlModules = classified.filter((c) => c.type === 'url' || c.type === 'external');
    totalWeeklyLessons += weeklyLessons.length;
    totalTeachingFolders += teachingFolders.length;
    totalUrlModules += urlModules.length;
    for (const u of urlModules) if (u.externalUrl) { totalModulesWithExternalUrl++; distinctExternalUrls.add(u.externalUrl); }
    sections.push({
      courseId: course.id,
      courseYear: course.year,
      moodleCourseId: course.moodleCourseId,
      sectionId: section.id,
      sectionTitle: section.title,
      level: section.level ?? null,
      moodleSection: section.moodleSection,
      moduleCount: mods.length,
      weeklyLessonCount: weeklyLessons.length,
      teachingFolderCount: teachingFolders.length,
      urlModuleCount: urlModules.length,
      weeklyLessonTitles: weeklyLessons.map((c) => c.title),
      teachingFolderRoles: teachingFolders.map((c) => ({ title: c.title, role: c.role })),
      externalResources: urlModules.map((c) => ({ title: c.title, externalUrl: c.externalUrl })),
    });
  }
}

const ledger = {
  schema: 'yomu-academy-content-audit/source-ledger/v1',
  description: 'Deterministic inventory of upstream UCL Moodle sources. Metadata only.',
  moodleManifest: {
    locator: 'resources/yomu-academy/moodle-raw/manifest.json (private; not published)',
    generated: raw.generated,
    courseCount: raw.courses.length,
    courses: raw.courses.map((c) => ({ id: c.id, year: c.year, moodleCourseId: c.moodleCourseId, title: c.title, teachingSectionCount: c.sections.filter((s) => s.id !== 'welcome').length })),
  },
  teachingSectionCount: sections.length,
  totals: {
    teachingSections: sections.length,
    weeklyLessonFolders: totalWeeklyLessons,
    allTeachingFolders: totalTeachingFolders,
    // url/external-type modules in teaching sections (raw count; inflated by embed
    // duplicates and repeats across parallel sections/years — do not read as
    // "distinct authentic-input destinations").
    externalUrlModules: totalUrlModules,
    modulesCarryingAnExternalUrl: totalModulesWithExternalUrl,
    distinctExternalUrls: distinctExternalUrls.size,
  },
  publishableCatalog: {
    locator: 'public/academy/catalog.json',
    schema: catalog.schema,
    captureId: catalog.provenance?.captureId,
    capturedAt: catalog.provenance?.capturedAt,
    manifest: catalog.manifest,
    summary: catalog.summary,
    rights: catalog.rights,
  },
  sections,
};

writeFileSync(join(OUT_DIR, 'source-ledger.json'), stableStringify(ledger));
console.log('source-ledger.json written');
console.log(`  teaching sections: ${sections.length}`);
console.log(`  weekly-lesson folders (true week count): ${totalWeeklyLessons}`);
console.log(`  all teaching folders (weeks + kana/kanji/study packs): ${totalTeachingFolders}`);
console.log(`  external URL modules: ${totalUrlModules} (raw); distinct external URLs: ${distinctExternalUrls.size}; modules carrying a URL: ${totalModulesWithExternalUrl}`);
console.log(`  catalog member occurrences: ${catalog.summary?.memberOccurrenceCount}`);
