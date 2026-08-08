import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import {
    activeLearningTarget,
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages';
import { renderStudyToolResult } from '../../src/reader/study/render-impl';
import { StudySourceController } from '../../src/reader/study/sources';
import { renderGrammarHints } from '../../src/reader/study/tools-impl';

afterEach(() => {
    resetActiveLearningTargetLanguage();
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

    it('keeps a non-Japanese target row mounted when its checked rules do not match', async () => {
        expect(setActiveLearningTargetLanguage('ko')).not.toBeNull();
        expect(activeLearningTarget().grammar.rules).toHaveLength(1);
        const root = document.createElement('div');
        document.body.append(root);
        const controller = new StudySourceController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, interfaceLanguage: 'en', studyGrammarEnabled: true }),
            dictionarySourceAttributes: () => 'open',
            parseJapanese: vi.fn(async () => []),
            parsePopoverJapanese: vi.fn(),
            enrichPitchWords: vi.fn(),
            enrichAnkiWords: vi.fn(),
            isCurrentPopoverRoot: candidate => candidate === root,
        });

        root.innerHTML = controller.renderGrammarSource('한국어 문장입니다.');
        controller.installLoaders(root, '한국어 문장입니다.');

        await vi.waitFor(() => expect(root.textContent).not.toContain('Finding grammar'));
        const row = root.querySelector<HTMLElement>('[data-study-grammar]');
        expect(row).not.toBeNull();
        expect(row?.dataset.availability).toBe('empty');
        expect(row?.textContent).toContain('No built-in Korean grammar patterns matched this sentence.');
    });
});
