export const meta = {
  name: 'academy-week-review',
  description: 'Term editors reconcile each term, a curriculum editor reconciles the 3-year arc, adversarial reviewers audit coverage.',
  phases: [
    { title: 'Term edit', detail: 'one editor per term: fix validator failures + continuity + Japanese' },
    { title: 'Curriculum edit', detail: 'reconcile cross-term progression, SRS, checkpoints' },
    { title: 'Coverage review', detail: 'adversarial audit of every week vs its source ledger' },
  ],
};

const WT = '/Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-initial-20260711';
const TERMS = ['orientation', 'l1', 'l1plus', 'l2plus', 'l3-2', 'l3plus'];

const EDIT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['termId', 'weeksChecked', 'allValid', 'edits'],
  properties: {
    termId: { type: 'string' }, weeksChecked: { type: 'integer' }, allValid: { type: 'boolean' },
    edits: { type: 'array', items: { type: 'string' } }, remainingIssues: { type: 'array', items: { type: 'string' } },
  },
};
const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['termId', 'weeksAudited', 'findings'],
  properties: {
    termId: { type: 'string' }, weeksAudited: { type: 'integer' },
    findings: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['weekId', 'severity', 'category', 'detail'],
      properties: {
        weekId: { type: 'string' },
        severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
        category: { type: 'string' },
        detail: { type: 'string' },
        fixed: { type: 'boolean' },
      },
    } },
    verdict: { type: 'string' },
  },
};

const listCmd = (termId) => `node -e 'const p=require("${WT}/scripts/academy-weeks/generated/week-plan.json");console.log(p.weeks.filter(w=>w.identity.termId==="${termId}").map(w=>String(w.order).padStart(3,"0")+"-"+w.id+".json").join("\\n"))'`;

function termEditPrompt(termId) {
  return [
    `You are the TERM EDITOR for term \`${termId}\` of the Yomu Academy weekly course. Worktree: ${WT}`,
    `Goal: every week in your term is schema-valid, pedagogically continuous, and its Japanese is correct.`,
    `Read scripts/academy-weeks/WEEK-SCHEMA.md and AUTHORING-BRIEF.md first.`,
    `List your term's files: ${listCmd(termId)}`,
    `For EACH week file in public/academy/content/weeks/:`,
    `  1. Validate: cd ${WT} && node scripts/academy-weeks/validate-weeks.mjs --only <id>  — fix every issue on that file's line until 0.`,
    `  2. Continuity: the recap should name what the previous week gave; review.reviewFrom and cumulativeCheckpoint.targetsWeekIds must point to real earlier week ids; difficulty must ramp sensibly across the term; cast use should be varied and follow "grammar picks the person"; scene expression cues valid.`,
    `  3. Japanese quality: fix any incorrect/unnatural Japanese, wrong readings/furigana, mis-scoped grammar, or exercise answers that don't match their prompt. Ensure kana-only levels stay kana-only.`,
    `  4. NEVER change identity or sourceCoverage.members (keep verbatim from plan). You MAY refine coverageMap howCovered text and provenance.gaps.`,
    `Edit only files in public/academy/content/weeks/ for YOUR term. Re-validate each after editing.`,
    `Return the structured summary.`,
  ].join('\n');
}

const curriculumPrompt = [
  `You are the CURRICULUM EDITOR for the whole 3-year Yomu Academy weekly course. Worktree: ${WT}`,
  `The 73 weeks are authored and term-edited. Reconcile the ARC across terms (do not re-litigate within-term details).`,
  `Read scripts/academy-weeks/WEEK-SCHEMA.md and generated/week-plan.json.`,
  `Check and fix, across public/academy/content/weeks/:`,
  `  - Prerequisite + review chains: every prerequisiteWeekId / reviewFrom / cumulativeCheckpoint.targetsWeekIds references a real, EARLIER week id. Cross-term checkpoints (e.g. a term-kickoff reviewing the previous term's close) should point across the boundary correctly.`,
  `  - SRS continuity: tags follow academy:lesson:<id>; grammar/kanji/vocab items don't contradict a later week's scope; no duplicate front for different meanings within a term.`,
  `  - Progression: N5->N4 ramp is monotonic; no week teaches grammar far beyond its Minna chapter; kana-only in Level 1, kanji introduced on schedule (Kanji 4/6/7 strands).`,
  `  - mapping.customOrders present and consistent so the corpus is navigable by class chronology / Minna / Genki / JLPT / custom.`,
  `Make minimal, surgical edits. Keep identity + sourceCoverage.members verbatim. Then run: cd ${WT} && node scripts/academy-weeks/validate-weeks.mjs  and ensure 0 issues across all files.`,
  `Return a short JSON: {"crossRefFixes":N,"srsFixes":N,"progressionFixes":N,"validatorClean":true,"notes":"..."}.`,
].join('\n');

function coverageReviewPrompt(termId) {
  return [
    `You are an ADVERSARIAL COVERAGE REVIEWER for term \`${termId}\`. Assume each week is guilty until proven innocent. Worktree: ${WT}`,
    `List your term's files: ${listCmd(termId)}`,
    `For EACH week, load its plan entry (node -e ... week-plan.json find by id) and the authored file, then audit:`,
    `  1. COVERAGE: every member in sourceCoverage.members appears in coverageMap; each 'covered' claim is actually plausible — the named component/exercise exists and trains that worksheet's function (a vocab sheet -> a vocab component, a listening track -> the listening component paired by hash, a grammar drill -> grammar exercises for that chapter's point). Flag any 'covered' that is hollow.`,
    `  2. NO INVENTION: flag any place the lesson asserts what a SPECIFIC source worksheet said/contained, copies plausible source wording, or fabricates an answer key as if from the source. Original practice for a public grammar point is fine; claiming to reproduce the worksheet is not.`,
    `  3. UNMARKED GAPS: any worksheet whose function is NOT genuinely covered must be status:"gap" with a provenance.gaps note — flag silent gaps.`,
    `  4. VOICE/PRIVACY the validator might miss: institution/weekday framing, AI-slop, or any private data.`,
    `  5. JAPANESE: obvious errors, wrong readings, mis-scoped grammar, answers not matching prompts.`,
    `Fix trivial issues directly (only your term's files; never touch identity/sourceCoverage.members). Report everything as findings with severity blocker|major|minor and fixed:true/false. Re-validate any file you edit.`,
    `Return the structured findings.`,
  ].join('\n');
}

// ── Phase 1: term editors (parallel; distinct files per term) ──────────────
phase('Term edit');
const termEdits = await parallel(TERMS.map((t) => () =>
  agent(termEditPrompt(t), { label: `term-edit:${t}`, phase: 'Term edit', schema: EDIT_SCHEMA, agentType: 'general-purpose' })
));
log(`Term edits done. Terms all-valid: ${termEdits.filter((r) => r && r.allValid).length}/${TERMS.length}`);

// ── Phase 2: curriculum editor (barrier before it; single) ─────────────────
phase('Curriculum edit');
const curriculum = await agent(curriculumPrompt, { label: 'curriculum-edit', phase: 'Curriculum edit', agentType: 'general-purpose' });

// ── Phase 3: adversarial coverage review (parallel per term) ───────────────
phase('Coverage review');
const reviews = await parallel(TERMS.map((t) => () =>
  agent(coverageReviewPrompt(t), { label: `coverage-review:${t}`, phase: 'Coverage review', schema: REVIEW_SCHEMA, agentType: 'general-purpose' })
));

const findings = reviews.filter(Boolean).flatMap((r) => r.findings || []);
const blockers = findings.filter((f) => f.severity === 'blocker' && !f.fixed);
return {
  termEdits: termEdits.map((r, i) => ({ termId: TERMS[i], allValid: r?.allValid ?? false, edits: r?.edits?.length ?? 0, remaining: r?.remainingIssues ?? [] })),
  curriculum,
  reviewCounts: { total: findings.length, blockers: blockers.length, major: findings.filter((f) => f.severity === 'major').length, minor: findings.filter((f) => f.severity === 'minor').length },
  openBlockers: blockers,
  findings,
};
