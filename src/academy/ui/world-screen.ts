import { academyText, type AcademyCopyKey, type AcademyLanguage } from '../../reader/app/academy-copy';
import type { ProtagonistPortraitId } from '../assets';
import { ACADEMY_ASSETS } from '../assets';
import { canRenderAcademyCastPortrait } from '../domain/cast-registry';
import type { LessonFork } from '../content/vertical-slice';
import type { LearnerProfileSnapshot } from '../domain/learner-record';
import { copyButton, copyElement, element, screenFrame } from './dom';

export type CampusLocation = 'classroom' | 'library' | 'lab' | 'cafe';

const LOCATIONS: readonly [CampusLocation, AcademyCopyKey, AcademyCopyKey][] = [
    ['classroom', 'locationClassroom', 'locationClassroomBody'],
    ['library', 'locationLibrary', 'locationLibraryBody'],
    ['lab', 'locationLab', 'locationLabBody'],
    ['cafe', 'locationCafe', 'locationCafeBody'],
];

export function renderCampusScreen(
    language: AcademyLanguage,
    reviewComplete: boolean,
    onEnter: (location: CampusLocation) => void,
    preference?: LessonFork,
    unavailableLocations: ReadonlySet<CampusLocation> = new Set(),
): HTMLElement {
    const { screen, content } = screenFrame({
        language,
        className: 'academy-campus-screen',
        plate: 'entrance',
        title: 'campusTitle',
    });
    screen.dataset.preference = preference ?? 'none';
    const preferredLocation: CampusLocation | undefined = preference === 'sound' ? 'lab'
        : preference === 'text' ? 'library'
            : preference === 'speaking' ? 'cafe'
                : undefined;
    const map = element('div', 'academy-place-map');
    map.setAttribute('role', 'group');
    map.setAttribute('aria-label', academyText(language, 'mapLabel'));
    map.append(routeNetwork(), mapEntrance(language));
    const minimap = createMinimap(language, 'mapEntrance', 'mapChoose');
    let travelTimer = 0;
    LOCATIONS.forEach(([location, title, body]) => {
        const unavailable = unavailableLocations.has(location);
        const locked = unavailable
            || !reviewComplete && (location === 'lab' || location === 'cafe') && location !== preferredLocation;
        const button = copyButton(language, title, `academy-location academy-location-${location}`);
        button.dataset.location = location;
        button.disabled = locked;
        button.append(copyElement(
            'span',
            'academy-location-purpose',
            language,
            unavailable ? 'locationNotOpen' : locked ? 'locationUnavailable' : body,
        ));
        const showDestination = () => {
            minimap.destination.textContent = academyText(language, title);
            minimap.root.dataset.destination = location;
            map.dataset.destination = location;
        };
        const clearDestination = () => {
            if (screen.dataset.traveling) return;
            minimap.destination.textContent = academyText(language, 'mapChoose');
            delete minimap.root.dataset.destination;
            delete map.dataset.destination;
        };
        button.addEventListener('pointerenter', showDestination);
        button.addEventListener('pointerleave', clearDestination);
        button.addEventListener('focus', showDestination);
        button.addEventListener('blur', clearDestination);
        button.addEventListener('click', () => {
            if (screen.dataset.traveling) return;
            showDestination();
            screen.dataset.traveling = location;
            map.querySelectorAll<HTMLButtonElement>('.academy-location').forEach(candidate => { candidate.disabled = true; });
            const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
            if (reduceMotion) {
                onEnter(location);
                return;
            }
            travelTimer = window.setTimeout(() => onEnter(location), 360);
        });
        map.append(button);
    });
    content.append(map);
    screen.append(minimap.root);
    screen.addEventListener('academy:dispose', () => window.clearTimeout(travelTimer), { once: true });
    return screen;
}

export function renderLocationScreen(
    language: AcademyLanguage,
    location: Exclude<CampusLocation, 'library' | 'lab'>,
    onBack: () => void,
): HTMLElement {
    const definition = LOCATIONS.find(([id]) => id === location);
    if (!definition) throw new Error(`Unknown campus location: ${location}`);
    const [, title, body] = definition;
    const plate = location === 'cafe' ? 'cafe' : 'classroom';
    const { screen, content } = screenFrame({ language, className: `academy-location-screen academy-${location}-screen`, plate, title, body });
    const back = copyButton(language, 'locationReturn', 'academy-button academy-button-primary');
    back.addEventListener('click', onBack);
    content.append(back);
    screen.append(createMinimap(language, title).root);
    return screen;
}

export function renderJournalScreen(
    language: AcademyLanguage,
    profile: LearnerProfileSnapshot,
    state: Readonly<{ rieChapters: readonly number[]; aakashChapters: readonly number[]; aakashUnlocked: boolean }>,
    callbacks: Readonly<{ onReplayRie: () => void; onReplayAakash: () => void }>,
): HTMLElement {
    const { screen, content } = screenFrame({
        language,
        className: 'academy-journal-screen',
        plate: 'classroom',
        title: 'journalTitle',
    });
    const profileCard = element('article', 'academy-journal-profile academy-player-profile');
    const portrait = element('img', 'academy-journal-portrait');
    portrait.src = ACADEMY_ASSETS.portraits[profile.portraitId as ProtagonistPortraitId] ?? ACADEMY_ASSETS.portraits['quality-2'];
    portrait.alt = profile.displayName;
    const profileCopy = element('div', 'academy-journal-copy');
    const name = element('h2');
    name.textContent = profile.displayName;
    const reasonLabel = copyElement('span', 'academy-eyebrow', language, 'journalReason');
    const reason = element('p');
    reason.textContent = profile.learningReason;
    profileCopy.append(name, reasonLabel, reason);
    profileCard.append(portrait, profileCopy);
    const rieCard = element('article', 'academy-journal-profile academy-journal-rie');
    const rie = element('img', 'academy-journal-portrait');
    rie.src = ACADEMY_ASSETS.rie;
    rie.alt = language === 'ja' ? 'りえ先生' : 'Rie-sensei';
    rie.dataset.character = 'rie';
    const rieCopy = element('div', 'academy-journal-copy');
    const rieLine = copyElement('blockquote', '', language, 'journalRieLine');
    rieLine.dataset.speaker = 'rie';
    rieCopy.append(
        copyElement('h2', '', language, 'journalRie'),
        relationshipPages(language, state.rieChapters),
        rieLine,
    );
    const replay = copyButton(language, 'journalReplay', 'academy-button academy-button-secondary');
    replay.addEventListener('click', callbacks.onReplayRie);
    rieCopy.append(replay);
    rieCard.append(rie, rieCopy);
    content.append(profileCard, rieCard);
    if (state.aakashUnlocked) {
        const aakashCard = element('article', 'academy-journal-profile academy-journal-aakash');
        aakashCard.dataset.character = 'aakash';
        const aakash = element('img', 'academy-journal-portrait academy-journal-aakash-portrait');
        aakash.src = ACADEMY_ASSETS.characters.aakash;
        aakash.alt = 'Aakash';
        aakash.dataset.character = 'aakash';
        const aakashCopy = element('div', 'academy-journal-copy');
        const aakashLine = copyElement('blockquote', '', language, 'journalAakashLine');
        aakashLine.dataset.speaker = 'aakash';
        aakashCopy.append(
            copyElement('h2', '', language, 'journalAakash'),
            relationshipPages(language, state.aakashChapters),
            aakashLine,
        );
        const replayAakash = copyButton(language, 'journalReplayAakash', 'academy-button academy-button-secondary');
        replayAakash.addEventListener('click', callbacks.onReplayAakash);
        aakashCopy.append(replayAakash);
        aakashCard.append(aakash, aakashCopy);
        content.append(aakashCard);
    } else {
        content.append(copyElement('p', 'academy-journal-locked', language, 'journalLocked'));
    }
    content.append(firstTermScrapbook(language));
    return screen;
}

function firstTermScrapbook(language: AcademyLanguage): HTMLElement {
    const spread = element('section', 'academy-scrapbook-spread');
    spread.dataset.scrapbookEntry = 'first-term';
    spread.append(copyElement('h2', 'academy-scrapbook-title', language, 'journalFirstTerm'));
    const people = element('div', 'academy-scrapbook-people');

    const peter = element('article', 'academy-scrapbook-person academy-scrapbook-peter');
    peter.dataset.character = 'peter';
    peter.append(copyElement('h3', 'academy-scrapbook-name', language, 'journalPeter'));

    const shaun = element('article', 'academy-scrapbook-person academy-scrapbook-shaun');
    shaun.dataset.character = 'shaun';
    if (canRenderAcademyCastPortrait('shaun', 'journal-review-preview')) {
        const portrait = element('img', 'academy-scrapbook-portrait');
        portrait.src = ACADEMY_ASSETS.characters.shaun;
        portrait.alt = '';
        portrait.setAttribute('aria-hidden', 'true');
        portrait.dataset.character = 'shaun';
        portrait.addEventListener('error', () => {
            shaun.dataset.portraitState = 'unavailable';
            portrait.remove();
        }, { once: true });
        shaun.dataset.portraitState = 'review-preview';
        shaun.append(portrait);
    }
    shaun.append(copyElement('h3', 'academy-scrapbook-name', language, 'journalShaun'));

    people.append(peter, shaun);
    spread.append(people);
    return spread;
}

function relationshipPages(language: AcademyLanguage, chapters: readonly number[]): HTMLOListElement {
    const unlocked = new Set(chapters);
    const root = element('ol', 'academy-relationship-pages');
    root.setAttribute('aria-label', academyText(language, 'relationshipJournalProgress'));
    const keys = [
        'relationshipStage1', 'relationshipStage2', 'relationshipStage3', 'relationshipStage4', 'relationshipStage5',
        'relationshipStage6', 'relationshipStage7', 'relationshipStage8', 'relationshipStage9', 'relationshipStage10',
    ] as const;
    keys.forEach((key, index) => {
        const page = index + 1;
        const item = element('li', 'academy-relationship-page');
        item.dataset.unlocked = String(unlocked.has(page));
        item.setAttribute('aria-disabled', String(!unlocked.has(page)));
        const number = element('span', 'academy-relationship-page-number');
        number.textContent = String(page).padStart(2, '0');
        number.setAttribute('aria-hidden', 'true');
        item.append(number, copyElement('span', 'academy-relationship-page-name', language, key));
        root.append(item);
    });
    return root;
}

function createMinimap(
    language: AcademyLanguage,
    currentKey: AcademyCopyKey,
    destinationKey?: AcademyCopyKey,
): { root: HTMLElement; destination: HTMLElement } {
    const root = element('aside', 'academy-minimap');
    root.setAttribute('aria-label', academyText(language, 'mapLabel'));
    const label = copyElement('span', 'academy-minimap-label', language, 'mapLabel');
    const route = element('div', 'academy-minimap-route');
    const current = copyElement('strong', 'academy-minimap-place', language, currentKey);
    const arrow = element('span', 'academy-minimap-arrow');
    arrow.textContent = '→';
    arrow.setAttribute('aria-hidden', 'true');
    const destination = destinationKey
        ? copyElement('span', 'academy-minimap-destination', language, destinationKey)
        : element('span', 'academy-minimap-destination');
    route.append(current);
    if (destinationKey) route.append(arrow, destination);
    root.append(label, route);
    return { root, destination };
}

function routeNetwork(): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('academy-route-network');
    svg.setAttribute('viewBox', '0 0 100 62');
    svg.setAttribute('aria-hidden', 'true');
    const routes: readonly [CampusLocation, string][] = [
        ['classroom', 'M50 58 C43 48 28 39 18 21'],
        ['library', 'M50 58 C58 48 73 39 83 24'],
        ['lab', 'M50 58 C42 52 32 50 28 45'],
        ['cafe', 'M50 58 C60 53 69 51 77 45'],
    ];
    routes.forEach(([location, d]) => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.dataset.routeTo = location;
        path.setAttribute('d', d);
        svg.append(path);
    });
    return svg;
}

function mapEntrance(language: AcademyLanguage): HTMLElement {
    const entrance = copyElement('span', 'academy-map-entrance', language, 'mapEntrance');
    entrance.setAttribute('aria-hidden', 'true');
    return entrance;
}
