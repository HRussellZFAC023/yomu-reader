import {
    collectFormControlTextTargetsIn,
    collectTextTargetsIn,
} from '../../src/reader/dom';
import { refreshAcademyAnnotationSurfaces } from '../../src/academy/integration/yomu-runtime';
import { ORIENTATION_MOCK_ITEMS, scoreOrientationMock } from '../../src/academy/placement/orientation';
import { renderPlacementMockScreen } from '../../src/academy/ui/placement-screen';

describe('orientation placement mock', () => {
    it('reports receptive skills separately and recommends without locking', () => {
        const result = scoreOrientationMock('n3', {
            'orientation:knowledge:reason': 'because',
            'orientation:reading:change': 'six-thirty',
            'orientation:listening:library': 'six-fifty',
        }, { speaking: 0.5, writing: 0.25 });

        expect(result.scores).toEqual({
            'language-knowledge': 1,
            reading: 1,
            listening: 0,
            'speaking-confidence': 0.5,
            'writing-confidence': 0.25,
        });
        expect(result.recommendedBand).toBe('n3');
        expect(result.calibration).toBe('vertical-slice');
        expect(result.itemIds).toEqual(ORIENTATION_MOCK_ITEMS.map(item => item.id));
    });

    it('steps down conservatively when the evidence is weak', () => {
        const result = scoreOrientationMock('n2', {}, { speaking: -1, writing: 2 });
        expect(result.recommendedBand).toBe('n4');
        expect(result.scores['speaking-confidence']).toBe(0);
        expect(result.scores['writing-confidence']).toBe(1);
    });

    it('uses Alex\'s confirmed Latin name in Japanese placement content', () => {
        const item = ORIENTATION_MOCK_ITEMS.find(candidate => candidate.id === 'orientation:reading:change');
        expect(item?.passage?.ja).toContain('Alexさん');
        expect(item?.passage?.ja).not.toContain('アレックス');
    });
});

describe('orientation placement answer surfaces', () => {
    function render(): HTMLElement {
        return renderPlacementMockScreen({
            language: 'en',
            pronunciation: { play: vi.fn(async () => ({ dispose: vi.fn() })) },
            onResult: vi.fn(),
            onBack: vi.fn(),
        });
    }

    it('keeps every pre-commit answer outside Reader text and control lookup targets', () => {
        const screen = render();
        document.body.replaceChildren(screen);
        refreshAcademyAnnotationSurfaces(screen);

        const answers = Array.from(screen.querySelectorAll<HTMLElement>('.academy-mock-option'));
        expect(answers).toHaveLength(ORIENTATION_MOCK_ITEMS.reduce((count, item) => count + item.options.length, 0));
        for (const answer of answers) {
            const copy = answer.querySelector<HTMLElement>('.academy-mock-option-copy');
            const input = answer.querySelector<HTMLInputElement>('input[type="radio"]');
            expect(answer.dataset.jpdbReaderSurfaceIgnore).toBe('');
            expect(copy?.dataset.jpdbReaderSurfaceIgnore).toBe('');
            expect(copy?.dataset.yomuRuntimeSurface).toBeUndefined();
            expect(copy?.dataset.yomuFuriganaMode).toBeUndefined();
            expect(input?.hasAttribute('aria-label')).toBe(false);
            expect(input?.hasAttribute('title')).toBe(false);
            expect(input?.labels?.item(0)).toBe(answer);
        }

        const proseTargets = collectTextTargetsIn(screen, 100, false);
        expect(proseTargets.some(target => target.parent.closest('.academy-mock-option'))).toBe(false);
        const controlTargets = collectFormControlTextTargetsIn(screen, 100, false);
        expect(controlTargets.some(target => target.parent.closest('.academy-mock-option'))).toBe(false);
    });

    it('selects a radio answer directly without Reader-owned interaction DOM', () => {
        const screen = render();
        document.body.replaceChildren(screen);
        refreshAcademyAnnotationSurfaces(screen);
        const answer = screen.querySelector<HTMLLabelElement>('.academy-mock-option');
        const input = answer?.querySelector<HTMLInputElement>('input[type="radio"]');

        answer?.click();

        expect(input?.checked).toBe(true);
        expect(answer?.querySelector('.jpdb-reader-word')).toBeNull();
        expect(answer?.querySelector('.jpdb-reader-control-text-mirror')).toBeNull();
    });
});
