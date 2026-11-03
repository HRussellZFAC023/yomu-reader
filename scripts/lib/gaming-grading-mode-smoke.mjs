import path from 'node:path';

// Built Electron Settings, preload/capture IPC and Reader controls. Remote Jiten
// responses are deterministic fixtures, and every nonlocal request is intercepted.
export async function assertGamingGradingMode({ app, page, overlay, importSettings, openSettingsPanel, recapture, findWord, evidenceDir }) {
    const fixtureKey = 'gaming-grading-mode-fixture-key';
    const wordId = 1234;
    const requests = [];
    const vocabulary = {
        wordId, readingIndex: 0, spelling: '冒険', reading: '冒[ぼう]険[けん]', frequencyRank: 1234,
        partsOfSpeech: ['n'], meaningsChunks: [['adventure']], meaningsPartOfSpeech: [['n']], knownState: [2],
    };
    const route = async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
        if (url.hostname !== 'api.jiten.moe') return route.abort();
        const body = request.postDataJSON() ?? {};
        requests.push({ path: url.pathname, method: request.method(), authorization: request.headers().authorization, body });
        let response = {};
        if (url.pathname.endsWith('/reader/parse')) {
            response = { tokens: body.text.map(text => {
                const start = text.indexOf('冒険');
                return start < 0 ? [] : [{ wordId, readingIndex: 0, start, end: start + 2, length: 2 }];
            }), vocabulary: [vocabulary] };
        } else if (url.pathname.endsWith('/reader/lookup-vocabulary')) {
            response = { result: (body.words ?? []).map(() => [2]) };
        } else if (url.pathname.endsWith('/srs/reader-study-decks') || url.pathname.includes('/random-example-sentences')) {
            response = [];
        } else if (url.pathname.endsWith(`/vocabulary/${wordId}/0/info`)) {
            response = { wordId, mainReading: { text: '冒険', readingIndex: 0, frequencyRank: 1234 },
                alternativeReadings: [], partsOfSpeech: ['noun'],
                definitions: [{ senseIndex: 0, englishMeanings: ['adventure'], pos: ['noun'] }],
                knownStates: [2], composedOf: [], usedIn: [], usedInTotal: 0 };
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
    };
    await app.context().route(/^https?:\/\//, route);
    try {
        await overlay.evaluate(() => window.yomuGaming.hideOverlay());
        await page.evaluate(() => window.yomuGaming.showApp());
        await importSettings(page, {
            twoButtonReviews: true, jitenApiKey: fixtureKey, apiKey: '', apiGradingProvider: 'jiten', parserProvider: 'jiten',
            jitenMiningEnabled: true, jpdbMiningEnabled: false, enableReviews: true,
            audioEnabled: false, autoPlayAudio: false, audioSources: [],
            jitenDefinitionsEnabled: true, jpdbDefinitionsEnabled: false,
        });
        await openSettingsPanel(page, 'api');
        if (await page.locator('select[name="twoButtonReviews"]').inputValue() !== 'true') {
            throw new Error('Gaming Settings did not show imported Pass/Fail grading.');
        }
        await recapture(overlay);
        await assertControls(['fail', 'pass'], ['Fail', 'Pass'], 'pass-fail');
        await submitGrade('fail', 1);
        await submitGrade('pass', 3);

        // Change the same visible setting a learner uses, then let its real debounce
        // persist it. A fresh native capture must boot Reader with that saved choice.
        await setReviewMode(false);
        await recapture(overlay);
        await assertControls(['nothing', 'hard', 'okay', 'easy'], ['Again', 'Hard', 'Good', 'Easy'], 'four-grades');
        await submitGrade('hard', 2);
        await submitGrade('easy', 4);

        // Switching back catches stale renderer settings as well as import-only fixes.
        await setReviewMode(true);
        await recapture(overlay);
        await assertControls(['fail', 'pass'], ['Fail', 'Pass'], 'pass-fail-restored');
        // Jiten also uses POST for these reads; every other POST must be a review.
        const reads = ['/reader/parse', '/reader/lookup-vocabulary', '/srs/reader-study-decks', '/random-example-sentences'];
        const writes = requests.filter(request => request.method !== 'GET' && !reads.some(endpoint => request.path.endsWith(endpoint)));
        const reviews = writes.filter(request => request.path.endsWith('/srs/review'));
        if (reviews.length !== 4 || writes.length !== reviews.length) {
            throw new Error(`Gaming grading made unexpected provider writes: ${JSON.stringify(writes)}`);
        }
        console.log(`[desktop-grading-mode] imported true -> visible false -> visible true; ratings ${JSON.stringify(reviews.map(request => request.body.rating))}; no deck writes`);
    } finally {
        await app.context().unroute(/^https?:\/\//, route);
    }

    async function setReviewMode(twoButton) {
        await overlay.evaluate(() => window.yomuGaming.hideOverlay());
        await page.evaluate(() => window.yomuGaming.showApp());
        await openSettingsPanel(page, 'api');
        await page.locator('select[name="twoButtonReviews"]').selectOption(String(twoButton));
        await page.waitForFunction(expected => JSON.parse(localStorage.getItem('yomu-gaming-reader-settings-v1') || '{}').twoButtonReviews === expected,
            twoButton, { timeout: 5000 });
    }

    async function openPopup() {
        const word = await findWord(overlay, '冒険');
        const popup = overlay.locator('.jpdb-reader-popover').first();
        await word.hover();
        await popup.waitFor({ state: 'visible', timeout: 15_000 });
        await popup.locator('[data-action="grade"]').first().waitFor({ state: 'visible', timeout: 15_000 });
        await popup.locator('[data-card-details-loading]').waitFor({ state: 'detached', timeout: 15_000 });
        return popup;
    }

    async function assertControls(grades, labels, name) {
        const popup = await openPopup();
        const actual = await popup.locator('[data-action="grade"]:visible').evaluateAll(buttons => buttons.map(button => ({
            grade: button.dataset.grade, label: button.textContent.trim(),
        })));
        const expected = grades.map((grade, index) => ({ grade, label: labels[index] }));
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            throw new Error(`Gaming ${name} controls ignored the saved preference: ${JSON.stringify({ actual, expected })}`);
        }
        await overlay.screenshot({ path: path.join(evidenceDir, `gaming-grading-mode-${name}-fixture.png`) });
    }

    async function submitGrade(grade, rating) {
        const before = requests.filter(request => request.path.endsWith('/srs/review')).length;
        const popup = await openPopup();
        await popup.locator(`[data-action="grade"][data-grade="${grade}"]:visible`).click();
        // Successful popup reviews dismiss the popup; they do not need a toast.
        await popup.waitFor({ state: 'detached', timeout: 10_000 });
        const reviews = requests.filter(request => request.path.endsWith('/srs/review'));
        const request = reviews.at(-1);
        if (reviews.length !== before + 1 || request.method !== 'POST' || request.authorization !== `ApiKey ${fixtureKey}`
            || JSON.stringify(request.body) !== JSON.stringify({ wordId, readingIndex: 0, rating })) {
            throw new Error(`Gaming ${grade} did not submit exactly one rating ${rating}: ${JSON.stringify(reviews)}`);
        }
        await recapture(overlay);
    }
}
