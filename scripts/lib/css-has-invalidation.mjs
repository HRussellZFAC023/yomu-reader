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
// A combinator inside :is()/:where()/:not() counts too: `:is(.a:has(.b) > .c)`
// is `.a:has(.b) > .c`. And when the first combinator after the :has() is a
// child or descendant one and the selector's subject has no type, class, id or
// attribute of its own (`> *`, `> :not(.x)`), every descendant of the anchor is
// restyled, so no comment can allow it. `:is(*, .x)` and `:where(.x, :hover)` key
// on nothing either: one bare alternative is enough to match every element. The
// subject is the last compound of the outermost selector that has one after the
// :has(); a compound around an :is() never keys the selector inside it, so
// `:is(.a:has(.b) > *).key` is as bad as `.a:has(.b) > *` (Chromium, W1-40).
// A sibling combinator straight after the :has() only reaches the anchor's
// siblings, and <body>/<html> have none that matter, so it stays allowable.
// String contents are masked and escapes decoded first, so `[title="("]` cannot
// open a group and `:h\61 s(` is read as the `:has(` the browser sees.
// The root test looks inside :is()/:where() (`:is(body):has(.x)`), but not
// inside :has()/:not(). A :has() in a nested
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
    const { clean, map, shown, allowLines } = normalize(css);
    const lineStarts = [0];
    for (let index = 0; index < css.length; index++) if (css[index] === '\n') lineStarts.push(index + 1);
    const lineAt = offset => {
        const source = map[offset];
        let low = 0;
        let high = lineStarts.length - 1;
        while (low < high) {
            const mid = (low + high + 1) >> 1;
            if (lineStarts[mid] <= source) low = mid;
            else high = mid - 1;
        }
        return low + 1;
    };
    // `map` turns an offset into `clean` back into one into the source, so reports
    // show strings and escapes as written.
    const original = (offset, text) => shown.slice(map[offset], map[offset + text.length]).replace(/\s+/g, ' ').trim();
    const findings = [];
    for (const { text, offset, parentHas, nested } of stylePreludes(clean)) {
        if (nested && (parentHas || HAS.test(text))) {
            const at = text.search(HAS);
            const line = lineAt(offset + (at >= 0 ? at : text.search(/\S/)));
            findings.push({
                line,
                selector: original(offset, text),
                reason: 'nested in a style rule that this check cannot resolve',
                allowed: allowLines.has(line) || allowLines.has(line - 1),
            });
            continue;
        }
        for (const selector of splitTopLevel(text, ',', offset)) {
            const whole = original(selector.offset, selector.text);
            for (const risk of complexRisks(selector.text, selector.offset, { combinator: null, subject: null, outer: [] })) {
                const line = lineAt(risk.offset);
                findings.push({
                    line,
                    selector: whole,
                    reason: risk.reasons.join(' and '),
                    allowed: !risk.hard && (allowLines.has(line) || allowLines.has(line - 1)),
                });
            }
        }
    }
    return findings;
}

// Selector-list pseudo-classes whose arguments sit in the same complex selector
// as their host compound: a combinator inside one (`:is(.a:has(.b) > .c)`) is a
// combinator after the :has() all the same. :has() arguments are not walked.
const LIST_PSEUDO = /^:(?:is|where|not|matches|-webkit-any|nth-child|nth-last-child)\($/i;

// Every :has() in one complex selector, at any :is()/:where()/:not() depth, with
// why it is a risk. `context` describes the selectors around this one:
// `combinator`, the first combinator after the enclosing compound (null when
// none follows); `subject`, the last compound of the outermost selector with a
// compound after the enclosing one; `outer`, the enclosing compounds the last
// compound here is matched together with (same element), for the root test.
function complexRisks(text, offset, context) {
    const risks = [];
    const compounds = splitCompounds(text, offset);
    const last = compounds.length - 1;
    compounds.forEach((compound, index) => {
        const combinator = index < last ? compounds[index + 1].combinator : context.combinator;
        const subject = context.subject ?? (index < last ? compounds[last].text : null);
        const anchor = index === last ? [...context.outer, compound.text] : [compound.text];
        for (const pseudo of topLevelPseudos(compound.text)) {
            if (/^:has\($/i.test(pseudo.name)) {
                const reasons = [];
                const rooted = anchor.some(part => ROOT_TYPE.test(withoutArguments(part, /:(?:has|not)\($/i)));
                if (rooted || !anchor.some(keyedCompound)) reasons.push('anchored on the document root');
                if (combinator) reasons.push('followed by a combinator');
                const hard = (combinator === ' ' || combinator === '>') && !keyedCompound(subject);
                if (hard) reasons.push('its subject has no type, class, id or attribute, so every descendant is restyled (cannot be allowed)');
                if (reasons.length) risks.push({ offset: compound.offset + pseudo.start, reasons, hard });
                continue;
            }
            if (!LIST_PSEUDO.test(pseudo.name)) continue;
            let argument = compound.text.slice(pseudo.argStart, pseudo.argEnd);
            let argumentOffset = compound.offset + pseudo.argStart;
            if (/^:nth-/i.test(pseudo.name)) {
                const of = argument.search(/\bof\s/i);
                if (of < 0) continue;
                argumentOffset += of + 2;
                argument = argument.slice(of + 2);
            }
            const rest = compound.text.slice(0, pseudo.argStart) + compound.text.slice(pseudo.argEnd);
            const outer = index === last ? [...context.outer, rest] : [rest];
            for (const inner of splitTopLevel(argument, ',', argumentOffset)) {
                risks.push(...complexRisks(inner.text, inner.offset, { combinator, subject, outer }));
            }
        }
    });
    return risks;
}

// Whether one compound only matches elements Chromium can key an invalidation on:
// it has a type, class, id or attribute of its own, or an :is()/:where()/:nth-child(of)
// whose every alternative's subject does. :not() and :has() arguments never key it.
const MATCHING_LIST = /^:(?:is|where|matches|-webkit-any|nth-child|nth-last-child)\($/i;
function keyedCompound(compound) {
    if (/^[a-z_][-\w]*|[.#[]/i.test(withoutArguments(compound, /\($/))) return true;
    return topLevelPseudos(compound).some(pseudo => {
        if (!MATCHING_LIST.test(pseudo.name)) return false;
        let argument = compound.slice(pseudo.argStart, pseudo.argEnd);
        if (/^:nth-/i.test(pseudo.name)) {
            const of = argument.search(/\bof\s/i);
            if (of < 0) return false;
            argument = argument.slice(of + 2);
        }
        return splitTopLevel(argument, ',', 0).every(alternative => {
            const parts = splitCompounds(alternative.text, 0);
            return parts.length > 0 && keyedCompound(parts[parts.length - 1].text);
        });
    });
}

// The functional pseudo-classes at the top level of one compound, with argument bounds.
function topLevelPseudos(text) {
    const found = [];
    let depth = 0;
    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (char === '[') depth++;
        else if (char === ']') depth--;
        if (char !== ':' || depth) continue;
        const name = /^::?[-\w]+\(/.exec(text.slice(index))?.[0];
        if (!name) continue;
        let end = index + name.length;
        for (let open = 1; end < text.length; end++) {
            open += text[end] === '(' ? 1 : text[end] === ')' ? -1 : 0;
            if (!open) break;
        }
        found.push({ name, start: index, argStart: index + name.length, argEnd: end });
        index = end;
    }
    return found;
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

// Comments become spaces, the contents of strings become `_`, and escapes are
// decoded: to the character when it can stand in an identifier as written
// (`:h\61 s(` -> `:has(`, `b\6f dy` -> `body`), else to `_` (`.a\(`, `\2a`), so a
// brace, bracket, paren, quote or comment marker inside `[title="("]` or `.a\(`
// is inert to the parser. `map[i]` is the source offset of `clean[i]`; `shown` is
// the source with comments blanked, for reports.
function normalize(css) {
    let clean = '';
    let shown = '';
    const map = [];
    const allowLines = new Set();
    let line = 1;
    const emit = (char, source) => {
        clean += char;
        map.push(source);
    };
    for (let index = 0; index < css.length; index++) {
        const char = css[index];
        if (char === '/' && css[index + 1] === '*') {
            const end = css.indexOf('*/', index + 2);
            const close = end < 0 ? css.length : end + 2;
            const comment = css.slice(index, close);
            const startLine = line;
            for (let at = 0; at < comment.length; at++) {
                if (comment[at] === '\n') line++;
                emit(comment[at] === '\n' ? '\n' : ' ', index + at);
            }
            shown += comment.replace(/[^\n]/g, ' ');
            if (ALLOW_PATTERN.test(comment)) for (let at = startLine; at <= line; at++) allowLines.add(at);
            index = close - 1;
            continue;
        }
        if (char === '"' || char === "'") {
            let end = index + 1;
            while (end < css.length && css[end] !== char) end += css[end] === '\\' ? 2 : 1;
            const quoted = css.slice(index, Math.min(end + 1, css.length));
            for (let at = 0; at < quoted.length; at++) {
                if (quoted[at] === '\n') line++;
                const kept = at === 0 || (at === quoted.length - 1 && end < css.length) || quoted[at] === '\n';
                emit(kept ? quoted[at] : '_', index + at);
            }
            shown += quoted;
            index = end;
            continue;
        }
        if (char === '\\') {
            const escape = /^\\(?:([\da-f]{1,6})(?:\r\n|[ \t\n\r\f])?|([^\n\r\f\da-f]))/i.exec(css.slice(index));
            const text = escape?.[0] ?? char;
            const decoded = escape?.[1] ? String.fromCodePoint(Math.min(Number.parseInt(escape[1], 16), 0x10ffff)) : escape?.[2];
            for (const ch of text) if (ch === '\n') line++;
            emit(decoded && /^[-\w]$/.test(decoded) ? decoded : '_', index);
            shown += text;
            index += text.length - 1;
            continue;
        }
        if (char === '\n') line++;
        emit(char, index);
        shown += char;
    }
    map.push(css.length);
    return { clean, map, shown, allowLines };
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
    for (let index = 0; index < clean.length; index++) {
        const char = clean[index];
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
// (whitespace, >, +, ~). Each carries the combinator before it: ' ', '>', '+',
// '~', or null for the first.
function splitCompounds(text, offset) {
    const compounds = [];
    let depth = 0;
    let start = -1;
    let combinator = null;
    for (let index = 0; index <= text.length; index++) {
        const char = text[index];
        const boundary = index === text.length || (depth === 0 && /[\s>+~]/.test(char));
        if (boundary) {
            if (start >= 0) {
                compounds.push({ text: text.slice(start, index), offset: offset + start, combinator });
                combinator = ' ';
            }
            if (compounds.length && /[>+~]/.test(char ?? '')) combinator = char;
            start = -1;
            continue;
        }
        if (char === '(' || char === '[') depth++;
        else if (char === ')' || char === ']') depth--;
        if (start < 0) start = index;
    }
    return compounds;
}
