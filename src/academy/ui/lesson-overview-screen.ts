import { academyText, type AcademyLanguage } from '../../reader/app/academy-copy';
import { ACADEMY_CAST } from '../domain/cast-registry';
import type {
    LessonOverviewModel,
    LessonOverviewSection,
    LessonSectionLearningStatus,
} from '../domain/lesson-overview';
import { academyBackgroundPicture, element } from './dom';

export interface LessonOverviewScreenOptions {
    readonly language: AcademyLanguage;
    readonly model: LessonOverviewModel;
    readonly onBack: () => void;
    readonly onOpenActivity: (activityId: string) => void;
}

/** A single continuous handout: context first, then every section in order. */
export function renderLessonOverviewScreen(options: LessonOverviewScreenOptions): HTMLElement {
    const { language, model } = options;
    const screen = element('section', 'academy-screen academy-lesson-overview-screen');
    screen.dataset.academyScreen = 'lesson-overview';
    screen.dataset.lessonId = model.lessonId;
    screen.dataset.releaseStatus = model.releaseStatus;
    const paper = element('article', 'academy-lesson-overview-paper');
    const header = element('header', 'academy-lesson-overview-header');
    const back = element('button', 'academy-lesson-overview-back');
    back.type = 'button';
    back.textContent = `← ${academyText(language, 'lessonOverviewBack')}`;
    back.addEventListener('click', options.onBack);
    const heading = element('div', 'academy-lesson-overview-heading');
    const title = element('h1', 'academy-lesson-overview-title');
    title.textContent = model.presentation.title[language];
    const summary = element('p', 'academy-lesson-overview-summary');
    summary.textContent = model.presentation.summary[language];
    const time = element('p', 'academy-lesson-overview-time');
    time.textContent = language === 'ja'
        ? `${model.estimatedMinutes.minimum}〜${model.estimatedMinutes.maximum}分`
        : `${model.estimatedMinutes.minimum}–${model.estimatedMinutes.maximum} min`;
    heading.append(title, summary, time);
    header.append(back, heading, progressBlock(options));

    const main = element('div', 'academy-lesson-overview-body');
    const goals = element('section', 'academy-lesson-overview-goals');
    goals.append(sectionTitle(language, 'lessonOverviewGoals'));
    const goalList = element('ul', 'academy-lesson-overview-goal-list');
    for (const goal of model.presentation.goals) {
        const item = element('li', 'academy-lesson-overview-goal');
        item.textContent = goal[language];
        goalList.append(item);
    }
    goals.append(goalList);

    const sections = element('section', 'academy-lesson-overview-sections');
    sections.append(sectionTitle(language, 'lessonOverviewSections'));
    const sectionList = element('ol', 'academy-lesson-overview-section-list');
    model.sections.forEach(section => sectionList.append(sectionRow(section, options)));
    sections.append(sectionList);
    main.append(goals, sections);

    const margin = element('footer', 'academy-lesson-overview-margin');
    const readyMaterials = model.presentation.materials.filter(material => material.state === 'ready');
    if (readyMaterials.length) margin.append(noteLine(
        academyText(language, 'lessonOverviewMaterials'),
        readyMaterials.map(material => material.title[language]).join(' · '),
        'materials',
    ));
    margin.append(noteLine(
        academyText(language, 'lessonOverviewPeople'),
        model.presentation.peopleIds.map(id => personName(id, language)).join(' · '),
        'people',
    ));
    margin.append(noteLine('', model.presentation.locationIds.map(locationName).join(' · '), 'locations'));

    paper.append(header, main, margin);
    screen.append(academyBackgroundPicture('classroom'), paper);
    return screen;
}

function progressBlock(options: LessonOverviewScreenOptions): HTMLElement {
    const { language, model } = options;
    const block = element('section', 'academy-lesson-overview-progress');
    const label = element('span', 'academy-lesson-overview-progress-label');
    label.textContent = academyText(language, 'lessonOverviewProgress');
    const value = element('strong', 'academy-lesson-overview-progress-value');
    value.textContent = `${model.progress.completedSections} / ${model.progress.totalSections}`;
    const meter = document.createElement('progress');
    meter.className = 'academy-lesson-overview-meter';
    meter.max = model.progress.totalSections;
    meter.value = model.progress.completedSections;
    meter.setAttribute('aria-label', academyText(language, 'lessonOverviewProgress'));
    block.append(label, value, meter);
    return block;
}

function sectionRow(section: LessonOverviewSection, options: LessonOverviewScreenOptions): HTMLElement {
    const { language, model } = options;
    const item = element('li', 'academy-lesson-overview-section');
    item.dataset.sectionId = section.id;
    item.dataset.learningStatus = section.learningStatus;
    item.dataset.runtimeStatus = section.runtimeStatus;
    if (section.id === model.currentSectionId) item.setAttribute('aria-current', 'step');
    const number = element('span', 'academy-lesson-overview-section-number');
    number.textContent = String(section.order).padStart(2, '0');
    const copy = element('span', 'academy-lesson-overview-section-copy');
    const title = element('strong', 'academy-lesson-overview-section-title');
    title.textContent = section.title[language];
    const status = element('span', 'academy-lesson-overview-section-status');
    status.textContent = statusLabel(section.learningStatus, language);
    copy.append(title, status);
    const target = section.nextActivityId ?? section.boundActivityIds[0];
    const canOpen = model.releaseStatus === 'playable' && Boolean(target);
    if (canOpen && target) {
        const action = element('button', 'academy-lesson-overview-section-action');
        action.type = 'button';
        action.textContent = actionLabel(section.learningStatus, language);
        action.setAttribute('aria-label', `${action.textContent}: ${section.title[language]}`);
        action.addEventListener('click', () => options.onOpenActivity(target));
        item.append(number, copy, action);
    } else {
        item.append(number, copy);
    }
    return item;
}

function sectionTitle(language: AcademyLanguage, key: 'lessonOverviewGoals' | 'lessonOverviewSections'): HTMLElement {
    const title = element('h2', 'academy-lesson-overview-kicker');
    title.textContent = academyText(language, key);
    return title;
}

function noteLine(labelText: string, bodyText: string, kind: string): HTMLElement {
    const line = element('p', 'academy-lesson-overview-note');
    line.dataset.noteKind = kind;
    if (labelText) {
        const label = element('strong', 'academy-lesson-overview-note-label');
        label.textContent = labelText;
        line.append(label);
    }
    const body = element('span', 'academy-lesson-overview-note-body');
    body.textContent = bodyText;
    line.append(body);
    return line;
}

function statusLabel(status: LessonSectionLearningStatus, language: AcademyLanguage): string {
    const key = {
        'not-started': 'lessonOverviewNotStarted',
        'in-progress': 'lessonOverviewInProgress',
        'needs-review': 'lessonOverviewNeedsReview',
        complete: 'lessonOverviewDone',
    } as const;
    return academyText(language, key[status]);
}

function actionLabel(status: LessonSectionLearningStatus, language: AcademyLanguage): string {
    const key = status === 'not-started'
        ? 'lessonOverviewStart'
        : status === 'needs-review' || status === 'complete'
            ? 'lessonOverviewReview'
            : 'lessonOverviewResume';
    return academyText(language, key);
}

function personName(id: string, language: AcademyLanguage): string {
    const person = ACADEMY_CAST.find(candidate => candidate.id === id);
    if (!person) throw new TypeError(`Lesson overview references unknown person ${id}.`);
    return 'teacherSalutation' in person ? person.teacherSalutation[language] : person.firstName;
}

function locationName(id: string): string {
    const name = ({
        'location:classroom': '教室',
        'location:language-lab': 'LL教室',
        'location:library': '図書館',
        'location:classroom-entrance': '教室前',
    } as Readonly<Record<string, string>>)[id];
    if (!name) throw new TypeError(`Unknown lesson location ${id}.`);
    return name;
}
