import lessonPackage from '../../../public/academy/content/lessons/057-l2-l30.json';
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

const PACKAGE_ID = 'l2-l30';
const PACKAGE_ORDER = 57;
const MODULE_ID = 8121299;
const ARCHIVE_ID = 'archive-000025';
const ARCHIVE_SHA256 = '511ea72f4f4f8f68f99b383169a223b36bd6c4c0045e2665e4a50028f8e07928';
const GRAMMAR_SHA256 = '9094654d6999483fedebbd644a7c13966c754c1f2d5e456c6a0ab8d3feb0948e';
const PROVERBS_SHA256 = '69cded81bfe44567286f274456fcd9bdfe4cfc771f4bcb7aa20e26b9512f7d27';
const EXERCISE_SHA256 = '36993b824e4fe4f4ffee180d3dcc38e87aba11b05e19394736887135c8d485cb';

const SOURCE_VISUALS: StateInspectionModel['provenance']['moodle']['sourceSheets'] = Object.freeze([
    visual(GRAMMAR_SHA256, 'Chapter 35 conditional form', 1,
        'moodle-chapter-35-conditional-1.png', '54cb797da19389aee803b7bf3ea28c9169404b609ad821f6bc004c43e9955950', {
            ja: 'Moodle 原本: Chapter 35 条件形の意味、例文、グループ1の作り方。',
            en: 'Moodle original: Chapter 35 conditional meaning, printed examples, and Group 1 formation.',
        }),
    visual(GRAMMAR_SHA256, 'Chapter 35 conditional form', 2,
        'moodle-chapter-35-conditional-2.png', 'c55c278e439360669e5c6b1c52f63d7a36ed8ef4ca4ba36379565e520a5bffc4', {
            ja: 'Moodle 原本: グループ2・3、否定形、形容詞、名詞の条件形。',
            en: 'Moodle original: Group 2, irregular, negative, adjective, and noun conditional forms.',
        }),
    visual(PROVERBS_SHA256, 'Chapter 35 Reference Vocabulary_Proverbs', 1,
        'moodle-chapter-35-proverbs-1.png', '3bc703c3dbe6e811d3641cef375605f43e48758f27f721e21cd224256062b909', {
            ja: 'Moodle 原本: 条件形を含む Chapter 35 のことわざ一覧。',
            en: 'Moodle original: Chapter 35 proverb reference containing conditional forms.',
        }),
    ...([
        ['moodle-chapter-35-1-conditional-exercise-1.png', '42f9704a3a37087ace383e5b48f3b5444781ddad5b8912e82137e35adf26b401'],
        ['moodle-chapter-35-1-conditional-exercise-2.png', 'a652275dc5665e48cfd7ae33fa371e6f048da18df2ded60dc7b98b75fd46750f'],
        ['moodle-chapter-35-1-conditional-exercise-3.png', '58608fc14c6847f9c56e17e498497c32072e78f8605ea2e9556682a7977cc3bc'],
        ['moodle-chapter-35-1-conditional-exercise-4.png', '94cf45911a8ee4d620d363b35c854ec90ee489f540979bb523a1fa9d1bcfbac8'],
        ['moodle-chapter-35-1-conditional-exercise-5.png', 'f9f92ff40aec5acf1c03865b6debcb6dced7b38c759d4f46935d6cc626d0f743'],
    ] as const).map(([filename, sha256], index) => visual(
        EXERCISE_SHA256,
        'Chapter 35-1_Verb conditionalば_なければ_grammar exercise',
        (index + 1) as StateInspectionSourceVisual['page'],
        filename,
        sha256,
        {
            ja: `Moodle 原本: Chapter 35-1 条件形練習 ${index + 1}ページ。`,
            en: `Moodle original: Chapter 35-1 conditional exercise page ${index + 1}.`,
        },
    )),
]);

export function createLessonL2L30ConditionalWorkshopBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('group-one-say', 1, 1, 'grammar', 1, 'action-choice', sourceQuestion(GRAMMAR_SHA256, 1, 'group-1:iimasu'),
            'いいます', 'いえば', [
                option('いえば', 'いえば', 'いえば'),
                option('いうれば', 'いうれば', 'いうれば'),
            ], hints(
                ['「いう」はグループ1です。', '最後の「う」をえ段の「え」にします。', 'その後に「ば」を付けます。'],
                ['いう is Group 1.', 'Move final う to the e-row sound え.', 'Then add ば.'],
            )),
        round('group-two-eat', 2, 2, 'grammar', 2, 'state-select', sourceQuestion(GRAMMAR_SHA256, 2, 'group-2:tabemasu'),
            'たべます', 'たべれば', [
                option('たべれば', 'たべれば', 'たべれば'),
                option('たべせば', 'たべせば', 'たべせば'),
            ], hints(
                ['「たべる」はグループ2です。', 'グループ2は「る」を取ります。', '語幹に「れば」を付けます。'],
                ['たべる is Group 2.', 'Remove final る for Group 2.', 'Attach れば to the stem.'],
            )),
        round('negative-do', 3, 2, 'grammar', 3, 'typed-report', sourceQuestion(GRAMMAR_SHA256, 2, 'negative:shimasen'),
            'しません', 'しなければ', [], hints(
                ['否定の「しない」から作ります。', '「ない」を「なければ」に変えます。', '先生の表の形をそのまま入力します。'],
                ['Start from negative しない.', 'Replace ない with なければ.', 'Enter the form exactly as printed in Sensei’s table.'],
            )),
        round('good-adjective', 4, 2, 'grammar', 4, 'action-choice', sourceQuestion(GRAMMAR_SHA256, 2, 'i-adjective:ii'),
            'いい', 'よければ', [
                option('よければ', 'よければ', 'よければ'),
                option('いければ', 'いければ', 'いければ'),
            ], hints(
                ['「いい」は特別な形です。', '語幹は「よ」です。', '先生の表では「よければ」です。'],
                ['いい has an irregular stem.', 'Its stem here is よ.', 'Sensei’s table prints よければ.'],
            )),
        round('home-proverb', 5, 1, 'vocabulary', 1, 'state-select', sourceQuestion(PROVERBS_SHA256, 1, 'proverb-1'),
            'Wherever you live, once you get used to living there, it becomes your home.', '住めば 都', [
                option('住めば 都', '住めば 都', '住めば 都'),
                option('聞けば 都', '聞けば 都', '聞けば 都'),
            ], hints(
                ['先生のことわざ一覧の最初の枠です。', '動詞は「住む」です。', '原文は「住めば 都」です。'],
                ['This is the first box on Sensei’s proverb page.', 'The verb is 住む.', 'The source line is 住めば 都.'],
            )),
        round('ask-grandfather', 6, 3, 1, 1, 'typed-report', sourceQuestion(EXERCISE_SHA256, 3, 'task-1:q1'),
            'おじいさんに 聞きます・昔の ことが わかります', 'おじいさんに 聞けば、昔の ことが わかります。', [], hints(
                ['前半の動詞は「聞きます」です。', '「聞く」は「聞けば」になります。', '二つの原文を順番のままつなぎます。'],
                ['The first verb is 聞きます.', '聞く becomes 聞けば.', 'Join the two source clauses in their printed order.'],
            )),
        round('glasses-negative', 7, 3, 3, 1, 'action-choice', sourceQuestion(EXERCISE_SHA256, 3, 'task-3:q1'),
            '眼鏡を かけません・辞書の 字が 読めません', '眼鏡を かけなければ、辞書の 字が 読めません。', [
                option('眼鏡を かけなければ、辞書の 字が 読めません。', '眼鏡を かけなければ、辞書の 字が 読めません。', '眼鏡を かけなければ、辞書の 字が 読めません。'),
                option('眼鏡を かければ、辞書の 字が 読めません。', '眼鏡を かければ、辞書の 字が 読めません。', '眼鏡を かければ、辞書の 字が 読めません。'),
            ], hints(
                ['前半は否定の「かけません」です。', '「かけない」を「かけなければ」にします。', '後半の「読めません」は変えません。'],
                ['The first clause is negative かけません.', 'Change かけない to かけなければ.', 'Do not change 読めません in the second clause.'],
            )),
        round('japanese-input', 8, 5, 6, 1, 'typed-report', sourceQuestion(EXERCISE_SHA256, 5, 'task-6:example'),
            '日本語を 入力したいんですが。', 'ここを クリックして、日本語を 選べば、入力が できますよ。', [], hints(
                ['先生の Short conversation-1 の例です。', '最初にここをクリックします。', '日本語を選ぶ条件を「選べば」でつなぎます。'],
                ['Use Sensei’s Short conversation-1 example.', 'First click here.', 'Connect the Japanese-language selection with 選べば.'],
            )),
    ] as const;

    const activity: StateInspectionModel = {
        id: 'activity:l2-l30-sensei-conditional-workshop',
        kind: 'academy-state-inspection',
        responseKind: 'moodle-chapter-35-conditional-workshop',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(round => round.conceptId),
        prompt: {
            ja: '先生の Chapter 35 条件形表、ことわざ、練習原本を先に学び、八つの原文例と形を復元してください。',
            en: 'Study Sensei’s Chapter 35 conditional tables, proverb page, and exercise originals first, then restore eight source-grounded examples and forms.',
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
                    status: 'no-audio-members-in-package',
                    sourceAudioMembers: 0,
                    sourceAudioTracksDelivered: 0,
                },
                answerKeyBasis: 'sensei-verbatim-tables-proverb-and-example-with-yomu-derived-deterministic-conditional-joins',
            },
            support: {
                minna: { reference: 'Minna no Nihongo II · Lesson 35', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: '≈ Genki II · parallel N4 scope', reuse: 'sequence-only' },
            },
        },
        payload: {
            teaching: [
                { title: 'Condition before result', text: 'Sensei presents the first clause as a precondition for the following main clause, and also uses the form to respond to a situation.' },
                { title: 'Group 1', text: 'For Group 1, move the final u-row sound to its e-row partner and add ば: いう becomes いえば.' },
                { title: 'Group 2', text: 'For Group 2, replace final る with れば: たべる becomes たべれば.' },
                { title: 'Irregular verbs', text: 'The two irregular forms printed by Sensei are する → すれば and くる → くれば.' },
                { title: 'Negative condition', text: 'For a negative verb, replace ない with なければ: いそがない becomes いそがなければ.' },
                { title: 'Adjectives and nouns', text: 'An i-adjective changes final い to ければ, with いい → よければ. A na-adjective or noun uses なら.' },
            ],
            taskHeadings: [
                { sourceTask: 'grammar', text: 'Chapter 35 Conditional form' },
                { sourceTask: 'vocabulary', text: 'Chapter 35 Vocabulary_Proverbs' },
                { sourceTask: 1, text: '1: join the two sentences into one sentences using conditional form 〜ば.' },
                { sourceTask: 3, text: '3: join the two sentences into one sentences using conditional form 〜なければ.' },
                { sourceTask: 6, text: '6: Short conversation-1: Please look at the example and give instructions how to use the word.' },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: {
                    ja: '八つの原文で、動詞の肯定・否定と、形容詞・名詞の条件形を復元できました。',
                    en: 'You restored all eight source examples across affirmative and negative verbs, adjectives, and nouns.',
                } },
                lapse: {
                    explanation: {
                        ja: '間違えた原文だけ、条件になる語と「ば／なければ／なら」の作り方を確認しましょう。',
                        en: 'For only the missed source rows, recheck the conditional word and how ば, なければ, or なら is formed.',
                    },
                    repairPrompt: {
                        ja: '間違えた行だけを直し、必要なら先生の表とヒントを一つずつ開きましょう。',
                        en: 'Repair only the missed rows, reopening Sensei’s table and one earned hint at a time.',
                    },
                    nearbyExample: {
                        ja: '先生の型: いう → いえば／いそがない → いそがなければ／いい → よければ',
                        en: 'Sensei’s forms: いう → いえば; いそがない → いそがなければ; いい → よければ.',
                    },
                },
            },
        },
    };

    return Object.freeze({
        id: 'conditional-workshop',
        narrative: {
            ja: 'リエ先生が条件形の二枚とことわざ、練習原本を開き、エンジェルが前提と結果のカードを左右に分けます。作り方を確認してから、原文の形を戻します。',
            en: 'Rie opens the two conditional-form pages, the proverb page, and the exercise originals while Angel separates preconditions from results. After the formation rules are clear, the class restores the source forms.',
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
        conceptId: `concept:l2-l30:conditional:${sourceOrder}`,
        errorTag: `l2-l30-conditional-${sourceOrder}`,
        hints: roundHints,
    });
}

function sourceQuestion(payloadSha256: string, page: number, locus: string): string {
    return `moodle:${MODULE_ID}:${payloadSha256}:pdf-p${page}:${locus}`;
}

function option(value: string, ja: string, en: string): StateInspectionOption {
    return Object.freeze({ value, label: Object.freeze({ ja, en }) });
}

function hints(ja: readonly string[], en: readonly string[]): StateInspectionRound['hints'] {
    if (ja.length !== 3 || en.length !== 3) throw new TypeError('l2-l30 rounds require exactly three bilingual hints.');
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
        url: `/academy/content/lessons/l2-l30/${filename}`,
        sha256,
        alt: Object.freeze(alt),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l30 package');
    const identity = record(root.identity, 'l2-l30 identity');
    const coverage = record(root.sourceCoverage, 'l2-l30 coverage');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID
        || coverage.archiveModuleId !== MODULE_ID || coverage.archiveId !== ARCHIVE_ID
        || coverage.archiveSha256 !== ARCHIVE_SHA256) {
        throw new TypeError('Unexpected l2-l30 package identity or source archive.');
    }
    const members = array(coverage.members, 'l2-l30 members').map(value => record(value, 'l2-l30 member'));
    for (const payloadSha256 of [GRAMMAR_SHA256, PROVERBS_SHA256, EXERCISE_SHA256]) {
        if (!members.some(member => member.payloadSha256 === payloadSha256 && member.kind === 'document')) {
            throw new TypeError(`Missing exact l2-l30 Moodle document ${payloadSha256}.`);
        }
    }
    if (members.some(member => member.kind === 'audio')) {
        throw new TypeError('l2-l30 must not claim audio absent from the exact Moodle package.');
    }
    const mapping = record(root.mapping, 'l2-l30 mapping');
    if (mapping.minna !== 'Minna no Nihongo II · Lesson 35' || mapping.genki !== '≈ Genki II · parallel N4 scope') {
        throw new TypeError('l2-l30 must preserve its sequence-only Minna and Genki mappings.');
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
