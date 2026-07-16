# Callback ledger

## Contract

A callback is a changed use of an earlier concrete detail. Recognition alone is not payoff. The lifecycle is `seed -> echo -> transform -> payoff`, and each transition must alter what a person can do, what the class understands, or how a language function works under pressure.

This is the canonical plot-level ledger. Package manifests own exact scene/node references and may add small appointment-local callbacks, but they cannot create a second seed or exceed this budget.

## Plot callbacks

| ID | Owners | Seed | Echo | Transform | Payoff | Use budget |
| --- | --- | --- | --- | --- | --- | --- |
| `callback:open-chair` | Rie, learner | Arrival bridge: an unclaimed chair makes entry possible without demanding a backstory | Ch 1: the learner's bounded card gives the place a current use | Ch 29: Jenny's visible role is left open after she declines; the class redesigns instead of filling it for her | Ch 48: a blank page is offered under terms, with no person assigned to occupy it | 5 |
| `callback:first-lantern` | Rie, ensemble | Ch 1: one repaired greeting lights one route point | Ch 12: the first ensemble save restores a short route rather than the whole atlas | Ch 24: live narration makes the map responsive because people coordinate, not because the object is magical | Ch 47-48: the ordinary mechanism is named, the atlas closes, and a non-lit blank page remains valid | 6 |
| `callback:wrong-charger` | Henry, Angel | Ch 2: a tool is prepared carefully except for the connector the room actually needs | Ch 16: a technically correct instruction causes the display failure | Ch 32: the right screen loads the wrong draft, shifting the joke from hardware to version responsibility | Ch 45: Henry hands another person a tested, documented setup and asks them to run it without him | 4 |
| `callback:overbuilt-schedule` | Sam, Angel, Robert | Ch 6: an invitation contains so many options that nobody can answer clearly | Ch 13: Robert's perfect dinner sequence fails on one changed ingredient | Ch 30: two defensible schedules force the class to state assumptions and decision ownership | Ch 39: the venue's cleaner plan is declined with one clear alternative and room for an answer | 5 |
| `callback:quiet-count` | Mika, Xingyu | Ch 4: Mika uses a pause and count to locate a listening entrance | Ch 15: Xingyu's flawed chorus makes the count memorable but cannot prove the words | Ch 34: the count becomes a backstage cue for a host who does not want the microphone | Ch 46: after a live misunderstanding, the same quiet cue creates space for transparent repair | 5 |
| `callback:paper-cat` | Tom, Felix, Stasi | Ch 5: a tiny paper cat marks the least dramatic clue in Tom's oversized game | Ch 17: Felix follows a moved marker through mislabeled cards | Ch 35: paper, ink, and placement make the marker useful as version evidence rather than a mascot | Ch 44: Stasi uses a new neutral marker to preserve a withheld passage's place without exposing its content | 5 |
| `callback:seventy-percent` | Ruparna, Sophie | Ch 19: partial comprehension is named as enough evidence to continue carefully | Ch 25: a polite phrase supports several readings, none at full confidence | Ch 31: a subtitle keeps uncertainty instead of manufacturing a complete claim | Ch 46: the class publicly distinguishes what it heard, inferred, and still cannot establish | 5 |
| `callback:useful-number-notebook` | Sophie, Rose, Henry | Ch 14: a number is recorded with context instead of treated as an answer | Ch 20: overlapping accounts are counted without voting one into truth | Ch 38: the notebook becomes an evidence map with explicit confidence and source kinds | Ch 47: provenance is concluded only to the level supported by the record | 5 |
| `callback:cold-tea` | Rie, Francis, learner | Ch 1: Rie's tea goes cold while she quietly keeps every part of the room moving | Ch 7: Francis notices the untouched cup and takes one bounded hosting task | Ch 34: several people offer help; Rie assigns jobs instead of saying she is fine | Ch 48: someone else closes the room while Rie drinks the tea before it cools | 4 |
| `callback:one-strong-question` | Peter, learner | Ch 7: a question opens a discussion without requiring shared taste | Ch 21: one question per learner rebuilds a district from partial knowledge | Ch 42: Peter asks whether the demand for one owner is itself the wrong frame | Ch 48: the learner may leave an open question as a valid final contribution | 5 |

The seed chapter must make sense without future knowledge. The payoff must still work for a learner who forgot the earlier detail; recognition adds warmth, not comprehension-critical information.

## Relationship callbacks

Class-continuity and elective-appointment callbacks use the same lifecycle but a narrower scope.

- Arrival may seed one attention detail.
- Contribution may echo it in a useful action.
- Limit or Appointment 4 may transform it under disagreement.
- Return, Future, or Appointment 6 may pay it off through changed behavior.
- An appointment-local payoff cannot resolve the atlas, a different person's boundary, or a lesson requirement.
- The main plot always has a fallback line for learners who did not play the optional seed.

At graduation, the system selects at most three elective-appointment payoff lines plus the required class-continuity montage. Completion breadth is visible in the journal, not compressed into a roll call where every person repeats a personalized thank-you.

## Load and tone rules

- A normal scenelet introduces at most one seed and uses at most two existing callbacks.
- A class-thread scene may seed or echo a practical detail; it cannot transform a serious boundary or deliver a plot payoff off-screen.
- A season hinge may pay off one plot object, one relationship behavior, and one language function.
- A comedy callback is suspended from the first boundary/refusal/apology beat until the other person changes the action.
- A callback cannot quote an old line merely to solicit recognition.
- Props withdrawn through cast/content review become neutral functional props without preserving distinctive wording or private associations.

## Package record

Every package use supplies the prior transition explicitly.

```ts
interface CallbackUse {
  id: string;
  state: 'seed' | 'echo' | 'transform' | 'payoff';
  ownerIds: AcademyCastMemberId[];
  meaningNow: string;
  priorUse?: {
    packageId: string;
    sceneId: string;
    state: 'seed' | 'echo' | 'transform';
  };
  useNumber: number;
  maximumUses: number;
  optionalFallback?: string;
}
```

Validation rejects a transition whose `meaningNow` differs only lexically from the prior use, a payoff without a transform, a use beyond budget, or an optional callback without a context-complete fallback.

## Continuity review

Before a season locks, read only the rows used in that season and answer:

1. Did each callback enter through ordinary action?
2. Did its meaning change rather than merely recur?
3. Did the owner change behavior, or did the narrator explain the change?
4. Can a learner understand the current scene without remembering the seed?
5. Is any joke active during a refusal or vulnerable admission?
6. Does the payoff resolve a relationship or action rather than applaud familiarity?

Any `no` returns the relevant scene to outline.
