#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createProbeServer } from 'node:net';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const host = '127.0.0.1';
const preferredPort = Number(process.env.YOMU_DEV_PORT || process.env.PORT || 5174);
const port = await findPort(preferredPort);
const origin = `http://${host}:${port}`;
const publicDir = path.join(root, 'public');
const distDir = path.join(root, 'dist');
const userscriptPath = path.join(distDir, 'yomu.user.js');
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

let closing = false;
const builder = spawn(process.execPath, [viteBin, 'build', '--watch', '--mode', 'development'], {
    cwd: root,
    stdio: ['ignore', 'inherit', 'inherit'],
});

builder.on('exit', code => {
    if (!closing) process.exit(code ?? 1);
});

const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url ?? '/', origin);
        if (url.pathname === '/__jpdb-reader-audio-proxy' || url.pathname === '/__jpdb-reader-dictionary-proxy') {
            await proxy(url, res);
            return;
        }
        if (url.pathname === '/yomu.user.js' || url.pathname === '/dist/yomu.user.js') {
            await serveUserscript(res);
            return;
        }
        if (url.pathname === '/') {
            send(res, 200, devIndex(), 'text/html; charset=utf-8');
            return;
        }
        const filePath = await resolveStatic(url.pathname);
        send(res, 200, await readFile(filePath), contentType(filePath));
    } catch (error) {
        const status = error?.code === 'ENOENT' ? 404 : 500;
        send(res, status, status === 404 ? 'Not found' : String(error?.message || error));
    }
});

server.on('error', error => {
    console.error(`[dev] ${error.message}`);
    shutdown(1);
});

server.listen(port, host, () => {
    if (port !== preferredPort) console.log(`[dev] Port ${preferredPort} is busy; using ${port}.`);
    console.log(`[dev] Install userscript: ${origin}/yomu.user.js`);
    console.log(`[dev] Fixtures:           ${origin}/reader-test.html`);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function serveUserscript(res) {
    const [info, raw] = await Promise.all([stat(userscriptPath), readFile(userscriptPath, 'utf8')]);
    const versionSuffix = Math.floor(info.mtimeMs / 1000);
    const code = raw
        .replace(/^\/\/ @name\s+.+$/m, '// @name         よむ dev')
        .replace(/^\/\/ @namespace\s+.+$/m, `// @namespace    ${origin}/dev`)
        .replace(/^\/\/ @version\s+([^\s]+).*$/m, (_, version) => `// @version      ${version}.${versionSuffix}`)
        .replace(/^\/\/ @downloadURL\s+.+$/m, `// @downloadURL  ${origin}/yomu.user.js`)
        .replace(/^\/\/ @updateURL\s+.+$/m, `// @updateURL    ${origin}/yomu.user.js`);
    send(res, 200, code, 'text/javascript; charset=utf-8');
}

async function proxy(url, res) {
    const target = url.searchParams.get('url');
    if (!target) {
        send(res, 400, 'Missing url');
        return;
    }
    const response = await fetch(target, { redirect: 'follow' });
    const body = Buffer.from(await response.arrayBuffer());
    res.statusCode = response.status;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
    res.end(body);
}

async function resolveStatic(pathname) {
    const clean = path.normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '');
    const candidates = [];
    for (const base of [publicDir, distDir]) {
        candidates.push(path.resolve(base, clean));
        if (pathname.endsWith('/')) candidates.push(path.resolve(base, clean, 'index.html'));
    }
    for (const candidate of candidates) {
        const base = candidate.startsWith(publicDir) ? publicDir : distDir;
        if (candidate !== base && !candidate.startsWith(`${base}${path.sep}`)) continue;
        const info = await stat(candidate).catch(() => null);
        if (info?.isFile()) return candidate;
    }
    const error = new Error('Not found');
    error.code = 'ENOENT';
    throw error;
}

function devIndex() {
    return `<!doctype html>
<meta charset="utf-8">
<title>よむ dev</title>
<body>
  <h1>よむ dev</h1>
  <p><a href="/yomu.user.js">Install the local dev userscript</a></p>
  <p><a href="/reader-test.html">Reader fixture</a></p>
  <p><a href="/reader-video-test.html">Video fixture</a></p>
  <p><a href="/reader-ocr-test.html">OCR fixture</a></p>
</body>`;
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
    res.statusCode = status;
    res.setHeader('Content-Type', type);
    res.end(body);
}

function contentType(filePath) {
    if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
    if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
    if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
    if (filePath.endsWith('.svg')) return 'image/svg+xml; charset=utf-8';
    if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
    if (filePath.endsWith('.vtt')) return 'text/vtt; charset=utf-8';
    if (filePath.endsWith('.png')) return 'image/png';
    return 'application/octet-stream';
}

async function findPort(start) {
    for (let candidate = start; candidate < start + 20; candidate++) {
        if (await canListen(candidate)) return candidate;
    }
    throw new Error(`No open port found from ${start} to ${start + 19}`);
}

function canListen(candidate) {
    return new Promise(resolve => {
        const probe = createProbeServer();
        probe.once('error', () => resolve(false));
        probe.listen(candidate, host, () => {
            probe.close(() => resolve(true));
        });
    });
}

function shutdown(code) {
    closing = true;
    server.close(() => {});
    builder.kill('SIGTERM');
    setTimeout(() => process.exit(code), 100).unref();
}
