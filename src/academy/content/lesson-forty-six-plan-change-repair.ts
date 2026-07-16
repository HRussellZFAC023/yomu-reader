import lessonPackage from '../../../public/academy/content/lessons/048-l2-l21.json';
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

const PACKAGE_ID = 'l2-l21';
const PACKAGE_ORDER = 48;
const MODULE_ID = 8121277;
const ARCHIVE_ID = 'archive-000010';
const ARCHIVE_SHA256 = '1772085f52b38e5ec8ce5a4362bd1b1c0f0117684e2054e0600e129eca2b9492';
const VOCABULARY_SHA256 = '8c1351970eebe85982be7e175f957914d21bd30abfcb16e21098b00b9cbea8a9';
const PLAN_SHA256 = '105aa28ed8bd9294f8ecfab64aa145b425ee49df13cdb19debe7824b5651da74';
const CONVICTION_SHA256 = '37db0f595c82d4179a7dde9630482e04d09753c818e0138f8e2dc4de12f517d2';
const HOMEWORK_SHA256 = '10572e757fa6dc59353ce6a873efcc14cd82a7def16cef381ed421474b317454';

const SOURCE_VISUALS: StateInspectionModel['provenance']['moodle']['sourceSheets'] = Object.freeze([
    sourceVisual(VOCABULARY_SHA256, 'Chapter 31-2 Vocabulary Sheet', 1, 'moodle-chapter-31-2-vocabulary-page-1.png', 'b6ddb6e94a83d6bae470f30807bf79bd3d672f0128e8dbd1a1407fd995dc2ff6', {
        ja: 'Moodle 原本: Chapter 31-2 語彙表1ページ。予定、直行便、経由便、上旬、下旬、休み、式、言い訳、転勤など。',
        en: 'Moodle original: Chapter 31-2 vocabulary page 1, including plans, direct and connecting flights, early and late month, leave, ceremonies, excuses, and transfers.',
    }),
    sourceVisual(VOCABULARY_SHA256, 'Chapter 31-2 Vocabulary Sheet', 2, 'moodle-chapter-31-2-vocabulary-page-2.png', '566fcbb4db961dbaa03bd0fc1900a90b49eeb9ab6b48e53b1854e8704e97a4c9', {
        ja: 'Moodle 原本: Chapter 31-2 語彙表2ページ。単身赴任、転職、実は〜んです、残ります、入学試験など。',
        en: 'Moodle original: Chapter 31-2 vocabulary page 2, including solo assignments, career changes, 実は〜んです, remaining behind, and entrance examinations.',
    }),
    sourceVisual(PLAN_SHA256, 'Chapter 31-2 つもり よてい grammar exercise', 1, 'moodle-chapter-31-2-tsumori-yotei-page-1.png', '251c6515ec63247e1688d2879dd1f55b55f57dee273b69bd5d831277220d079a', {
        ja: 'Moodle 原本: つもりですと予定ですの基本文、肯定・否定の意向、予定の例。',
        en: 'Moodle original: basic つもりです and 予定です patterns, affirmative and negative intentions, and scheduled-plan examples.',
    }),
    sourceVisual(PLAN_SHA256, 'Chapter 31-2 つもり よてい grammar exercise', 2, 'moodle-chapter-31-2-tsumori-yotei-page-2.png', '10649eeb7297c8bbc48b70e1eb39e2e25eef70170edc8fde81b6fa26873d3887', {
        ja: 'Moodle 原本: 近い未来の確定行動、つもり／予定／意向形と思っていますの文脈上の使い分け。',
        en: 'Moodle original: near-future actions and the context-sensitive contrast among つもり, 予定, and volitional + と思っています.',
    }),
    sourceVisual(PLAN_SHA256, 'Chapter 31-2 つもり よてい grammar exercise', 3, 'moodle-chapter-31-2-tsumori-yotei-page-3.png', 'd835b0dcca0385f8b8f4fedb1a4067a7db23b17a7797fbc9d24f5b4e48aae210', {
        ja: 'Moodle 原本: 大英博物館、大学院、フランス出張について予定を作る三問。',
        en: 'Moodle original: three scheduled-plan prompts about the British Museum, graduate school, and a business trip to France.',
    }),
    sourceVisual(PLAN_SHA256, 'Chapter 31-2 つもり よてい grammar exercise', 4, 'moodle-chapter-31-2-tsumori-yotei-page-4.png', 'd8e0f90c50716fad63b470486314f3fb0c77f13274836ef6280f88c255fbeee2', {
        ja: 'Moodle 原本: イースターの予定を相手に尋ね、予定・つもり・と思っていますを文脈で選ぶ会話。',
        en: 'Moodle original: an Easter plan conversation that chooses 予定, つもり, or と思っています from the context.',
    }),
    sourceVisual(CONVICTION_SHA256, 'Chapter 31 つもり-2 grammar exercise', 1, 'moodle-chapter-31-3-tsumori-conviction-page-1.png', '4b47397b2c309842c4ea85d5df7b6623993b3f1ab7b8c95ca7830a0c0cd0c214', {
        ja: 'Moodle 原本: 「〜つもりです」の確信の意味と、若い・元気なつもりの例。',
        en: 'Moodle original: the conviction meaning of 〜つもりです, including the young and healthy examples.',
    }),
    sourceVisual(HOMEWORK_SHA256, 'HW Chapter 31 grammar review-2 〜つもり 〜よてい', 1, 'moodle-chapter-31-homework-plan-review-page-1.png', '5ae680e64834193b0cc80d3b070dec6c4d8e33f30a63dd16ea994a88907aaab5', {
        ja: 'Moodle 原本: つもりを使う文完成と旅行の意向を書く宿題ページ。',
        en: 'Moodle original: homework page for completing つもり sentences and writing travel intentions.',
    }),
    sourceVisual(HOMEWORK_SHA256, 'HW Chapter 31 grammar review-2 〜つもり 〜よてい', 2, 'moodle-chapter-31-homework-plan-review-page-2.png', 'a4f04e04b3ad749ab36ff3da22849be0782b19e009fa7b5383ffc4bcc767c8ed', {
        ja: 'Moodle 原本: 日記を読み、話者の予定を確認する宿題ページ。',
        en: 'Moodle original: homework page for reading a diary and checking the speaker’s plans.',
    }),
]);

export function createLessonFortySixPlanChangeRepairBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('direct-flight-intention', 1, 1, 'vocabulary', 1, 'action-choice', question(VOCABULARY_SHA256, 1, 'vocabulary', 1),
            '自分で決めた意向を表す、先生のページの文はどれですか。', '直行便を買うつもりです。', [
                option('直行便を買うつもりです。', '直行便を買うつもりです。', 'I intend to buy a direct flight.'),
                option('直行便を買う予定です。', '直行便を買う予定です。', 'I am scheduled to buy a direct flight.'),
            ], hints(
                ['「直行便」は語彙表の四番にあります。', '先生の基本文は、つもりを自分の決めた意向に使います。', '原本の例は「直行便を買うつもりです」です。'],
                ['Find 直行便 in vocabulary row four.', 'Sensei uses つもり for a settled personal intention.', 'The source example is 直行便を買うつもりです.'],
            )),
        round('keep-teaching', 2, 1, 'grammar', 2, 'state-select', question(PLAN_SHA256, 1, 'grammar', 2),
            '年をとっても仕事を続けるという先生の意向を完成してください。', '年をとっても仕事を続けるつもりです。', [
                option('年をとっても仕事を続けるつもりです。', '年をとっても仕事を続けるつもりです。', 'I intend to continue teaching even when I get old.'),
                option('年をとっても仕事を続ける予定です。', '年をとっても仕事を続ける予定です。', 'I am scheduled to continue teaching even when I get old.'),
            ], hints(
                ['これはページ一の「つもり」の例です。', '話者の心で決めた意向で、実行の保証ではありません。', '先生の文は「仕事を続けるつもりです」です。'],
                ['This is a page-one つもり example.', 'It is a decision in the speaker’s mind, not a guaranteed appointment.', 'Sensei’s sentence is 仕事を続けるつもりです.'],
            )),
        round('call-back', 3, 2, 'grammar', 3, 'typed-report', question(PLAN_SHA256, 2, 'grammar', 3),
            '今電車に乗っているので、降りたら何をしますか。先生の近い未来の文を入力してください。', '降りたら電話をかけなおします。', [], hints(
                ['ページ二は、すぐ先の確定行動にはつもりを使わないと注意します。', '先生は「降りたら」の後に電話の行動を書きます。', '原文は「降りたら電話をかけなおします」です。'],
                ['Page two warns against using つもり for an immediate definite action.', 'Sensei puts a phone action after 降りたら.', 'The source says 降りたら電話をかけなおします.'],
            )),
        round('british-museum', 4, 3, 'grammar', 4, 'action-choice', question(PLAN_SHA256, 3, 'grammar', 4),
            'あしたは何をしますか。（大英博物館の見学）', '明日は大英博物館の見学の予定です。', [
                option('明日は大英博物館の見学の予定です。', '明日は大英博物館の見学の予定です。', 'Tomorrow I am scheduled to visit the British Museum.'),
                option('明日は大英博物館の見学のつもりです。', '明日は大英博物館の見学のつもりです。', 'Tomorrow I intend a British Museum visit.'),
            ], hints(
                ['ページ三の四番は名詞「大英博物館の見学」を使います。', '名詞の後は「の予定です」にできます。', '答えは「大英博物館の見学の予定です」です。'],
                ['Item four on page three gives the noun 大英博物館の見学.', 'A noun can take の予定です.', 'The answer is 大英博物館の見学の予定です.'],
            )),
        round('graduate-school', 5, 3, 'grammar', 5, 'typed-report', question(PLAN_SHA256, 3, 'grammar', 5),
            '今年の9月もイギリスにいますか。（はい、9月から大学院に行きます）', 'はい、9月から大学院に行く予定です。', [], hints(
                ['ページ三の五番は、すでに決まった九月からの動きです。', '「大学院に行きます」を辞書形にします。', '辞書形の後に「予定です」を付けます。'],
                ['Item five is an arranged move beginning in September.', 'Change 大学院に行きます to its dictionary form.', 'Put 予定です after that dictionary form.'],
            )),
        round('easter-arrangement', 6, 4, 'speaking', 1, 'state-select', question(PLAN_SHA256, 4, 'speaking', 1),
            '「イースターは、何か予定がありますか」と聞かれたとき、相手との取り決めを示す形はどれですか。', 'わたしは旅行に行く予定です。', [
                option('わたしは旅行に行く予定です。', 'わたしは旅行に行く予定です。', 'I am scheduled to go travelling.'),
                option('わたしは旅行に行くつもりです。', 'わたしは旅行に行くつもりです。', 'I intend to go travelling.'),
            ], hints(
                ['ページ四は、固定か、決めて準備するか、考え中かで形を選ぶ会話です。', 'ここでは相手に確認できる予定を答えます。', '取り決めには「予定です」を使います。'],
                ['Page four chooses a form based on whether the plan is fixed, personally decided, or still under consideration.', 'Here the reply is an arrangement another person can confirm.', 'Use 予定です for an arranged plan.'],
            )),
        round('conviction-not-plan', 7, 1, 'grammar', 1, 'action-choice', question(CONVICTION_SHA256, 1, 'grammar', 1),
            '「まだ元気なつもりです」は、このページでは何を表しますか。', 'まだ元気だと信じています。', [
                option('まだ元気だと信じています。', 'まだ元気だと信じています。', 'The speaker believes they are still healthy.'),
                option('これから元気になる予定です。', 'これから元気になる予定です。', 'The speaker is scheduled to become healthy.'),
            ], hints(
                ['Chapter 31-3 は、別の「つもり」の意味を扱います。', 'これは未来の予定ではなく、話者の確信です。', '先生の説明は「be convinced that; believe」です。'],
                ['Chapter 31-3 teaches a different meaning of つもり.', 'This is a conviction, not a future plan.', 'Sensei glosses it as “be convinced that; believe.”'],
            )),
        round('travel-intention', 8, 2, 'homework', 1, 'typed-report', question(HOMEWORK_SHA256, 2, 'homework', 1),
            '燃料サーチャージは高いですが、どう行くつもりですか。先生の旅行例を入力してください。', '燃料サーチャージは高いですが、飛行機で行くつもりです。', [], hints(
                ['「燃料サーチャージ」は語彙表の三番です。', '宿題の旅行例は、価格が高くても選んだ移動手段を言います。', '原文は「飛行機で行くつもりです」です。'],
                ['Find 燃料サーチャージ in vocabulary row three.', 'The homework travel example names the chosen transport despite the cost.', 'The source says 飛行機で行くつもりです.'],
            )),
    ] as const;

    const activity: StateInspectionModel = {
        id: 'activity:l2-l21-sensei-plan-change-repair',
        kind: 'academy-state-inspection',
        responseKind: 'moodle-chapter-31-plan-change-repair',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(round => round.conceptId),
        prompt: {
            ja: '先生の Chapter 31-2 語彙、つもり／予定の文法、確信のつもり、宿題の旅行例を先に読み、八つの原問に答えてください。音声は確認できていないため使いません。',
            en: 'Read Sensei’s Chapter 31-2 vocabulary, つもり／予定 grammar, conviction meaning, and homework travel example first, then answer eight source-grounded prompts. Audio is not used because its exact pairings remain unverified.',
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
                    status: 'audio-members-quarantined-unpaired',
                    sourceAudioMembers: 6,
                    sourceAudioTracksDelivered: 0,
                },
                answerKeyBasis: 'sensei-verbatim-examples-and-yomu-derived-deterministic-completions-over-canonical-source-pages',
            },
            support: {
                minna: { reference: 'Minna no Nihongo II · Lesson 31', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: '≈ Genki II · Volitional form and intentions', reuse: 'sequence-only' },
            },
        },
        payload: {
            teaching: [
                { title: 'Sensei vocabulary first', text: 'Read both Chapter 31-2 vocabulary pages before producing a plan: 予定, 直行便, 経由便, 大学院, 言い訳, 転勤, 転職, and 実は〜んです remain in Sensei’s printed order.' },
                { title: 'Personal resolve', text: 'Dictionary form + つもりです marks something the speaker has settled in their mind. It does not promise that the action will happen.' },
                { title: 'Scheduled arrangement', text: 'Dictionary form + 予定です and noun + の予定です report a plan or arrangement. Use it when the event is being treated as scheduled.' },
                { title: 'Near certainty', text: 'For an action that will definitely happen very soon, follow the source page: use the direct future form rather than つもり.' },
                { title: 'A second つもり', text: 'Chapter 31-3 also uses つもり for a belief or conviction. まだ元気なつもりです is not a future plan.' },
                { title: 'Audio stays out', text: 'The archive contains six audio files, but no original worksheet pairing, transcript, duration, and answer verification has been established. They remain quarantined and no audio control is shown.' },
            ],
            taskHeadings: [
                { sourceTask: 'vocabulary', text: 'Chapter 31-2 vocabulary: read the exact planning, travel, and explanation words before the grammar work.' },
                { sourceTask: 'grammar', text: '1–2: Read the source contrast, then form an intention or a scheduled plan.' },
                { sourceTask: 'speaking', text: '4: Ask a partner about an Easter plan, then keep the difference between an arrangement and an intention clear.' },
                { sourceTask: 'homework', text: 'Homework: use the printed travel example before making a responsible plan statement.' },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: { ja: '先生の語彙、つもり、予定、確信のつもり、旅行例を使い、意向と取り決めを区別できました。', en: 'Using Sensei’s vocabulary, つもり, 予定, conviction meaning, and travel example, you separated a personal intention from an arrangement.' } },
                lapse: {
                    explanation: { ja: '間違えた原問で、意向、予定、近い未来、または確信のどれかをもう一度確認しましょう。', en: 'For each missed source prompt, recheck whether it is an intention, arrangement, immediate action, or conviction.' },
                    repairPrompt: { ja: '間違えた原問だけを直し、必要なら先生のページとヒントを一つずつ開きましょう。', en: 'Repair only the missed source prompts, reopening Sensei’s page and one earned hint at a time if needed.' },
                    nearbyExample: { ja: '先生の例: 直行便を買うつもりです。', en: 'Sensei’s example: 直行便を買うつもりです.' },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-plan-change-repair',
        narrative: {
            ja: 'ヘンリーは予定表を開き、エンジェルはまだ自分で決めていることと、もう決まっていることを別々に書きます。クリスチャンは「実は」と言って理由を加え、二人の計画が同じ形にならないことを確かめます。',
            en: 'Henry opens the plan board while Angel writes down what she has personally decided and what is already arranged in separate columns. Christian adds a reason with 実は, and the group checks that the two kinds of plan do not collapse into the same form.',
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
        id, interaction, sourceOrder, sourcePage, sourceTask, sourceItem, sourceQuestionId, sourcePrompt,
        options, answerValue: answerExpression, answerExpression, acceptedAnswers: [answerExpression],
        conceptId: `concept:l2-l21:plan-change-repair:${sourceOrder}`,
        errorTag: `l2-l21-plan-change-repair-${sourceOrder}`,
        hints: roundHints,
    });
}

function question(payloadSha256: string, page: 1 | 2 | 3 | 4, task: StateInspectionRound['sourceTask'], item: StateInspectionRound['sourceItem']): string {
    return `moodle:${MODULE_ID}:${payloadSha256}:pdf-p${page}:task-${task}:q${item}`;
}

function option(value: string, ja: string, en: string): StateInspectionOption {
    return Object.freeze({ value, label: Object.freeze({ ja, en }) });
}

function hints(ja: readonly string[], en: readonly string[]): StateInspectionRound['hints'] {
    if (ja.length !== 3 || en.length !== 3) throw new TypeError('Lesson 46 rounds require exactly three bilingual hints.');
    return [
        Object.freeze({ ja: ja[0]!, en: en[0]! }),
        Object.freeze({ ja: ja[1]!, en: en[1]! }),
        Object.freeze({ ja: ja[2]!, en: en[2]! }),
    ];
}

function sourceVisual(payloadSha256: string, title: string, page: StateInspectionSourceVisual['page'], filename: string, sha256: string, alt: LocalizedText): StateInspectionSourceVisual {
    return Object.freeze({
        sourceId: `moodle:${payloadSha256}:page:${page}`,
        payloadSha256,
        title,
        page,
        url: `/academy/content/lessons/l2-l21/${filename}`,
        sha256,
        alt: Object.freeze(alt),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l21 package');
    const identity = record(root.identity, 'l2-l21 identity');
    const coverage = record(root.sourceCoverage, 'l2-l21 coverage');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID
        || coverage.archiveId !== ARCHIVE_ID || coverage.archiveSha256 !== ARCHIVE_SHA256) {
        throw new TypeError('Unexpected l2-l21 package identity.');
    }
    const payloads = array(coverage.members, 'l2-l21 members').map(member => record(member, 'l2-l21 member').payloadSha256);
    [VOCABULARY_SHA256, PLAN_SHA256, CONVICTION_SHA256, HOMEWORK_SHA256].forEach(payload => {
        if (!payloads.includes(payload)) throw new TypeError('The exact l2-l21 Moodle payloads are required.');
    });
}

function record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`Expected ${label} record.`);
    return value as Record<string, unknown>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`Expected ${label} array.`);
    return value;
}
