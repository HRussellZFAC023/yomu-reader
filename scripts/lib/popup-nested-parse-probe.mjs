// Uses the exact built Reader and native DOM/event loop. Only parser responses
// are controlled; the production planner, tickets and painter remain intact.
export function assertPopupNestedParseOverlap(page) {
    const pageErrors = [];
    const recordError = error => pageErrors.push(error.message);
    page.on('pageerror', recordError);
    return page.evaluate(async () => {
        const app = window.__yomuRealApp;
        const popup = app?.activePopover;
        if (!popup?.isConnected) throw new Error('No installed Reader popup for overlap probe.');
        const root = document.createElement('section');
        root.dataset.jpdbReaderRoot = 'true';
        root.innerHTML = '<div class="jpdb-reader-local-glossary jpdb-reader-parseable">桜の本を読む</div>';
        popup.append(root);
        const parser = app.parser;
        const originalParse = parser.parse;
        const local = deferred();
        const provider = deferred();
        const started = deferred();
        const requests = [];
        parser.parse = function parse(texts, options) {
            if (!texts.some(text => ['桜の本を読む', '毎朝桜を読む'].includes(text))) {
                return originalParse.call(this, texts, options);
            }
            requests.push(texts);
            started.resolve();
            return texts.includes('桜の本を読む') ? local.promise : provider.promise;
        };
        let startTimer;
        try {
            const first = app.parsePopoverJapanese(root);
            await Promise.race([
                started.promise,
                new Promise((_, reject) => { startTimer = setTimeout(() => reject(new Error('Generic parse did not start.')), 5000); }),
            ]);
            const loadingId = root.dataset.jpdbReaderParseLoadingId;
            root.insertAdjacentHTML('beforeend', '<div class="jpdb-reader-parseable" data-provider-example-sentence>毎朝<mark class="jpdb-reader-example-target"><span class="jpdb-reader-word jpdb-reader-example-target">桜</span></mark>を読む</div>');
            const second = app.parsePopoverJapanese(root);
            await Promise.resolve();
            const pendingRequests = requests.length;
            const overlapLoadingId = root.dataset.jpdbReaderParseLoadingId;
            local.resolve([[token('桜の本を読む', '桜', 0), token('桜の本を読む', '本', 2), token('桜の本を読む', '読む', 4)]]);
            provider.resolve([[token('毎朝桜を読む', '毎朝', 0), token('毎朝桜を読む', '桜', 2), token('毎朝桜を読む', '読む', 4)]]);
            await Promise.all([first, second]);
            return {
                initialLoadingId: loadingId,
                overlapLoadingId,
                pendingRequests,
                requests,
                localWords: surfaces('.jpdb-reader-local-glossary'),
                providerWords: surfaces('[data-provider-example-sentence]'),
                targetExpression: root.querySelector('[data-provider-example-sentence] mark .jpdb-reader-word')?.dataset.expression,
                loadingKey: root.dataset.jpdbReaderParseLoadingKey,
                loadingId: root.dataset.jpdbReaderParseLoadingId,
            };
        } finally {
            local.resolve([]);
            provider.resolve([]);
            clearTimeout(startTimer);
            parser.parse = originalParse;
            root.remove();
        }

        function surfaces(selector) {
            return [...root.querySelectorAll(`${selector} .jpdb-reader-word`)].map(word => word.dataset.expression);
        }

        function deferred() {
            let resolve;
            const promise = new Promise(done => { resolve = done; });
            return { promise, resolve };
        }

        function token(sentence, spelling, start) {
            return {
                start, end: start + spelling.length, length: spelling.length,
                sentence, rubies: [], pitchClass: '',
                card: {
                    vid: start + 1, sid: 0, rid: 0, spelling, reading: spelling,
                    frequencyRank: 0, partOfSpeech: [], meanings: [],
                    cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null,
                },
            };
        }
    }).then(async snapshot => {
        // Pitch, Anki and vocabulary enrichment the probe's parses started
        // report their errors after the snapshot; let them land first.
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
        assert.deepEqual(pageErrors, [], 'Popup overlap probe raised browser errors');
        assert.ok(snapshot.initialLoadingId, 'Generic parse must own a loading ticket');
        assert.equal(snapshot.overlapLoadingId, snapshot.initialLoadingId, 'Provider commit stole the generic ticket');
        assert.equal(snapshot.pendingRequests, 1, 'Provider parse started before the generic pass completed');
        assert.equal(snapshot.requests.length, 2, 'Each parse plan must run exactly once');
        assert.deepEqual(snapshot.localWords, ['桜', '本', '読む'], 'Local definition lost nested lookup words');
        assert.deepEqual(snapshot.providerWords, ['毎朝', '桜', '読む'], 'Provider example lost nested lookup words');
        assert.equal(snapshot.targetExpression, '桜', 'Provider target mark was lost');
        assert.equal(snapshot.loadingKey, undefined, 'Completed parse kept a loading key');
        assert.equal(snapshot.loadingId, undefined, 'Completed parse kept a loading ID');
    }).finally(() => {
        page.off('pageerror', recordError);
    });
}
import { strict as assert } from 'node:assert';
