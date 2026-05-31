#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import pkg from '../package.json' with { type: 'json' };

const explicitPort = Boolean(process.env.PORT);
let port = Number(process.env.PORT || 5174);
const host = process.env.HOST || '127.0.0.1';
let origin = `http://${host}:${port}`;
const devDist = path.resolve(process.env.YOMU_DEV_DIST || 'dist-dev');
const distUserscript = path.join(devDist, 'yomu.user.js');
const distReaderCss = path.join(devDist, 'yomu.css');
const buildReaderCssScript = path.resolve('scripts/build-reader-css.mjs');
const viteBin = process.platform === 'win32'
    ? path.resolve('node_modules/.bin/vite.cmd')
    : path.resolve('node_modules/.bin/vite');
const vitepressBin = process.platform === 'win32'
    ? path.resolve('node_modules/.bin/vitepress.cmd')
    : path.resolve('node_modules/.bin/vitepress');

const githubOwner = 'HRussellZFAC023';
const repoUrl = `https://github.com/${githubOwner}/${pkg.name}`;
const docsUrl = `https://${githubOwner.toLowerCase()}.github.io/${pkg.name}/`;
const userscriptIcon = `${docsUrl}yomu-icon.svg`;
const matches = process.env.YOMU_DEV_MATCH
    ? process.env.YOMU_DEV_MATCH.split(',').map(match => match.trim()).filter(Boolean)
    : ['*://*/*', 'file:///*'];
const connects = [
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
    '*',
];
const grants = [
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
    'GM_addStyle',
    'GM_getResourceText',
    'GM_registerMenuCommand',
];

const metadataLine = (key, value) => `// @${key.padEnd(12)} ${value}`;
const write = (res, status, body, type = 'text/plain; charset=utf-8') => {
    res.writeHead(status, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Cache-Control': 'no-store',
        'Content-Type': type,
    });
    res.end(body);
};

const devMetadata = () => {
    const metadata = [
        '// ==UserScript==',
        metadataLine('name', 'dev:よむ'),
        metadataLine('namespace', repoUrl),
        metadataLine('version', `${pkg.version}.dev.${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`),
        metadataLine('author', 'Henry'),
        metadataLine('description', 'Local development build for よむ.'),
        metadataLine('license', 'GPL-3.0-or-later'),
        metadataLine('icon', userscriptIcon),
        metadataLine('icon64', userscriptIcon),
        metadataLine('homepage', docsUrl),
        metadataLine('homepageURL', repoUrl),
        metadataLine('source', `${repoUrl}.git`),
        metadataLine('supportURL', `${repoUrl}/issues`),
        metadataLine('downloadURL', `${origin}/yomu.user.js`),
        metadataLine('updateURL', `${origin}/yomu.user.js`),
        metadataLine('resource', `yomuCss ${origin}/yomu.css`),
        ...matches.map(match => metadataLine('match', match)),
        ...connects.map(connect => metadataLine('connect', connect)),
        ...grants.map(grant => metadataLine('grant', grant)),
        metadataLine('inject-into', 'content'),
        metadataLine('run-at', 'document-idle'),
        '// ==/UserScript==',
    ];

    return metadata.join('\n');
};

const devUserscript = async () => {
    const bundled = await readFile(distUserscript, 'utf8');
    const start = bundled.indexOf('// ==UserScript==');
    const endMarker = '// ==/UserScript==';
    const end = bundled.indexOf(endMarker);
    if (start === -1 || end === -1) {
        return `${devMetadata()}\n\n${bundled}`;
    }
    return `${bundled.slice(0, start)}${devMetadata()}${bundled.slice(end + endMarker.length)}`;
};

const buildReaderCss = (stdio = 'inherit') => new Promise((resolve, reject) => {
    const build = spawn(process.execPath, [buildReaderCssScript], {
        env: {
            ...process.env,
            YOMU_READER_CSS_OUT: distReaderCss,
        },
        stdio,
    });
    build.on('error', reject);
    build.on('exit', code => {
        if (code) {
            reject(new Error(`reader CSS build failed with exit code ${code}`));
            return;
        }
        resolve();
    });
});

const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
        write(res, 204, '');
        return;
    }

    const requestUrl = new URL(req.url || '/', origin);
    if (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html') {
        res.writeHead(302, {
            'Cache-Control': 'no-store',
            Location: '/yomu.user.js',
        });
        res.end();
        return;
    }

    if (requestUrl.pathname === '/yomu.user.js') {
        try {
            write(res, 200, await devUserscript(), 'application/javascript; charset=utf-8');
        } catch {
            write(res, 503, `${path.relative(process.cwd(), distUserscript)} is not ready yet; wait for the first Vite build.`);
        }
        return;
    }

    if (requestUrl.pathname === '/yomu.css') {
        try {
            write(res, 200, await readFile(distReaderCss, 'utf8'), 'text/css; charset=utf-8');
        } catch {
            write(res, 503, `${path.relative(process.cwd(), distReaderCss)} is not ready yet; wait for the first CSS build.`);
        }
        return;
    }

    write(res, 404, 'Not found');
});

await buildReaderCss();

const vite = spawn(viteBin, ['build', '--watch', '--mode', 'development', '--outDir', devDist], {
    env: process.env,
    stdio: 'inherit',
});
const docs = spawn(vitepressBin, ['dev', 'docs', '--host', host], {
    env: process.env,
    stdio: 'inherit',
});

let announced = false;
const listen = () => server.listen(port, host, () => {
    if (announced) {
        return;
    }
    announced = true;
    console.log(`[yomu-dev] serving ${origin}`);
    console.log(`[yomu-dev] install ${origin}/yomu.user.js`);
    console.log(`[yomu-dev] Vite is rebuilding ${path.relative(process.cwd(), distUserscript)} on changes`);
    console.log(`[yomu-dev] docs are served by VitePress; open the printed VitePress URL for /yomu-reader/newtab/`);
});

server.on('error', error => {
    if (error.code === 'EADDRINUSE' && !explicitPort) {
        port += 1;
        origin = `http://${host}:${port}`;
        listen();
        return;
    }
    console.error(error);
    stop();
    process.exit(1);
});

listen();

const stop = () => {
    server.close();
    if (!vite.killed) {
        vite.kill('SIGTERM');
    }
    if (!docs.killed) {
        docs.kill('SIGTERM');
    }
};

vite.on('exit', code => {
    if (code && code !== 130 && code !== 143) {
        process.exitCode = code;
    }
});
docs.on('exit', code => {
    if (code && code !== 130 && code !== 143) {
        process.exitCode = code;
    }
});

process.on('SIGINT', () => {
    stop();
    process.exit(130);
});
process.on('SIGTERM', () => {
    stop();
    process.exit(143);
});
