// Writing a Recorded Page folder from a live capture (record-live-page.mjs):
// page.html, network.har with its bodies, host files, the redaction hash list,
// geometry.json and manifest.json. A redacted copy swaps pictures for blank
// ones of the same size and keeps only open-licensed fonts.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { youtubeHostFiles } from './record-youtube-host.mjs';
import { BLANK_PREFIX_PATH } from './record-live-page.mjs';
import { createHarWriter, mimeTypeOf } from './recorded-har.mjs';
import { blankClips, blankPng, blankSvg, imageSize } from './recorded-media.mjs';
import { RECORDINGS_ROOT } from './recorded-page.mjs';

// Open-licensed Google Fonts families (Roboto and Open Sans: Apache; Noto: OFL). Brand fonts are dropped.
const OPEN_FONT_PATHS = /^https:\/\/fonts\.gstatic\.com\/s\/(roboto|opensans|notosans[a-z]*|notoserif[a-z]*)\//u;
const json = (value, indent) => `${JSON.stringify(value, null, indent)}\n`;

export function readJson(file) {
    return JSON.parse(readFileSync(file, 'utf8'));
}

export function writeJson(file, value, indent = 1) {
    writeFileSync(file, json(value, indent));
}

/** redacted: write the redacted copy (the committed one) or the unredacted freeze (fidelity baseline only). */
export function writeRecording(dir, target, live, { redacted }) {
    mkdirSync(dir, { recursive: true });
    if (redacted) writeRedactedCopy(dir, target, live);
    else writeUnredactedCopy(dir, target, live);
    writeJson(path.join(dir, 'geometry.json'), { keys: live.keys, live: live.liveSignature, replay: {} });
}

function writeRedactedCopy(dir, target, live) {
    const redaction = live.redacted;
    writeFileSync(path.join(dir, 'page.html'), redaction.html);
    recordingHar(target, live, redaction).write(dir, 'network.har');
    writeHostFiles(dir, target, redaction.hostFiles);
    writeJson(path.join(dir, 'redaction-hashes.json'), redaction.hashList);
    writeJson(path.join(dir, 'manifest.json'), recordingManifest(target, live, { redacted: true, hostFiles: redaction.hostFiles }), 2);
}

function writeUnredactedCopy(dir, target, live) {
    const hostFiles = live.host ? youtubeHostFiles(live.host, { redact: text => text, captionSeconds: target.captionSeconds }) : null;
    writeFileSync(path.join(dir, 'page.html'), live.originalHtml);
    recordingHar(target, live, null).write(dir, 'network.har');
    writeHostFiles(dir, target, hostFiles);
    writeJson(path.join(dir, 'manifest.json'), recordingManifest(target, live, { redacted: false, hostFiles }), 2);
}

function recordingHar(target, live, redaction) {
    const har = createHarWriter();
    for (const [url, response] of live.responses) {
        const kept = keptResource(target, url, response, redaction);
        if (kept) har.add({ url, contentType: kept.contentType, body: kept.body });
    }
    if (redaction) addBlankPictures(har, new URL(target.url).origin, redaction.blankSizes);
    return har;
}

function addBlankPictures(har, origin, sizes) {
    for (const size of sizes) {
        const [width, height] = size.split('x').map(Number);
        har.add({ url: `${origin}${BLANK_PREFIX_PATH}${size}.png`, contentType: 'image/png', body: blankPng(width, height) });
    }
}

function keptResource(target, url, response, redaction) {
    if (target.webFonts === false && response.resourceType === 'font') return null;
    return redaction ? redactedResource(url, response) : response;
}

const REDACTED_RESOURCE = {
    stylesheet: (url, response) => response,
    font: (url, response) => (OPEN_FONT_PATHS.test(url) ? response : null),
    image: (url, response) => {
        const size = imageSize(response.body) ?? [1, 1];
        return mimeTypeOf(response.contentType) === 'image/svg+xml'
            ? { contentType: 'image/svg+xml', body: blankSvg(...size) }
            : { contentType: 'image/png', body: blankPng(...size) };
    },
};

function redactedResource(url, response) {
    return REDACTED_RESOURCE[response.resourceType](url, response);
}

function writeHostFiles(dir, target, hostFiles) {
    if (!hostFiles) return;
    for (const [file, value] of Object.entries(hostFiles.files)) {
        mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        writeFileSync(path.join(dir, file), json(value));
    }
    blankClips(target.captionSeconds, path.join(dir, 'host', 'clip'));
}

function recordingManifest(target, live, { redacted, hostFiles }) {
    return {
        slug: target.slug,
        url: target.url,
        content: redacted ? 'redacted' : target.content,
        licence: target.licence,
        attribution: target.attribution,
        ...(redacted ? { redactionHashes: 'redaction-hashes.json' } : { title: live.title }),
        recordedAt: new Date().toISOString(),
        recorder: { engine: 'chromium', viewport: target.viewport, platform: process.platform, locale: 'ja-JP' },
        document: 'page.html',
        har: 'network.har',
        geometry: 'geometry.json',
        ...(hostFiles ? { host: hostFiles.manifestHost } : {}),
    };
}

/** Keeps the HAR entries some engine's replay asked for, and only the bodies they name. */
export function keepUsedResources(dir, usedUrls) {
    const harPath = path.join(dir, 'network.har');
    const har = readJson(harPath);
    har.log.entries = har.log.entries.filter(entry => usedUrls.has(entry.request.url));
    writeJson(harPath, har);
    const named = new Set(har.log.entries.map(entry => entry.response.content._file));
    const resources = path.join(dir, 'resources');
    const unnamed = existsSync(resources) ? readdirSync(resources).filter(name => !named.has(`resources/${name}`)) : [];
    for (const name of unnamed) rmSync(path.join(resources, name));
}

export function publishRecording(staging, slug) {
    const target = path.join(RECORDINGS_ROOT, slug);
    if (existsSync(path.join(target, 'product-traffic.har'))) console.warn(`[record-pages]   ${slug}: product traffic must be re-recorded against the new page (--product-traffic=<tag>).`);
    rmSync(target, { recursive: true, force: true });
    mkdirSync(RECORDINGS_ROOT, { recursive: true });
    try {
        renameSync(staging, target);
    } catch {
        // tmpdir and the repository can be on different devices.
        cpSync(staging, target, { recursive: true });
    }
    console.log(`[record-pages]   wrote ${path.relative(process.cwd(), target)}`);
}
