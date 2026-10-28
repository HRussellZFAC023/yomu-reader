import { describe, expect, it } from 'vitest';
import { glossaryToHtml } from '../../src/reader/dictionaries/yomitan';

describe('dictionary structured images', () => {
    it('renders imported local image data with alt fallback text', () => {
        document.body.innerHTML = `
            <div class="jpdb-reader-local-glossary jpdb-reader-parseable">
                ${glossaryToHtml({ type: 'image', path: 'data:image/png;base64,aW1hZ2U=', description: 'アクセント図', width: 40, height: 20 }, 'Jitendex')}
            </div>
        `;

        const container = document.querySelector<HTMLElement>('.gloss-image-link')!;
        const image = container.querySelector<HTMLImageElement>('img.gloss-image')!;
        expect(container.dataset.imageLoadState).toBe('loaded');
        expect(image.alt).toBe('アクセント図');
        expect(image.src).toBe('data:image/png;base64,aW1hZ2U=');
        expect(container.textContent).toContain('アクセント図');
    });

    it('keeps fallback text visible when dictionary media is unavailable', () => {
        document.body.innerHTML = `
            <div class="jpdb-reader-local-glossary jpdb-reader-parseable">
                ${glossaryToHtml({ type: 'image', path: 'media/missing.png', alt: '図なし', width: 20, height: 20 }, 'Jitendex')}
            </div>
        `;

        const container = document.querySelector<HTMLElement>('.gloss-image-link')!;
        const image = container.querySelector<HTMLImageElement>('img.gloss-image')!;
        expect(container.dataset.imageLoadState).toBe('error');
        expect(image.hasAttribute('src')).toBe(false);
        expect(container.textContent).toContain('図なし');
    });
});
