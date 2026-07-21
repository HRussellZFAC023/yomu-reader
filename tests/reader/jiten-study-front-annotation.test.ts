import { afterEach, describe, expect, it, vi } from 'vitest';
import { isJitenStudyFrontPrompt } from '../../src/reader/jiten/jiten-page-targets';

// On the QUESTION side of a jiten SRS study card the learner should see only the
// headword and recall the reading themselves. The scan drops the front headword
// (plain prompt) instead of annotating it with furigana + a pitch underline, and
// re-annotates once the answer is revealed. This guards the front-detection
// predicate wired into src/reader/app/site-parsers.ts
// (isReviewCardFrontPromptTarget -> shouldRejectProfileScanTarget).

function stubLocation(pathname: string): void {
    vi.stubGlobal('location', {
        href: `https://jiten.moe${pathname}`,
        origin: 'https://jiten.moe',
        hostname: 'jiten.moe',
        pathname,
        search: '',
    });
}

function renderStudyCard(options: { revealed: boolean }): HTMLElement {
    document.body.innerHTML = `
        <main>
            <div class="flex-grow flex flex-col">
                ${options.revealed ? '' : '<button type="button">Show Answer</button>'}
                <div class="relative touch-pan-y">
                    <div class="w-full mx-auto">
                        <div class="relative bg-surface-0 rounded-2xl shadow-lg" data-case="card">
                            <div class="text-5xl" lang="ja" data-case="headword">友達</div>
                        </div>
                    </div>
                </div>
            </div>
            <p lang="ja" data-case="chrome">読み込み中</p>
        </main>
    `;
    return document.querySelector<HTMLElement>('[data-case="headword"]')!;
}

describe('jiten study front prompt detection', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.replaceChildren();
    });

    it('flags the study-card headword while the answer is hidden', () => {
        stubLocation('/srs/study');
        const headword = renderStudyCard({ revealed: false });
        expect(isJitenStudyFrontPrompt(headword)).toBe(true);
    });

    it('does not flag the headword once the answer is revealed', () => {
        stubLocation('/srs/study');
        const headword = renderStudyCard({ revealed: true });
        expect(isJitenStudyFrontPrompt(headword)).toBe(false);
    });

    it('does not flag page chrome outside the study card', () => {
        stubLocation('/srs/study');
        renderStudyCard({ revealed: false });
        const chrome = document.querySelector<HTMLElement>('[data-case="chrome"]')!;
        expect(isJitenStudyFrontPrompt(chrome)).toBe(false);
    });

    it('does not flag anything on a non-study jiten page', () => {
        stubLocation('/vocabulary/1234');
        const headword = renderStudyCard({ revealed: false });
        expect(isJitenStudyFrontPrompt(headword)).toBe(false);
    });
});
