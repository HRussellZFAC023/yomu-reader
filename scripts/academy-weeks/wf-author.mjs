export const meta = {
  name: 'academy-week-author',
  description: 'Fan out one author per discovered class week; each writes an original, schema-valid week JSON.',
  phases: [
    { title: 'Author weeks', detail: 'one agent per week: read contract, fetch plan entry, author, self-validate' },
  ],
};

const WT = '/Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-initial-20260711';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'file', 'validated', 'covered', 'gaps'],
  properties: {
    id: { type: 'string' },
    file: { type: 'string' },
    validated: { type: 'boolean' },
    covered: { type: 'integer' },
    gaps: { type: 'integer' },
    grammarPoints: { type: 'array', items: { type: 'string' } },
    castUsed: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
};

function levelGuidance(term, chapters) {
  const maxCh = chapters && chapters.length ? Math.max(...chapters) : 0;
  if (term === 'Level 1') return 'ABSOLUTE BEGINNER (Minna I). Japanese in hiragana/katakana only; introduce at most a few first kanji (numbers 一二三, 人, 日) with handwriting. Very warm, first-sentences energy.';
  if (term === 'Level 1+') return 'HIGH BEGINNER (Minna I ~ch5-12). Mostly kana; a little more kanji is fine. Katakana becomes important (loanwords).';
  if (term === 'Level 2+') return maxCh >= 19 ? 'UPPER-BEGINNER into N4 (Minna ~ch17-21): plain/casual form, quoting, opinions. Normal kanji from the Kanji 4 strand.' : 'UPPER-BEGINNER (Minna ~ch12-18): て-form, permission, dictionary form. Normal beginner kanji.';
  if (term === 'Level 3-2') return 'N4 (Minna II ~ch27-32): potential, 〜ながら/〜し, resultant 〜ている, 〜てしまう, 〜てある/〜ておく, volitional. Normal N4 kanji (Kanji 6 strand).';
  if (term === 'Level 3+') return 'N4 into N3 on-ramp (Minna II ~ch31-36): advice, imperative, conditionals ば/なら/たら, 〜ように. Confident N4 kanji (Kanji 7 strand).';
  return 'Universal orientation content; welcoming, pre-N5.';
}

function prompt(w) {
  const isFull = ['lesson', 'self-study', 'pre-study', 'consolidation'].includes(w.k);
  const kindNote = ({
    'orientation': 'weekKind orientation (RELAXED): scene, explanation, vocabulary, a kana/intro kanji block, review, mission; srs >= 4. Frame the whole academy warmly and universally.',
    'term-kickoff': 'weekKind term-kickoff (RELAXED): a warm re-orientation to this level. scene, explanation of what the term will cover, vocabulary preview, review of the previous term, mission; srs >= 4.',
    'script-hiragana': 'weekKind script-hiragana (RELAXED): the kanji component holds the hiragana characters for this block with handwriting.required:true + recognition; short explanation of how the script works; keep a mission; grammar practice optional.',
    'script-katakana': 'weekKind script-katakana (RELAXED): the kanji component holds the katakana characters with handwriting.required:true + recognition; explanation of katakana/loanwords; mission; grammar optional.',
    'kanji-set': 'weekKind kanji-set (RELAXED): the kanji component contains EVERY character in derivedScope.kanji, handwriting.required each, recognition + reading exercises; srs covers each character.',
  })[w.k] || 'weekKind ' + w.k + ' (FULL): all nine components.';

  return [
    `You are authoring ONE Yomu Academy class week as ORIGINAL content. Work only in the worktree:`,
    WT,
    ``,
    `TARGET WEEK id: \`${w.i}\`  (weekKind: ${w.k}; ${w.t}${w.ch && w.ch.length ? '; Minna chapter(s) ' + w.ch.join(',') : ''}${w.kj && w.kj.length ? '; kanji set ' + w.kj.join('') : ''}).`,
    ``,
    `LEVEL: ${levelGuidance(w.t, w.ch)}`,
    `KIND: ${kindNote}`,
    ``,
    `STEP 1 — Read (in the worktree): scripts/academy-weeks/WEEK-SCHEMA.md (hard contract), scripts/academy-weeks/AUTHORING-BRIEF.md (cast/voice/coverage), and the worked exemplar public/academy/content/weeks/053-l3-2-l04.json (mirror its depth & shape; adjust level).`,
    `STEP 2 — Load your grounded plan entry and copy its identity + ENTIRE sourceCoverage VERBATIM, then add coverageMap (every member by payloadSha256 -> covering component(s), status covered|gap). Run:`,
    `  node -e 'const p=require("${WT}/scripts/academy-weeks/generated/week-plan.json");console.log(JSON.stringify(p.weeks.find(w=>w.id==="${w.i}"),null,2))'`,
    `Use derivedScope for grammar/chapters/kanji, casting.recommendedSpeakers as a seed (override per "grammar picks the person"), pedagogy for recap/review/checkpoints. Cover each worksheet's FUNCTION with fresh material; never reproduce source contents; mark true unknowns as gap.`,
    `STEP 3 — Author the full week. ${isFull ? 'Include all nine components (authentic-input, vocabulary, grammar, listening, reading, speaking, writing, kanji, review) plus scene, explanation, mission, srs.' : 'Include the relaxed component set for this weekKind.'} Correct, natural, level-appropriate Japanese with kana readings; deterministic exercises need explanation + specific wrongAnswerExplanations; open writing/speaking + mission need rubric + modelAnswer.revealAfterFirstAttempt. Warm, human, universal voice (no institution/weekday names, no AI-slop). If pedagogy.isCheckpoint is true, set review.cumulativeCheckpoint.isCheckpoint:true with real targetsWeekIds.`,
    `STEP 4 — Write exactly one file: public/academy/content/weeks/${w.p}-${w.i}.json`,
    `STEP 5 — Validate ONLY your file and iterate until your line shows 0 issues (ignore the "Missing weeks" summary):`,
    `  cd ${WT} && node scripts/academy-weeks/validate-weeks.mjs --only ${w.i}`,
    ``,
    `Return the structured summary. Edit no file other than your one week JSON.`,
  ].join('\n');
}

phase('Author weeks');
const weeks = Array.isArray(args) ? args : (typeof args === 'string' ? JSON.parse(args) : []);
log(`Authoring ${weeks.length} weeks (concurrency-capped).`);

const results = await parallel(weeks.map((w) => () =>
  agent(prompt(w), { label: `author:${w.i}`, phase: 'Author weeks', schema: SCHEMA, agentType: 'general-purpose' })
));

const ok = results.filter(Boolean);
const failed = weeks.filter((w, i) => !results[i] || results[i].validated !== true).map((w) => w.i);
log(`Authored ${ok.length}/${weeks.length}. Not-validated/failed: ${failed.length}${failed.length ? ' (' + failed.join(', ') + ')' : ''}`);

return {
  authored: ok.length,
  total: weeks.length,
  failed,
  totalCovered: ok.reduce((n, r) => n + (r.covered || 0), 0),
  totalGaps: ok.reduce((n, r) => n + (r.gaps || 0), 0),
  perWeek: results.map((r, i) => ({ id: weeks[i].i, ok: !!r && r.validated === true, covered: r?.covered ?? null, gaps: r?.gaps ?? null })),
};
