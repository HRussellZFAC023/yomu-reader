import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { ShopCounterModel } from '../minigames/shop-counter';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

export function createLessonSevenShopCounterBeat(): LessonActivityBeat {
    const activity: ShopCounterModel = {
        id: 'activity:l1-l07-shop-counter',
        kind: 'academy-shop-counter',
        responseKind: 'visual-shop-counter',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: [
            'concept:l1-l07:shirt-price',
            'concept:l1-l07:cd-price',
            'concept:l1-l07:bag-price',
            'concept:l1-l07:kudasai',
        ],
        prompt: {
            ja: '三つの レジ券で、しょうひん・ねふだ・ことばを そろえましょう。',
            en: 'Complete the three shop tickets from the lesson.',
        },
        payload: {
            products: [
                { id: 'shirt', label: 'シャツ', visual: 'shirt' },
                { id: 'cd', label: 'CD', visual: 'cd' },
                { id: 'bag', label: 'かばん', visual: 'bag' },
            ],
            rounds: [
                {
                    id: 'aakash-shirt',
                    sourceQuestionId: 'l1-l07/ex-listen-detail',
                    prompt: {
                        ja: 'アーカッシュの レシートを なおしましょう。',
                        en: 'Rebuild Aakash’s receipt from the shop dialogue.',
                    },
                    priceOptions: prices(),
                    correctProductId: 'shirt',
                    correctPriceId: '3000',
                    errorTags: { product: 'shop-shirt-product', price: 'shop-shirt-price' },
                },
                {
                    id: 'tom-cd',
                    sourceQuestionId: 'l1-l07/ex-read-price',
                    prompt: {
                        ja: 'トムの おすすめの ものを レジに おきましょう。',
                        en: 'Set up the item from Tom’s shop note.',
                    },
                    priceOptions: prices(),
                    correctProductId: 'cd',
                    correctPriceId: '1000',
                    errorTags: { product: 'shop-cd-product', price: 'shop-cd-price' },
                },
                {
                    id: 'bag-checkout',
                    sourceQuestionId: 'l1-l07/ex-ikura-cloze',
                    prompt: {
                        ja: 'かばんの ねふだと、レジで いう ことばを そろえましょう。',
                        en: 'Finish the final checkout ticket.',
                    },
                    priceOptions: prices(),
                    correctProductId: 'bag',
                    correctPriceId: '8000',
                    request: {
                        sourceQuestionId: 'l1-l07/ex-kudasai',
                        options: [
                            { id: 'where', label: 'この かばんは どこですか。' },
                            { id: 'how-much', label: 'この かばんは いくらですか。' },
                            { id: 'buy-bag', label: 'この かばんを ください。' },
                        ],
                        correctOptionId: 'buy-bag',
                    },
                    errorTags: {
                        product: 'shop-bag-product',
                        price: 'shop-bag-price',
                        request: 'shop-bag-request',
                    },
                },
            ],
            passScore: 1,
            feedback: {
                pass: {
                    explanation: {
                        ja: '三つの レジ券で、しょうひん・ねふだ・おねがいが そろいました。',
                        en: 'All three tickets now match their item, price, and checkout language.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: 'レジ券の どこかに、ちがう しょうひん・ねふだ・ことばが あります。',
                        en: 'At least one ticket has the wrong item, price, or request.',
                    },
                    repairPrompt: {
                        ja: '会話と みせの メモを もう一度見て、ちがう ところだけ なおしましょう。',
                        en: 'Check the dialogue and shop note, then repair only the mismatched choices.',
                    },
                    nearbyExample: {
                        ja: 'ねだんは「〜えん」、かう ときは「〜を ください」です。',
                        en: 'A price ends in 〜えん; a purchase request uses 〜を ください.',
                    },
                },
            },
            reviewTargets: [
                {
                    id: 'review:l1-l07:shirt-price',
                    conceptId: 'concept:l1-l07:shirt-price',
                    expression: 'シャツは ３，０００えん',
                    meanings: ['the shirt is 3,000 yen'],
                    sourceQuestionId: 'l1-l07/ex-listen-detail',
                    errorTags: ['shop-shirt-product', 'shop-shirt-price'],
                },
                {
                    id: 'review:l1-l07:cd-price',
                    conceptId: 'concept:l1-l07:cd-price',
                    expression: 'どれも １，０００えん',
                    meanings: ['each one is 1,000 yen'],
                    sourceQuestionId: 'l1-l07/ex-read-price',
                    errorTags: ['shop-cd-product', 'shop-cd-price'],
                },
                {
                    id: 'review:l1-l07:bag-price',
                    conceptId: 'concept:l1-l07:bag-price',
                    expression: 'この かばんは いくらですか。８，０００えんです。',
                    meanings: ['how much is this bag? It is 8,000 yen'],
                    sourceQuestionId: 'l1-l07/ex-ikura-cloze',
                    errorTags: ['shop-bag-product', 'shop-bag-price'],
                },
                {
                    id: 'review:l1-l07:kudasai',
                    conceptId: 'concept:l1-l07:kudasai',
                    expression: 'この かばんを ください',
                    meanings: ['this bag, please'],
                    sourceQuestionId: 'l1-l07/ex-kudasai',
                    errorTags: ['shop-bag-request'],
                },
            ],
        },
    };
    return {
        id: 'shop-counter',
        narrative: {
            ja: 'ロバートが カフェの れんしゅうレジに、三つの レジ券と ねふだを ならべます。',
            en: 'Robert lays three practice tickets and their price tags on the Academy cafe counter.',
        },
        activity,
    };
}

function prices() {
    return [
        { id: '1000', label: '１，０００えん' },
        { id: '3000', label: '３，０００えん' },
        { id: '8000', label: '８，０００えん' },
    ] as const;
}
