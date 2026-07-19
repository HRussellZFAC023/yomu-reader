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
import { N2_MOVING_COUPON_PROVENANCE } from './source';
import { N2_MOVING_COUPON_ACTIVITY_KIND, N2_MOVING_COUPON_PACKAGE_ID, type N2MovingCouponPackage } from './types';

export const N2_MOVING_COUPON_PARAGRAPHS = Object.freeze([
    '青葉生活店「引っ越し用品20%割引券」：有効期限は4月30日です。青葉生活店の本店だけで利用できます。',
    '段ボール箱、ガムテープ、食器用の緩衝材が割引の対象です。家電製品、配送料、粗大ごみ処理券には使えません。',
    '会計の前にこの券を店員に見せてください。利用は一人一回までです。ほかの割引券との併用はできません。',
]);

export function createN2MovingCouponPackage(): N2MovingCouponPackage {
    const concept = 'reading:n2-practical-constraints';
    const actions = [
        orderingAction('check', '期限と対象商品を確認する', 'Check the deadline and eligible items'),
        orderingAction('choose', '対象の引っ越し用品を選ぶ', 'Choose eligible moving supplies'),
        orderingAction('show', '会計の前に券を見せる', 'Show the coupon before payment'),
    ];
    return createN2OpeningPackage({
        id: N2_MOVING_COUPON_PACKAGE_ID,
        kind: N2_MOVING_COUPON_ACTIVITY_KIND,
        responseKind: 'n2-moving-coupon-v1',
        order: 3,
        previousPackageId: 'n2-home-life-opening-02-ppoi',
        nextPackageId: 'n2-home-life-opening-04-reader',
        provenance: N2_MOVING_COUPON_PROVENANCE,
        sourceQuestionId: N2_MOVING_COUPON_PROVENANCE.sourceId,
        introduces: concept,
        recycles: ['vocabulary:n2-home-and-moving', 'grammar:n2-ppoi-evaluation'],
        prerequisite: n2OpeningPrerequisite('grammar:n2-ppoi-evaluation', '事実と見た印象を分けられる。', 'Can separate a fact from an impression.', 'n2-home-life-opening-02-ppoi'),
        prompt: localizedText('割引券の期限、対象、例外、使う順番を取り出しましょう。', 'Retrieve the coupon deadline, eligibility, exceptions, and use order.'),
        instructionTitle: localizedText('身の回りの文書は条件語から読む', 'Read everyday documents through constraint words'),
        instructionEntries: [
            n2OpeningInstruction('有効期限・〜まで', 'Locate the last valid date before reading every detail.'),
            n2OpeningInstruction('対象・〜には使えません', 'Keep eligible items separate from exclusions.'),
            n2OpeningInstruction('会計の前・一人一回・併用不可', 'Track timing, frequency, and combination rules independently.'),
        ],
        contentTitle: localizedText('引っ越し用品20%割引券', '20% off moving supplies'),
        paragraphs: N2_MOVING_COUPON_PARAGRAPHS,
        questions: [
            choiceQuestion('notice-eligible', 'この券で割引になる組み合わせはどれですか。', 'Which pair is eligible for the discount?', [
                choiceOption('boxes-tape', '段ボール箱とガムテープ', 'cardboard boxes and packing tape'),
                choiceOption('appliance-delivery', '家電製品と配送料', 'an appliance and delivery charge'),
                choiceOption('sticker-delivery', '粗大ごみ処理券と配送料', 'a bulky-waste sticker and delivery charge'),
            ], 'boxes-tape', 'notice-eligible'),
            choiceQuestion('notice-combination', 'この券の使い方として正しいものはどれですか。', 'Which use is permitted?', [
                choiceOption('before-payment', '4月30日までに、会計の前に一度だけ見せる。', 'Show it once before payment by 30 April.'),
                choiceOption('after-payment', '会計が終わった後で見せる。', 'Show it after payment.'),
                choiceOption('combine', 'ほかの割引券と一緒に使う。', 'Combine it with another coupon.'),
            ], 'before-payment', 'notice-combination'),
            orderingQuestion('notice-order', '券を使う流れを正しい順番にしてください。', 'Put the coupon-use process in order.', actions,
                ['show', 'check', 'choose'], ['check', 'choose', 'show'], 'notice-order'),
        ],
        feedback: n2OpeningFeedback(
            '期限、対象外、回数、併用、提示のタイミングを行動に戻せました。',
            'You turned the deadline, exclusions, frequency, combination rule, and timing into actions.',
            '「いつ・何に・何回・ほかと一緒に・いつ見せる」を五行に分けてください。',
            'Split the notice into when, what, how often, combination, and when to show it.',
            '条件語に印を付けてから、支払いまでの行動だけを並べ直してください。',
            'Mark the constraint words, then reorder only the actions leading to payment.',
            '「会計の前に提示」は、商品を選んだ後、支払う前です。',
            '“Present before checkout” means after choosing the goods and before paying.',
        ),
        reviewTargets: [
            n2OpeningReview(N2_MOVING_COUPON_PACKAGE_ID, 'expiry', concept, '有効期限', 'ゆうこうきげん', ['expiry date'], N2_MOVING_COUPON_PARAGRAPHS[0], ['notice-order']),
            n2OpeningReview(N2_MOVING_COUPON_PACKAGE_ID, 'eligible', concept, '割引の対象', 'わりびきのたいしょう', ['eligible for the discount'], N2_MOVING_COUPON_PARAGRAPHS[1], ['notice-eligible']),
            n2OpeningReview(N2_MOVING_COUPON_PACKAGE_ID, 'combine', concept, '併用はできません', 'へいようはできません', ['cannot be combined'], N2_MOVING_COUPON_PARAGRAPHS[2], ['notice-combination']),
        ],
        miningRequests: [
            n2OpeningMining('有効期限', N2_MOVING_COUPON_PARAGRAPHS[0], 'Yomu original N2 moving-supplies coupon', [concept]),
            n2OpeningMining('併用はできません', N2_MOVING_COUPON_PARAGRAPHS[2], 'Yomu original N2 moving-supplies coupon', [concept]),
        ],
    });
}
