import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

// An underline is drawn only for information the learner has a colour for.
// Not-in-deck has no colour picker, so the deck-status underline channels draw
// nothing where a word's channel colour resolves to not-in-deck. These tests
// tie the override's selectors to the colour cascade itself, so a reordered or
// added state rule cannot silently strip a learner-chosen colour (or bring the
// grey back). scripts/underline-colour-sources-smoke.mjs checks the painted
// result in real engines.

const WORD_CSS = rules(readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8'));
const SUBTITLE_CSS = rules(readFileSync('src/reader/styles/subtitles-youtube.css', 'utf8'));

// Mirrors RENDERED_WORD_CARD_STATES (dom/rendered-word-state.ts) and
// ANKI_CARD_STATE_PRIORITY (anki/card-details.ts).
const CARD_STATES = ['new', 'learning', 'young', 'mature', 'known', 'mastered', 'due', 'failed', 'locked', 'never-forget', 'blacklisted', 'suspended', 'in-deck', 'not-in-deck', 'redundant', 'frequent', 'unparsed'];
const ANKI_STATES = ['failed', 'due', 'learning', 'known', 'new', 'suspended', 'in-deck', 'not-in-deck'];

type Rule = { selector: string; body: string };

function rules(css: string): Rule[] {
    return Array.from(css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g))
        .map(([, selector, body]) => ({ selector: selector!.trim(), body: body!.replace(/\s+/g, ' ').trim() }));
}

// Every state-class set the renderer can put on one word: the provider state
// (plus jiten-<state> on trusted surfaces) and, with Anki on, Anki's state —
// projected as a second jpdb-<state> on ordinary pages, anki-<state> in Study.
function wordStateClassSets(): string[][] {
    return CARD_STATES.flatMap(state => [
        [`jpdb-${state}`],
        [`jpdb-${state}`, `jiten-${state}`],
        ...ANKI_STATES.flatMap(anki => [
            [`jpdb-${state}`, `jpdb-${anki}`],
            [`jpdb-${state}`, `anki-${anki}`],
            [`jpdb-${state}`, `jiten-${state}`, `anki-${anki}`],
        ]),
    ]);
}

function mount(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
    return host.querySelector<HTMLElement>('.jpdb-reader-word')!;
}

// The state rules share one specificity, so the last match in source order
// sets the channel colour.
function channelColourIsNotInDeck(word: HTMLElement, channel: 'jpdb' | 'status'): boolean {
    const winner = WORD_CSS
        .filter(rule => rule.body.includes(`--jpdb-reader-${channel}-color:`) && word.matches(rule.selector))
        .at(-1);
    return Boolean(winner?.body.includes(`--jpdb-reader-${channel}-color: var(--jpdb-reader-state-not-in-deck)`));
}

// Each selector in a list, minus its :where(…) groups: what is left is the
// part that carries specificity.
function selectorsWithoutWhere(list: string): string[] {
    const selectors = [''];
    let depth = 0;
    let whereDepth = -1;
    for (let index = 0; index < list.length; index += 1) {
        const char = list[index]!;
        if (whereDepth < 0 && list.startsWith(':where(', index)) whereDepth = depth;
        if (char === '(') depth += 1;
        if (char === ')') depth -= 1;
        if (whereDepth >= 0) {
            if (char === ')' && depth === whereDepth) whereDepth = -1;
        } else if (char === ',' && depth === 0) {
            selectors.push('');
        } else {
            selectors[selectors.length - 1] += char;
        }
    }
    return selectors.map(selector => selector.trim());
}

function overrideSelector(css: Rule[], body: string): string {
    const matches = css.filter(rule => rule.body === body && rule.selector.includes('not-in-deck'));
    expect(matches).toHaveLength(1);
    return matches[0]!.selector;
}

describe('deck-status underline for words in no deck', () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    const surfaces = [
        {
            name: 'page',
            selector: () => overrideSelector(WORD_CSS, '--jpdb-reader-word-decoration-source: transparent;'),
            markup: (mode: string, classes: string) => `<p class="jpdb-reader-word-underline-${mode}"><span class="jpdb-reader-word ${classes}">語</span></p>`,
        },
        {
            name: 'subtitle',
            selector: () => overrideSelector(SUBTITLE_CSS, '--jpdb-reader-word-underline: transparent;'),
            markup: (mode: string, classes: string) => `<div class="jpdb-reader-subtitle-underline-${mode}"><div class="jpdb-subtitle-primary"><span class="jpdb-reader-word ${classes}">語</span></div></div>`,
        },
    ];

    for (const surface of surfaces) {
        it(`draws no ${surface.name} underline exactly where the channel colour is not-in-deck`, () => {
            const selector = surface.selector();
            const cleared = (mode: string, classes: string) => mount(surface.markup(mode, classes)).matches(selector);
            const cases = (['jpdb', 'status'] as const).flatMap(mode => wordStateClassSets().map(classes => {
                const word = mount(surface.markup(mode, classes.join(' ')));
                return { mode, classes: classes.join(' '), expected: channelColourIsNotInDeck(word, mode), actual: word.matches(selector) };
            }));

            expect(cases.filter(entry => entry.actual !== entry.expected)).toEqual([]);
            expect(cases.filter(entry => entry.expected).length).toBeGreaterThan(0);
            // A known word that Anki holds no card for keeps its colour.
            expect(cleared('jpdb', 'jpdb-known jpdb-not-in-deck')).toBe(false);
            expect(cleared('status', 'jpdb-not-in-deck anki-learning')).toBe(false);
            expect(cleared('status', 'jpdb-not-in-deck')).toBe(true);
            expect(cleared('pitch', 'jpdb-not-in-deck')).toBe(false);
        });

        it(`keeps the ${surface.name} reset at its channel rule's specificity`, () => {
            // The reset beats the channel colour on source order alone. Any
            // state qualifier outside :where() would also outrank rules meant
            // to win, such as Study's headword keeping its pitch underline in
            // every mode; the smoke checks that headword in a real engine.
            for (const selector of selectorsWithoutWhere(surface.selector())) {
                expect(['jpdb', 'status'].some(mode => mount(surface.markup(mode, '')).matches(selector)), selector).toBe(true);
            }
        });
    }

    it('lets every word-colour opt-out reach the inline compound pitch gradient', () => {
        // The gradient is an inline custom property painted by ::after, so a
        // rule that hides a word's colours must clear it with !important. The
        // opt-outs are the root classes applyReaderTheme sets from the
        // learner's settings: "Only new", a hidden state group, and "Hide
        // JPDB-redundant styling".
        const optOutRoots = ['.yomu-word-color-new-only', '.yomu-word-color-hide-', '.jpdb-reader-suppress-redundant'];
        const optOuts = WORD_CSS.filter(rule => optOutRoots.some(root => rule.selector.includes(root))
            && rule.body.includes('--jpdb-reader-word-underline: transparent;'));
        expect(optOutRoots.filter(root => !optOuts.some(rule => rule.selector.includes(root)))).toEqual([]);
        for (const rule of optOuts) {
            expect(rule.body, rule.selector).toContain('--jpdb-reader-inline-pitch-gradient: none !important;');
        }
    });
});
