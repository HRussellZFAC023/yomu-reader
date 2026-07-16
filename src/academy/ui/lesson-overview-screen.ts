import { academyText, type AcademyLanguage } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS } from '../assets';
import {
    canRenderAcademyCastPortrait,
    getAcademyCastMember,
    type AcademyCastMember,
} from '../domain/cast-registry';
import type {
    LessonOverviewModel,
    LessonOverviewSection,
    LessonSectionLearningStatus,
} from '../domain/lesson-overview';
import { academyBackgroundPicture, backButton, element } from './dom';
import { createAcademySprite } from './sprite';

export interface LessonOverviewScreenOptions {
    readonly language: AcademyLanguage;
    readonly model: LessonOverviewModel;
    readonly onBack: () => void;
    readonly onOpenActivity: (activityId: string) => void;
}

/** A clear VN scene with only the lesson's working surfaces lifted onto paper. */
export function renderLessonOverviewScreen(options: LessonOverviewScreenOptions): HTMLElement {
    const { language, model } = options;
    const screen = element('section', 'academy-screen academy-lesson-overview-screen');
    screen.dataset.academyScreen = 'lesson-overview';
    screen.dataset.lessonId = model.lessonId;
    screen.dataset.releaseStatus = model.releaseStatus;
    const scene = element('div', 'academy-lesson-overview-scene');
    const paper = element('article', 'academy-lesson-overview-paper');
    const header = element('header', 'academy-lesson-overview-header');
    const back = backButton(language);
    back.addEventListener('click', options.onBack);
    const heading = element('div', 'academy-lesson-overview-heading');
    const title = element('h1', 'academy-lesson-overview-title');
    title.textContent = model.presentation.title[language];
    const summary = element('p', 'academy-lesson-overview-summary');
    summary.textContent = model.presentation.summary[language];
    const prerequisite = element('p', 'academy-lesson-overview-prerequisite');
    const prerequisiteLabel = element('strong', 'academy-lesson-overview-prerequisite-label');
    prerequisiteLabel.textContent = language === 'ja' ? 'はじめる前に' : 'Before you begin';
    const prerequisiteValue = element('span', 'academy-lesson-overview-prerequisite-value');
    prerequisiteValue.textContent = language === 'ja'
        ? '前提なし。レッスン0は、はじめての人の出発点です。'
        : 'No prerequisites. Lesson 0 starts from the beginning.';
    prerequisite.append(prerequisiteLabel, prerequisiteValue);
    const time = element('p', 'academy-lesson-overview-time');
    time.textContent = language === 'ja'
        ? `${model.estimatedMinutes.minimum}〜${model.estimatedMinutes.maximum}分`
        : `${model.estimatedMinutes.minimum}–${model.estimatedMinutes.maximum} min`;
    heading.append(title, summary, prerequisite, time);
    header.append(back, heading);

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
    model.sections.forEach((section, index) => sectionList.append(sectionRow(section, index, options)));
    sections.append(sectionList);
    main.append(goals, sections);

    const roster = rosterBlock(model.presentation.peopleIds, language);

    const margin = element('footer', 'academy-lesson-overview-margin');
    const readyMaterials = model.presentation.materials.filter(material => material.state === 'ready');
    if (readyMaterials.length) margin.append(materialShelf(readyMaterials, options));
    margin.append(noteLine(
        language === 'ja' ? '今日の場所' : 'Places today',
        model.presentation.locationIds.map(id => locationName(id, language)).join(' · '),
        'locations',
    ));

    paper.append(header, main, margin);
    scene.append(paper, roster);
    screen.append(academyBackgroundPicture('classroom'), scene);
    return screen;
}

function rosterBlock(personIds: readonly string[], language: AcademyLanguage): HTMLElement {
    const roster = element('aside', 'academy-lesson-overview-roster');
    roster.setAttribute('aria-label', academyText(language, 'lessonOverviewPeople'));
    const title = element('h2', 'academy-lesson-overview-roster-title');
    title.textContent = academyText(language, 'lessonOverviewPeople');
    const list = element('ul', 'academy-lesson-overview-roster-list');
    personIds.forEach((id, index) => list.append(rosterMember(id, language, index)));
    roster.append(title, list);
    return roster;
}

function rosterMember(id: string, language: AcademyLanguage, index: number): HTMLLIElement {
    const person = getAcademyCastMember(id);
    const item = element('li', 'academy-lesson-overview-roster-member');
    item.dataset.castId = person.id;
    item.style.setProperty('--academy-roster-order', String(index));
    const portrait = portraitAsset(person);
    if (portrait) {
        const image = createAcademySprite({
            characterId: person.id,
            alt: '',
            className: 'academy-lesson-overview-roster-portrait',
            expressions: { neutral: { still: portrait } },
        });
        image.setAttribute('aria-hidden', 'true');
        item.dataset.portraitStatus = 'approved';
        item.append(image);
    } else {
        item.dataset.portraitStatus = 'unavailable';
        item.classList.add('is-name-only');
    }
    const name = element('span', 'academy-lesson-overview-roster-name');
    name.textContent = displayName(person, language);
    item.append(name);
    return item;
}

function portraitAsset(person: AcademyCastMember): string | undefined {
    if (!canRenderAcademyCastPortrait(person.id, 'story-runtime')) return undefined;
    return (ACADEMY_ASSETS.characters.approved as Readonly<Record<string, string>>)[person.id];
}

function sectionRow(section: LessonOverviewSection, index: number, options: LessonOverviewScreenOptions): HTMLElement {
    const { language, model } = options;
    const item = element('li', 'academy-lesson-overview-section');
    item.dataset.sectionId = section.id;
    item.dataset.learningStatus = section.learningStatus;
    item.dataset.runtimeStatus = section.runtimeStatus;
    if (section.id === model.currentSectionId) item.setAttribute('aria-current', 'step');
    const copy = element('span', 'academy-lesson-overview-section-copy');
    const title = element('strong', 'academy-lesson-overview-section-title');
    title.textContent = section.title[language];
    const status = element('span', 'academy-lesson-overview-section-status');
    const priorCompleted = model.sections
        .slice(0, index)
        .filter(candidate => candidate.learningStatus === 'complete').length;
    status.textContent = section.id === model.currentSectionId && section.learningStatus === 'not-started' && priorCompleted > 0
        ? (language === 'ja' ? `次へ · 前の${priorCompleted}項目は完了` : `Next · ${priorCompleted} earlier steps complete`)
        : statusLabel(section.learningStatus, language);
    copy.append(title, status);
    const target = section.nextActivityId ?? section.boundActivityIds[0];
    const isCurrent = section.id === model.currentSectionId;
    const isRevisitable = section.learningStatus === 'complete' || section.learningStatus === 'needs-review';
    const canOpen = model.releaseStatus === 'playable' && Boolean(target) && (isCurrent || isRevisitable);
    if (canOpen && target) {
        const action = element('button', 'academy-lesson-overview-section-action');
        action.type = 'button';
        action.dataset.actionPriority = isCurrent ? 'primary' : 'secondary';
        action.textContent = actionLabel(section.learningStatus, language, priorCompleted > 0);
        action.setAttribute('aria-label', `${action.textContent}: ${section.title[language]}`);
        action.addEventListener('click', () => options.onOpenActivity(target));
        item.append(copy, action);
    } else {
        item.append(copy);
    }
    return item;
}

function materialShelf(
    materials: LessonOverviewModel['presentation']['materials'],
    options: LessonOverviewScreenOptions,
): HTMLElement {
    const shelf = element('section', 'academy-lesson-overview-materials');
    shelf.dataset.noteKind = 'materials';
    const title = element('strong', 'academy-lesson-overview-note-label');
    title.textContent = academyText(options.language, 'lessonOverviewMaterials');
    const actions = element('div', 'academy-lesson-overview-material-actions');
    for (const material of materials) {
        const activityId = material.activityIds[0];
        if (!activityId) continue;
        const button = element('button', 'academy-lesson-overview-material-action');
        button.type = 'button';
        button.textContent = material.title[options.language];
        button.setAttribute('aria-label', `${material.title[options.language]} →`);
        button.addEventListener('click', () => options.onOpenActivity(activityId));
        actions.append(button);
    }
    shelf.append(title, actions);
    return shelf;
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

function actionLabel(status: LessonSectionLearningStatus, language: AcademyLanguage, hasPriorProgress = false): string {
    const key = status === 'not-started' && !hasPriorProgress
        ? 'lessonOverviewStart'
        : status === 'needs-review' || status === 'complete'
            ? 'lessonOverviewReview'
            : 'lessonOverviewResume';
    return academyText(language, key);
}

function displayName(person: AcademyCastMember, language: AcademyLanguage): string {
    return person.teacherSalutation ? person.teacherSalutation[language] : person.firstName;
}

function locationName(id: string, language: AcademyLanguage): string {
    const name = ({
        'location:classroom': '教室',
        'location:language-lab': academyText(language, 'locationLab'),
        'location:library': '図書館',
        'location:classroom-entrance': '教室前',
    } as Readonly<Record<string, string>>)[id];
    if (!name) throw new TypeError(`Unknown lesson location ${id}.`);
    return name;
}
