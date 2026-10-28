import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectGrammarHints, renderGrammarHints, resetGrammarRuleDataCacheForTests } from '../../src/reader/study/tools';

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
