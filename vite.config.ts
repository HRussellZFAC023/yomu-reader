/// <reference types="vitest" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import pkg from './package.json' with { type: 'json' };

const repoUrl = 'https://github.com/HRussellZFAC023/kotoba-reader';
const rawUserscriptUrl = 'https://raw.githubusercontent.com/HRussellZFAC023/kotoba-reader/main/dist/yomu.user.js';
const userscriptIconSvg = readFileSync(new URL('./src/reader/assets/yomu-icon.svg', import.meta.url), 'utf8')
    .replace(/>\s+</g, '><')
    .replace(/\s+\/>/g, '/>')
    .trim();
const userscriptIcon = `data:image/svg+xml,${encodeURIComponent(userscriptIconSvg)}`;

export default defineConfig({
    plugins: [
        {
            name: 'jpdb-reader-audio-proxy',
            configureServer(server) {
                server.middlewares.use('/__jpdb-reader-audio-proxy', async (req, res) => {
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
                        const body = Buffer.from(await response.arrayBuffer());
                        res.end(body);
                    } catch (error) {
                        res.statusCode = 502;
                        res.end(error instanceof Error ? error.message : 'Proxy failed');
                    }
                });
            },
        },
        monkey({
            entry: 'src/reader/main.ts',
            userscript: {
                name: 'よむ',
                namespace: repoUrl,
                version: pkg.version,
                description: 'JPDB/Yomitan popup reader with audio, manga OCR, and video subtitle mining for Japanese on any website.',
                author: 'Henry',
                match: ['*://*/*', 'file:///*'],
                connect: [
                    'jpdb.io',
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
                    'GM_xmlhttpRequest',
                    'GM_setValue',
                    'GM_getValue',
                    'GM_addStyle',
                    'GM_registerMenuCommand',
                ],
                'run-at': 'document-idle',
                license: 'MIT',
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
