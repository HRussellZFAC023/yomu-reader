import type { JlptBand, PlacementSkill } from '../domain/learner-record';
import type { LocalizedText } from '../domain/source-library';

export interface PlacementOption {
    readonly id: string;
    readonly label: LocalizedText;
    readonly correct: boolean;
}

export interface PlacementItem {
    readonly id: string;
    readonly skill: Exclude<PlacementSkill, 'speaking-confidence' | 'writing-confidence'>;
    readonly prompt: LocalizedText;
    readonly passage?: LocalizedText;
    readonly spokenJapanese?: string;
    readonly options: readonly PlacementOption[];
}

export interface OrientationMockResult {
    readonly assessmentId: 'academy-orientation-mock:v1';
    readonly targetBand: JlptBand;
    readonly itemIds: readonly string[];
    readonly scores: Readonly<Record<PlacementSkill, number>>;
    readonly recommendedBand: JlptBand;
    readonly calibration: 'vertical-slice';
}

export const ORIENTATION_MOCK_ITEMS: readonly PlacementItem[] = [
    {
        id: 'orientation:knowledge:reason',
        skill: 'language-knowledge',
        prompt: {
            en: 'Choose the form that naturally completes the sentence: 昨日は雨＿＿、出かけませんでした。',
            ja: '自然な文になる形を選んでください：昨日は雨＿＿、出かけませんでした。',
        },
        options: [
            { id: 'because', label: { en: 'だったので', ja: 'だったので' }, correct: true },
            { id: 'although', label: { en: 'なのに', ja: 'なのに' }, correct: false },
            { id: 'while', label: { en: 'ながら', ja: 'ながら' }, correct: false },
        ],
    },
    {
        id: 'orientation:reading:change',
        skill: 'reading',
        passage: {
            en: 'The meeting was going to begin at six, but Alex’s train stopped, so everyone changed it to half past six.',
            ja: '会議は六時に始まる予定でしたが、アレックスさんの電車が止まったので、みんなで六時半に変えました。',
        },
        prompt: { en: 'When will the meeting begin?', ja: '会議は何時に始まりますか。' },
        options: [
            { id: 'six', label: { en: '6:00', ja: '六時' }, correct: false },
            { id: 'six-thirty', label: { en: '6:30', ja: '六時半' }, correct: true },
            { id: 'cancelled', label: { en: 'It was cancelled', ja: '中止になりました' }, correct: false },
        ],
    },
    {
        id: 'orientation:listening:library',
        skill: 'listening',
        spokenJapanese: '図書館は七時に閉まります。六時五十分までに本を返してください。',
        prompt: { en: 'Listen: when does the library close?', ja: '聞いてください：図書館は何時に閉まりますか。' },
        options: [
            { id: 'six-fifty', label: { en: '6:50', ja: '六時五十分' }, correct: false },
            { id: 'seven', label: { en: '7:00', ja: '七時' }, correct: true },
            { id: 'seven-ten', label: { en: '7:10', ja: '七時十分' }, correct: false },
        ],
    },
];

export function scoreOrientationMock(
    targetBand: JlptBand,
    responses: Readonly<Record<string, string>>,
    confidence: Readonly<{ speaking: number; writing: number }>,
): OrientationMockResult {
    const scoreFor = (skill: PlacementItem['skill']): number => {
        const items = ORIENTATION_MOCK_ITEMS.filter(item => item.skill === skill);
        const correct = items.filter(item => item.options.some(option => option.id === responses[item.id] && option.correct)).length;
        return items.length ? correct / items.length : 0;
    };
    const scores = {
        'language-knowledge': scoreFor('language-knowledge'),
        reading: scoreFor('reading'),
        listening: scoreFor('listening'),
        'speaking-confidence': clamp(confidence.speaking),
        'writing-confidence': clamp(confidence.writing),
    } satisfies Record<PlacementSkill, number>;
    const receptive = (scores['language-knowledge'] + scores.reading + scores.listening) / 3;
    const retreat = receptive >= 2 / 3 ? 0 : receptive >= 1 / 3 ? 1 : 2;
    return {
        assessmentId: 'academy-orientation-mock:v1',
        targetBand,
        itemIds: ORIENTATION_MOCK_ITEMS.map(item => item.id),
        scores,
        recommendedBand: lowerBand(targetBand, retreat),
        calibration: 'vertical-slice',
    };
}

function lowerBand(target: JlptBand, steps: number): JlptBand {
    const bands: readonly JlptBand[] = ['n5', 'n4', 'n3', 'n2', 'n1'];
    return bands[Math.max(0, bands.indexOf(target) - steps)];
}

function clamp(value: number): number {
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
