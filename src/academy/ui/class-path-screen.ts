import { academyText, type AcademyLanguage } from '../../reader/app/academy-copy';
import { ACADEMY_CLASS_EVENTS, type AcademyClassEvent } from '../content/class-event-catalog';
import type { ClassWeekCastPlan, ClassWeekCastPlanEntry } from '../content/class-week-cast-plan';
import { ACADEMY_CAST, type AcademyCastMemberId } from '../domain/cast-registry';
import { academyBackgroundPicture, copyElement, element } from './dom';

export interface ClassPathScreenOptions {
    readonly language: AcademyLanguage;
    readonly plan: ClassWeekCastPlan;
    readonly currentOrder: number;
    readonly playableWeekIds: ReadonlySet<string>;
    readonly completedWeekIds?: ReadonlySet<string>;
    readonly onOpenWeek: (weekId: string) => void;
}

interface PathGroup {
    readonly id: string;
    readonly label: { readonly en: string; readonly ja: string };
    readonly from: number;
    readonly to: number;
    readonly seasons: readonly AcademyClassEvent['season'][];
}

const PATH_GROUPS: readonly PathGroup[] = [
    { id: 'level-1', label: { en: 'Level 1', ja: 'レベル1' }, from: 0, to: 18, seasons: ['foundation'] },
    { id: 'level-1-plus', label: { en: 'Level 1+', ja: 'レベル1+' }, from: 19, to: 35, seasons: ['n5'] },
    { id: 'level-2-plus', label: { en: 'Level 2+', ja: 'レベル2+' }, from: 36, to: 47, seasons: ['n4'] },
    { id: 'level-3-2', label: { en: 'Level 3.2', ja: 'レベル3.2' }, from: 48, to: 61, seasons: ['n3'] },
    { id: 'level-3-plus', label: { en: 'Level 3+', ja: 'レベル3+' }, from: 62, to: 72, seasons: ['n2', 'n1', 'alumni'] },
];

export function renderClassPathScreen(options: ClassPathScreenOptions): HTMLElement {
    const screen = element('section', 'academy-screen academy-class-path-screen');
    screen.dataset.academyScreen = 'class-path';
    screen.dataset.plate = 'classroom';
    const plate = academyBackgroundPicture('classroom');
    const paper = element('article', 'academy-class-path-paper');
    const header = element('header', 'academy-class-path-header');
    header.append(copyElement('h1', 'academy-class-path-title', options.language, 'classPathTitle'), localIndex(options.language));

    const path = element('section', 'academy-class-path-section');
    path.id = 'academy-class-path-weeks';
    path.append(copyElement('h2', 'academy-class-section-title', options.language, 'classPathWeeks'));
    const groups = element('div', 'academy-class-path-groups');
    const activeGroup = groupForOrder(options.currentOrder);
    const people = sectionShell('academy-class-path-people', 'academy-class-people', options.language, 'classPathPeople');
    const events = sectionShell('academy-class-path-events', 'academy-class-events', options.language, 'classPathEvents');
    const groupDetails = PATH_GROUPS.map(group => renderGroup(group, options));
    groupDetails.forEach(details => groups.append(details));
    updateRelatedSections(people, events, activeGroup, options);
    for (const [index, details] of groupDetails.entries()) {
        details.addEventListener('toggle', () => {
            if (!details.open) return;
            groupDetails.forEach((candidate, candidateIndex) => {
                if (candidateIndex !== index) candidate.open = false;
            });
            updateRelatedSections(people, events, PATH_GROUPS[index], options);
        });
    }
    path.append(groups);
    paper.append(header, path, people, events);
    screen.append(plate, paper);
    return screen;
}

function localIndex(language: AcademyLanguage): HTMLElement {
    const nav = element('nav', 'academy-class-path-index');
    nav.setAttribute('aria-label', academyText(language, 'classPathTitle'));
    const links = [
        ['academy-class-path-weeks', 'classPathWeeks'],
        ['academy-class-path-people', 'classPathPeople'],
        ['academy-class-path-events', 'classPathEvents'],
    ] as const;
    for (const [target, key] of links) {
        const link = document.createElement('a');
        link.href = `#${target}`;
        link.textContent = academyText(language, key);
        nav.append(link);
    }
    return nav;
}

function renderGroup(group: PathGroup, options: ClassPathScreenOptions): HTMLDetailsElement {
    const details = document.createElement('details');
    details.className = 'academy-class-path-group';
    details.dataset.pathGroup = group.id;
    details.open = containsOrder(group, options.currentOrder);
    const weeks = options.plan.weeks.slice(group.from, group.to + 1);
    const completed = weeks.filter(week => options.completedWeekIds?.has(week.weekId)).length;
    const summary = document.createElement('summary');
    summary.className = 'academy-class-path-group-summary';
    const heading = element('span', 'academy-class-path-group-title');
    heading.textContent = group.label[options.language];
    const progress = element('span', 'academy-class-path-group-progress');
    progress.textContent = options.language === 'ja'
        ? `${completed} / ${weeks.length}`
        : `${completed} of ${weeks.length}`;
    summary.append(heading, progress);
    const list = element('ol', 'academy-class-week-spine');
    for (const week of weeks) list.append(renderWeek(week, options));
    details.append(summary, list);
    return details;
}

function renderWeek(week: ClassWeekCastPlanEntry, options: ClassPathScreenOptions): HTMLElement {
    const item = element('li', 'academy-class-week-node');
    item.dataset.weekId = week.weekId;
    const playable = options.playableWeekIds.has(week.weekId);
    item.dataset.weekRuntime = playable ? 'playable' : 'not-bound';
    item.dataset.weekStatus = options.completedWeekIds?.has(week.weekId)
        ? 'complete'
        : week.order === options.currentOrder ? 'current' : 'planned';
    if (week.order === options.currentOrder) item.setAttribute('aria-current', 'step');
    const content = playable ? element('button', 'academy-class-week-entry') : element('span', 'academy-class-week-entry');
    if (content instanceof HTMLButtonElement) {
        content.type = 'button';
        content.addEventListener('click', () => options.onOpenWeek(week.weekId));
    } else {
        content.setAttribute('aria-disabled', 'true');
    }
    const number = element('span', 'academy-class-week-number');
    number.textContent = String(week.order).padStart(2, '0');
    const label = element('span', 'academy-class-week-label');
    label.textContent = week.source.title[options.language];
    const kind = element('span', 'academy-class-week-kind');
    kind.textContent = weekKindMark(week.weekKind);
    kind.setAttribute('aria-hidden', 'true');
    content.append(number, label, kind);
    item.append(content);
    return item;
}

function updateRelatedSections(
    people: HTMLElement,
    events: HTMLElement,
    group: PathGroup,
    options: ClassPathScreenOptions,
): void {
    const weeks = options.plan.weeks.slice(group.from, group.to + 1);
    people.dataset.pathGroup = group.id;
    events.dataset.pathGroup = group.id;
    people.querySelector('.academy-class-section-context')?.remove();
    events.querySelector('.academy-class-section-context')?.remove();
    const peopleContext = contextLabel(group, options.language);
    const eventsContext = contextLabel(group, options.language);
    people.querySelector('h2')?.after(peopleContext);
    events.querySelector('h2')?.after(eventsContext);
    people.querySelector('.academy-class-register')?.remove();
    events.querySelector('.academy-class-event-line')?.remove();
    people.append(renderPeople(weeks, options.language));
    events.append(renderEvents(group, options.language));
}

function renderPeople(weeks: readonly ClassWeekCastPlanEntry[], language: AcademyLanguage): HTMLElement {
    const ids = new Set<AcademyCastMemberId>(['rie']);
    for (const week of weeks) {
        if (week.primary) ids.add(week.primary.id);
        week.supporting.forEach(member => ids.add(member.id));
    }
    const list = element('ul', 'academy-class-register');
    for (const member of ACADEMY_CAST.filter(candidate => ids.has(candidate.id))) {
        const item = element('li', 'academy-class-register-entry');
        item.dataset.castId = member.id;
        item.dataset.castCategory = member.category;
        const mark = element('span', 'academy-class-register-mark');
        mark.textContent = member.firstName.slice(0, 1);
        mark.setAttribute('aria-hidden', 'true');
        const name = element('span', 'academy-class-register-name');
        name.textContent = 'teacherSalutation' in member ? member.teacherSalutation[language] : member.firstName;
        item.append(mark, name);
        list.append(item);
    }
    return list;
}

function renderEvents(group: PathGroup, language: AcademyLanguage): HTMLElement {
    const list = element('ol', 'academy-class-event-line');
    for (const event of ACADEMY_CLASS_EVENTS.filter(candidate => group.seasons.includes(candidate.season))) {
        const item = element('li', 'academy-class-event');
        item.dataset.eventId = event.id;
        item.dataset.eventStatus = event.status;
        const season = element('span', 'academy-class-event-season');
        season.textContent = event.season.toUpperCase();
        const title = element('span', 'academy-class-event-title');
        title.textContent = event.title[language];
        const cast = element('span', 'academy-class-event-cast');
        cast.textContent = event.castIds.map(id => ACADEMY_CAST.find(member => member.id === id)?.firstName ?? id).join(' · ');
        item.append(season, title, cast);
        list.append(item);
    }
    return list;
}

function sectionShell(id: string, className: string, language: AcademyLanguage, key: 'classPathPeople' | 'classPathEvents'): HTMLElement {
    const section = element('section', `academy-class-path-section ${className}`);
    section.id = id;
    section.append(copyElement('h2', 'academy-class-section-title', language, key));
    return section;
}

function contextLabel(group: PathGroup, language: AcademyLanguage): HTMLElement {
    const label = element('p', 'academy-class-section-context');
    label.textContent = group.label[language];
    return label;
}

function groupForOrder(order: number): PathGroup {
    return PATH_GROUPS.find(group => containsOrder(group, order)) ?? PATH_GROUPS[0];
}

function containsOrder(group: PathGroup, order: number): boolean {
    return order >= group.from && order <= group.to;
}

function weekKindMark(kind: string): string {
    if (kind.includes('kanji')) return '漢';
    if (kind.includes('hiragana') || kind.includes('katakana') || kind.includes('script')) return 'かな';
    if (kind.includes('kickoff') || kind === 'orientation') return '始';
    if (kind.includes('listening')) return '聴';
    if (kind.includes('writing')) return '書';
    return '授';
}
