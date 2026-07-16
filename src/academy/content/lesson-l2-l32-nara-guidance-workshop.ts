import lessonPackage from '../../../public/academy/content/lessons/059-l2-l32.json';
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

const PACKAGE_ID = 'l2-l32';
const PACKAGE_ORDER = 59;
const MODULE_ID = 8121301;
const ARCHIVE_ID = 'archive-000042';
const ARCHIVE_SHA256 = '8c1e974b36b4546301ea6d4b90ec8a12d7ac618a37a18b0c3765ff3c248821c3';
const VOCABULARY_SHA256 = '3368165df2d31b2d17c058e854e0958e55c7f4b0bad8f0339dbbbf9ac2ae0258';
const CONDITIONAL_SHA256 = '67bda5b3968519440ae273cf3c59f614ffc1b41a9875e84e79e7b74ca23e1dd4';
const SUGGESTIONS_SHA256 = '89e6a87f527dc69b0535ba6347e84af82ad73f96d7cb3c3b6712420611e427ef';
const HEALTH_SHA256 = '62242b14c4fd24c272e2f41da3f494757770eda77cec4f46e88344697b452424';
const QUARANTINED_AUDIO_SHA256 = Object.freeze([
    '06f3dfb38532d500d7703639865192e443b98e8ecf48da616b4010a04b8aa6b0',
    'c8bd1dd230f2897ba0bb4cc39cd8ba901a405841d1f2ba43d3f93ea79607232c',
    'cbaf9340bbfa4f699248863b1becbe243ba89f0da12edc37317190b43c78bc74',
]);

const SOURCE_VISUALS: StateInspectionModel['provenance']['moodle']['sourceSheets'] = Object.freeze([
    visual(VOCABULARY_SHA256, 'Chapter 35-2 Vocabulary Sheet', 1,
        'moodle-chapter-35-2-vocabulary-page-1.png', 'fa6f77b803c9d08f4c8db0407e80f36c51e63b3250f9eef8d64fea878fcfb3aa', {
            ja: 'Moodle 原本: Chapter 35-2 語彙表の1ページ目。',
            en: 'Moodle original: Chapter 35-2 vocabulary sheet, page 1.',
        }),
    visual(VOCABULARY_SHA256, 'Chapter 35-2 Vocabulary Sheet', 2,
        'moodle-chapter-35-2-vocabulary-page-2.png', 'cb7dcc7f8d63494d4b24ee5939d4bec8f2aa46b06b9cb899942199b2cc992500', {
            ja: 'Moodle 原本: Chapter 35-2 語彙表の2ページ目。',
            en: 'Moodle original: Chapter 35-2 vocabulary sheet, page 2.',
        }),
    visual(CONDITIONAL_SHA256, 'Chapter 35-2_adj_noun conditional form 〜ければ 〜なら_grammar exercise', 1,
        'moodle-chapter-35-2-adjective-noun-conditional-page-1.png', '44d14785120d35cc2ad260d75868dfaa821897d6db09a29fdefebb324f228b4e', {
            ja: 'Moodle 原本: い形容詞・な形容詞・名詞の条件形と例文。',
            en: 'Moodle original: adjective and noun conditional forms with printed examples.',
        }),
    visual(CONDITIONAL_SHA256, 'Chapter 35-2_adj_noun conditional form 〜ければ 〜なら_grammar exercise', 2,
        'moodle-chapter-35-2-adjective-noun-conditional-page-2.png', 'dfbed7d744624519feb8838e6b67cbb1480dbc6b256227b4bb0920b558087d33', {
            ja: 'Moodle 原本: 条件形のペアワークと自由会話。',
            en: 'Moodle original: conditional-form pair work and free conversation.',
        }),
    visual(SUGGESTIONS_SHA256, 'Chapter 35-3_noun〜なら_making suggestions grammar exercise', 1,
        'moodle-chapter-35-3-noun-nara-suggestions-page-1.png', 'd4db4b2406fe07b9798910c572265206247fcb307abe585982630e12b718eeec', {
            ja: 'Moodle 原本: 名詞＋ならで情報や提案を返す説明と例文。',
            en: 'Moodle original: noun + なら information and suggestion teaching with examples.',
        }),
    visual(SUGGESTIONS_SHA256, 'Chapter 35-3_noun〜なら_making suggestions grammar exercise', 2,
        'moodle-chapter-35-3-noun-nara-suggestions-page-2.png', '914c5362988c8dd45f2076014a506859d3c61e88cb4d9e95c744952bab5eb747', {
            ja: 'Moodle 原本: レストランの提案とおすすめリレー。',
            en: 'Moodle original: restaurant recommendations and the suggestion relay.',
        }),
    visual(HEALTH_SHA256, 'Chapter 36 Reference Vocabulary_Health', 1,
        'moodle-chapter-36-health-vocabulary-page-1.png', '82597963956ef3cdd7422e7c11ab208c4aa8484fc02c55d0b6bf82b475f2b79b', {
            ja: 'Moodle 原本: Chapter 36 健康の参照語彙。画像依存のため、参照資料としてのみ表示します。',
            en: 'Moodle original: Chapter 36 health reference vocabulary. Image-dependent and shown only as reference teaching.',
        }),
]);

export function createLessonL2L32NaraGuidanceWorkshopBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('cheap-computer', 1, 1, 'grammar', 1, 'action-choice', sourceQuestion(CONDITIONAL_SHA256, 1, 'example:cheap-computer'),
            '安(やす)ければ、', '安(やす)ければ、パソコンを 買(か)います。', [
                option('安(やす)ければ、パソコンを 買(か)います。'),
                option('安(やす)なら、パソコンを 買(か)います。'),
            ], hints(
                ['先生の Basic sentence の最初の例です。', '安いの最後の「い」を「ければ」にします。', '原文の後半は「パソコンを 買(か)います。」です。'],
                ['Use Sensei’s first Basic sentence example.', 'Final い in 安い changes to ければ.', 'The printed main clause is パソコンを 買(か)います。'],
            )),
        round('convenient-party', 2, 1, 'grammar', 2, 'state-select', sourceQuestion(CONDITIONAL_SHA256, 1, 'example:convenient-party'),
            '都合(つごう)が よければ、', '都合(つごう)が よければ、パーティへ 行きます。', [
                option('都合(つごう)が よければ、パーティへ 行きます。'),
                option('都合(つごう)が いいなら、パーティへ 行きます。'),
            ], hints(
                ['先生の都合の例を探します。', '「いい」の条件形は「よければ」です。', '行き先は原文どおり「パーティへ」です。'],
                ['Find Sensei’s 都合 example.', 'The conditional form of いい is よければ.', 'Keep the printed destination パーティへ.'],
            )),
        round('free-evening', 3, 1, 'grammar', 3, 'typed-report', sourceQuestion(CONDITIONAL_SHA256, 1, 'example:free-evening'),
            'ひまなら、', 'ひまなら、今晩(こんばん) 映画(えいが)に 行きましょう。', [], hints(
                ['先生のな形容詞の肯定例です。', '「ひま」の後は「なら」です。', '原文の提案は「今晩(こんばん) 映画(えいが)に 行きましょう。」です。'],
                ['Use Sensei’s affirmative na-adjective example.', 'ひま is followed by なら.', 'The printed suggestion is 今晩(こんばん) 映画(えいが)に 行きましょう。'],
            )),
        round('rain-cafe', 4, 1, 'grammar', 4, 'action-choice', sourceQuestion(CONDITIONAL_SHA256, 1, 'example:rain-cafe'),
            '雨(あめ)なら、', '雨(あめ)なら、近所(きんじょ) の カフェへ 行きます。', [
                option('雨(あめ)なら、近所(きんじょ) の カフェへ 行きます。'),
                option('雨(あめ)ければ、近所(きんじょ) の カフェへ 行きます。'),
            ], hints(
                ['先生の名詞の肯定例です。', '「雨」の後は「なら」です。', '原文の場所は「近所(きんじょ) の カフェ」です。'],
                ['Use Sensei’s affirmative noun example.', '雨 is followed by なら.', 'The printed place is 近所(きんじょ) の カフェ.'],
            )),
        round('paris-opera', 5, 1, 'speaking', 1, 'state-select', sourceQuestion(SUGGESTIONS_SHA256, 1, 'example:paris'),
            'パリなら、', 'パリなら、オペラハウスは 絶対(ぜったい) 行ってください。', [
                option('パリなら、オペラハウスは 絶対(ぜったい) 行ってください。'),
                option('パリなら、チャイナタウンが いいですよ。'),
            ], hints(
                ['先生の名詞＋ならの最初の例です。', 'すすめる場所は「オペラハウス」です。', '原文の結びは「絶対(ぜったい) 行ってください。」です。'],
                ['Use Sensei’s first noun + なら example.', 'The recommended place is オペラハウス.', 'The printed ending is 絶対(ぜったい) 行ってください。'],
            )),
        round('eurostar-discount', 6, 1, 'speaking', 2, 'typed-report', sourceQuestion(SUGGESTIONS_SHA256, 1, 'example:eurostar'),
            'ユーロスターなら、', 'ユーロスターなら、早割(はやわり)が お薦(すす)めですよ。', [], hints(
                ['先生の二つ目の提案例です。', 'すすめるのは「早割(はやわり)」です。', '原文の結びは「お薦(すす)めですよ。」です。'],
                ['Use Sensei’s second suggestion example.', 'The recommendation is 早割(はやわり).', 'The printed ending is お薦(すす)めですよ。'],
            )),
        round('chinese-food', 7, 1, 'speaking', 3, 'action-choice', sourceQuestion(SUGGESTIONS_SHA256, 1, 'example:chinese-food'),
            '中華料理(ちゅうかりょうり)なら、', '中華料理(ちゅうかりょうり)なら、チャイナタウンが いいですよ。', [
                option('中華料理(ちゅうかりょうり)なら、チャイナタウンが いいですよ。'),
                option('中華料理(ちゅうかりょうり)なら、キングスクロスが いいですよ。'),
            ], hints(
                ['先生の料理についての提案例です。', '場所は「チャイナタウン」です。', '評価の結びは「が いいですよ。」です。'],
                ['Use Sensei’s food suggestion example.', 'The place is チャイナタウン.', 'The recommendation ends が いいですよ。'],
            )),
        round('kings-cross', 8, 1, 'speaking', 4, 'typed-report', sourceQuestion(SUGGESTIONS_SHA256, 1, 'example:kings-cross'),
            'キングスクロスなら、', 'キングスクロスなら、いい レストランが ありますよ。', [], hints(
                ['先生の場所についての情報例です。', 'あるものは「いい レストラン」です。', '原文の結びは「が ありますよ。」です。'],
                ['Use Sensei’s place-information example.', 'What exists is いい レストラン.', 'The printed ending is が ありますよ。'],
            )),
    ] as const;

    const activity: StateInspectionModel = {
        id: 'activity:l2-l32-sensei-nara-guidance-workshop',
        kind: 'academy-state-inspection',
        responseKind: 'moodle-chapter-35-nara-guidance-workshop',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(round => round.conceptId),
        prompt: {
            ja: '先生の Chapter 35-2 と 35-3 の原本、語彙表、健康の参照表を先に学び、八つの印刷例を復元してください。',
            en: 'Study Sensei’s Chapter 35-2 and 35-3 originals, vocabulary, and health reference first, then restore eight printed examples.',
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
                { title: 'Adjective condition', text: 'Sensei’s source changes a positive i-adjective from final い to ければ. The special form of いい is よければ.' },
                { title: 'Negative adjective condition', text: 'For a negative i-adjective, Sensei’s source uses くなければ.' },
                { title: 'Na-adjective and noun condition', text: 'Sensei’s source uses なら after a na-adjective or noun, and じゃなければ for the negative condition.' },
                { title: 'Suggestion from a topic', text: 'Sensei also attaches なら to a noun when giving information or a suggestion in reaction to what someone has just said.' },
                { title: 'Source and answer boundary', text: 'The eight assessed completions reproduce printed examples. Sensei supplies no separate answer key; choices, hints, and retry support are original Yomu scaffolding.' },
                { title: 'Audio quarantine', text: 'The archive records three audio members, but none is playable because exact task pairing, transcript, duration, rights, and answers remain unresolved.' },
            ],
            taskHeadings: [
                { sourceTask: 'grammar', text: 'Basic sentence:' },
                { sourceTask: 3, text: '3: Pair work_Create questions and answer to them. Please tell your own thoughts with Yes or No.' },
                { sourceTask: 'speaking', text: '1: Please complete a sentence using 〜なら.' },
                { sourceTask: 2, text: '2: Please complete a sentence using 〜なら and create your own reason.' },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: {
                    ja: '八つの印刷例で、形容詞・名詞の条件と、名詞＋ならの情報・提案を復元できました。',
                    en: 'You restored eight printed examples covering adjective and noun conditions plus noun + なら information and suggestions.',
                } },
                lapse: {
                    explanation: {
                        ja: '間違えた原文だけ、条件になる語と原本の後半を確認しましょう。',
                        en: 'For only the missed source rows, recheck the condition word and the printed main clause.',
                    },
                    repairPrompt: {
                        ja: '間違えた行だけを直し、必要なら原本とヒントを一つずつ開きましょう。',
                        en: 'Repair only the missed rows, reopening the source page and one earned hint at a time.',
                    },
                    nearbyExample: {
                        ja: '先生の型: 安ければ、〜／ひまなら、〜／パリなら、〜',
                        en: 'Sensei’s patterns: 安ければ、〜; ひまなら、〜; パリなら、〜.',
                    },
                },
            },
        },
    };

    return Object.freeze({
        id: 'nara-guidance-workshop',
        narrative: {
            ja: 'クリスチャンが先生の条件形と提案の原本を開き、ピーターが例を「条件」と「返す情報」に分けます。健康の参照語彙も確認してから、印刷例を一つずつ戻します。',
            en: 'Christian opens Sensei’s conditional and suggestion originals while Peter sorts the examples into conditions and information offered in reply. After checking the health reference too, the class restores each printed line.',
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
    sourceQuestionId: string,
    sourcePrompt: string,
    answerExpression: string,
    options: readonly StateInspectionOption[],
    roundHints: StateInspectionRound['hints'],
): StateInspectionRound {
    return Object.freeze({
        id, interaction, sourceOrder, sourcePage, sourceTask, sourceItem, sourceQuestionId,
        sourcePrompt, options, answerValue: answerExpression, answerExpression,
        acceptedAnswers: [answerExpression],
        conceptId: `concept:l2-l32:nara-guidance:${sourceOrder}`,
        errorTag: `l2-l32-nara-guidance-${sourceOrder}`,
        hints: roundHints,
    });
}

function sourceQuestion(payloadSha256: string, page: number, locus: string): string {
    return `moodle:${MODULE_ID}:${payloadSha256}:pdf-p${page}:${locus}`;
}

function option(value: string): StateInspectionOption {
    return Object.freeze({ value, label: Object.freeze({ ja: value, en: value }) });
}

function hints(ja: readonly string[], en: readonly string[]): StateInspectionRound['hints'] {
    if (ja.length !== 3 || en.length !== 3) throw new TypeError('l2-l32 rounds require exactly three bilingual hints.');
    return [
        Object.freeze({ ja: ja[0]!, en: en[0]! }),
        Object.freeze({ ja: ja[1]!, en: en[1]! }),
        Object.freeze({ ja: ja[2]!, en: en[2]! }),
    ];
}

function visual(
    payloadSha256: string,
    title: string,
    page: StateInspectionSourceVisual['page'],
    filename: string,
    sha256: string,
    alt: LocalizedText,
): StateInspectionSourceVisual {
    return Object.freeze({
        sourceId: `moodle:${payloadSha256}:page:${page}`,
        payloadSha256,
        title,
        page,
        url: `/academy/content/lessons/l2-l32/${filename}`,
        sha256,
        alt: Object.freeze(alt),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l32 package');
    const identity = record(root.identity, 'l2-l32 identity');
    const coverage = record(root.sourceCoverage, 'l2-l32 coverage');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID
        || coverage.archiveModuleId !== MODULE_ID || coverage.archiveId !== ARCHIVE_ID
        || coverage.archiveSha256 !== ARCHIVE_SHA256) {
        throw new TypeError('Unexpected l2-l32 package identity or source archive.');
    }
    const members = array(coverage.members, 'l2-l32 members').map(value => record(value, 'l2-l32 member'));
    for (const payloadSha256 of [VOCABULARY_SHA256, CONDITIONAL_SHA256, SUGGESTIONS_SHA256, HEALTH_SHA256]) {
        if (!members.some(member => member.payloadSha256 === payloadSha256 && member.kind === 'document')) {
            throw new TypeError(`Missing exact l2-l32 Moodle document ${payloadSha256}.`);
        }
    }
    const audioMembers = members.filter(member => member.kind === 'audio');
    if (audioMembers.length !== 3 || QUARANTINED_AUDIO_SHA256.some(payloadSha256 =>
        !audioMembers.some(member => member.payloadSha256 === payloadSha256))) {
        throw new TypeError('l2-l32 requires all three exact audio members to remain recorded and quarantined.');
    }
    const mapping = record(root.mapping, 'l2-l32 mapping');
    if (mapping.minna !== 'Minna no Nihongo II · Lessons 35–36'
        || mapping.genki !== '≈ Genki II · parallel N4 scope') {
        throw new TypeError('l2-l32 must preserve its sequence-only Minna and Genki mappings.');
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
