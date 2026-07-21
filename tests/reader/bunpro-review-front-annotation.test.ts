import { afterEach, describe, expect, it, vi } from 'vitest';
import { isBunproReviewFrontPrompt } from '../../src/reader/bunpro/page-targets';

function stubReviews(): void {
    vi.stubGlobal('location', {
        href: 'https://bunpro.jp/reviews?only_review=vocab',
        origin: 'https://bunpro.jp',
        hostname: 'bunpro.jp',
        pathname: '/reviews',
        search: '?only_review=vocab',
    });
}

function renderQuiz(revealed: boolean): HTMLElement {
    document.body.innerHTML = `
        <nav><span lang="ja" data-case="chrome">復習</span></nav>
        <main id="js-quiz">
            <section id="js-tour-quiz-question"><span lang="ja" data-case="prompt">友達</span></section>
            ${revealed
                ? '<section id="js-tour-quiz-answer"><span lang="ja" data-case="answer">ともだち</span></section>'
                : '<button class="InputFlashcardReveal">Reveal</button>'}
        </main>
    `;
    return document.querySelector<HTMLElement>('[data-case="prompt"]')!;
}

describe('bunpro review front prompt detection', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.replaceChildren();
    });

    it('keeps the unrevealed quiz prompt free of furigana and pitch annotations', () => {
        stubReviews();
        expect(isBunproReviewFrontPrompt(renderQuiz(false))).toBe(true);
    });

    it('allows annotations after Bunpro reveals the answer', () => {
        stubReviews();
        expect(isBunproReviewFrontPrompt(renderQuiz(true))).toBe(false);
    });

    it('does not suppress Japanese page chrome outside the quiz question', () => {
        stubReviews();
        renderQuiz(false);
        const chrome = document.querySelector<HTMLElement>('[data-case="chrome"]')!;
        expect(isBunproReviewFrontPrompt(chrome)).toBe(false);
    });
});
