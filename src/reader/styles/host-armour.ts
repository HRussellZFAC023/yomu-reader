/**
 * Host-CSS armour: make Yomu's injected nodes immune to the host page's
 * stylesheet.
 *
 * Yomu injects its chrome into the host document, so host rules reach it. The
 * host does not need to know Yomu's class names to do damage — it only needs
 * selectors Yomu cannot dodge:
 *
 *     *, ::after, ::before                  { border-radius: 0 !important }
 *     .style-flat button:not(.theme-option) { background: transparent !important;
 *                                             border: none !important;
 *                                             box-shadow: none !important }
 *
 * (both shipped by https://yomuapp.jp, which flattened every Yomu control on
 * the page and turned the floating action button into an invisible square).
 *
 * Specificity cannot win that fight. `.jpdb-reader-fab` is one class; any
 * `.theme button` or `:not(.a.b) span` the host writes already out-specifies
 * it, and `*` reaches every node Yomu will ever inject. Escalating Yomu's own
 * declarations to `!important` only moves the arms race one step along.
 *
 * Cascade layers settle it by construction. For **important** declarations the
 * layer order is reversed relative to normal ones: a declaration inside a layer
 * beats an unlayered one regardless of specificity, and earlier layers beat
 * later ones. Host sheets are unlayered, so re-emitting Yomu's own paint
 * declarations as `!important` inside a layer wins unconditionally — with no
 * per-site knowledge anywhere.
 *
 * Two layers, not one, so the sheet's own cascade is reproduced faithfully:
 * declarations that were already `!important` in the source go in the earlier
 * (stronger) layer, plain ones in the later layer, which preserves
 * "important beats normal" across differing specificities exactly as the
 * unlayered sheet does today.
 *
 * Deliberate limits, both load-bearing:
 *
 *  - Only rules whose selector names a Yomu class are mirrored, so the armour
 *    can never strengthen a Yomu rule that reaches host content. Yomu styling
 *    must not leak onto the page any more than the page may leak onto Yomu.
 *  - Only properties Yomu never writes inline are mirrored. An `!important`
 *    author declaration outranks a plain inline style, so armouring e.g.
 *    `color`, `padding`, `transform` or `transition` would silently break the
 *    runtime that writes them (mirror fidelity, detached-reading placement,
 *    popover drag). `tests/reader/host-css-armour.test.ts` fails if a source
 *    file starts writing an armoured property inline.
 *
 * Browsers without `@layer` drop the block wholesale and fall back to today's
 * behaviour, so this can only ever add protection.
 */

/**
 * Properties a host sheet can reach through `*` or a bare element selector, and
 * that Yomu paints only from CSS. Keep in sync with INLINE_STYLE_SAFE in the
 * test: adding a property here is only safe while no runtime writes it inline.
 */
export const ARMOURED_PROPERTIES: ReadonlySet<string> = new Set([
    'border-radius',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-left-radius',
    'border-bottom-right-radius',
    'background',
    'background-color',
    'background-image',
    'background-clip',
    'background-origin',
    'background-size',
    'background-repeat',
    'background-position',
    'background-attachment',
    'border',
    'border-top',
    'border-right',
    'border-bottom',
    'border-left',
    'border-width',
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
    'border-style',
    'border-top-style',
    'border-right-style',
    'border-bottom-style',
    'border-left-style',
    'border-color',
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color',
    'border-image',
    'border-image-source',
    'border-image-slice',
    'border-image-width',
    'border-image-outset',
    'border-image-repeat',
    'box-shadow',
    'color',
]);

/**
 * `color` is the one armoured property Yomu also derives at runtime. The
 * canvas-text and control-text mirrors copy the host's computed colour onto
 * themselves with a plain inline style, and annotation surfaces (words, furi,
 * projected readings) are meant to track host text rather than override it —
 * freezing either with an `!important` author rule would break mirror fidelity.
 * Colour armour is therefore limited to selectors naming none of them, which in
 * practice means Yomu's own chrome, where the host has no business at all.
 * (The projected-reading clone sets colour inline *with* `important`, so it is
 * immune either way; it is listed for symmetry with the surfaces around it.)
 */
const HOST_DERIVED_COLOUR_SELECTOR =
    /jpdb-reader-(?:canvas-text-layer|control-text-mirror|text-mirror|word|furi|ruby|detach|projected)|yomu-projected-reading|jpdb-ocr/i;

/** Earlier layer: mirrors declarations the sheet already marked `!important`. */
export const ARMOUR_STRONG_LAYER = 'jpdb-reader-armour-strong';
/** Later layer: mirrors plain declarations. Still beats any unlayered host `!important`. */
export const ARMOUR_LAYER = 'jpdb-reader-armour';

const CONDITIONAL_AT_RULE = /^@(?:media|supports|container|scope|document)\b/i;
const YOMU_SELECTOR = /jpdb|yomu/i;

/**
 * Attributes a Yomu-owned skeleton element may legitimately be selected by.
 * Anything else in a subject compound (`data-sc-class`, `data-uia`, …) means the
 * rule is reaching for markup Yomu did not author.
 */
const OWNED_SUBJECT_ATTRIBUTE = /^(?:data-jpdb|data-yomu|aria-|role$|type$|disabled$|open$|hidden$|checked$|selected$|href$|lang$|dir$|value$|placeholder$|contenteditable$|multiple$|readonly$|required$)/i;

/**
 * Yomu renders third-party dictionary HTML (Yomitan structured content, with its
 * own inline styles) inside this container. Its markup is not Yomu's to freeze,
 * so nothing under it is armoured even though the container itself is Yomu's.
 */
const FOREIGN_CONTENT_CONTAINER = /jpdb-reader-local-glossary/i;
// Every armoured property starts with one of these, so a declaration block that
// mentions none of them can be skipped without being parsed.
const ARMOURABLE_BLOCK = /border|background|box-shadow|color/i;
const IMPORTANT_SUFFIX = /!\s*important\s*$/i;
// A sheet far larger than the real one is a sign of corruption, not of a bigger
// product; skip rather than spend the main thread on it during boot.
const MAX_INPUT_LENGTH = 4_000_000;

/**
 * Build the armour layers for a reader stylesheet. Returns '' when there is
 * nothing to armour or the input cannot be scanned, so callers can always
 * concatenate the result unconditionally.
 */
// installStyles() derives the same sheet twice (document <style> and the shared
// shadow sheet) and the async full-sheet swap repeats it; scanning half a
// megabyte of CSS more than once per sheet is pure boot latency.
let lastArmourInput = '';
let lastArmourOutput = '';

export function hostCssArmour(css: string): string {
    if (typeof css !== 'string' || css.length === 0 || css.length > MAX_INPUT_LENGTH) return '';
    if (css === lastArmourInput) return lastArmourOutput;
    const strong: string[] = [];
    const normal: string[] = [];
    try {
        collectArmourRules(css, strong, normal);
    } catch {
        // Armour is an enhancement; a sheet this scanner cannot read must never
        // stop the reader from installing its styles at all.
        return '';
    }
    const armour = strong.length === 0 && normal.length === 0
        ? ''
        : [
            `@layer ${ARMOUR_STRONG_LAYER},${ARMOUR_LAYER};`,
            strong.length > 0 ? `@layer ${ARMOUR_STRONG_LAYER}{${strong.join('')}}` : '',
            normal.length > 0 ? `@layer ${ARMOUR_LAYER}{${normal.join('')}}` : '',
        ].join('');
    lastArmourInput = css;
    lastArmourOutput = armour;
    return armour;
}

/** Append the armour layers to a stylesheet, leaving the sheet itself unlayered. */
export function withHostCssArmour(css: string): string {
    const armour = hostCssArmour(css);
    return armour ? `${css}\n${armour}` : css;
}

// Every character that can end a selector prelude. Jumping between these beats
// walking the sheet one character at a time by an order of magnitude, which
// matters: this runs on the main thread while the reader is installing styles.
const PRELUDE_STOP = /[{};"'/]/gu;

function collectArmourRules(css: string, strong: string[], normal: string[]): void {
    const conditions: string[] = [];
    let preludeStart = 0;
    let index = 0;
    while (index < css.length) {
        PRELUDE_STOP.lastIndex = index;
        const stop = PRELUDE_STOP.exec(css);
        if (!stop) break;
        index = stop.index;
        const char = css[index];
        if (char === '/') {
            if (css[index + 1] === '*') index = skipComment(css, index);
            else index++;
            continue;
        }
        if (char === '"' || char === '\'') {
            index = skipString(css, index);
            continue;
        }
        if (char === ';') {
            // Statement at-rule (@import, @charset, @layer declaration).
            index++;
            preludeStart = index;
            continue;
        }
        if (char === '}') {
            conditions.pop();
            index++;
            preludeStart = index;
            continue;
        }

        const selector = collapseWhitespace(css.slice(preludeStart, index));
        index++;
        preludeStart = index;
        if (selector.startsWith('@')) {
            if (CONDITIONAL_AT_RULE.test(selector)) {
                // Keep scanning inside; the group's condition wraps any rule found.
                conditions.push(selector);
                continue;
            }
            // @keyframes / @font-face / @property / @page: their blocks are not
            // style rules, and re-emitting a keyframe selector outside its
            // @keyframes would be invalid CSS.
            index = findBlockEnd(css, index) + 1;
            preludeStart = index;
            continue;
        }
        const blockEnd = findBlockEnd(css, index);
        const block = css.slice(index, blockEnd);
        index = blockEnd + 1;
        preludeStart = index;
        if (!ARMOURABLE_BLOCK.test(block)) continue;
        const armourable = armourableSelector(selector);
        if (!armourable) continue;
        appendArmourRule(armourable, block, conditions, strong, normal);
    }
}

/**
 * Keep only the selectors in a list that paint an element Yomu itself created.
 *
 * A Yomu token anywhere in the selector is not enough: Yomu's sheet also styles
 * markup it does not own — the platform's native caption nodes while Yomu's own
 * subtitles are showing, and third-party dictionary HTML inside the popover.
 * Making those `!important` would turn the armour into a weapon pointed at the
 * host, and would outrank the inline styles a dictionary ships with its content.
 *
 * A selector qualifies when its SUBJECT (the rightmost compound — the element
 * the rule actually paints) either names Yomu, or is a plain skeleton element
 * (`button`, `span`, `> summary`, `input[type=checkbox]`) sitting inside a Yomu
 * container. A universal subject never qualifies: `[data-jpdb-reader-root] *`
 * reaches whatever the popover happens to be displaying.
 */
function armourableSelector(selectorList: string): string {
    if (!YOMU_SELECTOR.test(selectorList) || FOREIGN_CONTENT_CONTAINER.test(selectorList)) return '';
    const kept = splitTopLevel(selectorList, ',')
        .map(selector => selector.trim())
        .filter(selector => selector.length > 0 && YOMU_SELECTOR.test(selector) && ownsSubject(selector));
    return kept.join(',');
}

function ownsSubject(selector: string): boolean {
    const compounds = splitTopLevel(selector, ' >+~').filter(part => part.trim().length > 0);
    const subject = compounds[compounds.length - 1]?.trim() ?? '';
    if (!subject || subject.startsWith('*')) return false;
    if (YOMU_SELECTOR.test(subject)) return true;
    // Strip pseudo-classes/elements: they constrain the match, they do not say
    // whose element it is. `:is(...)`/`:not(...)` arguments go with them.
    const bare = subject.replace(/::?[a-zA-Z-]+(\([^()]*(?:\([^()]*\)[^()]*)*\))?/gu, '').trim();
    // A bare pseudo compound (`:hover` alone) is `*:hover`; a foreign class or id
    // means the element came from somewhere else.
    if (!bare || bare.startsWith('*') || /[.#]/u.test(bare)) return false;
    for (const attribute of bare.matchAll(/\[\s*([-\w]+)/gu)) {
        if (!OWNED_SUBJECT_ATTRIBUTE.test(attribute[1])) return false;
    }
    return /^[a-zA-Z][\w-]*(?:\[[^\]]*\])*$/u.test(bare);
}

/** Split on any of `separators` that sit outside parentheses, brackets, and strings. */
function splitTopLevel(value: string, separators: string): string[] {
    const parts: string[] = [];
    let current = '';
    let parens = 0;
    let brackets = 0;
    let index = 0;
    while (index < value.length) {
        const char = value[index];
        if (char === '"' || char === '\'') {
            const end = skipString(value, index);
            current += value.slice(index, end);
            index = end;
            continue;
        }
        if (char === '(') parens++;
        else if (char === ')') parens = Math.max(0, parens - 1);
        else if (char === '[') brackets++;
        else if (char === ']') brackets = Math.max(0, brackets - 1);
        if (parens === 0 && brackets === 0 && separators.includes(char)) {
            parts.push(current);
            current = '';
            index++;
            continue;
        }
        current += char;
        index++;
    }
    parts.push(current);
    return parts;
}

function appendArmourRule(
    selector: string,
    block: string,
    conditions: readonly string[],
    strong: string[],
    normal: string[],
): void {
    const strongDeclarations: string[] = [];
    const normalDeclarations: string[] = [];
    for (const declaration of splitDeclarations(block)) {
        const colon = declaration.indexOf(':');
        if (colon <= 0) continue;
        const property = declaration.slice(0, colon).trim().toLowerCase();
        if (property.startsWith('--') || !ARMOURED_PROPERTIES.has(property)) continue;
        if (property === 'color' && HOST_DERIVED_COLOUR_SELECTOR.test(selector)) continue;
        const rawValue = declaration.slice(colon + 1).trim();
        const important = IMPORTANT_SUFFIX.test(rawValue);
        const value = important ? rawValue.replace(IMPORTANT_SUFFIX, '').trim() : rawValue;
        if (!value) continue;
        (important ? strongDeclarations : normalDeclarations).push(`${property}:${value}!important`);
    }
    if (strongDeclarations.length > 0) strong.push(wrapRule(selector, strongDeclarations, conditions));
    if (normalDeclarations.length > 0) normal.push(wrapRule(selector, normalDeclarations, conditions));
}

function wrapRule(selector: string, declarations: readonly string[], conditions: readonly string[]): string {
    const rule = `${selector}{${declarations.join(';')}}`;
    if (conditions.length === 0) return rule;
    return `${conditions.map(condition => `${condition}{`).join('')}${rule}${'}'.repeat(conditions.length)}`;
}

function splitDeclarations(block: string): string[] {
    const declarations: string[] = [];
    let current = '';
    let depth = 0;
    let index = 0;
    while (index < block.length) {
        const char = block[index];
        if (char === '/' && block[index + 1] === '*') {
            index = skipComment(block, index);
            continue;
        }
        if (char === '"' || char === '\'') {
            const end = skipString(block, index);
            current += block.slice(index, end);
            index = end;
            continue;
        }
        if (char === '(') depth++;
        else if (char === ')') depth = Math.max(0, depth - 1);
        if (char === ';' && depth === 0) {
            declarations.push(current);
            current = '';
            index++;
            continue;
        }
        current += char;
        index++;
    }
    declarations.push(current);
    return declarations;
}

function findBlockEnd(css: string, start: number): number {
    let depth = 1;
    let index = start;
    while (index < css.length) {
        const char = css[index];
        if (char === '/' && css[index + 1] === '*') {
            index = skipComment(css, index);
            continue;
        }
        if (char === '"' || char === '\'') {
            index = skipString(css, index);
            continue;
        }
        if (char === '{') depth++;
        else if (char === '}') {
            depth--;
            if (depth === 0) return index;
        }
        index++;
    }
    return css.length;
}

function skipComment(css: string, start: number): number {
    const end = css.indexOf('*/', start + 2);
    return end === -1 ? css.length : end + 2;
}

function skipString(css: string, start: number): number {
    const quote = css[start];
    let index = start + 1;
    while (index < css.length) {
        const char = css[index];
        if (char === '\\') {
            index += 2;
            continue;
        }
        if (char === quote) return index + 1;
        if (char === '\n') return index;
        index++;
    }
    return css.length;
}

// Comments are tokenised away before selector matching, so they must be dropped
// here too: a comment that happens to mention Yomu must never be what makes a
// host-facing selector look armourable.
function collapseWhitespace(value: string): string {
    return value.replace(/\/\*[\s\S]*?\*\//gu, ' ').replace(/\s+/gu, ' ').trim();
}
