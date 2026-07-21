import path from 'node:path';
import { createRequire } from 'node:module';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin, type PluginOption } from 'vite';
import monkey, { type MonkeyUserScript } from 'vite-plugin-monkey';
import pkg from './package.json' with { type: 'json' };
import { jpdbAudioDevProxyPlugin } from './config/vite/jpdb-audio-proxy';

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
        description: 'Japanese popup dictionary, furigana, pitch accent, OCR, subtitles, and a study page.',
        // See docs/store-review-notes.md before narrowing these; broad page
        // access is Yomu's core "read Japanese anywhere" behavior.
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
    if (shouldUseGreasyForkCompanions(command)) {
        alias['../companions/register-build-target'] = path.join(configRoot, 'src', 'reader', 'companions', 'register-empty.ts');
        alias['../study/mining-context'] = path.join(configRoot, 'src', 'reader', 'study', 'mining-context-companion.ts');
        alias['../study/sources'] = path.join(configRoot, 'src', 'reader', 'study', 'sources-companion.ts');
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

function readerTestConfig() {
    return {
        environment: 'jsdom',
        include: ['tests/reader/**/*.test.ts'],
        // Guard against a stray generated shard dir left by a removed generator.
        exclude: ['tests/reader/**/.vitest-*-shards/**'],
        setupFiles: ['tests/reader/setup.ts'],
        globals: true,
        // A handful of timing-sensitive audio/bridge tests pass in isolation but
        // can flake when scheduling shifts under the full sequential run; retry
        // absorbs that without masking a genuine, repeatable failure.
        retry: 2,
        pool: 'forks',
        poolOptions: {
            forks: {
                // Cap concurrent jsdom forks to the available cores (never above 10).
                // A hard 10 oversubscribes an 8-core runner and — combined with the
                // sharded suite launching several Vitest processes at once — is what
                // thrashes a loaded machine into the suite-child timeout. Honors an
                // explicit VITEST_MAX_FORKS override for hand-tuned CI runners.
                maxForks: readMaxForks(),
                // Direct and targeted Vitest commands stay isolated by default.
                // run-ci-tests.mjs opts its reusable majority into isolate:false,
                // then runs the remaining incompatible files in a small isolated
                // pass. This keeps npm test/check:quick safe when their selection
                // happens to include one of the quarantined files.
                isolate: process.env.VITEST_ISOLATE !== '0',
                // Long-lived reused forks accumulate jsdom heap; cap it so a leak
                // fails one fork loudly instead of OOM-killing the machine
                // (historical tinypool exit-137 deaths). Small CI runners can
                // tighten the cap via YOMU_VITEST_FORK_HEAP_MB.
                execArgv: [`--max-old-space-size=${forkHeapMb()}`],
            },
        },
    };
}

function forkHeapMb(): number {
    const override = Number.parseInt(process.env.YOMU_VITEST_FORK_HEAP_MB ?? '', 10);
    return Number.isInteger(override) && override >= 256 ? override : 2304;
}

function readMaxForks(): number {
    const override = Number.parseInt(process.env.VITEST_MAX_FORKS ?? '', 10);
    if (Number.isInteger(override) && override >= 1) return override;
    return Math.max(2, Math.min(10, availableParallelism()));
}
