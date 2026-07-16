const ROMAJI_RUN_RE = /[a-z]+(?:'[a-z]+)*/giu;
const ROMAJI_LONG_MARK_RE = /([a-z])[-\u2010\u2011]/giu;
const STUDY_ANSWER_PUNCTUATION_RE = /[\u3001\u3002\uff0c\uff0e,.!\uff01?\uff1f\u30fb\u300c\u300d\u300e\u300f\uff08\uff09()\uff3b\uff3d[\]\u3014\u3015\u3010\u3011\u2026\u2025:\uff1a;\uff1b\u301c~"'\u201c\u201d\u2018\u2019]/gu;

const ROMAJI_KANA: Readonly<Record<string, string>> = {
    a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
    ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
    sa: 'さ', shi: 'し', si: 'し', su: 'す', se: 'せ', so: 'そ',
    ta: 'た', chi: 'ち', ti: 'ち', tsu: 'つ', tu: 'つ', te: 'て', to: 'と',
    na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
    ha: 'は', hi: 'ひ', fu: 'ふ', hu: 'ふ', he: 'へ', ho: 'ほ',
    ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
    ya: 'や', yu: 'ゆ', yo: 'よ',
    ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
    wa: 'わ', wo: 'を',
    ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
    za: 'ざ', ji: 'じ', zi: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
    da: 'だ', dji: 'ぢ', di: 'ぢ', dzu: 'づ', du: 'づ', de: 'で', do: 'ど',
    ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
    pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
    kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ',
    gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
    sha: 'しゃ', shu: 'しゅ', sho: 'しょ',
    sya: 'しゃ', syu: 'しゅ', syo: 'しょ',
    ja: 'じゃ', ju: 'じゅ', jo: 'じょ',
    jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ',
    cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ',
    cya: 'ちゃ', cyu: 'ちゅ', cyo: 'ちょ',
    nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
    hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ',
    bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
    pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
    mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
    rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',
    fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ',
    she: 'しぇ', je: 'じぇ', che: 'ちぇ',
    tsa: 'つぁ', tsi: 'つぃ', tse: 'つぇ', tso: 'つぉ',
    thi: 'てぃ', thu: 'てゅ', the: 'てぇ', tho: 'てょ',
    dhi: 'でぃ', dhu: 'でゅ', dhe: 'でぇ', dho: 'でょ',
    wi: 'うぃ', we: 'うぇ', ye: 'いぇ',
    xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ',
    la: 'ぁ', li: 'ぃ', lu: 'ぅ', le: 'ぇ', lo: 'ぉ',
    xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ', lya: 'ゃ', lyu: 'ゅ', lyo: 'ょ',
    xtsu: 'っ', ltsu: 'っ',
    va: 'ゔぁ', vi: 'ゔぃ', vu: 'ゔ', ve: 'ゔぇ', vo: 'ゔぉ',
};

export function convertRomajiToKana(value: string): string {
    return value.normalize('NFKC')
        .replace(/[\u2018\u2019\u02bc]/gu, "'")
        .replace(ROMAJI_LONG_MARK_RE, '$1ー')
        .replace(ROMAJI_RUN_RE, run => transliterateRomajiRun(run.toLowerCase()));
}

export function normalizeJapaneseStudyAnswer(value: string): string {
    return hiraganaFromKatakana(convertRomajiToKana(value))
        .replace(/[\s\u3000]/gu, '')
        .replace(STUDY_ANSWER_PUNCTUATION_RE, '')
        .toLowerCase();
}

function transliterateRomajiRun(run: string): string {
    let output = '';
    let index = 0;
    while (index < run.length) {
        const current = run[index] ?? '';
        const next = run[index + 1] ?? '';
        if (current === 'n' && next === "'") {
            output += 'ん';
            index += 2;
            continue;
        }
        if (run.slice(index, index + 3) === 'tch') {
            output += 'っ';
            index += 1;
            continue;
        }
        if (isGeminatedConsonant(current, next)) {
            output += 'っ';
            index += 1;
            continue;
        }
        if (current === 'n' && (!next || next === 'n' || !/[aeiouy]/u.test(next))) {
            output += 'ん';
            index += 1;
            continue;
        }
        const match = longestRomajiMatch(run, index);
        if (match) {
            output += match.kana;
            index += match.length;
            continue;
        }
        output += current;
        index += 1;
    }
    return output;
}

function longestRomajiMatch(run: string, index: number): { kana: string; length: number } | null {
    for (const length of [4, 3, 2, 1]) {
        const romaji = run.slice(index, index + length);
        const kana = ROMAJI_KANA[romaji];
        if (kana) return { kana, length };
    }
    return null;
}

function isGeminatedConsonant(current: string, next: string): boolean {
    return Boolean(current && current === next && /[bcdfghjklmpqrstvwxyz]/u.test(current) && current !== 'n');
}

function hiraganaFromKatakana(value: string): string {
    return value.replace(/[\u30a1-\u30f6]/gu, character => String.fromCharCode(character.charCodeAt(0) - 0x60));
}
