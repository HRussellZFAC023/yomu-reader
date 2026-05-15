import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import pkg from './package.json' with { type: 'json' };

const githubOwner = 'HRussellZFAC023';
const repoUrl = `https://github.com/${githubOwner}/${pkg.name}`;
const docsUrl = `https://${githubOwner.toLowerCase()}.github.io/${pkg.name}/`;
const rawUserscriptUrl = `https://raw.githubusercontent.com/${githubOwner}/${pkg.name}/main/dist/yomu.user.js`;
const userscriptIcon = `${docsUrl}yomu-icon.svg`;

export default defineConfig({
    plugins: [
        monkey({
            entry: 'src/reader/userscript-entry.ts',
            userscript: {
                name: 'よむ',
                namespace: repoUrl,
                version: pkg.version,
                description: 'JPDB/Yomitan popup reader with audio, manga OCR, and video subtitle mining for Japanese on any website.',
                author: 'Henry',
                match: ['*://*/*', 'file:///*'],
                connect: [
                    'jpdb.io',
                    'apiv2express.immersionkit.com',
                    'apiv2.immersionkit.com',
                    'us-southeast-1.linodeobjects.com',
                    'raw.githubusercontent.com',
                    'en.wiktionary.org',
                    'media.kanjialive.com',
                    'localhost',
                    '127.0.0.1',
                    '*.ts.net',
                    '*',
                ],
                grant: [
                    'GM.xmlHttpRequest',
                    'GM_xmlhttpRequest',
                    'GM_setValue',
                    'GM_getValue',
                    'GM_deleteValue',
                    'GM_listValues',
                    'GM_addValueChangeListener',
                    'GM_removeValueChangeListener',
                    'GM_addStyle',
                    'GM_registerMenuCommand',
                ],
                'inject-into': 'content',
                'run-at': 'document-idle',
                license: 'GPL-3.0-or-later',
                icon: userscriptIcon,
                icon64: userscriptIcon,
                homepageURL: repoUrl,
                supportURL: `${repoUrl}/issues`,
                downloadURL: rawUserscriptUrl,
                updateURL: rawUserscriptUrl,
            },
            build: {
                fileName: 'yomu.user.js',
            },
        }),
    ],
    server: {
        origin: 'http://127.0.0.1:5174',
        port: 5174,
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
        emptyOutDir: true,
    },
    test: {
        environment: 'jsdom',
        include: ['tests/reader/**/*.test.ts'],
        globals: true,
    },
});
