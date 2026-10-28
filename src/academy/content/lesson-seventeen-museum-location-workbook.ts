import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { LocalizedText } from '../domain/source-library';
import type { MuseumLocationRound, MuseumLocationWorkbookModel } from '../minigames/museum-location-workbook';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const MOODLE_ARCHIVE_SHA256 = '61c9d1b3633f418f55fbb047b2ea941eed7f4a2245ea33a45ef8945656150815';
const MOODLE_TOPIC_LOCATION_SHA256 = '321fd611a707f2820764a563662b3b7b2ad70d6122ebf48e2dbea8951b4486a9';
const MOODLE_POSITION_SHA256 = 'b7ab822e95efc2f31a35f11725fb8e48d90348246433804434b3f2b3f200e620';
const MOODLE_MUSEUM_READING_SHA256 = '2eb33ab6da711f25198843922600959965fbb7aee5c279f06598ffe109687e09';
const GENKI_SHA256 = '1bc8b462c5c75728e9e891c35f71e9df13e05c7917b81e5aa4c07496582d9686';
const GENKI_SCRIPT_SHA256 = '4165f6dcecba03b99b8f7124f35d863fa6232585949619633905cc18a93ccd89';
const GENKI_TASK_ID = 'genki-2e:l1-l17:lesson-4-workbook-2' as const;

export function createLessonSeventeenMuseumLocationWorkbookModel(): MuseumLocationWorkbookModel {
    const rounds = Object.freeze([
        frame(1, 'moodle-chair-cat', 'いす／ねこ', 'いすの したに ねこが います。', 'した', 'います'),
        frame(2, 'moodle-shop-car', 'みせ／くるま', 'みせの まえに くるまが あります。', 'まえ', 'あります'),
        frame(3, 'moodle-tree-boy', 'き／おとこのこ', 'きの うえに おとこのこが います。', 'うえ', 'います'),
        frame(4, 'moodle-fridge-things', 'れいぞうこ／いろいろな もの', 'れいぞうこの なかに いろいろな ものが あります。', 'なか', 'あります'),
        reply(5, 'moodle-bed-under', 'ベッドの した／なに', 'くつが あります。'),
        reply(6, 'moodle-room-inside', 'へやの なか／だれ', 'おんなのこが います。'),
        reply(7, 'moodle-window-right', 'まどの みぎ／なに', 'ほんだなが あります。'),
        reply(8, 'moodle-garden-outside', 'にわの そと／だれ', 'おとこのひとが います。'),
        typed(9, 1, 'genki-dictionary-desk', 'The dictionary is on top of the desk.', 'じしょは つくえの うえです。', [
            'じしょはつくえのうえです', '辞書はつくえの上です', '辞書はつくえのうえです', 'じしょはつくえの上です',
        ]),
        typed(10, 6, 'genki-japanese-book', '日本語の本はどこですか。', 'しんぶんの したです。', [
            'しんぶんのしたです', '新聞の下です', 'にほんごのほんはしんぶんのしたです', '日本語の本は新聞の下です',
        ]),
    ] satisfies readonly MuseumLocationRound[]);

    return Object.freeze({
        id: 'activity:l1-l17-museum-location-workbook',
        kind: 'academy-museum-location-workbook',
        responseKind: 'position-frame-and-source-transfer',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: Object.freeze(rounds.map(round => round.conceptId)),
        prompt: {
            ja: 'Moodleの位置表現を先に型ごとに確認し、元の問題、Minnaの時系列対応、Genkiの転移の順に取り組みます。',
            en: 'Learn the Moodle position frames first, then work through the original prompts, the Minna chronology map, and Genki transfer.',
        },
        provenance: {
            packageId: 'l1-l17',
            answerVisibility: 'after-attempt',
            sourceOrder: ['moodle', 'minna-mapping', 'genki'],
            moodle: {
                moduleId: 5489600,
                archiveSha256: MOODLE_ARCHIVE_SHA256,
                documents: [
                    { payloadSha256: MOODLE_TOPIC_LOCATION_SHA256, member: 'Handouts/Chapter 10-2_〜は Placeに あります_います_ありますか_いますかGrammar Exercise.pdf', pages: '1' },
                    { payloadSha256: MOODLE_POSITION_SHA256, member: 'Handouts/New Chapter 10-2_positionに あります_いますGrammar Exercise.pdf', pages: '1, 3' },
                    { payloadSha256: MOODLE_MUSEUM_READING_SHA256, member: 'Homework/HW Chapter 10 Reading practice「美術館」.pdf', pages: '2' },
                ],
                sourceVisuals: [
                    visual('position-picture-strip', 'prompt-image', [
                        'moodle:5489600:b7ab822e:p1:q1:1', 'moodle:5489600:b7ab822e:p1:q1:2',
                        'moodle:5489600:b7ab822e:p1:q1:3', 'moodle:5489600:b7ab822e:p1:q1:4',
                    ], '/academy/content/lessons/l1-l17/moodle-position-picture-strip.png', 'a5fc8566a9b30ff16094e822a085f3d46bd0f16d02de3a43d53eb752523aeb05', MOODLE_POSITION_SHA256, 'Handouts/New Chapter 10-2_positionに あります_いますGrammar Exercise.pdf', 1, { x: 310, y: 880, width: 780, height: 210 }, { ja: '元の位置表現ワークシートから、番号付きの四つの線画。', en: 'Four numbered line drawings from the original position worksheet.' }, { ja: 'Moodleの位置表現ワークシート、1ページ目の切り抜き。', en: 'Cropped from the Moodle position worksheet, page 1.' }),
                    visual('position-room-garden', 'prompt-image', [
                        'moodle:5489600:b7ab822e:p3:q4:1', 'moodle:5489600:b7ab822e:p3:q4:2',
                        'moodle:5489600:b7ab822e:p3:q4:3', 'moodle:5489600:b7ab822e:p3:q4:4',
                    ], '/academy/content/lessons/l1-l17/moodle-position-room-garden.png', '36b9fb8bf7eb1a3dfefe728169c4545d85db05c36dcd9f36b648591b30d28795', MOODLE_POSITION_SHA256, 'Handouts/New Chapter 10-2_positionに あります_いますGrammar Exercise.pdf', 3, { x: 150, y: 373, width: 815, height: 430 }, { ja: '元の位置表現ワークシートから、部屋と庭の線画。', en: 'A room-and-garden line drawing from the original position worksheet.' }, { ja: 'Moodleの位置表現ワークシート、3ページ目の切り抜き。', en: 'Cropped from the Moodle position worksheet, page 3.' }),
                    visual('museum-object-panels', 'museum-context', [], '/academy/content/lessons/l1-l17/moodle-museum-object-panels.png', '72c07bbc90acc52bdaa07a410525d3cc440534cb61581449769ed12fb1106d3a', MOODLE_MUSEUM_READING_SHA256, 'Homework/HW Chapter 10 Reading practice「美術館」.pdf', 2, { x: 120, y: 920, width: 950, height: 270 }, { ja: '元の美術館読解プリントから、風景と静物の二つの線画。', en: 'Landscape and still-life line drawings from the original museum reading sheet.' }, { ja: 'Moodleの美術館読解プリント、2ページ目の人物なしの切り抜き。', en: 'People-free crop from the Moodle museum reading sheet, page 2.' }),
                ],
            },
            minna: {
                sourceId: 'japanese-minna:10-10',
                reference: 'Minna no Nihongo I, Lesson 10',
                relation: 'chronology-map-only',
                reason: 'The authorized curriculum crosswalk maps this class to Minna Lesson 10, but no Minna page or answer payload was supplied for this workbook. No Minna wording or answer is presented as a source item.',
            },
            genki: {
                taskId: GENKI_TASK_ID,
                payloadSha256: GENKI_SHA256,
                scriptSha256: GENKI_SCRIPT_SHA256,
                lineLocus: { start: 76, end: 153 },
                engine: 'Genki.generateQuiz',
                sourceSlice: [1, 6],
            },
        },
        payload: {
            teaching: [
                teaching('moodle:5489600:321fd611:p1:pattern', 'Moodle - Chapter 10-2: topic and place - page 1', 'N は Place に あります／います。', 'Use は when the known thing or person is the topic, then state where it is. Choose あります for a thing and います for a person or animal.', '分かっている物・人を「は」で話題にしてから、場所を言います。物は「あります」、人・動物は「います」を使います。', 'とうきょうディズニーランドは ちばけんに あります。'),
                teaching('moodle:5489600:b7ab822e:p1:pattern', 'Moodle - Chapter 10-2: positions - page 1', 'N1 の Position に N2 が あります／います。', 'For a position prompt, read the anchor first, then the position, then decide whether the located noun is living.', '位置の問題では、基準の名詞、位置、そこにある名詞の順に読み、最後に生き物かどうかを決めます。', 'いすの うえに ねこが います。'),
                teaching('moodle:5489600:b7ab822e:p3:q4', 'Moodle - Chapter 10-2: positions - page 3', 'Position に なに／だれ が ありますか。', 'The question word tells you whether the requested answer is a thing or a person. Keep the position unchanged when you answer.', '「なに」か「だれ」で、答えが物か人かを確認します。答えるときも位置は変えません。', 'テーブルの うえに なにが ありますか。かばんが あります。'),
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: { ja: 'Moodleの8問を位置の型で完成し、Genkiの2問にも転移できました。', en: 'You completed all eight Moodle location prompts and transferred the pattern to both Genki items.' } },
                lapse: {
                    explanation: { ja: '位置、あります／います、または答えの形を直す問題があります。', en: 'At least one position, existence verb, or reply form needs repair.' },
                    repairPrompt: { ja: '表示された問題だけを直し、必要ならヒントを一つずつ開きましょう。', en: 'Repair only the visible items, opening one hint at a time if needed.' },
                    nearbyExample: { ja: 'へやの なかに ベッドが あります。にわの そとに おとこのひとが います。', en: 'There is a bed in the room. There is a man outside the garden.' },
                },
            },
        },
    } satisfies MuseumLocationWorkbookModel);
}

export function createLessonSeventeenMuseumLocationWorkbookBeat(): LessonActivityBeat {
    return Object.freeze({
        id: 'museum-location-workbook',
        narrative: { ja: 'ミカとトムが展示室の位置カードを読み、元の場所問題を一つずつ解きます。', en: 'Mika and Tom read the exhibit-location cards and solve the original place prompts one at a time.' },
        activity: createLessonSeventeenMuseumLocationWorkbookModel(),
    });
}

function frame(sourceOrder: number, id: string, sourcePrompt: string, answerExpression: string, position: 'うえ' | 'した' | 'まえ' | 'なか', verb: 'あります' | 'います'): MuseumLocationRound {
    return Object.freeze({
        id, sourceOrder,
        sourceQuestionId: `moodle:5489600:b7ab822e:p1:q1:${sourceOrder}`,
        sourceLabel: 'Moodle - Chapter 10-2: positions - page 1',
        sourcePrompt, answerExpression, mode: 'frame-choice', position, verb,
        conceptId: `concept:l1-l17:location:${sourceOrder}`, errorTag: `l1-l17-location-${sourceOrder}`,
        hint: positionHints(position, verb),
    });
}

function reply(sourceOrder: number, id: string, sourcePrompt: string, answerExpression: string): MuseumLocationRound {
    return Object.freeze({
        id, sourceOrder,
        sourceQuestionId: `moodle:5489600:b7ab822e:p3:q4:${sourceOrder - 4}`,
        sourceLabel: 'Moodle - Chapter 10-2: positions - page 3',
        sourcePrompt, answerExpression, mode: 'reply-choice',
        conceptId: `concept:l1-l17:location:${sourceOrder}`, errorTag: `l1-l17-location-${sourceOrder}`,
        hint: replyHints(sourcePrompt),
    });
}

function typed(sourceOrder: number, slot: 1 | 6, id: string, sourcePrompt: string, answerExpression: string, acceptedAnswers: readonly string[]): MuseumLocationRound {
    return Object.freeze({
        id, sourceOrder,
        sourceQuestionId: `${GENKI_TASK_ID}:slot-${slot}`,
        sourceLabel: 'Genki I - Lesson 4 - workbook 2',
        sourcePrompt, answerExpression, acceptedAnswers, mode: 'typed',
        conceptId: `concept:l1-l17:location:${sourceOrder}`, errorTag: `l1-l17-location-${sourceOrder}`,
        hint: positionHints(slot === 1 ? 'うえ' : 'した', 'あります'),
    });
}

function teaching(sourceQuestionId: string, sourceLabel: string, pattern: string, en: string, ja: string, example: string) {
    return Object.freeze({ sourceQuestionId, sourceLabel, pattern, explanation: { en, ja }, example });
}

function visual(
    id: 'position-picture-strip' | 'position-room-garden' | 'museum-object-panels',
    role: 'prompt-image' | 'museum-context',
    sourceQuestionIds: readonly string[],
    url: string,
    sha256: string,
    payloadSha256: string,
    member: string,
    page: 1 | 2 | 3,
    crop: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
    alt: LocalizedText,
    caption: LocalizedText,
) {
    return Object.freeze({
        id, role, sourceQuestionIds: Object.freeze(sourceQuestionIds), url, sha256,
        source: { payloadSha256, member, page, crop: { ...crop, rasterDpi: 144 as const } },
        answerKeyVisible: false as const, alt, caption,
    });
}

function positionHints(position: 'うえ' | 'した' | 'まえ' | 'なか', verb: 'あります' | 'います'): readonly [LocalizedText, LocalizedText, LocalizedText] {
    const positionEnglish = { うえ: 'on top of', した: 'under', まえ: 'in front of', なか: 'inside' }[position];
    return Object.freeze([
        { en: 'Read the anchor noun before the slash.', ja: 'スラッシュの前の基準の名詞を読みます。' },
        { en: `The picture places the target ${positionEnglish} that anchor.`, ja: `絵では、対象は基準の「${position}」にあります。` },
        { en: verb === 'います' ? 'The target is living, so use います.' : 'The target is a thing, so use あります.', ja: verb === 'います' ? '対象は生き物なので「います」を使います。' : '対象は物なので「あります」を使います。' },
    ] as [LocalizedText, LocalizedText, LocalizedText]);
}

function replyHints(sourcePrompt: string): readonly [LocalizedText, LocalizedText, LocalizedText] {
    const asksWho = sourcePrompt.endsWith('だれ');
    return Object.freeze([
        { en: 'Keep the location from the prompt in mind.', ja: '問題の位置を確認します。' },
        { en: asksWho ? 'だれ asks for a person.' : 'なに asks for a thing.', ja: asksWho ? '「だれ」は人をたずねます。' : '「なに」は物をたずねます。' },
        { en: asksWho ? 'Use the person answer ending in います.' : 'Use the thing answer ending in あります.', ja: asksWho ? '人の答えは「います」で終わります。' : '物の答えは「あります」で終わります。' },
    ] as [LocalizedText, LocalizedText, LocalizedText]);
}
