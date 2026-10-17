// Finds :has() selectors that make Chromium restyle a host page wholesale.
//
// A :has() anchor is an element Chromium must re-check whenever anything changes
// under it. Anchored on <body> or <html>, every host DOM insertion (YouTube's 4 Hz
// time text, an ad slot, a feed row) re-checks it. And when the :has() is followed
// by a combinator, that re-check invalidates descendants of the anchor through
// the :has() invalidation set every such rule in the document shares, so one
// `.x:has(.y) .z > *` rule turns it into a recalc of every element on the page.
// Measured on the 2.1.6 sheet: 1,250 host elements, 37 recalcs a second, about
// 41 ms/s of style work during plain YouTube playback.
//
// So in the sheet Yomu injects into pages, a :has() may not be anchored on
// html/body/:root/* and may not be followed by a combinator. A selector that
// needs one anyway names its reason in a comment on the :has( line or the line
// directly above it:  /* has-invalidation-allow: <why the anchor stays small> */
//
// The root test also looks inside :is()/:where() (`:is(body):has(.x)`), but not
// inside :has()/:not(), whose arguments are not the anchor. A :has() in a nested
// style rule (CSS nesting), or under a parent rule that has one, is reported as is:
// this reader does not resolve `&`, so such a rule must be flattened or allowed.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ALLOW_PATTERN = /has-invalidation-allow:\s*[^\s*]/;
const ROOT_TYPE = /(?:^|[(,\s])(?:html|body|:root|\*)(?![-\w])/i;
const HAS = /:has\(/i;

/**
 * @param {string} css
 * @returns {{ line: number, selector: string, reason: string, allowed: boolean }[]}
 */
export function findHasInvalidationRisks(css) {
    const { clean, allowLines } = stripComments(css);
    const lineStarts = [0];
    for (let index = 0; index < clean.length; index++) if (clean[index] === '\n') lineStarts.push(index + 1);
    const lineAt = offset => {
        let low = 0;
        let high = lineStarts.length - 1;
        while (low < high) {
            const mid = (low + high + 1) >> 1;
            if (lineStarts[mid] <= offset) low = mid;
            else high = mid - 1;
        }
        return low + 1;
    };
    const findings = [];
    for (const { text, offset, parentHas, nested } of stylePreludes(clean)) {
        if (nested && (parentHas || HAS.test(text))) {
            const at = text.search(HAS);
            const line = lineAt(offset + (at >= 0 ? at : text.search(/\S/)));
            findings.push({
                line,
                selector: text.replace(/\s+/g, ' ').trim(),
                reason: 'nested in a style rule that this check cannot resolve',
                allowed: allowLines.has(line) || allowLines.has(line - 1),
            });
            continue;
        }
        for (const selector of splitTopLevel(text, ',', offset)) {
            const compounds = splitCompounds(selector.text, selector.offset);
            compounds.forEach((compound, index) => {
                const hasIndex = compound.text.search(/:has\(/i);
                if (hasIndex < 0) return;
                const reasons = [];
                if (/^:has\(/i.test(compound.text) || ROOT_TYPE.test(withoutArguments(compound.text, /:(?:has|not)\($/i))) {
                    reasons.push('anchored on the document root');
                }
                if (index < compounds.length - 1) reasons.push('followed by a combinator');
                if (!reasons.length) return;
                const line = lineAt(compound.offset + hasIndex);
                findings.push({
                    line,
                    selector: selector.text.replace(/\s+/g, ' ').trim(),
                    reason: reasons.join(' and '),
                    allowed: allowLines.has(line) || allowLines.has(line - 1),
                });
            });
        }
    }
    return findings;
}

/** The files `scripts/build-reader-css.mjs` bundles into dist/yomu.css, in order. */
export function readerStylesheetFiles(entry) {
    const files = [];
    const visit = file => {
        if (files.includes(file)) return;
        files.push(file);
        for (const [, imported] of readFileSync(file, 'utf8').matchAll(/@import\s+['"]([^'"]+)['"]\s*;/g)) {
            visit(path.resolve(path.dirname(file), imported));
        }
    };
    visit(path.resolve(entry));
    return files;
}

// Comments become spaces (newlines kept, so offsets and lines still line up);
// strings are kept but skipped, so a brace or comment marker inside one is inert.
function stripComments(css) {
    let clean = '';
    const allowLines = new Set();
    let line = 1;
    for (let index = 0; index < css.length; index++) {
        const char = css[index];
        if (char === '/' && css[index + 1] === '*') {
            const end = css.indexOf('*/', index + 2);
            const close = end < 0 ? css.length : end + 2;
            const comment = css.slice(index, close);
            const startLine = line;
            for (const ch of comment) {
                if (ch === '\n') line++;
                clean += ch === '\n' ? '\n' : ' ';
            }
            if (ALLOW_PATTERN.test(comment)) for (let at = startLine; at <= line; at++) allowLines.add(at);
            index = close - 1;
            continue;
        }
        if (char === '"' || char === "'") {
            let end = index + 1;
            while (end < css.length && css[end] !== char) end += css[end] === '\\' ? 2 : 1;
            const literal = css.slice(index, end + 1);
            for (const ch of literal) if (ch === '\n') line++;
            clean += literal;
            index = end;
            continue;
        }
        if (char === '\n') line++;
        clean += char;
    }
    return { clean, allowLines };
}

// `:not(body).x:has(.y)` -> `:not().x:has()` for the pseudo-classes `pattern` names.
function withoutArguments(text, pattern) {
    let out = '';
    for (let index = 0; index < text.length; index++) {
        out += text[index];
        if (text[index] !== '(' || !pattern.test(out)) continue;
        let depth = 1;
        while (depth && ++index < text.length) depth += text[index] === '(' ? 1 : text[index] === ')' ? -1 : 0;
        out += ')';
    }
    return out;
}

// Every style-rule prelude (the selector list before `{`), at any nesting depth,
// with whether it sits inside another style rule (`nested`) and whether one of
// those parent rules has a :has() (`parentHas`). At-rule preludes (@media,
// @container, @supports, ...) are skipped; their blocks are still walked.
function* stylePreludes(clean) {
    const blocks = [];
    let start = 0;
    let quote = '';
    for (let index = 0; index < clean.length; index++) {
        const char = clean[index];
        if (quote) {
            if (char === '\\') index++;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === '{') {
            const text = clean.slice(start, index);
            const lead = text.search(/\S/);
            const style = lead >= 0 && text[lead] !== '@';
            const parents = blocks.filter(block => block.style);
            if (style) yield { text, offset: start, nested: parents.length > 0, parentHas: parents.some(block => block.has) };
            blocks.push({ style, has: style && HAS.test(text) });
            start = index + 1;
        } else if (char === '}' || char === ';') {
            if (char === '}') blocks.pop();
            start = index + 1;
        }
    }
}

function splitTopLevel(text, separator, offset) {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let index = 0; index <= text.length; index++) {
        const char = text[index];
        if (char === '(' || char === '[') depth++;
        else if (char === ')' || char === ']') depth--;
        if (index === text.length || (char === separator && depth === 0)) {
            parts.push({ text: text.slice(start, index), offset: offset + start });
            start = index + 1;
        }
    }
    return parts;
}

// One complex selector -> its compounds, split at top-level combinators
// (whitespace, >, +, ~).
function splitCompounds(text, offset) {
    const compounds = [];
    let depth = 0;
    let start = -1;
    for (let index = 0; index <= text.length; index++) {
        const char = text[index];
        const boundary = index === text.length || (depth === 0 && /[\s>+~]/.test(char));
        if (boundary) {
            if (start >= 0) compounds.push({ text: text.slice(start, index), offset: offset + start });
            start = -1;
            continue;
        }
        if (char === '(' || char === '[') depth++;
        else if (char === ')' || char === ']') depth--;
        if (start < 0) start = index;
    }
    return compounds;
}
