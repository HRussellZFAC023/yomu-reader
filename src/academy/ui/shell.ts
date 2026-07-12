import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { academyText } from '../../reader/app/academy-copy';
import { copyButton, element } from './dom';

export type AcademyNavigation = 'campus' | 'review' | 'journal';

export interface AcademyShell {
    readonly screen: HTMLElement;
    replace(view: HTMLElement): void;
    setLanguage(language: AcademyLanguage): void;
    setNavigation(visible: boolean, active?: AcademyNavigation): void;
    setNetwork(online: boolean): void;
    setMuted(muted: boolean): void;
    announce(message: string): void;
    dispose(): void;
}

export interface AcademyShellOptions {
    readonly language: AcademyLanguage;
    readonly onLanguage: () => void;
    readonly onMute: () => void;
    readonly onNavigate: (route: AcademyNavigation) => void;
}

export function createAcademyShell(host: HTMLElement, options: AcademyShellOptions): AcademyShell {
    const lifecycle = new AbortController();
    const root = element('div', 'academy-root');
    const header = element('header', 'academy-header');
    const brand = element('span', 'academy-brand');
    const network = element('span', 'academy-network-state');
    const actions = element('div', 'academy-header-actions');
    const languageButton = copyButton(options.language, 'languageToggle', 'academy-chrome-button');
    const audioButton = copyButton(options.language, 'navAudioOn', 'academy-chrome-button');
    actions.append(network, audioButton, languageButton);
    header.append(brand, actions);
    const screen = element('main', 'academy-screen-host');
    screen.id = 'academy-screen';
    screen.tabIndex = -1;
    const navigation = element('nav', 'academy-navigation');
    navigation.setAttribute('aria-label', 'Academy');
    const navButtons = new Map<AcademyNavigation, HTMLButtonElement>();
    ([['campus', 'navCampus'], ['review', 'navReview'], ['journal', 'navJournal']] as const).forEach(([route, key]) => {
        const button = copyButton(options.language, key, 'academy-nav-button');
        button.dataset.route = route;
        button.addEventListener('click', () => options.onNavigate(route), { signal: lifecycle.signal });
        navigation.append(button);
        navButtons.set(route, button);
    });
    const live = element('div', 'academy-sr-only');
    live.setAttribute('aria-live', 'polite');
    root.append(header, screen, navigation, live);
    host.replaceChildren(root);

    let language = options.language;
    let muted = false;
    let online = navigator.onLine;
    const refreshCopy = () => {
        brand.textContent = academyText(language, 'academyName');
        brand.lang = 'ja';
        languageButton.textContent = academyText(language, 'languageToggle');
        audioButton.textContent = academyText(language, muted ? 'navAudioMuted' : 'navAudioOn');
        network.textContent = academyText(language, online ? 'onlineNow' : 'offlineNow');
        ([['campus', 'navCampus'], ['review', 'navReview'], ['journal', 'navJournal']] as const)
            .forEach(([route, key]) => { const button = navButtons.get(route); if (button) button.textContent = academyText(language, key); });
    };
    languageButton.addEventListener('click', options.onLanguage, { signal: lifecycle.signal });
    audioButton.addEventListener('click', options.onMute, { signal: lifecycle.signal });
    refreshCopy();

    return {
        screen,
        replace(view) {
            Array.from(screen.children).forEach(child => child.dispatchEvent(new CustomEvent('academy:dispose')));
            screen.replaceChildren(view);
            requestAnimationFrame(() => screen.focus({ preventScroll: true }));
        },
        setLanguage(next) { language = next; refreshCopy(); },
        setNavigation(visible, active) {
            navigation.hidden = !visible;
            navButtons.forEach((button, route) => {
                if (route === active) button.setAttribute('aria-current', 'page');
                else button.removeAttribute('aria-current');
            });
        },
        setNetwork(next) { online = next; refreshCopy(); },
        setMuted(next) { muted = next; refreshCopy(); },
        announce(message) { live.textContent = ''; requestAnimationFrame(() => { live.textContent = message; }); },
        dispose() { lifecycle.abort(); root.remove(); },
    };
}
