import fs from 'node:fs';
import path from 'node:path';
import { createSourceLibrary } from '../../src/academy/domain/source-library';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import type { LessonZeroContent } from '../../src/academy/content/lesson-zero';
import { createLessonZeroProof } from '../../src/academy/ui/lesson-zero-proof';

const expressions = {
    neutral: { still: '/rie-neutral.png' },
    encouraging: { still: '/rie-encouraging.png' },
    happy: { still: '/rie-happy.png' },
    repair: { still: '/rie-repair.png' },
} as const;

function lessonZeroContent(): LessonZeroContent {
    const raw = JSON.parse(fs.readFileSync(
        path.resolve('public/academy/content/lessons/lesson-zero.v1.json'),
        'utf8',
    ));
    const data = validateLessonZeroPackage(raw);
    return { sourceLibrary: createSourceLibrary(data.sourceLibrary), lesson: data.lesson };
}

function flush(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function next(root: HTMLElement): void {
    root.querySelector<HTMLButtonElement>('.academy-vn-action-slot > .academy-vn-primary-action')!.click();
}

function advanceToAssessment(root: HTMLElement): void {
    next(root);
    next(root);
    next(root);
    next(root);
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 0 Text mission proof', () => {
    it('binds the exact immutable source rows to a physical handout without exposing item 9', async () => {
        const proof = await createLessonZeroProof({
            language: 'en',
            content: lessonZeroContent(),
            rieExpressions: expressions,
        });
        document.body.append(proof.element);
        expect(proof.element.querySelector('[data-character="rie"]')?.getAttribute('data-display-name')).toBe('Rie-sensei');
        expect(proof.element.dataset.plate).toBe('lesson-zero-library');
        expect(proof.element.getAttribute('aria-label')).toBe('Lesson 0 Text mission in the library');

        const paper = proof.element.querySelector<HTMLElement>('[data-object="classroom-survival-handout"]')!;
        expect(paper.dataset.jpdbReaderSurfaceIgnore).toBe('');
        expect(paper.closest('.academy-vn-object-slot')).not.toBeNull();
        expect([...paper.querySelectorAll<HTMLElement>('[data-source-question-id]')].map(row => row.dataset.sourceQuestionId))
            .toEqual([
                'source-question:classroom-phrase-04',
                'source-question:classroom-phrase-06',
                'source-question:classroom-phrase-07',
                'source-question:classroom-phrase-09',
            ]);
        expect(paper.textContent).toContain('４）みてください。');
        expect(paper.textContent).toContain('６）きいてください。');
        expect(paper.textContent).toContain('７）書いてください。');
        expect(paper.textContent).not.toContain('もう一度お願いします');
        expect(paper.textContent).not.toContain('もう いちど');
        expect(proof.element.textContent).not.toMatch(/source|status|release-blocked/i);
        expect(proof.element.dataset.missionProof).toBe('text');
        expect(proof.element.dataset.selectedMission).toBeUndefined();
    });

    it('moves through contextual VN lines and wakes per-line annotation only on request', async () => {
        const onSupportUse = vi.fn();
        const proof = await createLessonZeroProof({
            language: 'en',
            content: lessonZeroContent(),
            rieExpressions: expressions,
            onSupportUse,
        });
        const japanese = proof.element.querySelector<HTMLElement>('[data-vn-annotation-root]')!;
        const toggle = proof.element.querySelector<HTMLButtonElement>('.academy-vn-reading-toggle')!;

        expect(japanese.textContent).toBe('みてください。');
        expect(japanese.dataset.jpdbReaderSurfaceIgnore).toBe('');
        toggle.click();
        expect(japanese.dataset.yomuRuntimeSurface).toBe('academy-dialogue');
        expect(japanese.dataset.yomuFuriganaMode).toBe('all');
        expect(onSupportUse).toHaveBeenCalledWith({
            activityId: 'activity:lesson-zero-classroom-actions',
            supportKind: 'hint',
            choiceId: 'readings:source-question:classroom-phrase-04',
        });

        next(proof.element);
        expect(japanese.textContent).toBe('きいてください。');
        next(proof.element);
        expect(japanese.textContent).toBe('書いてください。');
        expect(proof.element.querySelector('[data-source-question-id="source-question:classroom-phrase-07"]')?.getAttribute('data-active'))
            .toBe('true');

        next(proof.element);
        expect(japanese.textContent).toBe('聞き取れませんでしたか。もう一度言いますね。');
        expect(proof.element.textContent).toContain("Didn't catch that? I'll say it once more.");
        expect(proof.element.textContent).not.toContain('もう一度お願いします');
        expect(proof.element.querySelector('form')).toBeNull();
    });

    it('keeps the full answer hidden after teaching the semantic core until a Japanese commitment', async () => {
        const proof = await createLessonZeroProof({
            language: 'en',
            content: lessonZeroContent(),
            rieExpressions: expressions,
        });
        advanceToAssessment(proof.element);

        expect(proof.element.querySelector<HTMLInputElement>('input')?.value).toBe('');
        expect(proof.element.querySelector<HTMLInputElement>('input')?.dataset.responseKind).toBe('ime');
        expect(proof.element.textContent).not.toContain('もう一度お願いします');
        expect(proof.element.textContent).not.toContain('One more time, please');
        expect(proof.element.querySelector('.academy-vn-translation')).toBeNull();
    });

    it('repairs in place, retries, reacts with the Rie sprite, and marks the paper on pass', async () => {
        const evaluations: string[] = [];
        const proof = await createLessonZeroProof({
            language: 'en',
            content: lessonZeroContent(),
            rieExpressions: expressions,
            onEvaluation(evaluation) { evaluations.push(evaluation.result.outcome); },
        });
        document.body.append(proof.element);
        advanceToAssessment(proof.element);
        const form = proof.element.querySelector<HTMLFormElement>('form')!;
        const input = proof.element.querySelector<HTMLInputElement>('input')!;

        expect(document.activeElement).toBe(input);

        input.value = 'わかりました';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flush();
        expect(input.disabled).toBe(false);
        expect(proof.element.querySelector('[data-character="rie"] picture')?.getAttribute('data-expression')).toBe('repair');
        expect(proof.element.querySelector('.academy-constructed-feedback-contrast')?.textContent)
            .toBe('わかりました tells Rie you understood; it does not ask for the line again.');
        expect(proof.element.querySelector('.academy-constructed-feedback-repair')?.textContent)
            .toBe('Begin with もう一度 — “one more time.”');
        expect(proof.element.querySelector('.academy-constructed-feedback-example')?.textContent)
            .toBe("Compare: もう一度言いますね。 — I’ll say it once more.");
        expect(proof.element.querySelector<HTMLElement>('[data-flower-mark]')?.hidden).toBe(true);

        input.value = 'もう一度お願いします。';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flush();
        expect(evaluations).toEqual(['lapse', 'pass']);
        expect(proof.element.querySelector('[data-character="rie"] picture')?.getAttribute('data-expression')).toBe('happy');
        expect(proof.element.querySelector<HTMLElement>('[data-flower-mark]')?.hidden).toBe(false);
        expect(proof.element.querySelector('[data-source-question-id="source-question:classroom-phrase-09"]')?.textContent)
            .toBe('９）もう いちど（おねがいします）。');
        expect(proof.element.querySelector('.academy-vn-translation')?.textContent).toBe('One more time, please.');
        expect(document.activeElement).toBe(proof.element.querySelector('.academy-lesson-zero-after-pass'));
    });

    it('accepts the source-faithful short form, then refines it after commitment', async () => {
        const proof = await createLessonZeroProof({
            language: 'en',
            content: lessonZeroContent(),
            rieExpressions: expressions,
        });
        advanceToAssessment(proof.element);
        const form = proof.element.querySelector<HTMLFormElement>('form')!;
        proof.element.querySelector<HTMLInputElement>('input')!.value = 'もう一度';

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flush();

        expect(proof.element.querySelector('.academy-constructed-response')).toBeNull();
        expect(proof.element.querySelector('.academy-vn-japanese')?.textContent).toBe('もう一度お願いします。');
        expect(proof.element.querySelector<HTMLElement>('[data-flower-mark]')?.hidden).toBe(false);
    });

    it('announces changed dialogue without exposing the final response before commitment', async () => {
        const proof = await createLessonZeroProof({
            language: 'en',
            content: lessonZeroContent(),
            rieExpressions: expressions,
        });
        const announcements: string[] = [];
        proof.element.addEventListener('academy:announce', event => {
            announcements.push((event as CustomEvent<{ message: string }>).detail.message);
        });

        next(proof.element);
        next(proof.element);
        next(proof.element);

        expect(announcements).toContain('Rie-sensei: きいてください。');
        expect(announcements).toContain('Rie-sensei: 書いてください。');
        expect(announcements).toContain('Rie-sensei: 聞き取れませんでしたか。もう一度言いますね。');
        expect(announcements.join(' ')).not.toContain('もう一度お願いします');
    });

    it('lets the room advance, reports internal audio state, and owns cleanup', async () => {
        const onComplete = vi.fn();
        const proof = await createLessonZeroProof({
            language: 'ja',
            content: lessonZeroContent(),
            rieExpressions: expressions,
            onComplete,
        });
        document.body.append(proof.element);
        expect(proof.element.querySelector('[data-character="rie"]')?.getAttribute('data-display-name')).toBe('りえ先生');
        expect(proof.audioRequired).toEqual({
            textMission: {
                assetId: 'audio:lesson-zero-text-hosts',
                state: 'release-blocked',
                ready: false,
            },
        });
        expect(proof.element.textContent).not.toContain('release-blocked');
        advanceToAssessment(proof.element);
        const form = proof.element.querySelector<HTMLFormElement>('form')!;
        proof.element.querySelector<HTMLInputElement>('input')!.value = 'もう一度お願いします';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flush();
        proof.element.querySelector<HTMLButtonElement>('.academy-lesson-zero-after-pass')!.click();
        expect(proof.element.querySelector('.academy-vn-japanese')?.textContent).toBe('はい。もう一度。');
        next(proof.element);
        expect(onComplete).toHaveBeenCalledOnce();

        proof.dispose();
        expect(proof.element.isConnected).toBe(false);
        expect(() => proof.dispose()).not.toThrow();
    });

    it('can be disposed safely while the constructed response owns the action slot', async () => {
        const proof = await createLessonZeroProof({
            language: 'en',
            content: lessonZeroContent(),
            rieExpressions: expressions,
        });
        document.body.append(proof.element);
        advanceToAssessment(proof.element);

        expect(proof.element.querySelector('form')).not.toBeNull();
        expect(() => proof.dispose()).not.toThrow();
        expect(proof.element.isConnected).toBe(false);
    });

    it('keeps the isolated style full-bleed, responsive, tactile, and motion-safe', () => {
        const css = fs.readFileSync(path.resolve('src/academy/styles/lesson-zero-proof.css'), 'utf8');
        expect(css).toContain('.academy-lesson-zero-handout');
        expect(css).toContain('[data-answer-concealed="true"]');
        expect(css).toContain('@media (max-width: 700px)');
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
        expect(css).not.toContain('.academy-panel');
    });
});
