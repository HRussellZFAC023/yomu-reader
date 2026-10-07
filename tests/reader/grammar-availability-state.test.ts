import { afterEach, describe, expect, it, vi } from 'vitest';

import { activeLearningTarget } from '../../src/reader/languages';
import { renderStudyToolResult } from '../../src/reader/study/render-impl';
import { renderGrammarHints } from '../../src/reader/study/tools-impl';

afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe('grammar availability stays visible', () => {
    it('replaces the pending state with an honest no-match answer for a target with rules', async () => {
        document.body.innerHTML = `
            <section class="jpdb-reader-study-tools">
                <button type="button">Grammar</button>
                <div data-study-panel hidden></div>
            </section>`;
        const button = document.querySelector<HTMLButtonElement>('button')!;
        const panel = document.querySelector<HTMLElement>('[data-study-panel]')!;

        expect(activeLearningTarget().grammar.rules.length).toBeGreaterThan(0);
        await renderStudyToolResult(button, 'study-grammar', '猫。', [], 'en');

        expect(panel.hidden).toBe(false);
        expect(panel.dataset.grammarAvailability).toBe('empty');
        expect(panel.textContent).toContain('No built-in Japanese grammar patterns matched this sentence.');
        expect(panel.textContent).not.toContain('Finding grammar');
    });

    it('gives direct empty render callers the same stable no-match answer', async () => {
        const html = await renderGrammarHints([], '猫。', undefined, 'en');

        expect(html).toContain('data-grammar-availability="empty"');
        expect(html).toContain('No built-in Japanese grammar patterns matched this sentence.');
    });
});
