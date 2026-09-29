import type { ActivityEvaluation, ReviewSeed } from '../domain/activity-runtime';
import type { LessonZeroActivity, LessonZeroContent, LessonZeroInputScript } from './lesson-zero';
import { lessonZeroClassNote, lessonZeroIntroduction, lessonZeroNameCard } from './lesson-zero-writing';
import { createKatakanaNameDraft } from './learner-name';

export const LESSON_ZERO_MISSION_ACTIVITY_IDS = [
    'activity:lesson-zero-text-input',
    'activity:lesson-zero-speaking-input',
    'activity:lesson-zero-read-name-cards',
    'activity:lesson-zero-write-name-card',
    'activity:lesson-zero-sound-transfer',
    'activity:lesson-zero-text-transfer',
    'activity:lesson-zero-speaking-transfer',
    'activity:lesson-zero-written-transfer',
    'activity:lesson-zero-close-room',
] as const;

export type LessonZeroMissionActivityId = typeof LESSON_ZERO_MISSION_ACTIVITY_IDS[number];

export type LessonZeroMissionResponse =
    | Readonly<{ kind: 'particle-links'; values: readonly [string, string] }>
    | Readonly<{ kind: 'name-card-evidence'; personId: string; lineId: string }>
    | Readonly<{
        kind: 'written';
        text: string;
        entryMode?: 'ime' | 'katakana-choice' | 'usual-spelling';
    }>
    | Readonly<{ kind: 'spoken'; performed: boolean; checkIds: readonly string[]; recorded: boolean }>
    | Readonly<{ kind: 'room-action'; actionId: string }>;

export interface LessonZeroMissionDefinition {
    readonly activity: LessonZeroActivity & { readonly id: LessonZeroMissionActivityId };
    readonly script?: LessonZeroInputScript;
    readonly audioUrl?: string;
    readonly learnerName: string;
    readonly lockedClassName?: string;
}

export function isLessonZeroMissionActivity(
    activityId: string | undefined,
): activityId is LessonZeroMissionActivityId {
    return Boolean(activityId)
        && LESSON_ZERO_MISSION_ACTIVITY_IDS.includes(activityId as LessonZeroMissionActivityId);
}

export function createLessonZeroMissionDefinition(
    content: LessonZeroContent,
    activityId: LessonZeroMissionActivityId,
    learnerName: string,
    lockedClassName?: string,
): LessonZeroMissionDefinition {
    const activity = content.lesson.activities.find(candidate => candidate.id === activityId);
    if (!activity || !isLessonZeroMissionActivity(activity.id)) {
        throw new TypeError(`Lesson Zero is missing mission activity ${activityId}.`);
    }
    const scriptId = activity.inputScriptId ?? (activityId === 'activity:lesson-zero-read-name-cards'
        ? 'input:lesson-zero-text-hosts' : undefined);
    const script = scriptId
        ? content.lesson.inputScripts.find(candidate => candidate.id === scriptId)
        : undefined;
    if (scriptId && !script) {
        throw new TypeError(`Lesson Zero mission ${activityId} is missing ${scriptId}.`);
    }
    const audio = script
        ? content.lesson.audioAssets.find(candidate => candidate.id === script.audioAssetId)
        : undefined;
    return Object.freeze({
        activity: Object.freeze({ ...activity, id: activity.id }),
        ...(script ? { script } : {}),
        ...(audio?.state === 'ready' && audio.runtimeUrl ? { audioUrl: audio.runtimeUrl } : {}),
        learnerName: learnerName.normalize('NFKC').trim() || 'Learner',
        ...(lockedClassName?.normalize('NFKC').trim()
            ? { lockedClassName: lockedClassName.normalize('NFKC').trim() }
            : {}),
    });
}

export function evaluateLessonZeroMission(
    definition: LessonZeroMissionDefinition,
    response: LessonZeroMissionResponse,
    at = Date.now(),
): ActivityEvaluation | { kind: 'unassessed'; feedback: ActivityEvaluation['result']['feedback'] } {
    const { activity } = definition;
    const passed = responsePasses(definition, response);
    // A bounded pattern checker cannot infer lack of knowledge from writing it
    // does not recognise. Offer support without emitting a scored attempt.
    if (!passed && response.kind === 'written') {
        return { kind: 'unassessed', feedback: repairFeedback(activity.id) };
    }
    const outcome = passed ? 'pass' : 'lapse';
    const score = passed ? 1 : 0;
    const errorTags = passed ? [] : [`lesson-zero:${activity.id.split('-').at(-1)}:repair`];
    return {
        attempt: {
            kind: 'attempt-recorded',
            eventId: `attempt:${activity.id}:${at}`,
            at,
            activityId: activity.id,
            ...(activity.id === 'activity:lesson-zero-sound-transfer'
                ? { sourceQuestionId: 'source-question:classroom-phrase-09' } : {}),
            conceptIds: activity.conceptIds,
            responseKind: responseKind(response),
            outcome,
            score,
            ...(errorTags.length ? { errorTags } : {}),
        },
        result: {
            outcome,
            score,
            errorTags,
            feedback: passed ? passFeedback(activity.id) : repairFeedback(activity.id),
        },
        reviewSeeds: passed ? reviewSeeds(definition) : [],
    };
}

function responsePasses(
    definition: LessonZeroMissionDefinition,
    response: LessonZeroMissionResponse,
): boolean {
    switch (definition.activity.id) {
        case 'activity:lesson-zero-text-input':
            return response.kind === 'particle-links'
                && response.values[0] === 'の'
                && response.values[1] === 'も';
        case 'activity:lesson-zero-read-name-cards':
            return response.kind === 'name-card-evidence'
                && response.personId === 'ruparna'
                && response.lineId === 'line:lesson-zero-text-ruparna';
        case 'activity:lesson-zero-write-name-card':
            return response.kind === 'written' && lessonZeroNameCard(response.text, chosenNames(definition));
        case 'activity:lesson-zero-text-transfer':
            return response.kind === 'written' && lessonZeroClassNote(response.text);
        case 'activity:lesson-zero-written-transfer':
            return response.kind === 'written' && lessonZeroIntroduction(response.text, chosenNames(definition));
        case 'activity:lesson-zero-speaking-input':
        case 'activity:lesson-zero-sound-transfer':
        case 'activity:lesson-zero-speaking-transfer':
            return response.kind === 'spoken'
                && response.performed
                && requiredChecks(definition.activity).every(id => response.checkIds.includes(id));
        case 'activity:lesson-zero-close-room':
            return response.kind === 'room-action'
                && ['finish-or-break', 'more-class', 'another-lesson', 'explore', 'study', 'end-day']
                    .includes(response.actionId);
    }
}

function requiredChecks(activity: LessonZeroActivity): readonly string[] {
    return activity.expectedEvidence.rubricIds ?? [];
}

function chosenNames(definition: LessonZeroMissionDefinition): readonly string[] {
    return [definition.learnerName, definition.lockedClassName,
        createKatakanaNameDraft(definition.learnerName).katakana]
        .filter((name): name is string => Boolean(name));
}

function responseKind(response: LessonZeroMissionResponse): string {
    if (response.kind === 'spoken') return response.recorded ? 'private-recording-self-check' : 'spoken-self-check';
    if (response.kind === 'written') {
        if (response.entryMode === 'katakana-choice') return 'guided-katakana-name-choice';
        if (response.entryMode === 'usual-spelling') return 'saved-name-script-choice';
        return 'learner-ime-production';
    }
    if (response.kind === 'particle-links') return 'tapped-particle-reconstruction';
    if (response.kind === 'name-card-evidence') return 'tapped-source-line';
    return 'embodied-room-choice';
}

function passFeedback(activityId: LessonZeroMissionActivityId) {
    const copy = activityId === 'activity:lesson-zero-close-room'
        ? { en: 'Got it. Let’s go.', ja: 'わかりました。行きましょう。' }
        : { en: 'That’s it. Let’s keep going.', ja: 'できました。続けましょう。' };
    return { explanation: copy };
}

function repairFeedback(activityId: LessonZeroMissionActivityId) {
    if (activityId === 'activity:lesson-zero-text-input') {
        return {
            explanation: { en: 'One gap needs another look.', ja: '空欄をもう一つ確認しましょう。' },
            repairPrompt: { en: 'Use の to join two nouns. Use も for “too”.', ja: '名詞と名詞は「の」でつなぎ、「〜も」は「too」です。' },
        };
    }
    if (activityId === 'activity:lesson-zero-read-name-cards') {
        return {
            explanation: { en: 'That card does not contain the word も.', ja: 'その名札には「も」がありません。' },
            repairPrompt: { en: 'Find the line that says this person studies Japanese too.', ja: '「この人も日本語を勉強しています」と書いてある文を探しましょう。' },
        };
    }
    if (activityId === 'activity:lesson-zero-write-name-card') {
        return {
            explanation: { en: 'Add “desu” after your name.', ja: '名札には、名前のあとに「です」が必要です。' },
            repairPrompt: { en: 'Write your name, then add desu (です).', ja: '「あなたの名前＋です。」にしてみましょう。' },
        };
    }
    if (activityId === 'activity:lesson-zero-text-transfer') {
        return {
            explanation: { en: 'I can check the class patterns, but not every Japanese sentence yet.', ja: 'この練習では、クラスで使った文型だけを確認できます。' },
            repairPrompt: { en: 'Try これはわたしの名札です。 or わたしも日本語を勉強しています。 Use a line that is true for you.', ja: '「これはわたしの名札です。」や「わたしも日本語を勉強しています。」を参考に、自分に合う文を書きましょう。' },
        };
    }
    if (activityId === 'activity:lesson-zero-written-transfer') {
        return {
            explanation: { en: 'Use the name you chose for class, with a greeting or closing.', ja: 'クラスで使う名前に、あいさつか結びを添えましょう。' },
            repairPrompt: { en: 'Write your saved name + です。 Add はじめまして。 before it or よろしくお願いします。 after it. This checks that frame, not every possible introduction.', ja: '保存した名前に「です。」を付け、前に「はじめまして。」か、後ろに「よろしくお願いします。」を添えてください。この文型を確認する練習です。' },
        };
    }
    return {
        explanation: { en: 'Keep the turn and try that once more.', ja: 'そのまま、もう一度やってみましょう。' },
        repairPrompt: { en: 'Complete each check after you speak.', ja: '話したあとに、一つずつ確認してください。' },
    };
}

function reviewSeeds(definition: LessonZeroMissionDefinition): readonly ReviewSeed[] {
    const { activity } = definition;
    const seed = seedFor(definition);
    if (!seed) return [];
    return [{
        // New content must not reuse the scheduling event of the former stock
        // card. Existing learner cards remain untouched.
        id: `review:${activity.id}:task-content-v2`,
        conceptId: activity.conceptIds[seed.conceptIndex] ?? activity.conceptIds[0]!,
        reason: 'new-learning',
        ...(seed.sourceQuestionId ? { sourceQuestionId: seed.sourceQuestionId } : {}),
        content: {
            expression: seed.expression,
            reading: seed.reading,
            meanings: [seed.meaning],
            sentence: seed.expression,
        },
    }];
}

function seedFor(definition: LessonZeroMissionDefinition): Readonly<{
    expression: string;
    reading: string;
    meaning: string;
    conceptIndex: number;
    sourceQuestionId?: string;
}> | null {
    switch (definition.activity.id) {
        case 'activity:lesson-zero-text-input':
        case 'activity:lesson-zero-read-name-cards': {
            const line = definition.script?.lines.find(line => line.id === 'line:lesson-zero-text-ruparna');
            return line ? { expression: line.japanese, reading: line.reading, meaning: line.english,
                conceptIndex: definition.activity.id === 'activity:lesson-zero-text-input' ? 2 : 1 } : null;
        }
        case 'activity:lesson-zero-speaking-input': {
            const line = definition.script?.lines.find(line => line.id === 'line:lesson-zero-speaking-aakash-cue');
            return line ? { expression: line.japanese, reading: line.reading, meaning: line.english, conceptIndex: 0 } : null;
        }
        case 'activity:lesson-zero-sound-transfer':
            return { expression: 'もう一度お願いします。', reading: 'もういちどおねがいします', meaning: 'One more time, please.', conceptIndex: 1, sourceQuestionId: 'source-question:classroom-phrase-09' };
        case 'activity:lesson-zero-speaking-transfer':
            return { expression: 'よろしくお願いします。', reading: 'よろしくおねがいします', meaning: 'Nice to meet you.', conceptIndex: 0 };
        case 'activity:lesson-zero-written-transfer':
        case 'activity:lesson-zero-text-transfer':
        case 'activity:lesson-zero-write-name-card':
        case 'activity:lesson-zero-close-room':
            // Personal writing has no verified translation/reading; a room
            // choice isn't Japanese recall. Neither earns a stock review card.
            return null;
    }
}
