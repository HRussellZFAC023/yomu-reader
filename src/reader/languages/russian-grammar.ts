import { CEFR_GRAMMAR_LEVEL_SCALE } from './cefr-grammar';
import { createLearningTargetGrammar } from './grammar';

const RANEPA_A1 = 'https://ion.ranepa.ru/upload/medialibrary/bab/DOOP_Russkiy-yazyk-kak-inostrannyy.-Element-uroven-_A1_.-Obshchee-vladenie_450-chas.pdf';
const CORNELL_GRAMMAR = 'https://russian.cornell.edu/grammar/toc.htm';
// Both infinitives appear in the cited A1 modal examples. A suffix-only test
// also accepts nouns such as пути, so this detector stays on the checked pair.
const CHECKED_MODAL_INFINITIVE = String.raw`(?:пойти|поехать)`;
const CHECKED_NECESSITY_INFINITIVE = String.raw`пойти`;
const CHECKED_WHERE_POSSIBLE_INFINITIVE = String.raw`купить`;
const MODAL_CLAUSE_GAP = String.raw`(?:(?![,;:]|(?<!\p{L})(?:а|и|или|но|что)(?!\p{L}))[^.!?…\n]){0,60}?`;

/** Conservative A1 starter patterns from RANEPA's published RFL curriculum. */
export const RUSSIAN_GRAMMAR = createLearningTargetGrammar({
    levelScale: CEFR_GRAMMAR_LEVEL_SCALE,
    referenceUrl: CORNELL_GRAMMAR,
    rules: [
        {
            ruleId: 'ru-a1-kto-chto-eto',
            level: 'A1',
            name: 'Кто/что это? identification question',
            displayNames: { en: 'Кто/что это? identification question', ja: 'кто/что это? の同定疑問文' },
            patternSource: String.raw`^(?:[Кк]то|[Чч]то)\s+это(?=\s*(?:[?？]|$))`,
            priority: 10,
            confidence: 'high',
            url: `${RANEPA_A1}#page=19`,
        },
        {
            ruleId: 'ru-a1-possessive-starter',
            level: 'A1',
            name: 'Possession with это + possessive',
            displayNames: { en: 'Possession with это + possessive', ja: 'это ＋ 所有代名詞' },
            patternSource: String.raw`(?<!\p{L})[Ээ]то\s+(?:мой|моя|моё|мое|мои|твой|твоя|твоё|твое|твои|наш|наша|наше|наши|ваш|ваша|ваше|ваши)(?!\p{L})`,
            priority: 12,
            confidence: 'high',
            url: `${RANEPA_A1}#page=19`,
        },
        {
            ruleId: 'ru-a1-request-imperative',
            level: 'A1',
            name: 'Requests with дай(те), скажи(те), покажи(те)',
            displayNames: { en: 'Requests with дай(те), скажи(те), покажи(те)', ja: 'дай(те) / скажи(те) / покажи(те) の依頼' },
            patternSource: String.raw`(?<!\p{L})(?:[Дд]айте|[Дд]ай|[Сс]кажите|[Сс]кажи|[Пп]окажите|[Пп]окажи)(?!\p{L})(?:,\s*пожалуйста(?!\p{L}))?`,
            priority: 14,
            confidence: 'high',
            url: `${RANEPA_A1}#page=20`,
        },
        {
            ruleId: 'ru-a1-dative-nravitsya',
            level: 'A1',
            name: 'нравится with a dative experiencer',
            displayNames: { en: 'нравится with a dative experiencer', ja: '与格 ＋ нравится' },
            patternSource: String.raw`(?<!\p{L})(?:[Мм]не|[Тт]ебе|[Вв]ам)\s+нрав(?:ится|ятся)(?!\p{L})`,
            priority: 16,
            confidence: 'high',
            url: `${RANEPA_A1}#page=21`,
        },
        {
            ruleId: 'ru-a1-potomu-chto',
            level: 'A1',
            name: 'Reason with потому что',
            displayNames: { en: 'Reason with потому что', ja: '理由を表す потому что' },
            patternSource: String.raw`(?<!\p{L})[Пп]отому\s+что(?!\p{L})`,
            priority: 18,
            confidence: 'high',
            url: `${RANEPA_A1}#page=22`,
        },
        {
            ruleId: 'ru-a1-gde-mozhno-infinitive',
            level: 'A1',
            name: 'Где можно + infinitive',
            displayNames: { en: 'Где можно + infinitive', ja: 'где можно ＋ 不定詞' },
            patternSource: String.raw`(?<!\p{L})[Гг]де\s+можно\s+${CHECKED_WHERE_POSSIBLE_INFINITIVE}(?!\p{L})`,
            priority: 20,
            confidence: 'high',
            url: `${RANEPA_A1}#page=22`,
        },
        {
            ruleId: 'ru-a1-want-can-infinitive',
            level: 'A1',
            name: 'хотеть/мочь + infinitive',
            displayNames: { en: 'хотеть/мочь + infinitive', ja: 'хотеть/мочь ＋ 不定詞' },
            patternSource: String.raw`(?<!\p{L})(?:[Хх]очу|[Хх]очешь|[Хх]очет|[Хх]отим|[Хх]отите|[Хх]отят|[Мм]огу|[Мм]ожешь|[Мм]ожет|[Мм]ожем|[Мм]ожете|[Мм]огут)(?!\p{L})${MODAL_CLAUSE_GAP}(?<!\p{L})${CHECKED_MODAL_INFINITIVE}(?!\p{L})`,
            priority: 22,
            confidence: 'high',
            url: `${RANEPA_A1}#page=23`,
        },
        {
            ruleId: 'ru-a1-need-infinitive',
            level: 'A1',
            name: 'Necessity with надо/нужно',
            displayNames: { en: 'Necessity with надо/нужно', ja: 'надо/нужно で表す必要' },
            patternSource: String.raw`(?<!\p{L})(?:(?:[Мм]не|[Тт]ебе|[Вв]ам|[Ее]му|[Ее]й|[Нн]ам|[Ии]м)\s+)?(?:[Нн]адо|[Нн]ужно)\s+${CHECKED_NECESSITY_INFINITIVE}(?!\p{L})`,
            priority: 24,
            confidence: 'high',
            url: `${RANEPA_A1}#page=24`,
        },
    ],
});
