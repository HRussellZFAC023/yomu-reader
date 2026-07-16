import lessonPackage from '../../../public/academy/content/lessons/060-l2-l33.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { LocalizedText } from '../domain/source-library';
import type {
    StateInspectionInteraction,
    StateInspectionModel,
    StateInspectionOption,
    StateInspectionRound,
    StateInspectionSourceVisual,
} from '../minigames/state-inspection';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l2-l33';
const PACKAGE_ORDER = 60;
const MODULE_ID = 8121301;
const ARCHIVE_ID = 'archive-000042';
const ARCHIVE_SHA256 = '8c1e974b36b4546301ea6d4b90ec8a12d7ac618a37a18b0c3765ff3c248821c3';
const HOMEWORK_SHA256 = 'bf9737e27d9ffc740f8bc597538968157f5b87c63207e28a2c55b6dae9ad66ce';
const QUARANTINED_AUDIO_SHA256 = Object.freeze([
    '06f3dfb38532d500d7703639865192e443b98e8ecf48da616b4010a04b8aa6b0',
    'c8bd1dd230f2897ba0bb4cc39cd8ba901a405841d1f2ba43d3f93ea79607232c',
    'cbaf9340bbfa4f699248863b1becbe243ba89f0da12edc37317190b43c78bc74',
]);

const SOURCE_VISUALS: StateInspectionModel['provenance']['moodle']['sourceSheets'] = Object.freeze([
    visual(1, 'moodle-hw-chapter-35-grammar-review-page-1.png',
        '8e4905077b0b7ade5793ad1c6e942d7a33f10d16e242592e4b7cb62f851f68b9', {
            ja: 'Moodle 原本: HW Chapter 35 grammar review の1ページ目。条件形、町の紹介、Track 30、文脈完成を含みます。',
            en: 'Moodle original: HW Chapter 35 grammar review, page 1, including conditionals, town recommendations, Track 30, and contextual completion.',
        }),
    visual(2, 'moodle-hw-chapter-35-grammar-review-page-2.png',
        '0ca76763c1bafb638aabe1d35b26b25f7af1f4417d8f125e780df779ba5092c5', {
            ja: 'Moodle 原本: HW Chapter 35 grammar review の2ページ目。疑問詞＋条件形と、ならの提案を含みます。',
            en: 'Moodle original: HW Chapter 35 grammar review, page 2, including interrogative conditionals and suggestions with なら.',
        }),
]);

export function createLessonL2L33Chapter35HomeworkReviewBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('clothes-model', 1, 1, 1, 1, 'action-choice', 'task-1:clothes-model',
            'あなたは どんな服なら、買いますか。', 'サイズが ちょうど よくて、安ければ、買います。', [
                option('サイズが ちょうど よくて、安ければ、買います。'),
                option('サイズが ちょうど よくて、安いなら、買います。'),
            ], hints(
                ['先生の1番の「れい）」を見ます。', 'サイズの条件の後に、値段の条件が続きます。', '印刷例は「安ければ」を使います。'],
                ['Find Sensei’s れい） under task 1.', 'The size condition is followed by the price condition.', 'The printed model uses 安ければ.'],
            )),
        round('cheap-conditional', 2, 1, 1, 2, 'state-select', 'task-1:cheap-conditional',
            '安い →', '安ければ', [option('安ければ'), option('安いなら')], hints(
                ['同じ服の印刷例に戻ります。', 'い形容詞の最後の「い」を変えます。', '原文に見える形は「安ければ」です。'],
                ['Return to the same printed clothes model.', 'Change the final い of the i-adjective.', 'The form visible in the source is 安ければ.'],
            )),
        round('bookshop-recommendation', 3, 1, 2, 1, 'typed-report', 'task-2:bookshop-recommendation',
            '本屋なら、', '本屋なら、山川ブックがいいです。', [], hints(
                ['先生の町紹介の吹き出しを見ます。', 'すすめる店は「山川ブック」です。', '印刷例の結びは「がいいです。」です。'],
                ['Find the town-recommendation speech bubble.', 'The recommended shop is 山川ブック.', 'The printed ending is がいいです。'],
            )),
        round('bookshop-reason', 4, 1, 2, 2, 'action-choice', 'task-2:bookshop-reason',
            '本も多いし、', '本も多いし、店の人も親切ですから。', [
                option('本も多いし、店の人も親切ですから。'),
                option('本も多いし、店の人も有名ですから。'),
            ], hints(
                ['吹き出しの二行目を見ます。', '二つ目の理由は店の人についてです。', '原文は「店の人も親切ですから。」です。'],
                ['Read the second line of the speech bubble.', 'The second reason describes the people in the shop.', 'The source says 店の人も親切ですから。'],
            )),
        round('watch-repair-model', 5, 1, 4, 1, 'state-select', 'task-4:watch-repair-model',
            'この時計は（　　　）、まだ使えます。', 'この時計は（修理すれば）、まだ使えます。', [
                option('この時計は（修理すれば）、まだ使えます。'),
                option('この時計は（修理なら）、まだ使えます。'),
            ], hints(
                ['先生の4番の「例」を見ます。', '時計にする動作は「修理する」です。', '印刷された条件形は「修理すれば」です。'],
                ['Find the 例 under task 4.', 'The action done to the watch is 修理する.', 'The printed conditional is 修理すれば.'],
            )),
        round('watt-sensei-question', 6, 2, 'homework', 2, 'typed-report', 'task-4-page-2:watt-sensei-question',
            'ワット先生に 会いたいんですが、（　　　）ごろ 来れば いいですか。',
            'ワット先生に 会いたいんですが、（何時）ごろ 来れば いいですか。', [], hints(
                ['2ページ目の4番の例を見ます。', '答えは「5時ごろ」です。何を尋ねていますか。', '括弧の疑問詞は「何時」です。'],
                ['Find the task 4 model on page 2.', 'The reply is 5時ごろ. What is being asked?', 'The interrogative in brackets is 何時.'],
            )),
        round('sushi-shop-model', 7, 2, 5, 1, 'action-choice', 'task-5:sushi-shop-model',
            'おいしい すし屋を 探して いるんですが。', '（すし屋）なら、「大黒ずし」が いいですよ。[a]よ。', [
                option('（すし屋）なら、「大黒ずし」が いいですよ。[a]よ。'),
                option('（料理教室）なら、「毎日クッキング」が いいですよ。[a]よ。'),
            ], hints(
                ['先生の5番の「例」を見ます。', '括弧には探している店の種類が入ります。', '印刷例の店名は「大黒ずし」です。'],
                ['Find Sensei’s task 5 model.', 'The brackets contain the kind of shop being sought.', 'The printed shop name is 大黒ずし.'],
            )),
        round('reason-a', 8, 2, 5, 2, 'typed-report', 'task-5:reason-a',
            '[a]', 'あまり 高くないです', [], hints(
                ['5番の理由の箱を見ます。', '例は理由記号 [a] を選んでいます。', 'a の印刷文は「あまり 高くないです」です。'],
                ['Look at the reason box in task 5.', 'The model selects reason [a].', 'The printed text for a is あまり 高くないです.'],
            )),
    ] as const;

    const activity: StateInspectionModel = {
        id: 'activity:l2-l33-sensei-chapter-35-homework-review',
        kind: 'academy-state-inspection',
        responseKind: 'moodle-chapter-35-nara-guidance-workshop',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(round => round.conceptId),
        prompt: {
            ja: '先生の Chapter 35 宿題原本を二ページとも先に学び、印刷された例と理由の対応を八つ復元してください。',
            en: 'Study both pages of Sensei’s Chapter 35 homework first, then restore eight printed models and visible reason mappings.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                archiveId: ARCHIVE_ID,
                sourceSheets: SOURCE_VISUALS,
                media: {
                    status: 'three-audio-members-quarantined-unresolved-pairing',
                    sourceAudioMembers: 3,
                    sourceAudioTracksDelivered: 0,
                },
                answerKeyBasis: 'sensei-verbatim-adjective-noun-and-nara-examples-with-no-source-answer-key-claim',
            },
            support: {
                minna: { reference: 'Minna no Nihongo II · Lessons 35–36', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: '≈ Genki II · parallel N4 scope', reuse: 'sequence-only' },
            },
        },
        payload: {
            teaching: [
                { title: 'い-adjective condition', text: 'In Sensei’s clothes model, 安い changes to 安ければ before the result 買います.' },
                { title: 'Noun + なら recommendation', text: 'Sensei’s town and sushi models put the topic before なら, then give a relevant recommendation.' },
                { title: 'Reasons with し and から', text: 'The bookshop model links one reason with し and closes the explanation with から.' },
                { title: 'Interrogative + conditional + いい', text: 'Sensei’s page 2 model asks 何時ごろ来ればいいですか and then supplies a suitable time.' },
                { title: 'Printed-model boundary', text: 'Only visible models and the printed [a] mapping are assessed. Open homework blanks remain open, and no separate Moodle answer key is claimed.' },
                { title: 'Audio quarantine', text: 'Track 30 and the other two archive audio members are not playable because exact task pairing, transcript, duration, rights, and answers remain unresolved.' },
            ],
            taskHeadings: [
                { sourceTask: 1, text: '1: You can use the words given or write freely about yourself and create sentences.' },
                { sourceTask: 2, text: '2: Please write your about your town. recommendation and the reason why you recommend.' },
                { sourceTask: 4, text: '4: Please complete sentences according to the contexts.' },
                { sourceTask: 'homework', text: '4: Read the conversation and create question using interrogatives and conditional form.' },
                { sourceTask: 5, text: '5: Put appropriate words in the brackets and choose the reason from the box.' },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: {
                    ja: '宿題原本の印刷例と、なら・ければ・理由の対応を八つ復元できました。',
                    en: 'You restored eight printed homework models and their visible なら, ければ, and reason mappings.',
                } },
                lapse: {
                    explanation: {
                        ja: '間違えた印刷例だけ、原本の該当ページと行をもう一度確認しましょう。',
                        en: 'For only the missed printed models, recheck the corresponding source page and row.',
                    },
                    repairPrompt: {
                        ja: '間違えた行だけを直し、必要ならヒントを一つずつ開きましょう。',
                        en: 'Repair only the missed rows, opening one earned hint at a time if needed.',
                    },
                    nearbyExample: {
                        ja: '先生の印刷例: 安ければ／本屋なら／何時ごろ来ればいいですか',
                        en: 'Sensei’s printed models: 安ければ; 本屋なら; 何時ごろ来ればいいですか.',
                    },
                },
            },
        },
    };

    return Object.freeze({
        id: 'chapter-35-homework-review',
        narrative: {
            ja: 'クリスチャンが先生の Chapter 35 宿題を二ページとも開き、ピーターが印刷例を条件、提案、理由、質問に分けます。音声問題は隔離したまま、見える例だけを戻します。',
            en: 'Christian opens both pages of Sensei’s Chapter 35 homework while Peter sorts the printed models into conditions, suggestions, reasons, and questions. The audio task stays quarantined while the class restores only visible examples.',
        },
        activity: Object.freeze(activity),
    });
}

function round(
    id: string,
    sourceOrder: StateInspectionRound['sourceOrder'],
    sourcePage: StateInspectionRound['sourcePage'],
    sourceTask: StateInspectionRound['sourceTask'],
    sourceItem: StateInspectionRound['sourceItem'],
    interaction: StateInspectionInteraction,
    locus: string,
    sourcePrompt: string,
    answerExpression: string,
    options: readonly StateInspectionOption[],
    roundHints: StateInspectionRound['hints'],
): StateInspectionRound {
    return Object.freeze({
        id, interaction, sourceOrder, sourcePage, sourceTask, sourceItem,
        sourceQuestionId: `moodle:${MODULE_ID}:${HOMEWORK_SHA256}:pdf-p${sourcePage}:${locus}`,
        sourcePrompt, options, answerValue: answerExpression, answerExpression,
        acceptedAnswers: [answerExpression],
        conceptId: `concept:l2-l33:chapter-35-homework:${sourceOrder}`,
        errorTag: `l2-l33-chapter-35-homework-${sourceOrder}`,
        hints: roundHints,
    });
}

function option(value: string): StateInspectionOption {
    return Object.freeze({ value, label: Object.freeze({ ja: value, en: value }) });
}

function hints(ja: readonly string[], en: readonly string[]): StateInspectionRound['hints'] {
    if (ja.length !== 3 || en.length !== 3) throw new TypeError('l2-l33 rounds require exactly three bilingual hints.');
    return [
        Object.freeze({ ja: ja[0]!, en: en[0]! }),
        Object.freeze({ ja: ja[1]!, en: en[1]! }),
        Object.freeze({ ja: ja[2]!, en: en[2]! }),
    ];
}

function visual(
    page: StateInspectionSourceVisual['page'],
    filename: string,
    sha256: string,
    alt: LocalizedText,
): StateInspectionSourceVisual {
    return Object.freeze({
        sourceId: `moodle:${HOMEWORK_SHA256}:page:${page}`,
        payloadSha256: HOMEWORK_SHA256,
        title: 'HW Chapter 35 grammar review',
        page,
        url: `/academy/content/lessons/l2-l33/${filename}`,
        sha256,
        alt: Object.freeze(alt),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l33 package');
    const identity = record(root.identity, 'l2-l33 identity');
    const coverage = record(root.sourceCoverage, 'l2-l33 coverage');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID
        || coverage.archiveModuleId !== MODULE_ID || coverage.archiveId !== ARCHIVE_ID
        || coverage.archiveSha256 !== ARCHIVE_SHA256) {
        throw new TypeError('Unexpected l2-l33 package identity or source archive.');
    }
    const members = array(coverage.members, 'l2-l33 members').map(value => record(value, 'l2-l33 member'));
    if (!members.some(member => member.payloadSha256 === HOMEWORK_SHA256
        && member.kind === 'document' && member.title === 'HW Chapter 35 grammar review')) {
        throw new TypeError(`Missing exact l2-l33 Moodle homework document ${HOMEWORK_SHA256}.`);
    }
    const audioMembers = members.filter(member => member.kind === 'audio');
    if (audioMembers.length !== 3 || QUARANTINED_AUDIO_SHA256.some(payloadSha256 =>
        !audioMembers.some(member => member.payloadSha256 === payloadSha256))) {
        throw new TypeError('l2-l33 requires all three exact audio members to remain recorded and quarantined.');
    }
    const mapping = record(root.mapping, 'l2-l33 mapping');
    if (mapping.minna !== 'Minna no Nihongo II · Lessons 35–36'
        || mapping.genki !== '≈ Genki II · parallel N4 scope') {
        throw new TypeError('l2-l33 must preserve its sequence-only Minna and Genki mappings.');
    }
}

function record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`Expected ${label}.`);
    return value as Record<string, unknown>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`Expected ${label}.`);
    return value;
}
