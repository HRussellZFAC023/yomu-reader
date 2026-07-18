# Voice and dialogue direction

## Voice promise

Academy dialogue should sound like adults doing something together, not characters announcing their traits. A line earns its place by attempting, noticing, withholding, correcting, inviting, refusing, or changing an action. Information that nobody in the room needs is prose, not conversation.

The authoritative person-by-person anchors remain in `CAST-AND-CONSENT.md`. This document tells writers how to turn those anchors into natural scenes and how to prove that adjacent speakers do not collapse into one polished house voice.

## Source wall

Pokemon, Persona, JRPG, visual-novel, and conversation datasets contribute only abstract craft findings: local encounter jobs, recurring-place compression, appointment pacing, turn alternation, physical micro-actions, and callback transformation. No line, joke, verbal tic, scene setup, proprietary noun, or close paraphrase may cross into Academy.

Raw class-chat exports are not authoring material. Writers may use only the first-name-safe synthesis in `docs/academy/CAST-AND-STORY-EVIDENCE.md`, and only for broad chemistry: practical questions beside teasing, help expressed through action, small study arguments, and a low-pressure return after absence.

## Voice card

Every speaking role in a package has a reviewed card. Unknown fields remain `unknown`; a writer does not fill them from intuition.

```ts
interface VoiceCard {
  castId: AcademyCastMemberId;
  evidenceStatus: 'approved-anchor' | 'deliberately-light' | 'textbook-cameo';
  attention: string;
  sentenceMovement: string;
  socialTactic: string;
  contradiction: string;
  underPressure: string;
  softensThrough: string;
  neverClaims: string[];
  registerRange: string[];
  dialogueTests: string[];
}
```

The four load-bearing fields are **attention**, **sentence movement**, **social tactic**, and **contradiction**. A catchphrase is optional and never substitutes for them.

## Ensemble contrast

Use these contrasts when assigning adjacent turns. They are writing tests, not fixed pairings.

| Pair | Same situation, different attention | Rhythm difference |
| --- | --- | --- |
| Rie / Sam | Rie notices what lets the room proceed; Sam notices who has not answered | Rie gives one usable next action; Sam turns enthusiasm into an explicit invitation |
| Henry / Angel | Henry reaches for the mechanism; Angel reaches for the plan around it | Henry qualifies late after a technical claim; Angel front-loads structure, then discovers an assumption |
| Aakash / Robert | both create momentum; Aakash notices route and city detail, Robert notices welcome and logistics | Aakash accelerates in short additions; Robert opens broadly, then itemizes |
| Tom / Francis | both enjoy media and play; Tom frames a challenge, Francis frames a specific taste | Tom escalates and names the rematch; Francis elaborates, then asks a floor-opening question |
| Mika / Xingyu | both hear sound; Mika attends to timing and silence, Xingyu to rhythm and memorability | Mika leaves space; Xingyu tries a line aloud and revises by ear |
| Sophie / Shin | both value accuracy; Sophie calibrates confidence, Shin decomposes form | Sophie states distinctions and exceptions; Shin compresses until uncertainty needs exposing |
| Jodi / Rose | both compare accounts; Jodi holds remembered and present detail together, Rose tests what the material world supports | Jodi layers two times; Rose begins concrete and widens slowly |
| Stasi / Ruparna | both care about representation; Stasi notices visual choice, Ruparna notices framing and alternate reading | Stasi gives direct preference; Ruparna turns an ordinary detail into a scene, then questions the cut |
| Christian / Jenny | both solve practical problems; Christian acts outwardly, Jenny tries privately before asking | Christian uses imperative sequences; Jenny uses economical sensory observations and one precise request |
| Peter / Shaun | both can be sparse; Peter reframes through a question, Shaun stays bounded to the immediate social/register beat | Peter's few words alter the task; Shaun's few words must not imply a hidden biography |
| Nanako / Mira | both make entry easy; Nanako tunes pragmatic warmth, Mira tests whether a plan or tool works in ordinary use | Nanako closes exchanges cleanly; Mira is direct, playful, and comfortable restarting small |
| Miller / Tawapon | both are textbook legends; Miller models and exits, Tawapon treats an improbable exercise as routine | neither receives introspection, private history, or a main-plot reveal |

Mary and Takeshi remain source-grounded cameos until separate original voice cards pass review. They do not inherit a generic anime-student voice to fill a gap.

## Pressure behavior

Stress narrows a voice before growth widens it. It must not replace everyone with eloquent vulnerability.

- Rie takes on one job too many and becomes more procedural; growth is accepting a specific handoff.
- Henry explains the tool past the human question; growth is asking what must remain understandable to others.
- Sam asks a second inclusion question too quickly; growth is asking once and hearing the answer.
- Jenny goes quiet and attempts the task alone; growth is naming the role she does want, not becoming publicly extroverted.
- Sophie overstates a clean inference; growth is marking confidence without abandoning precision.
- Robert fills a gap with another option; growth is leaving the gap and redesigning after a no.
- Peter waits so long that others decide around him; growth is asking the framing question in time.
- Mika (he/him) yields the floor even when his timing observation matters; growth is claiming the quiet role as expertise.
- Aakash adds energy to a disagreement; growth is slowing the route and repeating another person's condition accurately.
- Angel strengthens the spreadsheet when the premise is wrong; growth is exposing the assumption before rebuilding the plan.

Growth changes behavior and sentence movement. It does not erase the original attention pattern.

## Surface rhythm

| Surface | Typical uninterrupted length | Turn behavior | Exit |
| --- | --- | --- | --- |
| live lesson scenelet | 18-36 story turns around activity boundaries | short adjacency pairs, physical response, one lead and up to two supports | changed object, route, role, or question |
| elective appointment | 36-60 turns | ordinary task, difference in method, stance choice, changed action | concrete next possibility |
| class thread | 4-12 messages | proposal, answer, correction/tease, acknowledgment, next action | resolved task or explicit defer |
| season hinge | at most 70 turns with checkpoints | rapid alternation for logistics; silence and micro-action around the emotional turn | irreversible season fact |
| replay perspective | shorter than the canonical scene | perception and interpretation only | no new private or canonical fact |

Narration names only what a camera, ear, or bounded viewpoint could register. It does not diagnose a speaker, explain a silence, or announce the moral of the scene.

## Original voice diagnostics

These fragments were written for Yomu as diagnostic material. They are not adapted from a reference and are not automatically production copy. Japanese editorial review is still required.

**System, uncertainty, inclusion**

> Henry: 表示は直りました。たぶん。
> Sam: その「たぶん」、みんなで一回見ない？
> Rie: じゃ、開く前に三人で確認しましょう。

Henry reports the mechanism and qualifies late; Sam makes the uncertainty shared; Rie converts both into one bounded action. Swapping their lines should sound wrong.

**Evidence, framing, sound**

> Ruparna: 字幕にすると、ちょっと言い切りすぎじゃない？
> Sophie: うん。ここは「そうらしい」までかな。
> Mika: 音ももう一度聞こう。間が少し長い。

Each person notices a different layer. Nobody repeats the conclusion as a personality statement.

**Invitation and boundary**

> Robert: 前で話すのはどう？
> Jenny: 今回は、裏のほうを手伝いたい。
> Robert: 了解。じゃ、受付の流れを一緒に見てもらえる？

The refusal changes the plan immediately. The scene does not reward Jenny for agreeing, ask her to justify the limit, or praise Robert for basic respect.

## Language-layer invariants

The Japanese line is primary authoring, not an English line translated downward. Each band variant preserves:

1. who acts;
2. what they want;
3. what they know and do not know;
4. the strength of the claim;
5. the consent state;
6. the emotional pressure;
7. the next playable action.

Beginner variants gain concrete referents, recoverable subjects, and shorter adjacency pairs. They do not become childish, unnaturally complete, or more agreeable. Advanced variants may add ellipsis, implication, register movement, quotation, and calibrated uncertainty. They do not hide mandatory facts behind cultural guesswork.

English support explains after the Japanese need is established. It must not become the canonical line from which every variant is mechanically regenerated.

## Class-thread voice

Thread messages are shorter but not stripped of personhood.

- use one message for one social action;
- allow a repair message when a speaker genuinely changes or narrows the previous message;
- avoid staging every speaker as instantly available;
- use reactions only as acknowledgment, never as consent or relationship progress;
- do not imitate real misspellings, emoji patterns, usernames, timing, or message bursts;
- render deleted/edited-message drama only when wholly fictional and required by the plot; never use it to expose withdrawn material;
- let a return begin with the current task, not a demand for absence explanation.

A thread scene should still pass the voice-stripping test: remove names and verbal markers, then ask whether attention and tactic identify the likely speaker.

## Writing workflow

1. Write the scene's human want and changed action in plain prose.
2. Assign each beat to the person whose attention changes it; remove spectator commentary.
3. Draft semantic intents and boundaries before surface dialogue.
4. Draft Japanese at the target band directly, using the registered lesson function where required.
5. Add physical micro-actions and silence where they carry information better than a line.
6. Read only speaker initials aloud. Revise any run where several voices have the same sentence length and tactic.
7. Create other language layers from the same semantic beat, not from word substitution.
8. Run consent, evidence, callback, and source-similarity checks.
9. Obtain Japanese editorial review for naturalness, register, implication, and learner recoverability.
10. Record accepted voice-card and line revisions in the package manifest.

## Rejection tests

Reject or rewrite a scene when:

- two or more speakers summarize the same fact;
- every line is grammatical, balanced, and emotionally explicit in the same way;
- a joke could be spoken by anyone after changing a noun;
- a character explains their established trait instead of acting through it;
- the learner choice is one kind answer beside two socially implausible answers;
- a beginner line sounds like a textbook gloss rather than a situated turn;
- an advanced line becomes difficult only through rare vocabulary;
- the conflict disappears because everyone states the theme;
- the scene borrows a recognizable cadence, setup, or verbal signature from research material;
- a private-source detail is doing the work that fictional characterization should do.
