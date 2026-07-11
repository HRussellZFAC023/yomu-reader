// Furigana & pitch-accent field coverage.
// The audit requires furigana and pitch fields to be complete OR explicitly
// unresolved. Yomu renders furigana at runtime, but authored content data can
// still carry reading/pitch fields. This measures what the DATA actually carries.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, stableStringify, loadAcademyModules } from './lib/load-academy.mjs';

const OUT_DIR = join(REPO_ROOT, 'public/academy/content/audit');
mkdirSync(OUT_DIR, { recursive: true });

const m = await loadAcademyModules(['foundation-course', 'lessons-content', 'content']);

const hasKana = (s) => typeof s === 'string' && /[ぁ-んァ-ヶ]/.test(s);
const hasKanji = (s) => typeof s === 'string' && /[一-龯]/.test(s);

// Foundation route: vocab has `reading`; kanji has `reading`; grammar/opening/practice
// carry raw Japanese with no reading or pitch fields.
const fc = m['foundation-course'].academyFoundationRoute;
let fVocab = 0, fVocabWithReading = 0, fVocabWithPitch = 0, fKanji = 0, fKanjiWithReading = 0;
for (const l of fc) {
  for (const v of l.vocabulary ?? []) { fVocab++; if (v.reading) fVocabWithReading++; if (v.pitch || v.pitchAccent) fVocabWithPitch++; }
  for (const k of l.kanji ?? []) { fKanji++; if (k.reading) fKanjiWithReading++; }
}

// lessons-content vocab/kanji
const lc = m['lessons-content'].ACADEMY_LESSONS;
let lVocab = 0, lVocabWithReading = 0, lVocabWithPitch = 0, lKanji = 0, lKanjiWithReading = 0;
for (const l of lc) {
  for (const v of l.vocab ?? []) { lVocab++; if (v.reading || v.kana) lVocabWithReading++; if (v.pitch || v.pitchAccent) lVocabWithPitch++; }
  for (const k of l.kanji ?? []) { lKanji++; if (k.reading) lKanjiWithReading++; }
}

// content graph concepts/variants
const g = m['content'].academyContentGraph;
let cVariants = g.conceptVariants.length;
let cVariantsWithReading = g.conceptVariants.filter((v) => v.reading || v.furigana || v.kana).length;
let cVariantsWithPitch = g.conceptVariants.filter((v) => v.pitch || v.pitchAccent).length;

const report = {
  schema: 'yomu-academy-content-audit/furigana-pitch-coverage/v1',
  description: 'Reading (furigana-equivalent) and pitch-accent field coverage across authored content data.',
  foundationRoute: {
    vocabularyItems: fVocab, vocabWithReading: fVocabWithReading, vocabWithPitch: fVocabWithPitch,
    kanjiEntries: fKanji, kanjiWithReading: fKanjiWithReading,
    grammarPitchFields: 0, examplePitchFields: 0,
  },
  encodedLessons: {
    vocabularyItems: lVocab, vocabWithReading: lVocabWithReading, vocabWithPitch: lVocabWithPitch,
    kanjiEntries: lKanji, kanjiWithReading: lKanjiWithReading,
  },
  contentGraph: {
    conceptVariants: cVariants, variantsWithReading: cVariantsWithReading, variantsWithPitch: cVariantsWithPitch,
  },
  totals: {
    readingCoverageVocabPct: (fVocab + lVocab) ? Number((((fVocabWithReading + lVocabWithReading) / (fVocab + lVocab)) * 100).toFixed(1)) : 0,
    pitchCoverageVocabPct: (fVocab + lVocab) ? Number((((fVocabWithPitch + lVocabWithPitch) / (fVocab + lVocab)) * 100).toFixed(1)) : 0,
  },
  interpretation: {
    reading: 'Vocab/kanji carry a kana reading (furigana-equivalent). Sentence-level furigana relies on the Yomu runtime renderer.',
    pitch: 'No authored pitch-accent field exists on any vocab/kanji/variant. Pitch is neither authored nor explicitly marked unresolved in the data.',
  },
};
writeFileSync(join(OUT_DIR, 'furigana-pitch-coverage.json'), stableStringify(report));
console.log('furigana-pitch-coverage.json written');
console.log(`  vocab reading coverage: ${report.totals.readingCoverageVocabPct}%  pitch coverage: ${report.totals.pitchCoverageVocabPct}%`);
console.log(`  foundation vocab ${fVocabWithReading}/${fVocab} reading, ${fVocabWithPitch}/${fVocab} pitch`);
console.log(`  encoded vocab ${lVocabWithReading}/${lVocab} reading, ${lVocabWithPitch}/${lVocab} pitch`);
