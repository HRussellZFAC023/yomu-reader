import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
    document.body.replaceChildren();
    document.head.querySelectorAll('[data-bootstrap-fixture], [data-yomu-hosted-academy-css]').forEach(node => node.remove());
    localStorage.clear();
    vi.restoreAllMocks();
});

describe('Academy Reader bootstrap storage ownership', () => {
    it.each([null, JSON.stringify({ theme: 'dark', showFurigana: false })])('does not create or replace learner settings during startup (%s)', async initial => {
        vi.resetModules();
        const key = 'jpdb-popup-reader-settings';
        localStorage.clear();
        if (initial !== null) localStorage.setItem(key, initial);
        const write = vi.spyOn(Storage.prototype, 'setItem');
        const root = document.createElement('main');
        root.id = 'yomu-academy';
        root.innerHTML = '<p lang="ja">日本語を読みます。</p>';
        document.body.replaceChildren(root);
        const graph = document.createElement('script');
        graph.dataset.bootstrapFixture = '';
        graph.src = 'https://yomureader.com/hosted-runtime-graph.js?v=s1-cafebabe0000';
        document.head.append(graph);
        const { initYomuReaderRuntime } = await import('../../src/academy/integration/yomu-runtime');
        const starting = initYomuReaderRuntime();
        await vi.waitFor(() => expect(document.querySelector('[data-yomu-hosted-academy-css]')).not.toBeNull());
        // A failed asset load must not leave an unwitnessed settings record behind.
        for (let attempt = 0; attempt < 8; attempt++) {
            const stylesheet = document.querySelector('[data-yomu-hosted-academy-css]');
            if (!stylesheet) break;
            stylesheet.dispatchEvent(new Event('error'));
        }
        await expect(starting).resolves.toBe(false);
        expect(root.querySelector('p')?.dataset.yomuRuntimeSurface).toBe('academy-copy');
        expect(localStorage.getItem(key)).toBe(initial);
        expect(write.mock.calls.filter(([name]) => name === key)).toEqual([]);
    });
});
