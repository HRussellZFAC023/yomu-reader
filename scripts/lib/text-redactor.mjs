// The text half of a Recorded Page redaction: every letter a reader sees is
// replaced by the next public-domain character of its own class —
//   - kanji by kanji and kana by kana of the same script (small kana by small
//     kana, so line-start rules hold) from an Aozora Bunko text, so the page
//     still reads, and parses, as Japanese;
//   - Latin by lorem-ipsum letters, case kept;
//   - digits, punctuation, symbols, 々, ー, whitespace and web addresses stay.
// In the page the choice is also width-matched in the text's own font, so
// lines break where they broke (recorded-redaction.mjs checks the result).

const LOREM_LATIN = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur Excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum Quick zephyrs blow vexing daft Jim Waltz bad nymph for quick jigs vex';

/** Ordered: the first pattern a character matches names its class; null keeps it. */
export const CHARACTER_CLASS_RULES = Object.freeze([
    ['[々〆ー]', null],
    ['[ぁぃぅぇぉっゃゅょゎゕゖ]', 'smallHiragana'],
    ['[ァィゥェォッャュョヮヵヶ]', 'smallKatakana'],
    ['\\p{Script=Han}', 'han'],
    ['[ぁ-ゖ]', 'hiragana'],
    ['[ァ-ヺ]', 'katakana'],
    ['[Ａ-Ｚａ-ｚ]', 'fullwidth'],
    ['\\p{Lu}', 'upper'],
    ['\\p{L}', 'lower'],
]);
const COMPILED_RULES = CHARACTER_CLASS_RULES.map(([source, name]) => [new RegExp(source, 'u'), name]);

export function characterClass(char) {
    return COMPILED_RULES.find(([pattern]) => pattern.test(char))?.[1] ?? null;
}

const shiftCodePoints = (text, offset) => [...text].map(char => String.fromCodePoint(char.codePointAt(0) + offset)).join('');
// Novels hold few katakana; their hiragana, shifted into katakana, stand in.
const withFallback = (own, minimum, fallback) => (own.length >= minimum ? own : `${own}${fallback}`);

/**
 * The replacement streams, one per character class: an Aozora text's kanji
 * and kana in reading order (readings in brackets dropped), and lorem ipsum's
 * letters for Latin.
 */
export function aozoraLetterStreams(aozoraText, latin = LOREM_LATIN) {
    const chars = [...String(aozoraText).replace(/《[^》]*》|［[^］]*］|｜/gu, '')];
    const of = name => chars.filter(char => characterClass(char) === name).join('');
    const letters = [...latin].filter(char => /[a-z]/iu.test(char)).join('');
    return {
        han: of('han'),
        hiragana: of('hiragana'),
        smallHiragana: of('smallHiragana'),
        katakana: withFallback(of('katakana'), 2000, shiftCodePoints(of('hiragana'), 0x60)),
        smallKatakana: withFallback(of('smallKatakana'), 200, shiftCodePoints(of('smallHiragana'), 0x60)),
        upper: letters.toUpperCase(),
        lower: letters.toLowerCase(),
        fullwidth: shiftCodePoints(letters.toLowerCase(), 0xfee0),
    };
}

/**
 * For text redacted outside the page (caption tracks, player metadata): same
 * classes, no width matching. avoidRuns: original runs an output must not
 * spell by chance (normalised, as recorded-redaction.mjs normalises them).
 */
export function createTextRedactor({ streams, avoidRuns = [] }) {
    for (const name of ['han', 'hiragana', 'katakana', 'lower', 'upper']) {
        if (!streams[name]?.length) throw new Error(`The redactor needs a non-empty ${name} stream (from aozoraLetterStreams).`);
    }
    const sources = Object.fromEntries(Object.entries(streams).filter(([, text]) => text.length).map(([name, text]) => [name, [...text]]));
    const positions = {};
    const next = name => {
        const source = sources[name] ?? sources.lower;
        const index = positions[name] ?? 0;
        positions[name] = index + 1;
        return source[index % source.length];
    };
    const replaceOnce = text => [...String(text)].map(char => {
        const name = characterClass(char);
        return name ? next(name) : char;
    }).join('');
    const avoid = new Set(avoidRuns);
    const spellsOriginal = output => avoid.has(output.normalize('NFC').replace(/\s+/gu, ' ').trim());
    return text => {
        let output = replaceOnce(text);
        for (let attempt = 0; attempt < 50 && spellsOriginal(output); attempt += 1) output = replaceOnce(text);
        return output;
    };
}

/**
 * In the page, after collectTextSlotsInPage (page-freeze.mjs): replaces every
 * slot's letters with stream characters of the same class whose advance width
 * in that text's own font matches (measured under <body> with the font copied,
 * so palt, letter-spacing and lang count; error diffusion keeps the running
 * width on target). Glyphs in isolation miss kerning, so a node that still
 * renders at another width retries other stretches of the streams. avoidRuns
 * are original runs a replacement must not spell by chance. Returns the texts.
 */
export function redactTextSlotsInPage({ streams, rules, avoidRuns = [], maxScan = 120, retries = 32 }) {
    const slots = window.__yomuTextSlots ?? [];
    const compiled = rules.map(([source, name]) => [new RegExp(source, 'u'), name]);
    const classOf = char => compiled.find(([pattern]) => pattern.test(char))?.[1] ?? null;
    const sources = Object.fromEntries(Object.entries(streams).map(([name, text]) => [name, [...text]]));
    const candidates = Object.fromEntries(Object.entries(sources).map(([name, chars]) => [name, [...new Set(chars)]]));
    const positions = Object.fromEntries(Object.keys(sources).map(name => [name, 0]));
    const avoid = new Set(avoidRuns);
    const normalized = text => text.normalize('NFC').replace(/\s+/gu, ' ').trim();

    const FONT_PROPERTIES = ['font', 'fontFeatureSettings', 'fontVariantEastAsian', 'letterSpacing', 'fontKerning', 'textTransform'];
    const widthTables = new Map();
    const fontOf = element => {
        const style = getComputedStyle(element);
        const font = Object.fromEntries(FONT_PROPERTIES.map(name => [name, style[name]]));
        return { ...font, lang: element.closest('[lang]')?.getAttribute('lang') ?? '' };
    };
    const measureGlyphs = (font, chars) => {
        const box = document.createElement('yomu-measure');
        box.style.cssText = 'all:initial;position:absolute;left:0;top:0;visibility:hidden;white-space:pre;display:block;width:max-content;';
        for (const name of FONT_PROPERTIES) box.style[name] = font[name];
        if (font.lang) box.setAttribute('lang', font.lang);
        const glyphs = chars.map(char => box.appendChild(Object.assign(document.createElement('yomu-glyph'), { textContent: char })));
        document.body.append(box);
        const widths = glyphs.map(glyph => glyph.getBoundingClientRect().width);
        box.remove();
        return widths;
    };
    const widthsFor = (element, chars) => {
        const font = fontOf(element);
        const key = JSON.stringify(font);
        const table = widthTables.get(key) ?? new Map();
        widthTables.set(key, table);
        const missing = [...new Set(chars)].filter(char => !table.has(char));
        measureGlyphs(font, missing).forEach((width, index) => table.set(missing[index], width));
        return table;
    };

    const keptIndexes = chars => {
        const text = chars.join('');
        const kept = new Set();
        for (const match of text.matchAll(/(?:https?:\/\/|www\.)\S+/gu)) {
            const start = [...text.slice(0, match.index)].length;
            for (let offset = 0; offset < [...match[0]].length; offset += 1) kept.add(start + offset);
        }
        return kept;
    };
    // The candidate within maxScan whose width keeps the running drift smallest.
    const better = (best, step, drift) => (Math.abs(drift) < Math.abs(best.drift) - 0.01 ? { step, drift } : best);
    const bestStep = (state, char, name) => {
        const source = sources[name];
        let best = { step: -1, drift: Number.POSITIVE_INFINITY };
        for (let step = 0; step < Math.min(maxScan, source.length) && Math.abs(best.drift) >= 0.02; step += 1) {
            const candidate = source[(state.cursor[name] + step) % source.length];
            if (candidate !== char) best = better(best, step, state.drift + state.table.get(candidate) - state.table.get(char));
        }
        return best;
    };
    const pickChar = (state, char, index) => {
        const name = state.kept.has(index) ? null : classOf(char);
        const best = name ? bestStep(state, char, name) : { step: -1 };
        if (best.step < 0) return char;
        const source = sources[name];
        const picked = source[(state.cursor[name] + best.step) % source.length];
        state.cursor[name] += best.step + 1;
        state.drift = best.drift;
        return picked;
    };
    const pick = (chars, table, cursor) => {
        const state = { chars, table, cursor, drift: 0, kept: keptIndexes(chars) };
        return chars.map((char, index) => pickChar(state, char, index)).join('');
    };

    const textOf = slot => (slot.node ? slot.node.nodeValue : slot.element.getAttribute(slot.name)) ?? '';
    const write = (slot, text) => (slot.node ? (slot.node.nodeValue = text) : slot.element.setAttribute(slot.name, text));
    const hostOf = slot => (slot.node ? slot.node.parentElement : slot.element) ?? document.body;
    const range = document.createRange();
    const renderedSize = node => {
        range.selectNodeContents(node);
        return [...range.getClientRects()].reduce((total, rect) => total + rect.width + rect.height, 0);
    };
    const plan = slot => {
        const chars = [...textOf(slot)];
        const classes = [...new Set(chars.map(classOf).filter(Boolean))];
        if (!classes.length) return null;
        const table = widthsFor(hostOf(slot), [...chars, ...classes.flatMap(name => candidates[name])]);
        let replacement = pick(chars, table, positions);
        for (let attempt = 1; avoid.has(normalized(replacement)) && attempt < 50; attempt += 1) replacement = pick(chars, table, positions);
        return { chars, table, replacement };
    };
    const shiftedCursor = attempt => Object.fromEntries(Object.entries(positions).map(([name, at]) => [name, at + attempt * 17]));
    const sizeError = (node, text, originalSize) => {
        node.nodeValue = text;
        return avoid.has(normalized(text)) ? Number.POSITIVE_INFINITY : Math.abs(renderedSize(node) - originalSize);
    };
    const refit = (slot, slotPlan, originalSize) => {
        let best = { text: slotPlan.replacement, error: Math.abs(renderedSize(slot.node) - originalSize) };
        for (let attempt = 1; attempt <= retries && best.error > 0.5; attempt += 1) {
            const text = pick(slotPlan.chars, slotPlan.table, shiftedCursor(attempt));
            const error = sizeError(slot.node, text, originalSize);
            if (error < best.error) best = { text, error };
        }
        slot.node.nodeValue = best.text;
        return best.text;
    };

    // Every original size is read before the first write: one layout, not one per node.
    const originalSizes = slots.map(slot => (slot.node?.isConnected ? renderedSize(slot.node) : null));
    const plans = slots.map(plan);
    slots.forEach((slot, index) => plans[index] && write(slot, plans[index].replacement));
    const replacements = slots.map((slot, index) => {
        const slotPlan = plans[index];
        if (!slotPlan) return textOf(slot);
        return slot.node && originalSizes[index] !== null ? refit(slot, slotPlan, originalSizes[index]) : slotPlan.replacement;
    });
    delete window.__yomuTextSlots;
    return replacements;
}
