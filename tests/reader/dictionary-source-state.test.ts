import { afterEach, describe, expect, it } from 'vitest';
import { DictionarySourceStateController } from '../../src/reader/dictionary-source-state';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

describe('dictionary source open state', () => {
    afterEach(() => {
        document.body.replaceChildren();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('persists collapsed source sections across controller instances', () => {
        const first = new DictionarySourceStateController({
            getSettings: () => DEFAULT_SETTINGS,
            onStateChange: () => undefined,
        });
        const root = document.createElement('div');
        root.innerHTML = `
            <details data-source-state-key="kanji:__kanji_jpdb__" data-source-initial-open="true" open>
                <summary class="jpdb-reader-local-title">JPDB kanji</summary>
            </details>
        `;
        const details = root.querySelector<HTMLDetailsElement>('details');
        expect(details).not.toBeNull();
        first.installTracking(root);

        details!.open = false;
        details!.dispatchEvent(new Event('toggle', { bubbles: false }));

        const second = new DictionarySourceStateController({
            getSettings: () => DEFAULT_SETTINGS,
            onStateChange: () => undefined,
        });
        expect(second.isOpen('kanji:__kanji_jpdb__', true)).toBe(false);
        expect(second.attributes('kanji:__kanji_jpdb__', true)).not.toContain(' open');
    });

    it('can render a source closed without applying a remembered open override', () => {
        const first = new DictionarySourceStateController({
            getSettings: () => DEFAULT_SETTINGS,
            onStateChange: () => undefined,
        });
        const root = document.createElement('div');
        root.innerHTML = `
            <details data-source-state-key="definition:immersion-kit" data-source-initial-open="false">
                <summary class="jpdb-reader-local-title">Immersion Kit</summary>
            </details>
        `;
        const details = root.querySelector<HTMLDetailsElement>('details');
        expect(details).not.toBeNull();
        first.installTracking(root);

        details!.open = true;
        details!.dispatchEvent(new Event('toggle', { bubbles: false }));

        const second = new DictionarySourceStateController({
            getSettings: () => DEFAULT_SETTINGS,
            onStateChange: () => undefined,
        });
        expect(second.attributes('definition:immersion-kit', false)).toContain(' open');
        expect(second.closedAttributes('definition:immersion-kit')).toBe('data-source-state-key="definition:immersion-kit" data-source-initial-open="false"');
    });
});
