import { CEFR_GRAMMAR_LEVEL_SCALE } from './cefr-grammar';
import { createLearningTargetGrammar } from './grammar';

const GOETHE_A1 = 'https://lernen.goethe.de/deutschonline/A1/PDF/DE/deutschonline_Ihr_Kurs_im_U%CC%88berblick.pdf';
const DW_A1 = 'https://static.dw.com/downloads/59835913/grammatikuebersicht-nicos-weg-a1.pdf';
const GOETHE_GRAMMAR = 'https://www.goethe.de/ins/de/de/m/prf/grm.html';
const CLOCK_HOUR = String.raw`(?:(?:[01]?\d|2[0-3])|eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf)`;
const COLON_TIME = String.raw`(?:[01]?\d|2[0-3]):[0-5]\d`;
const CLOCK_RANGE = String.raw`(?:${CLOCK_HOUR}\s+Uhr\s+bis\s+${CLOCK_HOUR}(?:\s+Uhr)?|${CLOCK_HOUR}\s+bis\s+${CLOCK_HOUR}\s+Uhr|${COLON_TIME}\s+bis\s+${COLON_TIME})`;
// `so gut wie` also means “almost”, so the lexical idiom is outside this
// checked comparison inventory.
const EQUAL_COMPARISON_WORD = String.raw`(?:schlecht|groß|klein|alt|jung|schnell|langsam|hoch|niedrig|lang|kurz)`;
const COMPARISON_SUBJECT = String.raw`(?:der|die|das|ein|eine|einen|einem|einer|mein|meine|dein|deine|sein|seine|ihr|ihre|unser|unsere)\s+\p{L}+`;
// These three infinitives are visible in the linked Goethe A1 material. A
// suffix guess also accepts capitalized nouns such as Garten, so it is not a
// safe grammar detector.
const CHECKED_MODAL_INFINITIVE = String.raw`(?:gehen|kommen|sein)`;
const MODAL_CLAUSE_GAP = String.raw`(?:(?![,;:]|(?<!\p{L})(?:aber|dass|denn|oder|sondern|und)(?!\p{L}))[^.!?…\n]){0,80}?`;

/** Checked A1 constructions from Goethe-Institut and Deutsche Welle curricula. */
export const GERMAN_GRAMMAR = createLearningTargetGrammar({
    levelScale: CEFR_GRAMMAR_LEVEL_SCALE,
    referenceUrl: GOETHE_GRAMMAR,
    rules: [
        {
            ruleId: 'de-a1-es-gibt',
            level: 'A1',
            name: 'Existence with es gibt',
            displayNames: { en: 'Existence with es gibt', ja: '存在を表す es gibt' },
            patternSource: String.raw`(?<!\p{L})[Ee]s\s+gibt(?!\p{L})`,
            priority: 10,
            confidence: 'high',
            url: `${GOETHE_A1}#page=5`,
        },
        {
            ruleId: 'de-a1-modal-infinitive',
            level: 'A1',
            name: 'Modal verb + infinitive',
            displayNames: { en: 'Modal verb + infinitive', ja: '法助動詞 ＋ 不定詞' },
            patternSource: String.raw`(?<!\p{L})(?:[Kk]ann|[Kk]annst|[Kk]önnen|[Kk]önnt|[Mm]uss|[Mm]usst|[Mm]üssen|[Mm]üsst|[Ww]ill|[Ww]illst|[Ww]ollen|[Ww]ollt)(?!\p{L})${MODAL_CLAUSE_GAP}(?<!\p{L})${CHECKED_MODAL_INFINITIVE}(?=\s*(?:[.!?…]|$))`,
            priority: 12,
            confidence: 'high',
            url: `${GOETHE_A1}#page=7`,
        },
        {
            ruleId: 'de-a1-von-bis',
            level: 'A1',
            name: 'Time range with von … bis',
            displayNames: { en: 'Time range with von … bis', ja: 'von … bis の時間範囲' },
            patternSource: String.raw`(?<!\p{L})[Vv]on\s+${CLOCK_RANGE}(?=\s*(?:[,.!?…]|$))`,
            priority: 14,
            confidence: 'high',
            url: `${DW_A1}#page=3`,
        },
        {
            ruleId: 'de-a1-so-wie',
            level: 'A1',
            name: 'Equal comparison with so … wie',
            displayNames: { en: 'Equal comparison with so … wie', ja: 'so … wie の同等比較' },
            patternSource: String.raw`(?<!\p{L})(?:[Ii]st|[Ss]ind|[Ww]ar|[Ww]aren)\s+so\s+${EQUAL_COMPARISON_WORD}\s+wie\s+${COMPARISON_SUBJECT}(?!\p{L})`,
            priority: 16,
            confidence: 'high',
            url: `${DW_A1}#page=5`,
        },
        {
            ruleId: 'de-a1-comparative-als',
            level: 'A1',
            name: 'Comparison with als',
            displayNames: { en: 'Comparison with als', ja: '比較級 ＋ als' },
            patternSource: String.raw`(?<!\p{L})(?:[Bb]esser|[Ss]chlechter|[Mm]ehr|[Ww]eniger|[Gg]rößer|[Kk]leiner|[Ää]lter|[Jj]ünger|[Ss]chneller|[Ll]angsamer|[Hh]öher|[Nn]iedriger|[Ll]änger|[Kk]ürzer)\s+als(?!\p{L})`,
            priority: 18,
            confidence: 'high',
            url: `${DW_A1}#page=5`,
        },
        {
            ruleId: 'de-a1-aber-denn',
            level: 'A1',
            name: 'Linking clauses with aber or denn',
            displayNames: { en: 'Linking clauses with aber or denn', ja: 'aber / denn の接続' },
            patternSource: String.raw`[,;]\s*(?:aber|denn)(?!\p{L})`,
            priority: 20,
            confidence: 'high',
            url: `${GOETHE_A1}#page=19`,
        },
        {
            ruleId: 'de-a1-einladen',
            level: 'A1',
            name: 'Separable einladen',
            displayNames: { en: 'Separable einladen', ja: '分離動詞 einladen' },
            patternSource: String.raw`(?<!\p{L})(?:[Ll]ade|[Ll]ädst|[Ll]ädt|[Ll]aden|[Ll]adet)(?!\p{L})[^.!?…\n]{0,80}?(?<!\p{L})ein(?=\s*(?:[.!?…]|$))`,
            priority: 22,
            confidence: 'high',
            url: `${GOETHE_A1}#page=8`,
        },
    ],
});
