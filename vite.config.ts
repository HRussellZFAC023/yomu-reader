import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin, type PluginOption } from 'vite';
import monkey, { type MonkeyUserScript } from 'vite-plugin-monkey';
import pkg from './package.json' with { type: 'json' };
import { jpdbAudioDevProxyPlugin } from './config/vite/jpdb-audio-proxy';
import { readerTestConfig } from './config/vite/reader-test';

const require = createRequire(import.meta.url);
const { greasyForkLibraryUrls } = require('./scripts/lib/greasyfork-libraries.cjs') as {
    greasyForkLibraryUrls: () => string[];
};
const configRoot = path.dirname(fileURLToPath(import.meta.url));
const githubOwner = 'HRussellZFAC023';
const repoUrl = `https://github.com/${githubOwner}/${pkg.name}`;
const docsUrl = 'https://yomureader.com/';
// Versioned like the companion @require URLs: Tampermonkey-family managers
// cache @resource content at install time keyed by URL, so an unversioned URL
// keeps serving a stale stylesheet across script updates. The
// annotate-greasyfork-requires build step appends #sha256= last, once
// dist/yomu.css is final.
const rawReaderCssUrl = `${docsUrl}yomu.css?v=${encodeURIComponent(pkg.version)}`;
const userscriptIcon = `${docsUrl}favicon-32x32.png`;
// Update checks must not ride the browser cache Cloudflare puts in front of
// yomureader.com (max-age=14400). With several releases landing in one day, a
// manager that fetched yomu.user.js keeps re-offering the version it cached
// hours ago — the reported "still installs 1.6.241 when 1.6.244 is out".
// Greasy Fork's update endpoints answer must-revalidate, so the version probe
// is always fresh; the hosted copy stays the install entry point.
const greasyForkScriptId = 581653;
const greasyForkScriptSlug = encodeURIComponent('よむ');
const greasyForkUpdateBase = `https://update.greasyfork.org/scripts/${greasyForkScriptId}/${greasyForkScriptSlug}`;
const userscriptUpdateUrl = `${greasyForkUpdateBase}.meta.js`;
const userscriptDownloadUrl = `${greasyForkUpdateBase}.user.js`;
const broadUserscriptMatch = ['*://*/*', 'file:///*'];
// Required for user-configured audio, OCR, proxy, dictionary,
// AnkiConnect-compatible, Tailnet, and local service URLs. Keep high-volume
// reader sources explicit before the wildcard so Tampermonkey can avoid
// prompting for every signed BookWalker page image in Firefox.
const userscriptConnect = [
    'api.jiten.moe',
    'api.tatoeba.org',
    // Sentence audio is served from the site host, not the API host, so a
    // userscript could not fetch a clip with only api.tatoeba.org allowed.
    'tatoeba.org',
    'jpdb.io',
    'api.wanikani.com',
    'lens.google.com',
    'lensfrontend-pa.googleapis.com',
    'www.google.com',
    'yomureader.com',
    'bookwalker.jp',
    'viewer.bookwalker.jp',
    'c.bookwalker.jp',
    'bw-bv-epubs.bookwalker.jp',
    '*',
];
const userscriptGrant: NonNullable<MonkeyUserScript['grant']> = [
    'GM.xmlHttpRequest',
    'GM.setValue',
    'GM.getValue',
    'GM.deleteValue',
    'GM.listValues',
    'GM_xmlhttpRequest',
    'GM_setValue',
    'GM_getValue',
    'GM_deleteValue',
    'GM_listValues',
    'GM_addValueChangeListener',
    'GM_removeValueChangeListener',
    'GM_getResourceText',
    'GM_registerMenuCommand',
];

const userscriptMatchForCommand = (command: string) =>
    command === 'serve' && process.env.YOMU_DEV_MATCH
        ? process.env.YOMU_DEV_MATCH.split(',').map(match => match.trim()).filter(Boolean)
        : broadUserscriptMatch;

function faviconDevMiddleware(): Plugin {
    return {
        name: 'yomu-favicon-dev-middleware',
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                if (request.url?.split('?')[0] !== '/favicon.ico') {
                    next();
                    return;
                }
                response.statusCode = 302;
                response.setHeader('Location', '/favicon-32x32.png');
                response.end();
            });
        },
    };
}

export default defineConfig(({ command, mode }) => ({
    plugins: readerPlugins(command),
    define: readerDefines(command),
    resolve: readerResolveConfig(command),
    server: readerDevServerConfig,
    build: readerBuildConfig(mode),
    test: readerTestConfig(),
}));

function readerPlugins(command: string): PluginOption[] {
    const splitCompanions = shouldUseGreasyForkCompanions(command);
    return [
        jpdbAudioDevProxyPlugin(),
        faviconDevMiddleware(),
        monkey({
            entry: 'src/reader/userscript/entry.ts',
            userscript: readerUserscript(command, splitCompanions),
            build: {
                fileName: 'yomu.user.js',
            },
        }),
    ];
}

function readerUserscript(command: string, splitCompanions: boolean): MonkeyUserScript {
    return {
        name: 'よむ',
        namespace: repoUrl,
        version: pkg.version,
        author: 'Henry Russell',
        // The Greasy Fork listing is searched by this text — the name is よむ,
        // so without "Yomu" and feature keywords here the script is
        // unfindable by its romaji name.
        description: 'Popup dictionary and study tools for Japanese plus 32 reading targets, with OCR and subtitles.',
        // See docs/store-review-notes.md before narrowing these; broad page
        // access is Yomu's core "read the selected target anywhere" behavior.
        match: userscriptMatchForCommand(command),
        connect: userscriptConnect,
        grant: userscriptGrant,
        'inject-into': 'content',
        'run-at': 'document-start',
        license: 'MIT',
        icon: userscriptIcon,
        // Only the distributed userscript carries these. The self-contained
        // build feeds the extension compiler, and a stray update URL there
        // becomes a browser-extension update channel the stores reject.
        ...(splitCompanions
            ? { updateURL: userscriptUpdateUrl, downloadURL: userscriptDownloadUrl, require: greasyForkLibraryUrls() }
            : {}),
        resource: {
            yomuCss: rawReaderCssUrl,
        },
    };
}

function readerResolveConfig(command: string) {
    const alias: Record<string, string> = {};
    if (process.env.YOMU_USERSCRIPT_BUNDLE_MODE === 'self-contained') {
        alias['../../../../config/dictionaries/published/v1/runtime-catalog.json'] =
            path.join(configRoot, 'src', 'reader', 'dictionaries', 'catalog', 'runtime-catalog-extension-content.ts');
    }
    if (shouldUseGreasyForkCompanions(command)) {
        const targetRuntimeCompanion = path.join(
            configRoot,
            'src',
            'reader',
            'languages',
            'target-runtime-companion.ts',
        );
        alias['./target-runtime'] = targetRuntimeCompanion;
        alias['../languages/target-runtime'] = targetRuntimeCompanion;
        alias['../../languages/target-runtime'] = targetRuntimeCompanion;
        const tokenTextRenderingCompanion = path.join(
            configRoot,
            'src',
            'reader',
            'dom',
            'token-text-rendering-companion.ts',
        );
        alias['./token-text-rendering'] = tokenTextRenderingCompanion;
        alias['../dom/token-text-rendering'] = tokenTextRenderingCompanion;
        const localYomuDeckCompanion = path.join(
            configRoot,
            'src',
            'reader',
            'srs',
            'local-yomu-deck-companion.ts',
        );
        alias['./local-yomu-deck'] = localYomuDeckCompanion;
        const handleDragCompanion = path.join(
            configRoot,
            'src',
            'reader',
            'popup',
            'handle-drag-companion.ts',
        );
        alias['./handle-drag'] = handleDragCompanion;
        alias['../popup/handle-drag'] = handleDragCompanion;
        alias['../companions/register-build-target'] = path.join(configRoot, 'src', 'reader', 'companions', 'register-empty.ts');
        alias['./decoration-policy'] = path.join(configRoot, 'src', 'reader', 'dom', 'decoration-policy-companion.ts');
        alias['./structured-content'] = path.join(configRoot, 'src', 'reader', 'dictionaries', 'yomitan', 'structured-content-companion.ts');
        // Companion-backed facades: core imports the ordinary module path and
        // the split build swaps in the delegating shell, so the implementation
        // ships in a @require'd library instead of the size-limited core.
        alias['../audio/player'] = path.join(configRoot, 'src', 'reader', 'audio', 'player-companion.ts');
        alias['../audio/actions'] = path.join(configRoot, 'src', 'reader', 'audio', 'actions-companion.ts');
        alias['../wanikani/wanikani'] = path.join(configRoot, 'src', 'reader', 'wanikani', 'wanikani-companion.ts');
        alias['../wanikani/wanikani-lookup'] = path.join(configRoot, 'src', 'reader', 'wanikani', 'wanikani-lookup-companion.ts');
        alias['../wanikani/wanikani-source'] = path.join(configRoot, 'src', 'reader', 'wanikani', 'wanikani-source-companion.ts');
        alias['../srs/wanikani'] = path.join(configRoot, 'src', 'reader', 'srs', 'wanikani-companion.ts');
        alias['../jpdb/jpdb'] = path.join(configRoot, 'src', 'reader', 'jpdb', 'jpdb-companion.ts');
        alias['../jpdb/jpdb-vocabulary'] = path.join(configRoot, 'src', 'reader', 'jpdb', 'jpdb-vocabulary-companion.ts');
        alias['../jpdb/jpdb-public-pitch'] = path.join(configRoot, 'src', 'reader', 'jpdb', 'jpdb-public-pitch-companion.ts');
        alias['../jpdb/jpdb-review-bridge'] = path.join(configRoot, 'src', 'reader', 'jpdb', 'jpdb-review-bridge-companion.ts');
        alias['../jpdb/jpdb-definition-source-render'] = path.join(configRoot, 'src', 'reader', 'jpdb', 'jpdb-definition-source-render-companion.ts');
        alias['../jpdb/jpdb-related-words'] = path.join(configRoot, 'src', 'reader', 'jpdb', 'jpdb-related-words-companion.ts');
        alias['../dictionaries/jiten-public-vocabulary'] = path.join(configRoot, 'src', 'reader', 'dictionaries', 'jiten-public-vocabulary-companion.ts');
        alias['../jiten/jiten-definition-source-render'] = path.join(configRoot, 'src', 'reader', 'jiten', 'jiten-definition-source-render-companion.ts');
        alias['../srs/account-sync'] = path.join(configRoot, 'src', 'reader', 'srs', 'account-sync-companion.ts');
        alias['../jiten/jiten-kanji-info-render'] = path.join(configRoot, 'src', 'reader', 'jiten', 'jiten-kanji-info-render-companion.ts');
        alias['../jiten/jiten-kanji-words-actions'] = path.join(configRoot, 'src', 'reader', 'jiten', 'jiten-kanji-words-actions-companion.ts');
        alias['../study/mining-context'] = path.join(configRoot, 'src', 'reader', 'study', 'mining-context-companion.ts');
        alias['../study/sources'] = path.join(configRoot, 'src', 'reader', 'study', 'sources-companion.ts');
        alias['./lookup-links'] = path.join(configRoot, 'src', 'reader', 'settings', 'lookup-links-companion.ts');
        alias['../app/i18n'] = path.join(configRoot, 'src', 'reader', 'app', 'i18n-companion.ts');
        alias['../../app/i18n'] = path.join(configRoot, 'src', 'reader', 'app', 'i18n-companion.ts');
        // Userscript + hosted reader cannot use chrome.identity, so they get the
        // serverless Google Identity Services / broker path instead of the
        // extension's background-worker sync.
        alias['./cloud-sync'] = path.join(configRoot, 'src', 'reader', 'settings', 'cloud-sync-web.ts');
    }
    return Object.keys(alias).length ? { alias } : {};
}

function shouldUseGreasyForkCompanions(command: string): boolean {
    return command === 'build' && process.env.YOMU_USERSCRIPT_BUNDLE_MODE !== 'self-contained';
}

function readerDefines(command: string) {
    const defines = {
        __YOMU_VERSION__: JSON.stringify(pkg.version),
        // Userscript/companion builds are not the new-tab PWA, so the offline-first
        // network guard dead-code-eliminates out of the size-limited bundle.
        __YOMU_NEWTAB_BUILD__: JSON.stringify(false),
    };
    if (command === 'build') {
        return {
            ...defines,
            __YOMU_EXTENSION_BUILD__: JSON.stringify(process.env.YOMU_USERSCRIPT_BUNDLE_MODE === 'self-contained'),
            // Public OAuth client id for serverless Google Drive settings sync.
            // No secret, safe to embed; empty leaves the feature inert.
            __YOMU_GOOGLE_OAUTH_WEB_CLIENT_ID__: JSON.stringify(process.env.YOMU_GOOGLE_OAUTH_WEB_CLIENT_ID ?? ''),
            __YOMU_GOOGLE_OAUTH_EXTENSION_CONFIGURED__: JSON.stringify(Boolean(
                process.env.YOMU_GOOGLE_OAUTH_CLIENT_ID ?? process.env.GOOGLE_OAUTH_CLIENT_ID,
            )),
        };
    }
    return defines;
}

const readerDevServerConfig = {
    origin: 'http://127.0.0.1:5174',
    port: Number(process.env.PORT || 5174),
    strictPort: false,
    cors: true,
    headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': '*',
    },
};

function readerBuildConfig(mode: string) {
    return {
        outDir: 'dist',
        emptyOutDir: mode !== 'development',
        target: 'es2022',
        minify: false,
        cssMinify: false,
    };
}
