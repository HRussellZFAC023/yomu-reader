import {
    choiceOption,
    choiceQuestion,
    createN2OpeningPackage,
    localizedText,
    n2OpeningFeedback,
    n2OpeningInstruction,
    n2OpeningMining,
    n2OpeningPrerequisite,
    n2OpeningReview,
    orderingAction,
    orderingQuestion,
} from '../n2-opening-kit';
import { N2_HOME_LIFE_READER_PROVENANCE } from './source';
import { N2_HOME_LIFE_READER_ACTIVITY_KIND, N2_HOME_LIFE_READER_PACKAGE_ID, type N2HomeLifeReaderPackage } from './types';

export const N2_HOME_LIFE_READER_PARAGRAPHS = Object.freeze([
    '美咲さんは、駅に近い新しいマンションに決めるつもりでした。けれども、見学すると、大通りの音が窓を閉めても聞こえ、備え付けの家具も少し安っぽく見えました。',
    '次に見た青葉ハイツは築12年で、駅から徒歩8分でした。新しくはありませんが、南向きの部屋には午後も光が入り、窓の外は静かな庭でした。家賃も最初の部屋より安く、礼金はありません。',
    'しかし、美咲さんがすぐに決めた理由は、条件の数字だけではありません。帰ろうとしたとき、隣の人が「引っ越しの日は手伝いますよ」と声をかけてくれたのです。',
    '美咲さんは、そこで暮らす自分の一日を想像しました。見た目の新しさより、明るさと静かさ、それに人の温かさが決め手になり、青葉ハイツを選びました。',
]);

export function createN2HomeLifeReaderPackage(): N2HomeLifeReaderPackage {
    const concept = 'reading:n2-narrative-turn';
    const actions = [
        orderingAction('new-room', '新しいマンションを見学する', 'View the new apartment'),
        orderingAction('aoba', '青葉ハイツを見学する', 'View Aoba Heights'),
        orderingAction('neighbor', '隣の人に声をかけられる', 'Hear from the neighbour'),
        orderingAction('decision', '青葉ハイツに決める', 'Choose Aoba Heights'),
    ];
    return createN2OpeningPackage({
        id: N2_HOME_LIFE_READER_PACKAGE_ID,
        kind: N2_HOME_LIFE_READER_ACTIVITY_KIND,
        responseKind: 'n2-home-life-reader-v1',
        order: 4,
        previousPackageId: 'n2-home-life-opening-03-coupon',
        nextPackageId: 'n2-home-life-opening-05-listening',
        provenance: N2_HOME_LIFE_READER_PROVENANCE,
        sourceQuestionId: N2_HOME_LIFE_READER_PROVENANCE.readerReference.sourceId,
        introduces: concept,
        recycles: ['vocabulary:n2-home-and-moving', 'grammar:n2-ppoi-evaluation', 'reading:n2-practical-constraints'],
        prerequisite: n2OpeningPrerequisite('reading:n2-practical-constraints', '短い実用文の条件と例外を行動順にできる。', 'Can turn practical constraints and exceptions into action order.', 'n2-home-life-opening-03-coupon'),
        prompt: localizedText('既知の語を支えに、止まらず短い物語の転換まで読みましょう。', 'Use familiar words to keep moving through a short story and its turn.'),
        instructionTitle: localizedText('レベル4の読み方を一段だけ足す', 'Add one level-4 reading move'),
        instructionEntries: [
            n2OpeningInstruction('知らない語で毎回止まらない', 'Mark an unknown word and continue if the event sequence remains clear.'),
            n2OpeningInstruction('しかしの前後を比べる', 'Treat shikashi as a change in expectation.'),
            n2OpeningInstruction('最後に決め手を一文で言う', 'Summarize the deciding factor after tracking the whole text.'),
        ],
        contentTitle: localizedText('オリジナル・ミニリーダー「新しい部屋」', 'Original mini-reader: “The new room”'),
        paragraphs: N2_HOME_LIFE_READER_PARAGRAPHS,
        questions: [
            choiceQuestion('reader-gist', '美咲さんが青葉ハイツを選んだ理由として最もよいものはどれですか。', 'Which best explains why Misaki chose Aoba Heights?', [
                choiceOption('whole-life', '明るさ、静かさ、費用、人とのつながりを合わせて考えたから。', 'She considered light, quiet, cost, and human connection together.'),
                choiceOption('newest', '二つの中で最も新しい建物だったから。', 'It was the newest building.'),
                choiceOption('closest', '駅から最も近かったから。', 'It was closest to the station.'),
            ], 'whole-life', 'reader-gist'),
            choiceQuestion('reader-turn', '第三段落の「しかし」は、どんな予想を変えますか。', 'What expectation does shikashi change?', [
                choiceOption('numbers-only', '数字の条件だけで決めた、という予想。', 'That numbers alone decided it.'),
                choiceOption('no-viewing', '部屋を見学しなかった、という予想。', 'That she did not view the rooms.'),
                choiceOption('no-moving', '引っ越しをやめた、という予想。', 'That she cancelled the move.'),
            ], 'numbers-only', 'reader-turn'),
            orderingQuestion('reader-order', '出来事を本文の順番にしてください。', 'Put the events in story order.', actions,
                ['decision', 'neighbor', 'new-room', 'aoba'], ['new-room', 'aoba', 'neighbor', 'decision'], 'reader-order'),
        ],
        feedback: n2OpeningFeedback(
            '既知語を再利用し、「しかし」の転換から最後の決め手まで流れを保てました。',
            'You recycled familiar language and preserved the flow through the turn to the decision.',
            '各段落を「第一候補・比較・予想外の情報・決定」の四語で並べ直してください。',
            'Relabel the paragraphs first choice, comparison, unexpected information, and decision.',
            '「しかし」の後に出る新しい理由と、最後の決定を結び直してください。',
            'Reconnect the new reason after shikashi with the final decision.',
            '「条件はよい。しかし決め手は別だ」なら、後半が本当の決定理由です。',
            'In “The conditions are good; however, the deciding factor is different,” the latter gives the real reason.',
        ),
        reviewTargets: [
            n2OpeningReview(N2_HOME_LIFE_READER_PACKAGE_ID, 'turn', concept, 'しかし', undefined, ['however; a turn against expectation'], N2_HOME_LIFE_READER_PARAGRAPHS[2], ['reader-turn']),
            n2OpeningReview(N2_HOME_LIFE_READER_PACKAGE_ID, 'deciding-factor', concept, '決め手', 'きめて', ['deciding factor'], N2_HOME_LIFE_READER_PARAGRAPHS[3], ['reader-gist', 'reader-order']),
        ],
        miningRequests: [
            n2OpeningMining('決め手', N2_HOME_LIFE_READER_PARAGRAPHS[3], 'Yomu original N2 mini-reader: 新しい部屋', [concept]),
            n2OpeningMining('備え付け', N2_HOME_LIFE_READER_PARAGRAPHS[0], 'Yomu original N2 mini-reader: 新しい部屋', ['vocabulary:n2-home-and-moving', concept]),
        ],
    });
}
