// Pre-attempt teaching answer-leak detector.
// The live academy player (app.ts renderActivityTeaching) prints each activity's
// focus-variant examples in a teaching block emitted BEFORE the answer form. If a
// variant example restates a correct answer, the learner sees the answer before
// attempting a retrieval task — a P0 pedagogical-integrity defect (found by the
// reviewer panel: prose-teaching-is-answer-key). This measures it deterministically.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, stableStringify, loadAcademyModules } from './lib/load-academy.mjs';

const OUT_DIR = join(REPO_ROOT, 'public/academy/content/audit');
mkdirSync(OUT_DIR, { recursive: true });
const m = await loadAcademyModules(['content']);
const g = m['content'].academyContentGraph;

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'at', 'for', 'is', 'are', 'they', 'them', 'their', 'you', 'your', 'we', 'it', 'that', 'this', 'with', 'if', 'as', 'be', 'by', 'from', 'near', 'do', 'does', 'will', 'can', 'may', 'some', 'every', 'all']);
const words = (s) => (s || '').toLowerCase().replace(/[^a-z0-9぀-ヿ一-龯 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));
const overlap = (answer, teaching) => {
  const aw = words(answer); if (!aw.length) return 0;
  const tset = new Set(words(teaching));
  return aw.filter((w) => tset.has(w)).length / aw.length;
};

const variantById = new Map(g.conceptVariants.map((v) => [v.id, v]));
const leaks = [];
const activitiesChecked = [];
for (const a of g.activities) {
  const teachingText = (a.focusVariantIds ?? [])
    .map((id) => variantById.get(id))
    .filter(Boolean)
    .map((v) => `${v.example?.en ?? ''} ${v.example?.ja ?? ''} ${v.explanation?.en ?? ''}`)
    .join(' ');
  if (!teachingText.trim()) { activitiesChecked.push({ id: a.id, kind: a.kind, teaching: false }); continue; }
  const answers = [];
  for (const r of a.responses ?? []) {
    if (Array.isArray(r.correctOptionIds) && Array.isArray(r.options)) {
      for (const oid of r.correctOptionIds) {
        const opt = r.options.find((o) => o.id === oid);
        if (opt?.label) answers.push({ responseId: r.id, kind: r.kind, answer: opt.label.en ?? opt.label.ja ?? '' });
      }
    }
    if (typeof r.answer === 'string') answers.push({ responseId: r.id, kind: r.kind, answer: r.answer });
  }
  activitiesChecked.push({ id: a.id, kind: a.kind, teaching: true, answerCount: answers.length });
  for (const ans of answers) {
    const ov = overlap(ans.answer, teachingText);
    if (ov >= 0.6) leaks.push({ activityId: a.id, activityKind: a.kind, responseId: ans.responseId, responseKind: ans.kind, answer: ans.answer, overlap: Number(ov.toFixed(2)), teachingExcerpt: teachingText.slice(0, 200) });
  }
}

const report = {
  schema: 'yomu-academy-content-audit/teaching-answer-leak/v1',
  description: 'Retrieval-task correct answers restated in the pre-attempt teaching block (rendered before the form by app.ts renderActivityTeaching).',
  activitiesChecked: activitiesChecked.length,
  activitiesWithTeaching: activitiesChecked.filter((a) => a.teaching).length,
  leakCount: leaks.length,
  leaks,
};
writeFileSync(join(OUT_DIR, 'teaching-answer-leak.json'), stableStringify(report));
console.log(`teaching-answer-leak.json: ${leaks.length} leaks across ${report.activitiesWithTeaching} activities with teaching blocks`);
for (const l of leaks) console.log(`  LEAK ${l.activityId} (${l.activityKind}) resp ${l.responseId}: "${l.answer}" overlap ${l.overlap}`);
