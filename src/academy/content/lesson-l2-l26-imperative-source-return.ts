import lessonPackage from '../../../public/academy/content/lessons/053-l2-l26.json';
import type { ChoiceActivityModel, ChoiceOption } from '../activities/choice';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { DragSortModel, SequenceModel, TypedResponseModel } from '../minigames/activity-kit';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l2-l26';
const PACKAGE_ORDER = 53;
const MODULE_ID = 8121288;
const ARCHIVE_ID = 'archive-000082';
const ARCHIVE_SHA256 = 'e1dd259116662e0d5abb0952f4aa55a6a35ddbddf34e6c0818931863ca1400f2';
const FORM_SHA256 = '91c46375a122493ae872d162e4ac3a6dd40904c41e0b122a2260325ce38a6d35';
const EXERCISE_SHA256 = 'f8bb529db82886b4b7c0359383fb371e810141971bbfe5a2077007783a31b12a';
const VOCABULARY_SHA256 = 'd12a86de07bba4dbeadca54778692a2d70392a04b26fe356c454986862b77484';
const HOMEWORK_SHA256 = '8235ec47d40dc25274690fa77715763ad8958b59c3e5a799f19ffdd71e2896ed';
const AUDIO_PAYLOADS = Object.freeze([
    'eedd24d38b003285ef130817c17447a432fbaa3742581b807ffb5b99e71a67b1',
    '2ba525fa9a149066591cb6d3bca67f2f468100754300639eef6e63d45205210a',
    '8dd885949171d5bacd02358ee9027344bb4a56da3311f94b4ae44e3ca5b3e73c',
    'ff4d251761050f50b3b5ba71b9a820d8b1164baf877a9c10b52a0222ebf45a51',
    '41704b17b935bca4a0385d0e0fed8428a4e5fadca71f7825b1a0b9e24b422610',
]);

export const L2_L26_SOURCE_PAGES = Object.freeze([
    sourcePage(FORM_SHA256, 'Chapter 33 Imperative and Prohibitive form', 1, 'moodle-chapter-33-imperative-prohibitive-form-page-1.png', '7c2c33998993a784d450227f725628221f100676f6d9cbe6831ea7a938f33e82'),
    sourcePage(FORM_SHA256, 'Chapter 33 Imperative and Prohibitive form', 2, 'moodle-chapter-33-imperative-prohibitive-form-page-2.png', '31df29c05a1c94046679e37be19363804fee6e7fbc735ad4bf18a95b86340c55'),
    sourcePage(EXERCISE_SHA256, 'Chapter 33-1 Imperative and Prohibitive form exercise', 1, 'moodle-chapter-33-1-imperative-prohibitive-exercise-page-1.png', 'a2d891e1b1ba260b4dbfab81b9bfcfbadb91bb2393cf3cc3c384f2b66d0d00ea'),
    sourcePage(EXERCISE_SHA256, 'Chapter 33-1 Imperative and Prohibitive form exercise', 2, 'moodle-chapter-33-1-imperative-prohibitive-exercise-page-2.png', 'b43c34520d8cd42c6cc3977e00e1b58fe6074d0a1c442ebd7ac433efc5efcc35'),
    sourcePage(EXERCISE_SHA256, 'Chapter 33-1 Imperative and Prohibitive form exercise', 3, 'moodle-chapter-33-1-imperative-prohibitive-exercise-page-3.png', 'a24f7b1af90662b8729faead1fbe58de54b6181824b57dccd5d62a0db1ef5c0e'),
    sourcePage(VOCABULARY_SHA256, 'Chapter 33-1 Vocabulary Sheet', 1, 'moodle-chapter-33-1-vocabulary-page-1.png', '34aeba35694313a7bc5b95243ad8be4e0ff0dbbadb07da40e12a6ace4d7f9d10'),
    sourcePage(VOCABULARY_SHA256, 'Chapter 33-1 Vocabulary Sheet', 2, 'moodle-chapter-33-1-vocabulary-page-2.png', '7c1aab77d4dc273b02cc485e4f7e35d8d389642a65fdad5c89baaa767acfbda7'),
    sourcePage(HOMEWORK_SHA256, 'HW_Chapter 33 Creating Imperative and Prohibitive form', 1, 'moodle-chapter-33-imperative-prohibitive-homework-page-1.png', '55e114aa8c1c7ba91a389a2f59386f21b4334f2c5418ed8a3d01240c5dfa772f'),
    sourcePage(HOMEWORK_SHA256, 'HW_Chapter 33 Creating Imperative and Prohibitive form', 2, 'moodle-chapter-33-imperative-prohibitive-homework-page-2.png', 'fbf5d3ca1d6a6fee40b0bc32cfb85bbd5d7489aa348c51c0708c5eea32085296'),
]);

export function createLessonL2L26SignMeaningBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const activity: ChoiceActivityModel = {
        id: 'activity:l2-l26-source-sign-meaning',
        kind: 'choice',
        responseKind: 'choice',
        curriculumPhase: 'assessed-recognition',
        sourceQuestionId: sourceId(VOCABULARY_SHA256, 2, 'row-19-meaning'),
        conceptIds: ['concept:l2-l26:shiyou-kinshi'],
        prompt: {
            ja: 'Chapter 33-1 Vocabulary Sheetで「使用禁止」に印刷された意味を選びましょう。',
            en: 'Choose the meaning printed for 使用禁止 on the Chapter 33-1 Vocabulary Sheet.',
        },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        payload: {
            options: [
                correctChoice('do-not-use', 'Do Not Use'),
                wrongChoice('keep-out', 'Keep Out', 'That source meaning belongs to 立ち入り禁止.', 'その意味は「立ち入り禁止」の行です。', 'Compare rows 19 and 20.', '19番と20番を比べましょう。', '使用禁止 — Do Not Use', 'l2-l26-sign-row-confusion'),
                wrongChoice('go-slow', 'Go Slow', 'That source meaning belongs to 徐行.', 'その意味は「徐行」の行です。', 'Check the row immediately above entrance.', '入口の直前の行を確認しましょう。', '使用禁止 — Do Not Use', 'l2-l26-sign-row-confusion'),
            ],
            reviewSeedId: 'review:l2-l26:shiyou-kinshi',
            reviewContent: { expression: '使用禁止', reading: 'しようきんし', meanings: ['Do Not Use'] },
        },
    };
    return beat('source-sign-meaning', {
        ja: 'クリスチャンが標識の語彙表を開きます。三つの英語はすべて原本にありますが、使用禁止の行を選びます。',
        en: 'Christian opens the sign vocabulary sheet. All three English labels appear in the source; choose the one on the 使用禁止 row.',
    }, activity);
}

export function createLessonL2L26VerbGroupSortBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const activity: DragSortModel = {
        id: 'activity:l2-l26-source-verb-group-sort',
        kind: 'academy-drag-sort',
        responseKind: 'drag-or-keyboard-sort',
        curriculumPhase: 'assessed-recognition',
        sourceQuestionId: sourceId(FORM_SHA256, 1, 'verb-group-tables'),
        conceptIds: ['concept:l2-l26:group-1', 'concept:l2-l26:group-2', 'concept:l2-l26:irregular'],
        prompt: {
            ja: '原本の活用表に印刷された八つの辞書形を、Group 1、Group 2、irregularへ戻しましょう。',
            en: 'Return the eight source dictionary forms to the Group 1, Group 2, and irregular tables where they are printed.',
        },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        payload: {
            sourceLabel: { ja: '原本の辞書形', en: 'Source dictionary forms' },
            items: [
                sortItem('iu', 'いう', 'group-1'),
                sortItem('aruku', 'あるく', 'group-1'),
                sortItem('isogu', 'いそぐ', 'group-1'),
                sortItem('nigeru', 'にげる', 'group-2'),
                sortItem('akirameru', 'あきらめる', 'group-2'),
                sortItem('taberu', 'たべる', 'group-2'),
                sortItem('kuru', 'くる', 'irregular'),
                sortItem('suru', 'する', 'irregular'),
            ],
            zones: [
                { id: 'group-1', label: { ja: 'グループ1の動詞', en: 'Group 1 verbs' }, appearance: 'tray' },
                { id: 'group-2', label: { ja: 'グループ2の動詞', en: 'Group 2 verbs' }, appearance: 'tray' },
                { id: 'irregular', label: { ja: 'グループ3の動詞（irregular）', en: 'Group 3 verbs (irregular)' }, appearance: 'tray' },
            ],
            passScore: 1,
            errorTag: 'l2-l26-source-verb-group',
            feedback: {
                pass: { explanation: { ja: '八つの辞書形を、先生の三つの活用表へ戻せました。', en: 'All eight dictionary forms are back in Sensei’s three conjugation tables.' } },
                lapse: {
                    explanation: { ja: '一つ以上の動詞が、原本とは別のグループにあります。', en: 'At least one verb is in a group different from the source table.' },
                    repairPrompt: { ja: '一ページ目のGroup 1とGroup 2、二ページ目のirregularを順に確認しましょう。', en: 'Check Group 1 and Group 2 on page one, then irregular on page two.' },
                    nearbyExample: { ja: '原本: いうはGroup 1、にげるはGroup 2、くるはirregularです。', en: 'Source: いう is Group 1, にげる is Group 2, and くる is irregular.' },
                },
            },
            reviewTargets: [
                { id: 'review:l2-l26:group-1', conceptId: 'concept:l2-l26:group-1', expression: 'いう・あるく・いそぐ', meanings: ['Source Group 1 examples'] },
                { id: 'review:l2-l26:group-2', conceptId: 'concept:l2-l26:group-2', expression: 'にげる・あきらめる・たべる', meanings: ['Source Group 2 examples'] },
                { id: 'review:l2-l26:irregular', conceptId: 'concept:l2-l26:irregular', expression: 'くる・する', meanings: ['Source irregular examples'] },
            ],
        },
    };
    return beat('source-verb-group-sort', {
        ja: 'シンユが二枚の活用表を並べます。動詞を作り替えず、辞書形のまま元のグループへ戻します。',
        en: 'Xingyu places the two conjugation pages side by side. Return each unchanged dictionary form to its source group.',
    }, activity);
}

export function createLessonL2L26RunnerSequenceBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const activity: SequenceModel = {
        id: 'activity:l2-l26-source-runner-sequence',
        kind: 'academy-sequence',
        responseKind: 'ordered-items',
        curriculumPhase: 'assessed-recognition',
        sourceQuestionId: sourceId(EXERCISE_SHA256, 2, 'mou-nai-example-1'),
        conceptIds: ['concept:l2-l26:runner-imperative'],
        prompt: {
            ja: 'Exercise 3の最初の例を、原本に印刷された順番へ戻しましょう。',
            en: 'Restore the first Exercise 3 example to the order printed on the source page.',
        },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        payload: {
            items: [
                sequenceItem('encourage', '頑張れ！'),
                sequenceItem('cannot-run', 'もう、走れない！'),
                sequenceItem('distance-left', 'あと ５００メートルだ！'),
            ],
            correctOrder: ['cannot-run', 'distance-left', 'encourage'],
            errorTag: 'l2-l26-runner-source-order',
            feedback: {
                pass: { explanation: { ja: '走れない、残りの距離、命令形の応援を原本の順に戻せました。', en: 'The inability, remaining distance, and imperative encouragement now match the source order.' } },
                lapse: {
                    explanation: { ja: '一つ以上の札が、Exercise 3の例とは違う位置にあります。', en: 'At least one card is in a position different from the Exercise 3 example.' },
                    repairPrompt: { ja: '矢印の後を左から読み、感嘆符ごとに三つへ分けましょう。', en: 'Read from left to right after the arrow and split the line at each exclamation mark.' },
                    nearbyExample: { ja: '原本: もう、走れない！ … あと ５００メートルだ！頑張れ！', en: 'Source: もう、走れない！ … あと ５００メートルだ！頑張れ！' },
                },
            },
            reviewTargets: [{ id: 'review:l2-l26:runner-imperative', conceptId: 'concept:l2-l26:runner-imperative', expression: 'あと ５００メートルだ！頑張れ！', meanings: ['The source reply using an imperative encouragement'] }],
        },
    };
    return beat('source-runner-sequence', {
        ja: '次に、Exercise 3の走る例を三枚に分けます。疲れた発話から命令形の応援までを原文の順にします。',
        en: 'Next, split the running example from Exercise 3 into three cards, from the tired statement to its imperative encouragement.',
    }, activity);
}

export function createLessonL2L26KuruImperativeBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const activity: TypedResponseModel = {
        id: 'activity:l2-l26-source-kuru-imperative',
        kind: 'academy-typed-response',
        responseKind: 'kana-input',
        curriculumPhase: 'assessed-production',
        sourceQuestionId: sourceId(HOMEWORK_SHA256, 1, 'irregular-kuru-row'),
        conceptIds: ['concept:l2-l26:kuru-imperative'],
        prompt: {
            ja: '宿題のirregular表で、辞書形「くる」の命令形をひらがなで入力しましょう。',
            en: 'Type the imperative form printed for dictionary-form くる in the homework irregular table.',
        },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        payload: {
            inputLabel: { ja: 'くるの命令形', en: 'Imperative of くる' },
            acceptedAnswers: ['こい'],
            errorTag: 'l2-l26-kuru-imperative',
            feedback: {
                pass: { explanation: { ja: '原本どおり、くるの命令形は「こい」です。', en: 'That matches the source table: the imperative of くる is こい.' } },
                lapse: {
                    explanation: { ja: '入力は、宿題のirregular表とまだ一致していません。', en: 'That does not yet match the homework irregular table.' },
                    repairPrompt: { ja: '一ページ目の一番下で、する→しろと、くる→こいを比べましょう。', en: 'At the bottom of page one, compare する→しろ with くる→こい.' },
                    nearbyExample: { ja: '原本: する → しろ ／ くる → こい', en: 'Source: する → しろ / くる → こい' },
                },
            },
            reviewTargets: [{ id: 'review:l2-l26:kuru-imperative', conceptId: 'concept:l2-l26:kuru-imperative', expression: 'くる → こい', meanings: ['Irregular imperative form'] }],
        },
    };
    return beat('source-kuru-imperative', {
        ja: '最後に、宿題の活用表でirregularの二行だけを見ます。音声を使わず、くるの命令形を原本から思い出します。',
        en: 'Finally, use the two irregular rows in the homework table. With no audio, recall the printed imperative of くる.',
    }, activity);
}

function sourcePage(payloadSha256: string, title: string, page: number, filename: string, sha256: string) {
    return Object.freeze({ sourceId: `moodle:${payloadSha256}`, payloadSha256, title, page, url: `/academy/content/lessons/${PACKAGE_ID}/${filename}`, sha256 });
}

function sourceId(payloadSha256: string, page: number, region: string): string {
    return `moodle:${payloadSha256}:page:${page}:${region}`;
}

function correctChoice(id: string, sourceLabel: string): ChoiceOption {
    return { id, label: { ja: sourceLabel, en: sourceLabel }, correct: true, explanation: { ja: 'この意味が、原本の19番に印刷されています。', en: 'This is the meaning printed in source row 19.' } };
}

function wrongChoice(id: string, sourceLabel: string, explanationEn: string, explanationJa: string, repairEn: string, repairJa: string, nearbyExample: string, errorTag: string): ChoiceOption {
    return { id, label: { ja: sourceLabel, en: sourceLabel }, correct: false, errorTag, explanation: { ja: explanationJa, en: explanationEn }, repairPrompt: { ja: repairJa, en: repairEn }, nearbyExample: { ja: nearbyExample, en: nearbyExample } };
}

function sortItem(id: string, label: string, correctZoneId: string) {
    return Object.freeze({ id, label, correctZoneId });
}

function sequenceItem(id: string, label: string) {
    return Object.freeze({ id, label });
}

function beat(id: string, narrative: LessonActivityBeat['narrative'], activity: LessonActivityBeat['activity']): LessonActivityBeat {
    return Object.freeze({ id, narrative, activity: Object.freeze(activity) });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l26 package');
    const identity = record(root.identity, 'l2-l26 identity');
    const coverage = record(root.sourceCoverage, 'l2-l26 source coverage');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID
        || coverage.archiveModuleId !== MODULE_ID || coverage.archiveId !== ARCHIVE_ID
        || coverage.archiveSha256 !== ARCHIVE_SHA256 || coverage.memberFileCount !== 16) {
        throw new TypeError('Unexpected l2-l26 package identity.');
    }
    const members = array(coverage.members, 'l2-l26 members').map((value, index) => record(value, `l2-l26 member ${index + 1}`));
    for (const payloadSha256 of [FORM_SHA256, EXERCISE_SHA256, VOCABULARY_SHA256, HOMEWORK_SHA256]) {
        if (!members.some(member => member.payloadSha256 === payloadSha256 && member.kind === 'document' && member.extension === '.pdf')) {
            throw new TypeError(`Missing exact l2-l26 Moodle document ${payloadSha256}.`);
        }
    }
    const audioMembers = members.filter(member => member.kind === 'audio');
    if (audioMembers.length !== 5 || AUDIO_PAYLOADS.some(payload => !audioMembers.some(member => member.payloadSha256 === payload))) {
        throw new TypeError('Unexpected l2-l26 audio inventory.');
    }
    const provenance = record(root.provenance, 'l2-l26 provenance');
    if (provenance.unresolvedAnswersPolicy !== 'quarantine' || provenance.unresolvedAudioPolicy !== 'quarantine') {
        throw new TypeError('l2-l26 unresolved answers and audio must remain quarantined.');
    }
    const mappings = array(provenance.sourceMappings, 'l2-l26 source mappings').map((value, index) => record(value, `l2-l26 source mapping ${index + 1}`));
    const minna = mappings.find(mapping => mapping.sourceId === 'source-minna-no-nihongo');
    if (!minna || minna.reference !== 'Minna no Nihongo II · Lessons 32–33' || minna.reuse !== 'sequence-only') {
        throw new TypeError('l2-l26 Minna use must remain sequence-only.');
    }
    if (root.genkiInteractiveActivities !== undefined || array(coverage.externalUrlModules, 'l2-l26 external URL modules').length !== 0) {
        throw new TypeError('l2-l26 must not invent Genki or external media support.');
    }
    const canonical = record(provenance.canonicalMoodle, 'l2-l26 canonical Moodle');
    const sourceItems = array(canonical.sourceItems, 'l2-l26 canonical source items').map((value, index) => record(value, `l2-l26 canonical item ${index + 1}`));
    for (const payloadSha256 of AUDIO_PAYLOADS) {
        const item = sourceItems.find(candidate => candidate.payloadSha256 === payloadSha256);
        if (!item || item.sourceType !== 'audio' || item.projectionStatus !== 'requires-pairing-projection'
            || item.pairingStatus !== 'source-audio-recorded-task-pairing-unverified') {
            throw new TypeError(`l2-l26 audio ${payloadSha256} must remain unpaired.`);
        }
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
