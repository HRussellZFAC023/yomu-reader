// Built-browser proof of deliberate local collection (BACKLOG-V2 C04): a
// keyless learner saves words from the lookup popup on an ordinary page, finds
// them in Study's Library, adds exactly one to review, exports a backup from
// Settings → Backup & sync, restores it into a fresh profile, reloads, and
// survives interrupted saves.
//
// Everything runs against the BUILT product: dist/yomu.user.js (with the
// companions its header @requires) on a labelled FIXTURE article at an
// ordinary origin, and the built Study app from dist/newtab served at the
// hosted Study URL (the only place its Settings are editable). One Node-side
// map per browser profile stands in for the userscript manager's GM storage,
// which both pages share, as they do with the installed userscript. Pages are
// used one at a time, so each opens on the current shared store. Public Jiten
// lookups are answered by fixtures; every other request is blocked.
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
    assert,
    assertBuiltArtifacts,
    createSmokePaths,
    gmStorageBridgeInitProgram,
    jsonHttpResponse,
    YOMU_SETTINGS_KEY,
} from './smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource, newTabModeButton, userscriptCompanionPaths } from './smoke-test-helpers.mjs';

const { root: ROOT, dist: DIST, newTabDir: NEWTAB_DIR, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(path.join(import.meta.dirname, '..'));
const ARTICLE_URL = 'https://reader-fixture.example/articles/evening-reading.html';
const ARTICLE_TITLE = 'Yomu fixture: local collection article';
const STUDY_URL = 'https://yomureader.com/study/';
const SENTENCE = '毎晩、本を読むのが好きです。';
const WORDS = {
    read: { surface: '読む', reading: 'よむ', text: '読[よ]む', wordId: 1358280, meaning: 'to read' },
    book: { surface: '本', reading: 'ほん', text: '本[ほん]', wordId: 1522150, meaning: 'book' },
    like: { surface: '好き', reading: 'すき', text: '好[す]き', wordId: 1584780, meaning: 'liked; favourite' },
};
const INDEX_KEY = 'yomu:srs-local:v2:index';
const CARD_PREFIX = 'yomu:srs-local:v2:card:';
const GM_PREFIX = '__yomu_journey_gm__:';
const REQUEST_BRIDGE = '__yomuLocalCollectionRequest';
const GM_SYNC_BRIDGE = '__yomuLocalCollectionGmWrite';
const CLOSE_BRIDGE = '__yomuLocalCollectionClosePage';
const DAY_MS = 86_400_000;
const CONTENT_TYPES = new Map([['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'], ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.webmanifest', 'application/manifest+json']]);
// A learner who has never connected an account: no JPDB/Jiten/Anki keys, the
// local Academy deck on (the default), reviews on.
const KEYLESS_SETTINGS = {
    onboardingSeen: true,
    learningTargetChosen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    jitenApiKey: '',
    yomuLocalSrsEnabled: true,
    enableReviews: true,
    ankiEnabled: false,
    ankiSectionEnabled: false,
    newTabAnkiEnabled: false,
    localDictionariesEnabled: false,
    jitenDefinitionsEnabled: true,
    jpdbDefinitionsEnabled: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    audioEnabled: false,
    autoPlayAudio: false,
    showFloatingButton: false,
    lookupOnClick: true,
    lookupOnHover: false,
    popupActivationMode: 'click',
    newTabParsingEnabled: false,
    enableLogging: false,
};

export async function runLocalCollectionJourney(browser) {
    assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH, ...userscriptCompanionPaths(SCRIPT_PATH),
        path.join(NEWTAB_DIR, 'index.html'), path.join(NEWTAB_DIR, 'app.js'), path.join(NEWTAB_DIR, 'styles.css')], ROOT, 'Run npm run build first.');
    const journey = new Journey(browser);
    try {
        return { fixture: true, articleUrl: ARTICLE_URL, studyUrl: STUDY_URL, ...await journey.run() };
    } finally {
        await journey.close();
    }
}

class Journey {
    constructor(browser) {
        this.browser = browser;
        this.blocked = [];
        this.pageErrors = [];
        this.contexts = [];
    }

    async run() {
        const profile = await this.newProfile('collector');
        const collect = await phase('save from the popup', () => this.collect(profile));
        const review = await phase('add one to review', () => this.addOneToReview(profile));
        const resave = await phase('save a reviewed word again', () => this.resaveScheduledWord(profile, review.reviewed));
        const backup = await phase('export a backup', () => this.exportBackup(profile));
        const fresh = await this.newProfile('fresh-restore');
        const restore = await phase('restore into a fresh profile', () => this.restoreBackup(fresh, backup));
        const interrupted = await phase('interrupted saves', () => this.interruptedSaves(fresh));
        assert(!this.pageErrors.length, 'Local collection journey raised page errors', { errors: this.pageErrors });
        const blockedHosts = [...new Set(this.blocked.map(url => new URL(url).host))].sort();
        return { collect, review, resave, backup: backup.report, restore, interrupted, blockedRequests: { count: this.blocked.length, hosts: blockedHosts } };
    }

    async close() {
        await Promise.all(this.contexts.map(context => context.close().catch(() => undefined)));
    }

    async newProfile(name) {
        const context = await this.browser.newContext({ bypassCSP: true, viewport: { width: 1100, height: 860 }, acceptDownloads: true, serviceWorkers: 'block' });
        this.contexts.push(context);
        const gm = new Map([[YOMU_SETTINGS_KEY, structuredClone(KEYLESS_SETTINGS)]]);
        await context.exposeFunction(REQUEST_BRIDGE, request => this.respond(request.url));
        await context.exposeFunction(GM_SYNC_BRIDGE, (key, value, deleted) => {
            if (deleted) gm.delete(key);
            else gm.set(key, value);
        });
        // The fault seam's "close now": the page is closed from outside, the way
        // a learner closing the tab (or the OS killing it) interrupts a save.
        await context.exposeBinding(CLOSE_BRIDGE, ({ page }) => {
            setTimeout(() => void page.close({ runBeforeUnload: false }).catch(() => undefined), 0);
        });
        await context.route('**/*', route => this.route(route));
        return { name, context, gm };
    }

    async openPage(profile, label, url) {
        const page = await profile.context.newPage();
        page.on('pageerror', error => this.pageErrors.push(`${profile.name}/${label}: ${String(error).slice(0, 300)}`));
        if (process.env.SMOKE_DEBUG) page.on('console', message => console.error(`[${profile.name}/${label}]`, message.type(), message.text().slice(0, 300)));
        await page.addInitScript({ content: sharedGmStorageProgram(Object.fromEntries(profile.gm), `${label}-${Date.now()}`) });
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        return page;
    }

    // ---- Reader page (userscript) ------------------------------------------------

    async openArticle(profile) {
        const page = await this.openPage(profile, 'article', ARTICLE_URL);
        await installUserscriptCssResource(page, CSS_PATH);
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
        await page.waitForSelector(wordSelector(WORDS.like.surface), { timeout: 20_000 });
        return page;
    }

    async openSaveAction(page, word) {
        await closePopup(page);
        await page.locator(wordSelector(word.surface)).first().click();
        const save = page.locator('.jpdb-reader-popover [data-action="add-default"]');
        await save.waitFor({ state: 'attached', timeout: 12_000 });
        const actions = page.locator('.jpdb-reader-popover .jpdb-reader-actions');
        const collapsed = /mining-collapsed/u.test(await actions.getAttribute('class') ?? '');
        if (collapsed) await page.locator('.jpdb-reader-popover [data-action="mining-collapse"]').click();
        await save.waitFor({ state: 'visible', timeout: 5_000 });
        return { save, label: (await save.textContent())?.trim() ?? '', drawerCollapsedByDefault: collapsed };
    }

    // A successful save is observed as a committed deck revision (the index is
    // the commit record), then its confirmation; a failed one by its message.
    async saveFromPopup(profile, page, word, { fails = false, timeout = 12_000, whilePending } = {}) {
        const action = await this.openSaveAction(page, word);
        const revision = readDeck(profile).revision;
        await action.save.click();
        action.pending = await whilePending?.(action.save);
        if (fails) {
            await waitForToast(page, /could not be saved/u, timeout);
            return action;
        }
        await waitUntil(() => readDeck(profile).revision > revision, timeout, `saving ${word.surface}`);
        await waitForToast(page, /Added to Academy/u);
        return action;
    }

    async collect(profile) {
        const baseline = await this.withStudy(profile, study => this.studyCounts(study));
        assert(baseline.statsDueNow === 0, 'A fresh keyless profile did not start with nothing due', baseline);

        const page = await this.openArticle(profile);
        const first = await this.saveFromPopup(profile, page, WORDS.read);
        const afterFirst = readDeck(profile);
        const read = afterFirst.cards[cardId(WORDS.read)];
        assert(afterFirst.ids.length === 1 && read, 'Saving from the popup did not store exactly one local card', afterFirst);
        assert(read.expression === WORDS.read.surface && read.reading === WORDS.read.reading
            && read.sentence === SENTENCE && read.sourceUrl === ARTICLE_URL && read.sourceTitle === ARTICLE_TITLE
            && read.meanings.includes(WORDS.read.meaning), 'The saved card lost its word, sentence, or source context', { read });
        assert(read.reviewEnabled === false && read.reviews === 0 && read.lastReviewAt === null,
            'Saving scheduled or graded the word instead of only collecting it', { read });

        await this.saveFromPopup(profile, page, WORDS.read);
        const afterSecond = readDeck(profile);
        const readAgain = afterSecond.cards[cardId(WORDS.read)];
        assert(afterSecond.ids.length === 1, 'Saving the same word twice created a duplicate card', afterSecond);
        assert(readAgain.reviewEnabled === false && readAgain.dueAt === read.dueAt && readAgain.createdAt === read.createdAt
            && readAgain.reviews === 0, 'Saving the word again changed or brought forward its schedule', { read, readAgain });

        await this.saveFromPopup(profile, page, WORDS.book);
        const deck = readDeck(profile);
        assert(deck.ids.length === 2 && Object.values(deck.cards).every(card => card.reviewEnabled === false),
            'A second saved word was scheduled or missing', deck);
        await page.close();

        const study = await this.withStudy(profile, async page => ({
            counts: await this.studyCounts(page),
            library: await this.libraryRows(page, 2),
        }));
        assert(study.counts.statsDueNow === 0 && study.counts.statsCards === 0,
            'Saved words became Study homework before the learner added them to review', study);
        assert(sameMembers(study.library.map(row => row.expression), [WORDS.read.surface, WORDS.book.surface])
            && study.library.every(row => row.addToReview), 'Library did not list both saved words with Add to review', study);
        return {
            saveLabel: first.label,
            saveDrawerCollapsedByDefault: first.drawerCollapsedByDefault,
            savedCard: pick(read, ['expression', 'reading', 'sentence', 'sourceUrl', 'sourceTitle', 'reviewEnabled', 'reviews']),
            duplicateSave: { cards: afterSecond.ids.length, dueAtUnchanged: readAgain.dueAt === read.dueAt },
            studyBefore: baseline,
            studyAfterSaving: study,
        };
    }

    // ---- Study: Library → Add to review → review ----------------------------------

    async addOneToReview(profile) {
        // The learner lands on Study first (its queue loads with nothing due),
        // then goes to Library to choose a word.
        const page = await this.openStudy(profile);
        await newTabModeButton(page, 'word').click();
        const before = await waitForStudyCard(page);
        await this.openLibrary(page, 2);
        await libraryRow(page, WORDS.read.surface).locator('[data-newtab-action="browse-start-review"]').click();
        await waitForToast(page, /Added to review/u);
        await page.waitForFunction(({ enrolled, saved }) => {
            const rows = [...document.querySelectorAll('.jpdb-reader-newtab-browse-item')];
            const row = expression => rows.find(item => item.querySelector(`[data-expression="${expression}"]`));
            return row(enrolled) && !row(enrolled).querySelector('[data-newtab-action="browse-start-review"]')
                && row(saved)?.querySelector('[data-newtab-action="browse-start-review"]');
        }, { enrolled: WORDS.read.surface, saved: WORDS.book.surface }, { timeout: 10_000 });
        const deck = readDeck(profile);
        const read = deck.cards[cardId(WORDS.read)];
        const book = deck.cards[cardId(WORDS.book)];
        assert(read && !('reviewEnabled' in read) && read.dueAt <= Date.now() && read.reviews === 0,
            'Add to review did not schedule the chosen word', { read });
        assert(book?.reviewEnabled === false, 'Add to review scheduled a word the learner did not choose', { book });
        const counts = await this.studyCounts(page);
        assert(counts.statsDueNow === 1 && counts.statsCards === 1, 'Study did not count exactly the one word added to review as due', counts);

        // Straight back to Study: the word just added is what the learner
        // reviews, shown with the sentence it was saved from.
        await newTabModeButton(page, 'word').click();
        const current = await waitForStudyCard(page, WORDS.read.surface);
        assert(current.text.includes(SENTENCE), 'Study did not show the saved sentence with the enrolled word', current);
        await revealAndGrade(page);
        await waitUntil(() => readDeck(profile).cards[cardId(WORDS.read)]?.reviews === 1, 10_000, 'recording the review');
        const reviewed = readDeck(profile).cards[cardId(WORDS.read)];
        assert(reviewed.dueAt > Date.now() + DAY_MS / 2, 'Grading the enrolled word did not schedule it into the future', { reviewed });
        await page.close();
        const afterGrade = await this.withStudy(profile, study => this.studyCounts(study));
        // Reviewed and no longer due, the word is still one of the learner's cards.
        assert(afterGrade.statsDueNow === 0 && afterGrade.statsCards === 1, 'Study due or card count was wrong after the review', afterGrade);
        return {
            studyCardBeforeAdding: before.prompt,
            enrolled: pick(read, ['expression', 'reviews', 'dueAt']),
            leftSaved: pick(book, ['expression', 'reviewEnabled']),
            statsAfterAdd: counts,
            studyCardAfterAdding: current,
            reviewed: pick(reviewed, ['reviews', 'intervalDays', 'dueAt', 'lastReviewAt']),
            statsAfterGrade: afterGrade,
        };
    }

    async resaveScheduledWord(profile, reviewed) {
        const page = await this.openArticle(profile);
        await this.saveFromPopup(profile, page, WORDS.read);
        await page.close();
        const after = readDeck(profile).cards[cardId(WORDS.read)];
        assert(after.dueAt === reviewed.dueAt && after.reviews === reviewed.reviews && after.lastReviewAt === reviewed.lastReviewAt,
            'Saving a word that is already in review brought its review forward', { reviewed, after });
        return { dueAtBefore: reviewed.dueAt, dueAtAfter: after.dueAt, reviews: after.reviews };
    }

    // ---- Settings → Backup & sync ------------------------------------------------

    async exportBackup(profile) {
        const page = await this.openStudy(profile);
        await openBackupSettings(page);
        const downloadReady = page.waitForEvent('download', { timeout: 20_000 });
        await page.locator('[data-action="export-reader-settings"]').click();
        const download = await downloadReady;
        const text = await readFile(await download.path(), 'utf8');
        await page.close();
        const backup = JSON.parse(text);
        const storage = backup.storage ?? {};
        const index = storage[INDEX_KEY];
        const read = storage[cardStorageKey(cardId(WORDS.read))];
        const book = storage[cardStorageKey(cardId(WORDS.book))];
        assert(index && sameMembers(index.cardIds, [cardId(WORDS.read), cardId(WORDS.book)]), 'Backup did not include the local deck index', { index });
        assert(read?.sentence === SENTENCE && read.sourceUrl === ARTICLE_URL && read.sourceTitle === ARTICLE_TITLE && read.reviews === 1,
            'Backup did not include the reviewed word with its context', { read });
        assert(book?.sentence === SENTENCE && book.sourceUrl === ARTICLE_URL && book.sourceTitle === ARTICLE_TITLE && book.reviewEnabled === false,
            'Backup did not include the saved-only word with its context', { book });
        return {
            text,
            fileName: download.suggestedFilename(),
            report: {
                fileName: download.suggestedFilename(),
                formatName: backup.formatName,
                deckIds: index.cardIds,
                savedOnly: pick(book, ['expression', 'sentence', 'sourceUrl', 'sourceTitle', 'reviewEnabled']),
                reviewed: pick(read, ['expression', 'sentence', 'reviews', 'dueAt']),
            },
        };
    }

    // The learner restores from Study's landing page and then opens Library.
    // (A Library already opened before the restore keeps its earlier list until
    // Study reloads; that refresh is not part of this proof.)
    async restoreBackup(profile, backup) {
        assert(readDeck(profile).ids.length === 0, 'The fresh profile already had saved words', readDeck(profile));
        const page = await this.openStudy(profile);
        await openBackupSettings(page);
        const chooserReady = page.waitForEvent('filechooser');
        await page.locator('[data-action="import-reader-settings"]').click();
        const chooser = await chooserReady;
        await chooser.setFiles({ name: backup.fileName, mimeType: 'application/json', buffer: Buffer.from(backup.text, 'utf8') });
        await waitForToast(page, /Settings imported/u, 30_000);
        await closeSettings(page);
        const library = await this.libraryRows(page, 2);
        await page.close();
        assertRestored(readDeck(profile), library, 'Import');

        const reloaded = await this.withStudy(profile, async study => ({
            library: await this.libraryRows(study, 2),
            counts: await this.studyCounts(study),
        }));
        assertRestored(readDeck(profile), reloaded.library, 'Reload after import');
        assert(reloaded.counts.statsDueNow === 0, 'Restoring the backup changed what is due', reloaded.counts);
        return { libraryAfterImport: library, reloaded };
    }

    // ---- Interrupted writes ------------------------------------------------------

    async interruptedSaves(profile) {
        const restored = readDeck(profile);
        // 1. Storage throws while the index commits: the learner is told, and
        //    nothing half-written survives.
        let page = await this.openArticle(profile);
        await installIndexWriteFault(page, 'throw');
        await this.saveFromPopup(profile, page, WORDS.like, { fails: true });
        await page.close();
        const afterThrow = readDeck(profile);
        assertDeckIntact(afterThrow, restored, 'A save whose index write threw');
        assert(!afterThrow.orphanIds.length, 'A failed save left its card record behind', afterThrow);

        // 2. The page closes after the new card record is written but before
        //    the index commits. The next page sees the old, complete deck and
        //    Study opens on it.
        page = await this.openArticle(profile);
        const closed = new Promise(resolve => page.once('close', resolve));
        await installIndexWriteFault(page, 'close');
        await (await this.openSaveAction(page, WORDS.like)).save.click();
        await withTimeout(closed, 30_000, 'the save to reach its index commit');
        const afterClose = readDeck(profile);
        assertDeckIntact(afterClose, restored, 'A save interrupted by closing the page');
        const study = await this.withStudy(profile, async page => ({
            library: await this.libraryRows(page, 2),
            counts: await this.studyCounts(page),
        }));
        assert(sameMembers(study.library.map(row => row.expression), [WORDS.read.surface, WORDS.book.surface])
            && study.counts.statsDueNow === 0, 'Study did not open the intact collection after an interrupted save', study);

        // 3. Recovery: saving again completes once the closed page's storage
        //    lease lapses, and the collection grows by exactly one word.
        page = await this.openArticle(profile);
        const started = Date.now();
        const recovery = await this.saveFromPopup(profile, page, WORDS.like, {
            timeout: 90_000,
            // What the learner sees while the save waits: recorded, not judged.
            whilePending: async save => {
                await page.waitForTimeout(2_000);
                return {
                    committed: readDeck(profile).ids.includes(cardId(WORDS.like)),
                    button: await save.evaluate(button => ({ text: button.textContent?.trim(), disabled: button.disabled, busy: button.getAttribute('aria-busy') })),
                    messages: await page.evaluate(() => [...document.querySelectorAll('.jpdb-reader-toast, [role="status"], [role="alert"]')].map(node => node.textContent?.trim()).filter(Boolean)),
                };
            },
        });
        const recoveryMs = Date.now() - started;
        await page.close();
        const recovered = readDeck(profile);
        assert(recovered.ids.length === 3 && recovered.cards[cardId(WORDS.like)]?.reviewEnabled === false && !recovered.torn.length,
            'Saving after interrupted writes did not add exactly one unscheduled word', recovered);
        const finalStudy = await this.withStudy(profile, async page => ({
            library: await this.libraryRows(page, 3),
            counts: await this.studyCounts(page),
        }));
        assert(finalStudy.library.length === 3 && finalStudy.counts.statsDueNow === 0,
            'Study did not show the recovered collection with an unchanged schedule', finalStudy);
        return {
            throwOnIndexWrite: { ids: afterThrow.ids, orphanIds: afterThrow.orphanIds, torn: afterThrow.torn },
            closeBeforeIndexCommit: { ids: afterClose.ids, orphanIds: afterClose.orphanIds, torn: afterClose.torn, study },
            recoverySaveMs: recoveryMs,
            recoveryPendingAfter2s: recovery.pending,
            finalStudy,
        };
    }

    // ---- Study helpers -------------------------------------------------------------

    async openStudy(profile) {
        const page = await this.openPage(profile, 'study', `${STUDY_URL}?journey=${Date.now()}`);
        // Study reopens on the section the learner last used, so wait for the
        // app itself rather than the (possibly hidden) study prompt.
        await page.waitForSelector('main.jpdb-reader-newtab[data-newtab-bound="true"] .jpdb-reader-newtab-mode', { timeout: 20_000 });
        return page;
    }

    async withStudy(profile, operation) {
        const page = await this.openStudy(profile);
        try {
            return await operation(page);
        } finally {
            await page.close();
        }
    }

    async openLibrary(page, expectedRows) {
        await newTabModeButton(page, 'search').click();
        await page.waitForFunction(count => document.querySelectorAll('[data-newtab-search-results] .jpdb-reader-newtab-browse-item').length === count,
            expectedRows, { timeout: 15_000 }).catch(() => undefined);
    }

    // Waits for the rows the learner should see; on a mismatch the caller's
    // assertion reports what Library actually listed.
    async libraryRows(page, expectedRows) {
        await this.openLibrary(page, expectedRows);
        return page.evaluate(() => [...document.querySelectorAll('.jpdb-reader-newtab-browse-item')].map(item => ({
            expression: item.querySelector('[data-expression]')?.getAttribute('data-expression') ?? '',
            state: item.querySelector('[data-browse-state]')?.getAttribute('data-browse-state') ?? '',
            addToReview: Boolean(item.querySelector('[data-newtab-action="browse-start-review"]')),
        })));
    }

    // Stats load once per visit, so press its refresh control and read the
    // numbers only after that load has finished.
    async studyCounts(page) {
        await newTabModeButton(page, 'stats').click();
        const refresh = page.locator('[data-newtab-action="stats-refresh"]');
        await refresh.waitFor({ state: 'attached', timeout: 15_000 });
        await page.evaluate(() => {
            const statuses = [];
            window.__yomuJourneyStatsStatuses = statuses;
            window.__yomuJourneyStatsObserver?.disconnect();
            window.__yomuJourneyStatsObserver = new MutationObserver(() => {
                statuses.push(document.querySelector('.jpdb-reader-stats')?.getAttribute('data-stats-status') ?? '');
            });
            window.__yomuJourneyStatsObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-stats-status'] });
        });
        await refresh.evaluate(button => button.click());
        await page.waitForFunction(() => {
            const statuses = window.__yomuJourneyStatsStatuses;
            return statuses.includes('loading') && statuses.at(-1) !== 'loading';
        }, null, { timeout: 15_000 });
        const metrics = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.jpdb-reader-stats-metric')]
            .map(metric => [metric.querySelector('.jpdb-reader-stats-metric-label')?.textContent?.trim() ?? '', metric.querySelector('strong')?.textContent?.trim() ?? ''])));
        // Cards counts every word in review, due or not; saved words wait in Library.
        return { statsDueNow: Number(metrics['Due now']), statsCards: Number(metrics.Cards) };
    }

    route(route) {
        const url = new URL(route.request().url());
        if (`${url.origin}${url.pathname}` === ARTICLE_URL) {
            return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: articleHtml() });
        }
        if (url.origin === 'https://api.jiten.moe') {
            const response = this.respond(url.href);
            return route.fulfill({ status: response.status, body: response.responseText, contentType: response.contentType, headers: { 'access-control-allow-origin': '*' } });
        }
        const asset = url.origin === new URL(STUDY_URL).origin ? hostedAssetPath(url.pathname) : null;
        if (asset) return route.fulfill({ status: 200, contentType: CONTENT_TYPES.get(path.extname(asset)) ?? 'application/octet-stream', body: readFileSync(asset) });
        this.blocked.push(url.href);
        return route.abort();
    }

    respond(urlString) {
        const url = new URL(urlString);
        if (url.origin !== 'https://api.jiten.moe') {
            this.blocked.push(urlString);
            return { status: 404, responseText: '', contentType: 'text/plain' };
        }
        if (url.pathname.endsWith('/vocabulary/parse')) return jsonHttpResponse(parsedWords(url.searchParams.get('text') ?? ''));
        const detail = url.pathname.match(/\/vocabulary\/(\d+)\/(\d+)\/info$/u);
        const word = detail && Object.values(WORDS).find(candidate => candidate.wordId === Number(detail[1]));
        if (!word) return jsonHttpResponse({});
        return jsonHttpResponse({
            wordId: word.wordId,
            mainReading: { text: word.text, frequencyRank: 500 },
            partsOfSpeech: ['n'],
            definitions: [{ meanings: [word.meaning], partsOfSpeech: ['noun'] }],
            pitchAccents: [1],
        });
    }
}

async function phase(label, operation) {
    const started = Date.now();
    const result = await operation();
    console.error(`[local-collection] ${label}: ok (${Date.now() - started}ms)`);
    return result;
}

// Each page starts from the shared store (once per tab, so a reload keeps the
// tab's own writes), and every write is reported back to it.
function sharedGmStorageProgram(snapshot, token) {
    const seed = `(() => {
        const prefix = ${JSON.stringify(GM_PREFIX)};
        if (sessionStorage.getItem('__yomuJourneySeeded') === ${JSON.stringify(token)}) return;
        for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) localStorage.removeItem(key);
        for (const [key, value] of Object.entries(${JSON.stringify(snapshot)})) localStorage.setItem(prefix + key, JSON.stringify(value));
        sessionStorage.setItem('__yomuJourneySeeded', ${JSON.stringify(token)});
    })();`;
    const bridge = gmStorageBridgeInitProgram({ key: YOMU_SETTINGS_KEY, value: KEYLESS_SETTINGS, requestBridgeName: REQUEST_BRIDGE, storagePrefix: GM_PREFIX, initialize: 'ifMissing' });
    const report = `(() => {
        const sync = window[${JSON.stringify(GM_SYNC_BRIDGE)}];
        const set = window.GM_setValue;
        const remove = window.GM_deleteValue;
        window.GM_setValue = (key, value) => { set(key, value); void sync(key, value, false); };
        window.GM_deleteValue = key => { remove(key); void sync(key, null, true); };
        window.GM.setValue = window.GM_setValue;
        window.GM.deleteValue = window.GM_deleteValue;
    })();`;
    return `${seed}\n${bridge}\n${report}`;
}

function articleHtml() {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${ARTICLE_TITLE}</title></head>
<body><main><p><small>Fixture page for automated checks.</small></p><p data-fixture-sentence>${SENTENCE}</p></main></body></html>`;
}

function hostedAssetPath(pathname) {
    if (pathname === '/study/' || pathname === '/study/index.html') return path.join(NEWTAB_DIR, 'index.html');
    const [base, relative] = pathname.startsWith('/study/') ? [NEWTAB_DIR, pathname.slice('/study/'.length)] : [DIST, pathname.slice(1)];
    const candidate = path.resolve(base, relative);
    return candidate.startsWith(`${path.resolve(base)}${path.sep}`) && existsSync(candidate) ? candidate : null;
}

function parsedWords(text) {
    return Object.values(WORDS)
        .flatMap(word => [...text.matchAll(new RegExp(word.surface, 'gu'))].map(match => ({
            offset: match.index, wordId: word.wordId, readingIndex: 0, originalText: word.surface,
        })))
        .sort((left, right) => left.offset - right.offset)
        .map(({ offset: _offset, ...word }) => word);
}

function wordSelector(surface) {
    return `[data-fixture-sentence] .jpdb-reader-word[data-expression="${surface}"]`;
}

async function closePopup(page) {
    if (!await page.locator('.jpdb-reader-popover').count()) return;
    await page.locator('.jpdb-reader-backdrop').last().click({ position: { x: 2, y: 2 } }).catch(() => undefined);
    await page.waitForFunction(() => !document.querySelector('.jpdb-reader-popover'), null, { timeout: 5_000 });
}

function libraryRow(page, expression) {
    return page.locator('.jpdb-reader-newtab-browse-item', { has: page.locator(`[data-expression="${expression}"]`) });
}

function cardId(word) {
    return `${word.surface}\u0000${word.reading}`;
}

function cardStorageKey(id) {
    return `${CARD_PREFIX}${encodeURIComponent(id)}`;
}

function withTimeout(promise, timeout, label) {
    let timer;
    const expired = new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeout); });
    return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

async function waitUntil(condition, timeout, label) {
    const deadline = Date.now() + timeout;
    while (!condition()) {
        if (Date.now() > deadline) throw new Error(`Timed out ${label}`);
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

async function waitForToast(page, pattern, timeout = 12_000) {
    await page.waitForFunction(source => {
        const expression = new RegExp(source, 'u');
        return [...document.querySelectorAll('.jpdb-reader-toast, [role="status"], [role="alert"]')]
            .some(node => expression.test(node.textContent ?? ''));
    }, pattern.source, { timeout });
}

async function waitForStudyCard(page, expression = '') {
    const shown = page.waitForFunction(want => {
        const clone = document.querySelector('[data-newtab-prompt]')?.cloneNode(true);
        clone?.querySelectorAll('rt, rp').forEach(node => node.remove());
        const text = (clone?.textContent ?? '').replace(/\s+/gu, '');
        return want ? text.startsWith(want) : text.length > 0;
    }, expression, { timeout: 15_000 });
    await shown.catch(async () => {
        const prompt = await page.locator('[data-newtab-prompt]').textContent().catch(() => '');
        throw new Error(`Study showed "${prompt?.replace(/\s+/gu, ' ').trim()}" instead of ${expression || 'a card'}`);
    });
    return page.evaluate(() => ({
        prompt: document.querySelector('[data-newtab-prompt]')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
        text: document.querySelector('[data-newtab-study]')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
        count: document.querySelector('[data-newtab-count]')?.textContent?.trim() ?? '',
    }));
}

async function revealAndGrade(page) {
    for (let attempt = 0; attempt < 8 && !await page.locator('[data-newtab-action="grade"]').count(); attempt += 1) {
        const finalStep = page.locator('[data-study-step-kind="final-reveal"]').first();
        if (await finalStep.count()) await finalStep.click().catch(() => undefined);
        else await page.locator('[data-newtab-action="reveal"]').click().catch(() => undefined);
        await page.waitForTimeout(400);
    }
    await page.locator('[data-newtab-action="grade"][data-grade="okay"], [data-newtab-action="grade"][data-grade="pass"]').first().click();
}

async function openBackupSettings(page) {
    await page.locator('[data-newtab-action="settings"]').first().evaluate(button => button.click());
    await page.waitForSelector('.jpdb-reader-settings', { state: 'visible', timeout: 20_000 });
    await page.locator('[data-action="settings-panel"][data-panel="backup"]').evaluate(button => button.click());
    await page.waitForSelector('[data-settings-panel="backup"]:not([hidden])', { timeout: 10_000 });
}

async function closeSettings(page) {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.jpdb-reader-settings'), null, { timeout: 10_000 }).catch(() => undefined);
}

// The storage fault seam: wraps the GM writer the built userscript calls so the
// deck index commit throws, or never settles while the page is closed under it.
async function installIndexWriteFault(page, mode) {
    await page.evaluate(({ faultMode, indexKey, closeBridge }) => {
        const original = window.GM_setValue;
        window.GM_setValue = (key, value) => {
            if (!String(key).startsWith(indexKey)) return original(key, value);
            if (faultMode === 'throw') throw new DOMException('Journey fixture: storage quota exceeded', 'QuotaExceededError');
            window[closeBridge]();
            return new Promise(() => undefined);
        };
    }, { faultMode: mode, indexKey: INDEX_KEY, closeBridge: CLOSE_BRIDGE });
}

// The durable deck as the shared store holds it: the committed index, the
// complete card records it lists, anything torn, and unlisted card records.
function readDeck(profile) {
    const index = profile.gm.get(INDEX_KEY) ?? { cardIds: [] };
    const ids = Array.isArray(index.cardIds) ? index.cardIds : [];
    const cards = {};
    const torn = [];
    for (const id of ids) {
        const card = profile.gm.get(cardStorageKey(id));
        const complete = card && card.id === id && typeof card.expression === 'string' && typeof card.reading === 'string'
            && [card.dueAt, card.createdAt, card.updatedAt, card.reviews, card.intervalDays, card.ease].every(Number.isFinite)
            && Array.isArray(card.meanings);
        if (complete) cards[id] = card;
        else torn.push({ id, card: card ?? null });
    }
    const storedIds = [...profile.gm.keys()].filter(key => key.startsWith(CARD_PREFIX))
        .map(key => decodeURIComponent(key.slice(CARD_PREFIX.length)));
    return { revision: index.revision ?? 0, ids, cards, torn, orphanIds: storedIds.filter(id => !ids.includes(id)) };
}

function assertRestored(deck, library, label) {
    const read = deck.cards[cardId(WORDS.read)];
    const book = deck.cards[cardId(WORDS.book)];
    assert(deck.ids.length === 2 && !deck.torn.length, `${label} did not restore exactly the two saved words`, deck);
    assert(read?.reviews === 1 && read.dueAt > Date.now() && read.sentence === SENTENCE && read.sourceUrl === ARTICLE_URL
        && read.sourceTitle === ARTICLE_TITLE, `${label} lost the reviewed word's schedule or context`, { read });
    assert(book?.reviewEnabled === false && book.sentence === SENTENCE && book.sourceUrl === ARTICLE_URL && book.sourceTitle === ARTICLE_TITLE,
        `${label} scheduled or lost the saved-only word`, { book });
    const rows = Object.fromEntries(library.map(row => [row.expression, row]));
    assert(library.length === 2 && rows[WORDS.book.surface]?.addToReview && rows[WORDS.read.surface] && !rows[WORDS.read.surface].addToReview,
        `${label}: Library did not show the restored words with the right review state`, { library });
}

function assertDeckIntact(deck, expected, label) {
    assert(!deck.torn.length, `${label} left a torn card record`, deck);
    assert(sameMembers(deck.ids, expected.ids), `${label} changed which words the deck lists`, { ids: deck.ids, expected: expected.ids });
    for (const id of expected.ids) {
        assert(JSON.stringify(deck.cards[id]) === JSON.stringify(expected.cards[id]),
            `${label} changed a saved record`, { id, before: expected.cards[id], after: deck.cards[id] });
    }
}

function sameMembers(left, right) {
    return left.length === right.length && [...left].sort().join('\n') === [...right].sort().join('\n');
}

function pick(value, keys) {
    return Object.fromEntries(keys.map(key => [key, value?.[key]]));
}
