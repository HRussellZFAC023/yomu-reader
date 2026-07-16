import fs from 'node:fs';
import path from 'node:path';
import { LESSON_ZERO_KANA_SEQUENCE } from '../../src/academy/content/lesson-zero-source-material';
import { createLessonZeroKanaMasteryGate } from '../../src/academy/ui/lesson-zero-kana-mastery';
import {
    createLessonZeroKanaMasteryModel,
    kanaMasteryPlugin,
} from '../../src/academy/minigames/kana-mastery';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import {
    createKanaMasterySession,
    KANASH_UPSTREAM,
} from '../../src/academy/vendor/kanash/kana-mastery-engine';

afterEach(() => document.body.replaceChildren());

describe('Kanash-backed Lesson 0 kana mastery gate', () => {
    it('pins the upstream repo, commit, license, reused files, and Yomu wrapper', () => {
        expect(KANASH_UPSTREAM).toEqual({
            repository: 'https://github.com/benoitlx/kanash',
            commit: 'ee8669635d33661bd92deef97e0f73fe03043984',
            license: 'MIT',
            reusedFiles: [
                'kanash-components/src/kana.rs',
                'kanash-components/src/helper/ja.rs',
            ],
            wrapper: 'src/academy/ui/lesson-zero-kana-mastery.ts',
        });
        const note = fs.readFileSync(path.resolve('src/academy/vendor/kanash/ADAPTATION.md'), 'utf8');
        expect(note).toContain(KANASH_UPSTREAM.commit);
        expect(note).toContain('kana.rs');
        expect(note).toContain('lesson-zero-kana-mastery.ts');
        expect(fs.readFileSync(path.resolve('src/academy/vendor/kanash/LICENSE'), 'utf8')).toContain('MIT License');
    });

    it('requires one clean answer per taught kana and requeues supported repairs', () => {
        const session = createKanaMasterySession(LESSON_ZERO_KANA_SEQUENCE, () => 1);
        const first = session.current!;
        expect(session.submit('wrong')).toMatchObject({ outcome: 'retry', mastered: false });
        expect(session.snapshot.complete).toBe(false);
        expect(session.reveal()).toBe(first.romaji);
        expect(session.submit(first.romaji)).toMatchObject({ outcome: 'correct', mastered: false });
        while (!session.snapshot.complete) {
            const current = session.current!;
            session.submit(current.romaji);
        }
        expect(session.snapshot).toMatchObject({
            complete: true,
            correct: LESSON_ZERO_KANA_SEQUENCE.length,
            errors: 1,
            remaining: 0,
        });
    });

    it('accepts romaji, hiragana, or katakana as the same clean reading', () => {
        for (const answer of ['a', 'あ', 'ア']) {
            const session = createKanaMasterySession([LESSON_ZERO_KANA_SEQUENCE[0]!], () => 1);
            expect(session.submit(answer)).toMatchObject({ outcome: 'correct', mastered: true });
            expect(session.snapshot.complete).toBe(true);
        }
    });

    it('keeps a source-chart revisit fair by requeueing the supported kana', () => {
        const session = createKanaMasterySession([LESSON_ZERO_KANA_SEQUENCE[0]!], () => 1);
        session.review();
        expect(session.submit('a')).toMatchObject({ outcome: 'correct', mastered: false });
        expect(session.snapshot.complete).toBe(false);
        expect(session.submit('あ')).toMatchObject({ outcome: 'correct', mastered: true });
        expect(session.snapshot.complete).toBe(true);
    });

    it('grades exact clean mastery into review seeds before completing the keyboard-first untimed gate', async () => {
        const onComplete = vi.fn();
        const onEvaluation = vi.fn();
        const gate = createLessonZeroKanaMasteryGate({ language: 'en', onComplete, onEvaluation, random: () => 1 });
        document.body.append(gate.element);
        expect(gate.element.dataset.upstreamCommit).toBe(KANASH_UPSTREAM.commit);
        expect(gate.element.querySelector('progress')?.getAttribute('aria-label')).toBe('Kana mastery progress');
        expect(gate.element.querySelector<HTMLButtonElement>('.academy-lesson-zero-kana-mastery-reveal')?.disabled).toBe(true);
        expect(onComplete).not.toHaveBeenCalled();

        for (let count = 0; count < LESSON_ZERO_KANA_SEQUENCE.length; count += 1) {
            const id = gate.element.dataset.currentKanaId;
            const item = LESSON_ZERO_KANA_SEQUENCE.find(candidate => candidate.id === id)!;
            const form = gate.element.querySelector<HTMLFormElement>('form')!;
            form.querySelector<HTMLInputElement>('input')!.value = item.romaji;
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
        expect(gate.element.dataset.mastered).toBe('true');
        expect(onComplete).not.toHaveBeenCalled();
        gate.element.querySelector<HTMLButtonElement>('.academy-lesson-zero-mastery-complete')!.click();
        await vi.waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
        expect(onEvaluation).toHaveBeenCalledWith(expect.objectContaining({
            result: expect.objectContaining({ outcome: 'pass', score: 1 }),
            reviewSeeds: expect.arrayContaining([
                expect.objectContaining({ id: 'review:lesson-zero:kana:hira-a', reason: 'new-learning' }),
            ]),
        }));
        gate.dispose();
    });

    it('keeps source ordering deterministic and only schedules missing kana as repairs', () => {
        const runtime = createActivityRuntime([kanaMasteryPlugin]);
        const model = createLessonZeroKanaMasteryModel();
        expect(runtime.validate(model)).toEqual([]);
        const lapse = runtime.evaluate(model, { masteredIds: ['hira-a', 'hira-u'] });
        expect(lapse.result).toMatchObject({ outcome: 'lapse', score: 2 / 5 });
        expect(lapse.reviewSeeds.map(seed => [seed.id, seed.reason])).toEqual([
            ['review:lesson-zero:kana:hira-i', 'repair'],
            ['review:lesson-zero:kana:hira-e', 'repair'],
            ['review:lesson-zero:kana:hira-o', 'repair'],
        ]);
    });

    it('keeps the Kana gate touch-sized and motion-safe', () => {
        const css = fs.readFileSync(path.resolve('src/academy/styles/lesson-zero-proof.css'), 'utf8');
        expect(css).toMatch(/\.academy-lesson-zero-kana-mastery input\s*\{[\s\S]*min-height:\s*44px/);
        expect(css).toMatch(/\.academy-lesson-zero-kana-mastery button\s*\{[\s\S]*min-height:\s*44px/);
        expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.academy-lesson-zero-kana-mastery \*/);
    });
});
