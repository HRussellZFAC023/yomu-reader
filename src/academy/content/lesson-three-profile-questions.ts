import lessonPackage from '../../../public/academy/content/lessons/004-l1-l03.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type {
    ProfileQuestionAnswer,
    ProfileQuestionMatchModel,
    ProfileQuestionRound,
} from '../minigames/profile-question-match';
import type { SourceVocabularySheetModel } from '../minigames/source-vocabulary-sheet';

const PACKAGE_ID = 'l1-l03';
const MODULE_ID = 5804931;
const VOCABULARY_COMPONENT_ID = 'sensei-chapter-1-3-vocabulary';
const VOCABULARY_SHA256 = '88d3eb1787c0754800bcc48a9911c4ae870e41e6c8cce781477add3f3b2f2cd8';
const MOODLE_GRAMMAR_SHA256 = '4c9b251ade1fc39cd2d9e31a28575e18f894f3425f8b01584d03ee9c8038da2e';
const MINNA_AUDIO_SHA256 = '5534e1b822942b8b3806c6555fa2c2355457ed4db3c54442525b65c337644e7f';
const GENKI_PAYLOAD_SHA256 = '341b1eca3ef498d9c5890601ef4dd5965478675e97fa7dc3a9012bbdd7b292cd';
const GENKI_SCRIPT_SHA256 = '474d1b1ae113e6136e9e6b1110804aea1d8637abd91f77992e910d93a96e3949';

export function createLessonThreeSourceVocabularyActivities(): readonly SourceVocabularySheetModel[] {
    const component = sourceVocabularyComponent();
    const provenance = record(component.provenance, 'l1-l03 vocabulary provenance');
    const sourceId = exactText(provenance.sourceId, 'l1-l03 vocabulary sourceId');
    const payloadSha256 = digest(provenance.payloadSha256, 'l1-l03 vocabulary payloadSha256');
    const sourceTitle = exactText(provenance.title, 'l1-l03 vocabulary title');
    if (payloadSha256 !== VOCABULARY_SHA256) throw new TypeError('Unexpected l1-l03 vocabulary payload.');

    const itemIds = new Set<string>();
    let previousPage = 0;
    let previousRow = 0;
    const items = array(component.items, 'l1-l03 vocabulary items');
    if (items.length !== 16) throw new TypeError('The exact 16-row l1-l03 vocabulary sheet is required.');
    return Object.freeze(items.map((candidate, index) => {
        const item = record(candidate, `l1-l03 vocabulary row ${index + 1}`);
        const source = record(item.source, `l1-l03 vocabulary row ${index + 1} source`);
        const sourceQuestionId = exactText(source.itemId, `l1-l03 vocabulary row ${index + 1} itemId`);
        if (itemIds.has(sourceQuestionId)) throw new TypeError(`Duplicate l1-l03 vocabulary item ${sourceQuestionId}.`);
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
            throw new TypeError('The l1-l03 vocabulary rows must remain in exact source order.');
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

export function createLessonThreeProfileQuestionMatchModel(): ProfileQuestionMatchModel {
    assertExactSourceMembers();
    const answers: readonly ProfileQuestionAnswer[] = Object.freeze([
        answer('age', 'じゅうきゅうさいです', 'Mary is nineteen years old.'),
        answer('name', 'メアリー・ハートです', 'Her name is Mary Hart.'),
        answer('phone', 'でんわばんごうはぜろにぜろのろくきゅうにいちのよんにさんろくです', 'Her phone number is 020-6921-4236.'),
        answer('occupation', 'がくせいです', 'She is a student.'),
        answer('major', 'せんこうはにほんごです', 'Her major is Japanese.'),
        answer('year', 'にねんせいです', 'She is a second-year student.'),
    ]);
    const rounds: readonly ProfileQuestionRound[] = Object.freeze([
        round(1, 'name', 'おなまえは？', 'Mary Hart', 'name'),
        round(2, 'occupation', 'しごとはなんですか。', 'Student', 'occupation'),
        round(3, 'year', 'なんねんせいですか。', '2nd year', 'year'),
        round(4, 'age', 'なんさいですか。', '19 years old', 'age'),
        round(5, 'major', 'せんこうはなんですか。', 'Major is Japanese', 'major'),
        round(6, 'phone', 'でんわばんごうはなんですか。', '020-6921-4236', 'phone'),
    ]);
    const model: ProfileQuestionMatchModel = {
        id: 'activity:l1-l03-profile-question-match',
        kind: 'academy-profile-question-match',
        responseKind: 'profile-question-one-to-one-match',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(item => item.conceptId),
        prompt: {
            ja: 'メアリーのプロフィールを見て、六つの質問に答えカードを合わせましょう。',
            en: 'Use Mary’s profile to match an answer card to each of the six questions.',
        },
        provenance: {
            packageId: 'l1-l03',
            answerVisibility: 'after-attempt' as const,
            moodle: {
                moduleId: MODULE_ID,
                sourceId: `moodle-payload:${MOODLE_GRAMMAR_SHA256}`,
                payloadSha256: MOODLE_GRAMMAR_SHA256,
                sourceTitle: 'Chapter 1-3 Grammar Exercise asking name and state where the person belongs',
                locus: { page: 1, sections: ['の', 'も', 'だれ', 'どなた'] },
            },
            minna: {
                reference: 'Minna no Nihongo I, Lesson 1',
                relation: 'course-sequence-and-byte-identified-audio-only',
                audioMember: {
                    title: 'minna shokyu 1 001',
                    sourceId: `moodle-payload:${MINNA_AUDIO_SHA256}`,
                    payloadSha256: MINNA_AUDIO_SHA256,
                    archiveOrder: 4,
                    durationSeconds: 23.980417,
                },
                transcriptStatus: 'not-provided-do-not-invent',
            },
            genki: {
                sourceId: `japanese-genki-interactive:${GENKI_PAYLOAD_SHA256}:generateQuiz`,
                relativePath: 'lessons/lesson-1/workbook-7/index.html',
                payloadSha256: GENKI_PAYLOAD_SHA256,
                scriptSha256: GENKI_SCRIPT_SHA256,
                lineLocus: { start: 76, end: 119 },
                engine: 'Genki.generateQuiz',
                responseAdaptation: 'exact-prompts-answers-and-order-with-yomu-one-to-one-matching',
            },
        },
        payload: {
            teaching: [
                {
                    sourceOrder: 1,
                    title: { ja: 'の：所属をつなぐ', en: 'の: connect an affiliation' },
                    pattern: 'Noun 1 は Noun 2 の Noun 3 です。',
                    example: 'カリナさんは ロンドンだいがくの がくせいです。',
                    explanation: {
                        ja: 'Noun 2 が、Noun 3 の所属する組織やグループです。',
                        en: 'Noun 2 is the organisation or group that Noun 3 belongs to.',
                    },
                },
                {
                    sourceOrder: 2,
                    title: { ja: 'も：同じことを言う', en: 'も: make the same statement' },
                    pattern: 'Noun 1 も Noun 2 です。',
                    example: 'ケイトさんは イギリスじんです。ワットさんも イギリスじんです。',
                    explanation: {
                        ja: '前の人と同じことを言うとき、は の代わりに も を使います。',
                        en: 'Use も instead of は when the new topic has the same description as the previous one.',
                    },
                },
                {
                    sourceOrder: 3,
                    title: { ja: 'だれ：人をたずねる', en: 'だれ: ask who a person is' },
                    pattern: 'Noun 1 は だれですか。',
                    example: 'あのひとは だれですか。カリナさんです。',
                    explanation: {
                        ja: '知りたい人の部分を だれ にして、文末に か をつけます。',
                        en: 'Replace the unknown person with だれ and add か at the end.',
                    },
                },
                {
                    sourceOrder: 4,
                    title: { ja: 'どなた：ていねいにたずねる', en: 'どなた: ask politely' },
                    pattern: 'あのかたは どなたですか。',
                    example: 'あのかたは どなたですか。ケイトさんです。',
                    explanation: {
                        ja: 'あのかた は あのひと、どなた は だれ のていねいな言い方です。',
                        en: 'あのかた is the polite form of あのひと, and どなた is the polite form of だれ.',
                    },
                },
            ],
            profileFacts: [
                { id: 'name', label: { ja: 'なまえ', en: 'Name' }, value: 'Mary Hart' },
                { id: 'occupation', label: { ja: 'しごと', en: 'Occupation' }, value: 'Student' },
                { id: 'year', label: { ja: 'がくねん', en: 'Year' }, value: '2nd year' },
                { id: 'age', label: { ja: 'ねんれい', en: 'Age' }, value: '19 years old' },
                { id: 'major', label: { ja: 'せんこう', en: 'Major' }, value: 'Japanese' },
                { id: 'phone', label: { ja: 'でんわばんごう', en: 'Phone' }, value: '020-6921-4236' },
            ],
            answers,
            rounds,
            passScore: 1,
            feedback: {
                pass: {
                    explanation: {
                        ja: '六つの質問と、メアリーの答えがすべて合いました。',
                        en: 'All six questions now match Mary’s source answers.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '質問と答えが合っていないカードがあります。',
                        en: 'At least one question is paired with the wrong profile answer.',
                    },
                    repairPrompt: {
                        ja: '質問のことばとプロフィールの項目を見て、違うカードだけ直しましょう。',
                        en: 'Compare each question word with the profile labels, then repair only the mismatched cards.',
                    },
                    nearbyExample: {
                        ja: '「なんさいですか」は年齢を聞くので、「じゅうきゅうさいです」と答えます。',
                        en: 'なんさいですか asks age, so it matches じゅうきゅうさいです.',
                    },
                },
            },
        },
    };
    return Object.freeze(model);
}

function answer(id: string, label: string, meaning: string): ProfileQuestionAnswer {
    return Object.freeze({ id, label, meaning });
}

function round(
    sourceOrder: number,
    id: string,
    question: string,
    clue: string,
    correctAnswerId: string,
): ProfileQuestionRound {
    return Object.freeze({
        id,
        sourceOrder,
        sourceQuestionId: `genki-2e:l1-l03:lesson-1-workbook-7:problem-${sourceOrder}`,
        question,
        clue,
        correctAnswerId,
        conceptId: `concept:l1-l03:profile-question:${id}`,
        errorTag: `l1-l03-profile-question-${id}`,
    });
}

function assertExactSourceMembers(): void {
    const root = record(lessonPackage, 'l1-l03 package');
    const identity = record(root.identity, 'l1-l03 identity');
    if (root.id !== PACKAGE_ID || identity.moduleId !== MODULE_ID) throw new TypeError('Unexpected l1-l03 package identity.');
    const members = array(record(root.sourceCoverage, 'l1-l03 source coverage').members, 'l1-l03 source members')
        .map((value, index) => record(value, `l1-l03 source member ${index}`));
    for (const [payloadSha256, title] of [
        [MOODLE_GRAMMAR_SHA256, 'Chapter 1-3 Grammar Exercise asking name and state where the person belongs'],
        [MINNA_AUDIO_SHA256, 'minna shokyu 1 001'],
    ] as const) {
        const matches = members.filter(member => member.payloadSha256 === payloadSha256);
        if (matches.length !== 1 || exactText(matches[0].title, `${payloadSha256} title`) !== title) {
            throw new TypeError(`Expected one l1-l03 source member for ${payloadSha256}.`);
        }
    }
    const activities = array(root.genkiInteractiveActivities, 'l1-l03 Genki activities')
        .map((value, index) => record(value, `l1-l03 Genki activity ${index}`));
    const match = activities.find(activity => activity.id === 'genki-2e:l1-l03:lesson-1-workbook-7');
    if (!match) throw new TypeError('Expected the mapped l1-l03 Genki workbook task.');
    const source = record(match.source, 'l1-l03 Genki source');
    const exactTask = record(match.exactTask, 'l1-l03 Genki task');
    if (source.payloadSha256 !== GENKI_PAYLOAD_SHA256 || source.scriptSha256 !== GENKI_SCRIPT_SHA256
        || exactTask.engine !== 'Genki.generateQuiz' || exactTask.exerciseOrderPreserved !== true) {
        throw new TypeError('Unexpected l1-l03 Genki source task.');
    }
}

function sourceVocabularyComponent(): Readonly<Record<string, unknown>> {
    const root = record(lessonPackage, 'l1-l03 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l1-l03 identity').moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l1-l03 package identity.');
    }
    const matches = array(root.components, 'l1-l03 components').map((value, index) =>
        record(value, `l1-l03 component ${index}`)).filter(component => {
        if (component.type !== 'vocabulary') return false;
        const provenance = record(component.provenance, 'l1-l03 component provenance');
        return provenance.payloadSha256 === VOCABULARY_SHA256;
    });
    if (matches.length !== 1) throw new TypeError('Expected one exact l1-l03 source vocabulary component.');
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
