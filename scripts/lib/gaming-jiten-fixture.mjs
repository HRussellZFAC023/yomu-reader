// Shared remote-only fixture for the two native Gaming Jiten proofs.
export function gamingJitenFixture({ knownState, decks = [] }) {
    const wordId = 1234;
    const requests = [];
    const vocabulary = () => ({
        wordId, readingIndex: 0, spelling: '冒険', reading: '冒[ぼう]険[けん]', frequencyRank: 1234,
        partsOfSpeech: ['n'], meaningsChunks: [['adventure']], meaningsPartOfSpeech: [['n']], knownState,
    });
    const responses = {
        '/reader/parse': body => ({
            tokens: body.text.map(text => {
                const start = text.indexOf('冒険');
                return start < 0 ? [] : [{ wordId, readingIndex: 0, start, end: start + 2, length: 2 }];
            }),
            vocabulary: [vocabulary()],
        }),
        '/reader/lookup-vocabulary': body => ({ result: (body.words ?? []).map(() => knownState) }),
        '/srs/reader-study-decks': () => decks,
        '/srs/review': () => { knownState = [2]; return {}; },
        [`/vocabulary/${wordId}/0/info`]: () => ({
            wordId, mainReading: { text: '冒険', readingIndex: 0, frequencyRank: 1234 },
            alternativeReadings: [], partsOfSpeech: ['noun'],
            definitions: [{ senseIndex: 0, englishMeanings: ['adventure'], pos: ['noun'] }],
            knownStates: knownState, composedOf: [], usedIn: [], usedInTotal: 0,
        }),
        '/random-example-sentences': () => [],
    };
    const handleJiten = async (route, url) => {
        const request = route.request();
        const body = request.postDataJSON() ?? {};
        requests.push({ path: url.pathname, method: request.method(), authorization: request.headers().authorization, body });
        if (/\/srs\/study-decks\/\d+\/words$/.test(url.pathname)) return route.fulfill({ status: 204 });
        const response = responseFor(url.pathname);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response(body)) });
    };
    function responseFor(pathname) {
        const entry = Object.entries(responses).find(([endpoint]) => pathname.endsWith(endpoint));
        return entry ? entry[1] : () => ({});
    }
    const handlers = {
        '127.0.0.1': route => route.continue(),
        localhost: route => route.continue(),
        'api.jiten.moe': handleJiten,
    };
    const rejectRemote = route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    const route = route => {
        const url = new URL(route.request().url());
        return (handlers[url.hostname] ?? rejectRemote)(route, url);
    };
    return { wordId, requests, route };
}
