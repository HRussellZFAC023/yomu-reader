import { academyText, type AcademyLanguage } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS } from '../assets';
import {
    advancedCurriculumForBand,
    type AdvancedCurriculumBand,
    type AdvancedCurriculumEntry,
    type AdvancedCurriculumRailEntry,
} from '../content/advanced-curriculum';
import { ACADEMY_CLASS_EVENTS } from '../content/class-event-catalog';
import type { ClassWeekCastPlan, ClassWeekCastPlanEntry } from '../content/class-week-cast-plan';
import {
    ACADEMY_CAST,
    canRenderAcademyCastPortrait,
    displayAcademyCastName,
    type AcademyCastMember,
    type AcademyCastMemberId,
    type CastCategory,
} from '../domain/cast-registry';
import type { DailyLearningRoute, DailyRouteAction } from '../domain/daily-learning-loop';
import type { JlptBand } from '../domain/learner-record';
import type { CharacterDirectoryEntryProjection } from '../domain/progress-projections';
import { academyBackgroundPicture, backButton, copyElement, element } from './dom';
import { renderDailyRoutePanel } from './daily-route-panel';
import { createAcademySprite } from './sprite';

export interface ClassPathScreenOptions {
    readonly language: AcademyLanguage;
    readonly plan: ClassWeekCastPlan;
    readonly currentOrder: number;
    readonly selectedBand?: JlptBand;
    readonly advancedPackages?: readonly AdvancedCurriculumEntry[];
    readonly advancedRail?: readonly AdvancedCurriculumRailEntry[];
    readonly playableWeekIds: ReadonlySet<string>;
    readonly completedWeekIds?: ReadonlySet<string>;
    readonly characters?: readonly CharacterDirectoryEntryProjection[];
    readonly dailyRoute?: DailyLearningRoute;
    readonly learningReason?: string;
    readonly onBack: () => void;
    readonly onOpenWeek: (weekId: string) => void;
    readonly onOpenAdvanced?: (packageId: string, override: boolean) => void;
    readonly onOpenDailyAction?: (action: DailyRouteAction) => void;
}

interface PathLevel {
    readonly id: string;
    readonly label: { readonly en: string; readonly ja: string };
    readonly from: number;
    readonly to: number;
}

type ClassPathSectionId = 'weeks' | 'people' | 'events';
type WeekStatus = 'complete' | 'current' | 'available' | 'locked' | 'unavailable';

interface WeekPresentation {
    readonly status: WeekStatus;
    readonly openable: boolean;
    readonly statusLabel: string;
    readonly actionLabel?: string;
}

const PATH_LEVELS: readonly PathLevel[] = [
    { id: 'level-1', label: { en: 'Foundation', ja: '基礎' }, from: 0, to: 18 },
    { id: 'level-1-plus', label: { en: 'N5', ja: 'N5' }, from: 19, to: 35 },
    { id: 'level-2-plus', label: { en: 'N4', ja: 'N4' }, from: 36, to: 47 },
    { id: 'level-3-2', label: { en: 'N3', ja: 'N3' }, from: 48, to: 61 },
    { id: 'level-3-plus', label: { en: 'N2 → N1', ja: 'N2 → N1' }, from: 62, to: 72 },
];

const CLASS_PATH_COPY = {
    complete: { en: 'Completed', ja: '完了' },
    current: { en: 'Recommended', ja: 'おすすめ' },
    available: { en: 'Earlier lesson', ja: '前のレッスン' },
    locked: { en: 'Future stop', ja: 'この先' },
    unavailable: { en: 'Not available', ja: '準備中' },
    revisit: { en: 'Revisit', ja: 'もう一度' },
    continue: { en: 'Continue', ja: '続ける' },
    open: { en: 'Open', ja: '開く' },
    eventAvailable: { en: 'Available', ja: '見られます' },
    eventPlanned: { en: 'Planned', ja: '予定' },
} as const;

const CLASS_PATH_PORTRAITS = {
    ...ACADEMY_ASSETS.characters.approved,
} as const satisfies Readonly<Partial<Record<AcademyCastMemberId, string>>>;

export function renderClassPathScreen(options: ClassPathScreenOptions): HTMLElement {
    const screen = element('section', 'academy-screen academy-class-path-screen');
    screen.dataset.academyScreen = 'class-path';
    screen.dataset.plate = 'classroom';
    const plate = academyBackgroundPicture('classroom');
    const scene = element('div', 'academy-class-path-scene');
    const header = element('header', 'academy-class-path-header');
    const back = backButton(options.language);
    back.className = 'academy-class-path-back';
    back.addEventListener('click', options.onBack);
    const title = copyElement('h1', 'academy-class-path-title', options.language, 'classPathTitle');

    const path = sectionShell('academy-class-path-weeks', options.language, 'classPathWeeks');
    if (options.dailyRoute && options.onOpenDailyAction) {
        path.append(renderDailyRoutePanel({
            language: options.language,
            route: options.dailyRoute,
            ...(options.learningReason ? { learningReason: options.learningReason } : {}),
            onOpenAction: options.onOpenDailyAction,
        }));
    }
    const spine = element('ol', 'academy-class-week-spine');
    let previousPlayable: ClassWeekCastPlanEntry | undefined;
    for (const week of options.plan.weeks) {
        spine.append(renderWeek(week, previousPlayable, options));
        if (options.playableWeekIds.has(week.weekId)) previousPlayable = week;
    }
    path.append(spine);
    const advancedBand = advancedBandForPath(options);
    if (advancedBand) {
        const railEntries = options.advancedRail
            ?? (options.advancedPackages ?? advancedCurriculumForBand(advancedBand))
                .filter(entry => entry.band === advancedBand)
                .map(curriculum => ({
                    curriculum,
                    state: 'available' as const,
                    unmetPrerequisites: [],
                    overrideRequired: false,
                }));
        if (railEntries.length) path.append(renderAdvancedRail(railEntries, advancedBand, options, screen));
    }

    const people = sectionShell('academy-class-path-people', options.language, 'classPathPeople');
    people.append(renderPeople(options.plan.weeks, options.language, options.characters));

    const events = sectionShell('academy-class-path-events', options.language, 'classPathEvents');
    events.append(renderEvents(options.language));

    const panels = new Map<ClassPathSectionId, HTMLElement>([
        ['weeks', path],
        ['people', people],
        ['events', events],
    ]);
    const index = localIndex(options.language, panels);
    const panelHost = element('div', 'academy-class-path-panels');
    panelHost.append(path, people, events);
    header.append(back, title, index);
    scene.append(header, panelHost);
    screen.append(plate, scene);
    activateSection('weeks', index, panels);
    return screen;
}

function renderAdvancedRail(
    entries: readonly AdvancedCurriculumRailEntry[],
    band: AdvancedCurriculumBand,
    options: ClassPathScreenOptions,
    screen: HTMLElement,
): HTMLElement {
    const rail = element('section', 'academy-advanced-rail');
    rail.dataset.advancedBand = band;
    rail.setAttribute('aria-labelledby', `academy-advanced-rail-title-${band}`);
    const heading = element('h3', 'academy-advanced-rail-title');
    heading.id = `academy-advanced-rail-title-${band}`;
    heading.textContent = options.language === 'ja'
        ? `${band.toUpperCase()}の続き`
        : `${band.toUpperCase()} continuation`;
    const summary = element('p', 'academy-advanced-rail-summary');
    summary.textContent = options.language === 'ja'
        ? '完了した上級パッケージを、いつでも開き直せます。'
        : 'Follow the recommended order, or open a later package if prior study already covers it.';
    const list = element('ol', 'academy-advanced-rail-list');
    for (const entry of entries) {
        const { curriculum } = entry;
        const item = element('li', 'academy-advanced-rail-stop');
        item.dataset.packageId = curriculum.id;
        item.dataset.lessonId = curriculum.lessonId;
        item.dataset.railState = entry.state;
        const button = element('button', 'academy-advanced-rail-entry');
        button.type = 'button';
        const title = curriculum.title[options.language];
        const action = advancedActionLabel(entry.state, options.language);
        button.setAttribute('aria-label', `${action}: ${title}`);
        button.addEventListener('click', () => {
            if (options.onOpenAdvanced) {
                options.onOpenAdvanced(curriculum.id, entry.overrideRequired);
                return;
            }
            screen.dispatchEvent(new CustomEvent('academy:open-advanced', {
                bubbles: true,
                detail: { lessonId: curriculum.lessonId, packageId: curriculum.id, override: entry.overrideRequired },
            }));
        });

        const eyebrow = element('span', 'academy-advanced-rail-eyebrow');
        eyebrow.textContent = `${curriculum.location[options.language]} · ${curriculum.host.localizedName[options.language]}`;
        const titleElement = element('strong', 'academy-advanced-rail-label');
        titleElement.textContent = title;
        const packageSummary = element('span', 'academy-advanced-rail-copy');
        packageSummary.textContent = curriculum.summary[options.language];
        const requirement = element('span', 'academy-advanced-rail-requirement');
        requirement.textContent = advancedRequirementLabel(entry, entries, options.language);
        const revisit = element('span', 'academy-advanced-rail-action');
        revisit.textContent = action;
        button.append(eyebrow, titleElement, packageSummary, requirement, revisit);
        item.append(button);
        list.append(item);
    }
    rail.append(heading, summary, list);
    return rail;
}

function advancedActionLabel(state: AdvancedCurriculumRailEntry['state'], language: AcademyLanguage): string {
    const labels = {
        complete: { en: 'Revisit', ja: 'もう一度' },
        repair: { en: 'Continue repair', ja: '修復を続ける' },
        recommended: { en: 'Start', ja: '始める' },
        available: { en: 'Open', ja: '開く' },
        gated: { en: 'Open anyway', ja: 'このまま開く' },
    } as const;
    return labels[state][language];
}

function advancedRequirementLabel(
    entry: AdvancedCurriculumRailEntry,
    entries: readonly AdvancedCurriculumRailEntry[],
    language: AcademyLanguage,
): string {
    if (entry.state === 'complete') return language === 'ja' ? '完了' : 'Completed';
    if (entry.state === 'repair') return language === 'ja' ? '要復習' : 'Needs a fresh attempt';
    if (entry.state === 'recommended') return language === 'ja' ? 'おすすめの次の課題' : 'Recommended next';
    if (!entry.unmetPrerequisites.length) return language === 'ja' ? '順番は任意です' : 'Optional sequence';
    const previousId = entry.curriculum.sequence?.previousPackageId;
    const previous = entries.find(candidate => candidate.curriculum.id === previousId)?.curriculum;
    const label = previous?.title[language] ?? entry.unmetPrerequisites[0]!.reason[language];
    return language === 'ja'
        ? `推奨：先に「${label}」を試す（省略可）`
        : `Recommended first: ${label}. Override is optional.`;
}

function advancedBandForPath(options: ClassPathScreenOptions): AdvancedCurriculumBand | undefined {
    if (options.selectedBand === 'n3' || options.selectedBand === 'n2' || options.selectedBand === 'n1') {
        return options.selectedBand;
    }
    if (options.selectedBand !== undefined) return undefined;
    if (options.currentOrder >= 62) return 'n2';
    if (options.currentOrder >= 48) return 'n3';
    return undefined;
}

function localIndex(
    language: AcademyLanguage,
    panels: ReadonlyMap<ClassPathSectionId, HTMLElement>,
): HTMLElement {
    const nav = element('div', 'academy-class-path-index');
    nav.setAttribute('role', 'tablist');
    nav.setAttribute('aria-label', academyText(language, 'classPathTitle'));
    const definitions = [
        ['weeks', 'classPathWeeks'],
        ['people', 'classPathPeople'],
        ['events', 'classPathEvents'],
    ] as const;
    const buttons = definitions.map(([sectionId, key]) => {
        const button = element('button', 'academy-class-path-tab');
        button.type = 'button';
        button.id = `academy-class-path-tab-${sectionId}`;
        button.dataset.classSection = sectionId;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-controls', panels.get(sectionId)!.id);
        button.textContent = academyText(language, key);
        button.addEventListener('click', () => {
            activateSection(sectionId, nav, panels);
            nav.closest<HTMLElement>('.academy-class-path-scene')?.scrollIntoView?.({ block: 'start' });
        });
        nav.append(button);
        return button;
    });
    nav.addEventListener('keydown', event => {
        const current = event.target instanceof HTMLButtonElement ? buttons.indexOf(event.target) : -1;
        if (current < 0) return;
        const next = event.key === 'ArrowRight' ? (current + 1) % buttons.length
            : event.key === 'ArrowLeft' ? (current + buttons.length - 1) % buttons.length
                : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault();
        buttons[next].focus();
        buttons[next].click();
    });
    return nav;
}

function activateSection(
    sectionId: ClassPathSectionId,
    index: HTMLElement,
    panels: ReadonlyMap<ClassPathSectionId, HTMLElement>,
): void {
    index.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach(button => {
        const selected = button.dataset.classSection === sectionId;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
    });
    panels.forEach((panel, candidateId) => {
        panel.hidden = candidateId !== sectionId;
    });
}

function renderWeek(
    week: ClassWeekCastPlanEntry,
    prerequisite: ClassWeekCastPlanEntry | undefined,
    options: ClassPathScreenOptions,
): HTMLElement {
    const item = element('li', 'academy-class-week-node');
    item.dataset.weekId = week.weekId;
    const level = levelForOrder(week.order);
    item.dataset.pathGroup = level.id;
    const playable = options.playableWeekIds.has(week.weekId);
    const presentation = weekPresentation(week, playable, options);
    item.dataset.weekRuntime = playable ? 'playable' : 'not-bound';
    item.dataset.weekStatus = presentation.status;
    if (presentation.status === 'current') item.setAttribute('aria-current', 'step');

    const content = presentation.openable
        ? element('button', 'academy-class-week-entry')
        : element('div', 'academy-class-week-entry');
    if (content instanceof HTMLButtonElement) {
        content.type = 'button';
        content.setAttribute('aria-label', `${presentation.actionLabel}: ${weekSequenceLabel(week, options.language)} · ${week.source.title[options.language]}`);
        content.addEventListener('click', () => options.onOpenWeek(week.weekId));
    } else {
        content.setAttribute('aria-disabled', 'true');
    }

    const copy = element('span', 'academy-class-week-copy');
    const stage = element('span', 'academy-class-week-stage');
    const label = element('span', 'academy-class-week-label');
    if (week.order === level.from) {
        const levelLabel = element('span', 'academy-class-week-level');
        levelLabel.textContent = level.label[options.language];
        stage.append(levelLabel);
    }
    const sequenceLabel = element('span', 'academy-class-week-sequence');
    sequenceLabel.textContent = weekSequenceLabel(week, options.language);
    stage.append(sequenceLabel);
    label.textContent = week.source.title[options.language];
    const status = element('span', 'academy-class-week-status');
    status.textContent = presentation.statusLabel;
    const requirement = element('span', 'academy-class-week-prerequisite');
    requirement.textContent = prerequisiteLabel(prerequisite, options.language);
    copy.append(stage, label, status, requirement);
    const cast = renderWeekCast(week, options.language);
    const action = element('span', 'academy-class-week-action');
    action.textContent = presentation.actionLabel ?? '';
    action.setAttribute('aria-hidden', 'true');
    content.append(copy, cast, action);
    item.append(content);
    return item;
}

function weekSequenceLabel(week: ClassWeekCastPlanEntry, language: AcademyLanguage): string {
    if (week.order === 0) return language === 'ja' ? 'レッスン0' : 'Lesson 0';
    return language === 'ja' ? `第${week.order}週` : `Week ${String(week.order).padStart(2, '0')}`;
}

function weekPresentation(
    week: ClassWeekCastPlanEntry,
    playable: boolean,
    options: ClassPathScreenOptions,
): WeekPresentation {
    const language = options.language;
    const complete = options.completedWeekIds?.has(week.weekId) ?? false;
    if (complete) {
        return playable
            ? presentation('complete', true, localCopy(language, 'complete'), localCopy(language, 'revisit'))
            : presentation('unavailable', false, localCopy(language, 'unavailable'));
    }
    if (week.order === options.currentOrder) {
        return playable
            ? presentation('current', true, localCopy(language, 'current'), localCopy(language, 'continue'))
            : presentation('unavailable', false, localCopy(language, 'unavailable'));
    }
    if (playable && week.order < options.currentOrder) {
        return presentation('available', true, localCopy(language, 'available'), localCopy(language, 'revisit'));
    }
    if (week.order > options.currentOrder) {
        return presentation('locked', false, localCopy(language, 'locked'));
    }
    return presentation('unavailable', false, localCopy(language, 'unavailable'));
}

function prerequisiteLabel(
    prerequisite: ClassWeekCastPlanEntry | undefined,
    language: AcademyLanguage,
): string {
    if (!prerequisite) return language === 'ja' ? '前提なし' : 'No prerequisites';
    const lesson = prerequisite.order === 0
        ? (language === 'ja' ? 'レッスン0' : 'Lesson 0')
        : prerequisite.source.title[language];
    return language === 'ja' ? `前提：${lesson}` : `Requires ${lesson}`;
}

function renderWeekCast(week: ClassWeekCastPlanEntry, language: AcademyLanguage): HTMLElement {
    const cast = element('span', 'academy-class-week-cast');
    const appearances: readonly Readonly<{ id: AcademyCastMemberId; firstName: string }>[] = week.order === 0
        ? [{ id: 'rie', firstName: language === 'ja' ? 'りえ先生' : 'Rie-sensei' }]
        : [week.primary, ...week.supporting].filter(
            (appearance): appearance is NonNullable<typeof appearance> => Boolean(appearance),
        );
    if (!appearances.length) {
        cast.classList.add('is-empty');
        cast.setAttribute('aria-hidden', 'true');
        return cast;
    }
    cast.setAttribute('role', 'group');
    cast.setAttribute('aria-label', language === 'ja' ? '登場人物' : 'Appearing in this lesson');
    for (const appearance of appearances) {
        const person = element('span', 'academy-class-week-cast-member');
        person.dataset.weekCastId = appearance.id;
        const portrait = classPathPortrait(appearance.id);
        if (portrait) {
            const sprite = createAcademySprite({
                characterId: appearance.id,
                alt: '',
                className: 'academy-class-week-sprite',
                expressions: { neutral: { still: portrait } },
            });
            sprite.setAttribute('aria-hidden', 'true');
            person.append(sprite);
        } else {
            person.classList.add('is-name-only');
        }
        const name = element('span', 'academy-class-week-cast-name');
        name.textContent = appearance.firstName;
        person.append(name);
        cast.append(person);
    }
    return cast;
}

function presentation(
    status: WeekStatus,
    openable: boolean,
    statusLabel: string,
    actionLabel?: string,
): WeekPresentation {
    return { status, openable, statusLabel, ...(actionLabel ? { actionLabel } : {}) };
}

function renderPeople(
    weeks: readonly ClassWeekCastPlanEntry[],
    language: AcademyLanguage,
    characters: readonly CharacterDirectoryEntryProjection[] | undefined,
): HTMLElement {
    const ids = new Set<AcademyCastMemberId>(['rie']);
    for (const week of weeks) {
        if (week.primary) ids.add(week.primary.id);
        week.supporting.forEach(member => ids.add(member.id));
    }
    ACADEMY_CLASS_EVENTS.forEach(event => event.castIds.forEach(id => ids.add(id)));
    const directory = new Map(characters?.map(character => [character.characterId, character]));
    const list = element('ul', 'academy-class-register');
    for (const member of ACADEMY_CAST.filter(candidate => ids.has(candidate.id))) {
        list.append(renderPerson(member, language, directory.get(member.id as AcademyCastMemberId)));
    }
    return list;
}

function renderPerson(
    member: AcademyCastMember,
    language: AcademyLanguage,
    character?: CharacterDirectoryEntryProjection,
): HTMLElement {
    const item = element('li', 'academy-class-person-card');
    item.dataset.castId = member.id;
    item.dataset.castCategory = member.category;
    const unlocked = character?.unlocked ?? true;
    item.dataset.unlocked = String(unlocked);
    const portrait = unlocked ? classPathPortrait(member.id) : undefined;
    item.dataset.portraitState = portrait ? 'available' : unlocked ? 'name-only' : 'locked';
    if (portrait) {
        const sprite = createAcademySprite({
            characterId: member.id,
            alt: '',
            className: 'academy-class-person-portrait',
            expressions: { neutral: { still: portrait } },
        });
        sprite.setAttribute('aria-hidden', 'true');
        sprite.querySelector('img')?.setAttribute('loading', 'lazy');
        item.append(sprite);
    }
    const caption = element('div', 'academy-class-person-caption');
    const name = element('h3', 'academy-class-person-name');
    name.textContent = displayAcademyCastName(member.id, language);
    const status = element('p', 'academy-class-person-status');
    status.textContent = castCategoryLabel(member.category, language);
    caption.append(name, status);
    item.append(caption);
    return item;
}

function classPathPortrait(id: string): string | undefined {
    if (!canRenderAcademyCastPortrait(id, 'story-runtime')) return undefined;
    return (CLASS_PATH_PORTRAITS as Readonly<Record<string, string>>)[id];
}

function renderEvents(language: AcademyLanguage): HTMLElement {
    const list = element('ol', 'academy-class-event-line');
    for (const event of ACADEMY_CLASS_EVENTS) {
        const item = element('li', 'academy-class-event');
        item.dataset.eventId = event.id;
        item.dataset.eventStatus = event.status;
        const season = element('span', 'academy-class-event-season');
        season.textContent = event.season.toUpperCase();
        const copy = element('span', 'academy-class-event-copy');
        const title = element('span', 'academy-class-event-title academy-primary-purpose');
        title.textContent = event.title[language];
        const cast = element('span', 'academy-class-event-cast');
        cast.textContent = event.castIds.map(id => ACADEMY_CAST.find(member => member.id === id)?.firstName ?? id).join(' · ');
        copy.append(title, cast);
        const status = element('span', 'academy-class-event-status');
        status.textContent = localCopy(language, event.status === 'playable' ? 'eventAvailable' : 'eventPlanned');
        item.append(season, copy, status);
        list.append(item);
    }
    return list;
}

function sectionShell(
    id: string,
    language: AcademyLanguage,
    key: 'classPathWeeks' | 'classPathPeople' | 'classPathEvents',
): HTMLElement {
    const section = element('section', 'academy-class-path-section');
    section.id = id;
    section.tabIndex = -1;
    section.setAttribute('role', 'tabpanel');
    section.setAttribute('aria-labelledby', id.replace('academy-class-path-', 'academy-class-path-tab-'));
    section.append(copyElement('h2', 'academy-class-section-title', language, key));
    return section;
}

function levelForOrder(order: number): PathLevel {
    return PATH_LEVELS.find(level => order >= level.from && order <= level.to) ?? PATH_LEVELS[0];
}

function localCopy<Key extends keyof typeof CLASS_PATH_COPY>(language: AcademyLanguage, key: Key): string {
    return CLASS_PATH_COPY[key][language];
}

function castCategoryLabel(category: CastCategory, language: AcademyLanguage): string {
    const labels: Readonly<Record<CastCategory, Readonly<Record<AcademyLanguage, string>>>> = {
        teacher: { en: 'Teacher', ja: '先生' },
        classmate: { en: 'Classmate', ja: 'クラスメート' },
        'extended-member': { en: 'Extended class', ja: 'クラスの仲間' },
        'textbook-legend': { en: 'Class story', ja: 'クラスの物語' },
    };
    return labels[category][language];
}
