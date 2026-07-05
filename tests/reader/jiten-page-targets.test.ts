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

function stubParseLocation(query: string): void {
    vi.stubGlobal('location', {
        href: `https://jiten.moe/parse?text=${encodeURIComponent(query)}`,
        origin: 'https://jiten.moe',
        hostname: 'jiten.moe',
        pathname: '/parse',
        search: `?text=${encodeURIComponent(query)}`,
    });
}

describe('jiten parse-page addon target', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.replaceChildren();
        document.title = '';
    });

    it('produces no target on a no-results search page (garbage title term + body anchor)', () => {
        stubParseLocation('ペッパピック');
        document.title = 'Search ペッパピック - Jiten';
        document.body.innerHTML = '<div id="__nuxt"><header>Jiten</header><p>No results found for "ペッパピック"</p></div>';

        // Neither bug may resurface: the title fallback must refuse the
        // "Search <query>" chrome as a headword, and with no content column
        // there is no anchor — a document.body anchor once mounted an
        // Immersion Kit addon above the whole app shell.
        expect(currentJitenTermTarget()).toBeNull();
    });

    it('produces no target before the vocab column hydrates, even with a Japanese title', () => {
        stubParseLocation('食べる');
        document.title = '食べる - Jiten';
        document.body.innerHTML = '<div id="__nuxt"></div>';

        expect(currentJitenTermTarget()).toBeNull();
    });

    it('anchors after the vocab column\'s last child once hydrated', () => {
        stubParseLocation('食べる');
        document.title = 'Search 食べる - Jiten';
        document.body.innerHTML = `
            <div id="__nuxt">
                <div class="flex flex-col max-w-2xl">
                    <div class="text-3xl" lang="ja">食べる</div>
                    <div class="mt-2" data-case="last">senses</div>
                </div>
            </div>
        `;

        const target = currentJitenTermTarget();

        expect(target?.term).toBe('食べる');
        expect(target?.anchor.dataset.case).toBe('last');
    });
});

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
