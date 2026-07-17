import type { AcademyLearningSpecialty } from './authored-cast';
import type { AcademyCastMemberId } from './cast-registry';

type AcademyPendingBondCharacterId = 'steve' | 'tom2';

export const ACADEMY_BOND_CHARACTER_IDS = [
    'rie',
    'henry',
    'aakash',
    'alex',
    'tom',
    'sam',
    'francis',
    'shin',
    'jodi',
    'christian',
    'jenny',
    'robert',
    'mika',
    'sophie',
    'xingyu',
    'angel',
    'stasi',
    'ruparna',
    'rose',
    'peter',
    'felix',
    'steve',
    'tom2',
    'shaun',
] as const satisfies readonly (AcademyCastMemberId | AcademyPendingBondCharacterId)[];

export type AcademyBondCharacterId = typeof ACADEMY_BOND_CHARACTER_IDS[number];
export type AcademyBondStageNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type AcademyBondPhase =
    | 'encounter'
    | 'shared-task'
    | 'competence'
    | 'ritual'
    | 'friction'
    | 'boundary'
    | 'repair'
    | 'trust'
    | 'reciprocity'
    | 'open-future';

export interface AcademyCharacterVoice {
    readonly attention: string;
    readonly sentenceMovement: string;
    readonly socialTactic: string;
    readonly underPressure: string;
    readonly softensThrough: string;
}

export interface AcademyCharacterLearningRole {
    readonly specialties: readonly AcademyLearningSpecialty[];
    readonly activityPattern: string;
    readonly learnerBenefit: string;
}

export interface AcademyCharacterPrivacyContract {
    readonly portrayal: 'privacy-safe-fictionalized-composite';
    readonly approvedFacts: readonly string[];
    readonly prohibitedInferences: readonly string[];
}

export interface AcademyCharacterBondStage {
    readonly stage: AcademyBondStageNumber;
    readonly phase: AcademyBondPhase;
    readonly title: string;
    readonly relationshipTurn: string;
    readonly learningUse: string;
}

export interface AcademyCharacterPersonalityBondProfile {
    readonly characterId: AcademyBondCharacterId;
    readonly displayName: string;
    readonly disambiguation?: string;
    readonly voice: AcademyCharacterVoice;
    readonly desire: string;
    readonly contradiction: string;
    readonly recurringBit: string;
    readonly learningRole: AcademyCharacterLearningRole;
    readonly privacy: AcademyCharacterPrivacyContract;
    readonly bondArc: readonly AcademyCharacterBondStage[];
}

type BondStageSeed = readonly [title: string, relationshipTurn: string, learningUse: string];
type TenBondStageSeeds = readonly [
    BondStageSeed,
    BondStageSeed,
    BondStageSeed,
    BondStageSeed,
    BondStageSeed,
    BondStageSeed,
    BondStageSeed,
    BondStageSeed,
    BondStageSeed,
    BondStageSeed,
];

const BOND_PHASES = [
    'encounter',
    'shared-task',
    'competence',
    'ritual',
    'friction',
    'boundary',
    'repair',
    'trust',
    'reciprocity',
    'open-future',
] as const satisfies readonly AcademyBondPhase[];

const COMMON_PROHIBITED_INFERENCES = Object.freeze([
    'real events not explicitly approved by the person',
    'romance, trauma, diagnosis, finances, nationality, or private correspondence',
    'unrecorded family, employment, education, travel, or relationship history',
]);

function bondArc(seeds: TenBondStageSeeds): readonly AcademyCharacterBondStage[] {
    return Object.freeze(seeds.map(([title, relationshipTurn, learningUse], index) => Object.freeze({
        stage: (index + 1) as AcademyBondStageNumber,
        phase: BOND_PHASES[index],
        title,
        relationshipTurn,
        learningUse,
    })));
}

function privacy(
    approvedFacts: readonly string[],
    prohibitedInferences: readonly string[] = COMMON_PROHIBITED_INFERENCES,
): AcademyCharacterPrivacyContract {
    return Object.freeze({
        portrayal: 'privacy-safe-fictionalized-composite' as const,
        approvedFacts: Object.freeze([...approvedFacts]),
        prohibitedInferences: Object.freeze([...prohibitedInferences]),
    });
}

function profile(
    value: Omit<AcademyCharacterPersonalityBondProfile, 'bondArc'> & { readonly bondArc: TenBondStageSeeds },
): AcademyCharacterPersonalityBondProfile {
    return Object.freeze({
        ...value,
        voice: Object.freeze({ ...value.voice }),
        learningRole: Object.freeze({
            ...value.learningRole,
            specialties: Object.freeze([...value.learningRole.specialties]),
        }),
        bondArc: bondArc(value.bondArc),
    });
}

export const ACADEMY_CHARACTER_BOND_CATALOG = Object.freeze([
    profile({
        characterId: 'rie',
        displayName: 'Rie-sensei',
        voice: {
            attention: 'What lets the room continue without taking the work away from the learner.',
            sentenceMovement: 'Warm observation, one usable next action, then only the explanation that action needs.',
            socialTactic: 'Turns uncertainty into a small shared task and makes refusal easy.',
            underPressure: 'Becomes procedural and quietly takes on one job too many.',
            softensThrough: 'Accepting a specific handoff and letting a student teach part of the room.',
        },
        desire: 'To help every learner build a Japanese life that no longer depends on her standing beside them.',
        contradiction: 'She teaches independence while reflexively making herself indispensable.',
        recurringBit: 'Her tea goes cold beside a clay-smudged notebook; her glasses appear only after she has misread something at arm\'s length.',
        learningRole: {
            specialties: ['repair', 'register', 'feedback', 'art', 'restaurants'],
            activityPattern: 'Model, invite an attempt, give one precise repair, then hand the explanation back to the learner.',
            learnerBenefit: 'Makes mistakes recoverable while connecting register to museums, restaurant work, ceramics, and ordinary adult life.',
        },
        privacy: privacy([
            'Rie is the Academy teacher and may use the approved Rie-sensei role and likeness.',
            'She graduated in ceramics and teaches pottery classes.',
            'She needs glasses to see clearly.',
            'She works part-time at the Japan House museum and restaurant.',
        ]),
        bondArc: [
            ['The open chair', 'Rie welcomes the learner through one repairable exchange and leaves an empty chair rather than demanding confidence.', 'Notice a greeting, name preference, and one classroom repair phrase.'],
            ['Clay on the worksheet', 'A clay mark reveals her ceramics background when the learner helps sort pottery-class instruction cards.', 'Sequence simple imperatives through a real craft task.'],
            ['The museum label', 'The learner catches a label Rie cannot read without her glasses; she accepts the correction without performing authority.', 'Read short labels and practise clarification language.'],
            ['Cold tea, warm table', 'A recurring end-of-class tea check becomes a low-pressure ritual for naming one success and one uncertainty.', 'Use reflection language and calibrated self-assessment.'],
            ['Too many aprons', 'Museum, restaurant, pottery, and Academy duties collide; Rie insists she can cover every role and misses a learner signal.', 'Distinguish obligations, plans, and present capacity.'],
            ['Please do not finish it for me', 'The learner asks Rie to stop rescuing an attempt; she hears the boundary and waits.', 'Use respectful interruption and request-for-time language.'],
            ['The repaired bowl', 'Rie returns with a task split into teacher help and learner ownership, visibly changing her method.', 'Practise repair, cause, and changed-action narration.'],
            ['After closing time', 'At Japan House, Rie trusts the learner to guide one museum-and-restaurant exchange while she observes.', 'Shift between guest, colleague, and customer register.'],
            ['A class without the teacher', 'The learner runs a short teach-back; Rie contributes as a participant and accepts feedback on her prompt.', 'Consolidate through retrieval, explanation, and peer correction.'],
            ['The kiln door', 'Rie offers a future pottery-table meeting, then closes the term without claiming the learner\'s next chapter.', 'Plan an optional future activity using independent language goals.'],
        ],
    }),
    profile({
        characterId: 'henry',
        displayName: 'Henry-san',
        voice: {
            attention: 'The mechanism, workflow, and edge case that could make study easier.',
            sentenceMovement: 'Technical claim first, late qualification, then a quick human correction.',
            socialTactic: 'Offers a tool as a form of care.',
            underPressure: 'Explains the system past the person using it.',
            softensThrough: 'Asking what another person must understand without him present.',
        },
        desire: 'To leave behind study tools that genuinely give people leverage.',
        contradiction: 'He values simplicity but enjoys building enough to overbuild the first version.',
        recurringBit: 'The wrong charger is always in the most carefully labelled pouch.',
        learningRole: {
            specialties: ['tools', 'independent-study', 'technology'],
            activityPattern: 'Debug a language workflow by explaining each assumption in plain Japanese.',
            learnerBenefit: 'Turns metacognition, tool literacy, and self-directed study into visible language practice.',
        },
        privacy: privacy(['Henry is associated with study tools and independent-study systems in the approved fictional cast synthesis.']),
        bondArc: [
            ['The spare cable', 'Henry solves a tiny classroom problem before introducing himself, and the learner notices help expressed through systems.', 'Name objects, possession, and simple purpose.'],
            ['One useful button', 'They simplify a study tool together until only one next action remains.', 'Give instructions and explain basic function.'],
            ['The reproducible fix', 'Henry trusts the learner with the edge case that broke his first solution.', 'Describe conditions and reproduce a sequence.'],
            ['Version notes', 'A weekly two-line changelog becomes their ritual: what changed, and why.', 'Practise past-to-present comparison.'],
            ['Feature creep', 'Henry adds options nobody requested and dismisses the learner\'s confusion as configuration.', 'State preference and challenge an assumption.'],
            ['Readable without you', 'The learner refuses a tool they cannot explain to someone else.', 'Use criteria, refusal, and clarification.'],
            ['Delete three things', 'Henry removes rather than patches, proving he heard the actual problem.', 'Prioritize, compare, and justify deletion.'],
            ['The absent maintainer', 'He asks the learner to run the workflow while he stays silent.', 'Teach back a process from memory.'],
            ['Your tool, my review', 'The learner designs the smallest useful study aid and Henry reviews only requested risks.', 'Use specification, feedback, and revision language.'],
            ['Hand-off complete', 'Henry leaves documentation and an invitation to improve it, not a dependency on him.', 'Write durable instructions and future conditionals.'],
        ],
    }),
    profile({
        characterId: 'aakash',
        displayName: 'Aakash-san',
        voice: {
            attention: 'Routes, city detail, music, style, and the person who could join next.',
            sentenceMovement: 'Short energetic additions that accelerate until he deliberately repeats someone else\'s condition.',
            socialTactic: 'Creates momentum through a concrete invitation.',
            underPressure: 'Adds energy when the room needs space.',
            softensThrough: 'Slowing down and accurately carrying another person\'s condition forward.',
        },
        desire: 'To make the city and the class feel connected and alive.',
        contradiction: 'His generosity creates openings, but his momentum can accidentally close them.',
        recurringBit: 'Every route explanation acquires one stylish detour and one classic-car comparison.',
        learningRole: {
            specialties: ['directions', 'city-language', 'invitations'],
            activityPattern: 'Navigate a changing city route while checking each traveller\'s stated condition.',
            learnerBenefit: 'Makes direction language social, negotiated, and attentive rather than purely spatial.',
        },
        privacy: privacy(['Aakash has approved fictional anchors around energetic invitations, routes, city detail, fashion, music, and classic cars.']),
        bondArc: [
            ['The rain shortcut', 'Aakash offers a route and accepts the learner\'s slower pace as route information, not reluctance.', 'Use landmarks and movement verbs.'],
            ['Two ways there', 'They compare a fast route with an interesting route and choose together.', 'Practise comparison and preference.'],
            ['City detail', 'Aakash reveals expertise by noticing a sign everyone else passed.', 'Read public signs and explain evidence.'],
            ['Detour of the week', 'A tiny optional detour becomes a shared ritual with a clear opt-out.', 'Make and answer invitations.'],
            ['Too much momentum', 'He commits the group to a route before hearing a condition the learner stated.', 'Interrupt, restate, and revise a plan.'],
            ['One invitation is enough', 'The learner declines; Aakash stops without converting the no into another proposal.', 'Practise warm refusal and acknowledgment.'],
            ['Repeat the condition', 'He accurately repeats the learner\'s constraint before suggesting anything new.', 'Use reported conditions and confirmation.'],
            ['Lead from behind', 'Aakash lets the learner navigate while he handles interruptions.', 'Give directions under changing conditions.'],
            ['The learner\'s city', 'The learner designs a route around places that matter to them and Aakash follows.', 'Present a personalized itinerary.'],
            ['Next stop, undecided', 'They leave three future routes open without ranking one as the brave choice.', 'Use alternatives and open future plans.'],
        ],
    }),
    profile({
        characterId: 'alex',
        displayName: 'Alex-san',
        voice: {
            attention: 'The practical implication of a large change.',
            sentenceMovement: 'Concise, understated facts with the emotional weight left in the pause.',
            socialTactic: 'Makes uncertainty manageable by naming the next concrete decision.',
            underPressure: 'Delivers life-sized uncertainty like a timetable update.',
            softensThrough: 'Naming what is not decided and asking for help without apologizing.',
        },
        desire: 'To choose a future on his own terms rather than perform decisiveness for the group.',
        contradiction: 'His calm protects choice but can hide the fact that support is needed.',
        recurringBit: 'Major news arrives between two perfectly ordinary logistical details.',
        learningRole: {
            specialties: ['travel', 'experience', 'formal-plans'],
            activityPattern: 'Re-plan a journey as new information changes what is possible but not what is admirable.',
            learnerBenefit: 'Practises uncertainty, experience, and future language without treating one route as success.',
        },
        privacy: privacy(['Alex has an approved fictional role around travel, experience, formal plans, and understated uncertainty.']),
        bondArc: [
            ['Platform update', 'Alex shares one small route change and notices the learner does not force conversation.', 'Read times and travel changes.'],
            ['The alternative train', 'They solve a missed connection without pretending the original plan still works.', 'Use transport language and alternatives.'],
            ['Experience, not certainty', 'Alex distinguishes what he has done from what he knows will happen.', 'Practise experience forms and evidential limits.'],
            ['Quiet itinerary', 'A sparse shared plan becomes a ritual in which blank space means undecided, not forgotten.', 'Write tentative plans.'],
            ['The brave-route assumption', 'The learner praises the boldest option and Alex rejects the ranking.', 'Compare choices without moralizing them.'],
            ['Leave it undecided', 'Alex asks the class to stop seeking a conclusion he has not reached.', 'Use boundary and uncertainty language.'],
            ['A plan with branches', 'They rebuild the itinerary so staying, leaving, and waiting remain real routes.', 'Use conditional planning.'],
            ['Call the team', 'Alex pauses a simulated storm route and trusts the learner with the full uncertainty.', 'Report obstacles and request support.'],
            ['Your undecided thing', 'The learner shares a choice without resolving it; Alex holds the same space in return.', 'Use balanced self-disclosure and listening.'],
            ['Departure board', 'A future scene shows several valid destinations and no canonical ending.', 'Express hopes, reservations, and open futures.'],
        ],
    }),
    profile({
        characterId: 'tom',
        displayName: 'Tom-san',
        disambiguation: 'The original class Tom',
        voice: {
            attention: 'The challenge, rematch, and dramatic framing hidden inside ordinary practice.',
            sentenceMovement: 'Fast escalation, playful stakes, then a sincere invitation to try again.',
            socialTactic: 'Makes effort feel like shared play.',
            underPressure: 'Raises the spectacle until the learner loses room to discover.',
            softensThrough: 'Designing a fair rematch where someone else can find the decisive clue.',
        },
        desire: 'To make difficult Japanese feel worth running toward.',
        contradiction: 'He wants everyone playing, but his performance can become the whole game.',
        recurringBit: 'The final-boss ceremony is always longer than the exercise it celebrates.',
        learningRole: {
            specialties: ['kanji', 'games', 'casual-speech'],
            activityPattern: 'Turn retrieval into a replayable challenge with visible rules and a generous rematch.',
            learnerBenefit: 'Builds speed and persistence without hiding what is being tested.',
        },
        privacy: privacy(['Tom has approved fictional anchors around playful challenge language, kana, kanji, games, and casual speech.']),
        bondArc: [
            ['One-card boss', 'Tom frames a tiny kana card as a challenge and celebrates the learner\'s attempt, not only the answer.', 'Retrieve one sound under playful pressure.'],
            ['Co-op rules', 'They rewrite a game so both players must contribute different information.', 'Use turn-taking commands.'],
            ['The smallest clue', 'Tom demonstrates that good difficulty leaves a visible path to inference.', 'Read components and infer meaning.'],
            ['Rematch token', 'A weekly optional rematch becomes their ritual, with difficulty chosen together.', 'Use spaced retrieval and self-rating.'],
            ['Spectacle problem', 'Tom narrates over the learner\'s thinking and mistakes silence for disengagement.', 'Ask for thinking time and task clarity.'],
            ['No boss music', 'The learner requests a plain version; Tom removes the framing without sulking.', 'Practise direct preference and accommodation.'],
            ['Design the opening', 'Tom returns with a challenge whose first move teaches the rules.', 'Follow worked examples before retrieval.'],
            ['Player two leads', 'He hands the host role to the learner and follows their rules.', 'Explain constraints and grade fairly.'],
            ['A game for someone else', 'They design a review for another classmate\'s learning need.', 'Adapt language to an audience.'],
            ['New game plus', 'Tom proposes replays at higher language bands while preserving the same shared joke.', 'Revisit familiar content with reduced support.'],
        ],
    }),
    profile({
        characterId: 'sam',
        displayName: 'Sam-san',
        voice: {
            attention: 'Who has not answered and whether the invitation is actually clear.',
            sentenceMovement: 'Enthusiastic proposal, explicit invitation, then a pause he has to learn to keep.',
            socialTactic: 'Builds belonging through concrete plans.',
            underPressure: 'Asks a second inclusion question too quickly.',
            softensThrough: 'Asking once, hearing the answer, and changing the plan.',
        },
        desire: 'To make participation possible without making it compulsory.',
        contradiction: 'His instinct to include can feel like pressure to the person he most wants to welcome.',
        recurringBit: 'Saturday plans expand into a decision tree with one wildly unnecessary snack branch.',
        learningRole: {
            specialties: ['invitations', 'routines', 'planning'],
            activityPattern: 'Build one achievable invitation around time, access, and an easy decline.',
            learnerBenefit: 'Teaches consent, scheduling, and social repair as core communicative competence.',
        },
        privacy: privacy(['Sam has approved fictional anchors around invitations, routines, food, and consent-aware inclusion.']),
        bondArc: [
            ['One clear invitation', 'Sam invites the learner to a bounded task and names the easy way to decline.', 'Make and answer a basic invitation.'],
            ['Saturday window', 'They find one overlapping time without asking either person to explain every conflict.', 'Use days, times, and availability.'],
            ['Host the reply', 'Sam shows competence by acknowledging each answer before proposing anything else.', 'Practise acceptance, refusal, and confirmation.'],
            ['Snack branch', 'A tiny optional food choice becomes their comic planning ritual.', 'Use counters and preferences.'],
            ['The second ask', 'Sam follows a hesitation with another invitation and the learner feels cornered.', 'Recognize pressure in adjacency pairs.'],
            ['No reason required', 'The learner declines without explanation; Sam accepts the answer.', 'Use concise refusal and acknowledgment.'],
            ['Redesign after no', 'Sam returns with a plan that works without the declined role.', 'Revise roles and schedules.'],
            ['The quiet invitation', 'He trusts the learner to invite someone else and waits through the silence.', 'Use audience-aware invitations.'],
            ['Include me differently', 'Sam states his own limit and lets the learner adapt the plan.', 'Negotiate participation conditions.'],
            ['Open table', 'Their future ritual is a standing invitation with no attendance debt.', 'Express recurring opportunities without obligation.'],
        ],
    }),
    profile({
        characterId: 'francis',
        displayName: 'Francis-san',
        voice: {
            attention: 'The precise media detail that changes an interpretation.',
            sentenceMovement: 'Richly specific enthusiasm followed by a question that opens the floor.',
            socialTactic: 'Creates connection by taking taste seriously.',
            underPressure: 'Turns a personal reading into a verdict.',
            softensThrough: 'Asking what evidence another person noticed and hosting disagreement.',
        },
        desire: 'To build conversations where people can care deeply without needing one correct taste.',
        contradiction: 'His specificity makes discussion vivid but can crowd alternate readings.',
        recurringBit: 'A calm tea discussion somehow acquires the pacing of a late pub shift.',
        learningRole: {
            specialties: ['media', 'opinions', 'inference'],
            activityPattern: 'Discuss an original scene without spoilers, separating observation, inference, and preference.',
            learnerBenefit: 'Builds opinion language, evidence calibration, and respectful disagreement.',
        },
        privacy: privacy(['Francis has approved fictional anchors around media, opinions, inference, tea, and an unexpected-pub-shift comic rhythm.']),
        bondArc: [
            ['One safe clue', 'Francis asks for one detail the learner can discuss without knowing the whole story.', 'Describe media without naming the answer.'],
            ['Spoiler curtain', 'They create a rule set that protects different viewing progress.', 'Use prohibition and paraphrase.'],
            ['Specific, not final', 'Francis models a detailed opinion that still marks itself as personal.', 'State evidence and opinion separately.'],
            ['Tea after credits', 'A short post-scene question becomes their ritual.', 'Use reflective questions and reactions.'],
            ['The fan verdict', 'Francis dismisses a reading the learner reached from valid evidence.', 'Disagree and request justification.'],
            ['Do not host my answer', 'The learner asks him to stop translating their uncertainty into his conclusion.', 'Use ownership and boundary language.'],
            ['Reopen the floor', 'Francis restages the discussion so every claim names its evidence and confidence.', 'Calibrate inference against visible evidence and stated confidence.'],
            ['You choose the cut', 'He trusts the learner to select the clip and discussion question.', 'Summarize and facilitate.'],
            ['Taste under review', 'Francis offers an unfinished opinion and lets the learner challenge it.', 'Use hedging and counterexample.'],
            ['A club with no canon', 'They plan a future discussion shelf sorted by readiness, not prestige.', 'Recommend media with level and preference reasons.'],
        ],
    }),
    profile({
        characterId: 'shin',
        displayName: 'Shin-san',
        voice: {
            attention: 'The component, reading, or menu clue that makes a form economical.',
            sentenceMovement: 'Compact confident explanation that expands only when uncertainty becomes visible.',
            socialTactic: 'Shares expertise by decomposing the problem.',
            underPressure: 'Compresses the route so much that others see only the answer.',
            softensThrough: 'Showing the uncertain branch and inviting investigation.',
        },
        desire: 'To make complex forms feel legible rather than magical.',
        contradiction: 'His elegant shortcuts can conceal the work a beginner needs to see.',
        recurringBit: 'A solemn kanji investigation repeatedly ends with an extremely ordinary bowl of rice.',
        learningRole: {
            specialties: ['kanji', 'menus', 'nuance'],
            activityPattern: 'Combine components, readings, counters, and context to solve a visible language puzzle.',
            learnerBenefit: 'Teaches morphological noticing while normalizing uncertainty in expertise.',
        },
        privacy: privacy(['Shin has approved fictional anchors around kanji, menus, museums, ramen, and nuanced form analysis.']),
        bondArc: [
            ['The plain-rice clue', 'Shin invites the learner to solve one menu item from visible components.', 'Notice components and food vocabulary.'],
            ['Two possible readings', 'They keep both readings alive until context decides.', 'Use reading alternatives and counters.'],
            ['Show the route', 'Shin reveals his full reasoning rather than presenting the answer.', 'Explain component-based inference.'],
            ['Ramen footnote', 'One tiny menu note becomes their recurring investigation.', 'Read practical short-form text.'],
            ['Elegant but invisible', 'Shin skips steps and calls the problem simple after the learner is lost.', 'Request decomposition and reject false simplicity.'],
            ['Let me be uncertain', 'The learner asks him not to rescue the answer; he agrees to investigate beside them.', 'Use uncertainty and thinking-time phrases.'],
            ['The wrong branch', 'Shin publicly traces his own incorrect reading and corrects it.', 'Narrate error and evidence.'],
            ['Museum guide', 'He trusts the learner to explain a label while he asks only clarifying questions.', 'Give a structured kanji explanation.'],
            ['Your shortcut', 'The learner teaches a mnemonic and Shin tests it respectfully against evidence.', 'Create and evaluate mnemonics.'],
            ['Menu for strangers', 'They design a future pictureless menu that remains fair to first-time readers.', 'Author clue-rich authentic reading practice.'],
        ],
    }),
    profile({
        characterId: 'jodi',
        displayName: 'Jodi-san',
        voice: {
            attention: 'How a present detail sits beside what someone remembers.',
            sentenceMovement: 'Layers two times, then leaves room for them not to reconcile.',
            socialTactic: 'Invites reflection without claiming ownership of another person\'s memory.',
            underPressure: 'Adds context until the current task loses its edge.',
            softensThrough: 'Separating memory, evidence, permission, and public copy.',
        },
        desire: 'To preserve the depth of an experience without turning memory into authority.',
        contradiction: 'Her layered attention protects nuance but can make closure difficult.',
        recurringBit: 'The very specific old story always contains one detail whose relevance arrives three scenes later.',
        learningRole: {
            specialties: ['lived-memory', 'comparison', 'reading'],
            activityPattern: 'Pair then-and-now captions while tracking who can claim each detail.',
            learnerBenefit: 'Practises tense, quotation, and ethical source handling together.',
        },
        privacy: privacy(['Jodi has approved fictional anchors around narration, comparison, quotation, and distinguishing memory from publication permission.']),
        bondArc: [
            ['Two captions', 'Jodi shows the learner one invented image described in past action and present state.', 'Contrast past and present.'],
            ['Whose memory', 'They label which details are observed, remembered, or retold.', 'Use quotation and attribution.'],
            ['The useful old story', 'Jodi demonstrates how a remembered detail changes a current route without proving everything.', 'Connect evidence across time.'],
            ['Then-and-now card', 'A paired caption becomes their reflection ritual.', 'Write concise time-layered summaries.'],
            ['Too much context', 'Jodi adds a story that the learner did not consent to include in the shared atlas.', 'Challenge relevance and permission.'],
            ['Keep this off the page', 'The learner marks a detail private; Jodi removes it without asking why.', 'Use publication and privacy language.'],
            ['The clean public version', 'She returns with a version that preserves meaning while omitting the private detail.', 'Paraphrase and redact responsibly.'],
            ['Hold both accounts', 'Jodi trusts the learner to present two unresolved versions fairly.', 'Use calibrated contrast.'],
            ['A memory you may use', 'The learner offers a bounded fictional memory and specifies its allowed use.', 'Practise consent and source labels.'],
            ['Archive with an opening', 'They leave a future page blank except for the question that should guide it.', 'Write open research questions.'],
        ],
    }),
    profile({
        characterId: 'christian',
        displayName: 'Christian-san',
        voice: {
            attention: 'The first practical action that proves whether a plan works.',
            sentenceMovement: 'Energetic imperative sequence, physical test, then a late invitation for alternatives.',
            socialTactic: 'Helps by moving the shared problem into the world.',
            underPressure: 'Turns every problem into his project.',
            softensThrough: 'Assigning clear roles and letting someone decline or redesign them.',
        },
        desire: 'To convert good intentions into something the group can actually do.',
        contradiction: 'His action-first care can make collaboration feel like implementation of his plan.',
        recurringBit: 'The solution to a warm room acquires one more fan, pulley, or paper cloud than expected.',
        learningRole: {
            specialties: ['routines', 'instructions', 'experience'],
            activityPattern: 'Sequence, test, and repair instructions against a physical or simulated result.',
            learnerBenefit: 'Connects te-form, cause, and procedural language to visible consequences.',
        },
        privacy: privacy(['Christian has approved fictional anchors around action-first instructions, movement, routines, and elaborate practical solutions.']),
        bondArc: [
            ['First, move this', 'Christian invites the learner into one safe physical sequence and waits for confirmation.', 'Follow simple te-form instructions.'],
            ['Cloud pieces', 'They assemble a paper device from shuffled instruction cards.', 'Order procedural verbs.'],
            ['Test, do not guess', 'Christian shows competence by testing an instruction against the result.', 'Use cause and observed outcome.'],
            ['Five-minute fix', 'A tiny weekly repair becomes their shared ritual.', 'Describe routines and completion.'],
            ['My project now', 'Christian takes over the learner\'s idea and assigns roles without asking.', 'Interrupt and renegotiate roles.'],
            ['I am not doing that part', 'The learner declines a role; Christian stops the sequence.', 'Use direct task boundaries.'],
            ['Rebuild the instructions', 'He returns with roles as invitations and a handoff point after every step.', 'Write consent-aware procedures.'],
            ['You call the test', 'Christian lets the learner decide when the plan is ready to run.', 'Set criteria and authorize action.'],
            ['Help me stop', 'He asks the learner to identify when his own solution has become too much.', 'Give corrective feedback to a peer.'],
            ['A kit anyone can change', 'They leave a modular future activity rather than one perfect machine.', 'Document adaptable procedures.'],
        ],
    }),
    profile({
        characterId: 'jenny',
        displayName: 'Jenny-san',
        voice: {
            attention: 'The sensory or practical detail that reveals whether work is actually complete.',
            sentenceMovement: 'Economical observation, private attempt, then one precise request.',
            socialTactic: 'Contributes through quiet competence before claiming space.',
            underPressure: 'Goes silent and tries to carry the task alone.',
            softensThrough: 'Naming the role she does want and requesting bounded support.',
        },
        desire: 'To contribute work she can stand behind without being forced into performance.',
        contradiction: 'Her self-sufficiency is a strength that delays the help she is entitled to request.',
        recurringBit: 'A knitting repair solves a problem nobody realized was textile-related.',
        learningRole: {
            specialties: ['offers', 'description', 'work-language'],
            activityPattern: 'Restore a service or craft sequence through sensory description, offers, and precise requests.',
            learnerBenefit: 'Builds workplace language while validating low-pressure participation and help-seeking.',
        },
        privacy: privacy(['Jenny has approved fictional anchors around composed sensory observation, offers, description, work language, and knitting as practical repair.']),
        bondArc: [
            ['The quiet repair', 'Jenny fixes a loose prop and lets the learner notice the result before explaining it.', 'Name materials and visible states.'],
            ['One precise request', 'They restore a service sequence using one bounded request each.', 'Use requests and offers.'],
            ['Sensory evidence', 'Jenny teaches the learner to describe what proves an item is ready.', 'Use texture, appearance, and state adjectives.'],
            ['The spare stitch', 'A tiny repair check becomes their ritual before public tasks.', 'Use preparation and completion forms.'],
            ['Vanishing cue cards', 'Jenny tries to rebuild a failed sequence alone and stops answering.', 'Recognize overload without diagnosing it.'],
            ['Backstage, not front', 'She chooses a supporting role and the learner accepts it as complete participation.', 'State role preference and boundaries.'],
            ['Ask aloud', 'Jenny requests exactly one missing cue and the group responds only to that request.', 'Practise specific help-seeking.'],
            ['The role she chose', 'She trusts the learner to protect her chosen role when others improvise.', 'Advocate for agreed conditions.'],
            ['Your precise request', 'The learner asks Jenny for bounded help rather than admiration or rescue.', 'Form precise peer requests.'],
            ['Work worth returning to', 'They plan a future craft-and-language task with public and private roles equally visible.', 'Design accessible collaborative work.'],
        ],
    }),
    profile({
        characterId: 'robert',
        displayName: 'Robert-san',
        voice: {
            attention: 'Welcome, logistics, and what could make a shared table work.',
            sentenceMovement: 'Broad invitation followed by an increasingly detailed list of options.',
            socialTactic: 'Makes belonging tangible through hosting.',
            underPressure: 'Fills silence with another option.',
            softensThrough: 'Leaving the gap, hearing refusal, and redesigning after it.',
        },
        desire: 'To create places where people can arrive without already knowing the rules.',
        contradiction: 'His generous options can overwhelm the very person he wants to include.',
        recurringBit: 'Every route, conditional, and grammar problem threatens to end in food.',
        learningRole: {
            specialties: ['restaurants', 'invitations', 'keigo'],
            activityPattern: 'Host a changing meal or venue scenario while respecting preferences and refusals.',
            learnerBenefit: 'Makes hospitality register, conditionals, and listening to constraints inseparable.',
        },
        privacy: privacy(['Robert has approved fictional anchors around expansive welcome, logistics, restaurants, invitations, and keigo.']),
        bondArc: [
            ['A place at the table', 'Robert gives the learner one clear option and leaves space for an answer.', 'Use basic hospitality phrases.'],
            ['If this, then that', 'They adapt a meal plan around a changed ingredient.', 'Practise introductory conditionals.'],
            ['Register at the door', 'Robert demonstrates how welcome changes between friend, guest, and customer.', 'Shift hospitality register.'],
            ['The inevitable snack', 'A small food detour becomes their comic ritual.', 'Use counters and preferences.'],
            ['Option avalanche', 'Robert answers hesitation with too many alternatives.', 'Identify overload and request fewer choices.'],
            ['Leave the silence', 'The learner asks him to wait; he does not fill the pause.', 'Use thinking-time language.'],
            ['One changed plan', 'Robert returns with a plan rebuilt around the learner\'s no.', 'Explain accommodation and reason.'],
            ['Host beside me', 'He trusts the learner with the welcome while handling logistics quietly.', 'Perform an arrival exchange.'],
            ['Your table, your terms', 'The learner sets the conditions and Robert follows them.', 'Negotiate audience, menu, and role.'],
            ['The door stays optional', 'Their future venue keeps a place without turning absence into debt.', 'Express recurring invitations respectfully.'],
        ],
    }),
    profile({
        characterId: 'mika',
        displayName: 'Mika-san',
        voice: {
            attention: 'Timing, silence, pronunciation, and the difference between languages.',
            sentenceMovement: 'Careful comparison with deliberate space before the decisive observation.',
            socialTactic: 'Lowers pressure until a useful sound can be heard.',
            underPressure: 'Yields the floor even when her timing observation matters.',
            softensThrough: 'Claiming quiet expertise without becoming louder than herself.',
        },
        desire: 'To make careful listening count as visible participation.',
        contradiction: 'Her patience protects others but can erase her own contribution.',
        recurringBit: 'The room celebrates a correct sound just after Mika quietly predicted it.',
        learningRole: {
            specialties: ['clarification', 'pronunciation', 'speaking-confidence', 'listening'],
            activityPattern: 'Listen, leave space, compare one sound feature, and retry without public penalty.',
            learnerBenefit: 'Builds phonological awareness and speaking confidence through low-pressure iteration.',
        },
        privacy: privacy(['Mika has approved fictional anchors around careful pacing, pronunciation, multilingual comparison, and low-pressure speaking.']),
        bondArc: [
            ['The held beat', 'Mika notices one sound difference and waits for the learner to hear it.', 'Contrast timing and vowel length.'],
            ['Listen before labels', 'They sort sounds only after two complete listens.', 'Build listening discrimination.'],
            ['Quiet expertise', 'Mika explains why silence is part of the task rather than missing content.', 'Use timing and comparison language.'],
            ['One private retry', 'A no-audience recording becomes their ritual.', 'Self-assess pronunciation privately.'],
            ['The missed observation', 'The group talks over Mika\'s correct timing note and the learner follows the louder answer.', 'Revisit evidence and turn-taking.'],
            ['Please leave the space', 'Mika asks the learner not to fill her pause for her.', 'Use floor-holding phrases.'],
            ['Claim the quiet role', 'She leads the next listening task in her own pace and format.', 'Facilitate low-pressure listening.'],
            ['Your unfinished sound', 'Mika trusts the learner with a recording she has not polished.', 'Give kind, specific sound feedback.'],
            ['Protect the room', 'The learner designs speaking conditions that preserve quiet participation.', 'Negotiate recording and audience consent.'],
            ['A voice without a stage', 'They plan future audio exchanges that never require public performance.', 'Build sustainable speaking practice.'],
        ],
    }),
    profile({
        characterId: 'sophie',
        displayName: 'Sophie-san',
        voice: {
            attention: 'The distinction, evidence source, and confidence level behind a claim.',
            sentenceMovement: 'States the clean contrast, then marks the exception or confidence limit.',
            socialTactic: 'Makes uncertainty usable through calibration.',
            underPressure: 'Overstates a tidy inference.',
            softensThrough: 'Correcting the claim precisely without abandoning confidence.',
        },
        desire: 'To help the class know not only what seems right, but how strongly it is supported.',
        contradiction: 'Her clarity can make a provisional pattern sound universal.',
        recurringBit: 'Her color-coded note system eventually needs a color for notes about the color system.',
        learningRole: {
            specialties: ['grammar', 'evidence', 'reading'],
            activityPattern: 'Compare two plausible forms by changing context and grading confidence.',
            learnerBenefit: 'Builds grammar judgment, source evaluation, and tolerance for contextual answers.',
        },
        privacy: privacy(['Sophie has approved fictional anchors around grammar, reading, source comparison, evidence, and color-coded notes.']),
        bondArc: [
            ['Two plausible answers', 'Sophie asks what context would make each answer work.', 'Compare particles and context.'],
            ['Confidence colors', 'They label claims as observed, likely, or uncertain.', 'Use evidential language.'],
            ['Source triangulation', 'Sophie demonstrates how two references can disagree without one being useless.', 'Compare explanations and examples.'],
            ['Margin calibration', 'A weekly confidence note becomes their ritual.', 'Practise metacognitive judgment.'],
            ['The clean wrong inference', 'Sophie confidently rules out an answer that the source context supports.', 'Challenge a claim with evidence.'],
            ['Do not make me the exception', 'The learner refuses to have their confusion explained as carelessness.', 'Use respectful correction and impact language.'],
            ['Correction in ink', 'Sophie revises the public note, preserving why the first inference looked plausible.', 'Write transparent corrections.'],
            ['You hold the rubric', 'She trusts the learner to grade her explanation for recoverability.', 'Evaluate teaching clarity.'],
            ['Uncertain together', 'Sophie shares a live ambiguity and follows the learner\'s evidence trail.', 'Investigate without answer-first bias.'],
            ['Calibration voice', 'They leave a reusable method for future advanced grammar conflicts.', 'Apply confidence and source comparison at scale.'],
        ],
    }),
    profile({
        characterId: 'xingyu',
        displayName: 'Xingyu-san',
        voice: {
            attention: 'Rhythm, memorability, and how a line feels when spoken aloud.',
            sentenceMovement: 'Tries the line, revises by ear, and lets brightness carry the invitation.',
            socialTactic: 'Creates shared courage through sound and play.',
            underPressure: 'Polishes the rhythm before revealing that the work is unfinished.',
            softensThrough: 'Sharing a rough version and letting joy coexist with vulnerability.',
        },
        desire: 'To make Japanese live in the body and memory, not only on the page.',
        contradiction: 'Her musical ease can hide how much uncertainty sits beneath the finished sound.',
        recurringBit: 'The same hum begins as a joke, becomes a mnemonic, then accidentally cues an entire room.',
        learningRole: {
            specialties: ['sound', 'listening', 'casual-chat'],
            activityPattern: 'Hear, echo, vary, and reuse a line across rhythm and conversational context.',
            learnerBenefit: 'Strengthens prosody, listening memory, and willingness to produce imperfect speech.',
        },
        privacy: privacy(['Xingyu has approved fictional anchors around sound, listening, songs, rhythm, and bright casual conversation.']),
        bondArc: [
            ['A line by ear', 'Xingyu offers one short line as sound before showing its script.', 'Echo rhythm and mora timing.'],
            ['Lantern frequencies', 'They match spoken patterns to visible pulses.', 'Discriminate pitch and duration.'],
            ['Revision aloud', 'Xingyu demonstrates changing a line because it sounds wrong in context.', 'Use prosodic self-correction.'],
            ['The returning hum', 'A tiny melody becomes their retrieval ritual.', 'Recall phrases from audio cues.'],
            ['Too polished to join', 'The learner thinks Xingyu\'s finished version leaves no safe entry point.', 'Express intimidation and request scaffolding.'],
            ['Let me hear the rough one', 'The learner asks for an unfinished take; Xingyu decides what to share.', 'Use consent around recordings and drafts.'],
            ['One imperfect chorus', 'They build a version with audible retries left intact.', 'Practise repair during speech.'],
            ['You set the tempo', 'Xingyu follows the learner\'s pace and changes her accompaniment.', 'Control speed and repetition.'],
            ['A sound only you noticed', 'The learner teaches Xingyu a distinction from their own listening evidence.', 'Give phonological evidence.'],
            ['The hum changes meaning', 'The motif returns in a future scene as a cue the whole class now understands.', 'Transfer sound memory into spontaneous use.'],
        ],
    }),
    profile({
        characterId: 'angel',
        displayName: 'Onke-san',
        voice: {
            attention: 'The plan, dependency, and assumption surrounding uncertainty.',
            sentenceMovement: 'Front-loads structure, then discovers the premise that structure concealed.',
            socialTactic: 'Makes participation easier by making work visible.',
            underPressure: 'Strengthens the spreadsheet when the premise is wrong.',
            softensThrough: 'Exposing assumptions early and trusting an ensemble after the master plan breaks.',
        },
        desire: 'To turn uncertainty into plans people can actually use.',
        contradiction: 'Her clarity can make an untested assumption feel settled.',
        recurringBit: 'A spreadsheet appears before the group has agreed what decision it is making.',
        learningRole: {
            specialties: ['planning', 'technology', 'writing'],
            activityPattern: 'Build, test, break, and revise a plan while naming assumptions and ownership.',
            learnerBenefit: 'Connects written Japanese, planning grammar, and collaborative reasoning.',
        },
        privacy: privacy([
            'Onke is Angel\'s owner-provided preferred name; the stable compatibility id remains angel.',
            'Her approved fictional anchors concern planning, technology, writing, and assumption testing.',
        ]),
        bondArc: [
            ['Preferred name', 'Onke introduces the name she wants used, and the learner updates the shared page without treating it as trivia.', 'Practise name preference and respectful correction.'],
            ['The visible plan', 'They turn a vague group idea into owners, steps, and open questions.', 'Use planning and responsibility language.'],
            ['Useful structure', 'Onke shows how a table can reveal rather than erase uncertainty.', 'Read structured notes and statuses.'],
            ['Assumption check', 'A weekly one-line premise check becomes their ritual.', 'State and question assumptions.'],
            ['Perfect plan, wrong problem', 'Onke optimizes a route that nobody actually agreed to take.', 'Challenge purpose and premise.'],
            ['Do not schedule my yes', 'The learner rejects a role Onke had treated as confirmed.', 'Use consent and ownership language.'],
            ['Delete the master plan', 'Onke replaces the schedule with a smaller ensemble board built from explicit commitments.', 'Revise plans after changed consent.'],
            ['Share the controls', 'She trusts the learner to change dependencies without asking permission for every cell.', 'Negotiate collaborative editing.'],
            ['The plan that helps Onke', 'The learner notices her hidden workload and offers one bounded handoff.', 'Offer support without taking over.'],
            ['A template with blanks', 'They leave a future planning tool whose empty fields invite new owners and new routes.', 'Write adaptable plans and open questions.'],
        ],
    }),
    profile({
        characterId: 'stasi',
        displayName: 'Stasi-san',
        voice: {
            attention: 'Visual choice, texture, style, and whether expression has become generic.',
            sentenceMovement: 'Direct preference followed by a concrete visual comparison.',
            socialTactic: 'Protects individuality by naming what an image actually does.',
            underPressure: 'Trusts a vivid image more than the evidence supporting it.',
            softensThrough: 'Revising the memorable version without sanding away its character.',
        },
        desire: 'To make learning artifacts memorable without making everyone look or sound the same.',
        contradiction: 'Her visual conviction can turn a strong impression into a false memory.',
        recurringBit: 'A scarf becomes an annotation system, route marker, and eventually an accidental grammar legend.',
        learningRole: {
            specialties: ['art', 'personal-expression', 'kanji'],
            activityPattern: 'Create and audit a visual mnemonic against form, meaning, and evidence.',
            learnerBenefit: 'Uses dual coding while teaching that memorability must remain correctable.',
        },
        privacy: privacy(['Stasi has approved fictional anchors around visual comparison, direct preference, art, style, kanji memory, scarves, and visual margins.']),
        bondArc: [
            ['The margin matters', 'Stasi notices the learner\'s tiny visual choice and asks what it is meant to carry.', 'Describe color, shape, and purpose.'],
            ['Mnemonic studio', 'They build one image from a kanji component and test recall.', 'Use visual mnemonics.'],
            ['Distinct, not decorative', 'Stasi demonstrates how a visual cue earns its place.', 'Explain design function.'],
            ['Scarf code', 'A changing scarf marker becomes their ritual for review status.', 'Use colors and state language.'],
            ['The vivid false memory', 'Stasi remembers the image confidently but the form disproves it.', 'Compare memory with source evidence.'],
            ['Do not make it bland', 'She rejects a correction that removes every useful visual distinction.', 'Negotiate accuracy and expression.'],
            ['Correct and memorable', 'They revise the mnemonic so the error itself becomes a retrieval warning.', 'Encode corrective feedback.'],
            ['Your visual grammar', 'Stasi trusts the learner to art-direct a review set.', 'Present visual rationale.'],
            ['Audit my favorite', 'She asks the learner to challenge the image she likes most.', 'Use preference versus evidence language.'],
            ['Margins for future hands', 'They leave a modular visual system that expects revision.', 'Document mnemonic provenance and limits.'],
        ],
    }),
    profile({
        characterId: 'ruparna',
        displayName: 'Ruparna-san',
        voice: {
            attention: 'Framing, implication, subtitle choice, and the alternate reading outside the cut.',
            sentenceMovement: 'Turns an ordinary detail into a scene, then questions what the scene omitted.',
            socialTactic: 'Creates empathy by changing viewpoint.',
            underPressure: 'Lets cinematic coherence outrun what the language supports.',
            softensThrough: 'Preserving alternate readings and marking translation judgment openly.',
        },
        desire: 'To carry emotional implication across languages without pretending translation is neutral.',
        contradiction: 'Her gift for framing can make one beautiful reading feel inevitable.',
        recurringBit: 'A mundane classroom action receives the lighting and suspense of a final scene.',
        learningRole: {
            specialties: ['subtitles', 'inference', 'ambiguity'],
            activityPattern: 'Subtitle an original scene, compare alternate readings, and defend what each version loses.',
            learnerBenefit: 'Develops listening, pragmatic inference, and ethical translation judgment.',
        },
        privacy: privacy(['Ruparna has approved fictional anchors around film, subtitles, inference, alternate readings, and cinematic descriptions of mundane action.']),
        bondArc: [
            ['The dramatic umbrella', 'Ruparna frames an ordinary umbrella return as a scene and asks what the learner heard.', 'Describe visible action and tone.'],
            ['Two subtitle tracks', 'They create literal and contextual subtitles for one line.', 'Compare translation strategies.'],
            ['What the cut omits', 'Ruparna shows how viewpoint changes a plausible inference.', 'Use perspective and evidential language.'],
            ['Scene of the week', 'A mundane action receives a playful title and one translation note.', 'Summarize and subtitle concisely.'],
            ['Beautiful but unsupported', 'Ruparna chooses the stronger emotional reading without enough evidence.', 'Challenge inference from audio and context.'],
            ['Keep both readings', 'The learner asks her not to collapse an ambiguity the scene needs.', 'Use ambiguity and alternative language.'],
            ['The honest subtitle', 'She returns with two options and a note explaining the tradeoff.', 'Write transparent translation notes.'],
            ['You choose the frame', 'Ruparna trusts the learner to edit the sequence and defend omissions.', 'Present editorial decisions.'],
            ['Translate me carefully', 'She offers an unfinished line and lets the learner preserve its uncertainty.', 'Translate implication without overclaiming.'],
            ['Credits with alternatives', 'Their future archive keeps alternate subtitles available rather than naming a winner.', 'Maintain revisitable interpretation.'],
        ],
    }),
    profile({
        characterId: 'rose',
        displayName: 'Rose-san',
        voice: {
            attention: 'Material evidence, practical consequence, and what changes over a longer view.',
            sentenceMovement: 'Begins concrete, tests the object or place, then widens slowly to comparison.',
            socialTactic: 'Grounds a group story in something everyone can inspect.',
            underPressure: 'Treats practical evidence as if it resolves emotional meaning.',
            softensThrough: 'Keeping several memories beside the evidence rather than beneath it.',
        },
        desire: 'To make shared stories sturdy enough to revisit and revise.',
        contradiction: 'Her grounded method can look emotionally distant when the material answer is not the human answer.',
        recurringBit: 'She solves a surprisingly abstract dispute with an oddly practical object test.',
        learningRole: {
            specialties: ['nature', 'work-language', 'lived-memory'],
            activityPattern: 'Inspect real or fictional material evidence, describe change, and compare accounts over time.',
            learnerBenefit: 'Builds concrete description, longitudinal comparison, and evidence-aware narration.',
        },
        privacy: privacy(['Rose has approved fictional anchors around practical observation, nature, work language, lived comparison, and material evidence.']),
        bondArc: [
            ['Check the object', 'Rose asks the learner to inspect one physical clue before interpreting it.', 'Use material and state vocabulary.'],
            ['Weathered page', 'They compare how an object changed and what stayed legible.', 'Use change-over-time forms.'],
            ['Practical proof', 'Rose demonstrates a simple test that resolves one factual dispute.', 'Describe method and result.'],
            ['Long-view note', 'A monthly observation becomes their ritual.', 'Write longitudinal comparisons.'],
            ['Evidence is not meaning', 'Rose treats the physical result as the final account and misses the learner\'s different memory.', 'Separate fact from significance.'],
            ['Do not test this feeling', 'The learner asks her to stop turning an emotional statement into a proof problem.', 'Use boundary and acknowledgment language.'],
            ['Several true captions', 'Rose returns with evidence and memories placed side by side.', 'Present layered accounts.'],
            ['You run the field note', 'She trusts the learner to choose what to observe and what not to claim.', 'Plan ethical observation.'],
            ['A practical kindness', 'The learner solves Rose\'s problem through a concrete action without interpreting her.', 'Offer bounded practical support.'],
            ['The living record', 'They leave a future log designed to change rather than certify one story.', 'Create revisitable evidence records.'],
        ],
    }),
    profile({
        characterId: 'peter',
        displayName: 'Peter-san',
        voice: {
            attention: 'The sparse question that reveals the task may be framed incorrectly.',
            sentenceMovement: 'Waits, asks one short question, and lets its consequence do the talking.',
            socialTactic: 'Creates space by changing the frame rather than supplying an answer.',
            underPressure: 'Waits so long that others decide around him.',
            softensThrough: 'Asking the framing question while it can still alter the plan.',
        },
        desire: 'To find the question that makes shared work honest and manageable.',
        contradiction: 'His restraint protects thought but can make his needs and insight invisible.',
        recurringBit: 'The apparently unoccupied seat turns out to contain Peter, a notebook, or one decisive question.',
        learningRole: {
            specialties: ['review', 'questions', 'observation'],
            activityPattern: 'Pause an answer-first task, identify the missing question, and reopen retrieval from a better frame.',
            learnerBenefit: 'Builds question formation, review judgment, and strategic help-seeking.',
        },
        privacy: privacy(['Peter has approved fictional anchors around sparse reframing questions, review, observation, and the unoccupied-looking seat.']),
        bondArc: [
            ['Is that the task', 'Peter asks one question that reveals the learner was solving the wrong problem.', 'Use basic clarification questions.'],
            ['Review the question', 'They rewrite a confusing prompt before answering it.', 'Evaluate task wording.'],
            ['Sparse observation', 'Peter demonstrates how one noticed detail can replace a long explanation.', 'Use concise evidence statements.'],
            ['Empty-seat question', 'A weekly mystery question appears at the supposedly empty seat.', 'Practise retrieval through questioning.'],
            ['Too late to reframe', 'Peter waits until the group has committed to a poor plan.', 'Use interruption timing and regret.'],
            ['Ask before deciding for me', 'The learner tells Peter his silence cannot be interpreted as agreement.', 'Use confirmation and consent language.'],
            ['The question in time', 'Peter interrupts early with the exact ownership question the plan needs.', 'Form high-leverage questions.'],
            ['You answer with a question', 'He trusts the learner to facilitate a review without giving solutions.', 'Use Socratic review safely.'],
            ['What do you need asked', 'Peter invites the learner to name the question they cannot yet form.', 'Practise metalinguistic help-seeking.'],
            ['An open question, kept open', 'They leave a future inquiry without manufacturing an answer.', 'Track unresolved questions productively.'],
        ],
    }),
    profile({
        characterId: 'felix',
        displayName: 'Felix-san',
        voice: {
            attention: 'Small animal behavior and the concrete detail everyone else ignored.',
            sentenceMovement: 'Quiet observation, delighted specificity, then a question passed to someone else.',
            socialTactic: 'Uses curiosity to lower the stakes of careful attention.',
            underPressure: 'Retreats into the cat detail instead of taking a broader role.',
            softensThrough: 'Following curiosity into evidence and then handing the method to the group.',
        },
        desire: 'To prove that delight can be a rigorous way of noticing.',
        contradiction: 'His favorite attention home invites others in but can become a safe hiding place.',
        recurringBit: 'A paper-cat marker appears wherever the most useful overlooked clue is hiding.',
        learningRole: {
            specialties: ['nature', 'description', 'personal-expression'],
            activityPattern: 'Follow a playful visual marker into observation, counting, description, and question passing.',
            learnerBenefit: 'Turns concrete curiosity into sustained descriptive and interrogative language.',
        },
        privacy: privacy([
            'Felix is white, wears glasses, has longer curly dark-blond to light-brown hair, and likes cats.',
            'All events, relationships, and additional biography are fictionalized rather than claimed as real.',
        ]),
        bondArc: [
            ['The paper cat', 'Felix points out a cat-shaped marker beside the clue the learner missed.', 'Use location and observation language.'],
            ['How many paws', 'They turn animal counters into a careful counting task.', 'Practise counters and quantities.'],
            ['Delight as method', 'Felix shows how a playful question can produce usable evidence.', 'Ask descriptive follow-ups.'],
            ['Marker migration', 'The paper cat moves weekly to one overlooked detail.', 'Review spatial language.'],
            ['The cat-shaped escape', 'Felix redirects a difficult shared decision into another animal observation.', 'Recognize topic avoidance without diagnosis.'],
            ['Stay with this question', 'The learner asks him to keep the curiosity but return to the group task.', 'Use gentle redirection.'],
            ['Pass the marker', 'Felix uses the cat clue to reopen the actual decision and hands the next question on.', 'Connect observation to reasoning.'],
            ['Beyond cats', 'He trusts the learner to choose the next attention home.', 'Describe unfamiliar topics through noticed detail.'],
            ['A clue for Felix', 'The learner designs an observation puzzle that respects rather than caricatures his interest.', 'Adapt examples to a person.'],
            ['Curiosity trail', 'They leave a future sequence of optional markers across the Academy world.', 'Build self-directed observation practice.'],
        ],
    }),
    profile({
        characterId: 'steve',
        displayName: 'Steve-san',
        voice: {
            attention: 'Whether a sentence sounds like something a real family member would actually text.',
            sentenceMovement: 'Conversational confidence aloud, then careful stops around kana, tone, and message endings.',
            socialTactic: 'Uses dry family-chat examples to make practical writing less ceremonial.',
            underPressure: 'Jokes past the basic writing question he feels he should already know.',
            softensThrough: 'Letting spoken competence and beginner writing coexist without shame.',
        },
        desire: 'To take part naturally in the Japanese family group chats already moving around him.',
        contradiction: 'Years of family familiarity and some spoken Japanese make starting from basic written forms feel harder, not easier.',
        recurringBit: 'Every perfectly polite draft is rejected because no child would believe Steve typed it.',
        learningRole: {
            specialties: ['casual-chat', 'technology', 'writing', 'register'],
            activityPattern: 'Turn a spoken intent into a short family-chat message, then revise tone, kana, and emoji-free meaning.',
            learnerBenefit: 'Makes literacy, casual register, and adult beginner identity practical and emotionally credible.',
        },
        privacy: privacy([
            'Steve is an older man with a Japanese wife and bilingual children.',
            'He can speak some Japanese and joined the class to text naturally in family group chats.',
            'The Academy messages, family events, and dialogue are invented composites, not representations of private correspondence.',
        ], [
            'real family messages, names, locations, conflicts, or identifiable events',
            'romance, trauma, diagnosis, finances, or unapproved employment and education history',
            'claims about his wife or children beyond the owner-provided brief',
        ]),
        bondArc: [
            ['The unread draft', 'Steve asks the learner whether a stiff but correct message sounds like him.', 'Compare polite and family-chat register.'],
            ['Voice to kana', 'They turn one spoken sentence into a short typed message.', 'Map speech to kana and punctuation.'],
            ['Read receipt', 'Steve demonstrates how context changes the amount a message must say.', 'Use ellipsis, subjects, and shared context.'],
            ['Family-chat Friday', 'One fictional practical message becomes their weekly ritual.', 'Build short-message fluency.'],
            ['I should know this', 'Steve jokes away a kana gap and gives the learner an impossible editing task.', 'Name a knowledge gap without apology.'],
            ['Do not grade my family', 'He stops the learner from treating imagined family reactions as language scores.', 'Separate linguistic feedback from relationship prediction.'],
            ['The honest beginner line', 'Steve rewrites the message at his real writing level and asks one specific question.', 'Use repair and clarification in text.'],
            ['You send the first draft', 'He trusts the learner with an equally imperfect fictional message and responds as a peer.', 'Peer-edit concise chat language.'],
            ['Teach me your shortcut', 'Steve shares spoken intuition while the learner shares a writing strategy.', 'Exchange complementary expertise.'],
            ['Inside the conversation', 'A future montage shows Steve drafting without ceremony, with no private family content exposed.', 'Sustain independent practical writing.'],
        ],
    }),
    profile({
        characterId: 'tom2',
        displayName: 'Tom-san',
        disambiguation: 'The later-arriving, taller Tom',
        voice: {
            attention: 'The detail people omit when they believe the obvious story too quickly.',
            sentenceMovement: 'Brief question, long pause, unexpectedly warm observation once trust is earned.',
            socialTactic: 'Creates curiosity without demanding disclosure.',
            underPressure: 'Withholds so much context that care looks like distance.',
            softensThrough: 'Offering one verifiable piece of himself before asking others to risk an answer.',
        },
        desire: 'To be known through chosen actions rather than whatever story people invent around silence.',
        contradiction: 'He values careful privacy but his mystery invites the assumptions he dislikes.',
        recurringBit: 'He appears to know a shortcut, a locked door, or an obscure answer, then reveals an ordinary reason.',
        learningRole: {
            specialties: ['ambiguity', 'questions', 'observation', 'inference'],
            activityPattern: 'Investigate an ambiguous scene by separating visible evidence, omitted context, and chosen disclosure.',
            learnerBenefit: 'Builds implication and inference while teaching that uncertainty is not permission to invent biography.',
        },
        privacy: privacy([
            'Tom2 is tall, of average build, has dark-brown hair, and initially seems mysterious but becomes warm over time.',
            'All reasons for his reserve, history, relationships, and events are fictionalized and non-diagnostic.',
        ]),
        bondArc: [
            ['The second Tom', 'He handles the shared-name confusion with a dry practical solution and no demand for a nickname.', 'Use identification and clarification.'],
            ['The omitted detail', 'Tom2 asks one question that changes an apparently obvious scene.', 'Distinguish observation from inference.'],
            ['Ordinary explanation', 'His mysterious shortcut turns out to come from reading the posted map carefully.', 'Use reason and evidence language.'],
            ['One clue, no biography', 'A weekly clue exchange becomes their bounded ritual.', 'Ask questions without overreaching.'],
            ['Story built from silence', 'The learner assumes why Tom2 held back and speaks as if it were fact.', 'Correct an unsupported inference.'],
            ['You can ask; I can pass', 'Tom2 states that questions are welcome and answers are optional.', 'Use consent and non-answer language.'],
            ['One chosen fact', 'He returns with one ordinary fact that clarifies the task, not his private history.', 'Share bounded context.'],
            ['Warmth without reveal', 'Tom2 helps the learner through action and lets the care stand without explanation.', 'Interpret pragmatic support carefully.'],
            ['The learner passes', 'The learner declines a personal question; Tom2 changes the subject naturally.', 'Practise graceful conversational repair.'],
            ['Known enough to continue', 'Their future scene leaves some mystery intact while making mutual trust unmistakable.', 'Use implication with clear consent state.'],
        ],
    }),
    profile({
        characterId: 'shaun',
        displayName: 'Shaun-san',
        voice: {
            attention: 'The immediate social beat and the register choice needed to join it.',
            sentenceMovement: 'Light, bounded observations that do not imply a hidden biography.',
            socialTactic: 'Joins through one timely contribution rather than a spotlight scene.',
            underPressure: 'Stays so light that others cannot tell whether participation is welcome.',
            softensThrough: 'Naming one present-tense preference without being overauthored.',
        },
        desire: 'To participate on a scale that feels honest rather than narratively inflated.',
        contradiction: 'His bounded presence protects privacy but can be mistaken for absence.',
        recurringBit: 'A late arrival coincides with the structural collapse of a completely fictional pastry.',
        learningRole: {
            specialties: ['register'],
            activityPattern: 'Notice and repair one casual-versus-formal choice inside a shared story beat.',
            learnerBenefit: 'Provides concise register contrast without inventing a lesson specialty or private history.',
        },
        privacy: privacy([
            'Shaun is story-eligible but not lesson-eligible; his voice and biography remain deliberately light.',
            'No specialty, private history, or likeness may be inferred from sparse source evidence.',
        ]),
        bondArc: [
            ['Late, not absent', 'Shaun joins one current task without being asked to explain the arrival.', 'Use arrival acknowledgment.'],
            ['Which register', 'He notices a formal phrase inside a casual exchange and asks what changed.', 'Contrast register in context.'],
            ['Timely contribution', 'One short observation alters the scene without making him a lesson host.', 'Use concise pragmatic comments.'],
            ['Pastry weather', 'A fictional pastry collapse becomes a light recurring callback.', 'Describe states and causes.'],
            ['Too little to read', 'The learner interprets Shaun\'s brevity as disinterest.', 'Challenge mind-reading and confirm participation.'],
            ['No backstory required', 'Shaun declines a biography-shaped question and remains in the activity.', 'Use topic boundaries gracefully.'],
            ['Present-tense preference', 'He names one immediate preference that changes the group plan.', 'State preferences without justification.'],
            ['A role that fits', 'The learner offers a bounded role and accepts Shaun\'s chosen level of involvement.', 'Negotiate participation.'],
            ['Quiet mutual recognition', 'Shaun notices when the learner also wants a smaller role and protects it.', 'Acknowledge another person\'s condition.'],
            ['Still in the scene', 'The future beat shows reliable presence without a forced reveal or lesson ownership.', 'Sustain light continuity respectfully.'],
        ],
    }),
] as const satisfies readonly AcademyCharacterPersonalityBondProfile[]);

const BOND_PROFILE_BY_ID: ReadonlyMap<AcademyBondCharacterId, AcademyCharacterPersonalityBondProfile>
    = new Map(ACADEMY_CHARACTER_BOND_CATALOG.map(entry => [entry.characterId, entry]));

export function getAcademyCharacterBondProfile(characterId: AcademyBondCharacterId): AcademyCharacterPersonalityBondProfile {
    const entry = BOND_PROFILE_BY_ID.get(characterId);
    if (!entry) throw new TypeError(`Unknown Academy bond character id: ${characterId}.`);
    return entry;
}
