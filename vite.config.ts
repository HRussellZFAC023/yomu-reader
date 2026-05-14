import type { IncomingMessage, ServerResponse } from 'node:http';
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
        {
            name: 'jpdb-reader-dev-proxies',
            configureServer(server) {
                const proxy = async (req: IncomingMessage, res: ServerResponse, label: string) => {
                    try {
                        const requestUrl = new URL(req.url ?? '', 'http://127.0.0.1');
                        const target = requestUrl.searchParams.get('url');
                        if (!target) {
                            res.statusCode = 400;
                            res.end('Missing url');
                            return;
                        }
                        const response = await fetch(target);
                        res.statusCode = response.status;
                        res.setHeader('access-control-allow-origin', '*');
                        res.setHeader('content-type', response.headers.get('content-type') ?? 'application/octet-stream');
                        const disposition = response.headers.get('content-disposition');
                        if (disposition) res.setHeader('content-disposition', disposition);
                        const body = Buffer.from(await response.arrayBuffer());
                        res.end(body);
                    } catch (error) {
                        res.statusCode = 502;
                        res.end(error instanceof Error ? error.message : `${label} proxy failed`);
                    }
                };
                server.middlewares.use('/__jpdb-reader-audio-proxy', (req, res) => void proxy(req, res, 'Audio'));
                server.middlewares.use('/__jpdb-reader-dictionary-proxy', (req, res) => void proxy(req, res, 'Dictionary'));
                server.middlewares.use('/__jpdb-reader-immersion-proxy', (req, res) => void proxy(req, res, 'Immersion Kit'));
            },
        },
        monkey({
            entry: 'src/reader/userscript-entry.ts',
            userscript: {
                name: 'よむ',
                namespace: repoUrl,
                version: pkg.version,
                description: 'JPDB/Yomitan popup reader with audio, manga OCR, and video subtitle mining for Japanese on any website.',
                author: 'Henry',
                match: ['*://*/*', 'file:///*'],
                exclude: [`${docsUrl}*`],
                connect: [
                    'jpdb.io',
                    'apiv2express.immersionkit.com',
                    'apiv2.immersionkit.com',
                    'us-southeast-1.linodeobjects.com',
                    'lensfrontend-pa.googleapis.com',
                    'lens.google.com',
                    'vision.googleapis.com',
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
                    // Some managers expose this legacy lowercase-h alias, but vite-plugin-monkey's grant types omit it.
                    // @ts-expect-error keep the literal metadata entry for compatibility.
                    'GM.xmlhttpRequest',
                    'GM_xmlhttpRequest',
                    'GM_setValue',
                    'GM_getValue',
                    'GM_deleteValue',
                    'GM_listValues',
                    'GM_addStyle',
                    'GM_registerMenuCommand',
                ],
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
