import { afterEach, describe, expect, it } from 'vitest';
import { DictionarySourceStateController } from '../../src/reader/sources/state';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';

const createController = () =>
    new DictionarySourceStateController({
        getSettings: () => DEFAULT_SETTINGS,
        onStateChange: () => undefined,
    });

const installTrackedSource = (options: {
    key: string;
    initialOpen: boolean;
    title: string;
    open?: boolean;
}) => {
    const controller = createController();
    const root = document.createElement('div');
    root.innerHTML = `
        <details data-source-state-key="${options.key}" data-source-initial-open="${options.initialOpen}"${options.open ? ' open' : ''}>
            <summary class="jpdb-reader-local-title">${options.title}</summary>
        </details>
    `;
    const details = root.querySelector<HTMLDetailsElement>('details');
    expect(details).not.toBeNull();
    controller.installTracking(root);
    return details!;
};

describe('dictionary source open state', () => {
    afterEach(() => {
        document.body.replaceChildren();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('persists collapsed source sections across controller instances', () => {
        const details = installTrackedSource({
            key: 'kanji:__kanji_jpdb__',
            initialOpen: true,
            title: 'JPDB kanji',
            open: true,
        });

        details.open = false;
        details.dispatchEvent(new Event('toggle', { bubbles: false }));

        const second = createController();
        expect(second.isOpen('kanji:__kanji_jpdb__', true)).toBe(false);
        expect(second.attributes('kanji:__kanji_jpdb__', true)).not.toContain(' open');
    });

    it('applies remembered open overrides when rendering an initially closed source', () => {
        const details = installTrackedSource({
            key: 'definition:immersion-kit',
            initialOpen: false,
            title: 'Immersion Kit',
        });

        details.open = true;
        details.dispatchEvent(new Event('toggle', { bubbles: false }));

        const second = createController();
        expect(second.attributes('definition:immersion-kit', false)).toContain(' open');
    });
});
