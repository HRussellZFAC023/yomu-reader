import '../../src/reader/companions/register-build-companions';
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectGrammarHints, renderGrammarHints, resetGrammarRuleDataCacheForTests } from '../../src/reader/study/tools';
import { afterEach } from "vitest";
import { activeLearningTarget } from "../../src/reader/languages";
import { DEFAULT_SETTINGS } from "../../src/reader/settings/index";
import { StudySourceController } from "../../src/reader/study/sources";
import { renderGrammarHints as renderGrammarHints2 } from "../../src/reader/study/tools-impl";
import type { ReaderSettings } from "../../src/reader/app/types";
import { GRAMMAR_PREFERENCES_KEY, readGrammarKnowledge, readGrammarPreferences, setGrammarRuleKnowledge, setGrammarRuleKnown } from "../../src/reader/study/grammar-knowledge";
import { GRAMMAR_PATTERN_DATA } from "../../src/reader/study/grammar-data";
import { parseGrammarRegistry, YOMU_GRAMMAR_REGISTRY } from "../../src/reader/study/grammar-registry";

/**
 * The grammar "Details" disclosure must never open onto what is already on screen.
 *
 * Reported from an owner screenshot as "the Details button does nothing".
 * Measured 2026-07-26, the control itself is fine: <details>/<summary> toggles in
 * Chromium, Firefox and WebKit under the real popover CSS, and the summary is not
 * a nested-parse root (see NESTED_PARSE_ROOT_SELECTOR), so no annotated word sits
 * inside it to steal the click. The defect is the body.
 *
 * grammar-registry.ts ships NO prose — a rule is id/level/name/pattern/url plus an
 * empty example list — so every explanation comes from the remote
 * en-grammar-rule-copy.json. When that request does not land,
 * `grammarHintFallbackData` fills BOTH `short` and `detail` with the rule name, and
 * the row already renders `short` one line above the disclosure. Opening Details
 * then showed the same `と` a second time.
 *
 * Both states are pinned below: with the real copy the disclosure exists and
 * carries the explanation, without it there is no disclosure at all and the match
 * line plus the guide link render inline.
 */
const EN_GRAMMAR_RULE_COPY = fs.readFileSync(path.resolve('docs/public/data/en-grammar-rule-copy.json'), 'utf8');
const OWNER_SENTENCE = 'Discordとは、アメリカで開発されたボイス・ビデオ・テキストコミュニケーションサービスです。';

function stubGrammarCopy(body: string | null): void {
    resetGrammarRuleDataCacheForTests();
    vi.stubGlobal('GM_xmlhttpRequest', undefined);
    vi.stubGlobal('fetch', vi.fn(() => (body === null
        ? Promise.reject(new Error('grammar rule copy unavailable'))
        : Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })))));
}

async function renderOwnerSentence(): Promise<string> {
    return renderGrammarHints(detectGrammarHints(OWNER_SENTENCE), OWNER_SENTENCE, undefined, 'en', {});
}

function firstItem(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    const item = root.querySelector<HTMLElement>('.jpdb-reader-study-item');
    if (!item) throw new Error('no grammar row rendered');
    return item;
}

function texts(item: HTMLElement, selector: string): string[] {
    return Array.from(item.querySelectorAll(selector), node => node.textContent?.trim() ?? '');
}

describe('grammar Details disclosure', () => {
    beforeEach(() => {
        resetGrammarRuleDataCacheForTests();
    });

    it('drops the disclosure when the remote copy is unavailable, instead of repeating the visible line', async () => {
        stubGrammarCopy(null);
        const item = firstItem(await renderOwnerSentence());

        // The fallback short line is the rule name, and that is all the row knows.
        expect(texts(item, '.jpdb-reader-study-short')).toEqual(['と']);
        expect(item.querySelector('.jpdb-reader-grammar-more')).toBeNull();
        expect(item.querySelector('summary')).toBeNull();
        // Nothing is lost by dropping it: both children move up into the row.
        expect(texts(item, '.jpdb-reader-study-match-text')).toEqual(['Discordと']);
        expect(item.querySelector<HTMLAnchorElement>('.jpdb-reader-study-guide')?.href)
            .toBe('https://www.tofugu.com/japanese-grammar/particle-to/');
    });

    it('never renders a detail line that repeats the short line above it', async () => {
        stubGrammarCopy(null);
        const root = document.createElement('div');
        root.innerHTML = await renderOwnerSentence();
        const items = root.querySelectorAll<HTMLElement>('.jpdb-reader-study-item');
        expect(items.length).toBeGreaterThan(0);
        for (const item of items) {
            const short = item.querySelector('.jpdb-reader-study-short')?.textContent?.trim();
            const detail = item.querySelector('.jpdb-reader-study-detail')?.textContent?.trim();
            expect(detail, `${short}`).toBeUndefined();
        }
    });

    it('keeps the disclosure when the remote copy explains the rule', async () => {
        stubGrammarCopy(EN_GRAMMAR_RULE_COPY);
        const item = firstItem(await renderOwnerSentence());

        const disclosure = item.querySelector<HTMLElement>('.jpdb-reader-grammar-more');
        expect(disclosure).not.toBeNull();
        expect(disclosure?.querySelector('summary')?.textContent?.trim()).toBe('Details');
        const short = item.querySelector('.jpdb-reader-study-short')?.textContent?.trim();
        const detail = disclosure?.querySelector('.jpdb-reader-study-detail')?.textContent?.trim();
        expect(short).toBe('marks with, and, or quoted content');
        expect(detail).toBe('Can mark who someone does something with, exact quoted content, comparison, or a complete list.');
        expect(detail).not.toBe(short);
        // Everything the collapsed row hid still lives behind the summary.
        expect(disclosure?.querySelector('.jpdb-reader-study-match-text')?.textContent?.trim()).toBe('Discordと');
        expect(disclosure?.querySelector('.jpdb-reader-grammar-examples')).not.toBeNull();
        expect(disclosure?.querySelector('.jpdb-reader-study-guide')).not.toBeNull();
    });

    it('shows a disclosure only where it has something to reveal', async () => {
        stubGrammarCopy(EN_GRAMMAR_RULE_COPY);
        const html = await renderOwnerSentence();
        const root = document.createElement('div');
        root.innerHTML = html;

        for (const item of root.querySelectorAll<HTMLElement>('.jpdb-reader-study-item')) {
            const disclosure = item.querySelector<HTMLElement>('.jpdb-reader-grammar-more');
            if (!disclosure) continue;
            const revealed = Boolean(disclosure.querySelector('.jpdb-reader-study-detail, .jpdb-reader-grammar-examples'));
            expect(revealed, item.querySelector('.jpdb-reader-study-name')?.textContent?.trim() ?? '').toBe(true);
        }
    });
});

describe('grammar availability stays visible', () => {
    afterEach(() => {
        document.body.replaceChildren();
        vi.restoreAllMocks();
    });

    function grammarController(): StudySourceController {
        const settings = { ...DEFAULT_SETTINGS, interfaceLanguage: 'en', studyGrammarEnabled: true } as ReaderSettings;
        return new StudySourceController({
            getSettings: () => settings,
            dictionarySourceAttributes: () => '',
            parseJapanese: async () => [],
            parsePopoverJapanese: () => undefined,
            enrichPitchWords: () => undefined,
            enrichAnkiWords: () => undefined,
            isCurrentPopoverRoot: () => true,
        });
    }


    it('replaces the pending state with an honest no-match answer for a target with rules', async () => {
        const controller = grammarController();
        document.body.innerHTML = `<div class="popover">${controller.renderGrammarSource('猫。')}</div>`;
        const popover = document.querySelector<HTMLElement>('.popover')!;
        const details = popover.querySelector<HTMLDetailsElement>('[data-study-grammar]')!;
        const panel = details.querySelector<HTMLElement>('[data-study-grammar-panel]')!;
        details.open = true;

        expect(activeLearningTarget().grammar.rules.length).toBeGreaterThan(0);
        controller.installLoaders(popover, '猫。');

        await vi.waitFor(() => expect(details.dataset.availability).toBe('empty'));
        expect(panel.textContent).toContain('No built-in Japanese grammar patterns matched this sentence.');
        expect(panel.textContent).not.toContain('Finding grammar');
    });

    it('gives direct empty render callers the same stable no-match answer', async () => {
        const html = await renderGrammarHints2([], '猫。', undefined, 'en');

        expect(html).toContain('data-grammar-availability="empty"');
        expect(html).toContain('No built-in Japanese grammar patterns matched this sentence.');
    });
});

describe('shared grammar knowledge state', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.stubGlobal('GM_getValue', undefined);
        vi.stubGlobal('GM_setValue', undefined);
    });

    afterEach(() => {
        localStorage.clear();
        vi.unstubAllGlobals();
    });

    it('migrates the Reader boolean preference into the canonical knowledge map', () => {
        localStorage.setItem(GRAMMAR_PREFERENCES_KEY, JSON.stringify({
            knownRuleIds: ['particle-wa', 'not-a-real-rule'],
            showKnown: true,
        }));

        expect(readGrammarKnowledge()).toEqual({
            entries: {
                'particle-wa': {
                    knowledge: 'known',
                    at: 0,
                    changeId: 'grammar-known:legacy:particle-wa',
                },
            },
            showKnown: true,
        });
        expect(readGrammarPreferences()).toEqual({ knownRuleIds: ['particle-wa'], showKnown: true });
    });

    it('uses GM storage as the cross-origin source while retaining old-reader compatibility', () => {
        const values = new Map<string, unknown>();
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => values.get(key) ?? fallback));
        vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => { values.set(key, value); }));

        setGrammarRuleKnowledge('particle-wa', 'mastered', { at: 42, changeId: 'grammar:test:42' });
        localStorage.clear();

        expect(readGrammarKnowledge().entries['particle-wa']).toEqual({
            knowledge: 'mastered',
            at: 42,
            changeId: 'grammar:test:42',
        });
        expect(values.get(GRAMMAR_PREFERENCES_KEY)).toMatchObject({
            version: 2,
            knownRuleIds: ['particle-wa'],
        });
    });

    it('makes the Reader known toggle update the same knowledge entry', () => {
        expect(setGrammarRuleKnown('particle-wa', true).knownRuleIds).toEqual(['particle-wa']);
        expect(readGrammarKnowledge().entries['particle-wa']?.knowledge).toBe('known');

        expect(setGrammarRuleKnown('particle-wa', false).knownRuleIds).toEqual([]);
        expect(readGrammarKnowledge().entries['particle-wa']?.knowledge).toBe('unknown');
    });

    it('does not rewrite an exact shared grammar fact', () => {
        const fact = { at: 42, changeId: 'grammar:test:42' };
        setGrammarRuleKnowledge('particle-wa', 'known', fact);
        const before = localStorage.getItem(GRAMMAR_PREFERENCES_KEY);

        setGrammarRuleKnowledge('particle-wa', 'known', fact);

        expect(localStorage.getItem(GRAMMAR_PREFERENCES_KEY)).toBe(before);
        expect(readGrammarKnowledge().entries['particle-wa']).toEqual({ knowledge: 'known', ...fact });
    });
});

describe('grammar registry in the compiled extension', () => {
    // UserScript Compiler indents the whole userscript body by four spaces,
    // template-literal text included, so the packaged content script sees
    // every rule row after the first with leading spaces.
    it('keeps the authored rule ids when the rule table arrives indented', () => {
        const compiled = GRAMMAR_PATTERN_DATA.split('\n').map(line => `    ${line}`).join('\n');
        const ids = parseGrammarRegistry(compiled).map(rule => rule.ruleId);
        expect(ids).toEqual(YOMU_GRAMMAR_REGISTRY.map(rule => rule.ruleId));
        expect(ids.every(id => id === id.trim())).toBe(true);
    });
});
