import lessonPackage from '../../../public/academy/content/lessons/005-l1-l04.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type {
    ObjectDistanceBoardModel,
    ObjectDistanceRound,
} from '../minigames/object-distance-board';
import type { SourceVocabularySheetModel } from '../minigames/source-vocabulary-sheet';

const PACKAGE_ID = 'l1-l04';
const MODULE_ID = 5822243;
const VOCABULARY_COMPONENT_ID = 'sensei-chapter-2-1-vocabulary';
const VOCABULARY_SHA256 = 'a267243216a4c999d8733ed6febeeed938c47b593f0d1841b1dc8c244f37b253';
const MOODLE_GRAMMAR_SHA256 = '83bf2695e5760fdf415c31eabf96586a31f373f6b339849467fa7c88dbdde49b';
const MOODLE_ANSWER_SHA256 = '0d33601e79064e1d08e46988bab8f1cd7738dabf829ece3efe9ae7e60e575249';
const MINNA_AUDIO_SHA256 = '62f3b96d10028d1eb1d6e39020a76cd72003d5d9cf651a70bc895bd3c66bd450';
const GENKI_PAYLOAD_SHA256 = '69eb24f468086afac22f58fbac149c4765026d38477926417f42835e0dfa9b53';
const GENKI_SCRIPT_SHA256 = '52ce8ff929718489eab63f648eb8f82b12f5b7324f3727e76a6bf84d5559474c';

export function createLessonFourSourceVocabularyActivities(): readonly SourceVocabularySheetModel[] {
    const component = sourceVocabularyComponent();
    const provenance = record(component.provenance, 'l1-l04 vocabulary provenance');
    const sourceId = exactText(provenance.sourceId, 'l1-l04 vocabulary sourceId');
    const payloadSha256 = digest(provenance.payloadSha256, 'l1-l04 vocabulary payloadSha256');
    const sourceTitle = exactText(provenance.title, 'l1-l04 vocabulary title');
    if (payloadSha256 !== VOCABULARY_SHA256) throw new TypeError('Unexpected l1-l04 vocabulary payload.');

    const itemIds = new Set<string>();
    let previousPage = 0;
    let previousRow = 0;
    const items = array(component.items, 'l1-l04 vocabulary items');
    if (items.length !== 42) throw new TypeError('The exact 42-row l1-l04 vocabulary sheet is required.');
    return Object.freeze(items.map((candidate, index) => {
        const item = record(candidate, `l1-l04 vocabulary row ${index + 1}`);
        const source = record(item.source, `l1-l04 vocabulary row ${index + 1} source`);
        const sourceQuestionId = exactText(source.itemId, `l1-l04 vocabulary row ${index + 1} itemId`);
        if (itemIds.has(sourceQuestionId)) throw new TypeError(`Duplicate l1-l04 vocabulary item ${sourceQuestionId}.`);
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
            throw new TypeError('The l1-l04 vocabulary rows must remain in exact source order.');
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

export function createLessonFourObjectDistanceModel(): ObjectDistanceBoardModel {
    assertExactSourceMembers();
    const rounds: readonly ObjectDistanceRound[] = Object.freeze([
        round(1, 'pen', 'This is my pen.', '話し手が自分のペンを示します。', 'The speaker shows their own pen.', 'speaker', 'これはわたしのペンです。'),
        round(2, 'book', "That is Ken's book.", '聞き手の近くにある、けんさんの本です。', "Ken's book is near the listener.", 'listener', 'それはけんさんのほんです。'),
        round(3, 'building-translation', 'What is that? (points to a building in the distance)', '建物は二人から遠いです。', 'The building is far from both people.', 'far', 'あれはなんですか。'),
        round(4, 'meat', 'Is this meat?', '話し手の近くにある物について聞きます。', 'The object is near the speaker.', 'speaker', 'これはにくですか。'),
        round(5, 'umbrella-mary', 'メアリー：___ はたけしさんのかさですか。', 'メアリーがかさを持っています。', 'Mary is holding the umbrella.', 'speaker', 'これはたけしさんのかさですか。'),
        round(6, 'umbrella-takeshi', 'たけし：いいえ、___ はみちこさんのかさです。', 'たけしから見ると、かさはメアリーの近くです。', "From Takeshi's viewpoint, the umbrella is near Mary.", 'listener', 'いいえ、それはみちこさんのかさです。'),
        round(7, 'wallet-takeshi', 'たけし：___ はメアリーさんのさいふですか。', 'たけしがさいふを持っています。', 'Takeshi is holding the wallet.', 'speaker', 'これはメアリーさんのさいふですか。'),
        round(8, 'bicycle', 'メアリー：___ はたけしさんのじてんしゃですか。', 'メアリーは遠くのじてんしゃを指しています。', 'Mary points to a bicycle in the distance.', 'far', 'あれはたけしさんのじてんしゃですか。'),
        round(9, 'building-dialogue', 'メアリー：___ はなんですか。', 'メアリーは遠くの建物を指しています。', 'Mary points to a building in the distance.', 'far', 'あれはなんですか。'),
    ]);
    const model: ObjectDistanceBoardModel = {
        id: 'activity:l1-l04-object-distance-board',
        kind: 'academy-object-distance-board',
        responseKind: 'object-distance-three-position-board',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(item => item.conceptId),
        prompt: {
            ja: '物と二人の位置を見て、話し手・聞き手・遠くの場所に分けましょう。',
            en: 'Place each exact source scenario near the speaker, near the listener, or far from both.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                grammar: {
                    sourceId: `moodle-payload:${MOODLE_GRAMMAR_SHA256}`,
                    payloadSha256: MOODLE_GRAMMAR_SHA256,
                    sourceTitle: 'Chapter 2-1 Grammar Exercise',
                    author: 'Rie Tsuruta-Barratt',
                    pages: [1, 2, 3, 4, 5, 6, 7],
                },
                answerKey: {
                    sourceId: `moodle-payload:${MOODLE_ANSWER_SHA256}`,
                    payloadSha256: MOODLE_ANSWER_SHA256,
                    sourceTitle: 'Chapter 2-2 これはなんですか answer',
                    page: 1,
                },
            },
            minna: {
                reference: 'Minna no Nihongo I, Lesson 2',
                relation: 'course-sequence-and-byte-identified-audio-only',
                audioMember: {
                    title: 'minna shokyu 1 005',
                    sourceId: `moodle-payload:${MINNA_AUDIO_SHA256}`,
                    payloadSha256: MINNA_AUDIO_SHA256,
                    archiveOrder: 3,
                    durationSeconds: 36.884917,
                },
                transcriptStatus: 'not-provided-do-not-invent',
            },
            genki: {
                sourceId: `japanese-genki-interactive:${GENKI_PAYLOAD_SHA256}:generateQuiz`,
                relativePath: 'lessons/lesson-2/workbook-2/index.html',
                payloadSha256: GENKI_PAYLOAD_SHA256,
                scriptSha256: GENKI_SCRIPT_SHA256,
                lineLocus: { start: 76, end: 123 },
                engine: 'Genki.generateQuiz',
                responseAdaptation: 'exact-prompts-answers-and-order-with-yomu-three-position-classification',
            },
        },
        payload: {
            teaching: [
                teaching(1, 'これ', 'speaker', '話し手の近く', 'near the speaker', 'これは かぎです。'),
                teaching(2, 'それ', 'listener', '聞き手の近く', 'near the listener', 'それは ノートです。'),
                teaching(3, 'あれ', 'far', '話し手と聞き手の両方から遠い', 'far from both people', 'あれは じしょです。'),
                teaching(4, 'これ／それ', 'viewpoint', '質問する人と答える人で見方が変わります。', 'The viewpoint changes between questioner and answerer.', 'Q: これは なんですか。 A: それは Noun です。'),
            ],
            positions: [
                { id: 'speaker', label: { ja: '話し手の近く', en: 'Near the speaker' } },
                { id: 'listener', label: { ja: '聞き手の近く', en: 'Near the listener' } },
                { id: 'far', label: { ja: '二人から遠い', en: 'Far from both' } },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: {
                    explanation: {
                        ja: '九つの場面を、話し手・聞き手・遠くの位置に正しく分けました。',
                        en: 'All nine source scenarios are in the correct speaker, listener, or distant position.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '物の位置と話す人の見方が合っていない場面があります。',
                        en: 'At least one scenario does not match the object’s position or the speaker’s viewpoint.',
                    },
                    repairPrompt: {
                        ja: 'だれが話しているかを確認して、違う場面だけ動かしましょう。',
                        en: 'Check who is speaking, then move only the mismatched scenarios.',
                    },
                    nearbyExample: {
                        ja: 'メアリーが持つかさは、メアリーには「これ」、たけしには「それ」です。',
                        en: 'An umbrella Mary holds is これ for Mary and それ for Takeshi.',
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
    contextJa: string,
    contextEn: string,
    correctPositionId: ObjectDistanceRound['correctPositionId'],
    answerSentence: string,
): ObjectDistanceRound {
    const pronoun = correctPositionId === 'speaker' ? 'これ' : correctPositionId === 'listener' ? 'それ' : 'あれ';
    return Object.freeze({
        id,
        sourceOrder,
        sourceQuestionId: `genki-2e:l1-l04:lesson-2-workbook-2:slot-${sourceOrder}`,
        sourcePrompt,
        context: { ja: contextJa, en: contextEn },
        correctPositionId,
        pronoun,
        answerSentence,
        conceptId: `concept:l1-l04:kosoado:${id}`,
        errorTag: `l1-l04-kosoado-${id}`,
    });
}

function teaching(
    sourceOrder: number,
    pronoun: string,
    position: 'speaker' | 'listener' | 'far' | 'viewpoint',
    ruleJa: string,
    ruleEn: string,
    example: string,
): ObjectDistanceBoardModel['payload']['teaching'][number] {
    return Object.freeze({ sourceOrder, pronoun, position, rule: { ja: ruleJa, en: ruleEn }, example });
}

function assertExactSourceMembers(): void {
    const root = record(lessonPackage, 'l1-l04 package');
    const identity = record(root.identity, 'l1-l04 identity');
    if (root.id !== PACKAGE_ID || identity.moduleId !== MODULE_ID) throw new TypeError('Unexpected l1-l04 package identity.');
    const members = array(record(root.sourceCoverage, 'l1-l04 source coverage').members, 'l1-l04 source members')
        .map((value, index) => record(value, `l1-l04 source member ${index}`));
    for (const [payloadSha256, title] of [
        [MOODLE_GRAMMAR_SHA256, 'Chapter 2-1 Grammar Exercise'],
        [MOODLE_ANSWER_SHA256, 'Chapter 2-2 これはなんですか answer'],
        [MINNA_AUDIO_SHA256, 'minna shokyu 1 005'],
    ] as const) {
        const matches = members.filter(member => member.payloadSha256 === payloadSha256);
        if (matches.length !== 1 || exactText(matches[0].title, `${payloadSha256} title`) !== title) {
            throw new TypeError(`Expected one l1-l04 source member for ${payloadSha256}.`);
        }
    }
    const activities = array(root.genkiInteractiveActivities, 'l1-l04 Genki activities')
        .map((value, index) => record(value, `l1-l04 Genki activity ${index}`));
    const match = activities.find(activity => activity.id === 'genki-2e:l1-l04:lesson-2-workbook-2');
    if (!match) throw new TypeError('Expected the mapped l1-l04 Genki workbook task.');
    const source = record(match.source, 'l1-l04 Genki source');
    const exactTask = record(match.exactTask, 'l1-l04 Genki task');
    const config = record(exactTask.config, 'l1-l04 Genki task config');
    const quizlet = exactText(config.quizlet, 'l1-l04 Genki quizlet');
    if (source.payloadSha256 !== GENKI_PAYLOAD_SHA256 || source.scriptSha256 !== GENKI_SCRIPT_SHA256
        || exactTask.engine !== 'Genki.generateQuiz' || exactTask.exerciseOrderPreserved !== true
        || !quizlet.includes('This is my pen.') || !quizlet.includes('That is Ken\'s book.')
        || !quizlet.includes('メアリー：{これ}') || !quizlet.includes('たけし：いいえ、{それ}')) {
        throw new TypeError('Unexpected l1-l04 Genki source task.');
    }
}

function sourceVocabularyComponent(): Readonly<Record<string, unknown>> {
    const root = record(lessonPackage, 'l1-l04 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l1-l04 identity').moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l1-l04 package identity.');
    }
    const matches = array(root.components, 'l1-l04 components').map((value, index) =>
        record(value, `l1-l04 component ${index}`)).filter(component => {
        if (component.type !== 'vocabulary') return false;
        const provenance = record(component.provenance, 'l1-l04 component provenance');
        return provenance.payloadSha256 === VOCABULARY_SHA256;
    });
    if (matches.length !== 1) throw new TypeError('Expected one exact l1-l04 source vocabulary component.');
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
