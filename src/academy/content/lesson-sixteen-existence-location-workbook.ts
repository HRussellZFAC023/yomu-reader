import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { LocalizedText } from '../domain/source-library';
import type { ExistenceLocationRound, ExistenceLocationWorkbookModel } from '../minigames/existence-location-workbook';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const MOODLE_ARCHIVE_SHA256 = 'ab7585b4d14d945535b90b6c64509e9c1b34caa96f0659b83b23920e893f46ba';
const MOODLE_GRAMMAR_SHA256 = 'b2143f1f2ce2469fe7e54d8f778d75956ae6c060bc44e2c39421bde470b8ac0b';
const GENKI_SHA256 = 'a4af27440a6e72bde55d011df350acd921199a0b558eb168ec46b380a3949e09';
const GENKI_SCRIPT_SHA256 = 'aad41fec9195385ef13a7e8280c6b2292c48d8857dfbcabd9c93c82fe968733a';
const GENKI_TASK_ID = 'genki-2e:l1-l16:lesson-4-workbook-1' as const;

export function createLessonSixteenExistenceLocationWorkbookModel(): ExistenceLocationWorkbookModel {
    const rounds = Object.freeze([
        classify(1, 'moodle-sea-fish', 'うみ／さかな', 'うみに さかなが います。', 'animate'),
        classify(2, 'moodle-fish-shop-fish', 'さかなや／さかな', 'さかなやに さかなが います。', 'animate'),
        classify(3, 'moodle-bookshop-cat-book', 'ほんや／ねこ の ほん', 'ほんやに ねこの ほんが あります。', 'inanimate'),
        classify(4, 'moodle-bookshop-cat', 'ほんや／ねこ', 'ほんやに ねこが います。', 'animate'),
        classify(5, 'moodle-garden-bicycle', 'にわ／じてんしゃ', 'にわに じてんしゃが あります。', 'inanimate'),
        classify(6, 'moodle-garden-child', 'にわ／こども', 'にわに こどもが います。', 'animate'),
        classify(7, 'moodle-school-receptionist', 'がっこう／うけつけ の ひと', 'がっこうに うけつけの ひとが います。', 'animate'),
        classify(8, 'moodle-school-reception', 'がっこう／うけつけ', 'がっこうに うけつけが あります。', 'inanimate'),
        typed(9, 1, 'genki-bus-stop', 'There is a bus stop over there.', 'あそこに バスていが あります。', ['あそこにバスていがあります', 'あそこにバス停があります']),
        typed(10, 4, 'genki-yamashita', 'There is Professor Yamashita over there.', 'あそこに やましたせんせいが います。', ['あそこにやましたせんせいがいます', 'あそこに山下先生がいます', 'あそこに山下せんせいがいます', 'あそこにやました先生がいます']),
    ] satisfies readonly ExistenceLocationRound[]);
    return Object.freeze({
        id: 'activity:l1-l16-existence-location-workbook', kind: 'academy-existence-location-workbook', responseKind: 'existence-classification-and-source-transfer', answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: Object.freeze(rounds.map(round => round.conceptId)),
        prompt: { ja: '先に場所・名詞・あります／いますの型を学び、Moodleの分類問題からGenkiの入力問題へ進みます。', en: 'Learn the place, noun, and existence-verb frame first, then move from Moodle classification to Genki input.' },
        provenance: {
            packageId: 'l1-l16', answerVisibility: 'after-attempt', sourceOrder: ['moodle', 'minna-mapping', 'genki'],
            moodle: { moduleId: 5881257, archiveSha256: MOODLE_ARCHIVE_SHA256, documents: [
                { payloadSha256: MOODLE_GRAMMAR_SHA256, member: 'Handouts from last week/Chapter 10-1 Grammar exceise.pdf', pages: '2' },
            ] },
            minna: { sourceId: 'japanese-minna:10-10', reference: 'Minna no Nihongo I, Lesson 10', relation: 'chronology-map-only', reason: 'The authorized curriculum crosswalk maps this class to Minna Lesson 10, but no Minna page or answer payload was supplied for this workbook. No Minna wording or answer is presented as a source item.' },
            genki: { taskId: GENKI_TASK_ID, payloadSha256: GENKI_SHA256, scriptSha256: GENKI_SCRIPT_SHA256, lineLocus: { start: 76, end: 141 }, engine: 'Genki.generateQuiz', sourceSlice: [1, 4] },
        },
        payload: {
            teaching: [
                teaching('moodle:5881257:b2143f1f:p2:pattern', 'Moodle - Chapter 10-1: Existence of people and things - page 2', 'Place に N が あります。', 'Use あります when N is a thing. Keep the place first and mark the thing with が.', 'Nが物なら「あります」を使います。場所を先に置き、物には「が」をつけます。', 'にわに じてんしゃが あります。'),
                teaching('moodle:5881257:b2143f1f:p2:pattern', 'Moodle - Chapter 10-1: Existence of people and things - page 2', 'Place に N が います。', 'Use います when N is a person or animal. The frame stays the same; only the noun class changes the verb.', 'Nが人・動物なら「います」を使います。型は同じで、名詞の種類だけが動詞を変えます。', 'うみに さかなが います。'),
                teaching('genki-2e:l1-l16:lesson-4-workbook-1:transfer', 'Genki I - Lesson 4 - workbook 1', 'Classify first, then write the whole source sentence.', 'The Genki transfer comes only after the Moodle frame. Decide whether the noun is living before you type the sentence.', 'Genkiの転移問題はMoodleの型のあとです。入力する前に、名詞が生き物かどうかを決めます。', 'あそこに バスていが あります。'),
            ], rounds, passScore: 1,
            feedback: {
                pass: { explanation: { ja: 'Moodleの8問を先に分け、Genkiの2問も入力できました。', en: 'You classified the eight Moodle items first and completed both Genki transfers.' } },
                lapse: { explanation: { ja: '名詞の種類か、あります・いますの選び方を直す問題があります。', en: 'At least one noun classification or existence verb needs repair.' }, repairPrompt: { ja: '表示された問題だけを直し、必要ならヒントを一つずつ開きましょう。', en: 'Repair only the visible items, opening one hint at a time if needed.' }, nearbyExample: { ja: 'へやに テーブルが あります。へやに ともだちが います。', en: 'There is a table in the room. There is a friend in the room.' } },
            },
        },
    } satisfies ExistenceLocationWorkbookModel);
}

export function createLessonSixteenExistenceLocationWorkbookBeat(): LessonActivityBeat {
    return Object.freeze({ id: 'existence-location-workbook', narrative: { ja: 'アーカーシュとジェニーが、場所カードと人・物カードを分けて文にします。', en: 'Aakash and Jenny sort place cards with people and things before making sentences.' }, activity: createLessonSixteenExistenceLocationWorkbookModel() });
}

function classify(sourceOrder: number, id: string, sourcePrompt: string, answerExpression: string, nounClass: 'animate' | 'inanimate'): ExistenceLocationRound {
    return Object.freeze({ id, sourceOrder, sourceQuestionId: `moodle:5881257:b2143f1f:p2:q3:${sourceOrder}`, sourceLabel: 'Moodle - Chapter 10-1: Existence of people and things - page 2', sourcePrompt, answerExpression, mode: 'classify', nounClass, verb: nounClass === 'animate' ? 'います' : 'あります', conceptId: `concept:l1-l16:existence:${sourceOrder}`, errorTag: `l1-l16-existence-${sourceOrder}`, hint: hints(nounClass) });
}

function typed(sourceOrder: number, slot: 1 | 4, id: string, sourcePrompt: string, answerExpression: string, acceptedAnswers: readonly string[]): ExistenceLocationRound {
    return Object.freeze({ id, sourceOrder, sourceQuestionId: `${GENKI_TASK_ID}:slot-${slot}`, sourceLabel: 'Genki I - Lesson 4 - workbook 1', sourcePrompt, answerExpression, mode: 'typed', acceptedAnswers, conceptId: `concept:l1-l16:existence:${sourceOrder}`, errorTag: `l1-l16-existence-${sourceOrder}`, hint: hints(slot === 4 ? 'animate' : 'inanimate') });
}

function teaching(sourceQuestionId: string, sourceLabel: string, pattern: string, en: string, ja: string, example: string) { return Object.freeze({ sourceQuestionId, sourceLabel, pattern, explanation: { en, ja }, example }); }
function hints(nounClass: 'animate' | 'inanimate'): readonly [LocalizedText, LocalizedText, LocalizedText] {
    const animate = nounClass === 'animate';
    return Object.freeze([
        { en: 'Identify the noun after the place.', ja: '場所の後ろの名詞を見ます。' },
        { en: animate ? 'It is a person or animal.' : 'It is a thing, not a person or animal.', ja: animate ? '人か動物です。' : '人・動物ではなく、物です。' },
        { en: animate ? 'Use います.' : 'Use あります.', ja: animate ? '「います」を使います。' : '「あります」を使います。' },
    ] as [LocalizedText, LocalizedText, LocalizedText]);
}
