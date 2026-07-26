import {
    convertHiraganaToKatakana,
    convertRomajiToKana,
} from '../../reader/newtab/japanese-input';

const EMAIL_LIKE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const KATAKANA_NAME_RE = /^[\p{Script=Katakana}ー・\s]+$/u;
const HIRAGANA_NAME_RE = /^[\p{Script=Hiragana}ー・\s]+$/u;
const ROMAJI_NAME_RE = /^[a-z][a-z' -]*$/iu;

const KNOWN_KATAKANA_NAMES: Readonly<Record<string, string>> = Object.freeze({
    aakash: 'アーカッシュ',
    alex: 'アレックス',
    andrew: 'アンドリュー',
    anna: 'アンナ',
    brian: 'ブライアン',
    christian: 'クリスチャン',
    daniel: 'ダニエル',
    david: 'デイビッド',
    edward: 'エドワード',
    emily: 'エミリー',
    felix: 'フェリックス',
    francis: 'フランシス',
    george: 'ジョージ',
    henry: 'ヘンリー',
    james: 'ジェームズ',
    jenny: 'ジェニー',
    john: 'ジョン',
    joseph: 'ジョセフ',
    karen: 'カレン',
    kevin: 'ケビン',
    maria: 'マリア',
    mary: 'メアリー',
    michael: 'マイケル',
    mika: 'ミカ',
    mina: 'ミナ',
    mira: 'ミラ',
    nicholas: 'ニコラス',
    paul: 'ポール',
    peter: 'ピーター',
    richard: 'リチャード',
    rie: 'リエ',
    riku: 'リク',
    robert: 'ロバート',
    rose: 'ローズ',
    sam: 'サム',
    shaun: 'ショーン',
    sophie: 'ソフィー',
    steve: 'スティーブ',
    steven: 'スティーブン',
    susan: 'スーザン',
    takeshi: 'タケシ',
    thomas: 'トーマス',
    tom: 'トム',
    william: 'ウィリアム',
    xingyu: 'シンユ',
});

export interface KatakanaNameDraft {
    readonly usualName: string;
    readonly katakana: string | null;
    readonly source: 'already-katakana' | 'hiragana' | 'known-name' | 'romaji' | 'unavailable';
}

/** Account identifiers are not learner names. Keep the naming moment deliberate. */
export function profileNameForEditing(value: string | null | undefined): string {
    const name = normalizeName(value ?? '');
    if (!name || EMAIL_LIKE_RE.test(name) || /^(?:learner|student|you)$/iu.test(name)) return '';
    return name;
}

/**
 * Gives the learner an editable first draft, never an authoritative reading.
 * Unknown English spellings stay untouched rather than inventing a confident pronunciation.
 */
export function createKatakanaNameDraft(value: string): KatakanaNameDraft {
    const usualName = normalizeName(value);
    if (!usualName) return Object.freeze({ usualName: '', katakana: null, source: 'unavailable' });
    if (KATAKANA_NAME_RE.test(usualName)) {
        return Object.freeze({ usualName, katakana: usualName, source: 'already-katakana' });
    }
    if (HIRAGANA_NAME_RE.test(usualName)) {
        return Object.freeze({
            usualName,
            katakana: convertHiraganaToKatakana(usualName),
            source: 'hiragana',
        });
    }
    if (!ROMAJI_NAME_RE.test(usualName)) {
        return Object.freeze({ usualName, katakana: null, source: 'unavailable' });
    }

    const words = usualName.toLowerCase().split(/[\s-]+/u).filter(Boolean);
    const known = words.map(word => KNOWN_KATAKANA_NAMES[word]);
    if (known.every(Boolean)) {
        return Object.freeze({
            usualName,
            katakana: known.join('・'),
            source: 'known-name',
        });
    }

    const converted = words.map(word => convertHiraganaToKatakana(convertRomajiToKana(word)));
    if (converted.every(word => word && !/[a-z]/iu.test(word))) {
        return Object.freeze({
            usualName,
            katakana: converted.join('・'),
            source: 'romaji',
        });
    }
    return Object.freeze({ usualName, katakana: null, source: 'unavailable' });
}

function normalizeName(value: string): string {
    return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}
