import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { academyText } from '../../reader/app/academy-copy';
import { OPEN_SETTINGS_EVENT } from '../../reader/app/constants';
import type { AcademyPresentationMode } from '../routing/route-history';
import { copyButton, element, setCopy } from './dom';

export type AcademyNavigation = 'campus' | 'class' | 'review' | 'journal';
export type AcademyClassBoardAccess = 'account-required' | 'available';

export interface AcademyShell {
    readonly screen: HTMLElement;
    replace(view: HTMLElement): void;
    setLanguage(language: AcademyLanguage): void;
    setNavigation(visible: boolean, active?: AcademyNavigation): void;
    setLearnerActionsVisible(visible: boolean): void;
    setClassBoardAccess(access: AcademyClassBoardAccess): void;
    setPresentationMode(mode: AcademyPresentationMode): void;
    setMuted(muted: boolean): void;
    announce(message: string): void;
    dispose(): void;
}

export interface AcademyShellOptions {
    readonly language: AcademyLanguage;
    readonly onLanguage: () => void;
    readonly onMute: () => void;
    readonly onNavigate: (route: AcademyNavigation) => void;
    readonly onPresentationMode: (mode: AcademyPresentationMode) => void;
    readonly onEndForToday?: () => void;
    readonly onSettings?: () => void;
    readonly onClassBoard?: (access: AcademyClassBoardAccess) => void;
}

export function createAcademyShell(host: HTMLElement, options: AcademyShellOptions): AcademyShell {
    const lifecycle = new AbortController();
    const previousDocumentLanguage = document.documentElement.lang;
    document.documentElement.lang = options.language;
    const root = element('div', 'academy-root');
    const header = element('header', 'academy-header');
    const utility = element('details', 'academy-utility');
    const utilityToggle = element('summary', 'academy-utility-toggle');
    utilityToggle.textContent = '•••';
    const actions = element('div', 'academy-header-actions');
    const languageButton = copyButton(options.language, 'languageToggle', 'academy-chrome-button');
    const audioButton = copyButton(options.language, 'navAudioOn', 'academy-chrome-button');
    utility.append(utilityToggle, actions);
    header.append(utility);
    const screen = element('main', 'academy-screen-host');
    screen.id = 'academy-screen';
    screen.tabIndex = -1;
    const navigation = element('nav', 'academy-navigation');
    navigation.setAttribute('aria-label', 'Academy');
    const navButtons = new Map<AcademyNavigation, HTMLButtonElement>();
    ([['campus', 'navCampus'], ['review', 'navReview'], ['journal', 'navJournal']] as const).forEach(([route, key]) => {
        const button = copyButton(options.language, key, 'academy-nav-button');
        button.dataset.route = route;
        button.addEventListener('click', () => { utility.open = false; options.onNavigate(route); }, { signal: lifecycle.signal });
        navigation.append(button);
        navButtons.set(route, button);
    });
    const learnerActions = element('div', 'academy-learner-actions');
    learnerActions.hidden = true;
    const classPath = copyButton(options.language, 'navClass', 'academy-nav-button academy-class-path-button');
    const endForToday = copyButton(options.language, 'navEndToday', 'academy-nav-button academy-end-today-button');
    const presentation = copyButton(options.language, 'navPresentationStory', 'academy-nav-button academy-presentation-button');
    learnerActions.append(classPath, endForToday, presentation);
    navButtons.set('class', classPath);
    const classBoard = copyButton(options.language, 'navClassBoardAccount', 'academy-nav-button academy-class-board-button');
    const settings = copyButton(options.language, 'navSettings', 'academy-nav-button academy-settings-button');
    actions.append(learnerActions, navigation, classBoard, settings, audioButton, languageButton);
    const live = element('div', 'academy-sr-only');
    live.setAttribute('aria-live', 'polite');
    root.append(header, screen, live);
    host.replaceChildren(root);

    let language = options.language;
    let muted = false;
    let classBoardAccess: AcademyClassBoardAccess = 'account-required';
    let presentationMode: AcademyPresentationMode = 'story';
    const refreshCopy = () => {
        utilityToggle.setAttribute('aria-label', academyText(language, 'utilityMenu'));
        setCopy(languageButton, language, 'languageToggle');
        setCopy(audioButton, language, muted ? 'navAudioMuted' : 'navAudioOn');
        setCopy(classBoard, language, classBoardAccess === 'available' ? 'navClassBoard' : 'navClassBoardAccount');
        classBoard.dataset.access = classBoardAccess;
        classBoard.hidden = !options.onClassBoard;
        setCopy(settings, language, 'navSettings');
        setCopy(classPath, language, 'navClass');
        setCopy(endForToday, language, 'navEndToday');
        setCopy(presentation, language, presentationMode === 'course' ? 'navPresentationCourse' : 'navPresentationStory');
        presentation.dataset.presentationMode = presentationMode;
        root.dataset.presentationMode = presentationMode;
        presentation.setAttribute('aria-pressed', String(presentationMode === 'course'));
        const presentationAction = academyText(
            language,
            presentationMode === 'course' ? 'navSwitchToStory' : 'navSwitchToCourse',
        );
        presentation.setAttribute('aria-label', `${presentation.textContent}. ${presentationAction}`);
        ([['campus', 'navCampus'], ['class', 'navClass'], ['review', 'navReview'], ['journal', 'navJournal']] as const)
            .forEach(([route, key]) => { const button = navButtons.get(route); if (button) setCopy(button, language, key); });
    };
    languageButton.addEventListener('click', () => { utility.open = false; options.onLanguage(); }, { signal: lifecycle.signal });
    audioButton.addEventListener('click', () => { utility.open = false; options.onMute(); }, { signal: lifecycle.signal });
    classPath.addEventListener('click', () => { utility.open = false; options.onNavigate('class'); }, { signal: lifecycle.signal });
    endForToday.addEventListener('click', () => { utility.open = false; options.onEndForToday?.(); }, { signal: lifecycle.signal });
    presentation.addEventListener('click', () => {
        utility.open = false;
        options.onPresentationMode(presentationMode === 'story' ? 'course' : 'story');
    }, { signal: lifecycle.signal });
    settings.addEventListener('click', () => {
        utility.open = false;
        if (options.onSettings) options.onSettings();
        else window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));
    }, { signal: lifecycle.signal });
    classBoard.addEventListener('click', () => {
        utility.open = false;
        options.onClassBoard?.(classBoardAccess);
    }, { signal: lifecycle.signal });
    document.addEventListener('pointerdown', event => {
        if (utility.open && event.target instanceof Node && !utility.contains(event.target)) utility.open = false;
    }, { capture: true, signal: lifecycle.signal });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !utility.open) return;
        event.preventDefault();
        utility.open = false;
        utilityToggle.focus({ preventScroll: true });
    }, { signal: lifecycle.signal });
    refreshCopy();

    return {
        screen,
        replace(view) {
            Array.from(screen.children).forEach(child => child.dispatchEvent(new CustomEvent('academy:dispose')));
            screen.replaceChildren(view);
            requestAnimationFrame(() => screen.focus({ preventScroll: true }));
        },
        setLanguage(next) { language = next; document.documentElement.lang = next; refreshCopy(); },
        setNavigation(visible, active) {
            navigation.hidden = !visible;
            navButtons.forEach((button, route) => {
                if (route === active) button.setAttribute('aria-current', 'page');
                else button.removeAttribute('aria-current');
            });
        },
        setLearnerActionsVisible(visible) { learnerActions.hidden = !visible; },
        setClassBoardAccess(next) { classBoardAccess = next; refreshCopy(); },
        setPresentationMode(next) { presentationMode = next; refreshCopy(); },
        setMuted(next) { muted = next; refreshCopy(); },
        announce(message) { live.textContent = ''; requestAnimationFrame(() => { live.textContent = message; }); },
        dispose() { lifecycle.abort(); document.documentElement.lang = previousDocumentLanguage; root.remove(); },
    };
}
