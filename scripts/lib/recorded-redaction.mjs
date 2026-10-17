// The check half of a Recorded Page redaction. The recorder keeps a hash of
// every original text run of a copyrighted page (never the text), and
// findRedactionLeaks fails when a committed file still holds one of them.
// text-redactor.mjs does the replacing.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'parse5';

const REDACTION_HASH_LENGTH = 20;
const MIN_RUN_LENGTH = 2;
/** Attributes whose values a reader sees or hears. */
export const VISIBLE_ATTRIBUTES = Object.freeze(['alt', 'title', 'aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'placeholder', 'value', 'label']);
const SKIPPED_ELEMENTS = new Set(['script', 'style', 'noscript']);
// Written by the recorder from its own target list, never from the page.
const HARNESS_FILES = new Set(['manifest.json', 'geometry.json', 'redaction-hashes.json']);
// A run that is only a web address is kept by the redactor.
const URL_ONLY = /^(?:https?:\/\/|www\.)\S+$/u;

/** Collapses whitespace and NFC-normalises; null when the run is too short or has no letter in it. */
export function normalizeTextRun(text) {
    const run = String(text ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim();
    return [...run].length >= MIN_RUN_LENGTH && /\p{L}/u.test(run) ? run : null;
}

export function hashTextRun(run) {
    return createHash('sha256').update(run, 'utf8').digest('hex').slice(0, REDACTION_HASH_LENGTH);
}

export function redactionHashList(originalRuns) {
    return {
        algorithm: `sha256, first ${REDACTION_HASH_LENGTH} hex digits`,
        normalization: `NFC, whitespace collapsed, trimmed; runs of at least ${MIN_RUN_LENGTH} characters with a letter`,
        hashes: [...new Set(originalRuns.map(normalizeTextRun).filter(run => run && !URL_ONLY.test(run)).map(hashTextRun))].sort(),
    };
}

const runsOf = values => values.map(normalizeTextRun).filter(Boolean);
const isVisibleAttribute = (node, attribute) => VISIBLE_ATTRIBUTES.includes(attribute.name) || (node.nodeName === 'meta' && attribute.name === 'content');
const childrenOf = node => [...(node.childNodes ?? []), ...(node.content ? [node.content] : [])];

function htmlNodeRuns(node) {
    if (node.nodeName === '#text') return runsOf([node.value]);
    if (SKIPPED_ELEMENTS.has(node.nodeName)) return [];
    const attributes = (node.attrs ?? []).filter(attribute => isVisibleAttribute(node, attribute)).map(attribute => attribute.value);
    return [...runsOf(attributes), ...childrenOf(node).flatMap(htmlNodeRuns)];
}

/** Text runs of an HTML document: text nodes (declarative shadow DOM included) and visible attributes. */
export function textRunsFromHtml(html) {
    return htmlNodeRuns(parse(html, { scriptingEnabled: false }));
}

// JSON fields that carry words a reader sees (caption segments, video title and
// author, labels); ids, language codes and URLs are not text.
const JSON_TEXT_KEYS = new Set(['utf8', 'title', 'author', 'shortDescription', 'simpleText', 'text', 'label']);

function jsonStrings(item) {
    if (!item || typeof item !== 'object') return [];
    return Object.entries(item).flatMap(([key, value]) => (typeof value === 'string' ? (JSON_TEXT_KEYS.has(key) ? [value] : []) : jsonStrings(value)));
}

/** json3 caption tracks split a line into word segments; the line is the run a reader sees. */
function captionLines(json3) {
    return (json3?.events ?? []).map(event => (event.segs ?? []).map(seg => seg.utf8 ?? '').join(''));
}

function jsonFileRuns(text) {
    try {
        const value = JSON.parse(text);
        return runsOf([...jsonStrings(value), ...captionLines(value)]);
    } catch {
        return runsOf(text.split(/["\n]/u));
    }
}

const FILE_READERS = [
    [/\.html?$/iu, textRunsFromHtml],
    [/\.(json|json3|har)$/iu, jsonFileRuns],
    [/\.(css|svg|xml|txt|vtt)$/iu, text => runsOf(text.split(/[\n<>{}]/u))],
];

function textRunsFromFile(file) {
    const reader = FILE_READERS.find(([pattern]) => pattern.test(file))?.[1];
    return reader ? reader(readFileSync(file, 'utf8')) : [];
}

/**
 * Committed files of a redacted recording whose text runs match the
 * recorder's hash list of the original page. Empty means clean.
 */
export function findRedactionLeaks(recordingDir, hashList) {
    const hashes = new Set(hashList.hashes);
    const files = filesUnder(recordingDir).filter(file => !HARNESS_FILES.has(path.relative(recordingDir, file)));
    return files.flatMap(file => textRunsFromFile(file)
        .filter(run => hashes.has(hashTextRun(run)))
        .map(run => ({ file: path.relative(recordingDir, file), hash: hashTextRun(run), length: [...run].length })));
}

function filesUnder(dir) {
    return readdirSync(dir).flatMap(name => {
        const file = path.join(dir, name);
        return statSync(file).isDirectory() ? filesUnder(file) : [file];
    });
}
