import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

// An underline is drawn only for information the learner has a colour for.
// Not-in-deck has no colour picker, so on the JPDB and Status underlines it
// ranks below every other state: alone it draws nothing, and beside a state
// the learner did pick a colour for (JPDB New that Anki lacks, a Study word
// Anki tracks) that state's colour shows. These tests replay the stylesheets'
// own cascade, so a reordered or added state rule cannot silently strip a
// learner-chosen colour (or bring the grey back).
// scripts/underline-colour-sources-smoke.mjs checks the painted result in real
// engines.

const WORD_CSS = rules(readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8'));
const SUBTITLE_CSS = rules(readFileSync('src/reader/styles/subtitles-youtube.css', 'utf8'));
const CSS = [...WORD_CSS, ...SUBTITLE_CSS];

// Mirrors RENDERED_WORD_CARD_STATES (dom/rendered-word-state.ts) and
// ANKI_CARD_STATE_PRIORITY (anki/card-details.ts).
const CARD_STATES = ['new', 'learning', 'young', 'mature', 'known', 'mastered', 'due', 'failed', 'locked', 'never-forget', 'blacklisted', 'suspended', 'in-deck', 'not-in-deck', 'redundant', 'frequent', 'unparsed'];
const ANKI_STATES = ['failed', 'due', 'learning', 'known', 'new', 'suspended', 'in-deck', 'not-in-deck'];
const CHANNELS = ['jpdb', 'status'] as const;
type Channel = typeof CHANNELS[number];

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

function declared(rule: Rule, name: string): string | undefined {
    return rule.body.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}:`))?.slice(name.length + 1).trim();
}

// The rules a word can match for one property share one specificity, so the
// last match in source order wins.
function winner(word: HTMLElement, name: string, candidates: Rule[] = CSS): string | undefined {
    const rule = candidates.filter(entry => declared(entry, name) !== undefined && word.matches(entry.selector)).at(-1);
    return rule && declared(rule, name);
}

// Resolves a value down to a state token ('new', 'learning' …), 'transparent',
// or 'unset'. The -readable twin of a state token names the same state.
function evaluate(word: HTMLElement, value: string | undefined): string {
    if (value === undefined) return 'unset';
    const reference = value.match(/^var\((--[\w-]+)(?:,\s*(.*))?\)$/);
    if (!reference) return value;
    const [, name, fallback] = reference;
    const state = name!.match(/^--jpdb-reader-state-(.+?)(?:-readable)?$/);
    if (state) return state[1]!;
    const resolved = evaluate(word, winner(word, name!));
    return resolved === 'unset' && fallback !== undefined ? evaluate(word, fallback) : resolved;
}

// What the channel's colour cascade picks once not-in-deck ranks last: the
// winning state among the others, or nothing.
function expectedUnderline(word: HTMLElement, channel: Channel): string {
    const colour = winner(word, `--jpdb-reader-${channel}-color`, WORD_CSS.filter(rule => (
        declared(rule, `--jpdb-reader-${channel}-color`) !== 'var(--jpdb-reader-state-not-in-deck)'
    )));
    return colour === undefined ? 'transparent' : evaluate(word, colour);
}

const PAGE_DECORATION_RULES = WORD_CSS.filter(rule => rule.selector !== '.jpdb-reader-word');
const SUBTITLE_UNDERLINE_RULES = SUBTITLE_CSS.filter(rule => rule.selector.includes('jpdb-reader-subtitle-underline-'));
const pageUnderline = (word: HTMLElement) => evaluate(word, winner(word, '--jpdb-reader-word-decoration-source', PAGE_DECORATION_RULES));
const subtitleUnderline = (word: HTMLElement) => evaluate(word, winner(word, '--jpdb-reader-word-underline', SUBTITLE_UNDERLINE_RULES));
const wordMarkup = (classes: string) => `<span class="jpdb-reader-word ${classes}">語</span>`;
const subtitleMarkup = (container: string) => (mode: string, classes: string) => `<div class="jpdb-reader-subtitle-underline-${mode}"><div class="${container}">${wordMarkup(classes)}</div></div>`;

const surfaces = [
    { name: 'page', underline: pageUnderline, markup: (mode: string, classes: string) => `<p class="jpdb-reader-word-underline-${mode}">${wordMarkup(classes)}</p>` },
    // Additive mirrors (YouTube buttons, menus, comments) paint every colour
    // mode as an underline; the highlight lane must not bring the grey back.
    {
        name: 'mirror',
        underline: pageUnderline,
        markup: (mode: string, classes: string) => `<p class="jpdb-reader-word-highlight-${mode}"><span class="jpdb-reader-text-mirror jpdb-reader-additive-text-mirror">${wordMarkup(classes)}</span></p>`,
    },
    // The cue on the video takes raw state colours, the transcript readable ones.
    { name: 'video subtitle', underline: subtitleUnderline, markup: subtitleMarkup('jpdb-subtitle-primary') },
    { name: 'transcript subtitle', underline: subtitleUnderline, markup: subtitleMarkup('jpdb-subtitle-row-text') },
];

describe('deck-status underline for words in no deck', () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    for (const surface of surfaces) {
        it(`ranks not-in-deck last on the ${surface.name} underline`, () => {
            const underline = (mode: Channel, classes: string) => surface.underline(mount(surface.markup(mode, classes)));
            const cases = CHANNELS.flatMap(mode => wordStateClassSets().map(classes => {
                const mounted = mount(surface.markup(mode, classes.join(' ')));
                return { mode, classes: classes.join(' '), expected: expectedUnderline(mounted, mode), actual: surface.underline(mounted) };
            }));

            expect(cases.filter(entry => entry.actual !== entry.expected)).toEqual([]);
            expect(cases.filter(entry => entry.expected === 'transparent').length).toBeGreaterThan(0);
            expect(cases.some(entry => entry.actual === 'not-in-deck')).toBe(false);
            // Not-in-deck alone draws nothing.
            expect(underline('jpdb', 'jpdb-not-in-deck')).toBe('transparent');
            expect(underline('status', 'jpdb-not-in-deck jiten-not-in-deck')).toBe('transparent');
            // A JPDB New word Anki lacks, and an Ignored one under Status.
            expect(underline('jpdb', 'jpdb-new jpdb-not-in-deck')).toBe('new');
            expect(underline('status', 'jpdb-new jpdb-not-in-deck')).toBe('new');
            expect(underline('status', 'jpdb-blacklisted jpdb-not-in-deck')).toBe('ignored');
            // A known word Anki lacks.
            expect(underline('jpdb', 'jpdb-known jpdb-not-in-deck')).toBe('known');
            // Study: a keyless Jiten word Anki tracks shows its Anki state.
            expect(underline('status', 'jpdb-not-in-deck jiten-not-in-deck anki-learning')).toBe('learning');
            expect(underline('status', 'jpdb-not-in-deck anki-new')).toBe('new');
        });
    }

    it('routes every JPDB and Status underline through the not-in-deck view', () => {
        // The raw decoration still carries the not-in-deck grey; only the
        // highlight wash and text colour may read it.
        const rawUnderlines = WORD_CSS.filter(rule => /--jpdb-reader-word-decoration-source: var\(--jpdb-reader-source-(jpdb|status)-decoration/.test(rule.body));
        expect(rawUnderlines.map(rule => rule.selector)).toEqual([]);
    });

    it('keeps the pitch underline on a not-in-deck word', () => {
        const pitchWord = mount(surfaces[0]!.markup('pitch', 'jpdb-not-in-deck jpdb-pitch-heiban'));
        expect(winner(pitchWord, '--jpdb-reader-word-decoration-source', PAGE_DECORATION_RULES))
            .toBe('var(--jpdb-reader-source-pitch-decoration, transparent)');
    });

    it('keeps the not-in-deck rules at the specificity of the rules they override', () => {
        // Source order alone must decide. A state qualifier outside :where()
        // would also outrank rules meant to win, such as Study's headword
        // keeping its pitch underline in every mode; the smoke checks that
        // headword in a real engine.
        const notInDeckRules = [
            ...WORD_CSS.filter(rule => rule.selector.includes('not-in-deck') && /--jpdb-reader-(jpdb|status)-underline:/.test(rule.body)),
            ...SUBTITLE_CSS.filter(rule => rule.selector.includes('not-in-deck') && rule.body.startsWith('--jpdb-reader-word-underline:')),
        ];
        expect(notInDeckRules.length).toBeGreaterThanOrEqual(9);
        for (const rule of notInDeckRules) {
            for (const selector of selectorsWithoutWhere(rule.selector)) {
                const bare = selector === '.jpdb-reader-word'
                    || CHANNELS.some(mode => mount(surfaces[2]!.markup(mode, '')).matches(selector));
                expect(bare, selector).toBe(true);
            }
        }
    });

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

// Each selector in a list, minus its :where(…) groups (nested up to two
// levels): what is left is the part that carries specificity.
function selectorsWithoutWhere(list: string): string[] {
    return list.replace(/:where\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/g, '')
        .split(/,(?![^()]*\))/)
        .map(selector => selector.trim());
}

// WCAG 1.4.1: colour is never the only cue. Under a state underline a word
// still being learned draws its line dashed and a due word dotted, so neither
// depends on hue (simulated protan and deutan vision merges due teal with the
// New grey on a light page).
describe('state underline style', () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    it('dashes a learning word, dots a due one and keeps New and Failed solid', () => {
        const style = (mode: string, classes: string) => winner(mount(`<p class="jpdb-reader-word-underline-${mode}">${wordMarkup(classes)}</p>`), '--jpdb-reader-word-underline-style');
        for (const mode of ['status', 'jpdb']) {
            expect(style(mode, 'jpdb-learning')).toBe('dashed');
            expect(style(mode, 'jpdb-young')).toBe('dashed');
            expect(style(mode, 'jpdb-due')).toBe('dotted');
            for (const state of ['new', 'failed', 'known']) expect(style(mode, `jpdb-${state}`)).toBe('solid');
        }
        expect(style('review', 'anki-learning')).toBe('dashed');
        expect(style('review', 'anki-due')).toBe('dotted');
        expect(style('pitch', 'jpdb-learning')).toBe('solid');
    });
});
