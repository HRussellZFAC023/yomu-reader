import './lesson-activity-chapter.css';

import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type {
    ActivityController,
    ActivityEvaluation,
    ActivityModel,
    ActivityRuntime,
} from '../domain/activity-runtime';
import type { PronunciationService } from '../integration/yomu-bridge';
import type { LocalizedText } from '../domain/source-library';
import { element } from './dom';
import { teachingSupportForActivity, teachingSupportView } from './lesson-activity-support';
import { assertActivityPedagogy } from '../domain/lesson-pedagogy';

export interface LessonActivityBeat {
    readonly id: string;
    readonly narrative: LocalizedText;
    readonly activity: ActivityModel;
    readonly completionErrorTag?: string;
}

export interface LessonActivityChapter {
    readonly id: string;
    readonly lessonPackageId: string;
    readonly canonicalEpisodeId: string;
    readonly title: LocalizedText;
    readonly location: LocalizedText;
    readonly host: Readonly<{ id: string; name: string }>;
    readonly introduction: LocalizedText;
    readonly conclusion: LocalizedText;
    readonly beats: readonly LessonActivityBeat[];
}

export interface LessonActivityExtension {
    readonly activityCount: number;
    mount(
        host: HTMLElement,
        callbacks: Readonly<{
            onProgress(completed: number): void;
            onComplete(): void;
            onBack?(): void;
            registerReadingSurface?(surface: HTMLElement): () => void;
        }>,
    ): ActivityController;
}

export function createLessonActivityExtension(options: Readonly<{
    language: AcademyLanguage;
    chapter: LessonActivityChapter;
    presentation?: Readonly<{ location: LocalizedText }>;
    runtime: ActivityRuntime;
    pronunciation: PronunciationService;
    onEvaluation(activity: ActivityModel, evaluation: ActivityEvaluation): void | Promise<void>;
}>): LessonActivityExtension {
    if (options.chapter.beats.length === 0) throw new TypeError('A lesson activity chapter needs at least one beat.');
    for (const beat of options.chapter.beats) {
        const issues = options.runtime.validate(beat.activity);
        if (issues.length) {
            throw new TypeError(`Lesson activity ${beat.id} is invalid: ${issues
                .map(issue => `${issue.path}: ${issue.message}`).join('; ')}`);
        }
        assertActivityPedagogy(beat.activity, teachingSupportForActivity(beat.activity));
    }
    return {
        activityCount: options.chapter.beats.length,
        mount(host, callbacks) {
            const lifecycle = new AbortController();
            let activityController: ActivityController | undefined;
            let index = -1;
            let completed = 0;
            const completedBeatIds = new Set<string>();
            let disposed = false;

            const replace = (view: HTMLElement): void => {
                activityController?.dispose();
                activityController = undefined;
                host.replaceChildren(view);
            };

            const renderIntroduction = (): void => {
                const root = chapterShell(options.chapter, 'academy-activity-chapter-introduction', options.presentation?.location);
                root.append(
                    bilingual(options.chapter.introduction, 'academy-activity-chapter-copy'),
                    chapterNavigation(options.language, {
                        back: callbacks.onBack,
                        next: () => {
                            index = 0;
                            renderBeat();
                        },
                        nextLabel: options.language === 'ja' ? '始める' : 'Begin the story activity',
                    }, lifecycle.signal),
                );
                replace(root);
                root.querySelector<HTMLElement>('h2')?.focus();
            };

            const renderBeat = (): void => {
                const beat = options.chapter.beats[index];
                if (!beat) {
                    renderConclusion();
                    return;
                }
                const root = chapterShell(options.chapter, 'academy-activity-chapter-beat', options.presentation?.location);
                root.dataset.chapterBeat = beat.id;
                root.dataset.activityStage = 'teaching';
                const progress = element('p', 'academy-activity-chapter-progress');
                progress.textContent = options.language === 'ja'
                    ? `${options.chapter.beats.length}場面中${index + 1}場面`
                    : `Story activity ${index + 1} of ${options.chapter.beats.length}`;
                const narrative = bilingual(beat.narrative, 'academy-activity-chapter-copy');
                const activityHost = element('div', 'academy-activity-chapter-host');
                const actionHost = element('div', 'academy-activity-chapter-action');
                const live = element('div', 'academy-activity-chapter-live');
                live.setAttribute('role', 'status');
                live.setAttribute('aria-live', 'polite');
                const support = teachingSupportView(teachingSupportForActivity(beat.activity), options.language);
                const start = chapterNavigation(options.language, {
                    back: () => {
                        index -= 1;
                        if (index < 0) renderIntroduction();
                        else renderBeat();
                    },
                    next: mountActivity,
                    nextLabel: options.language === 'ja' ? '問題へ' : 'Continue to activity',
                    }, lifecycle.signal);
                root.append(progress, narrative, support, start, activityHost, actionHost, live);
                replace(root);

                function mountActivity(): void {
                    start.remove();
                    support.remove();
                    root.dataset.activityStage = 'question';
                    activityController = options.runtime.mount(beat.activity, {
                        language: options.language,
                        replace(view) { activityHost.replaceChildren(view); },
                        announce(message) { live.textContent = message; },
                        playPronunciation(term, reading) { return options.pronunciation.play(term, reading); },
                        registerReadingSurface(surface) {
                            return callbacks.registerReadingSurface?.(surface) ?? (() => undefined);
                        },
                    }, async evaluation => {
                        await options.onEvaluation(beat.activity, evaluation);
                        const satisfiesBeat = evaluation.result.outcome === 'pass'
                            && (!beat.completionErrorTag || evaluation.result.errorTags.includes(beat.completionErrorTag));
                        if (!satisfiesBeat || disposed) return;
                        completedBeatIds.add(beat.id);
                        completed = completedBeatIds.size;
                        callbacks.onProgress(completed);
                        const last = index === options.chapter.beats.length - 1;
                        actionHost.replaceChildren(chapterNavigation(options.language, {
                            back: () => renderBeat(),
                            backLabel: options.language === 'ja' ? 'サポートを見直す' : 'Review support',
                            next: () => {
                                index += 1;
                                renderBeat();
                            },
                            nextLabel: options.language === 'ja'
                                ? (last ? '場面を結ぶ' : '次へ')
                                : (last ? 'Close the scene' : 'Continue'),
                        }, lifecycle.signal));
                        actionHost.querySelector<HTMLButtonElement>('button')?.focus();
                    });
                    activityController.focus();
                }
            };

            const renderConclusion = (): void => {
                const root = chapterShell(options.chapter, 'academy-activity-chapter-conclusion', options.presentation?.location);
                root.append(
                    bilingual(options.chapter.conclusion, 'academy-activity-chapter-copy'),
                    chapterNavigation(options.language, {
                        back: () => {
                            index = options.chapter.beats.length - 1;
                            renderBeat();
                        },
                        backLabel: options.language === 'ja' ? '最後の問題を見直す' : 'Revisit last activity',
                        next: callbacks.onComplete,
                        nextLabel: options.language === 'ja' ? 'レッスンを終える' : 'Finish lesson',
                    }, lifecycle.signal),
                );
                replace(root);
                root.querySelector<HTMLElement>('h2')?.focus();
            };

            renderIntroduction();
            return {
                focus() { host.querySelector<HTMLElement>('h2, button, input, textarea, canvas')?.focus(); },
                dispose() {
                    if (disposed) return;
                    disposed = true;
                    lifecycle.abort();
                    activityController?.dispose();
                    host.replaceChildren();
                },
            };
        },
    };
}

/** Only a chapter that passes the shared runtime and pedagogy assertions becomes reachable. */
export function createReachableLessonActivityExtension(
    options: Parameters<typeof createLessonActivityExtension>[0],
): LessonActivityExtension | undefined {
    try {
        return createLessonActivityExtension(options);
    } catch {
        return undefined;
    }
}

function chapterShell(chapter: LessonActivityChapter, className: string, locationOverride?: LocalizedText): HTMLElement {
    const root = element('section', `academy-activity-chapter ${className}`);
    root.dataset.chapterId = chapter.id;
    root.dataset.canonicalEpisodeId = chapter.canonicalEpisodeId;
    const header = element('header', 'academy-activity-chapter-header');
    const location = bilingual(locationOverride ?? chapter.location, 'academy-activity-chapter-location');
    const title = element('h2', 'academy-activity-chapter-title');
    title.tabIndex = -1;
    title.append(...localizedNodes(chapter.title));
    const host = element('p', 'academy-activity-chapter-character');
    host.textContent = chapter.host.name;
    host.dataset.characterId = chapter.host.id;
    header.append(location, title, host);
    root.append(header);
    return root;
}

function bilingual(value: LocalizedText, className: string): HTMLParagraphElement {
    const paragraph = element('p', className);
    paragraph.append(...localizedNodes(value));
    return paragraph;
}

function localizedNodes(value: LocalizedText): readonly HTMLSpanElement[] {
    const ja = element('span', 'academy-japanese');
    ja.lang = 'ja';
    ja.dataset.yomuRuntimeSurface = 'academy-activity';
    ja.dataset.yomuFuriganaMode = 'all';
    ja.textContent = value.ja;
    const en = element('span', 'academy-support');
    en.lang = 'en';
    en.dataset.jpdbReaderSurfaceIgnore = '';
    en.textContent = value.en;
    return [ja, en];
}

function actionButton(label: string, action: () => void, signal: AbortSignal): HTMLButtonElement {
    const button = element('button', 'academy-button academy-button-primary academy-activity-chapter-next');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', action, { signal, once: true });
    return button;
}

function chapterNavigation(
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
    if (actions.next) root.append(actionButton(actions.nextLabel ?? (language === 'ja' ? '次へ' : 'Continue'), actions.next, signal));
    return root;
}
