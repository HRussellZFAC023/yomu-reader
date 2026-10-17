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
/**
 * Attributes the browser lays out, links or styles by, kept verbatim. Every
 * other attribute holding a letter is redacted unless a stylesheet selects on
 * its value (page-freeze.mjs collectTextSlotsInPage).
 */
export const STRUCTURAL_ATTRIBUTES = Object.freeze([
    // identity, links and references
    'class', 'id', 'style', 'href', 'src', 'srcset', 'sizes', 'rel', 'type', 'name', 'for', 'form', 'list', 'headers', 'usemap', 'action', 'formaction', 'method', 'enctype', 'target', 'download', 'ping', 'cite', 'poster', 'xmlns', 'xmlns:xlink', 'xlink:href', 'popovertarget', 'anchor',
    'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant', 'aria-details', 'aria-errormessage', 'aria-flowto',
    // document, language and loading
    'lang', 'xml:lang', 'dir', 'translate', 'charset', 'http-equiv', 'media', 'crossorigin', 'integrity', 'referrerpolicy', 'loading', 'decoding', 'fetchpriority', 'as', 'blocking', 'property', 'itemprop', 'itemtype', 'itemscope', 'datetime',
    // custom elements and shadow DOM
    'role', 'slot', 'part', 'exportparts', 'is', 'shadowrootmode', 'shadowrootdelegatesfocus', 'shadowrootclonable', 'shadowrootserializable',
    // form and element state
    'hidden', 'popover', 'inert', 'open', 'contenteditable', 'draggable', 'spellcheck', 'autocapitalize', 'autocomplete', 'inputmode', 'enterkeyhint', 'tabindex', 'accesskey', 'autofocus', 'disabled', 'readonly', 'required', 'checked', 'selected', 'multiple', 'controls', 'muted', 'loop', 'playsinline', 'preload', 'accept', 'pattern', 'min', 'max', 'step', 'minlength', 'maxlength',
    // legacy presentational attributes, still honoured by layout
    'width', 'height', 'align', 'valign', 'bgcolor', 'background', 'color', 'face', 'size', 'border', 'cellpadding', 'cellspacing', 'nowrap', 'clear', 'frameborder', 'scrolling', 'shape', 'coords', 'wrap', 'cols', 'rows', 'colspan', 'rowspan', 'span', 'scope', 'start', 'reversed', 'hspace', 'vspace', 'marginwidth', 'marginheight', 'noshade', 'compact', 'text', 'link', 'vlink', 'alink',
    // inline SVG (artwork inside is emptied; the outer element keeps its box)
    'viewbox', 'preserveaspectratio', 'focusable', 'version', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'clip-rule', 'transform', 'opacity', 'x', 'y', 'overflow', 'display', 'visibility',
]);
/**
 * ARIA states and properties whose values are keywords ("true", "page",
 * "polite"), not copy. Their keyword values stay: a product or a page style
 * reads [aria-disabled="true"].
 */
export const ARIA_STATE_ATTRIBUTES = Object.freeze([
    'aria-atomic', 'aria-autocomplete', 'aria-busy', 'aria-checked', 'aria-current', 'aria-disabled', 'aria-dropeffect', 'aria-expanded', 'aria-grabbed', 'aria-haspopup', 'aria-hidden', 'aria-invalid',
    'aria-live', 'aria-modal', 'aria-multiline', 'aria-multiselectable', 'aria-orientation', 'aria-pressed', 'aria-readonly', 'aria-relevant', 'aria-required', 'aria-selected', 'aria-sort',
]);

// [name op= "value" i]: an attribute selector with a value.
const ATTRIBUTE_SELECTOR = /\[\s*(?:[\w*-]*\|)?([\w:-]+)\s*([~|^$*]?)=\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^\s\]]+))\s*([is])?\s*\]/giu;

/**
 * The attribute values the stylesheets select on, by attribute name:
 * { 'data-state': [{ op: '', value: 'open', insensitive: false }] }. The
 * recorder keeps a value one of these matches (page-freeze.mjs
 * collectTextSlotsInPage), since redacting it would restyle the page.
 */
export function attributeSelectorIndex(cssTexts) {
    const index = {};
    for (const match of cssTexts.join('\n').matchAll(ATTRIBUTE_SELECTOR)) {
        const value = match.slice(3, 6).find(part => part !== undefined).replace(/\\(.)/gu, '$1');
        (index[match[1].toLowerCase()] ??= []).push({ op: match[2], value, insensitive: String(match[6]).toLowerCase() === 'i' });
    }
    return index;
}

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

/**
 * A redacted hidden attribute's original goes on the hash list when it reads
 * as copy: non-ASCII letters or several words. A one-word ASCII token
 * ("true", "ranking_top") is redacted too but not listed, so a class or role
 * that happens to spell it does not count as a leak.
 */
export function isHiddenCopy(text) {
    const run = normalizeTextRun(text);
    return Boolean(run) && (/[^\x00-\x7f]/u.test(run) || run.includes(' '));
}

export function redactionHashList(originalRuns) {
    return {
        algorithm: `sha256, first ${REDACTION_HASH_LENGTH} hex digits`,
        normalization: `NFC, whitespace collapsed, trimmed; runs of at least ${MIN_RUN_LENGTH} characters with a letter`,
        hashes: [...new Set(originalRuns.map(normalizeTextRun).filter(run => run && !URL_ONLY.test(run)).map(hashTextRun))].sort(),
    };
}

const runsOf = values => values.map(normalizeTextRun).filter(Boolean);
const childrenOf = node => [...(node.childNodes ?? []), ...(node.content ? [node.content] : [])];

function htmlNodeRuns(node) {
    if (node.nodeName === '#text') return runsOf([node.value]);
    if (SKIPPED_ELEMENTS.has(node.nodeName)) return [];
    const attributes = (node.attrs ?? []).filter(attribute => VISIBLE_ATTRIBUTES.includes(attribute.name) || isHiddenCopy(attribute.value));
    return [...runsOf(attributes.map(attribute => attribute.value)), ...childrenOf(node).flatMap(htmlNodeRuns)];
}

/**
 * Text runs of an HTML document: text nodes (declarative shadow DOM included),
 * visible attributes and every other attribute value that reads as copy. A
 * site keeps copy in data-* attributes (a headline in data-realizer-title, a
 * campaign in data-gtm-label), so the check reads all of them. One-word ASCII
 * values ("true", an id, a datetime) are vocabulary, not copy.
 */
export function textRunsFromHtml(html) {
    return htmlNodeRuns(parse(html, { scriptingEnabled: false }));
}

const SITE_CODE_ELEMENTS = new Set(['script', 'noscript']);

function siteCodeOf(node) {
    const own = [
        ...(SITE_CODE_ELEMENTS.has(node.nodeName) ? [`<${node.nodeName}>`] : []),
        ...(node.attrs ?? []).filter(attribute => /^on/iu.test(attribute.name)).map(attribute => `${attribute.name}=`),
    ];
    return [...own, ...childrenOf(node).flatMap(siteCodeOf)];
}

/**
 * Site code a frozen document must not carry: <script>, <noscript> (its text
 * is neither redacted nor checked) and inline event handlers, <template>
 * contents included. One entry per occurrence; empty means clean.
 */
export function siteCodeInHtml(html) {
    return siteCodeOf(parse(html, { scriptingEnabled: false }));
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
