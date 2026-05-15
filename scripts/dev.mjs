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
const metadataPath = '/yomu.meta.js';
const installPath = '/yomu.user.js';
const runtimePath = '/__yomu-dev-runtime.js';
const versionPath = '/__yomu-dev-version.json';
const autoReload = process.env.YOMU_DEV_AUTO_RELOAD === '1';
const loggingEnabled = isEnabledEnv(process.env.YOMU_ENABLE_LOGS);
const pageInjectionEnabled = isEnabledEnv(process.env.YOMU_DEV_PAGE_INJECTION);
const devServerStartedAt = Date.now();
const firstBuildTimeoutMs = 30_000;
const firstBuildPollMs = 100;
const buildFreshnessSkewMs = 2_000;

let closing = false;
let firstBuildReadyPromise;
const builder = spawn(process.execPath, [viteBin, 'build', '--watch', '--mode', 'development'], {
    cwd: root,
    env: {
        ...process.env,
        VITE_YOMU_ENABLE_LOGS: loggingEnabled ? '1' : '',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
});

builder.on('exit', code => {
    if (!closing) process.exit(code ?? 1);
});

const server = createServer(handleRequest);

async function handleRequest(req, res) {
    try {
        const url = new URL(req.url ?? '/', origin);
        await routeRequest(url, res);
    } catch (error) {
        sendRequestError(res, error);
    }
}

async function routeRequest(url, res) {
    const handler = fixedRouteHandler(url.pathname);
    if (handler) {
        await handler(res);
        return;
    }
    if (isProxyPath(url.pathname)) {
        await proxy(url, res);
        return;
    }
    await serveStaticPath(url.pathname, res);
}

function fixedRouteHandler(pathname) {
    return FIXED_ROUTES.get(pathname) ?? (isUserscriptPath(pathname) ? serveUserscript : undefined);
}

const FIXED_ROUTES = new Map([
    [metadataPath, serveMetadata],
    [runtimePath, serveRuntime],
    [versionPath, serveVersion],
    ['/', serveIndex],
]);

function isProxyPath(pathname) {
    return pathname === '/__jpdb-reader-audio-proxy'
        || pathname === '/__jpdb-reader-dictionary-proxy'
        || pathname === '/__jpdb-reader-immersion-proxy';
}

function isUserscriptPath(pathname) {
    return pathname === installPath || pathname === '/dist/yomu.user.js';
}

async function serveStaticPath(pathname, res) {
    const filePath = await resolveStatic(pathname);
    send(res, 200, await readFile(filePath), contentType(filePath));
}

async function serveIndex(res) {
    send(res, 200, devIndex(), 'text/html; charset=utf-8');
}

function sendRequestError(res, error) {
    const status = error?.code === 'ENOENT' ? 404 : 500;
    send(res, status, status === 404 ? 'Not found' : String(error?.message || error));
}

server.on('error', error => {
    console.error(`[dev] ${error.message}`);
    shutdown(1);
});

server.listen(port, host, logDevServerReady);

function logDevServerReady() {
    if (port !== preferredPort) console.log(`[dev] Port ${preferredPort} is busy; using ${port}.`);
    for (const line of devServerReadyLines()) console.log(line);
}

function devServerReadyLines() {
    return [
        `[dev] Install userscript: ${origin}/yomu.user.js`,
        `[dev] Runtime bundle:     ${origin}${runtimePath}`,
        `[dev] Auto reload:        ${onOff(autoReload)}`,
        `[dev] Console logging:    ${onOffWithHint(loggingEnabled, 'YOMU_ENABLE_LOGS=1')}`,
        `[dev] Page injection:     ${onOffWithHint(pageInjectionEnabled, 'YOMU_DEV_PAGE_INJECTION=1')}`,
        `[dev] Local app:          ${origin}/newtab/`,
    ];
}

function onOff(value) {
    return value ? 'on' : 'off';
}

function onOffWithHint(value, hint) {
    return value ? 'on' : `off (set ${hint} to enable)`;
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function serveUserscript(res) {
    const { metadata } = await readDevUserscript();
    sendNoStore(res, 200, `${metadata}\n${devBootstrap()}\n`, 'text/javascript; charset=utf-8');
}

async function serveMetadata(res) {
    const { metadata } = await readDevUserscript();
    sendNoStore(res, 200, `${metadata}\n`, 'text/javascript; charset=utf-8');
}

async function readDevUserscript() {
    await waitForFreshInitialBuild();
    const [info, raw] = await Promise.all([stat(userscriptPath), readFile(userscriptPath, 'utf8')]);
    const versionSuffix = Math.floor(info.mtimeMs / 1000);
    const version = `${packageVersion(raw)}.${versionSuffix}`;
    const devCode = raw
        .replace(/^\/\/ @name\s+.+$/m, '// @name         よむ dev')
        .replace(/^\/\/ @namespace\s+.+$/m, `// @namespace    ${origin}/dev`)
        .replace(/^\/\/ @version\s+([^\s]+).*$/m, `// @version      ${version}`)
        .replace(/^\/\/ @downloadURL\s+.+$/m, `// @downloadURL  ${origin}${installPath}`)
        .replace(/^\/\/ @updateURL\s+.+$/m, `// @updateURL    ${origin}${metadataPath}`);
    const code = ensureMetadataGrants(devCode, [
        'GM_addElement',
        'unsafeWindow',
    ]);
    const metadata = code.match(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==/m)?.[0];
    if (!metadata) throw new Error('Userscript metadata block not found');
    return { code, metadata, version, mtimeMs: info.mtimeMs };
}

function waitForFreshInitialBuild() {
    firstBuildReadyPromise ??= waitForFreshUserscriptBuild();
    return firstBuildReadyPromise;
}

async function waitForFreshUserscriptBuild() {
    const deadline = Date.now() + firstBuildTimeoutMs;
    while (Date.now() < deadline) {
        const info = await stat(userscriptPath).catch(() => null);
        if (info?.isFile() && info.mtimeMs >= devServerStartedAt - buildFreshnessSkewMs) return;
        await delay(firstBuildPollMs);
    }
    throw new Error(`Timed out waiting for a fresh Vite userscript build at ${userscriptPath}`);
}

async function serveRuntime(res) {
    const { code } = await readDevUserscript();
    sendNoStore(res, 200, code, 'text/javascript; charset=utf-8');
}

async function serveVersion(res) {
    const { version, mtimeMs } = await readDevUserscript();
    sendNoStore(res, 200, JSON.stringify({ version, mtimeMs, autoReload }), 'application/json; charset=utf-8');
}

function packageVersion(code) {
    return code.match(/^\/\/ @version\s+([^\s]+).*$/m)?.[1] || '0.0.0';
}

function ensureMetadataGrants(code, grants) {
    let next = code;
    for (const grant of grants) {
        const pattern = new RegExp(`^// @grant\\s+${escapeRegExp(grant)}\\s*$`, 'm');
        if (pattern.test(next)) continue;
        const line = `// @grant        ${grant}`;
        if (/^\/\/ @run-at\s+/m.test(next)) next = next.replace(/^\/\/ @run-at\s+/m, `${line}\n$&`);
        else next = next.replace(/^\/\/ ==\/UserScript==/m, `${line}\n$&`);
    }
    return next;
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function devBootstrap() {
    return `\
(function () {
  'use strict';

  const runtimeUrl = ${JSON.stringify(`${origin}${runtimePath}`)};
  const versionUrl = ${JSON.stringify(`${origin}${versionPath}`)};
  const autoReload = ${JSON.stringify(autoReload)};
  const loggingEnabled = ${JSON.stringify(loggingEnabled)};
  const pageInjectionEnabled = ${JSON.stringify(pageInjectionEnabled)};
  const pollMs = 1500;
  const reloadKey = '__yomu_dev_reload_version__';
  let currentVersion = '';
  let reloadStarted = false;

  boot().catch(error => {
    console.error('[yomu dev] Failed to load runtime bundle', error);
  });

  async function boot() {
    const [version, source] = await Promise.all([readVersion(), requestText(runtimeUrl)]);
    currentVersion = version;
    window.__YOMU_DEV_VERSION__ = currentVersion;
    if (loggingEnabled) window.__YOMU_ENABLE_LOGS__ = true;
    if (sessionStorage.getItem(reloadKey) === currentVersion) sessionStorage.removeItem(reloadKey);
    if (autoReload) window.setInterval(checkForUpdate, pollMs);
    runRuntime(source);
  }

  async function checkForUpdate() {
    if (reloadStarted) return;
    const nextVersion = await readVersion().catch(() => '');
    if (!nextVersion || !currentVersion || nextVersion === currentVersion) return;
    reloadStarted = true;
    console.debug('[yomu dev] Runtime changed; reloading page', { from: currentVersion, to: nextVersion });
    sessionStorage.setItem(reloadKey, nextVersion);
    location.reload();
  }

  async function readVersion() {
    const text = await requestText(versionUrl);
    const info = JSON.parse(text);
    return String(info.version || '');
  }

  function runRuntime(source) {
    if (pageInjectionEnabled) {
      try {
        runRuntimeWithInjectedScript(source);
        return;
      } catch (error) {
        console.warn('[yomu dev] Page injection failed; falling back to userscript sandbox eval.', error);
      }
    }
    try {
      runRuntimeInUserscriptSandbox(source);
    } catch (error) {
      if (!isEvalCspError(error)) throw error;
      if (typeof GM_addElement !== 'function') {
        console.warn('[yomu dev] Userscript sandbox eval was blocked by CSP, but GM_addElement is unavailable. Restart the dev server and reinstall or update the dev userscript so the fallback grant is present.', error);
        throw error;
      }
      console.warn('[yomu dev] Userscript sandbox eval was blocked by CSP; falling back to page injection bridge.', error);
      runRuntimeWithInjectedScript(source);
    }
  }

  function runRuntimeInUserscriptSandbox(source) {
    eval(source + '\\n//# sourceURL=' + runtimeUrl);
  }

  function runRuntimeWithInjectedScript(source) {
    const page = pageWindow();
    const bridgeKey = '__yomu_dev_bridge_' + randomId();
    const mountedKey = '__monkeyWindow-yomu-dev-' + randomId();
    page.__YOMU_DEV_VERSION__ = currentVersion;
    if (loggingEnabled) page.__YOMU_ENABLE_LOGS__ = true;
    page[bridgeKey] = userscriptApiBridge();
    try {
      const script = GM_addElement('script', {
        textContent: wrappedRuntimeSource(source, bridgeKey, mountedKey),
        type: 'text/javascript',
      });
      if (!script) throw new Error('GM_addElement did not return a script element');
      if (typeof script.remove === 'function') script.remove();
    } catch (error) {
      try {
        delete page[bridgeKey];
      } catch {
        page[bridgeKey] = undefined;
      }
      throw error;
    }
  }

  function wrappedRuntimeSource(source, bridgeKey, mountedKey) {
    return [
      '(function (realGlobalThis) {',
      '  \\'use strict\\';',
      '  const bridgeKey = ' + JSON.stringify(bridgeKey) + ';',
      '  const mountedKey = ' + JSON.stringify(mountedKey) + ';',
      '  const bridge = realGlobalThis[bridgeKey] || {};',
      '  try { delete realGlobalThis[bridgeKey]; } catch { realGlobalThis[bridgeKey] = undefined; }',
      '  try { Object.defineProperty(document, mountedKey, { value: bridge, configurable: true }); } catch {}',
      '  realGlobalThis.addEventListener(\\'pagehide\\', () => { try { delete document[mountedKey]; } catch {} }, { once: true });',
      '  const globalThis = typeof Proxy === \\'function\\' ? new Proxy(realGlobalThis, {',
      '    get(target, key, receiver) { return key in bridge ? bridge[key] : Reflect.get(target, key, receiver); },',
      '    has(target, key) { return key in bridge || key in target; },',
      '  }) : realGlobalThis;',
      '  const GM = bridge.GM;',
      '  const GM_info = bridge.GM_info;',
      '  const GM_xmlhttpRequest = bridge.GM_xmlhttpRequest;',
      '  const GM_getValue = bridge.GM_getValue;',
      '  const GM_setValue = bridge.GM_setValue;',
      '  const GM_deleteValue = bridge.GM_deleteValue;',
      '  const GM_listValues = bridge.GM_listValues;',
      '  const GM_addValueChangeListener = bridge.GM_addValueChangeListener;',
      '  const GM_removeValueChangeListener = bridge.GM_removeValueChangeListener;',
      '  const GM_addStyle = bridge.GM_addStyle;',
      '  const GM_registerMenuCommand = bridge.GM_registerMenuCommand;',
      source,
      '})(globalThis);',
      '//# sourceURL=' + runtimeUrl,
    ].join('\\n');
  }

  function userscriptApiBridge() {
    const gm = typeof GM === 'object' && GM ? GM : undefined;
    return {
      __YOMU_READER_RUNTIME__: 'userscript',
      GM_info: typeof GM_info === 'object' && GM_info ? GM_info : undefined,
      GM_xmlhttpRequest: typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : undefined,
      GM_getValue: typeof GM_getValue === 'function' ? GM_getValue : undefined,
      GM_setValue: typeof GM_setValue === 'function' ? GM_setValue : undefined,
      GM_deleteValue: typeof GM_deleteValue === 'function' ? GM_deleteValue : undefined,
      GM_listValues: typeof GM_listValues === 'function' ? GM_listValues : undefined,
      GM_addValueChangeListener: typeof GM_addValueChangeListener === 'function' ? GM_addValueChangeListener : undefined,
      GM_removeValueChangeListener: typeof GM_removeValueChangeListener === 'function' ? GM_removeValueChangeListener : undefined,
      GM_addStyle: typeof GM_addStyle === 'function' ? GM_addStyle : undefined,
      GM_registerMenuCommand: typeof GM_registerMenuCommand === 'function' ? GM_registerMenuCommand : undefined,
      GM: gm ? {
        xmlHttpRequest: typeof gm.xmlHttpRequest === 'function' ? gm.xmlHttpRequest.bind(gm) : undefined,
        xmlhttpRequest: typeof gm.xmlhttpRequest === 'function' ? gm.xmlhttpRequest.bind(gm) : undefined,
      } : undefined,
    };
  }

  function pageWindow() {
    try {
      if (typeof unsafeWindow === 'object' && unsafeWindow) return unsafeWindow;
    } catch {}
    return window;
  }

  function isEvalCspError(error) {
    const name = error && error.name;
    const message = String(error && error.message || error || '');
    return name === 'EvalError' || /unsafe-eval|Content Security Policy|Refused to evaluate/i.test(message);
  }

  function randomId() {
    try {
      const bytes = new Uint32Array(2);
      crypto.getRandomValues(bytes);
      return bytes[0].toString(36) + bytes[1].toString(36);
    } catch {
      return Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  }

  function requestText(url) {
    return new Promise((resolve, reject) => {
      const request = userscriptRequest();
      const href = cacheBust(url);
      if (request) {
        const details = {
          method: 'GET',
          url: href,
          timeout: 15000,
          headers: { 'Cache-Control': 'no-cache' },
          onload: response => handleUserscriptResponse(response, resolve, reject, url),
          onerror: () => reject(new Error('Request failed for ' + url)),
          ontimeout: () => reject(new Error('Request timed out for ' + url)),
        };
        const result = request(details);
        if (result && typeof result.then === 'function') {
          result.then(response => handleUserscriptResponse(response, resolve, reject, url), reject);
        }
        return;
      }
      fetch(href, { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error('Request failed with HTTP ' + response.status + ' for ' + url);
        return response.text();
      }).then(resolve, reject);
    });
  }

  function handleUserscriptResponse(response, resolve, reject, url) {
    const status = Number(response && response.status || 0);
    if (status >= 200 && status < 300) resolve(String(response.responseText || response.response || ''));
    else reject(new Error('Request failed with HTTP ' + status + ' for ' + url));
  }

  function userscriptRequest() {
    if (typeof GM_xmlhttpRequest === 'function') return GM_xmlhttpRequest;
    if (typeof GM === 'object' && GM) {
      if (typeof GM.xmlHttpRequest === 'function') return GM.xmlHttpRequest.bind(GM);
      if (typeof GM.xmlhttpRequest === 'function') return GM.xmlhttpRequest.bind(GM);
    }
    return undefined;
  }

  function cacheBust(url) {
    const separator = url.includes('?') ? '&' : '?';
    return url + separator + 't=' + Date.now();
  }
})();`;
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
    const candidates = staticCandidates(clean, pathname.endsWith('/'));
    for (const candidate of candidates) {
        if (!isStaticCandidateSafe(candidate)) continue;
        const info = await stat(candidate).catch(() => null);
        if (info?.isFile()) return candidate;
    }
    const error = new Error('Not found');
    error.code = 'ENOENT';
    throw error;
}

function staticCandidates(clean, includeIndex) {
    return [publicDir, distDir].flatMap(base => {
        const candidates = [path.resolve(base, clean)];
        if (includeIndex) candidates.push(path.resolve(base, clean, 'index.html'));
        return candidates;
    });
}

function isStaticCandidateSafe(candidate) {
    const base = candidate.startsWith(publicDir) ? publicDir : distDir;
    return candidate === base || candidate.startsWith(`${base}${path.sep}`);
}

function devIndex() {
    return `<!doctype html>
<meta charset="utf-8">
<title>よむ dev</title>
<body>
  <h1>よむ dev</h1>
  <p><a href="/yomu.user.js">Install the local dev userscript</a></p>
  <p><a href="/newtab/">Open the local new tab app</a></p>
</body>`;
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
    res.statusCode = status;
    res.setHeader('Content-Type', type);
    res.end(body);
}

function sendNoStore(res, status, body, type = 'text/plain; charset=utf-8') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    send(res, status, body, type);
}

function contentType(filePath) {
    return CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream';
}

const CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.vtt': 'text/vtt; charset=utf-8',
    '.png': 'image/png',
};

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

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isEnabledEnv(value) {
    return /^(1|true|yes|on)$/i.test(String(value ?? '').trim());
}

function shutdown(code) {
    closing = true;
    server.close(() => {});
    builder.kill('SIGTERM');
    setTimeout(() => process.exit(code), 100).unref();
}
