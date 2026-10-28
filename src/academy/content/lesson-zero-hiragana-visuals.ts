const LESSON_ZERO_HIRAGANA_VISUAL_BASE_PATH =
    '/academy/art/lesson-zero/hiragana-anchors' as const;

export type LessonZeroHiraganaAnchorKind =
    | 'word-start'
    | 'object-particle'
    | 'word-internal';

export interface LessonZeroHiraganaVisualAnchor {
    readonly itemId: string;
    readonly kana: string;
    readonly kind: LessonZeroHiraganaAnchorKind;
    readonly wordJa: string;
    readonly reading: string;
    readonly pronunciation: string;
    readonly meaningEn: string;
    readonly imagePath: string;
    readonly imageAlt: string;
    readonly noteEn?: string;
}

function anchor(
    itemId: string,
    kana: string,
    wordJa: string,
    reading: string,
    pronunciation: string,
    meaningEn: string,
    imageAlt: string,
): LessonZeroHiraganaVisualAnchor {
    return Object.freeze({
        itemId,
        kana,
        kind: 'word-start',
        wordJa,
        reading,
        pronunciation,
        meaningEn,
        imagePath: `${LESSON_ZERO_HIRAGANA_VISUAL_BASE_PATH}/${itemId}.webp`,
        imageAlt,
    });
}

export const LESSON_ZERO_HIRAGANA_VISUAL_ANCHORS = Object.freeze([
    anchor('hira-a', 'あ', '朝', 'あさ', 'asa', 'morning', 'The morning sun rising over rooftops.'),
    anchor('hira-i', 'い', '犬', 'いぬ', 'inu', 'dog', 'A friendly dog sitting down.'),
    anchor('hira-u', 'う', '海', 'うみ', 'umi', 'sea', 'An ocean wave beneath a blue sky.'),
    anchor('hira-e', 'え', '絵本', 'えほん', 'ehon', 'picture book', 'An open picture book with colourful pictures.'),
    anchor('hira-o', 'お', 'お茶', 'おちゃ', 'ocha', 'tea', 'A warm cup of Japanese tea.'),

    anchor('hira-ka', 'か', '傘', 'かさ', 'kasa', 'umbrella', 'An open red umbrella.'),
    anchor('hira-ki', 'き', '木', 'き', 'ki', 'tree', 'A leafy green tree.'),
    anchor('hira-ku', 'く', '靴', 'くつ', 'kutsu', 'shoe', 'A walking shoe.'),
    anchor('hira-ke', 'け', '毛糸', 'けいと', 'keito', 'yarn', 'A ball of coral yarn.'),
    anchor('hira-ko', 'こ', 'こま', 'こま', 'koma', 'spinning top', 'A traditional spinning top.'),

    anchor('hira-sa', 'さ', '魚', 'さかな', 'sakana', 'fish', 'A fish viewed from the side.'),
    anchor('hira-shi', 'し', '塩', 'しお', 'shio', 'salt', 'A ceramic bowl filled with salt.'),
    anchor('hira-su', 'す', 'すいか', 'すいか', 'suika', 'watermelon', 'A watermelon with a cut red slice.'),
    anchor('hira-se', 'せ', '蝉', 'せみ', 'semi', 'cicada', 'A cicada resting on a branch.'),
    anchor('hira-so', 'そ', '空', 'そら', 'sora', 'sky', 'A blue sky with soft white clouds.'),

    anchor('hira-ta', 'た', '卵', 'たまご', 'tamago', 'egg', 'A brown egg beside a cracked shell.'),
    anchor('hira-chi', 'ち', '地図', 'ちず', 'chizu', 'map', 'An unfolded map with roads and a river.'),
    anchor('hira-tsu', 'つ', '月', 'つき', 'tsuki', 'moon', 'A bright crescent moon in the evening sky.'),
    anchor('hira-te', 'て', '手', 'て', 'te', 'hand', 'An open hand with the palm facing forward.'),
    anchor('hira-to', 'と', '時計', 'とけい', 'tokei', 'clock', 'A round coral alarm clock.'),

    anchor('hira-na', 'な', '梨', 'なし', 'nashi', 'pear', 'A golden Japanese pear with one leaf.'),
    anchor('hira-ni', 'に', '人参', 'にんじん', 'ninjin', 'carrot', 'An orange carrot with green leaves.'),
    anchor('hira-nu', 'ぬ', 'ぬいぐるみ', 'ぬいぐるみ', 'nuigurumi', 'stuffed toy', 'A soft teddy bear toy.'),
    anchor('hira-ne', 'ね', '猫', 'ねこ', 'neko', 'cat', 'A calm house cat sitting down.'),
    anchor('hira-no', 'の', '海苔', 'のり', 'nori', 'seaweed', 'Roasted seaweed sheets on a wooden tray.'),

    anchor('hira-ha', 'は', '花', 'はな', 'hana', 'flower', 'A red flower with green leaves.'),
    anchor('hira-hi', 'ひ', '火', 'ひ', 'hi', 'fire', 'A small campfire burning over logs.'),
    anchor('hira-fu', 'ふ', '船', 'ふね', 'fune', 'boat', 'A small wooden sailboat on water.'),
    anchor('hira-he', 'へ', '蛇', 'へび', 'hebi', 'snake', 'A green snake in a clear S shape.'),
    anchor('hira-ho', 'ほ', '本', 'ほん', 'hon', 'book', 'A closed blue book with a ribbon bookmark.'),

    anchor('hira-ma', 'ま', '窓', 'まど', 'mado', 'window', 'A wooden window looking out onto blue sky.'),
    anchor('hira-mi', 'み', 'みかん', 'みかん', 'mikan', 'mandarin orange', 'A mandarin orange beside a peeled segment.'),
    anchor('hira-mu', 'む', '虫', 'むし', 'mushi', 'insect', 'A red and black ladybird beetle.'),
    anchor('hira-me', 'め', '眼鏡', 'めがね', 'megane', 'glasses', 'A pair of round eyeglasses.'),
    anchor('hira-mo', 'も', '桃', 'もも', 'momo', 'peach', 'A ripe pink peach with one leaf.'),

    anchor('hira-ya', 'や', '山', 'やま', 'yama', 'mountain', 'A green mountain with a snowy peak.'),
    anchor('hira-yu', 'ゆ', '雪', 'ゆき', 'yuki', 'snow', 'Snow falling around an evergreen tree.'),
    anchor('hira-yo', 'よ', '夜', 'よる', 'yoru', 'night', 'A starry night sky over a quiet roof.'),

    anchor('hira-ra', 'ら', 'ラッパ', 'らっぱ', 'rappa', 'trumpet', 'A polished brass trumpet.'),
    anchor('hira-ri', 'り', 'りんご', 'りんご', 'ringo', 'apple', 'A red apple with one green leaf.'),
    anchor('hira-ru', 'る', '留守番', 'るすばん', 'rusuban', 'house-sitting', 'Someone watering a plant while looking after a home.'),
    anchor('hira-re', 'れ', '冷蔵庫', 'れいぞうこ', 'reizouko', 'refrigerator', 'An open teal refrigerator.'),
    anchor('hira-ro', 'ろ', 'ろうそく', 'ろうそく', 'rousoku', 'candle', 'A lit beeswax candle in a holder.'),

    anchor('hira-wa', 'わ', 'わに', 'わに', 'wani', 'crocodile', 'A crocodile viewed from the side.'),
    Object.freeze({
        itemId: 'hira-wo',
        kana: 'を',
        kind: 'object-particle',
        wordJa: 'りんごを',
        reading: 'りんごを',
        pronunciation: 'ringo o',
        meaningEn: 'apple, marked as the object',
        imagePath: `${LESSON_ZERO_HIRAGANA_VISUAL_BASE_PATH}/hira-wo.webp`,
        imageAlt: 'A hand deliberately picking up a red apple.',
        noteEn: 'を marks the object of an action. Modern Japanese words do not begin with を.',
    }),
    Object.freeze({
        itemId: 'hira-n',
        kana: 'ん',
        kind: 'word-internal',
        wordJa: '新聞',
        reading: 'しんぶん',
        pronunciation: 'shinbun',
        meaningEn: 'newspaper',
        imagePath: `${LESSON_ZERO_HIRAGANA_VISUAL_BASE_PATH}/hira-n.webp`,
        imageAlt: 'A neatly folded newspaper.',
        noteEn: 'ん sits inside or closes a word. Standard Japanese words do not begin with ん.',
    }),
] satisfies readonly LessonZeroHiraganaVisualAnchor[]);

const ANCHOR_BY_ITEM_ID = new Map(
    LESSON_ZERO_HIRAGANA_VISUAL_ANCHORS.map(candidate => [candidate.itemId, candidate]),
);

export function getLessonZeroHiraganaVisualAnchor(
    itemId: string,
): LessonZeroHiraganaVisualAnchor {
    const candidate = ANCHOR_BY_ITEM_ID.get(itemId);
    if (!candidate) {
        throw new TypeError(`Missing Lesson 0 hiragana visual anchor: ${itemId}`);
    }
    return candidate;
}
