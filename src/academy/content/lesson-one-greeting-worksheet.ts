import lessonPackage from '../../../public/academy/content/lessons/002-l1-l01.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { GreetingWorksheetModel } from '../minigames/greeting-worksheet';
import type { SourceVocabularySheetModel } from '../minigames/source-vocabulary-sheet';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l1-l01';
const MODULE_ID = 5777762;
const VOCABULARY_SHA256 = 'c6df5dd2979a7ce376ecfb5d37c813813d99819d825f17a10c2ff2e5be79220e';
const HANDOUT_SHA256 = '42776eb5736dc44caff1809419e41eb189998d3dda04401262cde705676c3fe9';
const GREETINGS_SHA256 = '843ee30241b15d04c7b1990e8c0f76640379e81be778fbb4bfdf082565e08d6c';
const HOMEWORK_SHA256 = '0e047a101c7607ffc74a0b64e5b1a1ccafc6227bf0e99c7698017ac727c1e66b';

export function createLessonOneSourceVocabularyActivities(): readonly SourceVocabularySheetModel[] {
    const component = vocabularyComponent();
    const provenance = record(component.provenance, 'l1-l01 vocabulary provenance');
    const sourceId = exact(provenance.sourceId, 'l1-l01 vocabulary source id');
    const sourceTitle = exact(provenance.title, 'l1-l01 vocabulary title');
    if (digest(provenance.payloadSha256, 'l1-l01 vocabulary hash') !== VOCABULARY_SHA256) {
        throw new TypeError('Unexpected l1-l01 vocabulary payload.');
    }
    const items = array(component.items, 'l1-l01 vocabulary items');
    if (items.length !== 27) throw new TypeError('The complete 27-row l1-l01 vocabulary sheet is required.');
    let previousPage = 0;
    let previousRow = 0;
    return Object.freeze(items.map((value, index) => {
        const item = record(value, `l1-l01 vocabulary row ${index + 1}`);
        const source = record(item.source, `l1-l01 vocabulary source ${index + 1}`);
        const locus = record(source.locus, `l1-l01 vocabulary locus ${index + 1}`);
        const page = integer(locus.page, `l1-l01 vocabulary page ${index + 1}`);
        const row = integer(locus.row, `l1-l01 vocabulary row ${index + 1}`);
        if (page < previousPage || (page === previousPage && row <= previousRow)) {
            throw new TypeError('The l1-l01 vocabulary sheet must remain in exact source order.');
        }
        previousPage = page;
        previousRow = row;
        if (digest(source.payloadSha256, 'l1-l01 vocabulary row hash') !== VOCABULARY_SHA256
            || exact(source.title, 'l1-l01 vocabulary row title') !== sourceTitle
            || source.answerVisibility !== 'after-attempt') {
            throw new TypeError('L1-l01 vocabulary source identity changed.');
        }
        const exactFields = record(source.exact, `l1-l01 vocabulary exact ${index + 1}`);
        const fieldProvenance = record(source.fieldProvenance, `l1-l01 vocabulary provenance ${index + 1}`);
        return Object.freeze({
            id: `authored:${PACKAGE_ID}/sensei-chapter-1-1-vocabulary:p${page}:r${row}`,
            kind: 'academy-source-vocabulary-sheet' as const,
            sourceQuestionId: exact(source.itemId, `l1-l01 vocabulary source id ${index + 1}`),
            conceptIds: [`concept:${PACKAGE_ID}:source-vocabulary:p${page}:r${row}`],
            responseKind: 'source-vocabulary-recall' as const,
            prompt: {
                ja: '先生の行を見て、意味を思い出してから確認しましょう。',
                en: 'Read the teacher row, recall its meaning, then check it.',
            },
            answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
            provenance: {
                packageId: PACKAGE_ID,
                componentId: 'sensei-chapter-1-1-vocabulary',
                sourceId,
                sourceQuestionId: exact(source.itemId, `l1-l01 vocabulary item ${index + 1}`),
                payloadSha256: VOCABULARY_SHA256,
                sourceTitle,
                locus: { page, row },
            },
            payload: {
                exact: {
                    words: exact(exactFields.words, `l1-l01 exact words ${index + 1}`),
                    pronunciation: nullable(exactFields.pronunciation, `l1-l01 exact pronunciation ${index + 1}`),
                    meaning: nullable(exactFields.meaning, `l1-l01 exact meaning ${index + 1}`),
                },
                support: {
                    words: exact(item.ja, `l1-l01 support words ${index + 1}`),
                    reading: exact(item.reading, `l1-l01 support reading ${index + 1}`),
                    meaning: exact(item.en, `l1-l01 support meaning ${index + 1}`),
                },
                fieldProvenance: {
                    words: exact(fieldProvenance.words, `l1-l01 words provenance ${index + 1}`),
                    reading: exact(fieldProvenance.reading, `l1-l01 reading provenance ${index + 1}`),
                    meaning: exact(fieldProvenance.meaning, `l1-l01 meaning provenance ${index + 1}`),
                },
            },
        } satisfies SourceVocabularySheetModel);
    }));
}

export function createLessonOneGreetingWorksheetBeat(): LessonActivityBeat {
    const activity: GreetingWorksheetModel = {
        id: 'activity:l1-l01-moodle-greeting-worksheet',
        kind: 'academy-greeting-worksheet',
        sourceQuestionId: `moodle-worksheet:${HOMEWORK_SHA256}:p1`,
        conceptIds: [
            'concept:l1-l01:greeting-morning',
            'concept:l1-l01:greeting-daytime',
            'concept:l1-l01:greeting-evening',
            'concept:l1-l01:greeting-before-meal',
            'concept:l1-l01:greeting-after-meal',
        ],
        responseKind: 'source-image-context-choice',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        prompt: {
            ja: '先生の六つの場面に、習ったあいさつを選びましょう。',
            en: 'Choose the taught expression for each of the teacher’s six scenes.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            moodleModuleId: MODULE_ID,
            handout: {
                sourceId: `moodle-payload:${HANDOUT_SHA256}`,
                payloadSha256: HANDOUT_SHA256,
                title: 'Chapter 1 self introduction Grammar and Exercise',
                locus: { page: 1 },
            },
            greetingsReference: {
                sourceId: `moodle-payload:${GREETINGS_SHA256}`,
                payloadSha256: GREETINGS_SHA256,
                title: 'Chapter 1 Greetings',
                locus: { page: 2 },
            },
            vocabulary: {
                sourceId: `moodle-vocabulary:${MODULE_ID}:${VOCABULARY_SHA256}`,
                payloadSha256: VOCABULARY_SHA256,
                title: 'Chapter 1-1 Vocabulary Sheet',
                loci: [{ page: 1, row: 8 }, { page: 1, row: 10 }, { page: 2, row: 20 }, { page: 2, row: 21 }],
            },
            homework: {
                sourceId: `moodle-payload:${HOMEWORK_SHA256}`,
                payloadSha256: HOMEWORK_SHA256,
                title: 'HW Chapter 1-1 Greeting',
                locus: { page: 1, prompts: [1, 2, 3, 4, 5, 6] },
                imageUrl: '/academy/content/lessons/l1-l01/moodle-hw-chapter-1-1-greeting-page-1.png',
                imageSha256: '26fc7617addb2af8f85678b0e5dacf30518eeadfb030dbbb3d27dd2f54948100',
                sourceAnswerKeyStatus: 'not-present-in-digitized-corpus',
                gradingKey: 'yomu-contextual-key-derived-from-taught-source-expressions',
            },
            answerVisibility: 'after-attempt',
        },
        payload: {
            sourceInstruction: 'What are these people saying? Write appropriate expressions for each situation in Japanese with Romaji. *if you want to try to write them in Hiragana, please do so ☺',
            teaching: [
                {
                    sourceOrder: 1,
                    title: { ja: '基本文', en: 'Basic sentence' },
                    pattern: 'Noun 1 は Noun 2 です。',
                    example: 'わたし は マイク・ミラー です。',
                    explanation: {
                        ja: '先生の例は、話題のあとに「は」を置き、何・だれかを「です」で言います。',
                        en: 'The teacher’s example puts は after the topic, then states what or who it is with です.',
                    },
                },
                {
                    sourceOrder: 2,
                    title: { ja: '会話の例', en: 'Conversation example' },
                    pattern: 'こんにちは。（わたし は）マイク・ミラー です。',
                    example: 'B さん はじめまして。どうぞ よろしく おねがいします。',
                    explanation: {
                        ja: '先生は、会話では話題の「わたし」を省くことが多いと説明しています。',
                        en: 'The handout explains that conversational Japanese often omits an already obvious わたし.',
                    },
                },
            ],
            sourceExpressions: [
                { optionId: 'ohayou', sourceOrder: 1, expression: 'おはよう', meaning: 'Good morning.' },
                { optionId: 'ohayou-gozaimasu', sourceOrder: 2, expression: 'おはようございます', meaning: 'Good morning. (polite)' },
                { optionId: 'konnichiwa', sourceOrder: 3, expression: 'こんにちは', meaning: 'Hello/Good afternoon.' },
                { optionId: 'konbanwa', sourceOrder: 4, expression: 'こんばんは', meaning: 'Good evening.' },
                { optionId: 'itadakimasu', sourceOrder: 5, expression: 'いただきます', meaning: 'Thank you for the meal. (before eating)' },
                { optionId: 'gochisousama', sourceOrder: 6, expression: 'ごちそうさま', meaning: 'Thank you for the meal. (after eating)' },
            ],
            options: [
                { id: 'ohayou', label: 'おはよう' },
                { id: 'ohayou-gozaimasu', label: 'おはようございます' },
                { id: 'konnichiwa', label: 'こんにちは' },
                { id: 'konbanwa', label: 'こんばんは' },
                { id: 'itadakimasu', label: 'いただきます' },
                { id: 'gochisousama', label: 'ごちそうさま' },
            ],
            prompts: [
                prompt(1, 'morning-school', 'A morning greeting outside the school.', '学校の前の朝のあいさつ。', ['ohayou', 'ohayou-gozaimasu'], 'concept:l1-l01:greeting-morning', 'おはよう'),
                prompt(2, 'daytime-friends', 'A daytime greeting between two people.', '二人が昼に会ったときのあいさつ。', ['konnichiwa'], 'concept:l1-l01:greeting-daytime', 'こんにちは'),
                prompt(3, 'evening-friends', 'An evening greeting, with the moon behind them.', '月が見える夕方のあいさつ。', ['konbanwa'], 'concept:l1-l01:greeting-evening', 'こんばんは'),
                prompt(4, 'restaurant-table', 'A diner begins a meal at a restaurant table.', 'レストランで食事を始める場面。', ['itadakimasu'], 'concept:l1-l01:greeting-before-meal', 'いただきます'),
                prompt(5, 'meal-before', 'A diner brings their hands together before eating.', '食べる前に手を合わせる場面。', ['itadakimasu'], 'concept:l1-l01:greeting-before-meal', 'いただきます'),
                prompt(6, 'meal-after', 'A diner has finished; the plate is empty.', '食べ終わり、お皿が空の場面。', ['gochisousama'], 'concept:l1-l01:greeting-after-meal', 'ごちそうさま'),
            ],
            passScore: 1,
            feedback: {
                pass: {
                    explanation: {
                        ja: '六つの場面に、習ったあいさつをすべて選べました。',
                        en: 'You chose a taught greeting for all six scenes.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '場面とあいさつが合わないところがあります。',
                        en: 'At least one scene and expression do not yet match.',
                    },
                    repairPrompt: {
                        ja: '朝・昼・夕方と、食べる前・後を順に見て、先生の単語シートを確認しましょう。',
                        en: 'Check morning, daytime, evening, before eating, and after eating against the teacher vocabulary sheet.',
                    },
                    nearbyExample: {
                        ja: 'おはよう。こんにちは。こんばんは。いただきます。ごちそうさま。',
                        en: 'Good morning. Hello. Good evening. Before eating. After eating.',
                    },
                },
            },
        },
    };
    return Object.freeze({
        id: 'moodle-greeting-worksheet',
        narrative: {
            ja: 'りえ先生が、最初の宿題をひらきます。絵の場面を見て、教室で習ったあいさつを選びます。',
            en: 'Rie opens the first homework sheet. Look at each pictured moment and choose the greeting taught in class.',
        },
        activity: Object.freeze(activity),
    });
}

function prompt(
    sourceOrder: number,
    id: string,
    en: string,
    ja: string,
    acceptedOptionIds: readonly string[],
    conceptId: string,
    expression: string,
) {
    return {
        id,
        sourceQuestionId: `moodle-worksheet:${HOMEWORK_SHA256}:p1:prompt-${sourceOrder}`,
        sourceOrder,
        imageDescription: { en, ja },
        acceptedOptionIds,
        conceptId,
        errorTag: `l1-l01-greeting-${id}`,
        reviewTarget: { id: `review:l1-l01:greeting:${id}`, conceptId, expression, meanings: [en] },
    };
}

function vocabularyComponent(): Readonly<Record<string, unknown>> {
    const root = record(lessonPackage, 'l1-l01 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l1-l01 identity').moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l1-l01 package.');
    }
    const matches = array(root.components, 'l1-l01 components').map((value, index) => record(value, `l1-l01 component ${index}`))
        .filter(component => record(component.provenance, 'l1-l01 component provenance').payloadSha256 === VOCABULARY_SHA256);
    if (matches.length !== 1) throw new TypeError('Expected exactly one l1-l01 source vocabulary component.');
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

function exact(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be nonempty text.`);
    return value;
}

function nullable(value: unknown, label: string): string | null { return value === null ? null : exact(value, label); }
function integer(value: unknown, label: string): number {
    if (!Number.isInteger(value) || Number(value) < 1) throw new TypeError(`${label} must be a positive integer.`);
    return Number(value);
}
function digest(value: unknown, label: string): string {
    const result = exact(value, label);
    if (!/^[a-f0-9]{64}$/u.test(result)) throw new TypeError(`${label} must be a SHA-256 digest.`);
    return result;
}
