/**
 * Yomu Academy — app shell.
 *
 * Slim persistent navigation (bottom bar on mobile, top bar on desktop)
 * over a single screen host. Five destinations: Map, Syllabus, Review,
 * Cast, Settings. Scene mode hides the bar; study mode keeps it.
 */

export type ShellRoute = 'map' | 'syllabus' | 'review' | 'cast' | 'settings';

export interface ShellController {
    /** The element screens render into. */
    readonly screen: HTMLElement;
    navigate(route: ShellRoute): void;
    /** Hide/show chrome for scene mode. */
    setImmersive(immersive: boolean): void;
    onNavigate(handler: (route: ShellRoute) => void): void;
}

const ROUTES: { id: ShellRoute; label: string; kana: string }[] = [
    { id: 'map', label: 'Map', kana: 'まち' },
    { id: 'syllabus', label: 'Lessons', kana: 'じゅぎょう' },
    { id: 'review', label: 'Review', kana: 'ふくしゅう' },
    { id: 'cast', label: 'Class', kana: 'クラス' },
    { id: 'settings', label: 'Settings', kana: 'せってい' },
];

export function createShell(host: HTMLElement): ShellController {
    host.innerHTML = '';
    host.classList.add('academy-shell');

    const screen = document.createElement('main');
    screen.className = 'academy-screen';
    screen.id = 'academy-screen';

    const nav = document.createElement('nav');
    nav.className = 'academy-nav';
    nav.setAttribute('aria-label', 'Academy');
    const handlers: ((route: ShellRoute) => void)[] = [];
    const buttons = new Map<ShellRoute, HTMLButtonElement>();

    for (const route of ROUTES) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'academy-nav-item';
        button.dataset.route = route.id;
        const label = document.createElement('span');
        label.textContent = route.label;
        const kana = document.createElement('span');
        kana.className = 'academy-nav-kana';
        kana.lang = 'ja';
        kana.textContent = route.kana;
        button.append(kana, label);
        button.addEventListener('click', () => {
            setActive(route.id);
            handlers.forEach(handler => handler(route.id));
        });
        buttons.set(route.id, button);
        nav.append(button);
    }

    function setActive(route: ShellRoute): void {
        for (const [id, button] of buttons) {
            button.classList.toggle('is-active', id === route);
            button.setAttribute('aria-current', id === route ? 'page' : 'false');
        }
    }

    host.append(screen, nav);

    return {
        screen,
        navigate(route) {
            setActive(route);
            handlers.forEach(handler => handler(route));
        },
        setImmersive(immersive) {
            host.classList.toggle('is-immersive', immersive);
        },
        onNavigate(handler) {
            handlers.push(handler);
        },
    };
}
