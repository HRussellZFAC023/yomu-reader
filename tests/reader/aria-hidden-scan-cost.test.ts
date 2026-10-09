import { afterEach, describe, expect, it } from 'vitest';
import { collectFragmentTextTargetsIn, collectTextTargetsIn } from '../../src/reader/dom';

// A click opens the lookup as a modal dialog, which hides every page sibling
// with aria-hidden="true". The next scan then asked, for each Japanese text
// node, whether its aria-hidden root was a painted duplicate of an aria-label
// name, reading the root's whole text each time even when no aria-label was
// in sight. On the recorded Japanese Wikipedia article in the built extension
// that was a 5.9 s frozen tab after every click lookup, twice.
describe('scanning under a modal lookup', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    function hiddenArticle(paragraphs: number): { root: HTMLElement; reads: () => number } {
        const root = document.createElement('div');
        root.setAttribute('aria-hidden', 'true');
        for (let index = 0; index < paragraphs; index += 1) {
            const paragraph = document.createElement('p');
            paragraph.textContent = `日本語は日本の言語です。第${index}段落`;
            root.appendChild(paragraph);
        }
        document.body.appendChild(root);
        const textContent = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!;
        let reads = 0;
        Object.defineProperty(root, 'textContent', {
            configurable: true,
            get() {
                reads += 1;
                return textContent.get!.call(this);
            },
            set(value: string) {
                textContent.set!.call(this, value);
            },
        });
        return { root, reads: () => reads };
    }

    it('does not read a hidden root with no accessible name once per text node', () => {
        const article = hiddenArticle(60);

        collectTextTargetsIn(document.body, 200, false);
        collectFragmentTextTargetsIn(document.body, 200, false, '[aria-hidden="true"],svg', { allowUiText: true, minLength: 1 });

        expect(article.reads()).toBeLessThan(5);
    });
});
