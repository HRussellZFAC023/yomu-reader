import type { LocalizedText } from '../domain/source-library';

export const LESSON_ZERO_HIRAGANA_BOOTCAMP_ID =
    'activity:lesson-zero-hiragana-bootcamp' as const;
export const LESSON_ZERO_HIRAGANA_SESSION_ID =
    'session:lesson-zero-hiragana-bootcamp' as const;

export interface LessonZeroHiraganaItem {
    readonly id: string;
    readonly kana: string;
    readonly romaji: string;
    readonly acceptedRomaji: readonly string[];
    readonly conceptId: string;
}

export interface LessonZeroHiraganaRow {
    readonly id: string;
    readonly label: LocalizedText;
    readonly cue: LocalizedText;
    readonly itemIds: readonly string[];
}

export interface LessonZeroHiraganaDefinition {
    readonly schemaVersion: 1;
    readonly id: typeof LESSON_ZERO_HIRAGANA_SESSION_ID;
    readonly activityId: typeof LESSON_ZERO_HIRAGANA_BOOTCAMP_ID;
    readonly items: readonly LessonZeroHiraganaItem[];
    readonly rows: readonly LessonZeroHiraganaRow[];
    readonly masteryOrder: readonly string[];
}

const ROWS = [
    row('a', 'あ-row', 'あ行', 'Learn the large sound. The word and picture are clues.', '大きい音を覚えます。ことばと絵はヒントです。', [
        item('a', 'あ', 'a'),
        item('i', 'い', 'i'),
        item('u', 'う', 'u'),
        item('e', 'え', 'e'),
        item('o', 'お', 'o'),
    ]),
    row('k', 'K-row', 'か行', 'Add k.', 'k の音を足します。', [
        item('ka', 'か', 'ka'),
        item('ki', 'き', 'ki'),
        item('ku', 'く', 'ku'),
        item('ke', 'け', 'ke'),
        item('ko', 'こ', 'ko'),
    ]),
    row('s', 'S-row', 'さ行', 'Add s. し is shi.', 's の音を足します。し は shi です。', [
        item('sa', 'さ', 'sa'),
        item('shi', 'し', 'shi', ['si']),
        item('su', 'す', 'su'),
        item('se', 'せ', 'se'),
        item('so', 'そ', 'so'),
    ]),
    row('t', 'T-row', 'た行', 'Add t. ち is chi; つ is tsu.', 't の音を足します。ち は chi、つ は tsu です。', [
        item('ta', 'た', 'ta'),
        item('chi', 'ち', 'chi', ['ti']),
        item('tsu', 'つ', 'tsu', ['tu']),
        item('te', 'て', 'te'),
        item('to', 'と', 'to'),
    ]),
    row('n', 'N-row', 'な行', 'Add n.', 'n の音を足します。', [
        item('na', 'な', 'na'),
        item('ni', 'に', 'ni'),
        item('nu', 'ぬ', 'nu'),
        item('ne', 'ね', 'ne'),
        item('no', 'の', 'no'),
    ]),
    row('h', 'H-row', 'は行', 'Add h. ふ is fu.', 'h の音を足します。ふ は fu です。', [
        item('ha', 'は', 'ha'),
        item('hi', 'ひ', 'hi'),
        item('fu', 'ふ', 'fu', ['hu']),
        item('he', 'へ', 'he'),
        item('ho', 'ほ', 'ho'),
    ]),
    row('m', 'M-row', 'ま行', 'Add m.', 'm の音を足します。', [
        item('ma', 'ま', 'ma'),
        item('mi', 'み', 'mi'),
        item('mu', 'む', 'mu'),
        item('me', 'め', 'me'),
        item('mo', 'も', 'mo'),
    ]),
    row('y', 'Y-row', 'や行', 'Three sounds: ya, yu, yo.', '三つの音です。ya、yu、yo。', [
        item('ya', 'や', 'ya'),
        item('yu', 'ゆ', 'yu'),
        item('yo', 'よ', 'yo'),
    ]),
    row('r', 'R-row', 'ら行', 'Add a light Japanese r.', '軽い日本語の r の音を足します。', [
        item('ra', 'ら', 'ra'),
        item('ri', 'り', 'ri'),
        item('ru', 'る', 'ru'),
        item('re', 'れ', 're'),
        item('ro', 'ろ', 'ro'),
    ]),
    row('w', 'W-row + ん', 'わ行＋ん', 'Finish with wa, o, and n.', '最後は wa、o、n です。', [
        item('wa', 'わ', 'wa'),
        item('wo', 'を', 'o', ['wo']),
        item('n', 'ん', 'n', ["n'"]),
    ]),
] as const;

const ITEMS = ROWS.flatMap(candidate => candidate.items);

/**
 * The final recall changes the chart order. It runs down the vowel columns,
 * then closes on ん, so a learner cannot pass by memorising ten visible rows.
 */
const MASTERY_ROMAJI_ORDER = [
    'a', 'ka', 'sa', 'ta', 'na', 'ha', 'ma', 'ya', 'ra', 'wa',
    'i', 'ki', 'shi', 'chi', 'ni', 'hi', 'mi', 'ri',
    'u', 'ku', 'su', 'tsu', 'nu', 'fu', 'mu', 'yu', 'ru',
    'e', 'ke', 'se', 'te', 'ne', 'he', 'me', 're',
    'o', 'ko', 'so', 'to', 'no', 'ho', 'mo', 'yo', 'ro', 'wo',
    'n',
] as const;

export const LESSON_ZERO_BASIC_HIRAGANA_COUNT = ITEMS.length;

export function createLessonZeroHiraganaDefinition(): LessonZeroHiraganaDefinition {
    const itemByRomaji = new Map(ITEMS.map(candidate => [candidate.romaji === 'o' && candidate.kana === 'を'
        ? 'wo'
        : candidate.romaji, candidate]));
    const masteryOrder = MASTERY_ROMAJI_ORDER.map(romaji => {
        const candidate = itemByRomaji.get(romaji);
        if (!candidate) throw new TypeError(`Missing hiragana mastery item: ${romaji}`);
        return candidate.id;
    });
    return Object.freeze({
        schemaVersion: 1,
        id: LESSON_ZERO_HIRAGANA_SESSION_ID,
        activityId: LESSON_ZERO_HIRAGANA_BOOTCAMP_ID,
        items: Object.freeze(ITEMS.map(candidate => Object.freeze({
            id: candidate.id,
            kana: candidate.kana,
            romaji: candidate.romaji,
            acceptedRomaji: Object.freeze([...candidate.acceptedRomaji]),
            conceptId: candidate.conceptId,
        }))),
        rows: Object.freeze(ROWS.map(candidate => Object.freeze({
            id: candidate.id,
            label: Object.freeze({ ...candidate.label }),
            cue: Object.freeze({ ...candidate.cue }),
            itemIds: Object.freeze(candidate.items.map(candidateItem => candidateItem.id)),
        }))),
        masteryOrder: Object.freeze(masteryOrder),
    });
}

function item(
    romaji: string,
    kana: string,
    displayRomaji: string,
    alternatives: readonly string[] = [],
): LessonZeroHiraganaItem {
    return Object.freeze({
        id: `hira-${romaji}`,
        kana,
        romaji: displayRomaji,
        acceptedRomaji: Object.freeze([displayRomaji, ...alternatives]),
        conceptId: `concept:hiragana-${romaji}`,
    });
}

function row(
    id: string,
    en: string,
    ja: string,
    cueEn: string,
    cueJa: string,
    items: readonly LessonZeroHiraganaItem[],
): LessonZeroHiraganaRow & { readonly items: readonly LessonZeroHiraganaItem[] } {
    return Object.freeze({
        id: `hiragana-row-${id}`,
        label: Object.freeze({ en, ja }),
        cue: Object.freeze({ en: cueEn, ja: cueJa }),
        itemIds: Object.freeze(items.map(candidate => candidate.id)),
        items: Object.freeze(items),
    });
}
