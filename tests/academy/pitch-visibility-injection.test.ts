import { afterEach, describe, expect, it, vi } from 'vitest';

interface ReaderRuntimeWindow extends Window {
    __yomuReaderAppInitialized?: boolean;
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete (window as ReaderRuntimeWindow).__yomuReaderAppInitialized;
    document.head.querySelectorAll('[data-yomu-hosted-academy-css], [data-yomu-hosted-academy-script], [data-yomu-hosted-academy-companion]').forEach(node => node.remove());
    document.body.replaceChildren();
});

describe('Academy pitch visibility integration', () => {
    it('boots the shared annotation runtime as soon as Japanese is present without waiting for selection', async () => {
        document.body.innerHTML = '<main data-yomu-runtime-surface><p lang="ja">言葉を読みます。</p></main>';
        const appendedAssets: Element[] = [];
        const nativeAppend = document.head.append.bind(document.head);

        vi.spyOn(document.head, 'append').mockImplementation((...nodes: (Node | string)[]) => {
            nativeAppend(...nodes);
            for (const node of nodes) {
                if (!(node instanceof Element)) continue;
                appendedAssets.push(node);
                queueMicrotask(() => {
                    if (node instanceof HTMLScriptElement && node.src.endsWith('/yomu.user.js')) {
                        (window as ReaderRuntimeWindow).__yomuReaderAppInitialized = true;
                    }
                    node.dispatchEvent(new Event('load'));
                });
            }
        });

        const { initYomuReaderRuntime } = await import('../../src/academy/yomu-inject');
        await expect(initYomuReaderRuntime()).resolves.toBe(true);

        const core = appendedAssets.find(
            (asset): asset is HTMLScriptElement => asset instanceof HTMLScriptElement && asset.src.endsWith('/yomu.user.js'),
        );
        const stylesheet = appendedAssets.find(
            (asset): asset is HTMLLinkElement => asset instanceof HTMLLinkElement && asset.href.endsWith('/yomu.css'),
        );
        expect(core?.id).toBe('yomu-hosted-academy-runtime');
        expect(core?.async).toBe(false);
        expect(stylesheet).toBeDefined();
        expect(document.getSelection()?.toString()).toBe('');
    });
});
