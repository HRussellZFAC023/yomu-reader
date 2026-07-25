import type { JlptBand, PlacementSkill } from '../domain/learner-record';
import type { LocalizedText } from '../domain/source-library';
import type { PlacementListeningMode } from '../domain/placement-session';
import { resolvePackagedAcademyListeningLocator } from '../content/listening/listening-crosswalk';
import { ORIENTATION_SOURCE_ITEMS } from './orientation-bank';

export interface PlacementProductionPrompt {
    readonly speaking: Readonly<{ model: LocalizedText; task: LocalizedText }>;
    readonly writing: Readonly<{ model: LocalizedText; task: LocalizedText }>;
}

const PRODUCTION_PROMPTS: Readonly<Record<JlptBand, PlacementProductionPrompt>> = {
    n5: {
        speaking: {
            model: { en: 'Model: わたしは りえ です。', ja: 'お手本：わたしは りえ です。' },
            task: { en: 'Change the name and introduce yourself once.', ja: '名前を変えて、一度自己紹介してください。' },
        },
        writing: {
            model: { en: 'Model: コーヒーが すきです。', ja: 'お手本：コーヒーが すきです。' },
            task: { en: 'Write one thing you like.', ja: '好きなものを一つ書いてください。' },
        },
    },
    n4: {
        speaking: {
            model: { en: 'Model: きのう、友だちと映画を見ました。', ja: 'お手本：きのう、友だちと映画を見ました。' },
            task: { en: 'Say one thing you did yesterday and who you were with.', ja: 'きのうしたことと、だれと一緒だったか話してください。' },
        },
        writing: {
            model: { en: 'Model: 土曜日は雨なので、家で勉強します。', ja: 'お手本：土曜日は雨なので、家で勉強します。' },
            task: { en: 'Write one plan and a short reason.', ja: '予定を一つ、短い理由と一緒に書いてください。' },
        },
    },
    n3: {
        speaking: {
            model: { en: 'Model: 電車のほうが便利ですが、朝は混んでいます。', ja: 'お手本：電車のほうが便利ですが、朝は混んでいます。' },
            task: { en: 'Compare two choices and add one reservation.', ja: '二つの選択肢を比べて、一つ気になる点も話してください。' },
        },
        writing: {
            model: { en: 'Model: 会議の時間を三時に変更していただけますか。', ja: 'お手本：会議の時間を三時に変更していただけますか。' },
            task: { en: 'Write a polite message asking to change a time.', ja: '時間の変更をお願いする丁寧なメッセージを書いてください。' },
        },
    },
    n2: {
        speaking: {
            model: { en: 'Model: 効率は上がる一方で、対話の機会が減るおそれもあります。', ja: 'お手本：効率は上がる一方で、対話の機会が減るおそれもあります。' },
            task: { en: 'Give one benefit and one possible drawback of remote work.', ja: '在宅勤務の利点と、考えられる欠点を一つずつ話してください。' },
        },
        writing: {
            model: { en: 'Model: 資料をご確認のうえ、金曜日までにご返信いただけると助かります。', ja: 'お手本：資料をご確認のうえ、金曜日までにご返信いただけると助かります。' },
            task: { en: 'Write a concise professional request with a deadline.', ja: '期限を入れて、簡潔な仕事の依頼を書いてください。' },
        },
    },
    n1: {
        speaking: {
            model: { en: 'Model: 一概に否定はできないものの、長期的な影響は慎重に見極める必要があります。', ja: 'お手本：一概に否定はできないものの、長期的な影響は慎重に見極める必要があります。' },
            task: { en: 'State a nuanced view on automation without making it absolute.', ja: '自動化について、断定を避けながら考えを述べてください。' },
        },
        writing: {
            model: { en: 'Model: ご提案の趣旨には賛同しますが、実施時期については再検討の余地があると考えます。', ja: 'お手本：ご提案の趣旨には賛同しますが、実施時期については再検討の余地があると考えます。' },
            task: { en: 'Write a tactful two-part response: partial agreement, then a concern.', ja: '一部賛成したあと懸念を述べる、配慮のある返答を書いてください。' },
        },
    },
};

export function placementProductionPrompt(band: JlptBand): PlacementProductionPrompt {
    return PRODUCTION_PROMPTS[band];
}

export type ReceptivePlacementSkill = Exclude<PlacementSkill, 'speaking-confidence' | 'writing-confidence'>;
export type PlacementRecommendation = JlptBand | 'lesson-zero';

export interface PlacementItemProvenance {
    readonly sourceScope: 'soya-research';
    readonly sourceItemId: string;
    readonly sourceFile: string;
    readonly sourceFileSha256: string;
    readonly contentFidelity: 'exact';
    readonly choiceOrder: 'source' | 'deterministic-derived';
    readonly answerGate: 'after-attempt';
    readonly corpusRightsState: 'item-review-required';
    readonly useAuthorization: 'user-permitted';
}

export interface PlacementAudioProvenance {
    readonly sourceAvailability: 'recorded-source' | 'source-text-only';
    readonly runtimeDelivery: 'packaged-source-recording' | 'browser-speech-synthesis';
    readonly transcriptFidelity: 'exact-utterance-text';
    /** Completed listening-crosswalk identity; never derive this from a remote source path. */
    readonly deliveryLocator?: string;
    readonly sourcePath?: string;
    readonly remoteUrl?: string;
    readonly sha256?: string;
}

export type PlacementAudioDelivery =
    | Readonly<{ kind: 'source-recording'; url: string; sha256: string }>
    | Readonly<{ kind: 'browser-speech'; text: string }>;

export interface PlacementOption {
    readonly id: string;
    readonly label: LocalizedText;
    readonly correct: boolean;
}

export interface PlacementItem {
    readonly id: string;
    readonly band: JlptBand;
    readonly skill: Exclude<PlacementSkill, 'speaking-confidence' | 'writing-confidence'>;
    readonly prompt: LocalizedText;
    readonly passage?: LocalizedText;
    readonly spokenJapanese?: string;
    readonly audio?: PlacementAudioProvenance;
    readonly referenceId: string;
    readonly provenance: PlacementItemProvenance;
    readonly options: readonly PlacementOption[];
}

export interface PlacementSkillRecommendation {
    readonly skill: ReceptivePlacementSkill;
    readonly attempted: number;
    readonly correct: number;
    readonly available: number;
    readonly score: number;
    readonly recommendedStart: PlacementRecommendation;
}

export const ORIENTATION_MOCK_POLICY = Object.freeze({
    optional: true,
    entryChoices: ['lesson-zero', 'n5', 'n4', 'n3', 'n2', 'n1'] as const,
    sections: ['language-knowledge', 'reading', 'listening'] as const,
    caveats: [
        'This compact orientation is a heuristic, not an official JLPT score or pass prediction.',
        'Speaking and writing use short production attempts followed by learner self-checks; they are not examiner-graded scores.',
        'Each receptive recommendation is based on a small sample and should be treated as a starting suggestion.',
        'A listening item only counts after audio playback; an accessible transcript alternative remains usable but is excluded from listening evidence.',
    ] as const,
    storyProgression: 'preserve' as const,
    canSkipStory: false,
    revisit: 'always-available' as const,
});

export type PlacementEntryChoice =
    | { readonly kind: 'lesson-zero' }
    | { readonly kind: 'mock'; readonly targetBand: JlptBand };

export function placementEntryChoice(value: PlacementRecommendation): PlacementEntryChoice {
    return value === 'lesson-zero' ? { kind: 'lesson-zero' } : { kind: 'mock', targetBand: value };
}

export interface OrientationMockResult {
    readonly assessmentId: 'academy-orientation-mock:v1' | 'academy-orientation-mock:v2';
    readonly targetBand: JlptBand;
    readonly itemIds: readonly string[];
    readonly scores: Readonly<Record<PlacementSkill, number>>;
    /** Kept for compatibility with v1 evidence and band-only projections. */
    readonly recommendedBand: JlptBand;
    readonly recommendedStart: PlacementRecommendation;
    readonly calibration: 'vertical-slice';
    /** Optional so persisted v1/v2 events can still be reconstructed by existing routing. */
    readonly skillRecommendations?: Readonly<Record<ReceptivePlacementSkill, PlacementSkillRecommendation>>;
    readonly storyProgression?: 'preserve';
    readonly mockRevisit?: 'always-available';
    readonly caveats?: readonly string[];
}

export const ORIENTATION_MOCK_ITEMS: readonly PlacementItem[] = ORIENTATION_SOURCE_ITEMS;

validateOrientationMockItems(ORIENTATION_MOCK_ITEMS);

export function orientationItemsForBand(band: JlptBand): readonly PlacementItem[] {
    return ORIENTATION_MOCK_ITEMS.filter(item => item.band === band);
}

/** Uses only the completed listening registry; an authored recording never silently falls back to speech. */
export function placementAudioDelivery(item: PlacementItem): PlacementAudioDelivery | undefined {
    if (!item.spokenJapanese || !item.audio) return undefined;
    if (item.audio.runtimeDelivery === 'browser-speech-synthesis') {
        return { kind: 'browser-speech', text: item.spokenJapanese };
    }
    const locator = item.audio.deliveryLocator;
    const expectedSha256 = item.audio.sha256;
    if (!locator || !expectedSha256) {
        throw new TypeError(`Placement recording ${item.id} is missing its exact delivery identity.`);
    }
    const resolution = resolvePackagedAcademyListeningLocator(locator);
    if (resolution.status !== 'ready' || resolution.entry.source.sha256 !== expectedSha256) {
        throw new TypeError(`Placement recording ${item.id} does not match the listening crosswalk.`);
    }
    return { kind: 'source-recording', url: resolution.url, sha256: expectedSha256 };
}

/**
 * Keeps the compact mock bank structurally honest before any choice reaches
 * the learner. This deliberately checks labels as well as ids: repeated
 * labels make a multiple-choice item ambiguous even when its ids differ.
 */
export function validateOrientationMockItems(items: readonly PlacementItem[]): void {
    const itemIds = new Set<string>();
    const referenceIds = new Set<string>();
    for (const item of items) {
        if (itemIds.has(item.id)) throw new TypeError(`Duplicate placement item id: ${item.id}`);
        if (referenceIds.has(item.referenceId)) throw new TypeError(`Duplicate placement source item: ${item.referenceId}`);
        itemIds.add(item.id);
        referenceIds.add(item.referenceId);

        const optionIds = new Set<string>();
        const labels = {
            en: new Set<string>(),
            ja: new Set<string>(),
        };
        for (const option of item.options) {
            if (optionIds.has(option.id)) throw new TypeError(`Duplicate option id in ${item.id}: ${option.id}`);
            for (const language of ['en', 'ja'] as const) {
                const label = option.label[language].trim();
                if (!label || labels[language].has(label)) {
                    throw new TypeError(`Duplicate or empty option (${language}) in ${item.id}: ${label}`);
                }
                labels[language].add(label);
            }
            optionIds.add(option.id);
        }
        if (item.options.length < 3) throw new TypeError(`Placement item needs at least three options: ${item.id}`);
        if (item.options.filter(option => option.correct).length !== 1) {
            throw new TypeError(`Placement item needs exactly one correct option: ${item.id}`);
        }
        if (item.audio?.runtimeDelivery === 'packaged-source-recording') placementAudioDelivery(item);
    }

    for (const band of ['n5', 'n4', 'n3', 'n2', 'n1'] as const) {
        for (const skill of ORIENTATION_MOCK_POLICY.sections) {
            const count = items.filter(item => item.band === band && item.skill === skill).length;
            if (count !== 2) throw new TypeError(`Placement bank needs two ${skill} items for ${band}; found ${count}`);
        }
    }
}

export function scoreOrientationMock(
    targetBand: JlptBand,
    responses: Readonly<Record<string, string>>,
    confidence: Readonly<{ speaking: number; writing: number }>,
    listeningModes: Readonly<Record<string, PlacementListeningMode>> = {},
): OrientationMockResult {
    const assessmentItems = orientationItemsForBand(targetBand);
    const scoreFor = (skill: PlacementItem['skill']): number => {
        const items = assessmentItems.filter(item => item.skill === skill);
        const correct = items.filter(item => (
            (item.skill !== 'listening' || listeningModes[item.id] !== 'transcript-alternative')
            && item.options.some(option => option.id === responses[item.id] && option.correct)
        )).length;
        return items.length ? correct / items.length : 0;
    };
    const scores = {
        'language-knowledge': scoreFor('language-knowledge'),
        reading: scoreFor('reading'),
        listening: scoreFor('listening'),
        'speaking-confidence': clamp(confidence.speaking),
        'writing-confidence': clamp(confidence.writing),
    } satisfies Record<PlacementSkill, number>;
    const recommendationFor = (skill: ReceptivePlacementSkill): PlacementSkillRecommendation => {
        const items = assessmentItems.filter(item => item.skill === skill);
        const selections = items.map(item => item.skill === 'listening' && listeningModes[item.id] === 'transcript-alternative'
            ? undefined
            : item.options.find(option => option.id === responses[item.id]));
        const attempted = selections.filter(Boolean).length;
        const correct = selections.filter(option => option?.correct).length;
        const score = items.length ? correct / items.length : 0;
        const recommendedStart = attempted === 0
            ? 'lesson-zero'
            : lowerRecommendation(targetBand, score === 1 ? 0 : score >= 0.5 ? 1 : 2);
        return { skill, attempted, correct, available: items.length, score, recommendedStart };
    };
    const skillRecommendations: Record<ReceptivePlacementSkill, PlacementSkillRecommendation> = {
        'language-knowledge': recommendationFor('language-knowledge'),
        reading: recommendationFor('reading'),
        listening: recommendationFor('listening'),
    };
    const recommendedStart = lowestRecommendation(Object.values(skillRecommendations).map(entry => entry.recommendedStart));
    return {
        assessmentId: 'academy-orientation-mock:v2',
        targetBand,
        itemIds: assessmentItems.map(item => item.id),
        scores,
        recommendedBand: recommendedStart === 'lesson-zero' ? 'n5' : recommendedStart,
        recommendedStart,
        calibration: 'vertical-slice',
        skillRecommendations,
        storyProgression: ORIENTATION_MOCK_POLICY.storyProgression,
        mockRevisit: ORIENTATION_MOCK_POLICY.revisit,
        caveats: ORIENTATION_MOCK_POLICY.caveats,
    };
}

function lowerRecommendation(target: JlptBand, steps: number): PlacementRecommendation {
    const bands: readonly JlptBand[] = ['n5', 'n4', 'n3', 'n2', 'n1'];
    const index = bands.indexOf(target) - steps;
    return index < 0 ? 'lesson-zero' : bands[index]!;
}

function lowestRecommendation(recommendations: readonly PlacementRecommendation[]): PlacementRecommendation {
    const order: readonly PlacementRecommendation[] = ['lesson-zero', 'n5', 'n4', 'n3', 'n2', 'n1'];
    return recommendations.reduce((lowest, value) => (
        order.indexOf(value) < order.indexOf(lowest) ? value : lowest
    ), 'n1');
}

function clamp(value: number): number {
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
