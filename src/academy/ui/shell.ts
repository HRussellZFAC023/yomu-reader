import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { academyText } from '../../reader/app/academy-copy';
import type { AcademyPresentationMode } from '../routing/route-history';
import { copyButton, element, setCopy } from './dom';
import { setAcademyTooltip } from './tooltip';

export type AcademyNavigation = 'campus' | 'story' | 'class' | 'review' | 'journal';
export type AcademyClassBoardAccess = 'account-required' | 'available';

export interface AcademyShell {
    readonly screen: HTMLElement;
    replace(view: HTMLElement): void;
    setLanguage(language: AcademyLanguage): void;
    setNavigation(visible: boolean, active?: AcademyNavigation): void;
    /** Optional for route-flow test shells created before Library chrome ownership. */
    setUtilityVisible?(visible: boolean): void;
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
    const presentation = copyButton(options.language, 'navPresentationStory', 'academy-chrome-button academy-presentation-button');
    utility.append(utilityToggle, actions);
    header.append(utility);
    const screen = element('main', 'academy-screen-host');
    screen.id = 'academy-screen';
    screen.tabIndex = -1;
    actions.append(presentation);
    const live = element('div', 'academy-sr-only');
    live.setAttribute('aria-live', 'polite');
    root.append(header, screen, live);
    host.replaceChildren(root);

    let language = options.language;
    let presentationMode: AcademyPresentationMode = 'story';
    const refreshCopy = () => {
        setAcademyTooltip(utilityToggle, academyText(language, 'utilityMenu'));
        // The control names its DESTINATION (the view a click opens), not the
        // current mode, so the collapsed ••• menu reads as "go to the course
        // view" instead of restating where the learner already is.
        setCopy(presentation, language, presentationMode === 'course' ? 'navPresentationStory' : 'navPresentationCourse');
        presentation.dataset.presentationMode = presentationMode;
        root.dataset.presentationMode = presentationMode;
        const presentationAction = academyText(
            language,
            presentationMode === 'course' ? 'navSwitchToStory' : 'navSwitchToCourse',
        );
        presentation.setAttribute('aria-label', presentationAction);
    };
    presentation.addEventListener('click', () => {
        utility.open = false;
        options.onPresentationMode(presentationMode === 'story' ? 'course' : 'story');
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
        setNavigation(_visible, _active) {},
        setUtilityVisible(visible) {
            utility.open = false;
            utility.hidden = !visible;
        },
        setLearnerActionsVisible(_visible) {},
        setClassBoardAccess(_access) {},
        setPresentationMode(next) { presentationMode = next; refreshCopy(); },
        setMuted(_next) {},
        announce(message) { live.textContent = ''; requestAnimationFrame(() => { live.textContent = message; }); },
        dispose() { lifecycle.abort(); document.documentElement.lang = previousDocumentLanguage; root.remove(); },
    };
}
