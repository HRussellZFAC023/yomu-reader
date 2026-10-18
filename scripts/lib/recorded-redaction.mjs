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

const SKIPPED_ELEMENTS = new Set(['script', 'noscript']);
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
const textContentOf = node => (node.childNodes ?? []).map(child => child.value ?? '').join('');

// Properties whose string values the browser paints as text (generated
// content, list markers, quotes, an ellipsis), and custom properties, which
// can carry a string into content through var().
const PAINTED_STRING_PROPERTY = /^(?:content|quotes|list-style(?:-type)?|text-overflow|text-emphasis(?:-style)?|(?:-webkit-)?hyphenate-character|symbols|additive-symbols|prefix|suffix|negative|pad|--.+)$/iu;
const CSS_STRING_SOURCE = String.raw`"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'`;
const CSS_COMMENT_OR_STRING = new RegExp(`(${CSS_STRING_SOURCE})|/\\*[\\s\\S]*?\\*/`, 'gu');
// A name may be written with CSS escapes (\63 ontent and c\ontent are content)
// and, like any CSS identifier, with non-ASCII letters (--見出し).
const CSS_IDENTIFIER_SOURCE = String.raw`(?:[-\w\u{80}-\u{10FFFF}]|\\[0-9a-f]{1,6}[ \t\n\r\f]?|\\[^\n\r\f0-9a-f])+`;
const CSS_DECLARATION = new RegExp(`(${CSS_IDENTIFIER_SOURCE})\\s*:((?:${CSS_STRING_SOURCE}|[^;{}"'])*)`, 'giu');
// A string, or a custom property a value reads through var().
const CSS_VALUE_STRING = new RegExp(`(${CSS_STRING_SOURCE})|var\\(\\s*(--${CSS_IDENTIFIER_SOURCE})`, 'giu');
const CSS_ESCAPE = /\\(?:([0-9a-f]{1,6})[ \t\n\r\f]?|(\r\n|[\n\r\f])|([\s\S]))/giu;

function cssUnescape(text) {
    return text.replace(CSS_ESCAPE, (_, hex, newline, character) => {
        if (newline) return '';
        if (!hex) return character;
        const codePoint = Number.parseInt(hex, 16);
        return codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '\ufffd';
    });
}

// Every declaration of a stylesheet: { property, value }, the name unescaped
// (lower-cased unless it is a custom property, whose name is case-sensitive).
function cssDeclarations(cssText) {
    const css = String(cssText ?? '').replace(CSS_COMMENT_OR_STRING, (match, string) => string ?? ' ');
    return [...css.matchAll(CSS_DECLARATION)].map(match => {
        const property = cssUnescape(match[1]).trim();
        return { property: property.startsWith('--') ? property : property.toLowerCase(), value: match[2] };
    });
}

/**
 * The strings each custom property holds, by name, over all the stylesheets
 * given: a sheet can set --title that another sheet or a style attribute
 * paints through content: var(--title).
 */
function cssCustomProperties(cssTexts) {
    const custom = new Map();
    for (const { property, value } of cssTexts.flatMap(cssDeclarations)) {
        if (property.startsWith('--')) custom.set(property, [...(custom.get(property) ?? []), ...[...value.matchAll(CSS_VALUE_STRING)].filter(match => match[1]).map(match => cssUnescape(match[1].slice(1, -1)))]);
    }
    return custom;
}

/**
 * The strings a stylesheet (or a style attribute) paints, by declaration:
 * [{ property, strings }], escapes decoded in names and strings alike (the
 * browser reads \63 ontent as content), and var(--name) read as the strings
 * the custom property holds (in this sheet, or in customProperties when
 * given). content: "東" "京" paints 東京, so a content value's strings are
 * also read joined.
 */
function cssPaintedStrings(cssText, customProperties = cssCustomProperties([cssText])) {
    return cssDeclarations(cssText)
        .filter(({ property }) => PAINTED_STRING_PROPERTY.test(property))
        .map(({ property, value }) => ({
            property,
            strings: [...value.matchAll(CSS_VALUE_STRING)].flatMap(match => (match[1] ? [cssUnescape(match[1].slice(1, -1))] : (property.startsWith('--') ? [] : customProperties.get(cssUnescape(match[2])) ?? []))),
        }))
        .filter(declaration => declaration.strings.length);
}

/**
 * Text runs a stylesheet paints through content, quotes, list markers and
 * custom properties, when they read as copy (isHiddenCopy). One-word ASCII
 * strings are a site's own vocabulary, as in an attribute: YouTube's player
 * sheet paints "4K" and "HDR" badges, which a page's badge text also says.
 */
export function textRunsFromCss(cssText) {
    return runsOf(cssPaintedStrings(cssText).flatMap(({ strings }) => (strings.length > 1 ? [...strings, strings.join('')] : strings)).filter(isHiddenCopy));
}

/**
 * Generated text that reads as copy (non-ASCII letters or several words) in
 * a stylesheet's own content declarations. A site's stylesheets are kept as
 * served, and the redactor replaces document text, not CSS, so a redacted
 * recording must hold none: today's sites paint only icons and punctuation
 * there (•, ・, ｜) and one-word ASCII labels (NEW).
 */
export function generatedCopyInCss(cssText, customProperties) {
    return cssPaintedStrings(cssText, customProperties)
        .filter(({ property }) => !property.startsWith('--'))
        .map(({ strings }) => strings.join(''))
        .filter(isHiddenCopy)
        .map(normalizeTextRun);
}

function htmlNodeRuns(node) {
    if (node.nodeName === '#text') return runsOf([node.value]);
    if (node.nodeName === 'style') return textRunsFromCss(textContentOf(node));
    if (SKIPPED_ELEMENTS.has(node.nodeName)) return [];
    const attributes = node.attrs ?? [];
    const isStyle = attribute => attribute.name === 'style';
    const copy = attributes.filter(attribute => !isStyle(attribute) && (VISIBLE_ATTRIBUTES.includes(attribute.name) || isHiddenCopy(attribute.value)));
    const styles = attributes.filter(isStyle).flatMap(attribute => textRunsFromCss(attribute.value));
    return [...runsOf(copy.map(attribute => attribute.value)), ...styles, ...childrenOf(node).flatMap(htmlNodeRuns)];
}

/**
 * Text runs of an HTML document: text nodes (declarative shadow DOM included),
 * visible attributes, every other attribute value that reads as copy, and the
 * text its <style> elements and style attributes paint (generated content). A
 * site keeps copy in data-* attributes (a headline in data-realizer-title, a
 * campaign in data-gtm-label), so the check reads all of them. One-word ASCII
 * values ("true", an id, a datetime) are vocabulary, not copy.
 */
export function textRunsFromHtml(html) {
    return htmlNodeRuns(parse(html, { scriptingEnabled: false }));
}

function htmlStyleSheets(node) {
    const own = node.nodeName === 'style' ? [textContentOf(node)] : (node.attrs ?? []).filter(attribute => attribute.name === 'style').map(attribute => attribute.value);
    return [...own, ...childrenOf(node).flatMap(htmlStyleSheets)];
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

const SPLIT_TEXT = text => runsOf(text.split(/[\n<>{}]/u));
const READERS = {
    html: textRunsFromHtml,
    json: jsonFileRuns,
    css: textRunsFromCss,
    svg: text => [...SPLIT_TEXT(text), ...textRunsFromCss(text)],
    text: SPLIT_TEXT,
};
const FILE_KINDS = [[/\.html?$/iu, 'html'], [/\.har$/iu, 'har'], [/\.(json|json3)$/iu, 'json'], [/\.css$/iu, 'css'], [/\.svg$/iu, 'svg'], [/\.(xml|txt|vtt)$/iu, 'text']];
const MIME_KINDS = [[/html/iu, 'html'], [/css/iu, 'css'], [/svg/iu, 'svg'], [/json/iu, 'json'], [/^text\/|xml|vtt/iu, 'text']];

// A HAR's own fields are read as JSON; a body kept inline (content.text rather
// than a committed _file) is read as what its MIME type says it is.
function harRuns(text) {
    const runs = jsonFileRuns(text);
    try {
        for (const entry of JSON.parse(text)?.log?.entries ?? []) {
            const content = entry.response?.content ?? {};
            const kind = MIME_KINDS.find(([pattern]) => pattern.test(content.mimeType ?? ''))?.[1];
            if (!kind || typeof content.text !== 'string') continue;
            const body = content.encoding === 'base64' ? Buffer.from(content.text, 'base64').toString('utf8') : content.text;
            runs.push(...READERS[kind](body));
        }
    } catch {
        // not JSON: jsonFileRuns already read it as text
    }
    return runs;
}

function textRunsFromFile(file) {
    const kind = FILE_KINDS.find(([pattern]) => pattern.test(file))?.[1];
    if (!kind) return [];
    const text = readFileSync(file, 'utf8');
    return kind === 'har' ? harRuns(text) : READERS[kind](text);
}

function committedFiles(recordingDir) {
    return filesUnder(recordingDir).filter(file => !HARNESS_FILES.has(path.relative(recordingDir, file)));
}

/**
 * Committed files of a redacted recording whose text runs match the
 * recorder's hash list of the original page: as text, in an attribute, or
 * painted by a stylesheet (generated content). Empty means clean.
 */
export function findRedactionLeaks(recordingDir, hashList) {
    const hashes = new Set(hashList.hashes);
    return committedFiles(recordingDir).flatMap(file => [...new Set(textRunsFromFile(file))]
        .filter(run => hashes.has(hashTextRun(run)))
        .map(run => ({ file: path.relative(recordingDir, file), hash: hashTextRun(run), length: [...run].length })));
}

/**
 * Stylesheets of a redacted recording (committed .css files, <style> elements
 * and style attributes) that paint copy through content. Empty means clean.
 */
export function findGeneratedCopy(recordingDir) {
    const sheets = file => {
        if (/\.css$/iu.test(file)) return [readFileSync(file, 'utf8')];
        return /\.html?$/iu.test(file) ? htmlStyleSheets(parse(readFileSync(file, 'utf8'), { scriptingEnabled: false })) : [];
    };
    const files = committedFiles(recordingDir).map(file => ({ file, sheets: sheets(file) }));
    const customProperties = cssCustomProperties(files.flatMap(({ sheets: own }) => own));
    return files.flatMap(({ file, sheets: own }) => own.flatMap(sheet => generatedCopyInCss(sheet, customProperties))
        .map(run => ({ file: path.relative(recordingDir, file), hash: hashTextRun(run), length: [...run].length })));
}

function filesUnder(dir) {
    return readdirSync(dir).flatMap(name => {
        const file = path.join(dir, name);
        return statSync(file).isDirectory() ? filesUnder(file) : [file];
    });
}
