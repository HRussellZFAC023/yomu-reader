import { academyText, type AcademyLanguage } from '../../reader/app/academy-copy';
import { LANTERN_ATLAS_CANON } from '../content/lantern-atlas-canon';
import { STORY_REPLAY_SCENES } from '../content/story-replay-catalog';
import type { LearnerEvent } from '../domain/learner-record';
import { projectStoryProgression } from '../domain/story-progression';
import {
    projectDailyReplayPractice,
    projectWeeklyReplayPractice,
    replayLanguageBands,
    type ReplayLanguageBand,
    type ReplayPracticeDay,
} from '../domain/story-replay-projection';
import { element } from './dom';

export interface ReplayStreamPanelOptions {
    readonly language: AcademyLanguage;
    readonly events: readonly LearnerEvent[];
    readonly onOpenChapter: (chapterId: string, band: ReplayLanguageBand) => void;
    readonly onOpenLesson?: (lessonId: string) => void;
}

/** A read-only postgame surface: it derives practice memories but never records a story event. */
export function renderReplayStreamPanel(options: ReplayStreamPanelOptions): HTMLElement {
    const root = element('section', 'academy-replay-stream');
    root.dataset.replayStream = 'true';
    root.setAttribute('aria-labelledby', 'academy-replay-stream-title');
    const heading = element('h2', 'academy-replay-stream-title');
    heading.id = 'academy-replay-stream-title';
    heading.textContent = academyText(options.language, 'replayStreamTitle');
    const progress = projectStoryProgression(options.events);
    const canon = element('p', 'academy-replay-canon-progress');
    canon.textContent = interpolate(options.language, 'replayStreamCanonProgress', {
        completed: String(progress.completedChapterCount),
        total: String(LANTERN_ATLAS_CANON.chapters.length),
    });
    const boundary = element('p', 'academy-replay-boundary');
    boundary.textContent = academyText(options.language, progress.state === 'graduated'
        ? 'replayStreamGraduated'
        : 'replayStreamCanonBoundary');

    const controls = element('div', 'academy-replay-controls');
    const cadence = cadenceControl(options.language);
    const ladder = ladderControl(options.language);
    controls.append(cadence.fieldset, ladder.fieldset);
    const output = element('div', 'academy-replay-output');
    output.setAttribute('role', 'status');
    output.setAttribute('aria-live', 'polite');

    const render = (): void => {
        const band = ladder.value();
        const days = cadence.value() === 'daily'
            ? [projectDailyReplayPractice(options.events, STORY_REPLAY_SCENES, {
                now: Date.now(),
                targetLanguageBand: band,
            })]
            : projectWeeklyReplayPractice(options.events, STORY_REPLAY_SCENES, {
                now: Date.now(),
                targetLanguageBand: band,
            });
        output.replaceChildren(replayPlan(options, days));
        root.dataset.replayCadence = cadence.value();
        root.dataset.replayBand = band;
    };
    cadence.fieldset.addEventListener('change', render);
    ladder.fieldset.addEventListener('change', render);
    root.append(heading, canon, boundary, controls, output);
    render();
    return root;
}

function cadenceControl(language: AcademyLanguage): { readonly fieldset: HTMLFieldSetElement; value: () => 'daily' | 'weekly' } {
    const fieldset = element('fieldset', 'academy-replay-cadence');
    fieldset.append(legend(language === 'ja' ? 'リズム' : 'Practice rhythm'));
    const daily = radio('replay-cadence', 'daily', academyText(language, 'replayStreamDaily'), true);
    const weekly = radio('replay-cadence', 'weekly', academyText(language, 'replayStreamWeekly'));
    fieldset.append(daily.label, weekly.label);
    return { fieldset, value: () => daily.input.checked ? 'daily' : 'weekly' };
}

function ladderControl(language: AcademyLanguage): { readonly fieldset: HTMLFieldSetElement; value: () => ReplayLanguageBand } {
    const fieldset = element('fieldset', 'academy-replay-ladder');
    fieldset.append(legend(language === 'ja' ? '言語レイヤー' : 'Language layer'));
    const inputs = replayLanguageBands(STORY_REPLAY_SCENES).map((band, index) => radio(
        'replay-band',
        band,
        replayBandLabel(language, band),
        index === 0,
    ));
    fieldset.append(...inputs.map(control => control.label));
    return {
        fieldset,
        value: () => inputs.find(control => control.input.checked)?.input.value as ReplayLanguageBand ?? 'n5',
    };
}

function replayPlan(options: ReplayStreamPanelOptions, days: readonly ReplayPracticeDay[]): HTMLElement {
    const list = element('ol', 'academy-replay-plan');
    const tasks = days.flatMap(day => day.tasks.map(task => ({ day, task })));
    if (!tasks.length) {
        const empty = element('p', 'academy-replay-empty');
        empty.textContent = academyText(options.language, 'replayStreamNoPractice');
        return empty;
    }
    tasks.forEach(({ day, task }) => {
        const item = element('li', 'academy-replay-task');
        item.dataset.replayTask = task.kind;
        item.dataset.sceneId = task.sceneId;
        const meta = element('p', 'academy-replay-task-meta');
        meta.textContent = `${academyText(options.language, task.kind === 'srs-callback'
            ? 'replayStreamDueCallback'
            : 'replayStreamSliceOfLife')} · ${replayBandLabel(options.language, task.languageBand)} · ${day.localDay}`;
        const concepts = element('p', 'academy-replay-task-concepts');
        concepts.textContent = task.conceptIds.join(' · ');
        const actions = element('div', 'academy-replay-task-actions');
        const open = element('button', 'academy-button academy-button-secondary academy-replay-open');
        open.type = 'button';
        open.textContent = academyText(options.language, 'replayStreamOpenMemory');
        open.dataset.chapterId = task.chapterId;
        open.dataset.languageBand = task.languageBand;
        open.addEventListener('click', () => options.onOpenChapter(task.chapterId, task.languageBand));
        actions.append(open);
        if (task.lessonId && options.onOpenLesson) {
            const revisit = element('button', 'academy-button academy-button-secondary academy-replay-lesson');
            revisit.type = 'button';
            revisit.textContent = academyText(options.language, 'replayStreamOpenLesson');
            revisit.dataset.lessonId = task.lessonId;
            revisit.addEventListener('click', () => options.onOpenLesson?.(task.lessonId!));
            actions.append(revisit);
        }
        item.append(meta, concepts, actions);
        list.append(item);
    });
    return list;
}

function replayBandLabel(language: AcademyLanguage, band: ReplayLanguageBand): string {
    if (band === 'ngPlus') return language === 'ja' ? 'NG+ (上級)' : 'NG+ (advanced)';
    return band.toUpperCase();
}

function radio(
    name: string,
    value: string,
    labelText: string,
    checked = false,
): { readonly input: HTMLInputElement; readonly label: HTMLLabelElement } {
    const label = element('label', 'academy-replay-option');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.checked = checked;
    const text = element('span');
    text.textContent = labelText;
    label.append(input, text);
    return { input, label };
}

function legend(text: string): HTMLLegendElement {
    const value = element('legend', 'academy-replay-legend');
    value.textContent = text;
    return value;
}

function interpolate(
    language: AcademyLanguage,
    key: 'replayStreamCanonProgress',
    values: Readonly<Record<string, string>>,
): string {
    return Object.entries(values).reduce((copy, [name, value]) => copy.replace(`{${name}}`, value), academyText(language, key));
}
