# Authoring Specification

## Week package

Each class week is a data package with:

- stable week ID and chronology position;
- source occurrences and every source-question ID;
- concept prerequisites and outcomes;
- opening dialogue scene;
- explanation blocks before assessed practice;
- authentic input and transcript state;
- vocabulary, grammar, kanji, listening, reading, writing, and speaking activities present in the source;
- faithful group version and solo adaptation;
- grading, accepted variants, hints, feedback, model-answer unlock rule, and rubric;
- review events and cumulative checkpoint links;
- Class, Genki, Minna, JLPT, and JF Can-do mappings;
- assessment metadata where relevant: mock level/section, timing, calibration band, distractor rationale, placement weight, exposure/version state, and source/media provenance;
- characters, expressions, locations, props, audio slots, and image requirements;
- universal display wording independent of a particular weekday.

## Scene package

Every scene declares:

```ts
interface SceneSpec {
  id: string;
  levelBand: 'foundation' | 'n5' | 'n4' | 'n3' | 'n2' | 'n1';
  location: LocationId;
  cast: Array<{ character: CharacterId; expression: ExpressionId; position: StagePosition }>;
  purpose: Array<'learning' | 'relationship' | 'mystery' | 'world'>;
  concepts: ConceptId[];
  script: CompiledNarrativeRef;
  activities: ActivityId[];
  theme: ThemeSlot;
  ambience?: AmbienceSlot;
  unlocks: UnlockSpec[];
}
```

The cast contains actual speakers, not everyone mentioned in narration. A name mentioned in explanatory UI may show a small journal portrait; dialogue places the full sprite on stage.

## Dialogue pass

Each authored scene receives four passes:

1. **Purpose:** remove lines that do not advance learning, relationship, mystery, or world.
2. **Voice:** make each line identifiable without its name label.
3. **Japanese:** verify naturalness, level, register, furigana segmentation, and support.
4. **Performance:** add expression, pause, pose, sound, and framing only where it changes the beat.

Dialogue uses short turns, interruptions, callbacks, and concrete objects. Comedy comes from established character behaviour. Emotional turns happen through action and implication before explanation.

## Pop-culture scene templates

- Tom proposes a Pokemon-name katakana challenge and later a Zelda recommendation exchange.
- Aakash compares a rainy street to a city-pop jacket and asks the learner to give directions to the better photo spot.
- Francis and Xingyu compare a Miku performance and a Frieren scene using opinion and emotional language.
- Shin describes the Nintendo Museum and challenges the learner to infer a kanji mnemonic.
- A group disagreement about a Persona or Final Fantasy character becomes an N3 evidence/inference exercise.
- Ruparna leads a subtitle comparison using two legitimate translations of a film line.

Generated art may show these conversations and recognisable media context while preserving the approved Yomu painterly world and the characters' established likenesses.

## Source fidelity rule

The Academy wrapper may change context, presentation, response mode, and feedback. It may not omit, merge away, or silently rewrite a Moodle question. Every adaptation points back to the immutable source question and preserves the original alongside the playable form.
