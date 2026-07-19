import { describe, expect, it, vi } from 'vitest';
import { adaptAuthoredWeek, AUTHORED_WEEK_HASHES } from '../../src/academy/content/authored-week-adapter';
import { createAuthoredWeekScreen } from '../../src/academy/ui/authored-week-screen';

const lessonFiles = import.meta.glob('../../public/academy/content/lessons/00{2,3,4,5,6,7,8,9}-l1-l0*.json', { eager: true, import: 'default' });
const allPackages = {
    ...lessonFiles,
    ...import.meta.glob('../../public/academy/content/lessons/010-l1-l09.json', { eager: true, import: 'default' }),
    ...import.meta.glob('../../public/academy/content/lessons/011-l1-l10.json', { eager: true, import: 'default' }),
} as Record<string, { id: string }>;

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('Lesson 1-10 authored-week Reader/SRS runtime matrix', () => {
    it('mounts each real first activity, registers Japanese support, gates answers, and emits one review seed', async () => {
        expect(Object.keys(allPackages)).toHaveLength(10);
        for (const [file, value] of Object.entries(allPackages)) {
            const packageId = value.id as keyof typeof AUTHORED_WEEK_HASHES;
            const week = adaptAuthoredWeek(value, {
                path: `/academy/content/lessons/${file.split('/').pop()}`,
                sha256: AUTHORED_WEEK_HASHES[packageId],
            });
            const first = week.activities[0];
            expect(first, packageId).toBeDefined();
            const onReviewSeeds = vi.fn();
            const screen = createAuthoredWeekScreen({ language: 'en', week, onReviewSeeds });
            document.body.replaceChildren(screen.element);

            const support = screen.element.querySelector<HTMLElement>('.academy-lesson-teaching-support [lang="ja"]');
            expect(support, packageId).not.toBeNull();
            expect(support?.getAttribute('data-yomu-academy-reading-source'), packageId).toBe(support?.textContent);
            expect(support?.getAttribute('data-yomu-academy-reading-state'), packageId).toBe('hidden');
            screen.element.querySelector<HTMLButtonElement>('.academy-lesson-language-tool:first-child')?.click();
            expect(support?.dataset.yomuAcademyReadingState, packageId).toBe('shown');
            expect(support?.dataset.yomuRuntimeSurface, packageId).toBe('academy-activity');
            expect(support?.dataset.yomuFuriganaMode, packageId).toBe('all');

            expect(screen.element.querySelector('.academy-authored-week-prompt'), packageId).toBeNull();
            for (let step = 0; step < 20 && !screen.element.querySelector('.academy-authored-week-prompt'); step += 1) {
                screen.element.querySelector<HTMLButtonElement>('.academy-authored-week-next, .academy-lesson-activity-continue')?.click();
            }
            expect(screen.element.querySelector('.academy-authored-week-prompt'), packageId).not.toBeNull();
            expect(screen.element.querySelector('.academy-source-vocabulary-answer'), packageId).toBeNull();
            expect(onReviewSeeds).not.toHaveBeenCalled();

            const input = screen.element.querySelector<HTMLInputElement>('.academy-source-vocabulary-input');
            if (input && first.kind === 'academy-source-vocabulary-sheet') {
                input.value = first.provenance.locus.row % 2 === 1
                    ? first.payload.support.meaning
                    : first.payload.support.words;
                input.form?.requestSubmit();
            } else {
                screen.element.querySelector<HTMLButtonElement>('[data-choice-id]')?.click();
            }
            await vi.waitFor(() => expect(onReviewSeeds, packageId).toHaveBeenCalledTimes(1));
            expect(onReviewSeeds.mock.calls[0]?.[0]).toEqual([
                expect.objectContaining({ sourceQuestionId: first.sourceQuestionId }),
            ]);
            if (input) input.form?.requestSubmit();
            else screen.element.querySelector<HTMLButtonElement>('[data-choice-id]')?.click();
            await flush();
            expect(onReviewSeeds, packageId).toHaveBeenCalledTimes(1);
        }
    });
});
