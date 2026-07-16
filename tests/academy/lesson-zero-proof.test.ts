import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createSourceLibrary } from '../../src/academy/domain/source-library';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import { validateLessonZeroGrounding } from '../../src/academy/content/lesson-zero-grounding';
import type { LessonZeroContent } from '../../src/academy/content/lesson-zero';
import {
    LESSON_ZERO_KANA_SEQUENCE,
    LESSON_ZERO_SOURCE_MEDIA,
} from '../../src/academy/content/lesson-zero-source-material';
import { createLessonZeroProof } from '../../src/academy/ui/lesson-zero-proof';

const expressions = {
    neutral: { still: '/rie-neutral.png' },
    encouraging: { still: '/rie-encouraging.png' },
    happy: { still: '/rie-happy.png' },
    repair: { still: '/rie-repair.png' },
} as const;
const learner = { displayName: 'Mina', portraitId: 'quality-4' } as const;

function lessonZeroContent(): LessonZeroContent {
    const raw = JSON.parse(fs.readFileSync(
        path.resolve('public/academy/content/lessons/lesson-zero.v1.json'),
        'utf8',
    ));
    const data = validateLessonZeroPackage(raw);
    return {
        sourceLibrary: createSourceLibrary(data.sourceLibrary),
        lesson: data.lesson,
        grounding: validateLessonZeroGrounding(data),
    };
}

function flush(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function clickButton(root: ParentNode, label: string): void {
    const button = [...root.querySelectorAll<HTMLButtonElement>('button')]
        .find(candidate => candidate.textContent === label && !candidate.disabled);
    if (!button) throw new Error(`Missing enabled button: ${label}`);
    button.click();
}

function settleDialogue(root: ParentNode): void {
    const japanese = root.querySelector<HTMLElement>('.academy-vn-japanese');
    if (japanese?.dataset.performanceText === 'revealing') japanese.click();
}

function next(root: HTMLElement): void {
    settleDialogue(root);
    root.querySelector<HTMLButtonElement>('.academy-vn-action-slot > .academy-vn-primary-action')!.click();
    settleDialogue(root);
}

function completeKanaStudio(root: HTMLElement): void {
    root.querySelector<HTMLButtonElement>('.academy-lesson-zero-kana-game > .academy-vn-primary-action')!.click();
    root.querySelector<HTMLButtonElement>('.academy-lesson-zero-kana-game > .academy-vn-primary-action')!.click();
    for (const item of LESSON_ZERO_KANA_SEQUENCE) {
        clickButton(root.querySelector('.academy-lesson-zero-kana-game')!, item.romaji);
        root.querySelector<HTMLButtonElement>('[data-kana-continue]')!.click();
    }
    for (const item of LESSON_ZERO_KANA_SEQUENCE) {
        clickButton(root.querySelector('.academy-lesson-zero-kana-game')!, item.kana);
        root.querySelector<HTMLButtonElement>('[data-kana-continue]')!.click();
    }
    for (const item of LESSON_ZERO_KANA_SEQUENCE) {
        const form = root.querySelector<HTMLFormElement>('.academy-lesson-zero-kana-typing')!;
        form.querySelector<HTMLInputElement>('input')!.value = item.kana;
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        root.querySelector<HTMLButtonElement>('[data-kana-continue]')!.click();
    }
    for (const _item of LESSON_ZERO_KANA_SEQUENCE) {
        root.querySelector<HTMLCanvasElement>('.jpdb-reader-doodle-canvas')!
            .dispatchEvent(new Event('pointerdown', { bubbles: true }));
        root.querySelector<HTMLButtonElement>('.jpdb-reader-doodle-tools button:not([data-doodle-clear])')!.click();
        root.querySelector<HTMLButtonElement>('[data-kana-continue]')!.click();
    }
}

function enterClassroom(root: HTMLElement): void {
    const audio = root.querySelector<HTMLAudioElement>('audio')!;
    audio.dispatchEvent(new Event('play'));
    root.querySelector<HTMLButtonElement>('.academy-lesson-zero-source-audio button')!.click();
    root.querySelector<HTMLButtonElement>('.academy-vn-action-slot > .academy-vn-primary-action')!.click();
    completeKanaStudio(root);
    settleDialogue(root);
}

function advanceToAssessment(root: HTMLElement): void {
    enterClassroom(root);
    for (let index = 0; index < 8; index += 1) next(root);
}

function completeKanaMasteryGate(root: HTMLElement): void {
    const gate = root.querySelector<HTMLElement>('.academy-lesson-zero-kana-mastery')!;
    for (let count = 0; count < LESSON_ZERO_KANA_SEQUENCE.length; count += 1) {
        const item = LESSON_ZERO_KANA_SEQUENCE.find(candidate => candidate.id === gate.dataset.currentKanaId)!;
        const form = gate.querySelector<HTMLFormElement>('form')!;
        form.querySelector<HTMLInputElement>('input')!.value = item.romaji;
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
    gate.querySelector<HTMLButtonElement>('.academy-lesson-zero-mastery-complete')!.click();
}

beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
        observe(): void {}
        disconnect(): void {}
        unobserve(): void {}
    });
    const context = {
        arc: vi.fn(),
        beginPath: vi.fn(),
        clearRect: vi.fn(),
        fill: vi.fn(),
        lineTo: vi.fn(),
        moveTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        restore: vi.fn(),
        save: vi.fn(),
        stroke: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
});

afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('Lesson 0 source-led proof', () => {
    it('starts at the campus entrance, marks the learner present, then teaches the exact Moodle kana order', async () => {
        const proof = await createLessonZeroProof({
            language: 'en',
            content: lessonZeroContent(),
            rieExpressions: expressions,
        });
        document.body.append(proof.element);

        expect(proof.element.dataset.plate).toBe('lesson-zero-entrance');
        expect(proof.element.querySelector('.academy-lesson-zero-kana-game')).toBeNull();
        const audio = proof.element.querySelector<HTMLAudioElement>('audio')!;
        audio.dispatchEvent(new Event('play'));
        proof.element.querySelector<HTMLButtonElement>('.academy-lesson-zero-source-audio button')!.click();
        expect(proof.element.dataset.classPresentCeremony).toBe('complete');
        expect(proof.element.dataset.learnerPresent).toBe('true');
        expect(proof.element.querySelector('[data-character="learner"]')?.getAttribute('data-display-name')).toBe('Learner');
        expect(proof.element.querySelector('.academy-lesson-zero-kana-game')).toBeNull();
        clickButton(proof.element, 'Take your place and learn kana');
        const game = proof.element.querySelector<HTMLElement>('.academy-lesson-zero-kana-game')!;
        const writingSystem = proof.element.querySelector<HTMLElement>('[data-source-page="writing-system"]')!;
        expect(proof.element.dataset.plate).toBe('lesson-zero-writing-studio');
        expect(game.dataset.kanaSourceOrder).toBe('あいうえお');
        expect(writingSystem.tabIndex).toBe(0);
        expect(writingSystem.getAttribute('aria-label')).toBe('Chapter 1 Japanese writing system introduction, page 1');
        expect(game.dataset.provenance).toBe('/academy/content/lessons/lesson-zero/provenance.v1.json');
        expect(proof.element.querySelector<HTMLImageElement>('[data-source-page="writing-system"] img')?.src)
            .toContain('/academy/content/lessons/lesson-zero/moodle-japanese-writing-system-page-1.png');
        expect(game.textContent).not.toContain('あ = a');

        clickButton(game, 'Next');
        expect(proof.element.querySelector<HTMLImageElement>('[data-source-page="hiragana"] img')?.src)
            .toContain('moodle-hiragana-a-row-page-1.png');
        expect(game.textContent).toContain('Self Study: Hiragana writing practice あ、い、う、え、お');
        const teaching = game.querySelector<HTMLElement>('.academy-lesson-zero-kana-teaching')!;
        expect(game.dataset.kanaMode).toBe('source');
        expect([...teaching.querySelectorAll('dt')].map(node => node.textContent)).toEqual(['あ', 'い', 'う', 'え', 'お']);
        expect([...teaching.querySelectorAll('dd')].map(node => node.textContent)).toEqual(['a', 'i', 'u', 'e', 'o']);
        clickButton(game, 'Begin');
        expect(game.dataset.kanaMode).toBe('recognition');
        expect(game.textContent).not.toContain('あ = a');
        clickButton(game, 'a');
        expect(game.textContent).toContain('あ = a');
    });

    it('uses recognition, listening, IME typing, and source-comparison drawing for all five kana', async () => {
        const proof = await createLessonZeroProof({
            language: 'en',
            content: lessonZeroContent(),
            rieExpressions: expressions,
        });
        document.body.append(proof.element);
        const audio = proof.element.querySelector<HTMLAudioElement>('audio')!;
        const greetingPage = proof.element.querySelector<HTMLElement>('[data-source-page="genki-greetings"]')!;
        const continueButton = proof.element.querySelector<HTMLButtonElement>('.academy-lesson-zero-source-audio button')!;
        expect(greetingPage.tabIndex).toBe(0);
        expect(greetingPage.getAttribute('aria-label')).toBe('Genki I, Greetings page');
        expect(audio.src).toContain('/academy/content/lessons/lesson-zero/genki-k00-g.mp3');
        expect(audio.dataset.sourceSha256).toBe('0d5b8a3e2484aa3d091e7bdf71e84fa731984e3a7a36571bb07abf69715486c0');
        expect(proof.element.querySelector<HTMLImageElement>('[data-source-page="genki-greetings"] img')?.src)
            .toContain('genki-greetings-page.png');
        expect(continueButton.disabled).toBe(true);
        audio.dispatchEvent(new Event('play'));
        expect(continueButton.disabled).toBe(false);
        continueButton.click();
        clickButton(proof.element, 'Take your place and learn kana');
        completeKanaStudio(proof.element);
        expect(proof.element.dataset.plate).toBe('lesson-zero-library');
    });

    it('uses the Yomu pronunciation service for the exact active kana', async () => {
        const play = vi.fn(async () => ({ dispose: vi.fn() }));
        const proof = await createLessonZeroProof({
            language: 'en',
            content: lessonZeroContent(),
            rieExpressions: expressions,
            pronunciation: { play },
        });
        document.body.append(proof.element);
        const greetingAudio = proof.element.querySelector<HTMLAudioElement>('audio')!;
        greetingAudio.dispatchEvent(new Event('play'));
        proof.element.querySelector<HTMLButtonElement>('.academy-lesson-zero-source-audio button')!.click();
        clickButton(proof.element, 'Take your place and learn kana');
        const game = proof.element.querySelector<HTMLElement>('.academy-lesson-zero-kana-game')!;
        game.querySelector<HTMLButtonElement>('.academy-vn-primary-action')!.click();
        game.querySelector<HTMLButtonElement>('.academy-vn-primary-action')!.click();
        for (const item of LESSON_ZERO_KANA_SEQUENCE) {
            clickButton(game, item.romaji);
            game.querySelector<HTMLButtonElement>('[data-kana-continue]')!.click();
        }

        clickButton(game, 'Play audio');
        await vi.waitFor(() => expect(play).toHaveBeenCalledWith('あ', 'あ'));
        expect(JSON.stringify(proof.element.outerHTML)).not.toContain('speechSynthesis');
    });

    it('binds all fourteen immutable Moodle rows verbatim to the living paper', async () => {
        const proof = await createLessonZeroProof({
            language: 'en',
            content: lessonZeroContent(),
            rieExpressions: expressions,
        });
        document.body.append(proof.element);
        enterClassroom(proof.element);

        expect(proof.element.dataset.plate).toBe('lesson-zero-library');
        expect(proof.element.getAttribute('aria-label')).toBe('Lesson 0 Text mission in the library');
        const paper = proof.element.querySelector<HTMLElement>('[data-object="classroom-survival-handout"]')!;
        expect(paper.tabIndex).toBe(0);
        expect(paper.querySelector('figcaption')?.textContent).toBe('Chapter 1_Classroom phrases');
        expect(paper.dataset.sourceDocumentId).toBe('document:moodle-1e58967e');
        expect(paper.dataset.sourceSha256).toBe('1e58967eb11b2d98d9b48a2547f392db90805836d96c232f11ac487d25b687ba');
        const rows = [...paper.querySelectorAll<HTMLElement>('[data-source-question-id]')];
        expect(rows.map(row => row.dataset.sourceQuestionId)).toEqual(
            Array.from({ length: 14 }, (_, index) => `source-question:classroom-phrase-${String(index + 1).padStart(2, '0')}`),
        );
        expect(rows[0]?.textContent).toBe('１）はじめましょう。');
        expect(rows[6]?.textContent).toBe('７）書いてください。');
        expect(rows[7]?.textContent).toBe('８）Q：わかりますか？ A：はい、わかります。 A：いいえ、わかりません。');
        expect(rows[8]?.textContent).toBe('');
        expect(rows[9]?.textContent).toBe('１０）（とても）いいです。');
        expect(rows[13]?.textContent).toBe('１４）れい');
        expect(paper.querySelectorAll('.academy-lesson-zero-source-page-frame img')).toHaveLength(2);
        expect(paper.querySelector('[data-page="2"]')?.getAttribute('data-answer-concealed')).toBe('true');
        expect(proof.element.textContent).not.toContain('もう一度お願いします');
        expect(proof.element.textContent).not.toContain('もう いちど');
    });

    it('follows the exact classroom chronology and mounts item 9 as the in-sequence gate', async () => {
        const proof = await createLessonZeroProof({
            language: 'en',
            content: lessonZeroContent(),
            rieExpressions: expressions,
        });
        document.body.append(proof.element);
        enterClassroom(proof.element);

        const japanese = proof.element.querySelector<HTMLElement>('[data-vn-annotation-root]')!;
        const expected = [
            '１）はじめましょう。',
            '２）おわりましょう。',
            '３）やすみましょう。',
            '４）みてください。',
            '５）（みなさんで）いってください。',
            '６）きいてください。',
            '７）書いてください。',
            '８）Q：わかりますか？ A：はい、わかります。 A：いいえ、わかりません。',
        ];
        for (const [index, line] of expected.entries()) {
            expect(japanese.textContent).toBe(line);
            next(proof.element);
            if (index < expected.length - 1) expect(proof.element.querySelector('form')).toBeNull();
        }
        expect(proof.element.querySelector<HTMLInputElement>('input')?.value).toBe('');
        expect(proof.element.textContent).not.toContain('９）もう いちど（おねがいします）。');
    });

    it('rejects unauthored shortcuts, then reveals exact item 9 only after a permitted commitment', async () => {
        const evaluations: string[] = [];
        const onSupportUse = vi.fn();
        const proof = await createLessonZeroProof({
            language: 'en',
            content: lessonZeroContent(),
            rieExpressions: expressions,
            learner,
            onEvaluation(evaluation) { evaluations.push(evaluation.result.outcome); },
            onSupportUse,
        });
        document.body.append(proof.element);
        advanceToAssessment(proof.element);
        const form = proof.element.querySelector<HTMLFormElement>('form')!;
        const input = form.querySelector<HTMLInputElement>('input')!;

        const hints = proof.element.querySelector<HTMLElement>('.academy-lesson-repair-hints')!;
        expect(hints.hidden).toBe(true);
        hints.querySelector<HTMLButtonElement>('.academy-progressive-hint-button')!.click();
        expect(proof.element.querySelector('.academy-progressive-hint')).toBeNull();
        expect(onSupportUse).not.toHaveBeenCalled();

        input.value = 'もう一度';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flush();
        expect(input.disabled).toBe(false);
        expect(proof.element.querySelector('[data-character="rie"] picture')?.getAttribute('data-expression')).toBe('repair');
        expect(proof.element.querySelector('.academy-constructed-feedback-repair')).toBeNull();
        clickButton(proof.element, 'Need a hint?');
        expect(proof.element.querySelector('.academy-constructed-feedback-example')?.textContent)
            .toContain('Please listen to me.');
        clickButton(proof.element, 'Another hint');
        expect(proof.element.querySelector('.academy-constructed-feedback-repair')?.textContent)
            .toContain('９）もう いちど（おねがいします）。');
        expect(proof.element.querySelector('.academy-constructed-feedback-repair')?.textContent)
            .toContain('Once more/again (Please).');
        expect(proof.element.querySelector<HTMLButtonElement>('.academy-progressive-hint-fill')?.textContent)
            .toBe('Use this answer');
        expect(onSupportUse.mock.calls.map(call => call[0].choiceId)).toEqual([
            'progressive-repair:2',
            'progressive-hint:1',
        ]);

        input.value = 'もう一度お願いします。';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flush();
        settleDialogue(proof.element);
        expect(evaluations).toEqual(['lapse', 'pass']);
        expect(proof.element.querySelector('.academy-vn-japanese')?.textContent)
            .toBe('９）もう いちど（おねがいします）。');
        expect(proof.element.querySelector('.academy-vn-translation')?.textContent)
            .toBe('Once more/again (Please).');
        expect(proof.element.querySelector('[data-source-question-id="source-question:classroom-phrase-09"]')?.textContent)
            .toBe('９）もう いちど（おねがいします）。');
        expect(proof.element.querySelector('[data-page="2"]')?.hasAttribute('data-answer-concealed')).toBe(false);
        expect(proof.element.querySelector<HTMLElement>('[data-flower-mark]')?.hidden).toBe(false);
        expect(proof.element.querySelector('[data-character="learner"]')?.getAttribute('data-display-name')).toBe('Mina');
        expect(proof.element.querySelector('[data-character="learner"]')?.getAttribute('data-position')).toBe('right');
        expect(proof.element.querySelector('.academy-vn-speaker')?.textContent).toBe('Mina');
        expect([...proof.element.querySelectorAll('.academy-vn-line-tools button')].map(button => button.textContent))
            .toEqual(['記', '読', '訳']);
        expect(proof.element.querySelector('.academy-constructed-prompt-support-toggle')).toBeNull();
    });

    it('awards one journal line and one review, then offers an answer-concealed replay immediately', async () => {
        const onEvaluation = vi.fn(async () => undefined);
        const proof = await createLessonZeroProof({
            language: 'en',
            content: lessonZeroContent(),
            rieExpressions: expressions,
            learner,
            onEvaluation,
        });
        document.body.append(proof.element);
        advanceToAssessment(proof.element);
        const answer = (): void => {
            const form = proof.element.querySelector<HTMLFormElement>('form')!;
            form.querySelector<HTMLInputElement>('input')!.value = 'もう一度お願いします';
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        };

        answer();
        await flush();
        const reward = proof.element.querySelector<HTMLElement>('[data-first-task-reward="complete"]')!;
        expect(reward.dataset.journalLinesAwarded).toBe('1');
        expect(reward.dataset.srsReviewsAwarded).toBe('1');
        expect(reward.textContent).toContain('Journal · 1 line');
        expect(reward.textContent).toContain('Yomu SRS · 1 review');
        expect(reward.textContent).toContain('Replay this task');

        reward.querySelector<HTMLButtonElement>('.academy-lesson-zero-replay-task')!.click();
        settleDialogue(proof.element);
        expect(proof.element.querySelector('[data-first-task-reward]')).toBeNull();
        expect(proof.element.querySelector('form')).not.toBeNull();
        expect(proof.element.querySelector('[data-page="2"]')?.getAttribute('data-answer-concealed')).toBe('true');
        expect(proof.element.querySelector('.academy-vn-japanese')?.textContent)
            .toBe('８）Q：わかりますか？ A：はい、わかります。 A：いいえ、わかりません。');

        answer();
        await flush();
        expect(onEvaluation).toHaveBeenCalledTimes(2);
        expect(proof.element.querySelector('[data-first-task-reward="complete"]')).not.toBeNull();
    });

    it('keeps Back separate from the current lesson action and delegates persisted navigation', async () => {
        const onBack = vi.fn();
        const proof = await createLessonZeroProof({
            language: 'en',
            content: lessonZeroContent(),
            rieExpressions: expressions,
            onBack,
        });
        document.body.append(proof.element);

        const navigation = proof.element.querySelector<HTMLElement>('.academy-vn-navigation')!;
        const back = navigation.querySelector<HTMLButtonElement>('.academy-vn-back')!;
        expect(back.textContent).toBe('\u2190 Back to lesson plan');
        expect(navigation.querySelector('.academy-vn-action-slot .academy-vn-back')).toBeNull();
        back.click();
        expect(onBack).toHaveBeenCalledOnce();
    });

    it('continues from item 10 through item 14 and owns cleanup', async () => {
        const onComplete = vi.fn();
        const evaluations: string[] = [];
        const proof = await createLessonZeroProof({
            language: 'ja',
            content: lessonZeroContent(),
            rieExpressions: expressions,
            onEvaluation(evaluation) { evaluations.push(evaluation.attempt.activityId); },
            onComplete,
        });
        document.body.append(proof.element);
        advanceToAssessment(proof.element);
        const form = proof.element.querySelector<HTMLFormElement>('form')!;
        form.querySelector<HTMLInputElement>('input')!.value = 'もういちどおねがいします';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flush();
        proof.element.querySelector<HTMLButtonElement>('.academy-lesson-zero-after-pass')!.click();
        settleDialogue(proof.element);

        const expected = [
            '１０）（とても）いいです。',
            '１１）そうです／あってます。',
            '１２）ちがいます。',
            '１３）しゅくだい',
            '１４）れい',
        ];
        for (const line of expected) {
            expect(proof.element.querySelector('.academy-vn-japanese')?.textContent).toBe(line);
            next(proof.element);
        }
        expect(proof.element.querySelector('.academy-lesson-zero-kana-mastery')).not.toBeNull();
        expect(onComplete).not.toHaveBeenCalled();
        completeKanaMasteryGate(proof.element);
        expect(onComplete).toHaveBeenCalledOnce();
        expect(evaluations).toContain('activity:lesson-zero-kana-mastery');
        expect(proof.audioRequired).toEqual({
            sourceGreetings: { assetId: 'audio:genki-k00-g', state: 'ready', ready: true },
            textMission: { assetId: 'audio:lesson-zero-text-hosts', state: 'release-blocked', ready: false },
        });
        proof.dispose();
        expect(proof.element.isConnected).toBe(false);
        expect(() => proof.dispose()).not.toThrow();
    });

    it('records immutable runtime hashes and progression-source roles', () => {
        const manifest = JSON.parse(fs.readFileSync(
            path.resolve('public/academy/content/lessons/lesson-zero/provenance.v1.json'),
            'utf8',
        ));
        expect(manifest.sequence.map((entry: { role: string }) => entry.role)).toEqual([
            'writing-system-prerequisite',
            'kana-a-row-writing',
            'greetings-reference-and-audio',
            'classroom-language',
        ]);
        expect(manifest.anchors.map((entry: { source: string }) => entry.source)).toEqual([
            'Minna no Nihongo Shokyu I, second edition, main text',
            'Soya hiragana_basic.js and KanaStrokeTrainer.js',
        ]);
        expect(manifest.policy).toEqual({
            manifest: '/academy/content/source-pipeline/permitted-corpus.v1.json',
            revision: 'yomu-academy.permitted-corpus/2026-07-14.1',
            answerGate: 'after-attempt',
        });
        for (const entry of manifest.sequence as Array<Record<string, unknown>>) {
            const urls = [entry.runtimeUrl, ...(Array.isArray(entry.runtimeUrls) ? entry.runtimeUrls : []), entry.audioUrl]
                .filter((value): value is string => typeof value === 'string');
            const runtimeHashes = Array.isArray(entry.runtimeSha256) ? entry.runtimeSha256 : [entry.runtimeSha256];
            const hashes = [...runtimeHashes, entry.audioSha256]
                .filter((value): value is string => typeof value === 'string');
            expect(urls).toHaveLength(hashes.length);
            for (const [index, url] of urls.entries()) {
                const relative = url.replace(/^\/academy\//u, 'academy/');
                const bytes = fs.readFileSync(path.resolve('public', relative));
                expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(hashes[index]);
                expect(fs.readFileSync(path.resolve('docs/public', relative))).toEqual(bytes);
            }
        }
    });

    it('ships every Lesson Zero source asset as offline public bytes at its runtime URL', () => {
        const urls = [
            LESSON_ZERO_SOURCE_MEDIA.writingSystem,
            LESSON_ZERO_SOURCE_MEDIA.hiraganaARow,
            LESSON_ZERO_SOURCE_MEDIA.genkiGreetings,
            LESSON_ZERO_SOURCE_MEDIA.genkiGreetingsAudio,
            ...LESSON_ZERO_SOURCE_MEDIA.classroomPhrases,
            LESSON_ZERO_SOURCE_MEDIA.provenance,
        ];
        for (const url of urls) {
            expect(url).toMatch(/^\/academy\/content\/lessons\/lesson-zero\//u);
            const relative = url.replace(/^\//u, '');
            const sourceBytes = fs.readFileSync(path.resolve('public', relative));
            const servedBytes = fs.readFileSync(path.resolve('docs/public', relative));
            expect(sourceBytes.byteLength).toBeGreaterThan(0);
            expect(servedBytes).toEqual(sourceBytes);
            if (url.endsWith('.png')) {
                expect(sourceBytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
            } else if (url.endsWith('.mp3')) {
                const signature = sourceBytes.subarray(0, 3).toString('hex');
                expect(signature === '494433' || signature.startsWith('fff')).toBe(true);
            }
        }
    });

    it('keeps the isolated style responsive, tactile, and motion-safe', () => {
        const css = fs.readFileSync(path.resolve('src/academy/styles/lesson-zero-proof.css'), 'utf8');
        expect(css).toContain('.academy-lesson-zero-kana-game');
        expect(css).toContain('.academy-lesson-zero-source-page-frame[data-answer-concealed="true"]::after');
        expect(css).toMatch(/\.academy-lesson-zero-handout:focus-visible,[\s\S]*outline:\s*3px solid/);
        expect(css).toContain('aspect-ratio: 1');
        expect(css).toContain('@media (max-width: 700px)');
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
        expect(css).not.toContain('.academy-panel');
    });
});
