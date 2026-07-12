# Content and Worksheet Media Strategy

## Fidelity model

Each source question has two adjacent records:

```ts
interface SourceQuestion {
  id: string;
  documentId: string;
  occurrences: OccurrenceId[];
  locus: { page: number; printedNumber?: string; bbox?: Rect };
  instructions: RichText;
  prompt: RichText;
  responseKind: string;
  media: SourceMediaRef[];
  answerKey?: AnswerKeyRef;
  extractionRevision: string;
}

interface QuestionAugmentation {
  sourceQuestionId: string;
  explanation: ExplanationBlock[];
  hints: Hint[];
  acceptedAnswers: AcceptedAnswer[];
  feedback: ErrorFeedback[];
  soloAdaptation?: ActivityModel;
  extraPractice: ActivityModel[];
  srsItems: ReviewSeed[];
  storyBinding?: StoryBinding;
}
```

Source and augmentation never share a mutable text field. A teacher correction can update extraction without overwriting Academy pedagogy.

## PDF image pipeline

### Stage 1: page and object census

For every unique PDF:

1. Render all pages at 200-300 DPI with `pdftoppm`.
2. Extract native raster objects when available.
3. Record page dimensions, image objects, vector-heavy regions, and OCR/text boxes.
4. Detect image-dependent prompts using layout adjacency, captions, arrows, labels, tables, blank answer regions, and instruction vocabulary such as `絵`, `図`, `地図`, `写真`, `見て`.
5. Create a contact sheet for the document with question boxes and candidate media regions overlaid.

### Stage 2: semantic region assignment

Each media region receives:

- stable `mediaId` based on document hash, page, and bounding box;
- relation to one or more source questions;
- role: prompt image, map, menu, table, diagram, answer key, worked example, decoration;
- whether text inside the image is semantically required;
- alt description and long description status;
- crop padding and reading order;
- exact-source, reconstructed, or regenerated status.

### Stage 3: choose the delivery form

**Exact crop** is preferred when the visual is part of the original question and remains legible. Preserve source provenance and page locus.

**Structured reconstruction** is preferred for tables, schedules, menus, forms, charts, maps, and layouts whose meaning can be represented accurately in semantic HTML/CSS. Keep a source thumbnail available to compare.

**OpenAI regeneration** is used when the original is too low-resolution, visually confusing, or unsuitable for the new interaction. The brief carries only the semantic facts needed by the question. A reviewer verifies that no answer cue changed.

**Hybrid** uses a reconstructed interactive layer over the exact source crop, such as clickable route nodes over a map or selectable objects over a room illustration.

### Stage 4: task preservation tests

An image-dependent question passes when:

- every fact required to answer is present;
- no new visual cue reveals the answer;
- spatial relationships and labels are preserved;
- zoom and mobile crop do not hide required content;
- keyboard and screen-reader alternatives express equivalent information;
- the source crop can be opened by the teacher/editor for comparison;
- answer keys still align after reconstruction.

## Worksheet patterns and reusable activity families

| Source pattern | Academy activity | Augmentation |
| --- | --- | --- |
| vocabulary list | listen/recognise/produce cards | pitch, audio, example, personal corpus |
| picture-word match | image matching | source crop or verified regenerated object set |
| fill-in-the-blank | typed/cloze response | morphology-aware variants and contrast feedback |
| substitution table | sentence builder | grammar explanation and free-transfer sentence |
| dialogue completion | VN roleplay | classmate takes partner role; voice replay |
| map/directions | interactive route | landmark state, spoken directions, wrong-turn repair |
| timetable/calendar | structured planner | time counters, conflict negotiation |
| listening questions | audio player plus responses | transcript unlock, timecoded replay, shadowing |
| kanji sheet | recognition and production pair | mnemonic, components, KanjiVG, Doodle grading |
| free writing | editor plus reference tray | structural checks, rubric, model after attempt |
| group discussion | simulated ensemble turn-taking | solo branching roleplay and speaking/text equivalence |
| reading comprehension | sentence/paragraph reveal | annotations, evidence highlighting, summary transfer |

## Automatic grading policy

- Closed responses use deterministic accepted-answer sets and normalisation.
- Japanese short text supports orthographic variants, kana/kanji alternatives, punctuation, and explicitly approved register variants.
- Sentence construction grades required meaning and target form separately.
- Listening grades the response, not transcription speed.
- Handwriting grades stroke order, direction, count, relative geometry, and recognisability with transparent sub-scores.
- Extended writing uses structural checks and a rubric. It does not claim one exact answer.
- Speaking provides target audio, waveform/pitch comparison where data exists, self-assessment, and teacher-style prompts. It does not pretend a browser score is a full pronunciation judgment.

## Coverage gates

For each source document:

- question count matches the audited source count;
- every instruction and worked example is represented;
- every question has a playable state or named manual-review reason;
- image-dependent questions have delivered media;
- audio questions have a media binding and transcript status;
- answer-key relations are explicit;
- source occurrence links preserve every year/term/week placement;
- duplicate payloads are not double-authored but remain visible in each chronology.

A blocker is valid while a document is being processed. The release gate is stricter: every Moodle source question must have a faithful playable representation, including required media. The source editor may retain manual-review notes after release, but they cannot stand in for the activity.

## Advanced course content

The class corpus anchors Foundation through N4. N3-N1 is original Yomu curriculum built from:

- official JLPT receptive outcomes;
- JF/CEFR performance outcomes kept separate from JLPT claims;
- Yomu's 307-rule grammar corpus;
- frequency, task need, and native-media occurrence;
- cleared or authored readings/listenings;
- moderated speaking/writing projects;
- cumulative review of all earlier concepts.

Each advanced unit includes authentic input, explicit analysis, guided manipulation, independent comprehension, production, and a story mission. It is not a list of advanced grammar labels.

## JLPT mock-test source and event strategy

The audited Soya corpus at `/Users/heru/Documents/Projects/yomu/references/soya-research/` is the implementation reference for diagnostic and mock-exam machinery. Useful evidence includes level-specific banks, interaction research, listening maps, audio audits, and official-source candidates. `source-candidates/jlpt-official/` contains N3/N4/N5 scripts and selected listening media; `listening-question-audio-map.json` and the download/audit reports help reconstruct question-to-media relationships.

Every assessment item receives provenance, reuse verdict, JLPT level and section, skill, answer and distractor rationale, source/media locus, timing profile, calibration evidence, and exposure policy. Reference data is audited rather than trusted wholesale. When an item cannot ship, preserve the validated mechanic and author an original equivalent.

One assessment schema supports optional enrollment placement, local skill test-out, calendar mock-test events, and full pre-JLPT simulations. Placement recommends a route and seeds known-state evidence; it never removes Lesson 0 or manual level choice. Mock events preserve section balance and timing, while review mode adds explanations, transcript reveal after commitment, mistake clustering, and targeted repair lessons.

For long-term play, forms are versioned and rotated without repeating exposed answers. Learner history tracks section trends, pacing, and recurring misconception families. Completed forms remain available as study replays, while new forms and source-grounded variants keep recurring JLPT seasons useful through N1.
