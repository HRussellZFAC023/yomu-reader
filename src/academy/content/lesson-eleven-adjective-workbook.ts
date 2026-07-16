import lessonPackage from '../../../public/academy/content/lessons/012-l1-l11.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type {
    AdjectiveDescriptionConnectorRound,
    AdjectiveDescriptionModifierRound,
    AdjectiveDescriptionRound,
    AdjectiveDescriptionTeachingStep,
    AdjectiveDescriptionTypedRound,
    AdjectiveDescriptionWorkbookModel,
} from '../minigames/adjective-description-workbook';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l1-l11';
const MODULE_ID = 6053028;
const ARCHIVE_SHA = '17be2963b1aa0520320c987b9f819a21f578b210614694ee7ed511b2d47ad14d';
const MOODLE_MODIFIER_SHA = 'dfec00d8e4c6d049a2251e0ef90035cbe92edef7fdde0c7ca96ced1e8ed40aba';
const MOODLE_CONNECTOR_SHA = '869c7d8430e6d18a2c7d56aceda2789408e2fa9dada1643f30ff9bc600cb1623';
const MINNA_SHA = '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229';
const GENKI_SHA = '5ab2683d567a265548fa0dbfb02af9961bd0bf367b669c2e7cc22aa38d149a65';
const GENKI_SCRIPT_SHA = '470977b7f3e135dcbeefe9121426387f43f20fded2eda92eb6037fd5921cc2fc';
const GENKI_TASK_ID = 'genki-2e:l1-l11:lesson-5-workbook-2';

type SourceProblem = Readonly<{
    id: string;
    prompt: string;
    answers: readonly string[];
    structure?: 'direct' | 'na' | 'soshite' | 'ga';
}>;

const MOODLE_PROBLEMS: readonly SourceProblem[] = [
    problem('moodle:6053028:dfec00d8:p1:q1:1', 'ワットさん／せんせい〈しんせつな〉',
        ['しんせつなせんせいです', 'しんせつな せんせいです'], 'na'),
    problem('moodle:6053028:dfec00d8:p1:q1:2', 'ハイドパーク／こうえん〈きれいな〉',
        ['きれいなこうえんです', 'きれいな こうえんです'], 'na'),
    problem('moodle:6053028:dfec00d8:p1:q1:3', 'ハリーポッター／ほん〈おもしろい〉',
        ['おもしろいほんです', 'おもしろい ほんです'], 'direct'),
    problem('moodle:6053028:dfec00d8:p2:q2:2', 'ふじさんは（ゆうめいです → ＿＿）やまです。', ['ゆうめいな'], 'na'),
    problem('moodle:6053028:dfec00d8:p2:q2:5', 'さくらは（きれいです → ＿＿）はなです。', ['きれいな'], 'na'),
    problem('moodle:6053028:dfec00d8:p4:q5:3', 'きょうとは どんな まちですか。〈きれい〉',
        ['きれいなまちです', 'きれいな まちです'], 'na'),
    problem('moodle:6053028:869c7d84:p2:q1:1', 'にほんの たべもの（おいしい、たかい）',
        ['おいしいですが、たかいです', 'おいしいですが たかいです'], 'ga'),
    problem('moodle:6053028:869c7d84:p2:q1:2', 'にほんの ちかてつ（べんり、きれい）',
        ['べんりです。そして、きれいです', 'べんりです。そして きれいです'], 'soshite'),
];

const MINNA_PROBLEMS: readonly SourceProblem[] = [
    problem(`${minnaPrefix()}:5:1`, '会社の 社員（新しい、きれい）',
        ['会社の社員はどうですか。新しいです。そして、きれいです。',
            '会社の 社員は どうですか。新しいです。そして、きれいです。'], 'soshite'),
    problem(`${minnaPrefix()}:5:2`, '先生（親切、おもしろい）',
        ['先生はどうですか。親切です。そして、おもしろいです。',
            '先生は どうですか。親切です。そして、おもしろいです。'], 'soshite'),
    problem(`${minnaPrefix()}:5:3`, '日本の 食べ物（おいしい、高い）',
        ['日本の食べ物はどうですか。おいしいですが、高いです。',
            '日本の 食べ物は どうですか。おいしいですが、高いです。'], 'ga'),
    problem(`${minnaPrefix()}:5:4`, '日本の 生活（忙しい、おもしろい）',
        ['日本の生活はどうですか。忙しいですが、おもしろいです。',
            '日本の 生活は どうですか。忙しいですが、おもしろいです。'], 'ga'),
    problem(`${minnaPrefix()}:6:1`, 'IMC・新しい・会社', ['IMCは新しい会社です。', 'IMCは 新しい 会社です。'], 'direct'),
    problem(`${minnaPrefix()}:6:2`, '神戸病院・有名・病院', ['神戸病院は有名な病院です。', '神戸病院は 有名な 病院です。'], 'na'),
    problem(`${minnaPrefix()}:6:3`, 'ワットさん・いい・先生', ['ワットさんはいい先生です。', 'ワットさんは いい 先生です。'], 'direct'),
    problem(`${minnaPrefix()}:6:4`, '富士山・きれい・山', ['富士山はきれいな山です。', '富士山は きれいな 山です。'], 'na'),
    problem(`${minnaPrefix()}:7:1`, '「七人の侍」・映画（おもしろい）',
        ['「七人の侍」はどんな映画ですか。おもしろい映画です。', '七人の侍はどんな映画ですか。おもしろい映画です。'], 'direct'),
    problem(`${minnaPrefix()}:7:2`, 'サントスさん・人（親切）',
        ['サントスさんはどんな人ですか。親切な人です。', 'サントスさんは どんな 人ですか。親切な 人です。'], 'na'),
    problem(`${minnaPrefix()}:7:3`, 'さくら大学・大学（新しい）',
        ['さくら大学はどんな大学ですか。新しい大学です。', 'さくら大学は どんな 大学ですか。新しい 大学です。'], 'direct'),
    problem(`${minnaPrefix()}:7:4`, 'スイス・国（きれい）',
        ['スイスはどんな国ですか。きれいな国です。', 'スイスは どんな 国ですか。きれいな 国です。'], 'na'),
];

const GENKI_PROBLEMS: readonly SourceProblem[] = [
    problem(`${GENKI_TASK_ID}:slot-1`, '日本語の宿題はやさしいですか。\n(No, Japanese homework is not easy.)', [
        'いいえ、日本語の宿題はやさしくないです', 'いいえ、日本語のしゅくだいはやさしくないです',
        'いいえ、にほんごの宿題はやさしくないです', 'いいえ、にほんごのしゅくだいはやさしくないです',
        'いいえ、やさしくないです',
    ]),
    problem(`${GENKI_TASK_ID}:slot-2`, '今日は忙しいですか。\n(Yes, today is busy.)', [
        'はい、今日は忙しいです', 'はい、今日はいそがしいです', 'はい、きょうは忙しいです',
        'はい、きょうはいそがしいです', 'はい、忙しいです', 'はい、いそがしいです',
    ]),
    problem(`${GENKI_TASK_ID}:slot-3`, 'あなたの部屋はきれいですか。\n(No, my room is not clean.)', [
        'いいえ、私の部屋はきれいじゃないです', 'いいえ、私の部屋は綺麗じゃないです',
        'いいえ、私のへやはきれいじゃないです', 'いいえ、私のへやは綺麗じゃないです',
        'いいえ、わたしの部屋はきれいじゃないです', 'いいえ、わたしの部屋は綺麗じゃないです',
        'いいえ、わたしのへやはきれいじゃないです', 'いいえ、わたしのへやは綺麗じゃないです',
        'いいえ、きれいじゃないです',
    ]),
    problem(`${GENKI_TASK_ID}:slot-4`, '日本語のクラスはおもしろいですか。\n(Yes, Japanese class is interesting.)', [
        'はい、日本語のクラスは面白いです', 'はい、日本語のクラスはおもしろいです',
        'はい、にほんごのクラスは面白いです', 'はい、にほんごのクラスはおもしろいです',
        'はい、面白いです', 'はい、おもしろいです',
    ]),
    problem(`${GENKI_TASK_ID}:slot-5`, 'あなたの町は静かですか。\n(No, my town is not very quiet.)', [
        'いいえ、私の町はあまり静かじゃないです', 'いいえ、私の町はあまりしずかじゃないです',
        'いいえ、私のまちはあまり静かじゃないです', 'いいえ、私のまちはあまりしずかじゃないです',
        'いいえ、わたしの町はあまり静かじゃないです', 'いいえ、わたしの町はあまりしずかじゃないです',
        'いいえ、わたしのまちはあまり静かじゃないです', 'いいえ、わたしのまちはあまりしずかじゃないです',
        'いいえ、あまり静かじゃないです', 'いいえ、あまりしずかじゃないです',
    ]),
    problem(`${GENKI_TASK_ID}:slot-6`, 'This watch is expensive.', [
        'この時計は高いです', 'この時計はたかいです', 'このとけいは高いです', 'このとけいはたかいです',
    ]),
    problem(`${GENKI_TASK_ID}:slot-7`, 'This coffee is not delicious.', ['このコーヒーはおいしくないです']),
    problem(`${GENKI_TASK_ID}:slot-8`, 'Professor Yamashita is energetic.', [
        '山下先生は元気です', '山下先生はげんきです', '山下せんせいは元気です', '山下せんせいはげんきです',
        'やました先生は元気です', 'やました先生はげんきです', 'やましたせんせいは元気です', 'やましたせんせいはげんきです',
    ]),
    problem(`${GENKI_TASK_ID}:slot-9`, 'The weather is not good.', [
        '天気はよくないです', '天気は良くないです', 'てんきはよくないです', 'てんきは良くないです',
    ]),
    problem(`${GENKI_TASK_ID}:slot-10`, 'I will not be free tomorrow.', [
        '私は明日暇じゃないです', '私は明日ひまじゃないです', '私はあした暇じゃないです', '私はあしたひまじゃないです',
        'わたしは明日暇じゃないです', 'わたしは明日ひまじゃないです', 'わたしはあした暇じゃないです',
        'わたしはあしたひまじゃないです', '明日暇じゃないです', '明日ひまじゃないです',
        'あした暇じゃないです', 'あしたひまじゃないです',
    ]),
];

export function createLessonElevenAdjectiveWorkbookModel(): AdjectiveDescriptionWorkbookModel {
    assertExactPackageSources();
    const rounds = Object.freeze([
        ...MOODLE_PROBLEMS.map((source, index) => sourceRound(source, index + 1, 'Moodle')),
        ...MINNA_PROBLEMS.map((source, index) => sourceRound(source, index + 9, 'Minna no Nihongo I · Lesson 8 · PDF 90 / printed 70')),
        ...GENKI_PROBLEMS.map((source, index) => sourceRound(source, index + 21, 'Genki I · Lesson 5 · workbook 2')),
    ]);
    const model: AdjectiveDescriptionWorkbookModel = {
        id: 'activity:l1-l11-adjective-description-workbook',
        kind: 'academy-adjective-description-workbook',
        responseKind: 'mixed-source-adjective-description-workbook',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: Object.freeze(rounds.map(round => round.conceptId)),
        prompt: {
            ja: '形を先に学び、Moodle・みんなの日本語・Genkiの問題を元の順番で完成しましょう。',
            en: 'Learn the forms first, then complete the Moodle, Minna, and Genki tasks in source order.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            answerVisibility: 'after-attempt',
            sourceOrder: ['moodle', 'minna', 'genki'],
            moodle: {
                moduleId: MODULE_ID,
                archiveOccurrenceId: 'archive-000011',
                archiveSha256: ARCHIVE_SHA,
                documents: [
                    { payloadSha256: MOODLE_MODIFIER_SHA, member: 'Handouts/Chapter 8-3_Grammar Exercise_Adjectives modify nouns.pdf', pages: '1-6' },
                    { payloadSha256: MOODLE_CONNECTOR_SHA, member: 'Handouts/Chapter 8_そして_が_speaking.pdf', pages: '1-3' },
                ],
            },
            minna: {
                sourceId: `minna-i:${MINNA_SHA}:lesson-8`, reference: 'Minna no Nihongo I, Lesson 8',
                title: 'Minna no Nihongo 2nd Edition Shokyu I', author: '3A Network', payloadSha256: MINNA_SHA,
                pageCount: 326, pdfPage: 90, printedPage: 70, locus: 'Practice B, exercises 5-7',
            },
            genki: {
                taskId: GENKI_TASK_ID,
                sourceId: `japanese-genki-interactive:${GENKI_SHA}:generateQuiz`,
                relativePath: 'lessons/lesson-5/workbook-2/index.html', payloadSha256: GENKI_SHA,
                scriptSha256: GENKI_SCRIPT_SHA, lineLocus: { start: 76, end: 140 },
                engine: 'Genki.generateQuiz', sourceType: 'fill',
            },
        },
        payload: {
            teaching: teachingSteps(),
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: { ja: '30問を元資料の順番で完成しました。', en: 'You completed all 30 items in source order.' } },
                lapse: {
                    explanation: { ja: '形か意味の関係を直す問題があります。', en: 'At least one form or meaning relationship needs repair.' },
                    repairPrompt: { ja: '表示された問題だけ、段階ヒントを使って直しましょう。', en: 'Repair only the visible items, using the progressive hints when needed.' },
                    nearbyExample: { ja: 'しずかな まち／おもしろい ほん', en: 'A な-adjective keeps な before a noun; an い-adjective attaches directly.' },
                },
            },
        },
    };
    return Object.freeze(model);
}

export function createLessonElevenAdjectiveWorkbookBeat(): LessonActivityBeat {
    return Object.freeze({
        id: 'adjective-description-workbook',
        narrative: {
            ja: 'ジェニーとトムが町の紹介カードを直しながら、三つの元資料を順番に確認します。',
            en: 'Jenny and Tom repair town-description cards while working through the three sources in order.',
        },
        activity: createLessonElevenAdjectiveWorkbookModel(),
    });
}

function sourceRound(source: SourceProblem, sourceOrder: number, sourceLabel: string): AdjectiveDescriptionRound {
    const common = {
        id: `source-${sourceOrder}`,
        sourceOrder,
        sourceQuestionId: source.id,
        sourceLabel,
        sourcePrompt: source.prompt,
        acceptedAnswers: source.answers,
        answerExpression: source.answers[0]!,
        conceptId: `concept:l1-l11:adjective-description:${sourceOrder}`,
        errorTag: `l1-l11-adjective-description-${sourceOrder}`,
    };
    if (source.structure === 'direct' || source.structure === 'na') {
        return Object.freeze({
            ...common,
            mode: 'modifier',
            correctAttachment: source.structure,
            hints: modifierHints(source.structure),
        } satisfies AdjectiveDescriptionModifierRound);
    }
    if (source.structure === 'soshite' || source.structure === 'ga') {
        return Object.freeze({
            ...common,
            mode: 'connector',
            correctConnector: source.structure,
            hints: connectorHints(source.structure),
        } satisfies AdjectiveDescriptionConnectorRound);
    }
    return Object.freeze({ ...common, mode: 'typed', hints: typedHints(sourceOrder) } satisfies AdjectiveDescriptionTypedRound);
}

function teachingSteps(): readonly AdjectiveDescriptionTeachingStep[] {
    return Object.freeze([
        teaching(1, `moodle:6053028:${MOODLE_MODIFIER_SHA}:worked-examples`, 'Moodle · Chapter 8-3 · page 1',
            'い-adjective + noun / な-adjective + な + noun',
            'い形容詞はそのまま、な形容詞は名詞の前で「な」を保ちます。',
            'An い-adjective attaches directly; a な-adjective keeps な before the noun.',
            'れい）ロンドン まち 〈たのしい〉 → ロンドンは たのしい まちです。／れい）ロンドン まち 〈にぎやかな〉 → ロンドンは にぎやかな まちです。'),
        teaching(2, `${minnaPrefix()}:7:model`, 'Minna no Nihongo I · Lesson 8 · PDF 90 / printed 70',
            'X は どんな N ですか。— adjective + N です。',
            '「どんな」で種類や特徴を聞き、形容詞と名詞で答えます。',
            'Ask what kind with どんな, then answer with an adjective-noun phrase.',
            '奈良・町（静か） → 奈良はどんな町ですか。静かな町です。'),
        teaching(3, `moodle:6053028:${MOODLE_CONNECTOR_SHA}:worked-examples`, 'Moodle · Chapter 8 そして／が · page 1',
            'A です。そして、B です。／A ですが、B です。',
            '同じ方向の説明は「そして」、対照は「が」でつなぎます。',
            'Use そして for compatible descriptions and が for contrast.',
            'にほんの さくらは きれいです。そして、ゆうめいです。／にほんごの べんきょうは むずかしいですが、おもしろいです。'),
        teaching(4, `${GENKI_TASK_ID}:instruction`, 'Genki I · Lesson 5 · workbook 2',
            'い → くないです / な → じゃないです',
            'Genkiの現在形では、い形容詞の否定は「くない」、な形容詞の否定は「じゃない」です。',
            'For present negative forms, い becomes くない; a な-adjective uses じゃない.',
            'やさしい → やさしくないです／きれい → きれいじゃないです'),
    ]);
}

function teaching(
    sourceOrder: number,
    sourceQuestionId: string,
    sourceLabel: string,
    pattern: string,
    ja: string,
    en: string,
    example: string,
): AdjectiveDescriptionTeachingStep {
    return Object.freeze({ sourceOrder, sourceQuestionId, sourceLabel, pattern, explanation: { ja, en }, example });
}

function modifierHints(kind: 'direct' | 'na') {
    return Object.freeze([
        { ja: '形容詞が「い」で終わるか、な形容詞かを決めます。', en: 'First classify the adjective as い or な.' },
        kind === 'na'
            ? { ja: 'な形容詞なので、名詞の前に「な」が必要です。', en: 'It is a な-adjective, so keep な before the noun.' }
            : { ja: 'い形容詞なので、名詞にそのままつなげます。', en: 'It is an い-adjective, so attach it directly to the noun.' },
        { ja: '主題 + は + 形容詞 + 名詞 + です、の順で再構成します。', en: 'Rebuild: topic + は + adjective + noun + です.' },
    ] as const);
}

function connectorHints(kind: 'soshite' | 'ga') {
    return Object.freeze([
        { ja: '二つの評価が同じ方向か、対照かを決めます。', en: 'Decide whether the two evaluations agree or contrast.' },
        kind === 'ga'
            ? { ja: '対照なので、最初の「です」を「ですが」にします。', en: 'This is a contrast, so the first です becomes ですが.' }
            : { ja: '同じ方向なので、一文目を終えて「そして」を使います。', en: 'They agree, so finish the first clause and add そして.' },
        { ja: '二つの形容詞を、元の手がかりの順番のまま使います。', en: 'Keep both adjectives in the source cue order.' },
    ] as const);
}

function typedHints(sourceOrder: number) {
    const negative = [21, 23, 25, 27, 29, 30].includes(sourceOrder);
    return Object.freeze([
        { ja: '英語の手がかりが肯定か否定かを先に確認します。', en: 'First check whether the cue is affirmative or negative.' },
        negative
            ? { ja: 'い形容詞は「くない」、な形容詞は「じゃない」を使います。', en: 'Use くない for an い-adjective or じゃない for a な-adjective.' }
            : { ja: '肯定なので、形容詞の基本形に「です」を続けます。', en: 'For an affirmative answer, use the adjective base form plus です.' },
        { ja: '質問なら「はい／いいえ」も含めて、手がかり全体を日本語にします。', en: 'For a question response, include はい or いいえ and reconstruct the full cue.' },
    ] as const);
}

function problem(id: string, prompt: string, answers: readonly string[], structure?: SourceProblem['structure']): SourceProblem {
    return Object.freeze({ id, prompt, answers: Object.freeze(answers), ...(structure ? { structure } : {}) });
}

function minnaPrefix(): string {
    return `minna-i:${MINNA_SHA}:lesson-8:pdf-p90:practice-b`;
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l1-l11 package');
    const identity = record(root.identity, 'l1-l11 identity');
    if (root.id !== PACKAGE_ID || identity.moduleId !== MODULE_ID) throw new TypeError('Unexpected l1-l11 package identity.');
    const found: Record<string, unknown>[] = [];
    for (const componentValue of array(root.components, 'l1-l11 components')) {
        const component = record(componentValue, 'l1-l11 component');
        for (const exercise of arrayOrEmpty(component.exercises)) {
            const item = record(exercise, 'l1-l11 exercise');
            if (typeof item.sourceQuestionId === 'string'
                && MOODLE_PROBLEMS.some(problem => problem.id === item.sourceQuestionId)) found.push(item);
        }
    }
    if (found.length !== MOODLE_PROBLEMS.length) throw new TypeError('Expected all eight exact l1-l11 Moodle exercises.');
    found.forEach((item, index) => {
        const expected = MOODLE_PROBLEMS[index]!;
        const answer = record(item.answer ?? record(array(item.blanks, 'Moodle blanks')[0], 'Moodle blank').answer, 'Moodle answer');
        const alternatives = arrayOrEmpty(answer.alternatives).filter((value): value is string => typeof value === 'string');
        if (item.sourceQuestionId !== expected.id || item.sourceCueExact !== expected.prompt
            || answer.primary !== expected.answers[0] || expected.answers.slice(1).some(value => !alternatives.includes(value))) {
            throw new TypeError(`Unexpected Moodle source item at order ${index + 1}.`);
        }
    });
    const activities = array(root.genkiInteractiveActivities, 'l1-l11 Genki activities');
    const activity = record(activities[0], 'l1-l11 Genki activity');
    const source = record(activity.source, 'l1-l11 Genki source');
    const locus = record(source.lineLocus, 'l1-l11 Genki locus');
    const task = record(activity.exactTask, 'l1-l11 Genki task');
    const config = record(task.config, 'l1-l11 Genki config');
    const quizlet = requiredText(config.quizlet, 'l1-l11 Genki quizlet');
    if (activities.length !== 1 || activity.id !== GENKI_TASK_ID || source.payloadSha256 !== GENKI_SHA
        || source.scriptSha256 !== GENKI_SCRIPT_SHA || locus.start !== 76 || locus.end !== 140
        || task.engine !== 'Genki.generateQuiz' || config.type !== 'fill') {
        throw new TypeError('Unexpected l1-l11 Genki task identity.');
    }
    let cursor = -1;
    GENKI_PROBLEMS.forEach(sourceProblem => {
        const prompt = sourceProblem.prompt.split('\n')[0]!;
        const position = quizlet.indexOf(prompt, cursor + 1);
        if (position <= cursor || !sourceProblem.answers.slice(0, Math.min(2, sourceProblem.answers.length)).every(answer => quizlet.includes(answer))) {
            throw new TypeError('The exact l1-l11 Genki prompt, answer, or order changed.');
        }
        cursor = position;
    });
}

function record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}

function arrayOrEmpty(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function requiredText(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be non-empty text.`);
    return value;
}
