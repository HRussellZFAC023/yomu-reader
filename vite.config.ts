import path from 'node:path';
import { createRequire } from 'node:module';
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
const rawReaderCssUrl = `${docsUrl}yomu.css`;
const userscriptIcon = `${docsUrl}yomu-icon.svg`;
const broadUserscriptMatch = ['*://*/*', 'file:///*'];
// Required for user-configured audio, OCR, proxy, dictionary,
// AnkiConnect-compatible, Tailnet, and local service URLs.
const userscriptConnect = ['*'];
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
        description: 'Japanese popup reader.',
        // See docs/store-review-notes.md before narrowing these; broad page
        // access is Yomu's core "read Japanese anywhere" behavior.
        match: userscriptMatchForCommand(command),
        connect: userscriptConnect,
        grant: userscriptGrant,
        'inject-into': 'content',
        'run-at': 'document-start',
        license: 'MIT',
        icon: userscriptIcon,
        ...(splitCompanions ? { require: greasyForkLibraryUrls() } : {}),
        resource: {
            yomuCss: rawReaderCssUrl,
        },
    };
}

function readerResolveConfig(command: string) {
    return shouldUseGreasyForkCompanions(command)
        ? {
            alias: {
                '../companions/register-build-target': path.join(configRoot, 'src', 'reader', 'companions', 'register-empty.ts'),
            },
        }
        : {};
}

function shouldUseGreasyForkCompanions(command: string): boolean {
    return command === 'build' && process.env.YOMU_USERSCRIPT_BUNDLE_MODE !== 'self-contained';
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
        exclude: generatedShardExcludePatterns(),
        setupFiles: ['tests/reader/setup.ts'],
        globals: true,
        // A handful of timing-sensitive audio/bridge tests pass in isolation but
        // can flake when scheduling shifts under the full sequential run; retry
        // absorbs that without masking a genuine, repeatable failure.
        retry: 2,
        pool: 'forks',
        poolOptions: {
            forks: {
                maxForks: 10,
            },
        },
    };
}

const generatedShardExcludes = [
    ['YOMU_INCLUDE_GENERATED_JPDB_SHARDS', 'tests/reader/.vitest-jpdb-shards/**'],
    ['YOMU_INCLUDE_GENERATED_NEW_TAB_REVIEW_SHARDS', 'tests/reader/.vitest-new-tab-review-shards/**'],
    ['YOMU_INCLUDE_GENERATED_SETTINGS_SHARDS', 'tests/reader/.vitest-settings-shards/**'],
    ['YOMU_INCLUDE_GENERATED_SUBTITLES_CONTROLLER_SHARDS', 'tests/reader/.vitest-subtitles-controller-shards/**'],
] as const;

function generatedShardExcludePatterns(): string[] {
    return generatedShardExcludes
        .filter(([envName]) => process.env[envName] !== '1')
        .map(([, pattern]) => pattern);
}
