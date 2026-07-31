import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JPDBToken } from '../../src/reader/app/types';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages/target-runtime';
import { lookupPopoverDictionaryLinkRequest } from '../../src/reader/newtab/lookup-dom';
import { NewTabRuntime } from '../../src/reader/newtab/runtime';
import { NewTabTargetParseCache } from '../../src/reader/newtab/target-parse-cache';
import { NewTabLookupTargetScope } from '../../src/reader/newtab/target-scope';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

beforeEach(() => resetActiveLearningTargetLanguage());
afterEach(() => {
    resetActiveLearningTargetLanguage();
    document.body.innerHTML = '';
});

describe('New Tab target scope modules', () => {
    it('keeps an away-and-back target switch outside the previous render epoch', () => {
        const scope = new NewTabLookupTargetScope();
        const request = scope.nextRender();
        expect(scope.isCurrentRender(request)).toBe(true);

        setActiveLearningTargetLanguage('ko');
        setActiveLearningTargetLanguage('ja');

        expect(scope.isCurrentRender(request)).toBe(false);
    });

    it('does not reuse parsed cards across target generations', async () => {
        const parse = vi.fn(async (): Promise<JPDBToken[][]> => []);
        const cache = new NewTabTargetParseCache({
            getSettings: () => DEFAULT_SETTINGS,
            parse,
            defaultTimeoutMs: 1_200,
            ttlMs: 30_000,
            limit: 10,
        });

        await cache.load(['同じ']);
        await cache.load(['同じ']);
        expect(parse).toHaveBeenCalledTimes(1);

        setActiveLearningTargetLanguage('ko');
        setActiveLearningTargetLanguage('ja');
        await cache.load(['同じ']);

        expect(parse).toHaveBeenCalledTimes(2);
    });

    it('recognizes popup dictionary links in the active non-Japanese target', () => {
        setActiveLearningTargetLanguage('ko');
        const popover = document.createElement('section');
        popover.innerHTML = '<a class="gloss-link" data-dictionary-lookup="한국어" data-dictionary-reading="한국어">한국어</a>';
        document.body.append(popover);
        const link = popover.querySelector<HTMLAnchorElement>('a')!;
        let request: ReturnType<typeof lookupPopoverDictionaryLinkRequest>;
        const click = new MouseEvent('click', { bubbles: true, cancelable: true });
        popover.addEventListener('click', event => {
            request = lookupPopoverDictionaryLinkRequest(event as MouseEvent, popover);
        });

        link.dispatchEvent(click);

        expect(request).toEqual({ link, text: '한국어', reading: '한국어' });
        expect(click.defaultPrevented).toBe(true);
    });

    it('looks up an uncached parsed word in the active non-Japanese target', () => {
        setActiveLearningTargetLanguage('ko');
        const lookupText = vi.fn();
        const runtime = new NewTabRuntime() as unknown as {
            lookupText: typeof lookupText;
            lookupParsedWordWithoutCard(word: HTMLElement, expression: string): void;
            destroy(): void;
        };
        runtime.lookupText = lookupText;
        const word = document.createElement('span');
        word.dataset.sentence = '한국어를 공부해요.';

        runtime.lookupParsedWordWithoutCard(word, '한국어');

        expect(lookupText).toHaveBeenCalledWith('한국어', '한국어', word, expect.objectContaining({
            navigation: 'push-current',
            reuseActivePopover: true,
            userGesture: true,
        }));
        runtime.destroy();
    });
});
