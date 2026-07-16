import lessonPackage from '../../../public/academy/content/lessons/006-l1-l05.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type {
    PossessionPhraseBuilderModel,
    PossessionPhraseRound,
} from '../minigames/possession-phrase-builder';
import type { SourceVocabularySheetModel } from '../minigames/source-vocabulary-sheet';

const PACKAGE_ID = 'l1-l05';
const MODULE_ID = 5834212;
const VOCABULARY_COMPONENT_ID = 'sensei-chapter-2-2-vocabulary';
const VOCABULARY_SHA256 = 'e735014a4abb2cd2e281f7a608a546d24a3586e55958c78e515450075fcf3dbe';
const MOODLE_CONTENT_SHA256 = '3215f31fc58ce0ff7310ee16098e1fb0149f6c09a6fc972415150fc146934915';
const MOODLE_OWNER_SHA256 = '7d71238e487d8c77d5f618e8529921533ceaea2497e8edd3cc9490220f0ed56f';
const MINNA_007_SHA256 = 'bd797762c73da698d89151f48e3823aea7845064378d0d534f6bbce1af6ba570';
const MINNA_008_SHA256 = 'e71fa2268bce1d88bbe84e7c7dbf5febe663cf7406180afda6ceb6960edfd174';
const GENKI_PAYLOAD_SHA256 = '97cabde5351fca03f498279c245c50f598abb6d4d10165fa732b297b9eda4c06';
const GENKI_SCRIPT_SHA256 = '44caf8d237764275ac255ab37de85bb007b4250790555ce09b58999c25d64d7d';

export function createLessonFiveSourceVocabularyActivities(): readonly SourceVocabularySheetModel[] {
    const component = sourceVocabularyComponent();
    const provenance = record(component.provenance, 'l1-l05 vocabulary provenance');
    const sourceId = exactText(provenance.sourceId, 'l1-l05 vocabulary sourceId');
    const payloadSha256 = digest(provenance.payloadSha256, 'l1-l05 vocabulary payloadSha256');
    const sourceTitle = exactText(provenance.title, 'l1-l05 vocabulary title');
    if (payloadSha256 !== VOCABULARY_SHA256) throw new TypeError('Unexpected l1-l05 vocabulary payload.');

    const itemIds = new Set<string>();
    let previousPage = 0;
    let previousRow = 0;
    const items = array(component.items, 'l1-l05 vocabulary items');
    if (items.length !== 25) throw new TypeError('The exact 25-row l1-l05 vocabulary sheet is required.');
    return Object.freeze(items.map((candidate, index) => {
        const item = record(candidate, `l1-l05 vocabulary row ${index + 1}`);
        const source = record(item.source, `l1-l05 vocabulary row ${index + 1} source`);
        const sourceQuestionId = exactText(source.itemId, `l1-l05 vocabulary row ${index + 1} itemId`);
        if (itemIds.has(sourceQuestionId)) throw new TypeError(`Duplicate l1-l05 vocabulary item ${sourceQuestionId}.`);
        itemIds.add(sourceQuestionId);
        if (digest(source.payloadSha256, `${sourceQuestionId} payloadSha256`) !== payloadSha256
            || exactText(source.title, `${sourceQuestionId} title`) !== sourceTitle
            || source.answerVisibility !== 'after-attempt') {
            throw new TypeError(`Vocabulary source identity changed for ${sourceQuestionId}.`);
        }
        const locus = record(source.locus, `${sourceQuestionId} locus`);
        const page = positiveInteger(locus.page, `${sourceQuestionId} page`);
        const row = positiveInteger(locus.row, `${sourceQuestionId} row`);
        if (page < previousPage || (page === previousPage && row <= previousRow)) {
            throw new TypeError('The l1-l05 vocabulary rows must remain in exact source order.');
        }
        previousPage = page;
        previousRow = row;
        const exact = record(source.exact, `${sourceQuestionId} exact fields`);
        const fieldProvenance = record(source.fieldProvenance, `${sourceQuestionId} field provenance`);
        const model: SourceVocabularySheetModel = {
            id: `authored:${PACKAGE_ID}/${VOCABULARY_COMPONENT_ID}:p${page}:r${row}`,
            kind: 'academy-source-vocabulary-sheet',
            sourceQuestionId,
            conceptIds: [`concept:${PACKAGE_ID}:${VOCABULARY_COMPONENT_ID}:p${page}:r${row}`],
            responseKind: 'source-vocabulary-recall',
            prompt: {
                ja: '先生の行を見て、意味を思い出してから確認しましょう。',
                en: 'Read the teacher row, recall its meaning, then check it.',
            },
            answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
            provenance: {
                packageId: PACKAGE_ID,
                componentId: VOCABULARY_COMPONENT_ID,
                sourceId,
                sourceQuestionId,
                payloadSha256,
                sourceTitle,
                locus: { page, row },
            },
            payload: {
                exact: {
                    words: exactText(exact.words, `${sourceQuestionId} exact words`),
                    pronunciation: nullableText(exact.pronunciation, `${sourceQuestionId} exact pronunciation`),
                    meaning: nullableText(exact.meaning, `${sourceQuestionId} exact meaning`),
                },
                support: {
                    words: exactText(item.ja, `${sourceQuestionId} support words`),
                    reading: exactText(item.reading, `${sourceQuestionId} support reading`),
                    meaning: exactText(item.en, `${sourceQuestionId} support meaning`),
                },
                fieldProvenance: {
                    words: exactText(fieldProvenance.words, `${sourceQuestionId} words provenance`),
                    reading: exactText(fieldProvenance.reading, `${sourceQuestionId} reading provenance`),
                    meaning: exactText(fieldProvenance.meaning, `${sourceQuestionId} meaning provenance`),
                },
            },
        };
        return Object.freeze(model);
    }));
}

export function createLessonFivePossessionPhraseModel(): PossessionPhraseBuilderModel {
    assertExactSourceMembers();
    const rounds: readonly PossessionPhraseRound[] = Object.freeze([
        round(1, 'japanese-student', 'Japanese student', 'にほんじん', 'がくせい', [
            'にほんじんのがくせい', '日本人の学生', '日本人のがくせい', 'にほんじんの学生',
        ], 'a Japanese student'),
        round(2, 'takeshi-phone', "Takeshi's telephone number", 'たけしさん', 'でんわばんごう', [
            'たけしさんのでんわばんごう', 'たけしさんの電話番号',
        ], "Takeshi's telephone number"),
        round(3, 'my-friend', 'My friend', 'わたし', 'ともだち', [
            'わたしのともだち', '私の友だち', '私の友達', '私のとも達', '私のともだち',
            'わたしの友達', 'わたしの友だち', 'わたしのとも達',
        ], 'my friend'),
        round(4, 'english-teacher', 'English-language teacher', 'えいご', 'せんせい', [
            'えいごのせんせい', '英語の先生', '英語のせんせい', 'えいごの先生',
        ], 'an English-language teacher'),
        round(5, 'michiko-major', "Michiko's major", 'みちこさん', 'せんこう', [
            'みちこさんのせんこう', 'みちこさんの専攻',
        ], "Michiko's major"),
    ]);
    const model: PossessionPhraseBuilderModel = {
        id: 'activity:l1-l05-possession-phrase-builder',
        kind: 'academy-possession-phrase-builder',
        responseKind: 'two-part-no-phrase-builder',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(item => item.conceptId),
        prompt: {
            ja: 'A と B を選び、五つの「AのB」を組み立てましょう。',
            en: 'Choose A and B to build all five source AのB phrases.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                contentRule: moodleSource(
                    MOODLE_CONTENT_SHA256,
                    'Chapter 2-2 Grammar Exercise-1 What the object is about',
                    'handouts/Chapter 2-2 Grammar Exercise-1_What the object is about.pdf',
                ),
                ownerRule: moodleSource(
                    MOODLE_OWNER_SHA256,
                    'Chapter 2-2 Grammar Exercise-2 Whose belongings the object is',
                    'handouts/Chapter 2-2 Grammar Exercise-2_Whose belongings the object is.pdf',
                ),
            },
            minna: {
                reference: 'Minna no Nihongo I, Lesson 2',
                relation: 'course-sequence-and-byte-identified-audio-only',
                audioMembers: [
                    minnaAudio('minna shokyu 1 007', MINNA_007_SHA256, 13, 36.257958),
                    minnaAudio('minna shokyu 1 008', MINNA_008_SHA256, 14, 45.505333),
                ],
                transcriptStatus: 'not-provided-do-not-invent',
            },
            genki: {
                sourceId: `japanese-genki-interactive:${GENKI_PAYLOAD_SHA256}:generateQuiz`,
                taskId: 'genki-2e:l1-l05:lesson-1-workbook-4',
                relativePath: 'lessons/lesson-1/workbook-4/index.html',
                payloadSha256: GENKI_PAYLOAD_SHA256,
                scriptSha256: GENKI_SCRIPT_SHA256,
                lineLocus: { start: 76, end: 107 },
                engine: 'Genki.generateQuiz',
                sourceType: 'fill',
                responseAdaptation: 'exact-prompts-answer-variants-and-order-with-yomu-two-menu-phrase-assembly',
            },
        },
        payload: {
            teaching: [
                {
                    sourceOrder: 1,
                    pattern: 'Noun 1 の Noun 2',
                    rule: {
                        ja: 'Noun 1 は、Noun 2 の内容を説明します。この使い方では Noun 2 を省略できません。',
                        en: 'Noun 1 explains what Noun 2 is about. In this use, Noun 2 cannot be omitted.',
                    },
                    example: 'にほんごの ほん',
                    source: 'moodle-content-rule',
                },
                {
                    sourceOrder: 2,
                    pattern: 'Owner の Thing',
                    rule: {
                        ja: 'Noun 1 は Noun 2 の持ち主を示します。物が明らかなときだけ Noun 2 を省略できます。',
                        en: 'Noun 1 identifies the owner of Noun 2. Omit Noun 2 only when the thing is obvious.',
                    },
                    example: 'これは わたしの スマホです。／それは だれの（かばん）ですか。',
                    source: 'moodle-owner-rule',
                },
                {
                    sourceOrder: 3,
                    pattern: 'A の B',
                    rule: {
                        ja: '英語と日本語では二つの名詞の順番が違うことがあります。日本語では説明する A を先に置きます。',
                        en: 'The two nouns may appear in a different order in English and Japanese. Put the describing A first in Japanese.',
                    },
                    example: 'English-language teacher → えいごの せんせい',
                    source: 'genki-order-warning',
                },
            ],
            aOptions: ['にほんじん', 'たけしさん', 'わたし', 'えいご', 'みちこさん'],
            bOptions: ['がくせい', 'でんわばんごう', 'ともだち', 'せんせい', 'せんこう'],
            rounds,
            passScore: 1,
            feedback: {
                pass: {
                    explanation: {
                        ja: '五つの AのB を、元の Genki の順番どおりに組み立てました。',
                        en: 'All five AのB phrases match the exact Genki source order.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: 'A と B の組み合わせが違う句があります。',
                        en: 'At least one phrase has the wrong A and B pairing.',
                    },
                    repairPrompt: {
                        ja: '英語で「だれ・何の」と「何」を分け、説明する A を の の前に置きましょう。',
                        en: 'Separate the describing or owning A from the head noun B, then put A before の.',
                    },
                    nearbyExample: {
                        ja: '「英語の先生」は えいご ＋ の ＋ せんせい です。',
                        en: 'English-language teacher is えいご + の + せんせい.',
                    },
                },
            },
        },
    };
    return Object.freeze(model);
}

function round(
    sourceOrder: number,
    id: string,
    sourcePrompt: string,
    correctA: string,
    correctB: string,
    acceptedAnswers: readonly string[],
    meaning: string,
): PossessionPhraseRound {
    return Object.freeze({
        id,
        sourceOrder,
        sourceQuestionId: `genki-2e:l1-l05:lesson-1-workbook-4:slot-${sourceOrder}`,
        sourcePrompt,
        correctA,
        correctB,
        acceptedAnswers: Object.freeze([...acceptedAnswers]),
        meaning,
        conceptId: `concept:l1-l05:no-phrase:${id}`,
        errorTag: `l1-l05-no-phrase-${id}`,
    });
}

function moodleSource(payloadSha256: string, sourceTitle: string, member: string) {
    return Object.freeze({
        sourceId: `moodle-payload:${payloadSha256}`,
        payloadSha256,
        sourceTitle,
        member,
        author: 'Rie Tsuruta-Barratt',
        pages: [1, 2] as const,
    });
}

function minnaAudio(title: string, payloadSha256: string, archiveOrder: 13 | 14, durationSeconds: number) {
    return Object.freeze({
        title,
        sourceId: `moodle-payload:${payloadSha256}`,
        payloadSha256,
        archiveOrder,
        durationSeconds,
    });
}

function assertExactSourceMembers(): void {
    const root = record(lessonPackage, 'l1-l05 package');
    const identity = record(root.identity, 'l1-l05 identity');
    if (root.id !== PACKAGE_ID || identity.moduleId !== MODULE_ID) throw new TypeError('Unexpected l1-l05 package identity.');
    const sourceCoverage = record(root.sourceCoverage, 'l1-l05 source coverage');
    const members = array(sourceCoverage.members, 'l1-l05 source members')
        .map((value, index) => record(value, `l1-l05 source member ${index}`));
    for (const [payloadSha256, title] of [
        [MOODLE_CONTENT_SHA256, 'Chapter 2-2 Grammar Exercise-1 What the object is about'],
        [MOODLE_OWNER_SHA256, 'Chapter 2-2 Grammar Exercise-2 Whose belongings the object is'],
        [MINNA_007_SHA256, 'minna shokyu 1 007'],
        [MINNA_008_SHA256, 'minna shokyu 1 008'],
    ] as const) {
        const matches = members.filter(member => member.payloadSha256 === payloadSha256);
        if (matches.length !== 1 || exactText(matches[0].title, `${payloadSha256} title`) !== title) {
            throw new TypeError(`Expected one l1-l05 source member for ${payloadSha256}.`);
        }
    }
    const coverage = array(sourceCoverage.coverageMap, 'l1-l05 coverage map')
        .map((value, index) => record(value, `l1-l05 coverage item ${index}`));
    for (const [payloadSha256, durationSeconds] of [
        [MINNA_007_SHA256, 36.257958],
        [MINNA_008_SHA256, 45.505333],
    ] as const) {
        const matches = coverage.filter(item => item.payloadSha256 === payloadSha256);
        const sourceTrace = matches.length === 1 ? record(matches[0].sourceTrace, `${payloadSha256} source trace`) : null;
        const audioProbe = sourceTrace ? record(sourceTrace.audioProbe, `${payloadSha256} audio probe`) : null;
        if (audioProbe?.durationSeconds !== durationSeconds || audioProbe.codec !== 'mp3' || audioProbe.status !== 'probed') {
            throw new TypeError(`Unexpected l1-l05 Minna audio probe for ${payloadSha256}.`);
        }
    }
    const activities = array(root.genkiInteractiveActivities, 'l1-l05 Genki activities')
        .map((value, index) => record(value, `l1-l05 Genki activity ${index}`));
    const match = activities.find(activity => activity.id === 'genki-2e:l1-l05:lesson-1-workbook-4');
    if (!match) throw new TypeError('Expected the mapped l1-l05 Genki workbook task.');
    const source = record(match.source, 'l1-l05 Genki source');
    const exactTask = record(match.exactTask, 'l1-l05 Genki task');
    const config = record(exactTask.config, 'l1-l05 Genki task config');
    const info = exactText(config.info, 'l1-l05 Genki source instruction');
    const quizlet = exactText(config.quizlet, 'l1-l05 Genki quizlet');
    const acceptedAnswers = [
        'にほんじんのがくせい', '日本人の学生', '日本人のがくせい', 'にほんじんの学生',
        'たけしさんのでんわばんごう', 'たけしさんの電話番号',
        'わたしのともだち', '私の友だち', '私の友達', '私のとも達', '私のともだち',
        'わたしの友達', 'わたしの友だち', 'わたしのとも達',
        'えいごのせんせい', '英語の先生', '英語のせんせい', 'えいごの先生',
        'みちこさんのせんこう', 'みちこさんの専攻',
    ];
    if (source.payloadSha256 !== GENKI_PAYLOAD_SHA256 || source.scriptSha256 !== GENKI_SCRIPT_SHA256
        || exactTask.engine !== 'Genki.generateQuiz' || exactTask.exerciseOrderPreserved !== true || config.type !== 'fill'
        || !info.includes('AのB') || !info.includes('order in which the two nouns appear may be different')
        || !quizlet.includes('Japanese student') || !quizlet.includes("Takeshi's telephone number")
        || !quizlet.includes('My friend') || !quizlet.includes('English-language teacher')
        || !quizlet.includes("Michiko's major") || !acceptedAnswers.every(answer => quizlet.includes(answer))) {
        throw new TypeError('Unexpected l1-l05 Genki source task.');
    }
}

function sourceVocabularyComponent(): Readonly<Record<string, unknown>> {
    const root = record(lessonPackage, 'l1-l05 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l1-l05 identity').moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l1-l05 package identity.');
    }
    const matches = array(root.components, 'l1-l05 components').map((value, index) =>
        record(value, `l1-l05 component ${index}`)).filter(component => {
        if (component.type !== 'vocabulary') return false;
        const provenance = record(component.provenance, 'l1-l05 component provenance');
        return provenance.payloadSha256 === VOCABULARY_SHA256;
    });
    if (matches.length !== 1) throw new TypeError('Expected one exact l1-l05 source vocabulary component.');
    return matches[0];
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}

function exactText(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be nonempty text.`);
    return value;
}

function nullableText(value: unknown, label: string): string | null {
    return value === null ? null : exactText(value, label);
}

function positiveInteger(value: unknown, label: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
        throw new TypeError(`${label} must be a positive integer.`);
    }
    return value;
}

function digest(value: unknown, label: string): string {
    const result = exactText(value, label);
    if (!/^[a-f0-9]{64}$/u.test(result)) throw new TypeError(`${label} must be a SHA-256 digest.`);
    return result;
}
