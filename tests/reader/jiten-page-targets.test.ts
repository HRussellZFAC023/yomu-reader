import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentJitenTermTarget } from '../../src/reader/jiten/jiten-page-targets';

function stubStudyLocation(): void {
    vi.stubGlobal('location', {
        href: 'https://jiten.moe/srs/study',
        origin: 'https://jiten.moe',
        hostname: 'jiten.moe',
        pathname: '/srs/study',
        search: '',
    });
}

function renderStudyPage(options: { revealed: boolean }): void {
    document.title = '百科事典 - Jiten';
    document.body.innerHTML = `
        <main>
            <div class="flex-grow flex flex-col">
                ${options.revealed ? '' : '<button type="button">Show Answer</button>'}
                <div class="relative touch-pan-y">
                    <div class="absolute inset-0 rounded-2xl pointer-events-none z-10 bg-green-500"></div>
                    <div class="w-full mx-auto">
                        <div class="relative bg-surface-0 rounded-2xl shadow-lg" data-case="card">
                            <div lang="ja" data-case="headword">百科事典</div>
                            <div data-case="kanji-breakdown">Kanji breakdown</div>
                            <div data-case="composed-of">Composed of</div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    `;
}

describe('jiten study-page addon anchor', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.replaceChildren();
    });

    it('anchors the addon inside the revealed study card, after its last section', () => {
        stubStudyLocation();
        renderStudyPage({ revealed: true });

        const target = currentJitenTermTarget();

        // Anchored to the card's last section: insertAdjacentElement('afterend')
        // places the addon INSIDE the card, after Composed of.
        expect(target?.anchor.dataset.case).toBe('composed-of');
        expect(target?.anchor.closest('[data-case="card"]')).not.toBeNull();
    });

    it('keeps the coarse fallback anchor while the answer is hidden so nothing spoils the front', () => {
        stubStudyLocation();
        renderStudyPage({ revealed: false });

        const target = currentJitenTermTarget();

        // No target at all during the question phase: mounting dictionary
        // entries anywhere on the page would spoil the answer. The refresh
        // loop mounts the addon inside the card right after reveal.
        expect(target).toBeNull();
    });
});
