import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS } from '../assets';
import {
    classroomBindingForActivity,
    completedClassroomActivityIds,
    classroomStateForActivity,
} from '../content/lesson-zero-classroom-runtime';
import {
    readClassroomExpressionSession,
    startClassroomExpressionSession,
    transitionClassroomExpressionSession,
    type ClassroomExpressionSessionAction,
    type ClassroomExpressionSessionDefinition,
    type ClassroomExpressionSessionState,
    type ClassroomExpressionSessionTransition,
} from '../domain/classroom-expression-session';
import type { Disposable, PronunciationService } from '../integration/yomu-bridge';
import { academyBackgroundPicture, backButton, element } from './dom';

export interface ClassroomExpressionSessionScreenOptions {
    readonly language: AcademyLanguage;
    readonly activityId: string;
    readonly definition: ClassroomExpressionSessionDefinition;
    readonly initialState: ClassroomExpressionSessionState;
    readonly pronunciation: PronunciationService;
    readonly onTransition: (
        before: ClassroomExpressionSessionState,
        transition: ClassroomExpressionSessionTransition,
    ) => void | Promise<void>;
    readonly onRestart: (state: ClassroomExpressionSessionState) => void | Promise<void>;
    readonly onBack: () => void | Promise<void>;
}

export interface ClassroomExpressionSessionScreen {
    readonly element: HTMLElement;
    dispose(): void;
}

const COPY = {
    session: { en: 'Classroom language', ja: '教室のことば' },
    guide: {
        en: 'Read the moment, then answer Rie in Japanese. You can leave and resume at any time.',
        ja: '場面を読んで、りえ先生に日本語で答えましょう。いつでも中断して続きから戻れます。',
    },
    before: { en: 'A pattern to use', ja: '使えるパターン' },
    example: { en: 'Rie’s example', ja: 'りえ先生の例' },
    yourTurn: { en: 'Your turn', ja: 'あなたの番' },
    placeholder: { en: 'Type what you would say…', ja: '言うことを入力…' },
    submit: { en: 'Answer Rie', ja: 'りえ先生に答える' },
    pause: { en: 'Save and leave', ja: '保存して戻る' },
    hear: { en: 'Hear the example', ja: '例を聞く' },
    hearing: { en: 'Playing…', ja: '再生中…' },
    pass: { en: 'Yes. That works here.', ja: 'はい。この場面で使えます。' },
    next: { en: 'Next moment', ja: '次の場面へ' },
    retry: { en: 'Try that moment again', ja: 'もう一度答える' },
    reveal: { en: 'Show Rie’s answer', ja: 'りえ先生の答えを見る' },
    model: { en: 'Rie would say', ja: 'りえ先生なら' },
    complete: { en: 'This classroom set is yours.', ja: 'この教室表現を使えるようになりました。' },
    completeBody: {
        en: 'Every line in this set has been answered. They are now waiting in your review queue, too.',
        ja: 'このセットの表現にすべて答えました。復習にも追加されています。',
    },
    return: { en: 'Return to the lesson', ja: 'レッスンに戻る' },
    practiceAgain: { en: 'Practice this set again', ja: 'このセットをもう一度練習' },
    saveError: { en: 'That answer could not be saved. Please try once more.', ja: '答えを保存できませんでした。もう一度お試しください。' },
    audioError: { en: 'The example could not be played. The text is still here.', ja: '例の音声を再生できませんでした。文字で確認できます。' },
} as const;

export function createClassroomExpressionSessionScreen(
    options: ClassroomExpressionSessionScreenOptions,
): ClassroomExpressionSessionScreen {
    const lifecycle = new AbortController();
    let renderLifecycle = new AbortController();
    let state = options.initialState;
    let playback: Disposable | null = null;
    let busy = false;
    let disposed = false;
    let passNotice: Readonly<{ response: string; activityCompleted: boolean }> | null = null;

    const screen = element('section', 'academy-screen academy-classroom-expression-screen');
    screen.dataset.academyScreen = 'classroom-expression-session';
    screen.dataset.activityId = options.activityId;
    screen.append(academyBackgroundPicture('classroom'));

    const scene = element('div', 'academy-classroom-expression-scene');
    const guide = element('aside', 'academy-classroom-expression-guide');
    const guidePortrait = element('img', 'academy-classroom-expression-guide-portrait');
    guidePortrait.src = ACADEMY_ASSETS.rie;
    guidePortrait.alt = '';
    guidePortrait.setAttribute('aria-hidden', 'true');
    const guideCopy = element('div', 'academy-classroom-expression-guide-copy');
    const guideName = element('strong', 'academy-classroom-expression-guide-name');
    guideName.textContent = options.language === 'ja' ? 'りえ先生' : 'Rie-sensei';
    const guideLine = localizedParagraph(COPY.guide, options.language, 'academy-classroom-expression-guide-line');
    guideCopy.append(guideName, guideLine);
    guide.append(guidePortrait, guideCopy);

    const workspace = element('main', 'academy-classroom-expression-workspace');
    const paper = element('article', 'academy-classroom-expression-paper');
    const paperHeader = element('header', 'academy-classroom-expression-header');
    const back = backButton(options.language);
    back.classList.add('academy-classroom-expression-back');
    back.textContent = '←';
    back.title = back.getAttribute('aria-label') ?? '';
    back.addEventListener('click', () => void pauseAndLeave(), { signal: lifecycle.signal });
    const headingGroup = element('div', 'academy-classroom-expression-heading-group');
    const eyebrow = element('p', 'academy-classroom-expression-eyebrow');
    eyebrow.textContent = COPY.session[options.language];
    const title = element('h1', 'academy-classroom-expression-title');
    title.tabIndex = -1;
    headingGroup.append(eyebrow, title);
    const overall = element('p', 'academy-classroom-expression-overall');
    overall.setAttribute('role', 'status');
    overall.setAttribute('aria-live', 'polite');
    paperHeader.append(back, headingGroup, overall);
    const phaseNav = element('nav', 'academy-classroom-expression-phases');
    phaseNav.setAttribute('aria-label', options.language === 'ja' ? '教室表現のまとまり' : 'Classroom expression phases');
    const body = element('div', 'academy-classroom-expression-body');
    const live = element('div', 'academy-classroom-expression-live');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    paper.append(paperHeader, phaseNav, body, live);
    workspace.append(paper);
    scene.append(guide, workspace);
    screen.append(scene);

    const binding = classroomBindingForActivity(options.activityId);
    const bindingProbeIds = options.definition.expressions
        .filter(expression => binding.expressionIds.includes(expression.id))
        .flatMap(expression => expression.probes.map(probe => probe.id));
    const visiblePhases = options.definition.phases.filter(phase =>
        phase.expressionIds.some(id => binding.expressionIds.includes(id)));

    const render = (): void => {
        renderLifecycle.abort();
        renderLifecycle = new AbortController();
        const signal = renderLifecycle.signal;
        body.replaceChildren();
        phaseNav.replaceChildren();
        live.textContent = '';
        screen.dataset.sessionStatus = state.status;
        const view = readClassroomExpressionSession(options.definition, state);
        title.textContent = view.phaseTitle[options.language];
        const completedBindingProbes = bindingProbeIds
            .filter(id => state.passedProbeIds.includes(id)).length;
        overall.textContent = options.language === 'ja'
            ? `${bindingProbeIds.length}場面中 ${completedBindingProbes}場面に回答`
            : `${completedBindingProbes} of ${bindingProbeIds.length} moments answered`;
        renderPhaseNavigation(signal);

        if (completedClassroomActivityIds(options.definition, state).includes(options.activityId)) {
            renderCompletion(signal);
            return;
        }
        if (passNotice) {
            renderPass(signal);
            return;
        }
        renderPrompt(view, signal);
    };

    const renderPhaseNavigation = (signal: AbortSignal): void => {
        const passed = new Set(state.passedProbeIds);
        for (const phase of visiblePhases) {
            const expressions = phase.expressionIds
                .filter(id => binding.expressionIds.includes(id))
                .map(id => options.definition.expressions.find(candidate => candidate.id === id)!)
                .filter(Boolean);
            const probeIds = expressions.flatMap(expression => expression.probes.map(probe => probe.id));
            const complete = probeIds.filter(id => passed.has(id)).length;
            const button = element('button', 'academy-classroom-expression-phase');
            button.type = 'button';
            button.dataset.phaseId = phase.id;
            button.dataset.phaseComplete = String(complete === probeIds.length);
            if (phase.id === state.cursor.phaseId) button.setAttribute('aria-current', 'step');
            const label = element('span', 'academy-classroom-expression-phase-label');
            label.textContent = phase.title[options.language];
            const count = element('span', 'academy-classroom-expression-phase-count');
            count.textContent = `${complete}/${probeIds.length}`;
            button.append(label, count);
            button.addEventListener('click', () => void dispatch({
                kind: 'navigate', target: { kind: 'phase', id: phase.id },
            }), { signal });
            phaseNav.append(button);
        }
    };

    const renderPrompt = (
        view: ReturnType<typeof readClassroomExpressionSession>,
        signal: AbortSignal,
    ): void => {
        const teaching = element('section', 'academy-classroom-expression-teaching');
        const teachingLabel = element('h2', 'academy-classroom-expression-section-label');
        teachingLabel.textContent = COPY.before[options.language];
        const explanation = bilingual(view.preAssessmentTeaching.explanation, 'academy-classroom-expression-explanation');
        const example = element('div', 'academy-classroom-expression-example');
        const exampleLabel = element('strong', 'academy-classroom-expression-example-label');
        exampleLabel.textContent = COPY.example[options.language];
        const context = bilingual(view.preAssessmentTeaching.workedExample.context, 'academy-classroom-expression-example-context');
        const japanese = element('p', 'academy-classroom-expression-example-japanese');
        japanese.lang = 'ja';
        japanese.dataset.yomuRuntimeSurface = 'academy-classroom-expression-example';
        japanese.dataset.yomuFuriganaMode = 'all';
        japanese.textContent = view.preAssessmentTeaching.workedExample.japanese;
        const meaning = bilingual(view.preAssessmentTeaching.workedExample.meaning, 'academy-classroom-expression-example-meaning');
        const hear = element('button', 'academy-button academy-classroom-expression-hear');
        hear.type = 'button';
        hear.textContent = `▶ ${COPY.hear[options.language]}`;
        const audioError = element('p', 'academy-classroom-expression-audio-error');
        audioError.setAttribute('role', 'alert');
        hear.addEventListener('click', () => {
            playback?.dispose();
            playback = null;
            hear.disabled = true;
            hear.textContent = COPY.hearing[options.language];
            audioError.textContent = '';
            void options.pronunciation.play(
                view.preAssessmentTeaching.workedExample.japanese,
                view.preAssessmentTeaching.workedExample.reading,
            ).then(active => {
                if (disposed) active.dispose();
                else playback = active;
            }).catch(() => {
                if (!disposed) audioError.textContent = COPY.audioError[options.language];
            }).finally(() => {
                if (!disposed) {
                    hear.disabled = false;
                    hear.textContent = `▶ ${COPY.hear[options.language]}`;
                }
            });
        }, { signal });
        example.append(exampleLabel, context, japanese, meaning, hear, audioError);
        teaching.append(teachingLabel, explanation, example);

        const turn = element('section', 'academy-classroom-expression-turn');
        const turnLabel = element('h2', 'academy-classroom-expression-section-label');
        turnLabel.textContent = COPY.yourTurn[options.language];
        const prompt = bilingual(view.prompt, 'academy-classroom-expression-prompt');
        const form = element('form', 'academy-classroom-expression-form');
        const label = element('label', 'academy-classroom-expression-input-label');
        label.htmlFor = `classroom-expression-${safeId(view.cursor.probeId)}`;
        label.textContent = options.language === 'ja' ? '日本語で答える' : 'Answer in Japanese';
        const input = element('input', 'academy-input academy-classroom-expression-input');
        input.id = label.htmlFor;
        input.type = 'text';
        input.lang = 'ja';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.placeholder = COPY.placeholder[options.language];
        input.required = true;
        input.dataset.jpdbReaderSurfaceIgnore = '';
        const submit = element('button', 'academy-button academy-button-primary academy-classroom-expression-submit');
        submit.type = 'submit';
        submit.textContent = COPY.submit[options.language];
        const error = element('p', 'academy-classroom-expression-error');
        error.setAttribute('role', 'alert');
        form.append(label, input, submit, error);
        form.addEventListener('submit', event => {
            event.preventDefault();
            if (!input.value.trim() || busy) {
                input.focus();
                return;
            }
            void submitAnswer(input.value, error);
        }, { signal });
        turn.append(turnLabel, prompt, form);
        if (view.earnedRepair) turn.append(repairPanel(view.earnedRepair, signal));
        body.append(teaching, turn, pauseAction(signal));
        if (shouldAutofocusResponse()) queueMicrotask(() => input.focus({ preventScroll: true }));
    };

    const repairPanel = (
        repair: NonNullable<ReturnType<typeof readClassroomExpressionSession>['earnedRepair']>,
        signal: AbortSignal,
    ): HTMLElement => {
        const panel = element('aside', 'academy-classroom-expression-repair');
        panel.dataset.repairEarned = 'true';
        panel.append(
            bilingual(repair.contrast, 'academy-classroom-expression-repair-contrast'),
            bilingual(repair.retryPrompt, 'academy-classroom-expression-repair-prompt'),
            bilingual(repair.nearbyExample, 'academy-classroom-expression-repair-example'),
        );
        if (repair.modelAnswer) {
            const model = element('p', 'academy-classroom-expression-model');
            const label = element('span', 'academy-classroom-expression-model-label');
            label.textContent = COPY.model[options.language];
            const answer = element('strong', 'academy-classroom-expression-model-answer');
            answer.lang = 'ja';
            answer.textContent = repair.modelAnswer;
            model.append(label, answer);
            panel.append(model);
        } else {
            const reveal = element('button', 'academy-button academy-button-secondary academy-classroom-expression-reveal');
            reveal.type = 'button';
            reveal.textContent = COPY.reveal[options.language];
            reveal.addEventListener('click', () => void dispatch({ kind: 'reveal-model' }), { signal });
            panel.append(reveal);
        }
        return panel;
    };

    const renderPass = (signal: AbortSignal): void => {
        const notice = passNotice!;
        const root = element('section', 'academy-classroom-expression-result');
        root.dataset.outcome = 'pass';
        const mark = element('span', 'academy-classroom-expression-result-mark');
        mark.textContent = '✓';
        mark.setAttribute('aria-hidden', 'true');
        const heading = element('h2', 'academy-classroom-expression-result-title');
        heading.textContent = COPY.pass[options.language];
        const answer = element('p', 'academy-classroom-expression-result-answer');
        answer.lang = 'ja';
        answer.dataset.yomuRuntimeSurface = 'academy-classroom-expression-result';
        answer.dataset.yomuFuriganaMode = 'all';
        answer.textContent = notice.response;
        const actions = element('div', 'academy-classroom-expression-result-actions');
        if (notice.activityCompleted) {
            const done = element('button', 'academy-button academy-button-primary');
            done.type = 'button';
            done.textContent = COPY.return[options.language];
            done.addEventListener('click', () => void notify(options.onBack), { signal });
            actions.append(done);
        } else {
            const next = element('button', 'academy-button academy-button-primary');
            next.type = 'button';
            next.textContent = COPY.next[options.language];
            next.addEventListener('click', () => {
                passNotice = null;
                render();
            }, { signal });
            actions.append(next);
        }
        root.append(mark, heading, answer, actions);
        body.append(root);
        queueMicrotask(() => actions.querySelector<HTMLButtonElement>('button')?.focus());
    };

    const renderCompletion = (signal: AbortSignal): void => {
        const root = element('section', 'academy-classroom-expression-complete');
        const seal = element('span', 'academy-classroom-expression-complete-seal');
        seal.textContent = '済';
        seal.lang = 'ja';
        seal.setAttribute('aria-hidden', 'true');
        const heading = element('h2', 'academy-classroom-expression-complete-title');
        heading.textContent = COPY.complete[options.language];
        const copy = localizedParagraph(COPY.completeBody, options.language, 'academy-classroom-expression-complete-copy');
        const actions = element('div', 'academy-classroom-expression-complete-actions');
        const done = element('button', 'academy-button academy-button-primary');
        done.type = 'button';
        done.textContent = COPY.return[options.language];
        done.addEventListener('click', () => void notify(options.onBack), { signal });
        const again = element('button', 'academy-button academy-button-secondary');
        again.type = 'button';
        again.textContent = COPY.practiceAgain[options.language];
        again.addEventListener('click', () => void restart(), { signal });
        actions.append(done, again);
        root.append(seal, heading, copy, actions);
        body.append(root);
        queueMicrotask(() => done.focus());
    };

    const pauseAction = (signal: AbortSignal): HTMLElement => {
        const footer = element('footer', 'academy-classroom-expression-footer');
        const pause = element('button', 'academy-button academy-classroom-expression-pause');
        pause.type = 'button';
        pause.textContent = COPY.pause[options.language];
        pause.addEventListener('click', () => void pauseAndLeave(), { signal });
        footer.append(pause);
        return footer;
    };

    const submitAnswer = async (response: string, error: HTMLElement): Promise<void> => {
        const before = state;
        const transition = transitionClassroomExpressionSession(
            options.definition,
            state,
            { kind: 'submit', response },
            Date.now(),
        );
        const completed = completedClassroomActivityIds(options.definition, transition.state)
            .includes(options.activityId);
        try {
            busy = true;
            screen.setAttribute('aria-busy', 'true');
            await options.onTransition(before, transition);
            state = transition.state;
            if (transition.evidence.some(event => event.kind === 'attempt-recorded' && event.outcome === 'pass')) {
                passNotice = { response, activityCompleted: completed };
            }
            render();
        } catch {
            error.textContent = COPY.saveError[options.language];
        } finally {
            busy = false;
            screen.removeAttribute('aria-busy');
        }
    };

    const dispatch = async (action: ClassroomExpressionSessionAction): Promise<void> => {
        if (busy) return;
        const before = state;
        const transition = transitionClassroomExpressionSession(options.definition, state, action, Date.now());
        try {
            busy = true;
            screen.setAttribute('aria-busy', 'true');
            await options.onTransition(before, transition);
            state = transition.state;
            passNotice = null;
            render();
        } catch {
            live.textContent = COPY.saveError[options.language];
        } finally {
            busy = false;
            screen.removeAttribute('aria-busy');
        }
    };

    const pauseAndLeave = async (): Promise<void> => {
        if (busy) return;
        if (state.status === 'active') {
            const before = state;
            const paused = transitionClassroomExpressionSession(options.definition, state, { kind: 'pause' }, Date.now());
            await options.onTransition(before, paused);
            state = paused.state;
        }
        await notify(options.onBack);
    };

    const restart = async (): Promise<void> => {
        if (busy) return;
        let fresh = startClassroomExpressionSession(options.definition);
        fresh = classroomStateForActivity(options.definition, fresh, options.activityId);
        try {
            busy = true;
            await options.onRestart(fresh);
            state = fresh;
            passNotice = null;
            render();
        } finally {
            busy = false;
        }
    };

    render();
    return {
        element: screen,
        dispose() {
            if (disposed) return;
            disposed = true;
            lifecycle.abort();
            renderLifecycle.abort();
            playback?.dispose();
            playback = null;
        },
    };
}

function bilingual(value: Readonly<{ en: string; ja: string }>, className: string): HTMLElement {
    const root = element('div', className);
    const ja = element('p', `${className}-ja`);
    ja.lang = 'ja';
    ja.dataset.yomuRuntimeSurface = 'academy-classroom-expression';
    ja.dataset.yomuFuriganaMode = 'all';
    ja.textContent = value.ja;
    const en = element('p', `${className}-en`);
    en.lang = 'en';
    en.dataset.jpdbReaderSurfaceIgnore = '';
    en.textContent = value.en;
    root.append(ja, en);
    return root;
}

function shouldAutofocusResponse(): boolean {
    return typeof matchMedia === 'function'
        && matchMedia('(min-width: 720px) and (pointer: fine)').matches;
}

function localizedParagraph(
    value: Readonly<{ en: string; ja: string }>,
    language: AcademyLanguage,
    className: string,
): HTMLParagraphElement {
    const paragraph = element('p', className);
    paragraph.textContent = value[language];
    paragraph.lang = language;
    if (language === 'ja') {
        paragraph.dataset.yomuRuntimeSurface = 'academy-classroom-expression-copy';
        paragraph.dataset.yomuFuriganaMode = 'all';
    } else {
        paragraph.dataset.jpdbReaderSurfaceIgnore = '';
    }
    return paragraph;
}

function safeId(value: string): string {
    return value.replace(/[^a-z0-9_-]+/giu, '-');
}

async function notify(callback: () => void | Promise<void>): Promise<void> {
    await callback();
}
