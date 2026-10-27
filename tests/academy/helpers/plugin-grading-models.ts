import type { PhraseKarutaModel } from '../../../src/academy/minigames/phrase-karuta';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT, type ActivityModel } from '../../../src/academy/domain/activity-runtime';
import { ADVANCED_CURRICULUM } from '../../../src/academy/content/advanced-curriculum';
import { ACADEMY_LESSON_CONTENT_REGISTRY, getAuthoredWeekRegistration } from '../../../src/academy/content/lesson-content-registry';
import { loadLessonActivityChapter } from '../../../src/academy/content/lesson-activity-catalog';
import { createLessonL2L35ConsiderateRecommendationBeat } from '../../../src/academy/content/lesson-l2-l35-considerate-recommendation';
import { createLessonZeroVowelSoundMap } from '../../../src/academy/content/lesson-zero-vowel-sound-map';
import { createLessonZeroKanaMasteryModel } from '../../../src/academy/minigames/kana-mastery';
import { N2_EVENT_INFORMATION_PACKAGES } from '../../../src/academy/minigames/n2-event-information/registry';
import type { KanjiWritingModel } from '../../../src/academy/integration/yomu-bridge';
import { validateCommittedAuthoredWeek } from './authored-week-package';

export async function registeredGradingModels(): Promise<readonly ActivityModel[]> {
    const models: ActivityModel[] = [
        ...ADVANCED_CURRICULUM.map(entry => entry.activity),
        ...N2_EVENT_INFORMATION_PACKAGES.map(entry => entry.activity),
        createLessonL2L35ConsiderateRecommendationBeat().activity,
        createLessonZeroVowelSoundMap(), createLessonZeroKanaMasteryModel(), phraseKarutaModel(),
    ];
    for (const registration of ACADEMY_LESSON_CONTENT_REGISTRY) {
        if (registration.kind !== 'authored-week') continue;
        const loaded = ['l1-l09', 'l1-l19', 'l1-l20'].includes(registration.packageId)
            ? await validateCommittedAuthoredWeek(getAuthoredWeekRegistration(registration.packageId)) : undefined;
        const chapter = await loadLessonActivityChapter(registration.packageId, {
            lookup: async character => trace(character),
        }, loaded);
        models.push(...chapter?.beats.map(beat => beat.activity) ?? []);
    }
    return models;
}

function trace(character: string): KanjiWritingModel {
    return { character, svg: '<svg viewBox="0 0 109 109"><path d="M10 50 L99 50"/></svg>',
        strokeCount: 1, strokeShapes: [[{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }]],
        source: { name: 'KanjiVG', url: 'https://kanjivg.tagaini.net/', licence: 'CC BY-SA 3.0', revision: 'grading' } };
}

function phraseKarutaModel(): PhraseKarutaModel {
    return {
        id: 'minigame:lesson-zero-classroom-grab',
        kind: 'phrase-karuta',
        sourceQuestionId: 'source-question:classroom-phrase-09',
        conceptIds: [
            'concept:classroom-repair-repeat',
            'concept:classroom-understanding-check',
            'concept:classroom-understanding-response',
        ],
        responseKind: 'phrase-karuta',
        prompt: {
            en: 'Grab the classroom phrase that fits each moment.',
            ja: '場面に合う教室表現を取りましょう。',
        },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        payload: {
            passScore: 1,
            cards: [
                {
                    id: 'repeat',
                    phrase: 'もう一度お願いします',
                    conceptId: 'concept:classroom-repair-repeat',
                    reviewSeedId: 'review:classroom-repeat',
                    reviewContent: {
                        expression: 'もう一度お願いします',
                        reading: 'もういちどおねがいします',
                        meanings: ['One more time, please.'],
                    },
                },
                {
                    id: 'check',
                    phrase: 'わかりますか',
                    conceptId: 'concept:classroom-understanding-check',
                    reviewSeedId: 'review:classroom-understanding-check',
                    reviewContent: {
                        expression: 'わかりますか',
                        meanings: ['Do you understand?'],
                    },
                },
                {
                    id: 'understand',
                    phrase: 'はい、わかります',
                    conceptId: 'concept:classroom-understanding-response',
                    reviewSeedId: 'review:classroom-understanding-response',
                    reviewContent: {
                        expression: 'はい、わかります',
                        meanings: ['Yes, I understand.'],
                    },
                },
            ],
            rounds: [
                {
                    id: 'missed-instruction',
                    cue: {
                        en: 'You missed the instruction. Ask for it again politely.',
                        ja: '指示を聞き逃しました。丁寧に繰り返しを頼んでください。',
                    },
                    correctCardId: 'repeat',
                    errorTag: 'classroom-repeat-request',
                },
                {
                    id: 'check-partner',
                    cue: {
                        en: 'Check whether your partner understood.',
                        ja: '相手が理解できたか確認してください。',
                    },
                    correctCardId: 'check',
                    errorTag: 'understanding-check-question',
                },
            ],
            feedback: {
                pass: {
                    explanation: {
                        en: 'You matched both classroom moments to useful phrases.',
                        ja: '二つの教室場面に合う表現を選べました。',
                    },
                },
                lapse: {
                    explanation: {
                        en: 'One or more phrases did not match the classroom moment.',
                        ja: '教室場面と合わない表現がありました。',
                    },
                    repairPrompt: {
                        en: 'Contrast asking for repetition with checking understanding.',
                        ja: '繰り返しの依頼と理解の確認を比べましょう。',
                    },
                    nearbyExample: {
                        en: 'A missed instruction needs a request; a partner needs a question.',
                        ja: '聞き逃したときは依頼し、相手には質問します。',
                    },
                },
            },
        },
    };
}

