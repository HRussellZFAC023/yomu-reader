export const meta = {
  name: 'academy-verify-source-ledger',
  description: 'Adversarially verify the Yomu Academy source ledger: skeptics try to falsify coverage, faithfulness, chronology, dedup, Moodle reconciliation, and rights',
  phases: [
    { title: 'Refute', detail: 'one skeptic per claim, prompted to break it' },
    { title: 'Synthesize', detail: 'rank surviving findings' },
  ],
}

const LEDGER = '/Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-initial-20260711/public/academy/content/source-ledger'
const SCRIPTS = '/Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-initial-20260711/scripts/academy-content-ledger'
const CORPUS = '/Users/heru/Documents/Japanese'

const FINDINGS_SCHEMA = {
  type: 'object', additionalProperties: true,
  required: ['dimension', 'verdict', 'findings'],
  properties: {
    dimension: { type: 'string' },
    verdict: { type: 'string', enum: ['sound', 'issues-found'], description: 'sound = the claim survived refutation attempts' },
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: true,
        required: ['severity', 'summary', 'evidence'],
        properties: {
          severity: { type: 'string', enum: ['critical', 'major', 'minor', 'nit'] },
          confidence: { type: 'string', enum: ['confirmed', 'plausible'] },
          summary: { type: 'string' },
          evidence: { type: 'string', description: 'concrete command output / record / file that proves the issue' },
          suggestedFix: { type: 'string' },
        },
      },
    },
    checksRun: { type: 'array', items: { type: 'string' }, description: 'commands you actually ran' },
  },
}

const SKEPTIC = `You are a hostile auditor of the Yomu Academy source ledger. The ledger claims to be a complete, faithful, source-of-truth inventory. Assume it is GUILTY of an error until you fail to find one. Use bash/Read/Grep/node to inspect the REAL data and REAL scripts; run actual commands and cite their output as evidence. Do not invent problems, but do not rubber-stamp — a finding needs concrete proof. If you cannot falsify the claim after genuine effort, return verdict "sound" with an empty findings array. Ledger dir: ${LEDGER} . Scripts: ${SCRIPTS} . Corpus: ${CORPUS} . Return ONLY the structured object.`

const DIMENSIONS = [
  {
    id: 'coverage-no-drops',
    prompt: `${SKEPTIC}

CLAIM UNDER TEST: "Every Japanese-learning content asset under the scanned roots is in the ledger; nothing curricular was silently dropped."
Attack it: (1) independently \`find\` content files under ${CORPUS} (pdf, mp3, docx, xlsx, pptx, epub, srt, apkg, etc.) and compare the raw count to raw/scan-summary.json counts. (2) Inspect the extension allowlist + JUNK_DIRS + bulkDirs in ${SCRIPTS}/lib/roots.mjs and ${SCRIPTS}/scan-sources.mjs — does any exclusion drop a genuine learning resource (not just build junk)? (3) Check the 11,874 "skippedUnclassified" — sample what was skipped; are any of them real curricular files (e.g. an odd extension textbook)? (4) Confirm the soya audio bulk aggregation and rtk handling are logged, not silent. Report drops of genuine learning content as findings.`,
  },
  {
    id: 'faithfulness-no-invention',
    prompt: `${SKEPTIC}

CLAIM UNDER TEST: "No record asserts curriculum metadata (chapter, grammar point, level, textbook, date) that is not evidenced by the actual filename/path."
Attack it: sample records from source-ledger.ndjson (use node to filter e.g. class-lessons pdfs, genki-study, resource-packs). For each sampled record, check that curriculum.chapter / grammarConcepts / level / textbook / date are actually derivable from referencePath/sourceTitle and not fabricated. Especially scrutinise: (a) any 'high' confidence record whose evidence is thin; (b) grammarConcepts that don't appear in the filename; (c) textbook/level guesses. Report any invented or unsupported assertion.`,
  },
  {
    id: 'chronology-integrity',
    prompt: `${SKEPTIC}

CLAIM UNDER TEST: "The week ledger preserves actual class chronology from Lesson 0, never collapses distinct weeks, keeps both re-download batches as distinct occurrences, and marks un-captured chapters 24-27 as honestly-empty low-confidence placeholders."
Attack week-ledger.json with node: (1) are weeks strictly ordered 0..33 with none missing/merged? (2) Do orders 28-33 each map to exactly one class Lesson folder, and are BOTH Feb and Mar batches present where they exist (e.g. order 29 should list 2026-02-17 AND 2026-03-10 occurrences)? (3) Is any asset double-placed in two weeks, or placed in the wrong chapter? (4) Are bridge weeks 24-27 truly empty (assetCount 0, confidence low), not silently backfilled? (5) Does placedAssetCount + supporting equal the file total (no assets lost between ledger and week ledger)? Report ordering/collapse/duplication/loss errors.`,
  },
  {
    id: 'dedup-supersession',
    prompt: `${SKEPTIC}

CLAIM UNDER TEST: "Duplicate groups are exactly the byte-identical (same sha256) occurrences; supersession is only emitted for genuine New_-revised-vs-plain payload pairs; nothing is deleted."
Attack with node over source-ledger.ndjson: (1) pick a duplicate group and verify all members share sha256 and that occurrences[] is symmetric and resolvable. (2) Verify no record is marked duplicate when its sha256 is unique. (3) Verify supersessionLinks count matches actual supersession fields, and each link is between DISTINCT payloads with a real New_ marker. (4) Confirm the 26 revisionMarker files without predecessor are honestly reported, not force-linked. (5) Independently md5/sha a couple of the claimed Feb-vs-Mar batch duplicate files on disk to confirm they really are identical. Report false dedup, false/missing supersession, or any deletion.`,
  },
  {
    id: 'moodle-reconciliation',
    prompt: `${SKEPTIC}

CLAIM UNDER TEST: "sha256 reconciliation against the metadata-only Moodle catalog is correct: matched disk assets really share a payload sha with the catalog, and the 621 unrecovered payloads are genuinely absent from disk."
Attack: load public/academy/catalog.json and source-ledger.ndjson with node. (1) Take a few records with moodle.matched=true and confirm their sha256 (hex) is actually in catalog.assets[].sha256 or archiveOccurrences[].sha256. (2) Take a few catalog asset shas reported unrecovered and confirm no ledger record has that sha. (3) Check the reconciliation counts in moodle-reconciliation.json are internally consistent (matched + unrecovered vs catalog payload count). (4) Sanity: is matchType labelled correctly (member-payload vs archive-payload)? Report any incorrect match or miscount.`,
  },
  {
    id: 'rights-and-classification',
    prompt: `${SKEPTIC}

CLAIM UNDER TEST: "Every asset's rights class and curricular flag are defensible; no third-party redistributable material is mislabelled as personal/original, and non-curricular craft/travel/tool material is not counted as class curriculum."
Attack with node over source-ledger.ndjson + summary: (1) sample each rights class and datasetGroup; is any mega-pack/textbook file mislabelled personal or yomu-original? (2) Is the RTK site correctly curricular and the japlan travel planner correctly non-curricular? (3) Does byCurricular segregation hold (no UI-demo counted as 'yes')? (4) Are extraction statuses sane per kind/root (e.g. academy-public = already-digitised, dictionaries = tool)? Report misclassifications that would overstate usable curriculum or misstate rights.`,
  },
]

phase('Refute')
const results = await parallel(DIMENSIONS.map((d) => () =>
  agent(d.prompt, { label: `refute:${d.id}`, phase: 'Refute', schema: FINDINGS_SCHEMA, effort: 'high' })
    .then((r) => (r ? { ...r, dimension: r.dimension || d.id } : null))
))
const ok = results.filter(Boolean)
const totalFindings = ok.reduce((n, r) => n + (r.findings?.length ?? 0), 0)
log(`Refute done: ${ok.length}/${DIMENSIONS.length} dimensions, ${totalFindings} raw findings`)

phase('Synthesize')
const SYNTH_SCHEMA = {
  type: 'object', additionalProperties: true,
  required: ['overallVerdict', 'rankedFindings'],
  properties: {
    overallVerdict: { type: 'string', enum: ['ship', 'fix-then-ship', 'major-rework'] },
    rankedFindings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: true,
        required: ['severity', 'dimension', 'summary', 'suggestedFix'],
        properties: {
          severity: { type: 'string', enum: ['critical', 'major', 'minor', 'nit'] },
          dimension: { type: 'string' }, summary: { type: 'string' },
          evidence: { type: 'string' }, suggestedFix: { type: 'string' },
        },
      },
    },
    strengthsConfirmed: { type: 'array', items: { type: 'string' } },
  },
}
const synthesis = await agent(
  `You are the release gate for the Yomu Academy source ledger. Below are ${ok.length} adversarial audit reports. De-duplicate and rank every surviving finding by severity (critical/major/minor/nit), keep only findings with concrete evidence, and give a concrete suggestedFix for each. Then set overallVerdict: "ship" (no material issues), "fix-then-ship" (only minor/major fixable issues), or "major-rework". Also list the claims that were confirmed sound.

Audit reports:
${JSON.stringify(ok, null, 1)}`,
  { label: 'synthesize', phase: 'Synthesize', schema: SYNTH_SCHEMA, effort: 'high' },
)

return { reports: ok, synthesis }
