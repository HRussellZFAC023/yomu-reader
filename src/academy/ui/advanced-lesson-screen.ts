import './advanced-lesson-screen.css';

import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type { AcademyPlateId } from '../assets';
import type { AdvancedCurriculumEntry } from '../content/advanced-curriculum';
import type { ActivityController, ActivityEvaluation, ActivityModel, ActivityRuntime } from '../domain/activity-runtime';
import type { PronunciationService } from '../integration/yomu-bridge';
import { academyBackgroundPicture, backButton, element } from './dom';
import { createLessonActivityExtension, type LessonActivityChapter } from './lesson-activity-chapter';
import { createLessonLanguageSupport } from './lesson-activity-support';

export interface AdvancedLessonScreen {
    readonly element: HTMLElement;
    dispose(): void;
}

export function createAdvancedLessonScreen(options: Readonly<{
    language: AcademyLanguage;
    entry: AdvancedCurriculumEntry;
    plate: AcademyPlateId;
    runtime: ActivityRuntime;
    pronunciation: PronunciationService;
    onEvaluation(activity: ActivityModel, evaluation: ActivityEvaluation): void | Promise<void>;
    onBack(): void;
    onComplete(): void;
}>): AdvancedLessonScreen {
    const lifecycle = new AbortController();
    const screen = element('section', 'academy-screen academy-advanced-lesson-screen');
    screen.dataset.academyScreen = 'advanced-lesson';
    screen.dataset.advancedPackageId = options.entry.id;
    screen.dataset.plate = options.plate;
    screen.append(academyBackgroundPicture(options.plate));

    const veil = element('div', 'academy-advanced-lesson-veil');
    const panel = element('article', 'academy-advanced-lesson-paper');
    const toolbar = element('header', 'academy-advanced-lesson-toolbar');
    const back = backButton(options.language);
    back.classList.add('academy-advanced-lesson-back');
    back.addEventListener('click', options.onBack, { signal: lifecycle.signal });
    const activityHost = element('div', 'academy-advanced-lesson-content');
    const languageSupport = createLessonLanguageSupport(panel, options.language);
    toolbar.append(back, languageSupport.element);
    panel.append(toolbar, activityHost);
    veil.append(panel);
    screen.append(veil);

    const chapter = advancedChapter(options.entry);
    const extension = createLessonActivityExtension({
        language: options.language,
        chapter,
        presentation: { location: options.entry.location },
        runtime: options.runtime,
        pronunciation: options.pronunciation,
        onEvaluation: options.onEvaluation,
    });
    let controller: ActivityController | undefined = extension.mount(activityHost, {
        onProgress(completed) {
            screen.dataset.advancedCompletedActivities = String(completed);
        },
        onComplete: options.onComplete,
        onBack: options.onBack,
        registerReadingSurface: languageSupport.registerReadingSurface,
    });
    languageSupport.refresh();
    controller.focus();

    let disposed = false;
    return {
        element: screen,
        dispose() {
            if (disposed) return;
            disposed = true;
            lifecycle.abort();
            controller?.dispose();
            controller = undefined;
            languageSupport.dispose();
        },
    };
}

function advancedChapter(entry: AdvancedCurriculumEntry): LessonActivityChapter {
    return {
        id: `chapter:${entry.id}`,
        lessonPackageId: entry.id,
        canonicalEpisodeId: `advanced:${entry.id}`,
        title: entry.title,
        location: entry.location,
        host: entry.host,
        introduction: entry.summary,
        conclusion: {
            en: 'This package stays on your Course path, so you can revisit it whenever the skill needs another pass.',
            ja: 'このパッケージはコースに残ります。必要なときは、いつでももう一度取り組めます。',
        },
        beats: [{
            id: `beat:${entry.activity.id}`,
            narrative: {
                en: 'Study the support first, then answer from the evidence in front of you.',
                ja: 'まず学習サポートを確認してから、目の前の根拠を使って答えましょう。',
            },
            activity: entry.activity,
        }],
    };
}
