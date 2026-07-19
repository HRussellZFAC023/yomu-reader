import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type {
    AuthoredChoiceEvaluation,
    AuthoredWeekResponse,
    LearnerAuthoredWeek,
    LearnerAuthoredActivity,
    LearnerAuthoredCloze,
    LearnerAuthoredChoice,
    LearnerAuthoredMatching,
    LearnerAuthoredMultiChoice,
    LearnerAuthoredOrdering,
    LearnerAuthoredText,
    LearnerListeningSource,
} from '../content/authored-week-adapter';
import type { AuthoredWeekExposure, AuthoredWeekExposureText } from '../content/authored-week-schema';
import type { ActivityController, ActivityRuntime, ReviewSeed } from '../domain/activity-runtime';
import {
    authoredWeekProgressAfterActivity,
    type AuthoredWeekProgress,
} from '../domain/authored-week-progress';
import type { LocalizedText } from '../domain/source-library';
import { createAcademyActivityRuntime } from '../minigames';
import { ACADEMY_ASSETS } from '../assets';
import type { AcademyPlateId } from '../assets';
import { academyBackgroundPicture, backButton, element } from './dom';
import { setAcademyTooltip } from './tooltip';
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
        context: Readonly<{ repaired: boolean }>,
    ) => void | Promise<void>;
    readonly onComplete?: () => void | Promise<void>;
    readonly onBack?: () => void | Promise<void>;
    readonly onListeningStart?: () => void;
    readonly onListeningStop?: () => void;
    readonly initialProgress?: AuthoredWeekProgress;
    readonly initialLapsedActivityIds?: readonly string[];
    readonly initialRepairedActivityIds?: readonly string[];
    readonly onPositionChange?: (progress: AuthoredWeekProgress) => void | Promise<void>;
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
    repaired: {
        en: 'Repaired. You corrected this one yourself.',
        ja: '直せました。自分で答えを直せました。',
    },
    lapse: { en: 'Let’s repair this one.', ja: 'ここを直しましょう。' },
    retry: { en: 'Try again', ja: 'もう一度' },
    next: { en: 'Next question', ja: '次の問題' },
    finish: { en: 'Finish week', ja: '週を終える' },
    complete: { en: 'Week complete.', ja: '今週の学習が終わりました。' },
    evaluationError: { en: 'Your answer could not be checked. Try again.', ja: '答えを確認できませんでした。もう一度お試しください。' },
} as const satisfies Readonly<Record<string, LocalizedText>>;

export function createAuthoredWeekScreen(options: AuthoredWeekScreenOptions): AuthoredWeekScreen {
    if (options.week.activities.length === 0 && !options.extension) {
        throw new TypeError('An authored week needs at least one activity.');
    }

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
    let storyContextElement: HTMLElement | undefined;
    if (options.storyContext) {
        const context = element('section', 'academy-authored-week-story-context');
        storyContextElement = context;
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

    const initialProgress = normalizeInitialProgress(options.initialProgress, options.week, Boolean(options.extension));
    const progressScope = {
        exposureIds: options.week.preAssessment.map(exposure => exposure.id),
        activityIds: options.week.activities.map(activity => activity.id),
        supportActivityIds: options.week.activities
            .filter(activity => activity.kind !== 'academy-source-vocabulary-sheet')
            .map(activity => activity.id),
        hasExtension: Boolean(options.extension),
    };
    const initialActivityIndex = initialProgress && 'activityId' in initialProgress
        ? options.week.activities.findIndex(activity => activity.id === initialProgress.activityId)
        : 0;
    let currentIndex = Math.max(0, initialActivityIndex);
    let preAssessmentIndex = initialProgress?.phase === 'teaching'
        ? options.week.preAssessment.findIndex(exposure => exposure.id === initialProgress.exposureId)
        : 0;
    let preAssessmentComplete = initialProgress
        ? initialProgress.phase !== 'teaching'
        : options.week.preAssessment.length === 0;
    const completedThrough = initialProgress?.phase === 'extension' || initialProgress?.phase === 'complete'
        ? options.week.activities.length
        : currentIndex;
    const validActivityIds = new Set(options.week.activities.map(activity => activity.id));
    const completedActivityIds = new Set(options.week.activities.slice(0, completedThrough).map(activity => activity.id));
    const lapsedActivityIds = new Set((options.initialLapsedActivityIds ?? []).filter(id => validActivityIds.has(id)));
    const repairedActivityIds = new Set((options.initialRepairedActivityIds ?? []).filter(id => validActivityIds.has(id)));
    let extensionCompleted = initialProgress?.phase === 'complete' ? options.extension?.activityCount ?? 0 : 0;
    let disposed = false;
    let completionNotified = false;
    let showingComplete = false;
    let showingAuthoredActivity = options.week.activities.length > 0;
    let extensionController: ReturnType<LessonActivityExtension['mount']> | undefined;
    let activityController: ActivityController | undefined;
    let positionWriteTail = Promise.resolve();

    progress.update(completedActivityIds.size + extensionCompleted);

    const resetPanelScroll = (): void => {
        panel.scrollTop = 0;
    };

    const showStoryContext = (visible: boolean): void => {
        if (storyContextElement) storyContextElement.hidden = !visible;
    };

    const savePosition = (position: AuthoredWeekProgress): Promise<void> => {
        const write = positionWriteTail
            .catch(() => undefined)
            .then(() => options.onPositionChange?.(position));
        positionWriteTail = write.then(() => undefined, () => undefined);
        return write;
    };

    const reportPosition = (position: AuthoredWeekProgress): void => {
        if (options.onPositionChange) notify(() => savePosition(position), screen);
    };

    const focusInPanel = (target: HTMLElement | null | undefined): void => {
        target?.focus({ preventScroll: true });
        resetPanelScroll();
    };

    const positionAfterCurrent = (): AuthoredWeekProgress => {
        return authoredWeekProgressAfterActivity(options.week.activities[currentIndex].id, progressScope);
    };

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

    const renderPreAssessment = (focus = false): void => {
        const exposure = options.week.preAssessment[preAssessmentIndex];
        if (!exposure) {
            preAssessmentComplete = true;
            renderCurrent(focus);
            return;
        }
        showStoryContext(preAssessmentIndex === 0);
        screen.dataset.lessonPhase = 'teaching';
        delete screen.dataset.currentActivityId;
        reportPosition({ phase: 'teaching', exposureId: exposure.id });
        const supportView = element('div', 'academy-authored-week-pre-question academy-authored-week-briefing');
        const step = element('p', 'academy-eyebrow academy-authored-week-briefing-step');
        step.textContent = options.language === 'ja'
            ? `学習ポイント ${preAssessmentIndex + 1} / ${options.week.preAssessment.length}`
            : `Lesson note ${preAssessmentIndex + 1} of ${options.week.preAssessment.length}`;
        supportView.append(step, authoredExposureView(exposure, options.language));
        supportView.append(lessonNavigation(options.language, {
            ...(preAssessmentIndex > 0 ? {
                back: () => {
                    preAssessmentIndex -= 1;
                    renderPreAssessment(true);
                },
                backLabel: options.language === 'ja' ? '前のポイント' : 'Previous note',
            } : {}),
            next: () => {
                if (preAssessmentIndex < options.week.preAssessment.length - 1) {
                    preAssessmentIndex += 1;
                    renderPreAssessment(true);
                    return;
                }
                preAssessmentComplete = true;
                renderCurrent(true);
            },
            nextLabel: preAssessmentIndex < options.week.preAssessment.length - 1
                ? (options.language === 'ja' ? '次のポイント' : 'Next note')
                : (options.language === 'ja' ? '例を見る' : 'See the example'),
        }, lifecycle.signal));
        activityHost.replaceChildren(supportView);
        languageSupport.refresh();
        if (focus) focusInPanel(supportView.querySelector<HTMLElement>('h2'));
    };

    const renderCurrent = (focus = false, showSupport = true): void => {
        resetPanelScroll();
        showStoryContext(false);
        options.onListeningStop?.();
        activityController?.dispose();
        activityController = undefined;
        extensionController?.dispose();
        extensionController = undefined;
        showingComplete = false;
        showingAuthoredActivity = true;
        if (!options.week.activities.length) {
            showingAuthoredActivity = false;
            if (!preAssessmentComplete) renderPreAssessment(focus);
            else renderExtension();
            return;
        }
        const activity = options.week.activities[currentIndex];
        const hasTeachingSupport = activity.kind !== 'academy-source-vocabulary-sheet';
        if (currentIndex === 0 && !preAssessmentComplete) {
            renderPreAssessment(focus);
            return;
        }
        if (showSupport && hasTeachingSupport) {
            showStoryContext(currentIndex === 0);
            screen.dataset.lessonPhase = 'support';
            screen.dataset.currentActivityId = activity.id;
            reportPosition({ phase: 'support', activityId: activity.id });
            const teachingSupport = authoredTeachingSupport(activity);
            const supportView = element('div', 'academy-authored-week-pre-question');
            supportView.append(teachingSupportView(teachingSupport, options.language));
            const navigation = lessonNavigation(options.language, {
                back: currentIndex > 0 ? () => {
                    currentIndex -= 1;
                    renderCurrent(true);
                } : options.week.preAssessment.length > 0 ? () => {
                    preAssessmentComplete = false;
                    preAssessmentIndex = options.week.preAssessment.length - 1;
                    renderPreAssessment(true);
                } : undefined,
                backLabel: currentIndex > 0
                    ? (options.language === 'ja' ? '前の問題' : 'Previous question')
                    : (options.language === 'ja' ? '学習ポイント' : 'Lesson notes'),
                next: () => renderCurrent(true, false),
                nextLabel: options.language === 'ja' ? '問題へ' : 'Continue to question',
            }, lifecycle.signal);
            supportView.append(navigation);
            activityHost.replaceChildren(supportView);
            languageSupport.refresh();
            if (focus) focusInPanel(supportView.querySelector<HTMLElement>('h2'));
            return;
        }
        screen.dataset.lessonPhase = 'question';
        screen.dataset.currentActivityId = activity.id;
        reportPosition({ phase: 'question', activityId: activity.id });
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
            const savedEvaluations = new WeakSet<AuthoredChoiceEvaluation>();
            activityController = runtime.mount(activity, {
                language: options.language,
                replace(view) { questionHost.replaceChildren(view); languageSupport.refresh(); },
                announce(message) { questionHost.setAttribute('aria-label', message); },
                registerReadingSurface: languageSupport.registerReadingSurface,
            }, async evaluation => {
                const repaired = evaluation.result.outcome === 'pass' && lapsedActivityIds.has(activity.id);
                if (evaluation.result.outcome === 'lapse') lapsedActivityIds.add(activity.id);
                if (repaired) repairedActivityIds.add(activity.id);
                if (!savedEvaluations.has(evaluation)) {
                    await Promise.all([
                        options.onReviewSeeds?.(evaluation.reviewSeeds),
                        options.onEvaluation?.(activity, evaluation, { repaired }),
                    ]);
                    savedEvaluations.add(evaluation);
                }
                if (evaluation.result.outcome !== 'pass' || passed) return;
                const nextPosition = positionAfterCurrent();
                try {
                    await savePosition(nextPosition);
                } catch {
                    await new Promise<void>(resolve => {
                        if (lifecycle.signal.aborted) {
                            resolve();
                            return;
                        }
                        const retryState = element('div', 'academy-authored-week-save-retry');
                        retryState.setAttribute('role', 'alert');
                        retryState.append(bilingualParagraph(
                            {
                                en: 'Your answer was saved, but your place was not. Try saving your place again.',
                                ja: '答えは保存されましたが、続きの場所を保存できませんでした。もう一度保存してください。',
                            },
                            'academy-field-error',
                        ));
                        const retry = element('button', 'academy-button academy-authored-week-retry-save');
                        retry.type = 'button';
                        retry.textContent = options.language === 'ja' ? 'もう一度保存' : 'Try saving again';
                        retry.addEventListener('click', () => {
                            retry.disabled = true;
                            void savePosition(nextPosition).then(() => {
                                retryState.remove();
                                resolve();
                            }).catch(() => {
                                retry.disabled = false;
                                retry.focus();
                            });
                        }, { signal: lifecycle.signal });
                        retryState.append(retry);
                        questionHost.append(retryState);
                        retry.focus();
                        lifecycle.signal.addEventListener('abort', () => {
                            retryState.remove();
                            resolve();
                        }, { once: true });
                    });
                }
                if (lifecycle.signal.aborted) return;
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
            if (focus) {
                activityController.focus();
                resetPanelScroll();
            }
            return;
        }
        let evaluationSaved = false;
        questionHost.replaceChildren(renderActivity(activity, currentIndex, options.week.activities.length, {
            language: options.language,
            signal: lifecycle.signal,
            evaluate: responseId => options.week.evaluate(activity.id, responseId),
            async onEvaluation(evaluation) {
                const repaired = evaluation.result.outcome === 'pass' && lapsedActivityIds.has(activity.id);
                if (evaluation.result.outcome === 'lapse') lapsedActivityIds.add(activity.id);
                if (repaired) repairedActivityIds.add(activity.id);
                if (!evaluationSaved) {
                    await Promise.all([
                        options.onReviewSeeds?.(evaluation.reviewSeeds),
                        options.onEvaluation?.(activity, evaluation, { repaired }),
                    ]);
                    evaluationSaved = true;
                }
                if (evaluation.result.outcome === 'pass') await savePosition(positionAfterCurrent());
            },
            hadPriorLapse: lapsedActivityIds.has(activity.id),
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
        if (focus) focusInPanel(questionHost.querySelector<HTMLElement>(
            '.academy-choice-option, .academy-authored-text-input, [data-authored-modality-control]',
        ));
    };

    const renderExtension = (): void => {
        resetPanelScroll();
        showStoryContext(false);
        screen.dataset.lessonPhase = 'extension';
        delete screen.dataset.currentActivityId;
        reportPosition({ phase: 'extension' });
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
                if (options.week.activities.length) {
                    currentIndex = options.week.activities.length - 1;
                    renderCurrent(true);
                } else if (options.week.preAssessment.length) {
                    preAssessmentComplete = false;
                    preAssessmentIndex = options.week.preAssessment.length - 1;
                    renderPreAssessment(true);
                }
            },
            registerReadingSurface: languageSupport.registerReadingSurface,
        });
        extensionController?.focus();
        resetPanelScroll();
    };

    const renderComplete = (): void => {
        resetPanelScroll();
        showStoryContext(true);
        screen.dataset.lessonPhase = 'complete';
        delete screen.dataset.currentActivityId;
        reportPosition({ phase: 'complete' });
        activityController?.dispose();
        activityController = undefined;
        extensionController?.dispose();
        extensionController = undefined;
        showingComplete = true;
        showingAuthoredActivity = false;
        const complete = element('section', 'academy-activity academy-authored-week-complete');
        complete.dataset.weekComplete = 'true';
        complete.dataset.repairedCount = String(repairedActivityIds.size);
        complete.tabIndex = -1;
        complete.append(bilingualParagraph(COPY.complete, 'academy-success-note'));
        if (repairedActivityIds.size) {
            complete.append(bilingualParagraph(
                repairSummary(repairedActivityIds.size),
                'academy-authored-week-repair-summary',
            ));
        }
        if (options.storyContext?.handoff) {
            complete.append(bilingualParagraph(options.storyContext.handoff, 'academy-authored-week-story-handoff'));
        }
        const finish = (): void => {
            if (completionNotified) return;
            completionNotified = true;
            notify(async () => {
                await positionWriteTail;
                await options.onComplete?.();
            }, screen);
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
        focusInPanel(complete);
        if (!options.storyContext?.handoff) finish();
    };

    if (initialProgress?.phase === 'teaching') renderPreAssessment();
    else if (initialProgress?.phase === 'support') renderCurrent(false, true);
    else if (initialProgress?.phase === 'question') renderCurrent(false, false);
    else if (initialProgress?.phase === 'extension') renderExtension();
    else if (initialProgress?.phase === 'complete') renderComplete();
    else renderCurrent();

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

function authoredExposureView(exposure: AuthoredWeekExposure, language: AcademyLanguage): HTMLElement {
    const root = element('section', 'academy-lesson-teaching-support academy-authored-week-exposure');
    root.dataset.exposureKind = exposure.kind;
    root.dataset.exposureId = exposure.id;
    const eyebrow = element('p', 'academy-eyebrow');
    eyebrow.textContent = exposureLabel(exposure.kind, language);
    const title = element('h2', 'academy-lesson-teaching-title');
    title.tabIndex = -1;
    appendExposureText(title, exposure.title);
    const entries = element('div', 'academy-lesson-teaching-entries');
    entries.tabIndex = 0;
    entries.setAttribute('aria-label', language === 'ja' ? '学習例' : 'Teaching examples');
    exposure.entries.forEach(entry => {
        const row = element('article', 'academy-lesson-teaching-entry');
        appendExposureText(row, entry);
        entries.append(row);
    });
    root.append(eyebrow, title, entries);
    return root;
}

function appendExposureText(root: HTMLElement, value: AuthoredWeekExposureText): void {
    if (value.ja) {
        const text = japanese(value.ja);
        text.classList.add('academy-lesson-teaching-japanese');
        if (value.reading && value.reading !== value.ja) text.dataset.reading = value.reading;
        root.append(text);
    }
    if (value.en && value.en !== value.ja) {
        const text = support(value.en);
        if (!value.ja) text.classList.remove('academy-support');
        text.classList.add('academy-lesson-teaching-translation');
        root.append(text);
    }
}

function exposureLabel(kind: AuthoredWeekExposure['kind'], language: AcademyLanguage): string {
    const labels = {
        explanation: { en: 'Week teaching', ja: '今週のポイント' },
        passage: { en: 'Passage', ja: '読みもの' },
        prompt: { en: 'Try it yourself', ja: '自分でやってみる' },
        mission: { en: 'Week mission', ja: '今週のミッション' },
    } as const;
    return labels[kind][language];
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
    readonly evaluate: (response: AuthoredWeekResponse) => AuthoredChoiceEvaluation;
    readonly onEvaluation: (evaluation: AuthoredChoiceEvaluation) => Promise<void>;
    readonly hadPriorLapse: boolean;
    readonly onRetry: () => void;
    readonly onAdvance: () => void;
    readonly hasExtension: boolean;
    readonly onListeningStart?: () => void;
    readonly onListeningStop?: () => void;
}

function renderActivity(
    activity: LearnerAuthoredChoice | LearnerAuthoredText | LearnerAuthoredCloze | LearnerAuthoredMatching | LearnerAuthoredMultiChoice | LearnerAuthoredOrdering,
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
    const choices = element('div', activity.kind === 'choice' ? 'academy-choice-options' : modalityClass(activity));
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-labelledby', heading.id);
    const feedback = element('div', 'academy-activity-feedback');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    let committed = false;
    const listening = activity.kind === 'choice' ? activity.listening : undefined;

    const submit = (response: AuthoredWeekResponse, control: HTMLButtonElement): void => {
        if (committed) return;
        committed = true;
        setActivityControlsDisabled(choices, true);
        void commitResponse(response, control);
    };

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
            submit(input.value, commit);
        };
        commit.addEventListener('click', evaluateText, { signal: actions.signal });
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                evaluateText();
            }
        }, { signal: actions.signal });
        choices.append(input, commit);
    } else if (activity.kind === 'choice') for (const option of activity.options) {
        const row = element('div', 'academy-choice-row');
        const button = element('button', 'academy-choice-option');
        button.type = 'button';
        button.dataset.choiceId = option.id;
        button.setAttribute('aria-label', option.label.ja);
        button.append(assessedJapanese(option.label.ja));
        button.addEventListener('click', () => {
            if (committed) return;
            submit(option.id, button);
        }, { signal: actions.signal });
        row.append(button);
        choices.append(row);
    } else if (activity.kind === 'academy-authored-cloze') {
        appendClozeControls(choices, activity, heading.id, actions, submit);
    } else if (activity.kind === 'academy-authored-matching') {
        appendMatchingControls(choices, activity, heading.id, actions, submit);
    } else if (activity.kind === 'academy-authored-multi-choice') {
        appendMultiChoiceControls(choices, activity, heading.id, actions, submit);
    } else {
        appendOrderingControls(choices, activity, heading.id, actions, submit);
    }

    async function commitResponse(response: AuthoredWeekResponse, control: HTMLButtonElement): Promise<void> {
            let evaluation: AuthoredChoiceEvaluation;
            try {
                evaluation = actions.evaluate(response);
            } catch {
                committed = false;
                setActivityControlsDisabled(choices, false);
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
                const repaired = evaluation.result.outcome === 'pass' && actions.hadPriorLapse;
                if (repaired) root.dataset.repaired = 'true';
                showFeedback(feedback, evaluation, actions.language, activity.id, repaired);
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

function modalityClass(
    activity: LearnerAuthoredText | LearnerAuthoredCloze | LearnerAuthoredMatching | LearnerAuthoredMultiChoice | LearnerAuthoredOrdering,
): string {
    switch (activity.kind) {
        case 'text': return 'academy-text-response';
        case 'academy-authored-cloze': return 'academy-text-response academy-authored-cloze';
        case 'academy-authored-matching': return 'academy-drag-workspace academy-authored-matching';
        case 'academy-authored-multi-choice': return 'academy-choice-options academy-authored-multi-choice';
        case 'academy-authored-ordering': return 'academy-authored-ordering';
    }
}

function appendMultiChoiceControls(
    root: HTMLElement,
    activity: LearnerAuthoredMultiChoice,
    headingId: string,
    actions: ActivityActions,
    submit: StructuredSubmit,
): void {
    const selected = new Set<string>();
    const check = checkButton(actions.language, 'Check selections', '選んだ答えを確認');
    activity.options.forEach(option => {
        const label = element('label', 'academy-choice-row academy-authored-multi-choice-row');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = option.id;
        input.dataset.authoredModalityControl = '';
        input.setAttribute('aria-describedby', headingId);
        input.addEventListener('change', () => {
            if (input.checked) selected.add(option.id);
            else selected.delete(option.id);
            check.disabled = selected.size === 0;
        }, { signal: actions.signal });
        const text = element('span', 'academy-choice-option academy-authored-multi-choice-label');
        text.append(assessedJapanese(option.label.ja), support(option.label.en));
        label.append(input, text);
        root.append(label);
    });
    check.disabled = true;
    check.addEventListener('click', () => {
        if (check.disabled) return;
        submit({ kind: 'multi-choice', optionIds: [...selected] }, check);
    }, { signal: actions.signal });
    root.append(check);
}

type StructuredSubmit = (response: AuthoredWeekResponse, control: HTMLButtonElement) => void;

function appendClozeControls(
    root: HTMLElement,
    activity: LearnerAuthoredCloze,
    headingId: string,
    actions: ActivityActions,
    submit: StructuredSubmit,
): void {
    const sentence = element('p', 'academy-authored-cloze-sentence');
    sentence.lang = 'ja';
    sentence.dataset.jpdbReaderSurfaceIgnore = '';
    const inputs = new Map<string, HTMLInputElement>();
    const matches = [...activity.payload.sentence.matchAll(/[＿_]{1,}(?:[①-⑳])?[＿_]*/gu)];
    let cursor = 0;
    activity.payload.blanks.forEach((blank, index) => {
        const match = matches[index];
        if (match) {
            sentence.append(document.createTextNode(activity.payload.sentence.slice(cursor, match.index)));
            cursor = (match.index ?? cursor) + match[0].length;
        } else if (index === 0) {
            sentence.append(document.createTextNode(activity.payload.sentence));
        }
        const input = element('input', 'academy-input academy-authored-text-input academy-authored-cloze-input');
        input.type = 'text';
        input.lang = 'ja';
        input.autocomplete = 'off';
        input.inputMode = 'text';
        input.size = 6;
        input.dataset.authoredModalityControl = '';
        input.dataset.clozeBlankId = blank.id;
        input.dataset.jpdbReaderSurfaceIgnore = '';
        input.setAttribute('aria-label', localized(blank.label, actions.language));
        input.setAttribute('aria-describedby', headingId);
        inputs.set(blank.id, input);
        sentence.append(input);
    });
    if (matches.length) sentence.append(document.createTextNode(activity.payload.sentence.slice(cursor)));
    const check = checkButton(actions.language, 'Check the gaps', '空欄を確認');
    const ready = (): boolean => activity.payload.blanks.every(blank => inputs.get(blank.id)?.value.trim());
    const update = (): void => { check.disabled = !ready(); };
    const commit = (): void => {
        if (!ready()) return;
        submit({
            kind: 'cloze',
            values: activity.payload.blanks.map(blank => ({
                blankId: blank.id,
                value: inputs.get(blank.id)?.value ?? '',
            })),
        }, check);
    };
    inputs.forEach(input => {
        input.addEventListener('input', update, { signal: actions.signal });
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter' && ready()) {
                event.preventDefault();
                commit();
            }
        }, { signal: actions.signal });
    });
    check.addEventListener('click', commit, { signal: actions.signal });
    update();
    root.append(sentence, check);
}

function appendMatchingControls(
    root: HTMLElement,
    activity: LearnerAuthoredMatching,
    headingId: string,
    actions: ActivityActions,
    submit: StructuredSubmit,
): void {
    const rows = element('div', 'academy-authored-matching-rows');
    const selects = new Map<string, HTMLSelectElement>();
    activity.payload.items.forEach((item, index) => {
        const row = element('label', 'academy-drag-zone academy-authored-matching-row');
        const source = assessedJapanese(item.label);
        const select = document.createElement('select');
        select.className = 'academy-input academy-authored-matching-select';
        select.dataset.authoredModalityControl = '';
        select.dataset.matchingItemId = item.id;
        select.setAttribute('aria-label', actions.language === 'ja'
            ? `${index + 1}番に合う答え`
            : `Match for item ${index + 1}`);
        select.setAttribute('aria-describedby', headingId);
        select.append(selectOption('', actions.language === 'ja' ? '答えを選ぶ' : 'Choose a match'));
        activity.payload.targets.forEach(target => select.append(selectOption(target.id, target.label)));
        selects.set(item.id, select);
        row.append(source, select);
        rows.append(row);
    });
    const check = checkButton(actions.language, 'Check matches', '組み合わせを確認');
    const update = (): void => {
        const selected = [...selects.values()].map(select => select.value).filter(Boolean);
        for (const select of selects.values()) {
            for (const option of [...select.options].slice(1)) {
                option.disabled = option.value !== select.value && selected.includes(option.value);
            }
        }
        check.disabled = selected.length !== selects.size || new Set(selected).size !== selected.length;
    };
    selects.forEach(select => select.addEventListener('change', update, { signal: actions.signal }));
    check.addEventListener('click', () => {
        if (check.disabled) return;
        submit({
            kind: 'matching',
            placements: activity.payload.items.map(item => ({
                itemId: item.id,
                targetId: selects.get(item.id)?.value ?? '',
            })),
        }, check);
    }, { signal: actions.signal });
    update();
    root.append(rows, check);
}

function appendOrderingControls(
    root: HTMLElement,
    activity: LearnerAuthoredOrdering,
    headingId: string,
    actions: ActivityActions,
    submit: StructuredSubmit,
): void {
    const orders = new Map(activity.payload.sequences.map(sequence => [
        sequence.id,
        sequence.items.map(item => item.id),
    ]));
    const sequenceRoots = new Map<string, HTMLOListElement>();
    const renderSequence = (sequence: LearnerAuthoredOrdering['payload']['sequences'][number], focusId?: string): void => {
        const list = sequenceRoots.get(sequence.id)!;
        const order = orders.get(sequence.id)!;
        list.replaceChildren(...order.map((itemId, index) => {
            const item = sequence.items.find(candidate => candidate.id === itemId)!;
            const row = element('li', 'academy-sequence-item');
            row.dataset.sequenceId = item.id;
            const controls = element('div', 'academy-sequence-controls');
            const earlier = moveButton('↑', actions.language === 'ja' ? `${item.label}を前へ` : `Move ${item.label} earlier`, index === 0);
            const later = moveButton('↓', actions.language === 'ja' ? `${item.label}を後へ` : `Move ${item.label} later`, index === order.length - 1);
            earlier.addEventListener('click', () => move(index, index - 1, item.id), { signal: actions.signal });
            later.addEventListener('click', () => move(index, index + 1, item.id), { signal: actions.signal });
            controls.append(earlier, later);
            row.append(assessedJapanese(item.label), controls);
            return row;
        }));
        if (focusId) queueMicrotask(() => list.querySelector<HTMLButtonElement>(`[data-sequence-id="${focusId}"] button:not(:disabled)`)?.focus());

        function move(from: number, to: number, itemId: string): void {
            if (to < 0 || to >= order.length) return;
            order.splice(from, 1);
            order.splice(to, 0, itemId);
            renderSequence(sequence, itemId);
        }
    };
    activity.payload.sequences.forEach((sequence, index) => {
        const section = element('section', 'academy-authored-ordering-sequence');
        if (sequence.cue) {
            const cue = element('p', 'academy-authored-ordering-cue');
            cue.append(assessedJapanese(sequence.cue));
            section.append(cue);
        }
        const list = document.createElement('ol');
        list.className = 'academy-sequence-list';
        list.dataset.orderingSequenceId = sequence.id;
        list.setAttribute('aria-label', actions.language === 'ja' ? `${index + 1}番の並べ替え` : `Sequence ${index + 1}`);
        list.setAttribute('aria-describedby', headingId);
        sequenceRoots.set(sequence.id, list);
        section.append(list);
        root.append(section);
        renderSequence(sequence);
    });
    const check = checkButton(actions.language, 'Check order', '順番を確認');
    check.addEventListener('click', () => submit({
        kind: 'ordering',
        sequences: activity.payload.sequences.map(sequence => ({
            sequenceId: sequence.id,
            itemIds: [...orders.get(sequence.id)!],
        })),
    }, check), { signal: actions.signal });
    root.append(check);
}

function checkButton(language: AcademyLanguage, en: string, ja: string): HTMLButtonElement {
    const button = element('button', 'academy-button academy-button-primary academy-authored-modality-check');
    button.type = 'button';
    button.dataset.authoredModalityControl = '';
    button.textContent = language === 'ja' ? ja : en;
    return button;
}

function selectOption(value: string, label: string): HTMLOptionElement {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
}

function moveButton(symbol: string, label: string, disabled: boolean): HTMLButtonElement {
    const button = element('button', 'academy-sequence-move');
    button.type = 'button';
    button.dataset.authoredModalityControl = '';
    button.textContent = symbol;
    button.disabled = disabled;
    button.setAttribute('aria-label', label);
    setAcademyTooltip(button, label);
    return button;
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
    repaired: boolean,
): void {
    const { result } = evaluation;
    root.setAttribute('role', 'status');
    const summary = result.outcome === 'pass' ? COPY.pass : COPY.lapse;
    root.replaceChildren(bilingualParagraph(summary, 'academy-authored-week-feedback-summary'));
    if (repaired) root.append(bilingualParagraph(COPY.repaired, 'academy-authored-week-repair-win'));
    root.append(bilingualParagraph(result.feedback.explanation, 'academy-feedback-explanation'));
    if (result.outcome === 'lapse') appendProgressiveFeedback(root, result.feedback, { language, activityId });
}

function repairSummary(count: number): LocalizedText {
    return {
        en: count === 1
            ? 'One difficult point was repaired and saved for review.'
            : `${count} difficult points were repaired and saved for review.`,
        ja: count === 1
            ? '一つのポイントを直し、復習に残しました。'
            : `${count}つのポイントを直し、復習に残しました。`,
    };
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

function setActivityControlsDisabled(root: HTMLElement, disabled: boolean): void {
    root.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, button, select')
        .forEach(control => { control.disabled = disabled; });
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

function normalizeInitialProgress(
    progress: AuthoredWeekProgress | undefined,
    week: LearnerAuthoredWeek,
    hasExtension: boolean,
): AuthoredWeekProgress | undefined {
    if (!progress) return undefined;
    if (progress.phase === 'teaching') {
        return week.preAssessment.some(exposure => exposure.id === progress.exposureId)
            ? progress
            : undefined;
    }
    if (progress.phase === 'support' || progress.phase === 'question') {
        return week.activities.some(activity => activity.id === progress.activityId) ? progress : undefined;
    }
    if (progress.phase === 'extension') return hasExtension ? progress : undefined;
    return progress;
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
