#!/usr/bin/env node
// Live, non-fixture BookWalker Firefox acceptance run.
//
// This intentionally uses BookWalker's public trial reader, real signed page
// assets, and the configured Google Lens recognizer. It records transition
// telemetry, screenshots, and video so fixture evidence cannot masquerade as a
// live pass.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { firefox } from 'playwright';

import {
    addGmStorageBridgeInitScript,
    assert,
    createSmokePaths,
    gmRequestFetchBody,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';

const paths = createSmokePaths(import.meta.dirname);
const DEFAULT_URL = 'https://viewer-trial.bookwalker.jp/03/21/viewer.html?cid=64957e78-95e2-4789-a013-541631864606&cty=1';
const TARGET_URL = process.env.YOMU_BOOKWALKER_LIVE_URL || DEFAULT_URL;
const SCRIPT_PATH = process.env.YOMU_BOOKWALKER_SCRIPT || paths.scriptPath;
const CSS_PATH = process.env.YOMU_BOOKWALKER_CSS || paths.cssPath;
const ARTIFACT_DIR = process.env.YOMU_BOOKWALKER_ARTIFACT_DIR
    ? path.resolve(process.env.YOMU_BOOKWALKER_ARTIFACT_DIR)
    : path.join(paths.artifacts, 'bookwalker-live-firefox');
const REQUEST_BRIDGE = '__yomuBookwalkerLiveRequest';
const TELEMETRY_KEY = '__yomuBookwalkerLiveTelemetry';
const PAGE_LIMIT = positiveInteger(process.env.YOMU_BOOKWALKER_LIVE_PAGES, 5, 2);
const MODES = (process.env.YOMU_BOOKWALKER_LIVE_MODES || 'paged,continuous')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
const FIREFOX_UA = process.env.YOMU_BOOKWALKER_UA
    || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0';
const VIEWPORT = Object.freeze({
    width: positiveInteger(process.env.YOMU_BOOKWALKER_VIEWPORT_WIDTH, 900, 320),
    height: positiveInteger(process.env.YOMU_BOOKWALKER_VIEWPORT_HEIGHT, 1100, 320),
});
const HAS_TOUCH = process.env.YOMU_BOOKWALKER_TOUCH === '1';
const READER_RASTER_POLL_MS = 1_200;
const STABILITY_HOLD_MS = READER_RASTER_POLL_MS * 5 + 250;
const OCR_READY_TIMEOUT_MS = 65_000;
const GEOMETRY_TOLERANCE_PX = 6;
const MAX_BUILD_AGE_MINUTES = positiveInteger(process.env.YOMU_BOOKWALKER_MAX_BUILD_AGE_MINUTES, 60, 1);
const RUN_STARTED_AT = Date.now();
const RUN_ID = new Date(RUN_STARTED_AT).toISOString().replace(/[:.]/g, '-');
const PACKAGE_JSON_PATH = path.join(paths.root, 'package.json');
const PACKAGE_JSON = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'));
const BUILD_COMMAND = 'npm run build:userscript:self-contained';
const SETTINGS = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    ankiEnabled: false,
    audioEnabled: false,
    enableLogging: true,
    jpdbMiningEnabled: false,
    jpdbDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    lookupOnClick: true,
    lookupOnHover: true,
    hoverOpenDelayMs: 0,
    hoverCloseDelayMs: 120,
    popupActivationMode: 'hover',
    popupMode: 'sheet',
    stickyBottomSheet: false,
    showFloatingButton: false,
    ocrEnabled: true,
    ocrAutoScanImages: true,
    ocrShowTextOverlay: true,
    ocrProvider: 'google-lens',
    ocrLanguage: 'ja-JP',
    ocrPrefetchPages: 0,
    ocrMaxImagesPerPage: 1,
    ocrMinImageArea: 1,
    audioTimeoutMs: 30_000,
};

function positiveInteger(rawValue, fallback, minimum = 1) {
    const value = Number(rawValue ?? fallback);
    return Number.isFinite(value) ? Math.max(minimum, Math.floor(value)) : fallback;
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function metadataValue(code, name) {
    const match = code.match(new RegExp(`^//\\s*@${name}\\s+(.+?)\\s*$`, 'm'));
    return match?.[1] || '';
}

function newestBuildInput() {
    const roots = [
        path.join(paths.root, 'src'),
        path.join(paths.root, 'config'),
        path.join(paths.root, 'vite.config.ts'),
        PACKAGE_JSON_PATH,
        path.join(paths.root, 'package-lock.json'),
        path.join(paths.root, 'scripts', 'build-reader-css.mjs'),
        path.join(paths.root, 'scripts', 'format-userscript-css.cjs'),
        path.join(paths.root, 'scripts', 'annotate-userscript-compliance.cjs'),
    ];
    let newest = { path: '', mtimeMs: 0 };
    const pending = roots.filter(existsSync);
    while (pending.length) {
        const candidate = pending.pop();
        const stat = statSync(candidate);
        if (stat.isDirectory()) {
            for (const entry of readdirSync(candidate)) pending.push(path.join(candidate, entry));
            continue;
        }
        if (stat.mtimeMs > newest.mtimeMs) newest = { path: candidate, mtimeMs: stat.mtimeMs };
    }
    return newest;
}

function loadCandidate() {
    assert(existsSync(SCRIPT_PATH), `Missing candidate userscript: ${SCRIPT_PATH}. Run ${BUILD_COMMAND}.`);
    assert(existsSync(CSS_PATH), `Missing reader CSS: ${CSS_PATH}. Run ${BUILD_COMMAND}.`);

    const scriptCode = readFileSync(SCRIPT_PATH, 'utf8');
    const css = readFileSync(CSS_PATH, 'utf8');
    const scriptStat = statSync(SCRIPT_PATH);
    const cssStat = statSync(CSS_PATH);
    const version = metadataValue(scriptCode, 'version');
    const internalRequires = [...scriptCode.matchAll(/^\/\/\s*@require\s+(\S*yomureader\.com\/greasyfork\/yomu-[^\s#]+\.user\.js\S*)\s*$/gm)]
        .map(match => match[1]);
    const ocrRequires = internalRequires.filter(url => /yomu-ocr-manga\.user\.js/i.test(url));
    const newestInput = newestBuildInput();
    const maxAgeMs = MAX_BUILD_AGE_MINUTES * 60_000;
    const ageMs = RUN_STARTED_AT - scriptStat.mtimeMs;
    const hasBundledOcr = /registerYomuCompanion\(["']ocr["']/.test(scriptCode);
    const candidate = {
        scriptCode,
        css,
        provenance: {
            path: SCRIPT_PATH,
            cssPath: CSS_PATH,
            sha256: sha256(scriptCode),
            cssSha256: sha256(css),
            metadataVersion: version,
            packageVersion: PACKAGE_JSON.version,
            bytes: Buffer.byteLength(scriptCode),
            cssBytes: Buffer.byteLength(css),
            builtAt: new Date(scriptStat.mtimeMs).toISOString(),
            cssBuiltAt: new Date(cssStat.mtimeMs).toISOString(),
            ageMs,
            newestBuildInput: path.relative(paths.root, newestInput.path),
            newestBuildInputModifiedAt: new Date(newestInput.mtimeMs).toISOString(),
            selfContained: internalRequires.length === 0 && hasBundledOcr,
            internalRequires,
            buildCommand: BUILD_COMMAND,
        },
    };

    try {
        assert(version, 'Candidate userscript has no @version metadata.', { scriptPath: SCRIPT_PATH });
        assert(version === PACKAGE_JSON.version, 'Candidate metadata version does not match package.json.', {
            candidateVersion: version,
            packageVersion: PACKAGE_JSON.version,
            buildCommand: BUILD_COMMAND,
        });
        assert(ocrRequires.length === 0, `Candidate is the modular OCR @require build. Run ${BUILD_COMMAND}.`, {
            ocrRequires,
            scriptPath: SCRIPT_PATH,
        });
        assert(internalRequires.length === 0, `Candidate is not self-contained. Run ${BUILD_COMMAND}.`, {
            internalRequires,
            scriptPath: SCRIPT_PATH,
        });
        assert(hasBundledOcr, 'Candidate does not contain the OCR companion registration.', {
            buildCommand: BUILD_COMMAND,
            scriptPath: SCRIPT_PATH,
        });
        assert(ageMs >= -2_000 && ageMs <= maxAgeMs, 'Candidate is not freshly built.', {
            ageMinutes: Math.round(ageMs / 60_000),
            maxBuildAgeMinutes: MAX_BUILD_AGE_MINUTES,
            builtAt: new Date(scriptStat.mtimeMs).toISOString(),
            buildCommand: BUILD_COMMAND,
        });
        assert(scriptStat.mtimeMs + 1_000 >= newestInput.mtimeMs, 'Candidate predates a userscript build input.', {
            candidateBuiltAt: new Date(scriptStat.mtimeMs).toISOString(),
            newestInput: path.relative(paths.root, newestInput.path),
            newestInputModifiedAt: new Date(newestInput.mtimeMs).toISOString(),
            buildCommand: BUILD_COMMAND,
        });
        assert(cssStat.mtimeMs + 1_000 >= newestInput.mtimeMs, 'Reader CSS predates a userscript build input.', {
            cssBuiltAt: new Date(cssStat.mtimeMs).toISOString(),
            newestInput: path.relative(paths.root, newestInput.path),
            newestInputModifiedAt: new Date(newestInput.mtimeMs).toISOString(),
            buildCommand: BUILD_COMMAND,
        });
        assert(Math.abs(cssStat.mtimeMs - scriptStat.mtimeMs) <= 10 * 60_000, 'Candidate userscript and CSS are not from the same fresh build window.', {
            scriptBuiltAt: new Date(scriptStat.mtimeMs).toISOString(),
            cssBuiltAt: new Date(cssStat.mtimeMs).toISOString(),
            buildCommand: BUILD_COMMAND,
        });
    } catch (error) {
        if (error instanceof Error) {
            Object.defineProperty(error, 'candidateProvenance', {
                configurable: true,
                value: candidate.provenance,
            });
        }
        throw error;
    }
    return candidate;
}

function requestLabel(rawUrl) {
    try {
        const url = new URL(rawUrl);
        for (const key of ['Policy', 'Signature', 'Key-Pair-Id', 'pfCd']) url.searchParams.delete(key);
        return `${url.origin}${url.pathname}`;
    } catch {
        return String(rawUrl).split(/[?#]/, 1)[0];
    }
}

function isLensRequest(rawUrl) {
    return /lensfrontend-pa\.googleapis\.com|lens\.google\.com\/v3\/upload/.test(rawUrl);
}

function pageNumber(text) {
    return Number(String(text || '').split('/', 1)[0]) || 0;
}

async function liveRequest(request, network) {
    const startedAt = Date.now();
    const method = request.method || 'GET';
    const resource = requestLabel(request.url);
    const entry = {
        id: network.requests.length + 1,
        method,
        resource,
        startedAt: new Date(startedAt).toISOString(),
        status: null,
    };
    network.requests.push(entry);
    if (isLensRequest(request.url)) {
        network.lensStarts.push({
            id: network.lensStarts.length + 1,
            requestId: entry.id,
            method,
            resource,
            startedAt: entry.startedAt,
        });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35_000);
    try {
        const response = await fetch(request.url, {
            method,
            headers: request.headers || {},
            body: gmRequestFetchBody(request),
            redirect: 'follow',
            signal: controller.signal,
        });
        const bytes = new Uint8Array(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || '';
        const textResponse = request.responseType !== 'arraybuffer'
            || /json|text|html|xml|javascript/.test(contentType);
        Object.assign(entry, {
            status: response.status,
            bytes: bytes.byteLength,
            durationMs: Date.now() - startedAt,
            contentType,
        });
        return {
            status: response.status,
            bytes: [...bytes],
            contentType,
            responseText: textResponse ? new TextDecoder().decode(bytes) : '',
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Object.assign(entry, { status: 0, durationMs: Date.now() - startedAt, error: message });
        return { status: 0, bytes: [], responseText: '' };
    } finally {
        clearTimeout(timeout);
    }
}

async function installTelemetry(context) {
    await context.addInitScript(({ telemetryKey }) => {
        const MAX_EVENTS = 20_000;
        const events = [];
        const ids = new WeakMap();
        const lastStatuses = new WeakMap();
        let nextNodeId = 1;
        let nextSeq = 1;
        let dropped = 0;

        const nodeId = node => {
            if (!node) return 0;
            let id = ids.get(node);
            if (!id) {
                id = nextNodeId++;
                ids.set(node, id);
            }
            return id;
        };
        const record = event => {
            if (events.length >= MAX_EVENTS) {
                events.shift();
                dropped += 1;
            }
            events.push({
                seq: nextSeq++,
                at: new Date().toISOString(),
                performanceMs: Math.round(performance.now()),
                ...event,
            });
        };
        const elements = (node, selector) => {
            if (!(node instanceof Element)) return [];
            const matches = node.matches(selector) ? [node] : [];
            return matches.concat([...node.querySelectorAll(selector)]);
        };
        const describeArtifact = (node, kind, action) => record({
            type: 'artifact',
            kind,
            action,
            nodeId: nodeId(node),
            key: node.dataset.ocrContentKey || '',
            layerId: node.dataset.ocrLayerId || '',
            hidden: Boolean(node.hidden),
        });
        const describeStatusSource = node => {
            const statusRect = node.getBoundingClientRect();
            const overlap = rect => Math.max(0, Math.min(statusRect.right, rect.right) - Math.max(statusRect.left, rect.left))
                * Math.max(0, Math.min(statusRect.bottom, rect.bottom) - Math.max(statusRect.top, rect.top));
            const canvases = [...document.querySelectorAll('canvas')]
                .map(canvas => ({ canvas, rect: canvas.getBoundingClientRect() }))
                .filter(({ rect }) => rect.width > 0 && rect.height > 0)
                .sort((a, b) => overlap(b.rect) - overlap(a.rect));
            const source = canvases[0];
            return {
                counter: document.querySelector('#pageSliderCounter')?.textContent?.trim() || '',
                mirrorEpoch: document.documentElement.getAttribute('data-yomu-mirror-epoch') || '',
                sourceCanvas: source ? {
                    id: nodeId(source.canvas),
                    domId: source.canvas.id || '',
                    className: String(source.canvas.className),
                    mid: source.canvas.dataset.yomuMid || '',
                    rect: source.rect.toJSON(),
                    overlap: overlap(source.rect),
                } : null,
                frameKeys: [...document.querySelectorAll('.jpdb-ocr-canvas-frame')]
                    .map(frame => frame.dataset.ocrContentKey || frame.dataset.ocrAttemptKey || ''),
            };
        };
        const recordStatus = (node, reason) => {
            const status = node.dataset.status || '';
            if (!status || lastStatuses.get(node) === status) return;
            lastStatuses.set(node, status);
            record({
                type: 'status',
                reason,
                nodeId: nodeId(node),
                status,
                text: node.textContent?.trim() || '',
                hidden: Boolean(node.hidden),
                ...describeStatusSource(node),
            });
        };
        const recordOverwrittenTerminalStatus = (node, mutation) => {
            if (mutation.type !== 'attributes' || mutation.attributeName !== 'data-status') return;
            const status = mutation.oldValue || '';
            if (status !== 'failed' && status !== 'empty') return;
            record({
                type: 'status',
                reason: 'overwritten-attribute-old-value',
                nodeId: nodeId(node),
                status,
                text: node.textContent?.trim() || '',
                hidden: Boolean(node.hidden),
                ...describeStatusSource(node),
            });
        };
        const scanAdded = node => {
            for (const frame of elements(node, '.jpdb-ocr-canvas-frame')) describeArtifact(frame, 'frame', 'added');
            for (const layer of elements(node, '.jpdb-ocr-layer')) describeArtifact(layer, 'layer', 'added');
            for (const status of elements(node, '.jpdb-ocr-video-frame-status')) recordStatus(status, 'added');
        };
        const scanRemoved = node => {
            for (const frame of elements(node, '.jpdb-ocr-canvas-frame')) describeArtifact(frame, 'frame', 'removed');
            for (const layer of elements(node, '.jpdb-ocr-layer')) describeArtifact(layer, 'layer', 'removed');
        };
        const statusForMutation = target => {
            if (target instanceof Element) return target.closest('.jpdb-ocr-video-frame-status');
            return target?.parentElement?.closest('.jpdb-ocr-video-frame-status') || null;
        };

        new MutationObserver(records => {
            for (const mutation of records) {
                if (mutation.type === 'childList') {
                    for (const node of mutation.addedNodes) scanAdded(node);
                    for (const node of mutation.removedNodes) scanRemoved(node);
                }
                const status = statusForMutation(mutation.target);
                if (status) {
                    recordOverwrittenTerminalStatus(status, mutation);
                    recordStatus(status, mutation.type);
                }
            }
        }).observe(document, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeOldValue: true,
            characterData: true,
            attributeFilter: ['data-status', 'hidden', 'class'],
        });

        const recordFocus = event => record({
            type: 'focus',
            event,
            hasFocus: document.hasFocus(),
            visibilityState: document.visibilityState,
            hidden: document.hidden,
        });
        window.addEventListener('focus', () => recordFocus('focus'), true);
        window.addEventListener('blur', () => recordFocus('blur'), true);
        document.addEventListener('visibilitychange', () => recordFocus('visibilitychange'), true);
        recordFocus('installed');

        Object.defineProperty(window, telemetryKey, {
            configurable: false,
            enumerable: false,
            value: {
                events,
                nodeId,
                snapshot: since => ({
                    cursor: nextSeq,
                    dropped,
                    events: events.filter(event => event.seq >= (since || 0)),
                }),
            },
        });
    }, { telemetryKey: TELEMETRY_KEY });
}

async function telemetrySnapshot(page, since = 0) {
    return page.evaluate(({ telemetryKey, cursor }) => {
        const telemetry = window[telemetryKey];
        if (!telemetry) return { cursor: 0, dropped: 0, events: [] };
        return telemetry.snapshot(cursor);
    }, { telemetryKey: TELEMETRY_KEY, cursor: since });
}

async function telemetryCursor(page) {
    return (await telemetrySnapshot(page)).cursor;
}

function terminalStatusEvents(snapshot) {
    return snapshot.events.filter(event => event.type === 'status' && (event.status === 'failed' || event.status === 'empty'));
}

async function assertNoTerminalStatusEvents(page, phase) {
    const telemetry = await telemetrySnapshot(page);
    const terminal = terminalStatusEvents(telemetry);
    assert(terminal.length === 0, 'A transient failed/empty OCR status was observed.', {
        phase,
        terminal: terminal.slice(-20),
        telemetryDropped: telemetry.dropped,
    });
}

async function dismissCookieBanner(page) {
    const rejectControls = [
        '#onetrust-reject-all-handler',
        '#onetrust-banner-sdk button:has-text("全てのクッキーを拒否する")',
        '.ot-pc-refuse-all-handler',
    ];
    const acceptControls = [
        '#onetrust-accept-btn-handler',
        '#onetrust-banner-sdk button:has-text("全てのクッキーを受け入れる")',
        '#accept-recommended-btn-handler',
    ];
    for (let attempt = 0; attempt < 20; attempt += 1) {
        let clicked = false;
        for (const selector of [...rejectControls, ...acceptControls]) {
            const control = page.locator(selector).first();
            if (await control.isVisible().catch(() => false)) {
                clicked = await control.evaluate(element => {
                    if (!(element instanceof HTMLElement)) return false;
                    element.click();
                    return true;
                }).catch(() => false);
                if (clicked) break;
            }
        }
        const banner = page.locator('#onetrust-banner-sdk');
        const japaneseNotice = page.getByText('全てのクッキーを拒否する', { exact: false }).first();
        const bannerVisible = await banner.isVisible().catch(() => false)
            || await japaneseNotice.isVisible().catch(() => false);
        if (!bannerVisible) return;
        await page.waitForTimeout(clicked ? 500 : 250);
    }
    const diagnostic = await page.evaluate(() => [...document.querySelectorAll('button, [role="button"], a')]
        .filter(element => /クッキー/.test(element.textContent || ''))
        .map(element => ({
            tag: element.tagName,
            id: element.id,
            className: String(element.className),
            text: element.textContent?.trim() || '',
        })));
    throw new Error(`BookWalker cookie banner remained visible and would obstruct the live reader flow: ${JSON.stringify(diagnostic)}`);
}

async function installCookieBannerAutoDismiss(context) {
    await context.addInitScript(() => {
        const startedAt = Date.now();
        let bannerSeen = false;
        const timer = setInterval(() => {
            const banner = document.querySelector('#onetrust-banner-sdk');
            const reject = document.querySelector('#onetrust-reject-all-handler, .ot-pc-refuse-all-handler');
            const bannerVisible = banner instanceof HTMLElement
                && banner.getClientRects().length > 0
                && getComputedStyle(banner).visibility !== 'hidden'
                && getComputedStyle(banner).display !== 'none';
            if (bannerVisible) bannerSeen = true;
            if (bannerVisible && reject instanceof HTMLElement && reject.getClientRects().length > 0) {
                reject.click();
            }
            if ((bannerSeen && !bannerVisible) || Date.now() - startedAt >= 60_000) clearInterval(timer);
        }, 200);
    });
}

async function readerState(page) {
    return page.evaluate(({ telemetryKey }) => {
        const telemetry = window[telemetryKey];
        const nodeId = node => telemetry?.nodeId(node) || 0;
        const rectValue = rect => rect ? {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
        } : null;
        const rectFor = element => rectValue(element?.getBoundingClientRect());
        const clippedRect = rect => {
            if (!rect) return null;
            const left = Math.max(0, rect.left);
            const top = Math.max(0, rect.top);
            const right = Math.min(innerWidth, rect.right);
            const bottom = Math.min(innerHeight, rect.bottom);
            if (right <= left || bottom <= top) return null;
            return { left, top, right, bottom, width: right - left, height: bottom - top };
        };
        const area = rect => rect ? Math.max(0, rect.width) * Math.max(0, rect.height) : 0;
        const visible = element => {
            if (!(element instanceof Element)) return false;
            const rect = rectFor(element);
            const style = getComputedStyle(element);
            return area(clippedRect(rect)) > 0
                && style.visibility !== 'hidden'
                && style.display !== 'none';
        };
        const delta = (a, b) => {
            if (!a || !b) return Number.POSITIVE_INFINITY;
            return Math.max(
                Math.abs(a.left - b.left),
                Math.abs(a.top - b.top),
                Math.abs(a.right - b.right),
                Math.abs(a.bottom - b.bottom),
            );
        };
        const intersectionArea = (a, b) => {
            if (!a || !b) return 0;
            return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
                * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        };
        const transparent = value => !value || value === 'transparent'
            || value === 'rgba(0, 0, 0, 0)' || value === 'rgba(0,0,0,0)';
        const lineState = (line, lineIndex) => {
            const lineText = line.querySelector('.jpdb-reader-word,.jpdb-ocr-line-text') || line;
            const style = getComputedStyle(lineText);
            const lineRect = rectFor(line);
            const words = [...line.querySelectorAll('.jpdb-reader-word')].map((word, wordIndex) => {
                const rect = rectFor(word);
                const point = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
                const hit = point ? document.elementFromPoint(point.x, point.y) : null;
                return {
                    id: nodeId(word),
                    wordIndex,
                    text: word.textContent?.trim() || '',
                    rect,
                    point,
                    hitOwned: Boolean(hit && (word === hit || word.contains(hit))),
                    hit: hit ? { tag: hit.tagName, id: hit.id, className: String(hit.className) } : null,
                };
            });
            return {
                id: nodeId(line),
                lineIndex,
                label: line.getAttribute('aria-label') || '',
                text: line.dataset.ocrText || line.textContent?.trim() || '',
                rect: lineRect,
                visible: visible(line),
                hovered: line.matches(':hover'),
                active: line.classList.contains('jpdb-ocr-line-active'),
                pinned: line.dataset.pinned || '',
                painted: style.visibility !== 'hidden'
                    && Number(style.opacity || '1') > 0
                    && !transparent(style.color)
                    && !transparent(style.webkitTextFillColor || style.color),
                paint: {
                    color: style.color,
                    fill: style.webkitTextFillColor,
                    opacity: style.opacity,
                    visibility: style.visibility,
                },
                words,
            };
        };

        const allCanvases = [...document.querySelectorAll('canvas')]
            .filter(canvas => !canvas.classList.contains('dummy') && visible(canvas))
            .map(canvas => {
                const rect = rectFor(canvas);
                return {
                    id: nodeId(canvas),
                    domId: canvas.id || '',
                    className: String(canvas.className),
                    rect,
                    clippedRect: clippedRect(rect),
                    visibleArea: area(clippedRect(rect)),
                };
            })
            .sort((a, b) => b.visibleArea - a.visibleArea);
        const pageCanvases = allCanvases.filter(canvas => canvas.className.split(/\s+/).includes('default'));
        const canvases = pageCanvases.length ? pageCanvases : allCanvases;
        const dominantCanvas = canvases[0] || null;
        const expectedRects = dominantCanvas
            ? [
                { kind: 'canvas', rect: dominantCanvas.rect },
                { kind: 'viewport-clipped-canvas', rect: dominantCanvas.clippedRect },
            ].filter(candidate => candidate.rect)
            : [];
        const frames = [...document.querySelectorAll('.jpdb-ocr-canvas-frame')].map(frame => {
            const rect = rectFor(frame);
            const matches = expectedRects
                .map(candidate => ({ kind: candidate.kind, delta: delta(rect, candidate.rect) }))
                .sort((a, b) => a.delta - b.delta);
            return {
                id: nodeId(frame),
                key: frame.dataset.ocrContentKey || '',
                hidden: frame.hidden,
                complete: frame.complete,
                rect,
                geometryTarget: matches[0]?.kind || '',
                geometryDelta: matches[0]?.delta ?? Number.POSITIVE_INFINITY,
            };
        }).sort((a, b) => a.geometryDelta - b.geometryDelta);
        const matchingFrame = frames[0] || null;
        const overlays = [...document.querySelectorAll('.jpdb-ocr-layer')].map(overlay => {
            const rect = rectFor(overlay);
            const allLines = [...overlay.querySelectorAll('.jpdb-ocr-line')];
            const ownedLines = allLines.map(line => lineState(line, [...document.querySelectorAll('.jpdb-ocr-line')].indexOf(line)));
            return {
                id: nodeId(overlay),
                layerId: overlay.dataset.ocrLayerId || '',
                hidden: overlay.hidden,
                visible: visible(overlay),
                rect,
                geometryDelta: delta(rect, matchingFrame?.rect),
                ownedLineCount: ownedLines.filter(line => line.text.trim()).length,
                ownedLines,
            };
        }).sort((a, b) => a.geometryDelta - b.geometryDelta);
        const matchingOverlay = overlays[0] || null;
        const statuses = [...document.querySelectorAll('.jpdb-ocr-video-frame-status')].map(status => {
            const rect = rectFor(status);
            return {
                id: nodeId(status),
                status: status.dataset.status || '',
                text: status.textContent?.trim() || status.getAttribute('aria-label') || '',
                hidden: status.hidden,
                visible: visible(status),
                rect,
                frameOverlap: intersectionArea(rect, matchingFrame?.rect),
            };
        });
        const matchingStatuses = statuses
            .filter(status => status.frameOverlap > 0)
            .sort((a, b) => Number(b.status === 'ready') - Number(a.status === 'ready'));
        const matchingStatus = matchingStatuses[0] || null;
        const scrollCandidates = [
            document.querySelector('#canvasCluster'),
            document.querySelector('#viewportW'),
            document.querySelector('#viewer'),
            document.scrollingElement,
        ].filter(Boolean);
        const scrollContainer = scrollCandidates.find(element => element.scrollHeight > element.clientHeight + 4);
        return {
            counter: document.querySelector('#pageSliderCounter')?.textContent?.trim() || '',
            recorder: document.documentElement.getAttribute('data-yomu-mirror-recorder') || '',
            recorderMethod: document.documentElement.getAttribute('data-yomu-mirror-method') || '',
            mirrorEpoch: document.documentElement.getAttribute('data-yomu-mirror-epoch') || '',
            hasFocus: document.hasFocus(),
            visibilityState: document.visibilityState,
            dominantCanvas,
            canvasCount: canvases.length,
            frames,
            matchingFrame,
            overlays: overlays.map(({ ownedLines: _ownedLines, ...overlay }) => overlay),
            matchingOverlay,
            matchingStatus,
            statuses,
            terminalStatuses: statuses.filter(status => status.status === 'failed' || status.status === 'empty'),
            scroll: scrollContainer ? {
                id: scrollContainer.id || '',
                tag: scrollContainer.tagName,
                top: scrollContainer.scrollTop,
                height: scrollContainer.scrollHeight,
                clientHeight: scrollContainer.clientHeight,
            } : null,
            verticalRoots: document.querySelectorAll('.canvasRoot.verticalAxis').length,
        };
    }, { telemetryKey: TELEMETRY_KEY });
}

function assertReadyGeometry(state, phase) {
    assert(state.dominantCanvas?.visibleArea > 0, 'No dominant visible BookWalker canvas.', { phase, state });
    assert(state.matchingFrame?.key, 'Dominant canvas has no keyed OCR frame.', { phase, state });
    assert(state.matchingFrame.geometryDelta <= GEOMETRY_TOLERANCE_PX, 'OCR frame does not geometrically match the dominant canvas.', {
        phase,
        tolerancePx: GEOMETRY_TOLERANCE_PX,
        state,
    });
    assert(state.matchingOverlay?.visible && !state.matchingOverlay.hidden, 'Dominant canvas has no visible OCR overlay.', { phase, state });
    assert(state.matchingOverlay.geometryDelta <= GEOMETRY_TOLERANCE_PX, 'OCR overlay does not geometrically match its frame.', {
        phase,
        tolerancePx: GEOMETRY_TOLERANCE_PX,
        state,
    });
    assert(state.matchingOverlay.ownedLineCount > 0, 'Matching OCR overlay has no nonempty owned lines.', { phase, state });
    assert(state.matchingStatus?.status === 'ready' && state.matchingStatus.visible, 'Matching OCR status is not visibly ready.', { phase, state });
    assert(state.terminalStatuses.length === 0, 'A failed/empty OCR status is present.', { phase, state });
}

async function waitForReadyOcr(page, options) {
    const startedAt = Date.now();
    const deadline = startedAt + (options.timeout ?? OCR_READY_TIMEOUT_MS);
    let last;
    while (Date.now() < deadline) {
        last = await readerState(page);
        const key = last.matchingFrame?.key || '';
        const expectedKeyMatches = !options.expectedKey || key === options.expectedKey;
        const unseenKeyMatches = !options.seenKeys || (key && !options.seenKeys.has(key));
        const geometricallyReady = last.dominantCanvas
            && last.matchingFrame?.geometryDelta <= GEOMETRY_TOLERANCE_PX
            && last.matchingOverlay?.visible
            && last.matchingOverlay.geometryDelta <= GEOMETRY_TOLERANCE_PX
            && last.matchingOverlay.ownedLineCount > 0
            && last.matchingStatus?.status === 'ready'
            && last.matchingStatus.visible;
        if (last.counter === options.expectedCounter && expectedKeyMatches && unseenKeyMatches && geometricallyReady) {
            assertReadyGeometry(last, options.phase);
            await assertNoTerminalStatusEvents(page, options.phase);
            return { state: last, readyMs: Date.now() - startedAt };
        }
        await page.waitForTimeout(300);
    }
    throw new Error(`OCR did not settle for ${options.expectedCounter}: ${JSON.stringify({ options: { ...options, seenKeys: [...(options.seenKeys || [])] }, last }, null, 2)}`);
}

async function loadingReadyEvidence(page, cursor, state, phase) {
    await page.waitForTimeout(50);
    const telemetry = await telemetrySnapshot(page, cursor);
    const statusEvents = telemetry.events
        .filter(event => event.type === 'status' && event.nodeId === state.matchingStatus.id);
    const loading = statusEvents.find(event => event.status === 'loading');
    const ready = statusEvents.find(event => event.status === 'ready' && (!loading || event.seq > loading.seq));
    assert(loading && ready, 'Current OCR status did not expose a loading -> ready transition.', {
        phase,
        matchingStatusId: state.matchingStatus.id,
        statusEvents,
    });
    const loadingAt = Date.parse(loading.at);
    const readyAt = Date.parse(ready.at);
    const durationMs = readyAt - loadingAt;
    assert(durationMs >= 0 && durationMs <= OCR_READY_TIMEOUT_MS, 'OCR loading -> ready transition exceeded its bound.', {
        phase,
        durationMs,
        boundMs: OCR_READY_TIMEOUT_MS,
        loading,
        ready,
    });
    return { loading, ready, durationMs };
}

async function waitForCounterChange(page, previous, timeout = 12_000) {
    const deadline = Date.now() + timeout;
    const counterText = () => page.locator('#pageSliderCounter').textContent().then(text => text?.trim() || '');
    for (;;) {
        await page.waitForFunction(oldValue => {
            const value = document.querySelector('#pageSliderCounter')?.textContent?.trim() || '';
            return value && value !== oldValue;
        }, previous, { timeout: Math.max(500, deadline - Date.now()) });
        // BookWalker snaps to page boundaries: the first changed sample can revert
        // while the snap animation completes (~1s observed live). Only report a
        // change once two spaced samples agree on a settled counter.
        let settled = await counterText();
        for (let sample = 0; sample < 8; sample += 1) {
            await page.waitForTimeout(450);
            const next = await counterText();
            if (next === settled) break;
            settled = next;
        }
        if (settled && settled !== previous) {
            // A snap spring can pause long enough to fake agreement (observed
            // live: two matching samples, then a revert ~1s later). Confirm the
            // settled counter survives one more beat before reporting it.
            await page.waitForTimeout(900);
            const confirmed = await counterText();
            if (confirmed === settled) return settled;
        }
        if (Date.now() >= deadline) {
            throw new Error(`BookWalker counter settled back to ${JSON.stringify(previous)} after a transient change.`);
        }
        // Reverted or still springing: re-arm the change wait and settle again.
    }
}

async function dismissLookupPopover(page) {
    const popover = page.locator('.jpdb-reader-popover');
    if (!await popover.count()) return;
    const close = page.locator('.jpdb-reader-popover .jpdb-reader-sheet-close').first();
    if (await close.count() && await close.isVisible()) await close.click();
    else await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.jpdb-reader-popover'), undefined, { timeout: 2_500 });
    await page.waitForTimeout(120);
}

async function turnPage(page, direction) {
    const before = (await readerState(page)).counter;
    const candidates = await page.evaluate(turnDirection => {
        const xs = turnDirection === 'forward' ? [90, 150, 220, 300, 370] : [810, 750, 680, 600, 530];
        const ys = [980, 850, 700, 550, 400, 250, 120];
        const lines = [...document.querySelectorAll('.jpdb-ocr-line')].map(line => line.getBoundingClientRect());
        const clearOfOcr = (x, y) => !lines.some(rect => x >= rect.left - 8 && x <= rect.right + 8
            && y >= rect.top - 8 && y <= rect.bottom + 8);
        return ys.flatMap(y => xs.map(x => ({ x, y }))).filter(({ x, y }) => {
            if (!clearOfOcr(x, y)) return false;
            const top = document.elementFromPoint(x, y);
            return Boolean(top && !top.closest?.('[data-jpdb-reader-root]'));
        });
    }, direction);
    let hitTest;
    for (const point of candidates.slice(0, 12)) {
        await page.mouse.move(890, 50);
        await dismissLookupPopover(page);
        await page.waitForTimeout(160);
        hitTest = await page.evaluate(({ x, y }) => {
            const describe = element => element ? {
                tag: element.tagName,
                id: element.id,
                className: String(element.className),
                pointerEvents: getComputedStyle(element).pointerEvents,
            } : null;
            return {
                top: describe(document.elementFromPoint(x, y)),
                stack: document.elementsFromPoint(x, y).slice(0, 12).map(describe),
            };
        }, point);
        await page.mouse.click(point.x, point.y);
        try {
            const after = await waitForCounterChange(page, before, 2_500);
            assert(
                direction === 'forward' ? pageNumber(after) > pageNumber(before) : pageNumber(after) < pageNumber(before),
                `BookWalker ${direction} tap moved the wrong way`,
                { before, after, point },
            );
            return after;
        } catch {
            // Some edge zones only wake BookWalker's chrome. Try another clear zone.
        }
    }
    const state = await readerState(page);
    throw new Error(`BookWalker ${direction} tap was swallowed: ${JSON.stringify({ before, candidates, hitTest, state }, null, 2)}`);
}

async function openBookwalkerSettings(page) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const ready = await page.evaluate(() => {
            const label = document.querySelector('label[for=pageTransitionAxis_vertical]');
            const rect = label?.getBoundingClientRect();
            return Boolean(rect?.width && rect?.height);
        });
        if (ready) return;
        await page.evaluate(() => document.querySelector('#showSettingPanel')?.click());
        await page.waitForTimeout(800);
    }
    const diagnostic = await page.evaluate(() => ({
        menu: document.querySelector('#menu')?.className,
        panel: document.querySelector('#settingPanel')?.className,
        panelRect: document.querySelector('#settingPanel')?.getBoundingClientRect().toJSON(),
        axis: document.querySelector('#settingPageTransitionAxis')?.outerHTML,
    }));
    throw new Error(`BookWalker settings panel did not open: ${JSON.stringify(diagnostic)}`);
}

async function enableContinuousMode(page) {
    await openBookwalkerSettings(page);
    await page.locator('label[for=pageTransitionAxis_vertical]').click({ force: true });
    await page.waitForFunction(() => document.querySelectorAll('.canvasRoot.verticalAxis').length >= 3, undefined, { timeout: 15_000 });
    await page.waitForTimeout(1_200);
    await page.evaluate(() => {
        if (document.querySelector('#menu')?.classList.contains('showPanel')) {
            document.querySelector('#showSettingPanel')?.click();
        }
    });
    await page.waitForTimeout(300);
}

async function scrollContinuousPage(page, direction = 'forward') {
    await dismissLookupPopover(page);
    const before = (await readerState(page)).counter;
    const scroll = await page.evaluate(() => {
        const candidates = [
            document.querySelector('#viewportW'),
            document.querySelector('#canvasCluster'),
            document.querySelector('#viewer'),
            document.scrollingElement,
        ].filter(Boolean);
        const container = candidates.find(element => element.scrollHeight > element.clientHeight + 4);
        if (!container) throw new Error('No BookWalker vertical scroll container found.');
        const pageHeight = document.querySelector('.canvasRoot.verticalAxis')?.getBoundingClientRect().height || 0;
        const distance = Math.max(pageHeight, container.clientHeight * 0.9);
        return {
            selected: container.id || container.tagName,
            beforeTop: container.scrollTop,
            distance,
            pageHeight,
            candidates: candidates.map(element => ({
                id: element.id || element.tagName,
                clientHeight: element.clientHeight,
                scrollHeight: element.scrollHeight,
                scrollTop: element.scrollTop,
            })),
        };
    });
    // Wheel over the reader canvas but outside OCR hit boxes. The previous fixed
    // centre point can land on a transparent OCR line; Firefox then targets the
    // overlay instead of BookWalker's scroll viewport and scrollTop never moves.
    await page.mouse.move(10, Math.round(VIEWPORT.height / 2));
    await page.waitForTimeout(120);
    const counterText = () => page.locator('#pageSliderCounter').textContent().then(text => text?.trim() || '');
    // Half-page steps cross a boundary politely; escalate to full-page steps when
    // the snap hysteresis keeps pulling the viewport back to the starting page
    // (observed live wheeling UP from a freshly snapped boundary).
    const wheelSteps = [Math.max(360, Math.round(scroll.distance / 2)), Math.max(720, Math.round(scroll.distance))];
    for (const wheelStep of wheelSteps) {
        for (let step = 0; step < 6; step += 1) {
            await page.mouse.wheel(0, direction === 'forward' ? wheelStep : -wheelStep);
            await page.waitForTimeout(180);
            const current = await counterText();
            if (current && current !== before) {
                // Delegate settle detection (snap-back tolerant) to the shared waiter;
                // a counter that reverts mid-snap keeps the wheel loop going.
                try {
                    return await waitForCounterChange(page, before, 6_000);
                } catch {
                    // Settled back to the starting page — wheel further.
                }
            }
        }
    }
    scroll.afterTop = await page.locator('#viewportW').evaluate(element => element.scrollTop);
    try {
        return await waitForCounterChange(page, before, 15_000);
    } catch (error) {
        throw new Error(`Continuous scroll did not move the BookWalker page counter: ${JSON.stringify({ before, scroll, state: await readerState(page) })}`, { cause: error });
    }
}

async function capturePhase(page, mode, phase, screenshotPaths) {
    const safePhase = phase.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    const screenshotPath = path.join(ARTIFACT_DIR, `${RUN_ID}-firefox-${mode}-${safePhase}.png`);
    await page.screenshot({ path: screenshotPath });
    screenshotPaths.push({ phase, path: screenshotPath, capturedAt: new Date().toISOString() });
    return screenshotPath;
}

async function driveDistinctPages(page, mode, network, screenshotPaths) {
    const observations = [];
    const seenCounters = new Set();
    const seenKeys = new Set();
    for (let index = 0; index < PAGE_LIMIT; index += 1) {
        const phase = `page-${index + 1}`;
        const transitionCursor = await telemetryCursor(page);
        const lensCursor = network.lensStarts.length;
        let counter = mode === 'continuous'
            ? await scrollContinuousPage(page, 'forward')
            : await turnPage(page, 'forward');
        // BookWalker's server-side position restore can open the book at the cover,
        // so the first forward step may only reach page 1. Roll forward (bounded)
        // before acceptance rather than failing on the restore point.
        for (let preRoll = 0; pageNumber(counter) <= 1 && preRoll < 2; preRoll += 1) {
            counter = mode === 'continuous'
                ? await scrollContinuousPage(page, 'forward')
                : await turnPage(page, 'forward');
        }
        assert(pageNumber(counter) > 1, 'Acceptance pages must be above page 1.', { mode, index, counter });
        assert(!seenCounters.has(counter), 'BookWalker returned a duplicate exact page counter.', {
            mode,
            index,
            counter,
            seenCounters: [...seenCounters],
        });
        const { state, readyMs } = await waitForReadyOcr(page, {
            expectedCounter: counter,
            seenKeys,
            phase,
        });
        const contentKey = state.matchingFrame.key;
        assert(!seenKeys.has(contentKey), 'BookWalker returned a duplicate dominant content key.', {
            mode,
            index,
            counter,
            contentKey,
            seenKeys: [...seenKeys],
        });
        const transition = await loadingReadyEvidence(page, transitionCursor, state, phase);
        const pageLensStarts = network.lensStarts.slice(lensCursor);
        assert(pageLensStarts.length > 0, 'A fresh distinct BookWalker page did not start the live Lens bridge.', {
            mode,
            index,
            counter,
            contentKey,
            pageLensStarts,
        });
        seenCounters.add(counter);
        seenKeys.add(contentKey);
        observations.push({
            ordinal: index + 1,
            counter,
            contentKey,
            readyMs,
            loadingToReadyMs: transition.durationMs,
            lensStartIds: pageLensStarts.map(start => start.id),
            state,
        });
        if (index === 0 || index === PAGE_LIMIT - 1) await capturePhase(page, mode, `${phase}-ready`, screenshotPaths);
    }
    assert(observations.length >= PAGE_LIMIT, 'Too few BookWalker pages were accepted.', { mode, observations });
    assert(new Set(observations.map(item => item.counter)).size >= PAGE_LIMIT, 'Exact counters were not distinct.', { mode, observations });
    assert(new Set(observations.map(item => item.contentKey)).size >= PAGE_LIMIT, 'Content keys were not distinct.', { mode, observations });
    return observations;
}

async function moveToRecordedPage(page, mode, target) {
    if (mode === 'continuous') {
        for (let attempt = 0; attempt < PAGE_LIMIT * 4; attempt += 1) {
            const current = (await readerState(page)).counter;
            if (current === target.counter) return;
            const direction = pageNumber(current) > pageNumber(target.counter) ? 'back' : 'forward';
            const next = await scrollContinuousPage(page, direction);
            const overshot = direction === 'back'
                ? pageNumber(next) < pageNumber(target.counter)
                : pageNumber(next) > pageNumber(target.counter);
            assert(!overshot, 'BookWalker skipped over an exact continuous counter during revisit.', {
                mode,
                current,
                next,
                target: target.counter,
            });
        }
        throw new Error(`Could not revisit exact BookWalker counter ${target.counter}.`);
    }

    for (let attempt = 0; attempt < PAGE_LIMIT * 3; attempt += 1) {
        const current = (await readerState(page)).counter;
        if (current === target.counter) return;
        const direction = pageNumber(current) > pageNumber(target.counter) ? 'back' : 'forward';
        const next = await turnPage(page, direction);
        const overshot = direction === 'back'
            ? pageNumber(next) < pageNumber(target.counter)
            : pageNumber(next) > pageNumber(target.counter);
        assert(!overshot, 'BookWalker skipped over an exact recorded counter during revisit.', {
            mode,
            current,
            next,
            target: target.counter,
        });
    }
    throw new Error(`Could not revisit exact BookWalker counter ${target.counter}.`);
}

function stabilityViolations(snapshot) {
    return {
        artifactChurn: snapshot.events.filter(event => event.type === 'artifact'
            && (event.kind === 'frame' || event.kind === 'layer')
            && (event.action === 'added' || event.action === 'removed')),
        statusTransitions: snapshot.events.filter(event => event.type === 'status'),
    };
}

async function assertStableCheckpoint(page, network, checkpoint, phase) {
    const telemetry = await telemetrySnapshot(page, checkpoint.telemetryCursor);
    const violations = stabilityViolations(telemetry);
    const lensStarts = network.lensStarts.slice(checkpoint.lensCursor);
    assert(lensStarts.length === 0, 'Stable page started Lens again.', { phase, lensStarts });
    assert(violations.artifactChurn.length === 0, 'Stable page added/removed OCR frames or layers.', {
        phase,
        artifactChurn: violations.artifactChurn,
    });
    assert(violations.statusTransitions.length === 0, 'Stable page changed OCR status.', {
        phase,
        statusTransitions: violations.statusTransitions,
    });
    return { telemetry, lensStarts, ...violations };
}

async function revisitAndHold(page, mode, observations, network, screenshotPaths) {
    const canOpenOverlappingSheet = observation => observation.state.matchingOverlay.ownedLines
        .some(line => line.visible && line.words.some(word => word.text
            && word.hitOwned
            && word.point
            && word.point.y >= VIEWPORT.height * 0.32
            && word.point.y <= VIEWPORT.height - 20));
    const previousPages = observations.slice(0, -1).reverse();
    const target = previousPages.find(canOpenOverlappingSheet)
        || observations[Math.max(0, observations.length - 2)];
    const lensBeforeRevisit = network.lensStarts.length;
    await moveToRecordedPage(page, mode, target);
    const { state, readyMs } = await waitForReadyOcr(page, {
        expectedCounter: target.counter,
        expectedKey: target.contentKey,
        phase: 'exact-revisit',
    });
    assert(network.lensStarts.length === lensBeforeRevisit, 'Revisiting an exact recorded page called Lens again.', {
        mode,
        target: { counter: target.counter, contentKey: target.contentKey },
        lensStarts: network.lensStarts.slice(lensBeforeRevisit),
    });
    const checkpoint = {
        telemetryCursor: await telemetryCursor(page),
        lensCursor: network.lensStarts.length,
    };
    await page.waitForTimeout(STABILITY_HOLD_MS);
    const heldState = await readerState(page);
    assertReadyGeometry(heldState, 'exact-revisit-hold');
    assert(heldState.counter === target.counter && heldState.matchingFrame.key === target.contentKey,
        'Exact revisited page changed during the stability hold.', { target, heldState });
    const stability = await assertStableCheckpoint(page, network, checkpoint, 'exact-revisit-hold');
    await capturePhase(page, mode, 'exact-revisit-stable', screenshotPaths);
    return {
        target: { counter: target.counter, contentKey: target.contentKey },
        readyMs,
        holdMs: STABILITY_HOLD_MS,
        pollIntervals: STABILITY_HOLD_MS / READER_RASTER_POLL_MS,
        state,
        heldState,
        stability,
    };
}

async function verifyContinuousPartialReturn(page, revisit, network, screenshotPaths) {
    const before = await readerState(page);
    const checkpoint = {
        telemetryCursor: await telemetryCursor(page),
        lensCursor: network.lensStarts.length,
    };
    const applyPartialScroll = async forcedDirection => {
        const movement = await page.evaluate(forced => {
            const candidates = [
                document.querySelector('#canvasCluster'),
                document.querySelector('#viewportW'),
                document.querySelector('#viewer'),
                document.scrollingElement,
            ].filter(Boolean);
            const container = candidates.find(element => element.scrollHeight > element.clientHeight + 4);
            if (!container) throw new Error('No continuous BookWalker scroll container found.');
            const canvases = [...document.querySelectorAll('canvas')].filter(canvas => {
                const rect = canvas.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
            });
            const canvas = canvases.sort((a, b) => {
                const area = element => {
                    const rect = element.getBoundingClientRect();
                    return Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left))
                        * Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top));
                };
                return area(b) - area(a);
            })[0];
            if (!canvas) throw new Error('No dominant continuous BookWalker canvas found.');
            const originalTop = container.scrollTop;
            const canvasRect = canvas.getBoundingClientRect();
            const distance = Math.max(60, Math.min(canvasRect.height * 0.18, container.clientHeight * 0.24));
            const maxTop = container.scrollHeight - container.clientHeight;
            // Move the current page toward the viewport centre. Moving it farther away
            // can legitimately cross BookWalker's page-counter threshold and promote
            // the adjacent vertical page, which tests navigation rather than geometry.
            const canvasCenter = canvasRect.top + canvasRect.height / 2;
            const viewportCenter = innerHeight / 2;
            const preferredDelta = forced ? forced * distance : (canvasCenter < viewportCenter ? -distance : distance);
            const requestedTop = Math.max(0, Math.min(maxTop, originalTop + preferredDelta));
            container.scrollTo({ top: requestedTop, behavior: 'auto' });
            container.dispatchEvent(new Event('scroll', { bubbles: true }));
            return { originalTop, requestedTop, distance, canvasCenter, viewportCenter, preferredDelta };
        }, forcedDirection);
        await page.waitForTimeout(READER_RASTER_POLL_MS * 2 + 150);
        return { movement, away: await readerState(page) };
    };
    const stillOnTarget = away => away.counter === revisit.target.counter
        && away.matchingFrame?.key === revisit.target.contentKey;
    let { movement, away } = await applyPartialScroll(null);
    if (!stillOnTarget(away)) {
        // BookWalker's page-counter threshold can sit exactly at the current offset
        // (the canvas centred in the viewport), so the preferred direction may
        // promote the adjacent vertical page — that exercises navigation, not the
        // geometry under test. Restore and probe the opposite direction once.
        await page.evaluate(originalTop => {
            const candidates = [
                document.querySelector('#canvasCluster'),
                document.querySelector('#viewportW'),
                document.querySelector('#viewer'),
                document.scrollingElement,
            ].filter(Boolean);
            const container = candidates.find(element => element.scrollHeight > element.clientHeight + 4);
            if (!container) throw new Error('No continuous BookWalker scroll container found for retry restore.');
            container.scrollTo({ top: originalTop, behavior: 'auto' });
            container.dispatchEvent(new Event('scroll', { bubbles: true }));
        }, movement.originalTop);
        await page.waitForTimeout(READER_RASTER_POLL_MS * 2 + 150);
        ({ movement, away } = await applyPartialScroll(movement.preferredDelta > 0 ? -1 : 1));
    }
    assert(Math.abs((away.scroll?.top ?? movement.originalTop) - movement.originalTop) >= 40,
        'Continuous partial scroll did not move far enough to test viewport return.', { movement, before, away });
    const awayOnTarget = stillOnTarget(away);
    if (!awayOnTarget) {
        // This book centre-snaps pages taller than the viewport, so ANY offset can
        // flip the dominance-based counter to the neighbouring vertical page. That
        // is BookWalker navigation semantics, not overlay corruption — the strict
        // regression net is the exact-return assertions and the no-Lens/no-churn
        // stability checkpoint below.
        const awayPage = pageNumber(away.counter);
        const targetPage = pageNumber(revisit.target.counter);
        assert(Number.isFinite(awayPage) && Math.abs(awayPage - targetPage) === 1,
            'Continuous partial scroll landed on a non-adjacent page.', { movement, before, away, revisit });
    }

    await page.evaluate(originalTop => {
        const candidates = [
            document.querySelector('#canvasCluster'),
            document.querySelector('#viewportW'),
            document.querySelector('#viewer'),
            document.scrollingElement,
        ].filter(Boolean);
        const container = candidates.find(element => element.scrollHeight > element.clientHeight + 4);
        if (!container) throw new Error('No continuous BookWalker scroll container found for return.');
        container.scrollTo({ top: originalTop, behavior: 'auto' });
        container.dispatchEvent(new Event('scroll', { bubbles: true }));
    }, movement.originalTop);
    await page.waitForTimeout(READER_RASTER_POLL_MS * 2 + 150);
    // BookWalker owns scrollTop through its boundary snap: restoring the raw
    // offset can legitimately settle on the adjacent page (observed live: 1920px
    // restored → re-snapped to 6/41). The contract under test is that driving
    // BACK to the recorded page restores the exact cached frame without a new
    // Lens call, so navigate by counter when the raw offset snapped elsewhere.
    if ((await readerState(page)).counter !== revisit.target.counter) {
        await moveToRecordedPage(page, 'continuous', revisit.target);
    }
    const { state: returned } = await waitForReadyOcr(page, {
        expectedCounter: revisit.target.counter,
        expectedKey: revisit.target.contentKey,
        phase: 'continuous-partial-return',
    });
    assert(returned.counter === revisit.target.counter && returned.matchingFrame.key === revisit.target.contentKey,
        'Continuous partial return did not restore the exact recorded page.', { revisit, returned });
    let stability;
    if (awayOnTarget) {
        stability = await assertStableCheckpoint(page, network, checkpoint, 'continuous-partial-return');
    } else {
        // Page dominance flipped during the away excursion, so the neighbouring
        // cached pages legitimately swap frames/statuses in and out. The
        // inviolable contract is that the whole excursion is served from cache —
        // zero new Lens calls — and never flashes a terminal status.
        const telemetry = await telemetrySnapshot(page, checkpoint.telemetryCursor);
        const violations = stabilityViolations(telemetry);
        const lensStarts = network.lensStarts.slice(checkpoint.lensCursor);
        assert(lensStarts.length === 0, 'Partial-scroll excursion started Lens again.', {
            phase: 'continuous-partial-return',
            lensStarts,
        });
        await assertNoTerminalStatusEvents(page, 'continuous-partial-return');
        stability = { telemetry, lensStarts, ...violations, awayOnTarget };
    }
    await capturePhase(page, 'continuous', 'partial-scroll-return-stable', screenshotPaths);
    return { movement, before, away, returned, stability };
}

async function hoverProofState(page, lineId, point) {
    return page.evaluate(({ telemetryKey, sourceLineId, sourcePoint }) => {
        const telemetry = window[telemetryKey];
        const line = [...document.querySelectorAll('.jpdb-ocr-line')]
            .find(candidate => telemetry?.nodeId(candidate) === sourceLineId);
        const sheet = [...document.querySelectorAll('.jpdb-reader-popover.jpdb-reader-sheet')]
            .find(candidate => {
                const rect = candidate.getBoundingClientRect();
                const style = getComputedStyle(candidate);
                return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
            });
        const rectValue = rect => rect ? {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
        } : null;
        const overlap = (a, b) => a && b
            ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
                * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
            : 0;
        const lineRect = line?.getBoundingClientRect();
        const sheetRect = sheet?.getBoundingClientRect();
        const lineText = line?.querySelector('.jpdb-reader-word,.jpdb-ocr-line-text') || line;
        const style = lineText ? getComputedStyle(lineText) : null;
        const transparent = value => !value || value === 'transparent'
            || value === 'rgba(0, 0, 0, 0)' || value === 'rgba(0,0,0,0)';
        const pointOwner = document.elementFromPoint(sourcePoint.x, sourcePoint.y);
        return {
            lineConnected: Boolean(line?.isConnected),
            lineRect: rectValue(lineRect),
            sheetRect: rectValue(sheetRect),
            overlapArea: overlap(lineRect, sheetRect),
            pointCoveredBySheet: Boolean(pointOwner?.closest('.jpdb-reader-popover.jpdb-reader-sheet')),
            pointOwner: pointOwner ? { tag: pointOwner.tagName, id: pointOwner.id, className: String(pointOwner.className) } : null,
            hovered: Boolean(line?.matches(':hover')),
            active: Boolean(line?.classList.contains('jpdb-ocr-line-active')),
            pinned: line?.dataset.pinned || '',
            painted: Boolean(style
                && style.visibility !== 'hidden'
                && Number(style.opacity || '1') > 0
                && !transparent(style.color)
                && !transparent(style.webkitTextFillColor || style.color)),
            sheetCount: document.querySelectorAll('.jpdb-reader-popover.jpdb-reader-sheet').length,
        };
    }, { telemetryKey: TELEMETRY_KEY, sourceLineId: lineId, sourcePoint: point });
}

async function assertOverlappingHoverSheet(page, mode, network, screenshotPaths) {
    await dismissLookupPopover(page);
    await page.mouse.move(890, 40);
    await page.waitForTimeout(180);
    let state = await readerState(page);
    assertReadyGeometry(state, 'hover-precondition');
    const findCandidate = lines => lines
        .flatMap(line => line.words.map(word => ({ line, word })))
        .filter(({ line, word }) => line.visible
            && word.text
            && word.hitOwned
            && word.point
            && word.point.y >= VIEWPORT.height * 0.32
            && word.point.y <= VIEWPORT.height - 20)
        .sort((a, b) => b.word.point.y - a.word.point.y)[0];
    let lines = state.matchingOverlay.ownedLines;
    let candidate = findCandidate(lines);
    for (let attempt = 0; !candidate && attempt < 3; attempt += 1) {
        const nearest = lines
            .flatMap(line => line.words.map(word => ({ line, word })))
            .filter(({ word }) => word.text && word.point)
            .sort((a, b) => Math.abs(a.word.point.y - VIEWPORT.height * 0.68)
                - Math.abs(b.word.point.y - VIEWPORT.height * 0.68))[0];
        if (!nearest) break;
        const delta = Math.max(-500, Math.min(500, nearest.word.point.y - VIEWPORT.height * 0.68));
        await page.evaluate(scrollDelta => {
            const container = document.querySelector('#viewportW');
            if (!container) return;
            container.scrollTop += scrollDelta;
            container.dispatchEvent(new Event('scroll', { bubbles: true }));
        }, delta);
        await page.waitForTimeout(350);
        state = await readerState(page);
        assertReadyGeometry(state, 'hover-reposition');
        lines = state.matchingOverlay.ownedLines;
        candidate = findCandidate(lines);
    }
    assert(candidate, 'No visible OCR word can be covered by the real BookWalker lookup sheet.', {
        mode,
        viewport: VIEWPORT,
        lines,
    });

    const hitProof = await page.evaluate(({ telemetryKey, wordId, point }) => {
        const telemetry = window[telemetryKey];
        const word = [...document.querySelectorAll('.jpdb-reader-word')]
            .find(candidateWord => telemetry?.nodeId(candidateWord) === wordId);
        const hit = document.elementFromPoint(point.x, point.y);
        return {
            owned: Boolean(word && hit && (word === hit || word.contains(hit))),
            hit: hit ? { tag: hit.tagName, id: hit.id, className: String(hit.className) } : null,
        };
    }, { telemetryKey: TELEMETRY_KEY, wordId: candidate.word.id, point: candidate.word.point });
    assert(hitProof.owned, 'elementFromPoint did not hit the OCR word before hover.', { candidate, hitProof });

    const prePinned = candidate.line.pinned === 'true';
    const checkpoint = {
        telemetryCursor: await telemetryCursor(page),
        lensCursor: network.lensStarts.length,
    };
    // Hover with trusted mouse input at the point elementFromPoint already proved
    // the word owns. Locator.hover() aims at the element's BOX CENTER, and a
    // vertical-text word box can extend past its rendered glyph column, so the
    // center may never receive pointer events (observed live: 30s actionability
    // timeout on a word the point-proof had already validated).
    // Approach the word the way a reader's pointer does: hover-intent detection
    // wants a short trail of pointermove events, and a single teleporting move
    // occasionally coalesces into none on live Firefox (observed flake).
    const approachWord = async () => {
        await page.mouse.move(candidate.word.point.x, Math.max(0, candidate.word.point.y - 48));
        await page.mouse.move(candidate.word.point.x, candidate.word.point.y, { steps: 8 });
    };
    await approachWord();
    // The lookup can render as a bottom sheet that interposes at the mouse point
    // (the hover-steal scenario the transient line lease exists for) or as a
    // floating popover positioned away from the word (typical paged layout, where
    // no occlusion ever happens). Wait for a visible lookup surface, let its
    // enter animation settle, then assert whichever contract the layout produced.
    const popoverVisible = () => page.waitForFunction(() => [...document.querySelectorAll('.jpdb-reader-popover')].some(node => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    }), undefined, { timeout: 12_000 });
    try {
        await popoverVisible();
    } catch {
        await page.mouse.move(890, 40);
        await page.waitForTimeout(400);
        await approachWord();
        await popoverVisible();
    }
    await page.waitForTimeout(350);
    let overlapped = await hoverProofState(page, candidate.line.id, candidate.word.point);
    if (!overlapped.hovered && (!overlapped.active || !overlapped.painted)) {
        // Firefox can coalesce the final pointermove as the sheet enters, so the
        // source lease never observes the trusted hover even though the lookup
        // opens. Retry the same proven point once; a second miss remains fatal.
        await dismissLookupPopover(page);
        await page.mouse.move(890, 40);
        await page.waitForTimeout(350);
        await approachWord();
        await popoverVisible();
        await page.waitForTimeout(350);
        overlapped = await hoverProofState(page, candidate.line.id, candidate.word.point);
    }
    if (!overlapped.hovered) {
        // The lookup surface stole :hover from the source line — the exact
        // occlusion the transient line lease must survive.
        assert(overlapped.pointCoveredBySheet || overlapped.overlapArea > 0,
            'OCR source lost :hover but no lookup sheet actually covers it.', { mode, candidate, overlapped });
        assert(overlapped.active && overlapped.painted, 'Transient OCR active paint was not retained under the sheet.', { mode, overlapped });
    } else {
        // Floating popover: nothing occludes the word, so the ordinary :hover
        // paint contract applies and the lease never needs to engage.
        assert(overlapped.painted, 'Hover lookup opened but the OCR source lost its hover paint.', { mode, overlapped });
    }
    assert(overlapped.pinned !== 'true', 'Hover lookup pinned the OCR line.', { mode, overlapped });
    await capturePhase(page, mode, overlapped.hovered ? 'hover-floating-popover' : 'hover-overlapping-sheet', screenshotPaths);

    await dismissLookupPopover(page);
    await page.mouse.move(890, 40);
    await page.waitForTimeout(350);
    const dismissed = await hoverProofState(page, candidate.line.id, candidate.word.point);
    assert(prePinned || (!dismissed.active && !dismissed.painted), 'Dismissed transient lookup left OCR active paint behind.', {
        mode,
        prePinned,
        candidate,
        dismissed,
    });
    assert(network.lensStarts.length === checkpoint.lensCursor, 'Hover lookup unexpectedly started Lens.', {
        mode,
        lensStarts: network.lensStarts.slice(checkpoint.lensCursor),
    });
    await assertNoTerminalStatusEvents(page, 'hover-dismissed');
    return { candidate, prePinned, hitProof, overlapped, dismissed };
}

function normalizedLineGeometry(state) {
    const frame = state.matchingFrame?.rect;
    const line = state.matchingOverlay?.ownedLines.find(candidate => candidate.text.trim())?.rect;
    if (!frame || !line || frame.width <= 0 || frame.height <= 0) return null;
    return {
        centerX: (line.left + line.width / 2 - frame.left) / frame.width,
        centerY: (line.top + line.height / 2 - frame.top) / frame.height,
        width: line.width / frame.width,
        height: line.height / frame.height,
    };
}

async function movePointerOffOcr(page) {
    await page.mouse.move(VIEWPORT.width - 10, 40);
    await page.waitForTimeout(120);
}

async function revealBookwalkerZoomControls(page, expectedCounter) {
    await movePointerOffOcr(page);
    await dismissLookupPopover(page);
    await movePointerOffOcr(page);
    const readControls = () => page.evaluate(() => ['zoomInBtn', 'zoomDefaultBtn', 'zoomOutBtn'].map(id => {
        const element = document.getElementById(id);
        const rect = element?.getBoundingClientRect();
        const style = element ? getComputedStyle(element) : null;
        const hit = rect ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) : null;
        return {
            id,
            exists: Boolean(element),
            visible: Boolean(rect?.width
                && rect?.height
                && style?.display !== 'none'
                && style?.visibility !== 'hidden'
                && style?.opacity !== '0'),
            hitTested: Boolean(element && hit && (hit === element || element.contains(hit))),
            disabled: Boolean(element?.disabled),
        };
    }));
    const usable = controls => controls.every(control => control.exists)
        && controls.some(control => control.visible && control.hitTested && !control.disabled);
    for (let attempt = 0; attempt < 6; attempt += 1) {
        const controls = await readControls();
        if (usable(controls)) return controls;

        await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height - 18);
        await page.waitForTimeout(300);
        const hoveredControls = await readControls();
        if (usable(hoveredControls)) return hoveredControls;
        const point = await page.evaluate(() => {
            const candidates = [
                [innerWidth * 0.5, 20],
                [innerWidth * 0.75, 20],
                [innerWidth * 0.25, 20],
                [innerWidth - 8, innerHeight - 8],
                [8, innerHeight - 8],
                [innerWidth * 0.5, innerHeight * 0.5],
                [innerWidth * 0.5, innerHeight * 0.38],
                [innerWidth * 0.42, innerHeight * 0.5],
                [innerWidth * 0.58, innerHeight * 0.5],
            ];
            return candidates.map(([x, y]) => ({ x, y })).find(({ x, y }) => {
                const target = document.elementFromPoint(x, y);
                return target && !target.closest('[data-jpdb-reader-root],.jpdb-ocr-line');
            }) || null;
        });
        assert(point, 'Could not find a clear host point to reveal BookWalker zoom controls.', {
            attempt,
            controls,
            hoveredControls,
        });
        await page.mouse.click(point.x, point.y);
        await page.waitForTimeout(500);
        const counter = (await readerState(page)).counter;
        assert(counter === expectedCounter, 'Revealing BookWalker zoom controls changed page.', {
            expectedCounter,
            counter,
            attempt,
            point,
        });
    }
    const diagnostic = await page.evaluate(() => ({
        menuClass: document.querySelector('#menu')?.className,
        sliderClass: document.querySelector('#pageSlider')?.className,
        zoomAreaClass: document.querySelector('#zoomButtonArea')?.className,
        zoomRatio: document.querySelector('#zoomRatio')?.textContent?.trim() || '',
        controls: ['zoomInBtn', 'zoomDefaultBtn', 'zoomOutBtn'].map(id => document.getElementById(id)?.outerHTML || ''),
    }));
    const controls = await readControls();
    // Continuous mode can deliberately expose the zoom buttons only as hidden,
    // disabled DOM placeholders. Return that real state so the caller records a
    // truthful unavailable result instead of trying to click through host UI.
    if (controls.every(control => control.exists)
        && controls.every(control => !control.visible || control.disabled || !control.hitTested)) return controls;
    throw new Error(`BookWalker zoom controls could not be used: ${JSON.stringify(diagnostic)}`);
}

async function clickBookwalkerZoomControl(page, controlId, expectedCounter) {
    await revealBookwalkerZoomControls(page, expectedCounter);
    const control = page.locator(`#${controlId}`);
    const box = await control.boundingBox();
    assert(box?.width && box?.height, 'BookWalker zoom control has no clickable box.', {
        controlId,
        expectedCounter,
        box,
    });
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const hit = await page.evaluate(({ x, y, id }) => {
        const target = document.elementFromPoint(x, y);
        return {
            target: target ? { tag: target.tagName, id: target.id, className: String(target.className) } : null,
            ownsControl: Boolean(target?.closest(`#${id}`)),
        };
    }, { ...point, id: controlId });
    assert(hit.ownsControl, 'BookWalker zoom control is covered before the user click.', {
        controlId,
        expectedCounter,
        point,
        hit,
    });
    await page.mouse.click(point.x, point.y);
    return { point, hit };
}

async function waitForZoomGeometry(page, before, target, phase, ratioBefore = '') {
    const deadline = Date.now() + 15_000;
    const normalizedRatioBefore = ratioBefore?.trim() || '';
    let last;
    let lastRatio = '';
    while (Date.now() < deadline) {
        await assertNoTerminalStatusEvents(page, phase);
        last = await readerState(page);
        const widthChange = Math.abs((last.dominantCanvas?.rect.width || 0) - before.dominantCanvas.rect.width);
        const heightChange = Math.abs((last.dominantCanvas?.rect.height || 0) - before.dominantCanvas.rect.height);
        lastRatio = (await page.locator('#zoomRatio').textContent().catch(() => ''))?.trim() || '';
        // Viewport-fit zoom can change only the canvas backing store and the
        // host's zoom-ratio label while the fitted CSS rect stays identical
        // (observed live: rect 900x1100 before AND after zoomIn). Either signal
        // proves the zoom happened; the contract under test is that the SAME
        // cached page stays ready and aligned through it.
        const zoomEvidence = widthChange >= 4 || heightChange >= 4
            || (lastRatio !== '' && lastRatio !== normalizedRatioBefore);
        if (last.counter === target.counter
            && last.matchingFrame?.key === target.contentKey
            && zoomEvidence
            && last.matchingFrame.geometryDelta <= GEOMETRY_TOLERANCE_PX
            && last.matchingOverlay?.geometryDelta <= GEOMETRY_TOLERANCE_PX) {
            assertReadyGeometry(last, phase);
            return last;
        }
        await page.waitForTimeout(250);
    }
    throw new Error(`BookWalker zoom did not produce matching OCR geometry: ${JSON.stringify({ phase, ratioBefore: normalizedRatioBefore, ratioAfter: lastRatio, before, last }, null, 2)}`);
}

function bookwalkerZoomControlCandidates(controls) {
    const ids = ['zoomInBtn', 'zoomOutBtn'];
    const userControls = ids
        .map(id => controls.find(control => control.id === id && control.visible && control.hitTested && !control.disabled))
        .filter(Boolean);
    const programmaticControls = ids
        .map(id => controls.find(control => control.id === id && control.visible && !control.disabled))
        .filter(Boolean);
    return userControls.length
        ? { activation: 'user-click', candidateControls: userControls }
        : { activation: 'programmatic-host-control', candidateControls: programmaticControls };
}

async function attemptBookwalkerZoom(page, mode, target, before, controls, ratioBefore) {
    const { activation, candidateControls } = bookwalkerZoomControlCandidates(controls);
    let zoomed;
    let usedControl;
    for (const control of candidateControls) {
        if (activation === 'user-click') {
            await clickBookwalkerZoomControl(page, control.id, target.counter);
        } else {
            const activated = await page.evaluate(id => {
                const button = document.getElementById(id);
                if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
                button.click();
                return true;
            }, control.id);
            assert(activated, 'BookWalker host zoom control could not be invoked programmatically.', {
                mode,
                control,
            });
        }
        try {
            zoomed = await waitForZoomGeometry(page, before, target, 'bookwalker-zoom', ratioBefore);
            usedControl = control;
            break;
        } catch (error) {
            // Distinguish a genuinely inert control (nothing changed at all —
            // observed live: ratio 100% → 100%, identical rect) from real zoom
            // evidence with broken OCR geometry, which must keep failing.
            const ratioNow = (await page.locator('#zoomRatio').textContent().catch(() => ''))?.trim() || '';
            const rectNow = (await readerState(page)).dominantCanvas?.rect;
            const inert = ratioNow === (ratioBefore?.trim() || '')
                && Math.abs((rectNow?.width || 0) - before.dominantCanvas.rect.width) < 4
                && Math.abs((rectNow?.height || 0) - before.dominantCanvas.rect.height) < 4;
            if (!inert) throw error;
        }
    }
    return { activation, candidateControls, zoomed, usedControl };
}

async function verifyBookwalkerZoom(page, mode, target, network, screenshotPaths) {
    await dismissLookupPopover(page);
    const before = await readerState(page);
    assertReadyGeometry(before, 'zoom-before');
    assert(before.counter === target.counter && before.matchingFrame.key === target.contentKey,
        'Zoom check did not start on the exact revisited page.', { target, before });
    const beforeNormalized = normalizedLineGeometry(before);
    assert(beforeNormalized, 'Zoom check has no OCR line geometry.', { before });
    const checkpoint = {
        telemetryCursor: await telemetryCursor(page),
        lensCursor: network.lensStarts.length,
    };
    const controls = await revealBookwalkerZoomControls(page, target.counter);
    const ratioBefore = await page.locator('#zoomRatio').textContent().catch(() => '');
    const { activation, candidateControls, zoomed, usedControl } = await attemptBookwalkerZoom(
        page,
        mode,
        target,
        before,
        controls,
        ratioBefore,
    );
    if (!candidateControls.length) {
        const stability = await assertStableCheckpoint(page, network, checkpoint, 'bookwalker-zoom-unavailable');
        await capturePhase(page, mode, 'zoom-unavailable', screenshotPaths);
        return {
            skipped: true,
            reason: 'zoom-controls-unavailable',
            ratioBefore: ratioBefore?.trim() || '',
            controls,
            stability,
        };
    }
    if (!zoomed) {
        // Neither control changes the zoom ratio or the canvas box for this trial
        // book/viewport, so the zoom-alignment contract cannot be exercised here.
        // The page must still be exactly as recorded and served from cache.
        const stability = await assertStableCheckpoint(page, network, checkpoint, 'bookwalker-zoom-unavailable');
        await capturePhase(page, mode, 'zoom-unavailable', screenshotPaths);
        return { skipped: true, reason: 'zoom-controls-inert', ratioBefore: ratioBefore?.trim() || '', stability };
    }
    const ratioAfter = await page.locator('#zoomRatio').textContent().catch(() => '');
    const zoomedNormalized = normalizedLineGeometry(zoomed);
    assert(zoomedNormalized, 'Zoomed page has no OCR line geometry.', { zoomed });
    for (const coordinate of ['centerX', 'centerY']) {
        assert(Math.abs(zoomedNormalized[coordinate] - beforeNormalized[coordinate]) <= 0.025,
            `OCR ${coordinate} drifted during real BookWalker zoom.`, {
                mode,
                coordinate,
                beforeNormalized,
                zoomedNormalized,
                before,
                zoomed,
            });
    }
    // A re-rasterizing zoom legitimately re-makes the frame element (the OCR
    // cache must still serve it — zero Lens); a CSS-only zoom scales the same
    // frame in place and must produce no churn at all.
    if (zoomed.matchingFrame.id === before.matchingFrame.id) {
        await assertStableCheckpoint(page, network, checkpoint, 'bookwalker-zoom');
    } else {
        const lensStarts = network.lensStarts.slice(checkpoint.lensCursor);
        assert(lensStarts.length === 0, 'BookWalker zoom re-OCRed the cached page.', { mode, lensStarts });
        await assertNoTerminalStatusEvents(page, 'bookwalker-zoom');
    }
    await capturePhase(page, mode, 'real-bookwalker-zoom', screenshotPaths);

    await movePointerOffOcr(page);
    await dismissLookupPopover(page);
    await movePointerOffOcr(page);
    await revealBookwalkerZoomControls(page, target.counter);
    const defaultControl = page.locator('#zoomDefaultBtn');
    assert(await defaultControl.isVisible() && await defaultControl.isEnabled(), 'BookWalker default zoom control is unavailable.', {
        mode,
        controls: await revealBookwalkerZoomControls(page, target.counter),
    });
    if (activation === 'user-click') {
        await clickBookwalkerZoomControl(page, 'zoomDefaultBtn', target.counter);
    } else {
        const restored = await page.evaluate(() => {
            const button = document.getElementById('zoomDefaultBtn');
            if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
            button.click();
            return true;
        });
        assert(restored, 'BookWalker default host zoom control could not be invoked programmatically.', { mode });
    }
    const restoreDeadline = Date.now() + 15_000;
    let restored;
    while (Date.now() < restoreDeadline) {
        restored = await readerState(page);
        const canvas = restored.dominantCanvas?.rect;
        if (restored.counter === target.counter
            && restored.matchingFrame?.key === target.contentKey
            && canvas
            && Math.abs(canvas.width - before.dominantCanvas.rect.width) <= GEOMETRY_TOLERANCE_PX
            && Math.abs(canvas.height - before.dominantCanvas.rect.height) <= GEOMETRY_TOLERANCE_PX) break;
        await page.waitForTimeout(250);
    }
    const restoredCanvas = restored?.dominantCanvas?.rect;
    assert(restored?.counter === target.counter
        && restored.matchingFrame?.key === target.contentKey
        && restoredCanvas
        && Math.abs(restoredCanvas.width - before.dominantCanvas.rect.width) <= GEOMETRY_TOLERANCE_PX
        && Math.abs(restoredCanvas.height - before.dominantCanvas.rect.height) <= GEOMETRY_TOLERANCE_PX,
    'BookWalker default zoom did not restore the original canvas geometry.', { mode, before, zoomed, restored });
    assertReadyGeometry(restored, 'bookwalker-zoom-restored');
    if (restored.matchingFrame.id === before.matchingFrame.id) {
        await assertStableCheckpoint(page, network, checkpoint, 'bookwalker-zoom-restored');
    } else {
        const lensStarts = network.lensStarts.slice(checkpoint.lensCursor);
        assert(lensStarts.length === 0, 'BookWalker zoom restore re-OCRed the cached page.', { mode, lensStarts });
        await assertNoTerminalStatusEvents(page, 'bookwalker-zoom-restored');
    }
    return {
        control: usedControl.id,
        activation,
        ratioBefore: ratioBefore?.trim() || '',
        ratioAfter: ratioAfter?.trim() || '',
        before,
        zoomed,
        restored,
        beforeNormalized,
        zoomedNormalized,
    };
}

// Headless Firefox does not drop document.hasFocus()/visibilityState when another
// tab is brought to the front, so the real tab-switch path below silently no-ops.
// This drives the product's actual blur/focus/visibilitychange listeners directly,
// which still exercises the away->return cycle and — combined with the unchanged
// stable-checkpoint assertion in the caller — still catches a re-scan-on-refocus
// or dropped-frame regression. It never fabricates readiness: OCR state is only
// held across the away window, never re-created.
async function simulateVisibilityTransition(page, state) {
    await page.evaluate(target => {
        const hidden = target === 'hidden';
        try { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => target }); } catch { /* ignored */ }
        try { Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden }); } catch { /* ignored */ }
        try { Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => !hidden }); } catch { /* ignored */ }
        window.dispatchEvent(new Event(hidden ? 'blur' : 'focus'));
        document.dispatchEvent(new Event('visibilitychange'));
    }, state);
}

async function verifyBrowserRefocus(page, context, mode, target, network, screenshotPaths) {
    const before = await readerState(page);
    assertReadyGeometry(before, 'refocus-before');
    const checkpoint = {
        telemetryCursor: await telemetryCursor(page),
        lensCursor: network.lensStarts.length,
    };
    const otherPage = await context.newPage();
    let simulated = false;
    try {
        await otherPage.setContent('<!doctype html><title>Yomu focus sentinel</title><main>focus sentinel</main>');
        await otherPage.bringToFront();
        const lostFocus = await page.waitForFunction(() => !document.hasFocus(), undefined, { timeout: 2_000 })
            .then(() => true).catch(() => false);
        if (!lostFocus) {
            simulated = true;
            await simulateVisibilityTransition(page, 'hidden');
        }
        await page.waitForTimeout(READER_RASTER_POLL_MS + 100);
        await page.bringToFront();
        if (simulated) {
            await simulateVisibilityTransition(page, 'visible');
        } else {
            await page.waitForFunction(() => document.hasFocus() && document.visibilityState === 'visible', undefined, { timeout: 5_000 });
        }
        await page.waitForTimeout(READER_RASTER_POLL_MS * 2 + 100);
    } finally {
        await otherPage.close().catch(() => undefined);
    }
    const after = await readerState(page);
    assertReadyGeometry(after, 'browser-refocus');
    assert(after.hasFocus && after.visibilityState === 'visible', 'Firefox did not restore focus/visibility to BookWalker.', { mode, after });
    assert(after.counter === target.counter && after.matchingFrame.key === target.contentKey,
        'Browser refocus changed the exact BookWalker page.', { target, before, after });
    const telemetry = await telemetrySnapshot(page, checkpoint.telemetryCursor);
    const focusEvents = telemetry.events.filter(event => event.type === 'focus');
    assert(focusEvents.some(event => event.event === 'blur') && focusEvents.some(event => event.event === 'focus'),
        'Firefox refocus did not emit the expected blur/focus telemetry.', { mode, focusEvents });
    const stability = await assertStableCheckpoint(page, network, checkpoint, 'browser-refocus');
    await capturePhase(page, mode, 'browser-refocus-stable', screenshotPaths);
    return { before, after, focusEvents, stability };
}

async function runMode(mode, candidate) {
    const network = { requests: [], lensStarts: [] };
    const yomuLogs = [];
    const browserEvents = [];
    const screenshotPaths = [];
    const browser = await firefox.launch({
        // Headed is required for a faithful blur/refocus check: headless Firefox
        // does not update document.hasFocus()/visibilityState on tab switch, so
        // the browser-refocus acceptance step (a real user-reported regression)
        // can only be exercised with a window server. Default stays headless for CI.
        headless: process.env.YOMU_BOOKWALKER_HEADED !== '1',
        firefoxUserPrefs: { 'dom.motion-sensors.enabled': false },
    });
    const context = await browser.newContext({
        viewport: VIEWPORT,
        hasTouch: HAS_TOUCH,
        locale: 'ja-JP',
        userAgent: FIREFOX_UA,
        recordVideo: { dir: ARTIFACT_DIR, size: VIEWPORT },
    });
    await installTelemetry(context);
    await installCookieBannerAutoDismiss(context);
    await context.addInitScript(() => {
        try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); } catch { /* ignored */ }
    });
    const page = await context.newPage();
    const video = page.video();
    const videoPath = path.join(ARTIFACT_DIR, `${RUN_ID}-firefox-${mode}.webm`);
    let result;
    let caught;

    page.on('pageerror', error => browserEvents.push({
        type: 'pageerror',
        at: new Date().toISOString(),
        message: error.message,
        stack: error.stack || '',
    }));
    page.on('requestfailed', request => browserEvents.push({
        type: 'requestfailed',
        at: new Date().toISOString(),
        method: request.method(),
        resource: requestLabel(request.url()),
        failure: request.failure()?.errorText || '',
    }));
    page.on('crash', () => browserEvents.push({ type: 'crash', at: new Date().toISOString() }));
    await page.exposeFunction(REQUEST_BRIDGE, request => liveRequest(request, network));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: SETTINGS,
        css: candidate.css,
        requestBridgeName: REQUEST_BRIDGE,
    });
    // Tampermonkey executes Yomu at document-start. Installing after BookWalker
    // reaches complete misses the viewer's initial canvas draw graph and produces
    // a false mirror-capture failure that real installs do not have.
    await page.addInitScript({ content: candidate.scriptCode });
    page.on('console', message => {
        const text = message.text();
        if (!text.includes('[Yomu]')) return;
        const entry = { at: new Date().toISOString(), type: message.type(), text, args: [] };
        yomuLogs.push(entry);
        void Promise.all(message.args().map(argument => argument.jsonValue().catch(() => '[unserializable]')))
            .then(args => { entry.args = args; });
    });

    try {
        await page.goto(TARGET_URL, { waitUntil: 'commit', timeout: 45_000 });
        await page.waitForFunction(() => document.readyState === 'complete'
            && document.querySelectorAll('canvas').length >= 3
            && document.querySelector('#pageSliderCounter'), undefined, { timeout: 35_000 });
        await dismissCookieBanner(page);
        await page.addStyleTag({ content: candidate.css });
        try {
            await page.waitForFunction(() => document.documentElement.getAttribute('data-yomu-mirror-recorder') === '1', undefined, { timeout: 20_000 });
        } catch (error) {
            const diagnostic = await page.evaluate(() => ({
                recorder: document.documentElement.getAttribute('data-yomu-mirror-recorder'),
                method: document.documentElement.getAttribute('data-yomu-mirror-method'),
                yomuRoots: document.querySelectorAll('[data-jpdb-reader-root]').length,
                yomuButton: Boolean(document.querySelector('.jpdb-reader-fab')),
                scripts: [...document.scripts].filter(script => /Yomu|yomu/i.test(script.textContent || '')).length,
            }));
            throw new Error(`Live candidate did not install its canvas recorder: ${JSON.stringify(diagnostic)}`, { cause: error });
        }
        await page.waitForTimeout(800);
        if (mode === 'continuous') await enableContinuousMode(page);
        await dismissCookieBanner(page);

        const observations = await driveDistinctPages(page, mode, network, screenshotPaths);
        const revisit = await revisitAndHold(page, mode, observations, network, screenshotPaths);
        const continuousPartialReturn = mode === 'continuous'
            ? await verifyContinuousPartialReturn(page, revisit, network, screenshotPaths)
            : null;
        const hover = await assertOverlappingHoverSheet(page, mode, network, screenshotPaths);
        const zoom = await verifyBookwalkerZoom(page, mode, revisit.target, network, screenshotPaths);
        const refocus = await verifyBrowserRefocus(page, context, mode, revisit.target, network, screenshotPaths);

        const loopLogs = yomuLogs.filter(entry => /mirror capture resolved|Discarded BookWalker canvas snapshot/.test(entry.text));
        assert(loopLogs.length === 0, 'BookWalker capture/commit loop returned.', { mode, loopLogs: loopLogs.slice(0, 20) });
        await assertNoTerminalStatusEvents(page, 'mode-complete');
        const telemetry = await telemetrySnapshot(page);
        result = {
            mode,
            target: TARGET_URL,
            exactPages: observations.map(item => ({ counter: item.counter, contentKey: item.contentKey })),
            observations,
            revisit,
            continuousPartialReturn,
            hover,
            zoom,
            refocus,
            requests: network.requests,
            lensStarts: network.lensStarts,
            browserEvents,
            telemetry,
            yomuLogs,
            screenshotPaths,
            videoPath,
        };
    } catch (error) {
        caught = error instanceof Error ? error : new Error(String(error));
        const failurePath = path.join(ARTIFACT_DIR, `${RUN_ID}-firefox-${mode}-failure.png`);
        await page.screenshot({ path: failurePath }).then(() => {
            screenshotPaths.push({ phase: 'failure', path: failurePath, capturedAt: new Date().toISOString() });
        }).catch(() => undefined);
        const telemetry = await telemetrySnapshot(page).catch(() => ({ cursor: 0, dropped: 0, events: [] }));
        const state = await readerState(page).catch(() => null);
        Object.defineProperty(caught, 'evidence', {
            configurable: true,
            value: {
                mode,
                target: TARGET_URL,
                requests: network.requests,
                lensStarts: network.lensStarts,
                browserEvents,
                telemetry,
                state,
                yomuLogs,
                screenshotPaths,
                videoPath,
            },
        });
    } finally {
        await context.close().catch(() => undefined);
        try {
            const temporaryVideo = await video.path();
            if (temporaryVideo !== videoPath) await rename(temporaryVideo, videoPath);
        } catch (videoError) {
            if (!caught) caught = videoError instanceof Error ? videoError : new Error(String(videoError));
        }
        await browser.close().catch(() => undefined);
    }
    if (caught) throw caught;
    return result;
}

function baseProvenance(candidate = null) {
    return {
        runId: RUN_ID,
        startedAt: new Date(RUN_STARTED_AT).toISOString(),
        cwd: process.cwd(),
        repositoryRoot: paths.root,
        targetUrl: TARGET_URL,
        fixture: false,
        browser: 'Playwright Firefox',
        userAgent: FIREFOX_UA,
        viewport: VIEWPORT,
        nodeVersion: process.version,
        pageLimit: PAGE_LIMIT,
        modes: MODES,
        readerRasterPollMs: READER_RASTER_POLL_MS,
        stabilityHoldMs: STABILITY_HOLD_MS,
        ocrReadyTimeoutMs: OCR_READY_TIMEOUT_MS,
        geometryTolerancePx: GEOMETRY_TOLERANCE_PX,
        candidate: candidate?.provenance || {
            path: SCRIPT_PATH,
            cssPath: CSS_PATH,
            buildCommand: BUILD_COMMAND,
        },
    };
}

async function writeSummary(candidate, results, failures) {
    const summaryPath = path.join(ARTIFACT_DIR, 'summary.json');
    await writeFile(summaryPath, JSON.stringify({
        generatedAt: new Date().toISOString(),
        provenance: baseProvenance(candidate),
        results,
        failures,
    }, null, 2));
    return summaryPath;
}

async function main() {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    const results = [];
    const failures = [];
    assert(MODES.length > 0 && MODES.every(mode => mode === 'paged' || mode === 'continuous'),
        'YOMU_BOOKWALKER_LIVE_MODES must contain only paged and/or continuous.', { modes: MODES });

    let candidate;
    try {
        candidate = loadCandidate();
    } catch (error) {
        if (error instanceof Error && error.candidateProvenance) {
            candidate = { provenance: error.candidateProvenance };
        }
        failures.push({
            mode: 'candidate',
            error: error instanceof Error ? error.stack : String(error),
        });
        const summaryPath = await writeSummary(candidate, results, failures);
        console.error('FAIL live Firefox/candidate:', error);
        console.error(`Failure provenance: ${summaryPath}`);
        process.exitCode = 1;
        return;
    }

    for (const mode of MODES) {
        try {
            const result = await runMode(mode, candidate);
            results.push(result);
            console.log(`PASS live Firefox/${mode}: ${result.exactPages.map(page => `${page.counter} [${page.contentKey}]`).join(', ')}`);
        } catch (error) {
            const failure = {
                mode,
                error: error instanceof Error ? error.stack : String(error),
                evidence: error instanceof Error ? error.evidence : undefined,
            };
            failures.push(failure);
            console.error(`FAIL live Firefox/${mode}:`, error);
        }
    }
    const summaryPath = await writeSummary(candidate, results, failures);
    if (failures.length) {
        process.exitCode = 1;
        console.error(`Live Firefox failures recorded in ${summaryPath}`);
    } else {
        console.log(`ALL PASS. Live Firefox evidence: ${ARTIFACT_DIR}`);
    }
}

await main();
