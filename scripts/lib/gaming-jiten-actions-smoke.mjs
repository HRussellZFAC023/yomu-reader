import { choosePrivateDeck } from './smoke-test-helpers.mjs';

// Exercise the packaged renderer, preload and capture IPC, then the Reader's actual
// provider transport. Only remote HTTP responses are fixtures; no action is replaced.
export async function assertGamingJitenActions({ app, page, overlay, importSettings, recapture, findWord }) {
    const fixtureKey = 'gaming-jiten-fixture-key';
    const wordId = 1234;
    const deckId = 7;
    const requests = [];
    let knownState = [0];
    const vocabulary = () => ({
        wordId, readingIndex: 0, spelling: '冒険', reading: '冒[ぼう]険[けん]', frequencyRank: 1234,
        partsOfSpeech: ['n'], meaningsChunks: [['adventure']], meaningsPartOfSpeech: [['n']], knownState,
    });
    const route = async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
        if (url.hostname !== 'api.jiten.moe') return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
        const body = request.postDataJSON() ?? {};
        requests.push({ path: url.pathname, method: request.method(), authorization: request.headers().authorization, body });
        let response = {};
        if (url.pathname.endsWith('/reader/parse')) {
            response = {
                tokens: body.text.map(text => {
                    const start = text.indexOf('冒険');
                    return start < 0 ? [] : [{ wordId, readingIndex: 0, start, end: start + 2, length: 2 }];
                }),
                vocabulary: [vocabulary()],
            };
        } else if (url.pathname.endsWith('/reader/lookup-vocabulary')) {
            response = { result: (body.words ?? []).map(() => knownState) };
        } else if (url.pathname.endsWith('/srs/reader-study-decks')) {
            response = [{ userStudyDeckId: deckId, name: 'Gaming fixture words', deckType: 2 }];
        } else if (url.pathname.endsWith('/srs/review')) {
            knownState = [2];
        } else if (url.pathname.endsWith(`/srs/study-decks/${deckId}/words`)) {
            return route.fulfill({ status: 204 });
        } else if (url.pathname.endsWith(`/vocabulary/${wordId}/0/info`)) {
            response = {
                wordId, mainReading: { text: '冒険', readingIndex: 0, frequencyRank: 1234 },
                alternativeReadings: [], partsOfSpeech: ['noun'],
                definitions: [{ senseIndex: 0, englishMeanings: ['adventure'], pos: ['noun'] }],
                knownStates: knownState, composedOf: [], usedIn: [], usedInTotal: 0,
            };
        } else if (url.pathname.includes('/random-example-sentences')) response = [];
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
    };
    await app.context().route(/^https?:\/\//, route);
    try {
        await overlay.evaluate(() => window.yomuGaming.hideOverlay());
        await page.evaluate(() => window.yomuGaming.showApp());
        await importSettings(page, {
            jitenApiKey: fixtureKey, apiKey: '', apiGradingProvider: 'jiten', parserProvider: 'jiten',
            jitenMiningEnabled: true, jpdbMiningEnabled: false, enableReviews: true,
            audioEnabled: false, autoPlayAudio: false, audioSources: [],
            jitenDefinitionsEnabled: true, jpdbDefinitionsEnabled: false,
        });
        await page.evaluate(() => window.yomuGaming.hideApp());
        await recapture(overlay);
        const word = await findWord(overlay, '冒険');
        const popup = overlay.locator('.jpdb-reader-popover').first();
        await word.hover();
        const grade = popup.locator('[data-action="grade"][data-grade="pass"]').first();
        await grade.waitFor({ state: 'visible', timeout: 15_000 });
        await grade.click();
        await waitForWrite(() => requests.filter(request => request.path.endsWith('/srs/review')), 'Jiten review');
        await word.hover();
        await choosePrivateDeck(overlay, popup.locator('.jpdb-reader-deck-select').first(), 'Jiten');
        await waitForWrite(() => requests.filter(request => request.path.endsWith(`/srs/study-decks/${deckId}/words`)), 'Jiten deck add');
        await overlay.locator('.jpdb-reader-toast').filter({ hasText: /^Added to (deck|your default deck)\.$/ }).first().waitFor({ timeout: 10_000 });
        const writes = requests.filter(request => request.path.endsWith('/srs/review') || request.path.endsWith(`/srs/study-decks/${deckId}/words`));
        if (writes.length !== 2 || writes.some(request => request.method !== 'POST'
            || request.authorization !== `ApiKey ${fixtureKey}` || request.body.wordId !== wordId || request.body.readingIndex !== 0)) {
            throw new Error(`Gaming popup did not send exactly one authenticated Jiten review and deck add: ${JSON.stringify(writes)}`);
        }
        if (!writes.find(request => request.path.endsWith('/words'))?.body.sentence?.includes('冒険')) {
            throw new Error('Gaming Jiten deck add lost the captured Japanese sentence.');
        }
        console.log(`[desktop-jiten-actions] real popup sent authenticated review and deck add: ${JSON.stringify(writes.map(({ authorization, ...request }) => request))}`);
    } finally {
        await app.context().unroute(/^https?:\/\//, route);
    }
}

async function waitForWrite(read, label) {
    const deadline = Date.now() + 10_000;
    while (!read().length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    if (read().length !== 1) throw new Error(`${label} did not reach the provider exactly once (${read().length}).`);
}
