import { choosePrivateDeck } from './smoke-test-helpers.mjs';
import { gamingJitenFixture, importGamingJitenSettings } from './gaming-jiten-fixture.mjs';

// Exercise the packaged renderer, preload and capture IPC, then the Reader's actual
// provider transport. Only remote HTTP responses are fixtures; no action is replaced.
export async function assertGamingJitenActions({ app, page, overlay, importSettings, recapture, findWord }) {
    const fixtureKey = 'gaming-jiten-fixture-key';
    const deckId = 7;
    const { wordId, requests, route } = gamingJitenFixture({
        knownState: [0], decks: [{ userStudyDeckId: deckId, name: 'Gaming fixture words', deckType: 2 }],
    });
    await app.context().route(/^https?:\/\//, route);
    try {
        await importGamingJitenSettings({ page, overlay, importSettings, fixtureKey });
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
