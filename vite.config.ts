import { defineConfig } from 'vite';
import monkey, { type MonkeyUserScript } from 'vite-plugin-monkey';
import pkg from './package.json' with { type: 'json' };
import { jpdbAudioDevProxyPlugin } from './vite-jpdb-audio-proxy';

const githubOwner = 'HRussellZFAC023';
const repoUrl = `https://github.com/${githubOwner}/${pkg.name}`;
const docsUrl = `https://${githubOwner.toLowerCase()}.github.io/${pkg.name}/`;
const rawReaderCssUrl = `https://raw.githubusercontent.com/${githubOwner}/${pkg.name}/main/dist/yomu.css`;
const userscriptIcon = `${docsUrl}yomu-icon.svg`;
const broadUserscriptMatch = ['*://*/*', 'file:///*'];
const userscriptConnect = [
    'jpdb.io',
    'apiv2express.immersionkit.com',
    'apiv2.immersionkit.com',
    'api.nadeshiko.co',
    'cdn.nadeshiko.co',
    'us-southeast-1.linodeobjects.com',
    'raw.githubusercontent.com',
    'en.wiktionary.org',
    'media.kanjialive.com',
    'localhost',
    '127.0.0.1',
    '*.ts.net',
    // Required for user-configured audio, OCR, proxy, dictionary,
    // AnkiConnect-compatible, Tailnet, and local service URLs.
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

export default defineConfig(({ command, mode }) => ({
    plugins: [
        jpdbAudioDevProxyPlugin(),
        monkey({
            entry: 'src/reader/userscript-entry.ts',
            userscript: {
                name: 'よむ',
                namespace: repoUrl,
                version: pkg.version,
                description: 'JPDB/Yomitan popup reader with audio, manga OCR, and video subtitle mining for Japanese on any website.',
                author: 'Henry',
                // See docs/store-review-notes.md before narrowing these; broad page
                // access is Yomu's core "read Japanese anywhere" behavior.
                match: userscriptMatchForCommand(command),
                connect: userscriptConnect,
                grant: userscriptGrant,
                'inject-into': 'content',
                'run-at': 'document-idle',
                license: 'GPL-3.0-or-later',
                icon: userscriptIcon,
                icon64: userscriptIcon,
                homepageURL: repoUrl,
                supportURL: `${repoUrl}/issues`,
                resource: {
                    yomuCss: rawReaderCssUrl,
                },
            },
            build: {
                fileName: 'yomu.user.js',
            },
        }),
    ],
    server: {
        origin: 'http://127.0.0.1:5174',
        port: Number(process.env.PORT || 5174),
        strictPort: false,
        cors: true,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
            'Access-Control-Allow-Headers': '*',
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: mode !== 'development',
        target: 'es2022',
        minify: false,
        cssMinify: false,
    },
    test: {
        environment: 'jsdom',
        include: ['tests/reader/**/*.test.ts'],
        globals: true,
    },
}));
