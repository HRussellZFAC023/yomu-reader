import lessonPackage from '../../../public/academy/content/lessons/040-l2-l13.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { LocalizedText } from '../domain/source-library';
import type {
    ReasonChainInteraction,
    ReasonChainOption,
    ReasonChainSourceVisual,
    ReasonChainModel,
    ReasonChainRound,
} from '../minigames/reason-chain';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l2-l13';
const PACKAGE_ORDER = 40;
const MODULE_ID = 8121266;
const ARCHIVE_ID = 'archive-000092';
const SOURCE_PAYLOAD_SHA256 = 'f04f3f4e3e7fa483f5fa8f5fedc5a33c3d3be2b48eaa028de084b7c137362125';
const SOURCE_TITLE = 'Handouts/Chapter 28-2 〜し、〜し_adding similar information_giving reasons with result.pdf';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${SOURCE_PAYLOAD_SHA256}`;

const SOURCE_VISUALS: readonly [ReasonChainSourceVisual, ReasonChainSourceVisual] = Object.freeze([
    sourceVisual(1, '4327dd0ab969ee7b0cb96673ae4d3d3cc497d76da2e4461bec2883e07b991f5d', {
        ja: 'Moodle 原本: Chapter 28-2「し」1ページ。基本文、説明、四つの例、ポイント、課題1の四問。',
        en: 'Moodle original: Chapter 28-2 shi page 1, with Sensei\'s pattern, explanation, four examples, note, and all four task 1 prompts.',
    }),
    sourceVisual(2, '5295e4d4ec26ab038abd880747cb0f46daba60cda3c0cc8ac1ce25fd62b95cc2', {
        ja: 'Moodle 原本: Chapter 28-2「し」2ページ。理由と結論の説明、例、課題2の四問。',
        en: 'Moodle original: Chapter 28-2 shi page 2, with reasons-and-result teaching, examples, and all four task 2 prompts.',
    }),
]);

export function createLessonThirtyEightShiReasonChainBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('hokkaido', 1, 1, 'plain-form-select',
            '1）北海道は 涼しいです・景色が きれいです・食べ物が おいしいです →',
            '北海道は 涼しいし、景色も きれいだし、食べ物も おいしいです。', [
                option('北海道は 涼しいし、景色も きれいだし、食べ物も おいしいです。', '涼しいし、きれいだし、おいしいです', '涼しいし、きれいだし、おいしいです'),
                option('北海道は 涼しいだし、景色も きれいし、食べ物も おいしいだし。', '涼しいだし、きれいし、おいしいだし', '涼しいだし、きれいし、おいしいだし'),
            ], [
                hint('三つの述語を普通形にして、それぞれを「し」でつなぎます。', 'Put the three predicates in plain form and connect them with shi.'),
                hint('い形容詞「涼しい」「おいしい」には「だ」を足しません。', 'Do not add da to the i-adjectives 涼しい and おいしい.'),
                hint('な形容詞「きれい」は「きれいだし」になります。', 'The na-adjective きれい becomes きれいだし.'),
            ]),
        round('salon', 1, 2, 'plain-form-select',
            '2）あの 美容院は 上手です・速いです・安いです →',
            'あの 美容院は 上手だし、速いし、安いです。', [
                option('あの 美容院は 上手だし、速いし、安いです。', '上手だし、速いし、安いです', '上手だし、速いし、安いです'),
                option('あの 美容院は 上手し、速いだし、安いだし。', '上手し、速いだし、安いだし', '上手し、速いだし、安いだし'),
            ], [
                hint('「上手」はな形容詞、「速い」「安い」はい形容詞です。', '上手 is a na-adjective; 速い and 安い are i-adjectives.'),
                hint('な形容詞の普通形は「上手だ」です。', 'The plain form of the na-adjective is 上手だ.'),
                hint('「上手だし、速いし」のあとに最後の特徴を置きます。', 'After 上手だし、速いし, keep the final feature.'),
            ]),
        round('kitchen', 1, 3, 'plain-form-select',
            '3）新しい 台所は きれいです・広いです・便利です →',
            '新しい 台所は きれいだし、広いし、便利です。', [
                option('新しい 台所は きれいだし、広いし、便利です。', 'きれいだし、広いし、便利です', 'きれいだし、広いし、便利です'),
                option('新しい 台所は きれいし、広いだし、便利し。', 'きれいし、広いだし、便利し', 'きれいし、広いだし、便利し'),
            ], [
                hint('最初と最後はな形容詞、真ん中は「広い」です。', 'The first and last predicates are na-adjectives; the middle one is 広い.'),
                hint('途中のな形容詞「きれい」には「だし」が必要です。', 'The intermediate na-adjective きれい needs だし.'),
                hint('最後の「便利です」は結びなので、丁寧形のままです。', 'The final 便利です is the ending, so it stays polite.'),
            ]),
        round('car', 1, 4, 'reason-order-choice',
            '4）この 車は 形が いいです・色が きれいです・値段が そんなに 高くないです →',
            'この 車は 形も いいし、色も きれいだし、値段も そんなに 高くないです。', [
                option('この 車は 形も いいし、色も きれいだし、値段も そんなに 高くないです。', '形もいいし、色もきれいだし、値段もそんなに高くないです。', 'Keep the three similar features in source order.'),
                option('この 車は 値段も 高いし、色も きれいだし、形も いいです。', '値段も高いし、色もきれいだし、形もいいです。', 'Reverse and change the source claim.'),
            ], [
                hint('原本の三つの特徴と、その順番を変えません。', 'Keep all three source features in their original order.'),
                hint('ポイントでは、同じ話題の項目に「も」をよく使います。', 'Sensei\'s note often uses も for items about the same topic.'),
                hint('最後は否定の「そんなに高くないです」です。', 'The final claim is the negative そんなに高くないです.'),
            ]),
        round('shop', 2, 1, 'reason-order-choice',
            '1）この 店は 安いです・品物が 多いです・いつも ここで 買い物して います →',
            'この 店は 安いし、品物も 多いし、いつも ここで 買い物して います。', [
                option('この 店は 安いし、品物も 多いし、いつも ここで 買い物して います。', '安いし、品物も多いし、ここで買い物しています。', 'The two reasons lead to shopping here.'),
                option('いつも ここで 買い物して いるし、この 店は 安いし、品物も 多いです。', '買い物しているし、安いし、品物も多いです。', 'The conclusion has been moved into the reason chain.'),
            ], [
                hint('2ページでは、二つの「し」のあとに結論を置きます。', 'On page 2, the conclusion follows the two shi reasons.'),
                hint('理由は「安い」「品物が多い」です。', 'The reasons are 安い and 品物が多い.'),
                hint('結論「いつもここで買い物しています」を最後に残します。', 'Keep the conclusion いつもここで買い物しています last.'),
            ]),
        round('day-off', 2, 2, 'reason-order-choice',
            '2）あしたは 休みです・用事が ありません・うちで ゆっくり 映画を 見ます →',
            'あしたは 休みだし、用事も ないし、うちで ゆっくり 映画を 見ます。', [
                option('あしたは 休みだし、用事も ないし、うちで ゆっくり 映画を 見ます。', '休みだし、用事もないし、うちで映画を見ます。', 'Two reasons, then the result.'),
                option('あしたは 休みし、用事も ありませんし、うちで ゆっくり 映画を 見るし。', '休みし、用事もありませんし、映画を見るし。', 'The noun and conclusion use the wrong roles.'),
            ], [
                hint('「休みです」は名詞述語なので、普通形は「休みだ」です。', '休みです is a noun predicate, so its plain form is 休みだ.'),
                hint('「用事がありません」の普通形は「用事がない」です。', 'The plain form of 用事がありません is 用事がない.'),
                hint('映画を見ることは理由ではなく、この問題の結論です。', 'Watching the film is the conclusion, not another reason.'),
            ]),
        round('shoes', 2, 3, 'typed-chain',
            '3）デザインが すてきです・サイズが ちょうど いいです・この 靴を 買います →',
            'デザインも すてきだし、サイズも ちょうど いいし、この 靴を 買います。', [], [
                hint('二つの理由を普通形＋「し」にしてから、結論を置きます。', 'Put both reasons in plain form plus shi, then add the conclusion.'),
                hint('な形容詞「すてき」は「すてきだし」です。', 'The na-adjective すてき becomes すてきだし.'),
                hint('「デザインもすてきだし、サイズもちょうどいいし」のあとに「この靴を買います」です。', 'After デザインもすてきだし、サイズもちょうどいいし, add この靴を買います.'),
            ]),
        round('flat', 2, 4, 'typed-chain',
            '4）この マンションは 景色が すばらしいです・ペットが 飼えます・よく 売れて います →',
            'この マンションは 景色も すばらしいし、ペットも 飼えるし、よく 売れて います。', [], [
                hint('景色とペットの二つが、最後の結果の理由です。', 'The view and permission for pets are the two reasons for the final result.'),
                hint('可能形「飼えます」の普通形は「飼える」です。', 'The plain form of the potential 飼えます is 飼える.'),
                hint('「景色もすばらしいし、ペットも飼えるし」のあとに「よく売れています」を残します。', 'Keep よく売れています after 景色もすばらしいし、ペットも飼えるし.'),
            ]),
    ] as const;
    const activity: ReasonChainModel = {
        id: 'activity:l2-l13-sensei-shi-reason-chain',
        kind: 'academy-reason-chain',
        responseKind: 'moodle-chapter-28-shi-varied-chain',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(item => item.conceptId),
        prompt: {
            ja: '先生の Chapter 28-2 の二つの使い方と例を先に読み、課題1と2の八つの原文を、形選び・理由順選び・入力でつないでください。',
            en: 'Read Sensei\'s two Chapter 28-2 uses and examples first, then connect all eight exact task 1 and 2 prompts through form selection, reason-order choice, and typed production.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                archiveId: ARCHIVE_ID,
                sourceSheets: SOURCE_VISUALS,
                media: { status: 'audio-members-quarantined-unpaired', sourceAudioMembers: 5, sourceAudioTracksDelivered: 0 },
                answerKeyBasis: 'yomu-derived-completions-over-verbatim-source-teaching-and-prompts',
            },
            support: {
                minna: { reference: 'Minna no Nihongo II · Lesson 28', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: '≈ Genki II · Listing reasons and soft refusal', reuse: 'sequence-only' },
            },
        },
        payload: {
            teaching: [
                { title: 'Basic sentence:', text: 'verb/adj/noun Plain-form し、 verb/adj/noun Plain-form し、〜。' },
                {
                    title: 'Sensei’s similar-information rule',
                    text: 'This sentence pattern is used when mentioning two or more similar things once after the other about the topic. In examples, the things mentioned are similar because they are all accomplishments.',
                },
                {
                    title: 'Point',
                    text: 'Since the sentence pattern expresses the speaker’s desire to mention more than just one thing about the topic, も is also often used instead of が. それに can also be used to make this meaning even clearer.',
                },
                {
                    title: 'Sensei’s reasons-and-result rule',
                    text: 'This sentence pattern is also be used when 〜し、〜し part gives the reasons for what follows.\nそれで can also be used to make this meaning even clearer.\nNote. the conclusion may be omitted if it is obvious, leaving only reasons.',
                },
                {
                    title: 'れい)',
                    text: [
                        'パフュームは、明(あか)るいし、きれいだし、ダンスもじょうずです。',
                        'ワット先生は、熱心(ねっしん)だし、まじめだし、それに 経験(けいけん)もあります。',
                        'うちから ちかいし、すこし やすいし、テスコへ 行きます。',
                        '便利(べんり)だし、デザインも いいし、それで この自転車(じてんしゃ)を かいました。',
                    ].join('\n'),
                },
            ],
            taskHeadings: [
                '1: please connect the phrases using 〜し、〜し.',
                '2: please connect the phrases using 〜し、〜し, then telling the conclusions.',
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: {
                    ja: '八つの原文が、普通形＋「し」と、理由のあとに残る結論を保った文になりました。',
                    en: 'All eight source prompts now preserve plain-form plus shi and, where required, the conclusion after its reasons.',
                } },
                lapse: {
                    explanation: {
                        ja: '一つ以上の文で、普通形か、理由と結論の順番を見直す必要があります。',
                        en: 'At least one chain needs another look at plain form or the order of reasons and conclusion.',
                    },
                    repairPrompt: {
                        ja: '表示された文だけを直し、必要ならヒントを一つずつ開きましょう。',
                        en: 'Repair only the visible chains, opening one earned hint at a time if needed.',
                    },
                    nearbyExample: {
                        ja: '先生の例「うちからちかいし、すこしやすいし、テスコへ行きます」では、二つの理由のあとに結果があります。',
                        en: 'In Sensei\'s example うちからちかいし、すこしやすいし、テスコへ行きます, the result follows two reasons.',
                    },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-shi-reason-chain',
        narrative: {
            ja: '共有キッチンで「ながら」の二つの動作をつなぎ終えると、アカシュが先生の次の Chapter 28-2 の二ページをカフェのロバートへ渡します。ロバートは、誘いを断っても会話が続くよう、似た情報といくつかの理由を「し」で一つの鎖にします。',
            en: 'After joining two simultaneous actions in the shared kitchen, Aakash carries Sensei\'s next Chapter 28-2 pages to Robert at the cafe. Robert links similar details and multiple reasons with shi so an invitation can be declined without ending the conversation.',
        },
        activity: Object.freeze(activity),
    });
}

function round(
    id: string,
    sourcePage: 1 | 2,
    sourceItem: 1 | 2 | 3 | 4,
    interaction: ReasonChainInteraction,
    sourcePrompt: string,
    answerExpression: string,
    options: readonly ReasonChainOption[],
    hints: ReasonChainRound['hints'],
): ReasonChainRound {
    const sourceOrder = (sourcePage === 1 ? sourceItem : sourceItem + 4) as ReasonChainRound['sourceOrder'];
    return Object.freeze({
        id, interaction, sourceOrder, sourcePage, sourceTask: sourcePage, sourceItem,
        sourceQuestionId: `${SOURCE_PREFIX}:pdf-p${sourcePage}:task-${sourcePage}:q${sourceItem}`,
        sourcePrompt, options, answerValue: answerExpression, answerExpression,
        acceptedAnswers: [answerExpression],
        conceptId: `concept:l2-l13:shi-chain:${sourceOrder}`,
        errorTag: `l2-l13-shi-chain-${sourceOrder}`,
        hints,
    });
}

function option(value: string, ja: string, en: string): ReasonChainOption {
    return Object.freeze({ value, label: Object.freeze({ ja, en }) });
}

function hint(ja: string, en: string): LocalizedText { return Object.freeze({ ja, en }); }

function sourceVisual(page: 1 | 2, sha256: string, alt: LocalizedText): ReasonChainSourceVisual {
    return Object.freeze({
        sourceId: `moodle:${SOURCE_PAYLOAD_SHA256}:page:${page}`,
        payloadSha256: SOURCE_PAYLOAD_SHA256,
        title: SOURCE_TITLE,
        page,
        url: `/academy/content/lessons/l2-l13/moodle-chapter-28-2-shi-page-${page}.png`,
        sha256,
        alt: Object.freeze(alt),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l13 package');
    const identity = record(root.identity, 'l2-l13 identity');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l2-l13 package identity.');
    }
    const coverage = record(root.sourceCoverage, 'l2-l13 coverage');
    if (coverage.archiveId !== ARCHIVE_ID
        || coverage.archiveSha256 !== 'f1ce9163abbe23a99c1e0fbe29973c8f3f68630cc6cbcd872a6e91ea75fe4217') {
        throw new TypeError('Unexpected l2-l13 source archive.');
    }
    const members = array(coverage.members, 'l2-l13 members').map(value => record(value, 'l2-l13 member'));
    const sourceMatches = members.filter(member => member.payloadSha256 === SOURCE_PAYLOAD_SHA256);
    if (sourceMatches.length !== 1 || sourceMatches[0]?.title !== SOURCE_TITLE || sourceMatches[0]?.kind !== 'document') {
        throw new TypeError(`Missing unique Lesson 38 Moodle source ${SOURCE_TITLE}.`);
    }
    if (members.filter(member => member.kind === 'audio').length !== 5) {
        throw new TypeError('Lesson 38 expects five quarantined Moodle audio members in the exact package.');
    }
    const mapping = record(root.mapping, 'l2-l13 mapping');
    if (mapping.minna !== 'Minna no Nihongo II · Lesson 28'
        || mapping.genki !== '≈ Genki II · Listing reasons and soft refusal') {
        throw new TypeError('Lesson 38 must preserve its sequence-only Minna and Genki mapping.');
    }
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}
