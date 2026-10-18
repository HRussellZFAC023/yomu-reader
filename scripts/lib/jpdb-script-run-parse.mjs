// A jpdb.io API stand-in for gates on recordings that hold no dictionary
// answers: parse makes every kanji run one word with a made-up kana reading
// (two kana a kanji) and every kana run one word, all in one card state; the
// deck endpoints answer empty. Other hosts fall through (undefined).
//
//   openRecordedPage({ ..., onGmRequest: request => answerJpdbParseByScriptRuns(request, { cardState: 'known' }) })
const KANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねの';
const SCRIPT_RUN = /(\p{Script=Han}+)|\p{Script=Katakana}+|\p{Script=Hiragana}+/gu;

export function answerJpdbParseByScriptRuns(request, { cardState = 'not-in-deck' } = {}) {
    const url = new URL(request.url);
    if (url.hostname !== 'jpdb.io' || !url.pathname.startsWith('/api/v1/')) return undefined;
    const endpoint = url.pathname.slice('/api/v1/'.length);
    if (endpoint !== 'parse') return json(endpoint === 'list-user-decks' ? { decks: [] } : endpoint === 'deck/list-vocabulary' ? { vocabulary: [] } : {});
    const body = JSON.parse(request.bodyText || '{}');
    const texts = Array.isArray(body.text) ? body.text : [body.text ?? ''];
    const vocabulary = [];
    const indexOf = new Map();
    const tokens = texts.map(text => [...String(text).matchAll(SCRIPT_RUN)].map(match => {
        const spelling = match[0];
        const reading = match[1] ? madeUpReading(spelling) : spelling;
        if (!indexOf.has(spelling)) {
            indexOf.set(spelling, vocabulary.length);
            vocabulary.push([1000 + vocabulary.length, 2000 + vocabulary.length, 0, spelling, reading, 5000, ['n'], [['gloss']], ['n'], [cardState], ['LHH']]);
        }
        return [indexOf.get(spelling), match.index, spelling.length, match[1] ? [[spelling, reading]] : [spelling]];
    }));
    return json({ vocabulary, tokens });
}

function madeUpReading(spelling) {
    return Array.from(spelling, (character, index) => KANA[(character.codePointAt(0) + index) % KANA.length] + KANA[(character.codePointAt(0) * 7) % KANA.length]).join('');
}

function json(value) {
    return { status: 200, contentType: 'application/json', body: JSON.stringify(value) };
}
