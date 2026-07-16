import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { StoryReaderModel } from '../minigames/activity-kit';

const CONCEPT_IDS = Object.freeze([
    'reading:menu-clue-sequence',
    'reading:shared-uncertainty',
    'vocabulary:food-menu',
]);

/** The extended-reading scene for the canonical pictureless-menu episode. */
export function createPicturelessMenuReaderActivity(): StoryReaderModel {
    return Object.freeze({
        id: 'activity:l2-l34-pictureless-menu-reader',
        kind: 'academy-story-reader',
        sourceQuestionId: 'story:s1e08-menu-without-pictures',
        conceptIds: CONCEPT_IDS,
        responseKind: 'extended-reading-checkpoint',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        prompt: {
            ja: 'シンさんと写真のないメニューを読み、三つの手がかりを追いましょう。',
            en: 'Read the pictureless menu with Shin and follow its three clues.',
        },
        payload: {
            title: { ja: '写真のないメニュー', en: 'The Menu Without Pictures' },
            sections: [
                {
                    id: 'shared-uncertainty',
                    heading: { ja: '読み方を一緒に探す', en: 'Share the uncertainty' },
                    paragraphs: [
                        'シンさんが、写真のない定食メニューを見つけました。',
                        '「知っているふりをしないで、読み方を一緒に探しましょう」と言いました。',
                    ],
                },
                {
                    id: 'three-clues',
                    heading: { ja: '三つの手がかり', en: 'Three clues' },
                    paragraphs: [
                        '最初の手がかりは読み方、二つ目は数え方、三つ目は好みです。',
                        'みんなが一つずつ手がかりを出すと、注文する料理が分かってきました。',
                    ],
                },
                {
                    id: 'plain-rice',
                    heading: { ja: '一番特別そうな料理', en: 'The most special-looking dish' },
                    paragraphs: [
                        'みんなは一番特別そうな料理を選びましたが、小さい字には「ご飯」と書いてありました。',
                        'シンさんは笑って、「簡単な料理でも、読めたら大きな発見です」と言いました。',
                    ],
                },
            ],
            questions: [
                {
                    id: 'uncertain',
                    prompt: { ja: 'シンさんは、分からない読み方をどうしましたか。', en: 'What did Shin do with an uncertain reading?' },
                    options: [
                        { id: 'shared', label: 'みんなと一緒に探した' },
                        { id: 'hid', label: '分かったふりをした' },
                        { id: 'skipped', label: 'メニューを閉じた' },
                    ],
                    correctOptionId: 'shared',
                    errorTag: 'pictureless-menu-shared-uncertainty',
                },
                {
                    id: 'clues',
                    prompt: { ja: '料理を見つけるために、手がかりをいくつ使いましたか。', en: 'How many clues did the class combine?' },
                    options: [
                        { id: 'one', label: '一つ' },
                        { id: 'two', label: '二つ' },
                        { id: 'three', label: '三つ' },
                    ],
                    correctOptionId: 'three',
                    errorTag: 'pictureless-menu-clue-count',
                },
                {
                    id: 'dish',
                    prompt: { ja: '一番特別そうな料理は、実は何でしたか。', en: 'What was the special-looking dish really?' },
                    options: [
                        { id: 'rice', label: 'ご飯' },
                        { id: 'meat', label: '肉料理' },
                        { id: 'vegetables', label: '野菜料理' },
                    ],
                    correctOptionId: 'rice',
                    errorTag: 'pictureless-menu-final-dish',
                },
            ],
            passScore: 1,
            feedback: {
                pass: {
                    explanation: {
                        ja: '読み方、数え方、好みの手がかりを順番に追えました。',
                        en: 'You followed the reading, counter, and preference clues in order.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '三つの見出しと、最後の「ご飯」をもう一度確認しましょう。',
                        en: 'Recheck the three headings and the final ご飯 reveal.',
                    },
                    repairPrompt: {
                        ja: '「読み方・数え方・好み」の順で手がかりを探してください。',
                        en: 'Find the clues in this order: reading, counter, preference.',
                    },
                    nearbyExample: {
                        ja: '小さい字には「ご飯」と書いてありました。',
                        en: 'The small print said ご飯.',
                    },
                },
            },
            reviewTargets: [{
                id: 'review:l2-l34:pictureless-menu-clues',
                conceptId: 'reading:menu-clue-sequence',
                expression: '読み方・数え方・好み',
                reading: 'よみかた・かぞえかた・このみ',
                meanings: ['reading, counter, and preference clues'],
                sentence: '読み方、数え方、好みの手がかりを順番に追います。',
            }],
        },
    });
}
