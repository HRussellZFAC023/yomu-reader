# Relationship continuity matrix

## Scope

This matrix schedules the five class-continuity beats defined in `STORY-BIBLE.md`. It covers every current non-textbook person with `eligibility.story: true` and excludes Miller, Tawapon, Mary, and Takeshi from relationship progression.

**Note (2026-07-18):** Nanako and Mira are NOT classmates — they are Henry's personal orbit (Nanako = his HelloTalk girlfriend / Japanese anchor; Mira = Karen, his US-based online-circle friend). They keep their beats and bonds, but their beats fire through Henry's orbit, the group chat, and visits/reunions rather than the classroom curriculum. Their arrival/return beats especially attach to Henry's HelloTalk-romance and returning-online-friend threads.

The chapter numbers are target outline placements, not runtime claims. A beat can be a lead scene, a support action, or one task-bearing class-thread exchange. It counts only when the person's action changes the scene.

Every person is `continuity-only` by default. Elective appointments require a separate reviewed manifest entry with state `bond-authored`; no status in this table grants one.

## Finite-plot schedule

| Person | Arrival | Contribution | Limit | Return | Future | Consent note |
| --- | --- | --- | --- | --- | --- | --- |
| Rie | 1 | 3 | 16 | 34 | 47 | approved teacher role and likeness; no private biography |
| Henry | 2 | 16 | 26 | 38 | 45 | systems/tool work only; no inferred job or history |
| Aakash | 3 | 11 | 30 | 39 | 43 | routes and plans; energetic invitation never overrides a no |
| Alex | 11 | 20 | 30 | 39 | 43 | future remains leaving, staying, or undecided without ranking |
| Tom | 5 | 15 | 18 | 32 | 44 | challenge/play stays generous; no borrowed game IP |
| Sam | 6 | 12 | 28 | 34 | 46 | inclusion shown through one clear invitation and heard answer |
| Francis | 7 | 25 | 31 | 39 | 46 | media specificity remains original and non-proprietary |
| Shin | 8 | 18 | 26 | 35 | 47 | form/component expertise includes visible uncertainty |
| Jodi | 9 | 20 | 33 | 40 | 48 | memory is not treated as publication permission |
| Christian | 10 | 16 | 30 | 34 | 45 | practical action can be declined or handed off |
| Jenny | 12 | 13 | 29 | 44 | 48 | stepping back is a complete choice, not a confidence deficit |
| Robert | 13 | 24 | 39 | 46 | 48 | hosting changes after refusal; food remains ordinary context |
| Mika | 4 | 15 | 25 | 34 | 46 | quiet pacing is expertise, not timidity to cure |
| Sophie | 1 | 14 | 27 | 38 | 47 | precision includes confidence limits and corrected inference |
| Xingyu | 1 | 15 | 31 | 44 | 46 | sound/rhythm work remains original; no inferred biography |
| Angel | 16 | 18 | 30 | 32 | 45 | plans expose assumptions and can be transferred to others |
| Stasi | 18 | 24 | 31 | 44 | 48 | visual preference is not treated as factual memory |
| Ruparna | 19 | 24 | 31 | 44 | 46 | cinematic framing preserves alternate readings |
| Rose | 20 | 26 | 33 | 35 | 47 | practical evidence does not authorize other people's stories |
| Peter | 21 | 25 | 34 | 42 | 48 | sparse questions must change the frame, not imply hidden history |
| Felix | 17 | 21 | 29 | 35 | 48 | cats are one attention home, never his whole personality |
| Shaun | 22 | 23 | 34 | 45 | 48 | story-only; no lesson ownership or invented specialty |
| Nanako | 23 | 28 | 33 | 41 | 48 | occasional; private-source restrictions remain binding |
| Mira | 24 | 28 | 32 | 43 | 48 | occasional; return has no guilt and private details stay excluded |

## Beat interpretation

- **Arrival** introduces attention and sentence movement without biography.
- **Contribution** lets a bounded competence alter shared work.
- **Limit** is a refusal, uncertainty, disagreement, unavailable role, or corrected assumption. It is not mandatory disclosure.
- **Return** proves the ensemble heard the limit through changed behavior.
- **Future** leaves one next possibility open without predicting a real person's life.

The same chapter may carry several continuity beats only when they belong to one shared action. They do not require one line per person. Chapter 48 uses a controlled montage and selects a few spoken callbacks; the journal records the rest without a roll call.

## Pacing audit

- Arrivals occur in Seasons 1-2, matching actual story entry rather than forcing everyone into Chapter 1.
- Limits occur no earlier than the person's contribution and concentrate in Seasons 2-3, where the plot can respond.
- Every limit has a later return before or alongside the future beat.
- Futures distribute across Chapters 43-48 and do not all become graduation speeches.
- Chapters 30, 31, and 34 are deliberate group-pressure points; Chapters 46 and 48 are ensemble finales. Their multiple matrix beats must be split across scenelets, thread actions, backstage work, or montage. The one-lead/two-support speaking cap still applies to each scene.
- Nanako, Mira, and Shaun remain bounded by their source/lesson restrictions.
- Textbook legends receive no continuity cursor, elective invitation, private scene, or graduation payoff.
- A package-level cast cap still wins: if this matrix would crowd a scene, move the beat to a nearby class-thread or environmental action without changing order.

## Elective-route manifest

The separate target manifest has this minimum shape:

```ts
interface RelationshipManifestEntry {
  castId: AcademyCastMemberId;
  status: 'continuity-only' | 'bond-authored' | 'hold';
  revision: string;
  appointmentPackageIds: [] | [string, string, string, string, string, string];
  approvedActivities: string[];
  forbiddenClaims: string[];
  fallbackVariant: string;
  voiceCardRevision: string;
  consentReview: string;
}
```

Validation requires exactly six ordered packages for `bond-authored`, none for `continuity-only`, and no delivery for `hold`. A route cannot be generated from the voice table, class-chat synthesis, cast eligibility, or learner demand.
