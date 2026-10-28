import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    currentBunproTermTarget,
    isBunproEnhanceablePage,
    isBunproQuizAnswerHidden,
} from '../../src/reader/bunpro/page-targets';

function stubBunproLocation(pathname: string, search = ''): void {
    vi.stubGlobal('location', {
        href: `https://bunpro.jp${pathname}${search}`,
        origin: 'https://bunpro.jp',
        hostname: 'bunpro.jp',
        pathname,
        search,
    });
}

function renderLesson(term = '回', reading = 'かい'): void {
    document.body.innerHTML = `
        <main>
            <header id="js-rev-header">
                <h1 id="rev-id-1061"><ruby>${term}<rt>${reading}</rt></ruby><span>counter for occurrences</span></h1>
            </header>
            <section data-case="dictionary"><header id="dictionary-definition">Dictionary Definition</header></section>
            <section data-case="about"><header id="about">About</header></section>
            <section data-case="examples"><header id="examples">Examples</header><p lang="ja">この本を二回読んだ。</p></section>
        </main>
    `;
}

function renderReview(options: { term: string; revealed: boolean }): void {
    document.body.innerHTML = `
        <main id="js-quiz">
            <section id="js-tour-quiz-question">
                <p class="bp-quiz-question" lang="ja">本を${options.term}。</p>
                ${options.revealed ? '' : '<input id="js-manual-input" />'}
            </section>
            ${options.revealed ? `
                <section id="js-tour-quiz-answer" data-case="answer">
                    <header id="js-rev-header"><h1 id="rev-id-42"><ruby>${options.term}<rt>よむ</rt></ruby><span>to read</span></h1></header>
                    <div data-case="last-native-section">Native answer details</div>
                </section>
            ` : ''}
        </main>
    `;
}

describe('bunpro page enhancement targets', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.replaceChildren();
    });

    it('anchors a lesson-card addon after Bunpro\'s examples section', () => {
        stubBunproLocation('/learn', '?deck_id=29');
        renderLesson();

        const target = currentBunproTermTarget();

        expect(isBunproEnhanceablePage()).toBe(true);
        expect(target).toMatchObject({ term: '回', reading: 'かい' });
        expect(target?.anchor.dataset.case).toBe('examples');
        expect(target?.examples).toContainEqual({ sentence: 'この本を二回読んだ。', translation: '' });
    });

    it('supports locale-prefixed vocabulary pages and a path fallback', () => {
        stubBunproLocation('/ja/vocabs/%E9%9E%84');
        document.body.innerHTML = '<main><header id="js-rev-header"></header></main>';

        expect(isBunproEnhanceablePage()).toBe(true);
        expect(currentBunproTermTarget()).toMatchObject({ term: '鞄', reading: '鞄' });
    });

    it('produces no target while a review answer is hidden', () => {
        stubBunproLocation('/reviews', '?only_review=vocab');
        renderReview({ term: '読む', revealed: false });

        expect(isBunproQuizAnswerHidden()).toBe(true);
        expect(currentBunproTermTarget()).toBeNull();
    });

    it('supports the lesson quiz URL and waits for Show Info before enhancing', () => {
        stubBunproLocation('/learn/quiz', '?vocabs=%5B2072%5D&deck_id=29');
        document.body.innerHTML = `
            <main id="js-quiz">
                <section id="js-tour-quiz-question">
                    <p class="bp-quiz-question" lang="ja">お父さんの靴を磨いて。</p>
                    <button><ruby>磨<rt>みが</rt></ruby></button>
                    <input id="js-manual-input" value="みがく">
                    <button>Show Info</button>
                </section>
            </main>
        `;

        expect(isBunproEnhanceablePage()).toBe(true);
        expect(isBunproQuizAnswerHidden()).toBe(true);
        expect(currentBunproTermTarget()).toBeNull();

        document.querySelector<HTMLInputElement>('#js-manual-input')!.readOnly = true;
        expect(isBunproQuizAnswerHidden()).toBe(false);
        expect(currentBunproTermTarget()).toMatchObject({ term: '磨く', reading: 'みがく' });
        expect(currentBunproTermTarget()?.anchor.id).toBe('js-tour-quiz-question');

        document.querySelector('#js-quiz')!.insertAdjacentHTML('beforeend', `
            <section data-case="info">
                <header id="js-rev-header"><h1 id="rev-id-2072"><ruby>磨く<rt>みがく</rt></ruby></h1></header>
                <section data-case="quiz-examples"><header id="examples">Examples</header></section>
            </section>
        `);

        expect(isBunproQuizAnswerHidden()).toBe(false);
        expect(currentBunproTermTarget()).toMatchObject({ term: '磨く', reading: 'みがく' });
    });

    it('mounts inside the native answer console after reveal', () => {
        stubBunproLocation('/reviews', '?only_review=vocab');
        renderReview({ term: '読む', revealed: true });

        const target = currentBunproTermTarget();

        expect(isBunproQuizAnswerHidden()).toBe(false);
        expect(target).toMatchObject({ term: '読む', reading: 'よむ' });
        expect(target?.anchor.dataset.case).toBe('last-native-section');
        expect(target?.anchor.closest('#js-tour-quiz-answer')).not.toBeNull();
    });
});
