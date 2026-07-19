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
import { N2_APARTMENT_MOVING_PROVENANCE } from './source';
import {
    N2_APARTMENT_MOVING_ACTIVITY_KIND,
    N2_APARTMENT_MOVING_PACKAGE_ID,
    type N2ApartmentMovingPackage,
} from './types';

export const N2_APARTMENT_MOVING_PARAGRAPHS = Object.freeze([
    '美咲さんの希望：家賃は7万円以下、駅から徒歩10分以内、南向き、礼金なし。',
    '青葉ハイツ：家賃6万8千円、駅から徒歩8分、南向き、築12年。敷金1か月、礼金なし。',
    '川原メゾン：家賃6万2千円、駅から徒歩6分、北向き、築8年。敷金なし、礼金なし。',
    '中央コーポ：家賃6万9千円、駅から徒歩12分、南向き、築10年。敷金1か月、礼金なし。',
    '引っ越しメモ：本は段ボール箱に詰める。古い本棚は粗大ごみとして収集を申し込む。割れ物は緩衝材で包む。',
]);

export function createN2ApartmentMovingPackage(): N2ApartmentMovingPackage {
    const concept = 'vocabulary:n2-home-and-moving';
    return createN2OpeningPackage({
        id: N2_APARTMENT_MOVING_PACKAGE_ID,
        kind: N2_APARTMENT_MOVING_ACTIVITY_KIND,
        responseKind: 'n2-apartment-moving-v1',
        order: 1,
        nextPackageId: 'n2-home-life-opening-02-ppoi',
        provenance: N2_APARTMENT_MOVING_PROVENANCE,
        sourceQuestionId: N2_APARTMENT_MOVING_PROVENANCE.sourceId,
        introduces: concept,
        recycles: ['vocabulary:n3-home-and-distance'],
        prerequisite: n2OpeningPrerequisite('vocabulary:n3-home-and-distance', '家、方角、距離の基本語を使ったことがある。', 'Has used basic home, direction, and distance vocabulary.'),
        prompt: localizedText('住まいと引っ越しの条件を読み、行動に結び付けましょう。', 'Read home and moving conditions and connect them to actions.'),
        instructionTitle: localizedText('物件と引っ越しの二つの語彙棚', 'Two vocabulary shelves: property and moving'),
        instructionEntries: [
            n2OpeningInstruction('家賃・敷金・礼金', 'Separate monthly rent, refundable deposit, and non-refundable key money.'),
            n2OpeningInstruction('徒歩・築年数・南向き', 'Read walking time, building age, and orientation as separate conditions.'),
            n2OpeningInstruction('荷造り・段ボール・粗大ごみ', 'Connect packing, boxes, and bulky waste to moving actions.'),
        ],
        contentTitle: localizedText('美咲さんのアパート探しと引っ越しメモ', 'Misaki’s apartment search and moving note'),
        paragraphs: N2_APARTMENT_MOVING_PARAGRAPHS,
        questions: [
            choiceQuestion('housing-fit', '美咲さんの希望をすべて満たす物件はどれですか。', 'Which property meets all of Misaki’s conditions?', [
                choiceOption('aoba', '青葉ハイツ', 'Aoba Heights'),
                choiceOption('kawahara', '川原メゾン', 'Kawahara Maison'),
                choiceOption('chuo', '中央コーポ', 'Chuo Court'),
            ], 'aoba', 'housing-fit'),
            typedQuestion('housing-direction', '窓が南に向いていることを物件情報では何と言いますか。', 'What property-listing term means that the windows face south?', '物件情報の語', 'Property-listing term', ['南向き', 'みなみむき'], 'housing-direction'),
            choiceQuestion('housing-cost', '契約時に預け、条件により退去後に戻ることがあるお金はどれですか。', 'Which payment may be returned after moving out?', [
                choiceOption('rent', '家賃', 'rent'),
                choiceOption('deposit', '敷金', 'deposit'),
                choiceOption('key-money', '礼金', 'key money'),
            ], 'deposit', 'housing-cost'),
            choiceQuestion('moving-waste', '古い本棚のように、普通のごみ袋に入らない物は何と呼びますか。', 'What is an old bookcase that does not fit in a normal rubbish bag called?', [
                choiceOption('bulky', '粗大ごみ', 'bulky waste'),
                choiceOption('packing', '荷造り', 'packing'),
                choiceOption('padding', '緩衝材', 'packing material'),
            ], 'bulky', 'moving-waste'),
        ],
        feedback: n2OpeningFeedback(
            '物件条件と引っ越し作業を別々に照合できました。',
            'You checked property conditions and moving tasks separately.',
            '条件か作業かを分け、数字、費用、方角、道具、ごみの順に戻しましょう。',
            'Separate conditions from tasks, then revisit figures, costs, orientation, tools, and waste.',
            '「徒歩10分以内」なら8分は満たしますが12分は満たしません。',
            'For “within ten minutes on foot,” eight minutes qualifies and twelve does not.',
            '本は段ボールに詰め、古い本棚は粗大ごみとして申し込みます。',
            'Books go in boxes; an old bookcase is arranged as bulky waste.',
        ),
        reviewTargets: [
            n2OpeningReview(N2_APARTMENT_MOVING_PACKAGE_ID, 'south-facing', concept, '南向き', 'みなみむき', ['south-facing'], N2_APARTMENT_MOVING_PARAGRAPHS[1], ['housing-fit', 'housing-direction']),
            n2OpeningReview(N2_APARTMENT_MOVING_PACKAGE_ID, 'deposit', concept, '敷金', 'しききん', ['refundable rental deposit'], N2_APARTMENT_MOVING_PARAGRAPHS[1], ['housing-cost']),
            n2OpeningReview(N2_APARTMENT_MOVING_PACKAGE_ID, 'bulky-waste', concept, '粗大ごみ', 'そだいごみ', ['bulky waste'], N2_APARTMENT_MOVING_PARAGRAPHS[4], ['moving-waste']),
        ],
        miningRequests: [
            n2OpeningMining('南向き', N2_APARTMENT_MOVING_PARAGRAPHS[1], 'Yomu original N2 housing comparison', [concept]),
            n2OpeningMining('粗大ごみ', N2_APARTMENT_MOVING_PARAGRAPHS[4], 'Yomu original N2 moving note', [concept]),
        ],
    });
}
