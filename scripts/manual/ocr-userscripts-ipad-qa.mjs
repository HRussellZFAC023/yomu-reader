#!/usr/bin/env node
// Native Safari/Userscripts check, not a GM shim or an injected product graph.
// Build first, run this server, copy public/yomu.user.js to the manager's stable
// Documents/yomu.user.js filename, rescan, and open the printed recorded page.
// Tap its sign photo in DeviceHub. Capture the result with simctl screenshot.
// Select manual image OCR before opening a fresh run. Lens uses its real
// endpoint, so do not use private images or permit automatic cloud scanning.
// Keep simulator/screen locks throughout, and restore the previous script after.
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const option = (key, fallback) => process.argv.find(arg => arg.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const out = path.resolve(option('out', path.join(root, 'artifacts/ocr-userscripts-ipad')));
const port = Number(option('port', '18810'));
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use a loopback port between 1024 and 65535.');
const origin = `http://127.0.0.1:${port}`;
const runId = option('run', Date.now().toString(36));
const publicDir = path.join(out, 'public');
const files = new Map();
const sha256 = data => createHash('sha256').update(data).digest('hex');
const cssFallback = text => text.replaceAll('https://yomureader.com/yomu.css', `${origin}/yomu.css`);
const core = readFileSync(path.join(root, 'dist/yomu.user.js'), 'utf8');
const end = core.indexOf('// ==/UserScript==') + '// ==/UserScript=='.length;
if (end < '// ==/UserScript=='.length) throw new Error('Build the userscript first.');
const metadata = core.slice(0, end).replace(/^(\/\/ @(?:require|resource\s+\S+)\s+)(\S+)$/gm, (_, prefix, dependency) => {
    const url = new URL(dependency);
    if (url.hostname !== 'yomureader.com') throw new Error(`Unexpected dependency: ${url.hostname}`);
    const relative = url.pathname.slice(1);
    const immutable = path.join(root, 'dist', relative);
    const source = readFileSync(existsSync(immutable) ? immutable
        : path.join(root, 'dist', relative.replace(/\.[a-f0-9]{12}(?=\.user\.js$|\.css$)/, '')));
    if (url.hash !== `#sha256=${createHash('sha256').update(source).digest('base64')}`) throw new Error(`Build dependency does not match its SRI: ${relative}`);
    const bytes = relative.endsWith('.js') ? Buffer.from(cssFallback(source.toString())) : source;
    const name = relative.replace(/\.[a-f0-9]{12}(?=\.user\.js$|\.css$)/, `.${sha256(bytes).slice(0, 12)}`);
    files.set(`/${name}`, { body: bytes, type: relative.endsWith('.js') ? 'text/javascript' : 'text/css' });
    return `${prefix}${origin}/${name}#sha256=${createHash('sha256').update(bytes).digest('base64')}`;
});
files.set('/yomu.user.js', { body: Buffer.from(metadata + cssFallback(core.slice(end))), type: 'text/javascript' });
files.set('/yomu.css', { body: readFileSync(path.join(root, 'dist/yomu.css')), type: 'text/css' });
mkdirSync(publicDir, { recursive: true });
for (const [name, { body }] of files) {
    const target = path.join(publicDir, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, body);
}
// The debug manager upgrades HTTP @require downloads to HTTPS. For offline
// candidate QA, these byte-identical files can be copied to its dependency
// cache (back it up first). Injection and GM transport still belong to the
// real manager. This does not test its normal HTTPS dependency downloader.
const managerRequires = path.join(out, 'manager-require/yomu.user.js');
mkdirSync(managerRequires, { recursive: true });
for (const [, dependency] of metadata.matchAll(/^\/\/ @require\s+(\S+)$/gm)) {
    const url = new URL(dependency);
    const name = dependency.replaceAll('/', '%2F').replaceAll(':', '%3A').replaceAll('\\', '%5C');
    writeFileSync(path.join(managerRequires, name), files.get(url.pathname).body);
}

// Replay the verbatim, attributed Commons recording at loopback. Resource URL
// substitutions and the passive observer below are the only document changes.
// Product code is loaded by the real Userscripts extension, never this page.
const recorded = path.join(root, 'scripts/fixtures/recorded/commons-sign-photo');
const manifest = JSON.parse(readFileSync(path.join(recorded, 'manifest.json')));
const har = JSON.parse(readFileSync(path.join(recorded, manifest.har)));
const resources = new Map();
for (const entry of har.log.entries) {
    const content = entry.response.content;
    if (!content._file && content.text === undefined) continue;
    const body = content._file ? readFileSync(path.join(recorded, content._file))
        : Buffer.from(content.text, content.encoding === 'base64' ? 'base64' : 'utf8');
    resources.set(entry.request.url, { body, type: content.mimeType });
}
let html = readFileSync(path.join(recorded, manifest.document), 'utf8');
html = html.replace(/\b(src|href|srcset)="([^"]*)"/g, (attribute, key, value) => {
    if (key === 'srcset') return ''; // The recorded src is already a real decoded photo.
    if (!value || value.startsWith('#') || value.startsWith('data:')) return attribute;
    const url = new URL(value.replaceAll('&amp;', '&'), manifest.url).href;
    return `${key}="${origin}/resource?url=${encodeURIComponent(url)}&run=${encodeURIComponent(runId)}"`;
});
html = html.replace('</head>', '<script src="/observe.js"></script></head>');
files.set('/recorded', { body: Buffer.from(html), type: 'text/html; charset=utf-8' });
files.set('/observe.js', { body: Buffer.from(`
document.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('a[href]')) event.preventDefault();
    report({event: 'click', trusted: event.isTrusted, target: event.target.tagName});
}, true);
let previous = '';
function report(extra = {}) {
    const snapshot = {at: new Date().toISOString(), lines: document.querySelectorAll('.jpdb-ocr-line').length,
        text: [...document.querySelectorAll('.jpdb-ocr-line')].map(node => node.dataset.ocrText),
        marks: [...document.querySelectorAll('.jpdb-ocr-video-frame-status[data-status]')].map(node => {
            const rect = node.getBoundingClientRect(); const style = getComputedStyle(node);
            return {status: node.dataset.status, visible: rect.width > 0 && rect.height > 0
                && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0,
                x: rect.x, y: rect.y, width: rect.width, height: rect.height};
        }), viewport: {width: innerWidth, height: innerHeight}, ...extra};
    const identity = JSON.stringify({...snapshot, at: null});
    if (identity === previous) return;
    previous = identity;
    navigator.sendBeacon('/observations', JSON.stringify(snapshot));
}
setInterval(report, 250);
`), type: 'text/javascript' });
writeFileSync(path.join(out, 'staging.json'), JSON.stringify({ sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    localOnly: true, serverInjectsProduct: false, providerMocked: false, origin, runId, recording: manifest,
    builtCoreSha256: sha256(core), coreBytes: Buffer.byteLength(core),
    rewrites: 'Loopback metadata dependencies and CSS fallback only; passive DOM observer and recorded resource URL substitutions.',
    files: Object.fromEntries([...files].filter(([name]) => !['/recorded', '/observe.js'].includes(name))
        .map(([name, { body }]) => [name, { bytes: body.length, sha256: sha256(body) }])) }, null, 2) + '\n');
const server = createServer((request, response) => {
    const url = new URL(request.url, origin);
    if (request.method === 'POST' && url.pathname === '/observations') {
        const chunks = [];
        request.on('data', chunk => chunks.push(chunk));
        request.on('end', () => {
            appendFileSync(path.join(out, 'observations.jsonl'), Buffer.concat(chunks).toString() + '\n');
            response.writeHead(204).end();
        });
        return;
    }
    const file = url.pathname === '/resource' ? resources.get(url.searchParams.get('url')) : files.get(url.pathname);
    appendFileSync(path.join(out, 'requests.jsonl'), JSON.stringify({ at: new Date().toISOString(), method: request.method, path: request.url, status: file ? 200 : 404 }) + '\n');
    response.writeHead(file ? 200 : 404, { 'content-type': file?.type ?? 'text/plain', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
    response.end(file?.body ?? 'Not recorded');
});
server.listen(port, '127.0.0.1', () => console.log(`Install ${publicDir}/yomu.user.js through Userscripts; rescan; open ${origin}/recorded. Evidence: ${out}`));
