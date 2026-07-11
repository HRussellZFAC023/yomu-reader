export const meta = {
  name: 'academy-map-source-clusters',
  description: 'Read every Japanese-resource source cluster and return structured chronology/worksheet/pairing/rights maps for the content ledger',
  phases: [
    { title: 'Map', detail: 'one read-only agent per source cluster' },
    { title: 'Synthesize', detail: 'merge cluster maps into unified ledger rules' },
  ],
}

const CLUSTER_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  required: ['clusterId', 'summary', 'rights', 'gaps'],
  properties: {
    clusterId: { type: 'string' },
    summary: { type: 'string', description: '2-4 sentence factual description of what this cluster contains' },
    chronology: {
      type: 'array',
      description: 'Ordered curricular units (lessons/chapters/weeks) if this cluster carries chronology; else empty',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          unitId: { type: 'string' }, label: { type: 'string' }, order: { type: 'number' },
          mappedTextbook: { type: 'string' }, mappedChapter: { type: 'string' },
          grammarPoints: { type: 'array', items: { type: 'string' } },
          date: { type: 'string', description: 'ISO date or folder date token if present' },
          worksheetCount: { type: 'number' },
          evidence: { type: 'string' }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
    worksheetFamilies: {
      type: 'array',
      description: 'Recurring worksheet/asset patterns with a filename regex and meaning',
      items: {
        type: 'object', additionalProperties: true,
        properties: { family: { type: 'string' }, pattern: { type: 'string' }, description: { type: 'string' }, examples: { type: 'array', items: { type: 'string' } } },
      },
    },
    pairings: {
      type: 'array',
      description: 'How audio/answers/slides/transcripts pair to worksheets (basis + examples)',
      items: { type: 'object', additionalProperties: true, properties: { basis: { type: 'string' }, description: { type: 'string' }, examples: { type: 'array', items: { type: 'string' } } } },
    },
    supersession: {
      type: 'array',
      description: 'Duplicate/revised-version links (e.g. New_ prefix, later date batch) — never delete, only link',
      items: { type: 'object', additionalProperties: true, properties: { supersedes: { type: 'string' }, supersededBy: { type: 'string' }, basis: { type: 'string' } } },
    },
    levelInference: { type: 'object', additionalProperties: true, properties: { scheme: { type: 'string' }, notes: { type: 'string' } } },
    rights: { type: 'object', additionalProperties: true, required: ['class', 'note'], properties: { class: { type: 'string' }, note: { type: 'string' } } },
    namingRules: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { regex: { type: 'string' }, meaning: { type: 'string' } } } },
    notableAssets: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { relPath: { type: 'string' }, title: { type: 'string' }, type: { type: 'string' }, note: { type: 'string' } } } },
    gaps: { type: 'array', items: { type: 'string' }, description: 'Missing/ambiguous things a human should resolve' },
  },
}

const READONLY = 'You are a READ-ONLY cataloguer. Do NOT create, edit, move, or delete any file. Use bash (find, ls, cat on small text files), Read, Grep, Glob to inspect. Never invent contents you did not observe. Report only what filenames/paths/structure actually show. Return ONLY the structured object.'

const CLUSTERS = [
  {
    id: 'lessons-chronology',
    label: 'Class lessons chronology',
    prompt: `${READONLY}

Cluster: the real class lesson folders at /Users/heru/Documents/Japanese/Lessons .
Do: run \`find "/Users/heru/Documents/Japanese/Lessons" -type f\` and study every path. Each "Lesson N-YYYYMMDD" folder is one class session with Handouts/, Homework/, "audio materials"/, and sometimes "Info gap picture". Filenames encode the textbook chapter (e.g. "Chapter 28"), the grammar point (e.g. 〜ながら, 〜ておく, 〜てある, 〜てしまいました), and the exercise type.

Return CLUSTER_SCHEMA where:
- chronology: one entry per Lesson-N-DATE folder AND per loose top-level HW/Chapter file. Set mappedTextbook (infer: chapter numbers 28-30 with these grammar points = Minna no Nihongo / Genki-continuation; state your reasoning in evidence), mappedChapter, grammarPoints (list the actual 〜 points seen), date (from the YYYYMMDD folder token), worksheetCount, evidence, confidence.
- worksheetFamilies: classify the exercise types you see (grammar exercise, speaking exercise, listening, vocabulary sheet, reading homework, info-gap, word card, audio track) with a filename regex and examples.
- pairings: how numbered audio tracks (e.g. "9-A-9.mp3", "78 Track 78.mp3") and listening worksheets and homework relate to a chapter.
- supersession: note the two date batches (…-20260217 vs …-20260310) that re-download the same lessons, and the "New_" filename prefix marking revised versions.
- namingRules: regexes mapping filename tokens to meaning (Chapter N, sub-section N-1/N-2, New_ prefix, "HW"/"Homework", "listening-N", "Vocabulary Sheet", "word card", "information gap").
- rights: class handout material for a paid course — personal study copies. note that.
- gaps: missing answer keys, un-numbered audio, ambiguous chapter mapping, lessons not present.`,
  },
  {
    id: 'genki-study-resources',
    label: 'Genki study-site 24-lesson backbone',
    prompt: `${READONLY}

Cluster: the Genki study resources static site at "/Users/heru/Documents/Japanese/Resource Packs/genki-study-resources-master 2". It has lessons/lesson-0 through lessons/lesson-23.
Do: list lessons/ and inspect a few lesson-*/index.html or directory listings and resources/notes to learn each lesson's title and topics.

Return CLUSTER_SCHEMA where chronology has one entry per lesson-0..lesson-23 with order, label (the Genki lesson title if discoverable), mappedTextbook="Genki I/II", mappedChapter=lesson number, grammarPoints/topics if visible, evidence, confidence. This is the canonical Lesson-0-onward digital backbone. worksheetFamilies = the resource types the site offers (vocab, kanji, grammar exercises, etc). rights: open-source study site (has LICENSE) — note it. gaps: anything beyond lesson-23 (Genki stops at 23).`,
  },
  {
    id: 'resource-packs',
    label: 'Mega learning packs',
    prompt: `${READONLY}

Cluster: two redistributed mega learning packs at "/Users/heru/Documents/Japanese/Resource Packs/Japanese Mega Learning Pack" and "/Users/heru/Documents/Japanese/Resource Packs/Japanese Language Learning Pack - Learn Japanese!".
Do: \`find\` each to depth 3-4; read the numbered category folder names (e.g. "01.Japanese Writing System", "02.Audio Courses, Textbooks", "03.Grammar, Workbooks, Usage"). Identify notable textbook/series names from filenames.

Return CLUSTER_SCHEMA: summary of the category taxonomy; worksheetFamilies = the category structure; notableAssets = identifiable textbooks/series (Genki, Minna, Tae Kim, JLPT, Kanji, etc.) with type and level; levelInference = how folders map to JLPT/beginner-advanced; rights class = "third-party-redistributed-collection" with a clear caution note (these are bundled copyrighted textbooks — reference/provenance only, not for republication); gaps.`,
  },
  {
    id: 'subtitles',
    label: 'Immersion subtitles',
    prompt: `${READONLY}

Cluster: /Users/heru/Documents/Japanese/Subtitles (srt/ass/vtt/sup for anime, Let's-Play game videos, shorts).
Do: \`ls\` it; group by title/series.
Return CLUSTER_SCHEMA: summary; notableAssets = each title/series with type (subtitle), genre, and immersion use; pairings = which subtitle files belong to the same series/episode set; levelInference = rough difficulty/genre; rights = personally-sourced subtitle files for immersion, note; gaps (missing video pairing, mixed languages).`,
  },
  {
    id: 'vocab-and-tools',
    label: 'Vocabulary + dictionaries/tools',
    prompt: `${READONLY}

Clusters: /Users/heru/Documents/Japanese/Vocabulary and "/Users/heru/Documents/Japanese/Dictionaries and Tools".
Do: \`ls\` and cat the small text files (Vocab 2k.txt head, words.txt). Inspect the Dictionaries dir (yomitan/yomichan dictionary json, apkg decks, zip dictionaries like nhk16, shinmeikai8, daijisen, forvo, jpod, a Kanji lesson zip).
Return CLUSTER_SCHEMA: summary; notableAssets = each dictionary/tool/vocab asset with type and what it is; worksheetFamilies = vocab-list vs dictionary vs anki-deck vs tool-config; levelInference; rights (mixed: user vocab lists = personal; packaged dictionaries = third-party); gaps.`,
  },
  {
    id: 'japanese-toplevel',
    label: 'Top-level books + loose worksheets',
    prompt: `${READONLY}

Cluster: loose files directly under /Users/heru/Documents/Japanese (the big "KANJI LOOK AND LEARN ... .pdf"), plus loose files directly in /Users/heru/Documents/Japanese/Lessons that are NOT inside a Lesson-N folder (e.g. "pdfcoffee.com_genki-ii-3rd-edition-workbook...pdf", "Chapter 30-2 ...pdf", "HW Chapter 29 ...pdf", "New_HW Chapter 30 ...pdf").
Do: \`ls\` those two directories (maxdepth 1) and classify each loose file.
Return CLUSTER_SCHEMA: notableAssets for each loose file (title, type=pdf/ebook, mappedChapter if a Chapter/HW file, note whether textbook vs class handout); chronology entries for the loose Chapter/HW files so they can slot into the week ledger; rights; gaps.`,
  },
  {
    id: 'soya-research',
    label: 'Soya listening research capture',
    prompt: `${READONLY}

Cluster: /Users/heru/Documents/Projects/yomu/references/soya-research — a research capture of the third-party listening site soya-eagle-online.com. IGNORE build artifacts (node_modules, .venv, extracted-src*, bundles, site-static*, network). Focus on genuine content: soya-research-report.md, provenance-source-hunt.md, the *.csv audio maps, screenshots/, source-candidates/jlpt-official/, audio-public/ (a large scraped audio mirror).
Do: cat the two .md reports (head), ls the content dirs, read listening-question-audio-map.csv head.
Return CLUSTER_SCHEMA: summary of what the capture is and what it covers (JLPT listening?); notableAssets = the reports, the audio map, the jlpt-official candidates; levelInference (JLPT N-levels if present); rights class = "third-party-scraped-web-reference" with a firm caution note (reference/modality only, not republishable); gaps (provenance unresolved, aggregate audio not individually catalogued).`,
  },
  {
    id: 'moodle-catalog',
    label: 'Moodle metadata-only catalog',
    prompt: `${READONLY}

Cluster: the privacy-safe Moodle corpus catalog at /Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-initial-20260711/public/academy/catalog.json (schema yomu-academy-publishable-catalog/v1). It deliberately withholds member names/paths/titles and keeps only sha256, byte length, file-type, path-shape, archive occurrence. Also read docs/academy/content/RESOURCE-LIBRARY.md in that worktree for context.
Do: use node -e or jq to inspect catalog.json — its manifest (courseCount/sectionCount/moduleCount/moduleTypeCounts), summary counts, patterns.byFileType, patterns.byPathShape, patterns.duplicatePayloads, and the shape of one memberOccurrences entry and one asset entry.
Return CLUSTER_SCHEMA: summary of the corpus (3 courses / N sections / 148 modules / 96 folder archives / 916 members / 688 payloads); worksheetFamilies = the file-type + path-shape patterns (what the payloads likely are: PDFs, MP3s, Word docs); pairings = how member classification hints at worksheet/audio/transcript roles; namingRules = the path-shape buckets; rights class = "metadata-only-redacted" (note names/paths/bytes are withheld and the ledger reconciles to it ONLY by sha256); gaps = the raw source manifest (sha 2400b43e) is not on disk; 688 payloads have no recovered filenames.`,
  },
  {
    id: 'references-misc',
    label: 'References-academy + class photos',
    prompt: `${READONLY}

Clusters: /Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-initial-20260711/references-academy (cloned UX/craft sample apps: ChatGptAutomator, japlan Japan travel planner, care-a-lot-celebration, shinday) and .../references/class-photos (character/cast art reference images).
Do: \`ls\` both (references-academy at depth 1-2; ignore node_modules/.git). Confirm whether any Japanese-LEARNING content exists (vs travel/UI craft).
Return CLUSTER_SCHEMA: summary; notableAssets (the japlan Japan travel planner is Japan-related but travel not language; class-photos are art references); rights = "internal-craft-reference"; gaps; explicitly state these hold ~no curricular learning content and should be classified as craft/art reference, not curriculum.`,
  },
]

phase('Map')
const reports = await parallel(CLUSTERS.map((c) => () =>
  agent(c.prompt, { label: `map:${c.id}`, phase: 'Map', schema: CLUSTER_SCHEMA })
    .then((r) => (r ? { ...r, clusterId: r.clusterId || c.id, _label: c.label } : null))
))
const ok = reports.filter(Boolean)
log(`Mapped ${ok.length}/${CLUSTERS.length} clusters`)

phase('Synthesize')
const SYNTH_SCHEMA = {
  type: 'object', additionalProperties: true,
  required: ['chronologyModel', 'worksheetTaxonomy', 'pairingRules', 'levelRules', 'rightsMatrix', 'gapsRollup'],
  properties: {
    chronologyModel: {
      type: 'object', additionalProperties: true,
      description: 'The reconstructed three-year, Lesson-0-onward class chronology scaffold with explicit evidence/confidence per unit',
      properties: {
        overview: { type: 'string' },
        years: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { year: { type: 'number' }, label: { type: 'string' }, textbook: { type: 'string' }, unitRange: { type: 'string' }, basis: { type: 'string' } } } },
        units: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { order: { type: 'number' }, unitId: { type: 'string' }, label: { type: 'string' }, textbook: { type: 'string' }, chapter: { type: 'string' }, grammarPoints: { type: 'array', items: { type: 'string' } }, date: { type: 'string' }, evidence: { type: 'string' }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] }, sourceClusters: { type: 'array', items: { type: 'string' } } } } },
      },
    },
    worksheetTaxonomy: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { family: { type: 'string' }, regex: { type: 'string' }, description: { type: 'string' } } } },
    pairingRules: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { name: { type: 'string' }, basis: { type: 'string' }, description: { type: 'string' } } } },
    levelRules: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { signal: { type: 'string' }, level: { type: 'string' } } } },
    rightsMatrix: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { rootOrCluster: { type: 'string' }, rightsClass: { type: 'string' }, note: { type: 'string' } } } },
    supersessionRules: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { rule: { type: 'string' }, basis: { type: 'string' } } } },
    gapsRollup: { type: 'array', items: { type: 'string' } },
  },
}

const synthesis = await agent(
  `You are the lead curriculum archivist. Below are ${ok.length} structured cluster maps (JSON) of every Japanese-learning source on this machine. Synthesize them into unified rules for a canonical content ledger and a three-year week ledger from Lesson 0.

Requirements:
- chronologyModel: build the best-evidence three-year scaffold. The Genki study site (lesson-0..23) is the digital backbone for beginner-intermediate; the real class Lesson-N folders (Minna/Genki-continuation chapters 28-30, dated 2026-02/03) are the most recent captured term. Map years to textbook ranges. For EACH unit give order, textbook, chapter, grammarPoints, date (if known), evidence, and confidence. NEVER invent lesson contents not present in the maps — where a week is only inferred structurally, mark confidence low and say so. Preserve every distinct unit; never collapse weeks.
- worksheetTaxonomy: unify the worksheet families into a canonical set with a filename regex each (grammar-exercise, speaking-exercise, listening-worksheet, vocabulary-sheet, reading-homework, grammar-homework, info-gap, word-card, audio-track, transcript, answer-key, textbook, dictionary, anki-deck, subtitle, slide).
- pairingRules: canonical rules to pair audio↔worksheet↔answers↔transcript↔slides (by chapter number, by shared stem, by numbered track).
- levelRules: signals→level (Genki lesson number→JLPT band, JLPT tokens, chapter ranges).
- rightsMatrix: one row per root/cluster with a rights class and caution note (personal class material vs third-party textbook vs scraped web vs open-source study site vs metadata-only-redacted).
- supersessionRules: New_ prefix, later date batch, duplicate SHA — link never delete.
- gapsRollup: merge all cluster gaps into a deduped list.

Cluster maps:
${JSON.stringify(ok, null, 1)}`,
  { label: 'synthesize', phase: 'Synthesize', schema: SYNTH_SCHEMA, effort: 'high' },
)

return { reports: ok, synthesis }
