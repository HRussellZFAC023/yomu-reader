import { renderStudyDeskPreview } from '../../src/academy/integration/study-word-list-preview';
import type { AcademyStudyVocabulary } from '../../src/academy/integration/study-module';

const vocabulary: readonly AcademyStudyVocabulary[] = [
    { id: 'w1', expression: '鹿', reading: 'しか', meaning: 'deer', source: 'l2-l35', audioAvailable: true },
    { id: 'w2', expression: '財布', reading: 'さいふ', meaning: 'wallet', audioAvailable: false },
];

describe('study desk preview (単語リスト tonight\'s desk)', () => {
    it('renders one tap-to-peek card per vocab item, closed by default', () => {
        const preview = renderStudyDeskPreview({ language: 'ja', vocabulary });
        const cards = preview.element.querySelectorAll('.academy-study-desk-card');
        expect(cards).toHaveLength(2);
        expect(preview.element.querySelector('.academy-study-desk-card-expression')?.textContent).toBe('鹿');
        cards.forEach(card => expect((card as HTMLElement).dataset.peeked).toBe('false'));
        expect(preview.element.querySelectorAll('.academy-study-desk-card-audio')).toHaveLength(1);
        preview.dispose();
    });

    it('reveals a card when peeked and toggles it back', () => {
        const preview = renderStudyDeskPreview({ language: 'ja', vocabulary });
        expect(preview.peek('w1')).toBe(true);
        const card = preview.element.querySelector<HTMLElement>('[data-card-id="w1"]');
        expect(card?.dataset.peeked).toBe('true');
        expect(card?.querySelector('.academy-study-desk-card-peek')?.getAttribute('aria-expanded')).toBe('true');
        expect(preview.peek('w1')).toBe(false);
        expect(card?.dataset.peeked).toBe('false');
        expect(preview.peek('missing')).toBe(false);
        preview.dispose();
    });

    it('renders an empty-desk message and no cards for an empty vocab array', () => {
        const preview = renderStudyDeskPreview({ language: 'en', vocabulary: [] });
        expect(preview.element.querySelectorAll('.academy-study-desk-card')).toHaveLength(0);
        expect(preview.element.querySelector('.academy-study-desk-empty')?.textContent).toContain('No words');
        preview.dispose();
    });

    it('shows the session duration from the countdown on the はじめ！ stamp', () => {
        const preview = renderStudyDeskPreview({
            language: 'ja',
            vocabulary,
            countdown: { durationMs: 15 * 60_000 },
        });
        const caption = preview.element.querySelector<HTMLElement>('.academy-study-desk-begin-caption');
        expect(caption?.hidden).toBe(false);
        expect(caption?.textContent).toBe('15分間');
        preview.dispose();
    });

    it('runs the 3…2…1…はじめ！ ritual through an injected scheduler and fires onBegin once', () => {
        const queue: Array<() => void> = [];
        let began = 0;
        const preview = renderStudyDeskPreview({
            language: 'ja',
            vocabulary,
            schedule: run => queue.push(run),
            onBegin: () => { began += 1; },
        });
        const ticker = preview.element.querySelector<HTMLElement>('.academy-study-desk-ticker');
        preview.begin();
        expect(ticker?.textContent).toBe('3');
        expect(preview.element.dataset.ritual).toBe('running');
        preview.begin(); // re-entrancy guard: does not double-start
        const drain = (): void => { const next = queue.shift(); if (next) next(); };
        drain();
        expect(ticker?.textContent).toBe('2');
        drain();
        expect(ticker?.textContent).toBe('1');
        drain();
        expect(ticker?.textContent).toBe('はじめ！');
        drain();
        expect(began).toBe(1);
        expect(preview.element.dataset.ritual).toBe('done');
        preview.dispose();
    });
});
