import type { AcademyCopyKey, AcademyLanguage } from '../../reader/app/academy-copy';
import { academyText } from '../../reader/app/academy-copy';
import { DISCORD_INVITE_URL, DOCS_BASE_URL, GITHUB_REPOSITORY_URL, NEW_TAB_PAGE_URL } from '../../reader/app/constants';
import type { AcademyPresentationMode } from '../routing/route-history';
import { copyButton, element, setCopy } from './dom';

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
    const languageButton = copyButton(options.language, 'languageToggle', 'academy-chrome-button academy-language-button');
    const muteButton = copyButton(options.language, 'navAudioOn', 'academy-chrome-button academy-mute-button');
    const utilityLinkDefs: { key: AcademyCopyKey; href: string; external?: boolean }[] = [
        { key: 'utilityLinkHome', href: DOCS_BASE_URL },
        { key: 'utilityLinkStudy', href: NEW_TAB_PAGE_URL },
        { key: 'utilityLinkSupport', href: `${DOCS_BASE_URL}support` },
        { key: 'utilityLinkDiscord', href: DISCORD_INVITE_URL, external: true },
        { key: 'utilityLinkGitHub', href: GITHUB_REPOSITORY_URL, external: true },
    ];
    const utilityLinks = utilityLinkDefs.map(({ key, href, external }) => {
        const anchor = element('a', 'academy-chrome-button academy-utility-link');
        anchor.href = href;
        if (external) {
            anchor.target = '_blank';
            anchor.rel = 'noopener';
        }
        return { anchor, key };
    });
    utility.append(utilityToggle, actions);
    header.append(utility);
    const screen = element('main', 'academy-screen-host');
    screen.id = 'academy-screen';
    screen.tabIndex = -1;
    actions.append(
        presentation,
        languageButton,
        muteButton,
        element('hr', 'academy-utility-divider'),
        ...utilityLinks.map(link => link.anchor),
    );
    const live = element('div', 'academy-sr-only');
    live.setAttribute('aria-live', 'polite');
    root.append(header, screen, live);
    host.replaceChildren(root);

    let language = options.language;
    let presentationMode: AcademyPresentationMode = 'story';
    let muted = false;
    const refreshCopy = () => {
        // The toggle renders its own visible caption from data-tooltip (the
        // ink-tag ::after), so the portalled hover tooltip would duplicate it.
        const menuLabel = academyText(language, 'utilityMenu');
        utilityToggle.setAttribute('aria-label', menuLabel);
        utilityToggle.title = menuLabel;
        utilityToggle.dataset.tooltip = menuLabel;
        // Name the destination, so the control answers “where will this take me?”
        // rather than describing the mode that is already active.
        setCopy(presentation, language, presentationMode === 'course' ? 'navPresentationStory' : 'navPresentationCourse');
        presentation.dataset.presentationMode = presentationMode;
        root.dataset.presentationMode = presentationMode;
        presentation.removeAttribute('aria-pressed');
        const presentationAction = academyText(
            language,
            presentationMode === 'course' ? 'navSwitchToStory' : 'navSwitchToCourse',
        );
        presentation.setAttribute('aria-label', presentationAction);
        setCopy(languageButton, language, 'languageToggle');
        // The label names the language the button switches TO, so it must render
        // in that language, not the current one.
        languageButton.lang = language === 'ja' ? 'en' : 'ja';
        setCopy(muteButton, language, muted ? 'navAudioMuted' : 'navAudioOn');
        muteButton.setAttribute('aria-pressed', String(muted));
        utilityLinks.forEach(({ anchor, key }) => setCopy(anchor, language, key));
    };
    presentation.addEventListener('click', () => {
        utility.open = false;
        options.onPresentationMode(presentationMode === 'story' ? 'course' : 'story');
    }, { signal: lifecycle.signal });
    languageButton.addEventListener('click', () => {
        utility.open = false;
        options.onLanguage();
    }, { signal: lifecycle.signal });
    muteButton.addEventListener('click', () => options.onMute(), { signal: lifecycle.signal });
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
        setMuted(next) { muted = next; refreshCopy(); },
        announce(message) { live.textContent = ''; requestAnimationFrame(() => { live.textContent = message; }); },
        dispose() { lifecycle.abort(); document.documentElement.lang = previousDocumentLanguage; root.remove(); },
    };
}
