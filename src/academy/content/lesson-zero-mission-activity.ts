import type { ActivityEvaluation, ReviewSeed } from '../domain/activity-runtime';
import type { LessonZeroActivity, LessonZeroContent, LessonZeroInputScript } from './lesson-zero';

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
): LessonZeroMissionDefinition {
    const activity = content.lesson.activities.find(candidate => candidate.id === activityId);
    if (!activity || !isLessonZeroMissionActivity(activity.id)) {
        throw new TypeError(`Lesson Zero is missing mission activity ${activityId}.`);
    }
    const script = activity.inputScriptId
        ? content.lesson.inputScripts.find(candidate => candidate.id === activity.inputScriptId)
        : undefined;
    if (activity.inputScriptId && !script) {
        throw new TypeError(`Lesson Zero mission ${activityId} is missing ${activity.inputScriptId}.`);
    }
    const audio = script
        ? content.lesson.audioAssets.find(candidate => candidate.id === script.audioAssetId)
        : undefined;
    return Object.freeze({
        activity: Object.freeze({ ...activity, id: activity.id }),
        ...(script ? { script } : {}),
        ...(audio?.state === 'ready' && audio.runtimeUrl ? { audioUrl: audio.runtimeUrl } : {}),
        learnerName: learnerName.normalize('NFKC').trim() || 'Learner',
    });
}

export function evaluateLessonZeroMission(
    definition: LessonZeroMissionDefinition,
    response: LessonZeroMissionResponse,
    at = Date.now(),
): ActivityEvaluation {
    const { activity } = definition;
    const passed = responsePasses(definition, response);
    const outcome = passed ? 'pass' : 'lapse';
    const score = passed ? 1 : 0;
    const errorTags = passed ? [] : [`lesson-zero:${activity.id.split('-').at(-1)}:repair`];
    return {
        attempt: {
            kind: 'attempt-recorded',
            eventId: `attempt:${activity.id}:${at}`,
            at,
            activityId: activity.id,
            ...(activity.sourceQuestionIds[0] ? { sourceQuestionId: activity.sourceQuestionIds[0] } : {}),
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
        reviewSeeds: passed ? reviewSeeds(activity) : [],
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
            return response.kind === 'written' && nameCardIsUsable(response.text);
        case 'activity:lesson-zero-text-transfer':
            return response.kind === 'written' && textTransferIsUsable(response.text);
        case 'activity:lesson-zero-written-transfer':
            return response.kind === 'written' && writtenIntroductionIsUsable(response.text);
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

function nameCardIsUsable(value: string): boolean {
    const text = normalize(value);
    const beforeDesu = text.split('です')[0]?.replace(/[。.!！?？]/gu, '').trim() ?? '';
    return beforeDesu.length >= 1 && text.includes('です');
}

function textTransferIsUsable(value: string): boolean {
    const text = normalize(value);
    return text.length >= 6 && text.includes('です') && (text.includes('の') || text.includes('も'));
}

function writtenIntroductionIsUsable(value: string): boolean {
    const text = normalize(value);
    return text.length >= 8
        && text.includes('です')
        && (text.includes('はじめまして') || text.includes('よろしくお願いします'));
}

function normalize(value: string): string {
    return value.normalize('NFKC').replace(/\s+/gu, '').trim();
}

function requiredChecks(activity: LessonZeroActivity): readonly string[] {
    return activity.expectedEvidence.rubricIds ?? [];
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
            explanation: { en: 'Keep it short: one joining word and “desu” are enough.', ja: '短い文で大丈夫です。つなぐことば一つと「です」を使いましょう。' },
            repairPrompt: { en: 'Use no (の) or mo (も), then finish with desu (です).', ja: '「の」か「も」を使い、最後を「です。」にしましょう。' },
        };
    }
    if (activityId === 'activity:lesson-zero-written-transfer') {
        return {
            explanation: { en: 'A classmate needs your hello and your name.', ja: 'クラスメイトに、あいさつと名前を残しましょう。' },
            repairPrompt: { en: 'Use hajimemashite, your name + desu, and yoroshiku onegaishimasu.', ja: '「はじめまして」、名前＋「です」、短い結びを使いましょう。' },
        };
    }
    return {
        explanation: { en: 'Keep the turn and try that once more.', ja: 'そのまま、もう一度やってみましょう。' },
        repairPrompt: { en: 'Complete each check after you speak.', ja: '話したあとに、一つずつ確認してください。' },
    };
}

function reviewSeeds(activity: LessonZeroActivity): readonly ReviewSeed[] {
    const seed = seedFor(activity.id as LessonZeroMissionActivityId);
    if (!seed) return [];
    return [{
        id: `review:${activity.id}`,
        conceptId: activity.conceptIds[seed.conceptIndex] ?? activity.conceptIds[0]!,
        reason: 'new-learning',
        ...(activity.sourceQuestionIds[0] ? { sourceQuestionId: activity.sourceQuestionIds[0] } : {}),
        content: {
            expression: seed.expression,
            reading: seed.reading,
            meanings: [seed.meaning],
            sentence: seed.expression,
        },
    }];
}

function seedFor(activityId: LessonZeroMissionActivityId): Readonly<{
    expression: string;
    reading: string;
    meaning: string;
    conceptIndex: number;
}> | null {
    switch (activityId) {
        case 'activity:lesson-zero-text-input':
        case 'activity:lesson-zero-text-transfer':
            return { expression: 'わたしも学生です。', reading: 'わたしもがくせいです', meaning: 'I am a student too.', conceptIndex: 1 };
        case 'activity:lesson-zero-speaking-input':
            return { expression: 'お名前は何ですか。', reading: 'おなまえはなんですか', meaning: 'What is your name?', conceptIndex: 0 };
        case 'activity:lesson-zero-read-name-cards':
        case 'activity:lesson-zero-write-name-card':
            return { expression: 'りえです。', reading: 'りえです', meaning: "I'm Rie.", conceptIndex: 0 };
        case 'activity:lesson-zero-sound-transfer':
            return { expression: 'もう一度お願いします。', reading: 'もういちどおねがいします', meaning: 'One more time, please.', conceptIndex: 1 };
        case 'activity:lesson-zero-speaking-transfer':
            return { expression: 'よろしくお願いします。', reading: 'よろしくおねがいします', meaning: 'Nice to meet you.', conceptIndex: 0 };
        case 'activity:lesson-zero-written-transfer':
            return { expression: 'はじめまして。', reading: 'はじめまして', meaning: 'Nice to meet you.', conceptIndex: 0 };
        case 'activity:lesson-zero-close-room':
            return { expression: 'おわりましょう。', reading: 'おわりましょう', meaning: "Let's finish.", conceptIndex: 0 };
    }
}
