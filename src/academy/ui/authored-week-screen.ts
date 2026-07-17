import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type {
    AuthoredChoiceEvaluation,
    LearnerAuthoredActivity,
    LearnerAuthoredChoice,
    LearnerAuthoredText,
    LearnerAuthoredWeek,
    LearnerListeningSource,
} from '../content/authored-week-adapter';
import type { ActivityController, ActivityRuntime, ReviewSeed } from '../domain/activity-runtime';
import type { LocalizedText } from '../domain/source-library';
import { createAcademyActivityRuntime } from '../minigames';
import { ACADEMY_ASSETS } from '../assets';
import type { AcademyPlateId } from '../assets';
import { academyBackgroundPicture, backButton, element } from './dom';
import type { LessonActivityExtension } from './lesson-activity-chapter';
import {
    appendProgressiveFeedback,
    createLessonLanguageSupport,
    teachingSupportView,
} from './lesson-activity-support';

export interface AuthoredWeekScreenOptions {
    readonly language: AcademyLanguage;
    readonly week: LearnerAuthoredWeek;
    readonly storyContext?: Readonly<{
        readonly hostName: string;
        readonly hostId: string;
        readonly originPlaceId?: string;
        readonly plate?: AcademyPlateId;
        readonly location?: LocalizedText;
        readonly setup: LocalizedText;
        readonly callback: LocalizedText;
        readonly handoff?: LocalizedText;
        readonly dialogue?: readonly Readonly<{
            readonly speakerId: string;
            readonly speakerName: string;
            readonly purpose: 'need' | 'model' | 'transfer';
            readonly line: LocalizedText;
        }>[];
    }>;
    readonly onReviewSeeds?: (seeds: readonly ReviewSeed[]) => void | Promise<void>;
    readonly onEvaluation?: (
        activity: LearnerAuthoredActivity,
        evaluation: AuthoredChoiceEvaluation,
    ) => void | Promise<void>;
    readonly onComplete?: () => void | Promise<void>;
    readonly onBack?: () => void | Promise<void>;
    readonly onListeningStart?: () => void;
    readonly onListeningStop?: () => void;
    readonly extension?: LessonActivityExtension;
    readonly runtime?: ActivityRuntime;
}

export interface AuthoredWeekScreen {
    readonly element: HTMLElement;
    readonly currentActivityIndex: number;
    readonly currentActivityId: string | null;
    dispose(): void;
}

const COPY = {
    progress: { en: 'Progress', ja: '進み具合' },
    question: { en: 'Question', ja: '問題' },
    audioUnavailable: {
        en: 'Audio is unavailable for this week. You can continue with the text activity.',
        ja: 'この週の音声は利用できません。文字の問題を続けられます。',
    },
    pass: { en: 'Correct.', ja: '正解です。' },
    lapse: { en: 'Let’s repair this one.', ja: 'ここを直しましょう。' },
    retry: { en: 'Try again', ja: 'もう一度' },
    next: { en: 'Next question', ja: '次の問題' },
    finish: { en: 'Finish week', ja: '週を終える' },
    complete: { en: 'Week complete.', ja: '今週の学習が終わりました。' },
    evaluationError: { en: 'Your answer could not be checked. Try again.', ja: '答えを確認できませんでした。もう一度お試しください。' },
} as const satisfies Readonly<Record<string, LocalizedText>>;

export function createAuthoredWeekScreen(options: AuthoredWeekScreenOptions): AuthoredWeekScreen {
    if (options.week.activities.length === 0) throw new TypeError('An authored week needs at least one activity.');

    const lifecycle = new AbortController();
    const screen = element('section', 'academy-screen academy-authored-week-screen');
    screen.dataset.academyScreen = 'authored-week';
    screen.dataset.weekId = options.week.id;
    const plate = options.storyContext?.plate ?? 'classroom';
    screen.dataset.plate = plate;
    screen.append(academyBackgroundPicture(plate));
    if (!options.storyContext) {
        const host = element('img', 'academy-authored-week-host');
        host.src = ACADEMY_ASSETS.rie;
        host.alt = '';
        host.setAttribute('aria-hidden', 'true');
        screen.append(host);
    }
    const veil = element('div', 'academy-screen-veil academy-authored-week-veil');
    const panel = element('article', 'academy-panel academy-authored-week-panel');
    const content = element('div', 'academy-panel-content');
    if (options.onBack) {
        const back = backButton(options.language);
        back.classList.add('academy-authored-week-back');
        back.addEventListener('click', () => notify(options.onBack!, screen), { signal: lifecycle.signal });
        content.append(back);
    }
    const progress = progressBlock(options.week.activities.length + (options.extension?.activityCount ?? 0));
    const audio = unavailableAudio(options.week);
    const activityHost = element('div', 'academy-activity-host');
    const languageSupport = createLessonLanguageSupport(activityHost, options.language);
    if (options.storyContext) {
        const context = element('section', 'academy-authored-week-story-context');
        const host = element('h2', 'academy-authored-week-story-host');
        host.textContent = options.storyContext.hostName;
        context.dataset.storyHost = options.storyContext.hostId;
        context.dataset.storyPresentation = 'name-only';
        if (options.storyContext.originPlaceId) context.dataset.storyOriginPlace = options.storyContext.originPlaceId;
        if (options.storyContext.location) {
            context.append(bilingualParagraph(options.storyContext.location, 'academy-authored-week-story-location'));
        }
        context.append(
            host,
            bilingualParagraph(options.storyContext.setup, 'academy-authored-week-story-setup'),
            bilingualParagraph(options.storyContext.callback, 'academy-authored-week-story-callback'),
        );
        if (options.storyContext.dialogue?.length) {
            const dialogue = element('ol', 'academy-authored-week-story-dialogue');
            options.storyContext.dialogue.forEach(turn => {
                const item = element('li', 'academy-authored-week-story-turn');
                item.dataset.storySpeaker = turn.speakerId;
                item.dataset.storyPurpose = turn.purpose;
                const speaker = element('strong', 'academy-authored-week-story-speaker');
                speaker.textContent = turn.speakerName;
                item.append(speaker, bilingualParagraph(turn.line, 'academy-authored-week-story-line'));
                dialogue.append(item);
            });
            context.append(dialogue);
        }
        content.append(context);
    }
    content.append(languageSupport.element);
    content.append(progress.root);
    if (audio) content.append(audio);
    content.append(activityHost);
    panel.append(content);
    veil.append(panel);
    screen.append(veil);

    let currentIndex = 0;
    const completedActivityIds = new Set<string>();
    let extensionCompleted = 0;
    let disposed = false;
    let completionNotified = false;
    let showingComplete = false;
    let showingAuthoredActivity = true;
    let extensionController: ReturnType<LessonActivityExtension['mount']> | undefined;
    let activityController: ActivityController | undefined;

    const advance = (): void => {
        completedActivityIds.add(options.week.activities[currentIndex].id);
        progress.update(completedActivityIds.size + extensionCompleted);
        if (currentIndex < options.week.activities.length - 1) {
            currentIndex += 1;
            renderCurrent(true);
            return;
        }
        if (options.extension) renderExtension();
        else renderComplete();
    };

    const renderCurrent = (focus = false, showSupport = true): void => {
        options.onListeningStop?.();
        activityController?.dispose();
        activityController = undefined;
        extensionController?.dispose();
        extensionController = undefined;
        showingComplete = false;
        showingAuthoredActivity = true;
        const activity = options.week.activities[currentIndex];
        const hasTeachingSupport = activity.kind !== 'academy-source-vocabulary-sheet';
        if (showSupport && hasTeachingSupport) {
            const teachingSupport = authoredTeachingSupport(activity);
            const supportView = teachingSupportView(teachingSupport, options.language);
            const navigation = lessonNavigation(options.language, {
                back: currentIndex > 0 ? () => {
                    currentIndex -= 1;
                    renderCurrent(true);
                } : undefined,
                next: () => renderCurrent(true, false),
                nextLabel: options.language === 'ja' ? '問題へ' : 'Continue to question',
            }, lifecycle.signal);
            supportView.append(navigation);
            activityHost.replaceChildren(supportView);
            languageSupport.refresh();
            if (focus) supportView.querySelector<HTMLElement>('h2')?.focus();
            return;
        }
        const questionHost = element('div', 'academy-authored-week-question-host');
        const backAction = hasTeachingSupport
            ? { back: () => renderCurrent(true), backLabel: options.language === 'ja' ? '学習サポート' : 'Review support' }
            : currentIndex > 0
                ? {
                    back: () => { currentIndex -= 1; renderCurrent(true); },
                    backLabel: options.language === 'ja' ? '前の問題' : 'Previous question',
                }
                : null;
        if (backAction) {
            const returnNavigation = lessonNavigation(options.language, backAction, lifecycle.signal);
            activityHost.replaceChildren(returnNavigation, questionHost);
        } else activityHost.replaceChildren(questionHost);
        if (activity.kind === 'academy-source-vocabulary-sheet') {
            const runtime = options.runtime ?? createAcademyActivityRuntime();
            let passed = false;
            activityController = runtime.mount(activity, {
                language: options.language,
                replace(view) { questionHost.replaceChildren(view); languageSupport.refresh(); },
                announce(message) { questionHost.setAttribute('aria-label', message); },
                registerReadingSurface: languageSupport.registerReadingSurface,
            }, async evaluation => {
                await Promise.all([
                    options.onReviewSeeds?.(evaluation.reviewSeeds),
                    options.onEvaluation?.(activity, evaluation),
                ]);
                if (evaluation.result.outcome !== 'pass' || passed) return;
                passed = true;
                const action = element('button', 'academy-button academy-authored-week-next');
                action.type = 'button';
                action.textContent = localized(
                    currentIndex === options.week.activities.length - 1 && !options.extension ? COPY.finish : COPY.next,
                    options.language,
                );
                action.addEventListener('click', advance, { signal: lifecycle.signal, once: true });
                questionHost.append(action);
                action.focus();
            });
            if (focus) activityController.focus();
            return;
        }
        questionHost.replaceChildren(renderActivity(activity, currentIndex, options.week.activities.length, {
            language: options.language,
            signal: lifecycle.signal,
            evaluate: responseId => options.week.evaluate(activity.id, responseId),
            async onEvaluation(evaluation) {
                await Promise.all([
                    options.onReviewSeeds?.(evaluation.reviewSeeds),
                    options.onEvaluation?.(activity, evaluation),
                ]);
            },
            onRetry() {
                renderCurrent(true, false);
            },
            hasExtension: Boolean(options.extension),
            onListeningStart: options.onListeningStart,
            onListeningStop: options.onListeningStop,
            onAdvance() {
                advance();
            },
        }));
        languageSupport.refresh();
        if (focus) questionHost.querySelector<HTMLElement>('.academy-choice-option, .academy-authored-text-input')?.focus();
    };

    const renderExtension = (): void => {
        showingComplete = false;
        showingAuthoredActivity = false;
        activityController?.dispose();
        activityController = undefined;
        extensionController?.dispose();
        extensionController = options.extension?.mount(activityHost, {
            onProgress(completedInExtension) {
                extensionCompleted = Math.max(extensionCompleted, completedInExtension);
                progress.update(completedActivityIds.size + extensionCompleted);
            },
            onComplete() {
                extensionCompleted = options.extension?.activityCount ?? 0;
                renderComplete();
            },
            onBack() {
                currentIndex = options.week.activities.length - 1;
                renderCurrent(true);
            },
            registerReadingSurface: languageSupport.registerReadingSurface,
        });
        extensionController?.focus();
    };

    const renderComplete = (): void => {
        activityController?.dispose();
        activityController = undefined;
        extensionController?.dispose();
        extensionController = undefined;
        showingComplete = true;
        showingAuthoredActivity = false;
        const complete = element('section', 'academy-activity academy-authored-week-complete');
        complete.dataset.weekComplete = 'true';
        complete.tabIndex = -1;
        complete.append(bilingualParagraph(COPY.complete, 'academy-success-note'));
        if (options.storyContext?.handoff) {
            complete.append(bilingualParagraph(options.storyContext.handoff, 'academy-authored-week-story-handoff'));
        }
        const finish = (): void => {
            if (completionNotified) return;
            completionNotified = true;
            notify(() => options.onComplete?.(), screen);
        };
        complete.append(lessonNavigation(options.language, {
            back: () => {
                if (options.extension) renderExtension();
                else {
                    currentIndex = options.week.activities.length - 1;
                    renderCurrent(true);
                }
            },
            backLabel: options.language === 'ja' ? '最後の問題を見直す' : 'Revisit last activity',
            ...(options.storyContext?.handoff ? {
                next: finish,
                nextLabel: options.language === 'ja' ? '元の道へ戻る' : 'Return to your route',
            } : {}),
        }, lifecycle.signal));
        activityHost.replaceChildren(complete);
        complete.focus();
        if (!options.storyContext?.handoff) finish();
    };

    renderCurrent();

    return {
        element: screen,
        get currentActivityIndex() { return currentIndex; },
        get currentActivityId() { return showingAuthoredActivity && !showingComplete ? options.week.activities[currentIndex].id : null; },
        dispose() {
            if (disposed) return;
            disposed = true;
            lifecycle.abort();
            options.onListeningStop?.();
            extensionController?.dispose();
            activityController?.dispose();
            languageSupport.dispose();
            screen.remove();
        },
    };
}

function authoredTeachingSupport(activity: LearnerAuthoredActivity): import('../domain/activity-runtime').ActivityTeachingSupport {
    if ('teachingSupport' in activity && activity.teachingSupport) return activity.teachingSupport;
    if (activity.kind === 'academy-source-vocabulary-sheet') {
        return {
            kind: 'vocabulary',
            title: { ja: 'ことばを見てから', en: 'See the word first' },
            entries: [{
                japanese: activity.payload.support.words,
                ...(activity.payload.support.reading !== activity.payload.support.words
                    ? { reading: activity.payload.support.reading }
                    : {}),
            }],
        };
    }
    const hasListening = activity.kind === 'choice' && Boolean(activity.listening);
    return {
        kind: hasListening ? 'context' : 'example',
        title: hasListening
            ? { ja: '聞く場面', en: 'Listening context' }
            : { ja: '問題のことば', en: 'Language in the question' },
        entries: [{ japanese: activity.prompt.ja, translation: activity.prompt.en }],
    };
}

interface ActivityActions {
    readonly language: AcademyLanguage;
    readonly signal: AbortSignal;
    readonly evaluate: (responseId: string) => AuthoredChoiceEvaluation;
    readonly onEvaluation: (evaluation: AuthoredChoiceEvaluation) => Promise<void>;
    readonly onRetry: () => void;
    readonly onAdvance: () => void;
    readonly hasExtension: boolean;
    readonly onListeningStart?: () => void;
    readonly onListeningStop?: () => void;
}

function renderActivity(
    activity: LearnerAuthoredChoice | LearnerAuthoredText,
    index: number,
    total: number,
    actions: ActivityActions,
): HTMLElement {
    const root = element('section', 'academy-activity academy-choice-activity academy-authored-week-activity');
    root.dataset.activityId = activity.id;
    const count = element('p', 'academy-eyebrow');
    count.append(
        japanese(`${COPY.question.ja} ${index + 1} / ${total}`),
        support(`${COPY.question.en} ${index + 1} of ${total}`),
    );
    const heading = element('h1', 'academy-authored-week-prompt');
    heading.id = `academy-authored-prompt-${index}`;
    heading.append(japanese(activity.prompt.ja), support(activity.prompt.en));
    const choices = element('div', activity.kind === 'choice' ? 'academy-choice-options' : 'academy-text-response');
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-labelledby', heading.id);
    const feedback = element('div', 'academy-activity-feedback');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    let committed = false;
    const listening = activity.kind === 'choice' ? activity.listening : undefined;

    if (activity.kind === 'text') {
        const input = element('input', 'academy-input academy-authored-text-input');
        input.type = 'text';
        input.lang = 'ja';
        input.autocomplete = 'off';
        input.dataset.jpdbReaderSurfaceIgnore = '';
        input.setAttribute('aria-labelledby', heading.id);
        const commit = element('button', 'academy-button academy-button-primary');
        commit.type = 'button';
        commit.textContent = actions.language === 'ja' ? '答えを確認' : 'Check answer';
        const evaluateText = (): void => {
            if (committed || !input.value.trim()) return;
            committed = true;
            input.disabled = true;
            commit.disabled = true;
            void commitResponse(input.value, commit);
        };
        commit.addEventListener('click', evaluateText, { signal: actions.signal });
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                evaluateText();
            }
        }, { signal: actions.signal });
        choices.append(input, commit);
    } else for (const option of activity.options) {
        const row = element('div', 'academy-choice-row');
        const button = element('button', 'academy-choice-option');
        button.type = 'button';
        button.dataset.choiceId = option.id;
        button.setAttribute('aria-label', option.label.ja);
        button.append(assessedJapanese(option.label.ja));
        button.addEventListener('click', () => {
            if (committed) return;
            committed = true;
            setChoicesDisabled(choices, true);
            void commitResponse(option.id, button);
        }, { signal: actions.signal });
        row.append(button);
        choices.append(row);
    }

    async function commitResponse(response: string, control: HTMLButtonElement): Promise<void> {
            let evaluation: AuthoredChoiceEvaluation;
            try {
                evaluation = actions.evaluate(response);
            } catch {
                committed = false;
                setChoicesDisabled(choices, false);
                feedback.replaceChildren(bilingualParagraph(COPY.evaluationError, 'academy-field-error'));
                feedback.setAttribute('role', 'alert');
                control.focus();
                return;
            }

            const persist = async (): Promise<void> => {
                feedback.replaceChildren(bilingualParagraph(
                    { en: 'Saving your answer…', ja: '答えを保存しています…' },
                    'academy-authored-week-saving',
                ));
                feedback.setAttribute('role', 'status');
                try {
                    await actions.onEvaluation(evaluation);
                } catch {
                    feedback.replaceChildren(bilingualParagraph(
                        { en: 'Your answer was not saved. Try saving again before continuing.', ja: '答えを保存できませんでした。続ける前にもう一度保存してください。' },
                        'academy-field-error',
                    ));
                    feedback.setAttribute('role', 'alert');
                    const retrySave = element('button', 'academy-button academy-authored-week-retry-save');
                    retrySave.type = 'button';
                    retrySave.textContent = actions.language === 'ja' ? 'もう一度保存' : 'Try saving again';
                    retrySave.addEventListener('click', () => void persist(), { signal: actions.signal, once: true });
                    feedback.append(retrySave);
                    retrySave.focus();
                    return;
                }

                root.dataset.outcome = evaluation.result.outcome;
                showFeedback(feedback, evaluation, actions.language, activity.id);
                if (listening) feedback.append(listeningTranscript(listening, actions.language));
                const action = element('button', 'academy-button academy-authored-week-next');
                action.type = 'button';
                const isPass = evaluation.result.outcome === 'pass';
                action.textContent = localized(
                    isPass ? (index === total - 1 && !actions.hasExtension ? COPY.finish : COPY.next) : COPY.retry,
                    actions.language,
                );
                action.addEventListener('click', isPass ? actions.onAdvance : actions.onRetry, { signal: actions.signal });
                feedback.append(action);
                action.focus();
            };
            await persist();
    }
    choices.addEventListener('keydown', event => moveChoiceFocus(event, choices), { signal: actions.signal });
    root.append(count, heading);
    if (listening) root.append(listeningPlayer(listening, actions));
    root.append(choices, feedback);
    return root;
}

function listeningPlayer(listening: LearnerListeningSource, actions: ActivityActions): HTMLElement {
    const root = element('div', 'academy-authored-week-listening-player');
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = listening.url;
    audio.setAttribute('aria-label', 'Listening audio');
    audio.addEventListener('play', () => actions.onListeningStart?.(), { signal: actions.signal });
    audio.addEventListener('pause', () => actions.onListeningStop?.(), { signal: actions.signal });
    audio.addEventListener('ended', () => actions.onListeningStop?.(), { signal: actions.signal });
    root.append(audio);
    return root;
}

function listeningTranscript(
    listening: LearnerListeningSource,
    language: AcademyLanguage,
): HTMLDetailsElement {
    const root = document.createElement('details');
    root.className = 'academy-authored-week-transcript';
    const summary = document.createElement('summary');
    summary.textContent = language === 'ja' ? '文字起こし' : 'Transcript';
    const transcript = element('div', 'academy-authored-week-transcript-lines');
    for (const line of listening.transcript) {
        const row = element('p', 'academy-authored-week-transcript-line');
        row.lang = 'ja';
        row.textContent = `${line.speaker}：${line.text}`;
        transcript.append(row);
    }
    root.append(summary, transcript);
    return root;
}

function showFeedback(
    root: HTMLElement,
    evaluation: AuthoredChoiceEvaluation,
    language: AcademyLanguage,
    activityId: string,
): void {
    const { result } = evaluation;
    root.setAttribute('role', 'status');
    const summary = result.outcome === 'pass' ? COPY.pass : COPY.lapse;
    root.replaceChildren(bilingualParagraph(summary, 'academy-authored-week-feedback-summary'));
    root.append(bilingualParagraph(result.feedback.explanation, 'academy-feedback-explanation'));
    if (result.outcome === 'lapse') appendProgressiveFeedback(root, result.feedback, { language, activityId });
}

function lessonNavigation(
    language: AcademyLanguage,
    actions: Readonly<{
        back?: () => void;
        backLabel?: string;
        next?: () => void;
        nextLabel?: string;
    }>,
    signal: AbortSignal,
): HTMLElement {
    const root = element('nav', 'academy-lesson-activity-navigation');
    root.setAttribute('aria-label', language === 'ja' ? 'レッスン内の移動' : 'Lesson activity navigation');
    if (actions.back) {
        const back = element('button', 'academy-button academy-lesson-activity-back');
        back.type = 'button';
        back.textContent = `\u2190 ${actions.backLabel ?? (language === 'ja' ? '前へ' : 'Back')}`;
        back.addEventListener('click', actions.back, { signal });
        root.append(back);
    }
    if (actions.next) {
        const next = element('button', 'academy-button academy-button-primary academy-lesson-activity-continue');
        next.type = 'button';
        next.textContent = actions.nextLabel ?? (language === 'ja' ? '次へ' : 'Continue');
        next.addEventListener('click', actions.next, { signal });
        root.append(next);
    }
    return root;
}

function progressBlock(total: number): { root: HTMLElement; update(completed: number): void } {
    const root = element('section', 'academy-authored-week-progress');
    const label = bilingualParagraph(COPY.progress, 'academy-authored-week-progress-label');
    const value = element('strong', 'academy-authored-week-progress-value');
    const meter = document.createElement('progress');
    meter.className = 'academy-authored-week-meter';
    meter.max = total;
    meter.setAttribute('aria-label', `${COPY.progress.ja} / ${COPY.progress.en}`);
    const update = (completed: number): void => {
        value.textContent = `${completed} / ${total}`;
        meter.value = completed;
    };
    update(0);
    root.append(label, value, meter);
    return { root, update };
}

function unavailableAudio(week: LearnerAuthoredWeek): HTMLElement | null {
    if (!week.media.some(media => media.status === 'unavailable')) return null;
    const state = element('section', 'academy-source-record academy-authored-week-audio');
    state.dataset.audioStatus = 'unavailable';
    state.setAttribute('role', 'status');
    state.append(bilingualParagraph(COPY.audioUnavailable, 'academy-authored-week-audio-copy'));
    return state;
}

function moveChoiceFocus(event: KeyboardEvent, root: HTMLElement): void {
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.academy-choice-option:not(:disabled)')];
    const current = buttons.indexOf(event.target as HTMLButtonElement);
    if (current < 0 || !['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0
        : event.key === 'End' ? buttons.length - 1
            : event.key === 'ArrowDown' || event.key === 'ArrowRight'
                ? (current + 1) % buttons.length
                : (current - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
}

function setChoicesDisabled(root: HTMLElement, disabled: boolean): void {
    root.querySelectorAll<HTMLButtonElement>('.academy-choice-option').forEach(button => { button.disabled = disabled; });
}

function bilingualParagraph(value: LocalizedText, className: string): HTMLParagraphElement {
    const paragraph = element('p', className);
    paragraph.append(japanese(value.ja), support(value.en));
    return paragraph;
}

function japanese(value: string): HTMLSpanElement {
    const span = element('span', 'academy-japanese');
    span.lang = 'ja';
    span.dataset.yomuRuntimeSurface = 'academy-activity';
    span.dataset.yomuFuriganaMode = 'all';
    span.textContent = value;
    return span;
}

function assessedJapanese(value: string): HTMLSpanElement {
    const span = element('span', 'academy-japanese academy-assessed-japanese');
    span.lang = 'ja';
    span.dataset.jpdbReaderSurfaceIgnore = '';
    span.textContent = value;
    return span;
}

function support(value: string): HTMLSpanElement {
    const span = element('span', 'academy-support');
    span.lang = 'en';
    span.dataset.jpdbReaderSurfaceIgnore = '';
    span.textContent = value;
    return span;
}

function localized(value: LocalizedText, language: AcademyLanguage): string {
    return value[language];
}

function notify(callback: () => void | Promise<void> | undefined, target: HTMLElement): void {
    try {
        const pending = callback();
        if (pending) void pending.catch(error => announceCallbackError(target, error));
    } catch (error) {
        announceCallbackError(target, error);
    }
}

function announceCallbackError(target: HTMLElement, error: unknown): void {
    target.dispatchEvent(new CustomEvent('academy:error', {
        bubbles: true,
        detail: { error },
    }));
}
