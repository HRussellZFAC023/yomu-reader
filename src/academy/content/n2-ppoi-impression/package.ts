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
    typedQuestion,
} from '../n2-opening-kit';
import { N2_PPOI_IMPRESSION_PROVENANCE } from './source';
import { N2_PPOI_IMPRESSION_ACTIVITY_KIND, N2_PPOI_IMPRESSION_PACKAGE_ID, type N2PpoiImpressionPackage } from './types';

export const N2_PPOI_IMPRESSION_PARAGRAPHS = Object.freeze([
    '美咲さんは青葉ハイツを見学しました。駅に近く、日当たりもよさそうです。',
    'しかし、置いてある机は木ではなく、薄いプラスチックでできていて、少し安っぽく見えました。部屋そのものは気に入ったので、机だけ替えることにしました。',
]);

export function createN2PpoiImpressionPackage(): N2PpoiImpressionPackage {
    const concept = 'grammar:n2-ppoi-evaluation';
    return createN2OpeningPackage({
        id: N2_PPOI_IMPRESSION_PACKAGE_ID,
        kind: N2_PPOI_IMPRESSION_ACTIVITY_KIND,
        responseKind: 'n2-ppoi-impression-v1',
        order: 2,
        previousPackageId: 'n2-home-life-opening-01-apartment-moving',
        nextPackageId: 'n2-home-life-opening-03-coupon',
        provenance: N2_PPOI_IMPRESSION_PROVENANCE,
        sourceQuestionId: N2_PPOI_IMPRESSION_PROVENANCE.sourceId,
        introduces: concept,
        recycles: ['vocabulary:n2-home-and-moving'],
        prerequisite: n2OpeningPrerequisite('vocabulary:n2-home-and-moving', '物件と引っ越しの基本条件を読み分けられる。', 'Can distinguish basic property and moving conditions.', 'n2-home-life-opening-01-apartment-moving'),
        prompt: localizedText('既知の住まい語彙に「〜っぽい」を一つだけ足しましょう。', 'Add just one new form, -ppoi, to familiar housing vocabulary.'),
        instructionTitle: localizedText('見た印象を「〜っぽい」で表す', 'Express an impression with -ppoi'),
        instructionEntries: [
            n2OpeningInstruction('名詞 + っぽい：子供っぽい', 'The noun seems characteristic of, or resembles, the named thing.'),
            n2OpeningInstruction('語幹 + っぽい：安っぽい・忘れっぽい', 'The stem describes a noticeable impression or recurring tendency.'),
            n2OpeningInstruction('客観的な数字には使わない', 'Use it for an impression, not an objective rent or walking-time figure.'),
        ],
        contentTitle: localizedText('見学で受けた印象', 'An impression during the viewing'),
        paragraphs: N2_PPOI_IMPRESSION_PARAGRAPHS,
        questions: [
            typedQuestion('ppoi-form', '「値段が低そうな印象だ」という意味になる形を一語で書いてください。', 'Write the form meaning “it gives a cheap-looking impression.”', '〜っぽいの形', '-ppoi form', ['安っぽい', 'やすっぽい'], 'ppoi-form'),
            choiceQuestion('ppoi-meaning', '本文の「安っぽく見えました」に最も近い意味はどれですか。', 'Which meaning is closest to yasuppoku miemashita?', [
                choiceOption('impression', '実際の値段ではなく、見た印象が安そうだった。', 'It looked cheap, regardless of its actual price.'),
                choiceOption('price', '机の正確な値段が安かった。', 'The exact price was low.'),
                choiceOption('free', '机を無料でもらえた。', 'The desk was free.'),
            ], 'impression', 'ppoi-meaning'),
            choiceQuestion('ppoi-register', '「〜っぽい」の使い方が自然な文はどれですか。', 'Which sentence uses -ppoi naturally?', [
                choiceOption('natural', 'この机は木に見えるが、触るとプラスチックで安っぽい。', 'The desk looks wooden, but feels plastic and cheap.'),
                choiceOption('rent', '家賃は六万八千円っぽい。', 'The rent is -ppoi 68,000 yen.'),
                choiceOption('minutes', '駅から徒歩八分っぽい。', 'It is -ppoi eight minutes on foot.'),
            ], 'natural', 'ppoi-register'),
        ],
        feedback: n2OpeningFeedback(
            '客観的な条件と、話し手が受けた「〜っぽい」印象を分けられました。',
            'You separated objective conditions from the speaker’s -ppoi impression.',
            '数字で確認できる事実か、見た人の印象かを先に判断してください。',
            'First decide whether the statement is measurable or an impression.',
            '形を「語の幹 + っぽい」に戻し、事実の数字には付けません。',
            'Return to stem plus -ppoi, and do not attach it to objective figures.',
            '「家賃は6万円だ」は事実、「家具が安っぽい」は印象です。',
            '“The rent is 60,000 yen” is a fact; “the furniture looks cheap” is an impression.',
        ),
        reviewTargets: [
            n2OpeningReview(N2_PPOI_IMPRESSION_PACKAGE_ID, 'ppoi', concept, '〜っぽい', undefined, ['-ish; tending to; giving an impression'], N2_PPOI_IMPRESSION_PARAGRAPHS[1], ['ppoi-register']),
            n2OpeningReview(N2_PPOI_IMPRESSION_PACKAGE_ID, 'cheap-looking', concept, '安っぽい', 'やすっぽい', ['cheap-looking'], N2_PPOI_IMPRESSION_PARAGRAPHS[1], ['ppoi-form', 'ppoi-meaning']),
        ],
        miningRequests: [n2OpeningMining('安っぽい', N2_PPOI_IMPRESSION_PARAGRAPHS[1], 'Yomu original N2 apartment viewing', [concept])],
        curriculumPhase: 'assessed-production',
    });
}
