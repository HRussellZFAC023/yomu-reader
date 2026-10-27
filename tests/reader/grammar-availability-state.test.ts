import '../../src/reader/companions/register-build-companions';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { activeLearningTarget } from '../../src/reader/languages';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import { StudySourceController } from '../../src/reader/study/sources';
import { renderGrammarHints } from '../../src/reader/study/tools-impl';
import type { ReaderSettings } from '../../src/reader/app/types';

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

describe('grammar availability stays visible', () => {
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
        const html = await renderGrammarHints([], '猫。', undefined, 'en');

        expect(html).toContain('data-grammar-availability="empty"');
        expect(html).toContain('No built-in Japanese grammar patterns matched this sentence.');
    });
});
