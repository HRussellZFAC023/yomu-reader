// Recorded Pages: replay a saved real page (frozen DOM + HAR) through
// Playwright routing and run the BUILT product on it, exactly as a userscript
// manager would — dist/yomu.user.js with its @require companions in one init
// program and its @resource CSS behind GM_getResourceText — with every request
// the product makes written to a Network Ledger.
//
//   const run = await openRecordedPage({ browser, slug: 'ja-wikipedia-nihongo' });
//   await run.page.waitForTimeout(15_000);
//   assertNoRequestsBeforeInteraction(run.ledger, 'googleapis.com');
//   await run.close();
//
// docs/dev/recorded-pages.md describes the recording format and the rules for
// what may be committed.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNetworkLedger, networkLedgerPageProgram } from './network-ledger.mjs';
import { readHarIndex } from './recorded-har.mjs';
import { recordedHostAdapter } from './recorded-hosts.mjs';
import { answerGmRequest, routePageRequest } from './recorded-network.mjs';
import { worktreeProduct } from './recorded-products.mjs';
import { YOMU_SETTINGS_KEY, gmStorageBridgeInitProgram } from './smoke-harness.mjs';
import { addUserscriptGraphInitScripts } from './smoke-test-helpers.mjs';

export { releaseProduct, worktreeProduct } from './recorded-products.mjs';

export const RECORDINGS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'recorded');
const REQUEST_BINDING = '__yomuRecordedGmRequest';
const LEDGER_BINDINGS = { requestBinding: '__yomuLedgerRequest', interactionBinding: '__yomuLedgerInteraction', pageStampBinding: '__yomuLedgerPageStamp' };

export function listRecordings() {
    return readdirSync(RECORDINGS_ROOT, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && existsSync(path.join(RECORDINGS_ROOT, entry.name, 'manifest.json')))
        .map(entry => entry.name)
        .sort();
}

/** slug: a folder name under RECORDINGS_ROOT, or an absolute path (the recorder's staging copy). */
export function loadRecording(slug) {
    const dir = path.isAbsolute(slug) ? slug : path.join(RECORDINGS_ROOT, slug);
    const manifestPath = path.join(dir, 'manifest.json');
    if (!existsSync(manifestPath)) throw new Error(`No recorded page "${slug}" (expected ${manifestPath}). Run node scripts/record-pages.mjs ${slug}.`);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const readJson = file => JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    return {
        slug: path.basename(dir),
        dir,
        manifest,
        documentHtml: () => readFileSync(path.join(dir, manifest.document), 'utf8'),
        har: () => readHarIndex(path.join(dir, manifest.har)),
        productTraffic: () => (manifest.productTraffic ? readHarIndex(path.join(dir, manifest.productTraffic.har)) : null),
        geometry: () => readJson(manifest.geometry),
    };
}

/**
 * Opens a recorded page with the product running on it.
 *
 * product: worktreeProduct() (default), releaseProduct('v2.1.6'), or null for the bare page.
 * settings: stored settings, or null for a fresh install that saved nothing.
 * gmNetwork: what GM_xmlhttpRequest reaches —
 *   'replay'  recorded answers (default); anything else fails like a dropped connection
 *   'offline' nothing answers
 *   'live'    the real network (APIRequestContext), for canaries
 *   'record'  the real network for recordHosts only, their answers added to recorder
 *             (createHarWriter; the caller writes it); every other host fails
 * pageNetwork: what the page's own unrecorded requests reach ('offline' | 'live').
 * onGmRequest(request) may answer first ({ status, body, contentType }) to model
 *   a failing service; return undefined to fall through.
 */
export async function openRecordedPage(options) {
    const { settings = null, navigate = true, waitUntil = 'load', contextOptions = {} } = options;
    const scope = recordedPageScope(options);
    const context = await options.browser.newContext({ viewport: scope.recording.manifest.recorder.viewport, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...contextOptions });
    scope.context = context;
    await context.exposeFunction(LEDGER_BINDINGS.requestBinding, request => void scope.ledger.recordRequest(request));
    await context.exposeFunction(LEDGER_BINDINGS.interactionBinding, interaction => scope.ledger.recordInteraction(interaction));
    await context.exposeFunction(LEDGER_BINDINGS.pageStampBinding, stamp => scope.ledger.recordPageStamp(stamp));
    await context.route('**/*', route => routePageRequest(route, scope));
    await installProduct(context, scope, settings);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error.message).slice(0, 300)));
    if (navigate) await page.goto(scope.recording.manifest.url, { waitUntil });
    return {
        engine: scope.engine,
        recording: scope.recording,
        context,
        page,
        ledger: scope.ledger,
        pageErrors,
        close: () => context.close(),
    };
}

function recordedPageScope({ browser, slug, product, gmNetwork = 'replay', pageNetwork = 'offline', hosted = true, onGmRequest, recordHosts = [], recorder, hostOptions = {} }) {
    const recording = loadRecording(slug);
    const engine = browser.browserType().name();
    return {
        recording,
        engine,
        product: product === undefined ? worktreeProduct() : product,
        ledger: createNetworkLedger(),
        har: recording.har(),
        productTraffic: gmNetwork === 'replay' ? recording.productTraffic() : null,
        recorder: gmNetwork === 'record' ? recordingWriter(recorder) : null,
        host: recordedHostAdapter(recording, { engine, ...hostOptions }),
        gmNetwork,
        pageNetwork,
        hosted,
        onGmRequest,
        recordHosts,
    };
}

function recordingWriter(recorder) {
    if (!recorder) throw new Error('gmNetwork "record" needs a recorder (createHarWriter) to keep the answers in.');
    return recorder;
}

async function installProduct(context, scope, settings) {
    const probes = networkLedgerPageProgram(LEDGER_BINDINGS);
    if (!scope.product) {
        await context.addInitScript({ content: probes });
        return;
    }
    await context.exposeFunction(REQUEST_BINDING, request => answerGmRequest(request, scope));
    const bridge = gmStorageBridgeInitProgram({
        key: YOMU_SETTINGS_KEY,
        value: settings ?? {},
        initialize: settings ? 'always' : 'never',
        css: readFileSync(scope.product.cssPath, 'utf8'),
        requestBridgeName: REQUEST_BINDING,
    });
    await addUserscriptGraphInitScripts(context, scope.product.scriptPath, { prefixContent: `${bridge}\n;\n${probes}`, sourceUrl: `yomu-${scope.product.label}.user.js` });
}
