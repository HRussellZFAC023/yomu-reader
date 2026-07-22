import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    installProviderExampleBehaviors,
    renderProviderExamples,
    type ProviderExampleView,
} from '../../src/reader/sources/provider-examples';

function renderExample(provider: 'bunpro' | 'jiten' | 'jpdb', translation: string): HTMLElement {
    const example: ProviderExampleView = {
        id: 'example-1',
        sentence: '毎日復習する。',
        sentenceHtml: '毎日復習する。',
        translation,
    };
    document.body.innerHTML = renderProviderExamples(
        provider,
        provider,
        { availability: 'loaded', items: [example] },
        key => `data-source-state-key="${key}"`,
        'en',
    );
    return document.body.querySelector<HTMLElement>('details')!;
}

describe('provider example translations', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it.each(['bunpro', 'jiten', 'jpdb'] as const)('blurs native %s translations until click', provider => {
        const root = renderExample(provider, 'I review every day.');
        const translation = root.querySelector<HTMLElement>('[data-provider-example-translation]')!;

        installProviderExampleBehaviors(root, {
            language: 'en',
            blurTranslations: true,
            translate: vi.fn(),
        });

        expect(translation.dataset.providerTranslationBlurred).toBe('true');
        expect(translation.textContent).toBe('I review every day.');
        translation.click();
        expect(translation.dataset.providerTranslationBlurred).toBeUndefined();
        expect(translation.getAttribute('role')).toBeNull();
    });

    it('fills a missing provider translation and keeps it blurred until keyboard reveal', async () => {
        const root = renderExample('jiten', '');
        const translation = root.querySelector<HTMLElement>('[data-provider-example-translation]')!;
        const translate = vi.fn(async () => 'I review every day.');

        installProviderExampleBehaviors(root, {
            language: 'en',
            blurTranslations: true,
            translate,
        });

        await vi.waitFor(() => expect(translation.hidden).toBe(false));
        expect(translate).toHaveBeenCalledWith('毎日復習する。', 'en');
        expect(translation.textContent).toBe('I review every day.');
        expect(translation.dataset.providerTranslationBlurred).toBe('true');
        translation.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(translation.dataset.providerTranslationBlurred).toBeUndefined();
    });

    it('shows provider translations immediately when translation blur is disabled', async () => {
        const root = renderExample('jiten', '');
        const translation = root.querySelector<HTMLElement>('[data-provider-example-translation]')!;

        installProviderExampleBehaviors(root, {
            language: 'en',
            blurTranslations: false,
            translate: async () => 'I review every day.',
        });

        await vi.waitFor(() => expect(translation.hidden).toBe(false));
        expect(translation.dataset.providerTranslationBlurred).toBeUndefined();
    });
});
