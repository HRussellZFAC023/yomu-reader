/**
 * The membership chooser, opened from the nav instead of navigating away.
 *
 * Three payment providers used to sit in the navbar as separate icons, one of
 * them a payment processor's logo. A visitor had to guess which mark meant what
 * before they could give anything. This asks the one question that matters —
 * which service do you already use — and hands off to it.
 *
 * Progressive enhancement, deliberately: the nav entry stays a real link to
 * /membership, so with no JS, or if this module throws, pressing it still lands
 * on the full page. The popover only ever intercepts a click it can handle.
 *
 * Dialog behaviour follows the W3C modal pattern that docs/academy/VISUAL-SYSTEM.md
 * already binds Academy to: background inert, focus moves in and stays, Escape
 * and a visible close, focus returns to whatever opened it. The paper-and-keyline
 * surface is the homepage grammar (3px ink keyline, zero-blur offset shadow,
 * radius 2px, one small rotation), not a rounded SaaS card.
 */

const MEMBERSHIP_ROUTE = '/membership';
const DIALOG_ID = 'yomu-membership-dialog';
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface MembershipMethod {
    id: string;
    name: string;
    href: string;
    /** What the visitor is choosing, in plain terms. No selling. */
    detail: string;
}

/**
 * Ko-fi and Patreon are the two that work today. Card payment is not wired yet,
 * so it routes to Help rather than a dead checkout — saying so is better than a
 * button that fails after someone has decided to pay.
 */
const METHODS: readonly MembershipMethod[] = Object.freeze([
    { id: 'kofi', name: 'Ko-fi', href: 'https://ko-fi.com/yomureader', detail: 'One-off or monthly.' },
    { id: 'patreon', name: 'Patreon', href: 'https://www.patreon.com/yomureader', detail: 'Monthly.' },
    { id: 'card', name: 'Card', href: '/support', detail: 'Being set up. Ask and it gets sorted.' },
]);

let dialog: HTMLElement | undefined;
let lastTrigger: HTMLElement | undefined;
let keydownBound = false;

export function installMembershipPopover(): void {
    // window + capture is the FIRST phase any click reaches, which matters here:
    // VitePress's SPA router binds click on window (bubble) and calls
    // preventDefault to route itself, and the Yomu reader binds its own document
    // handlers for lookups. Listening later meant arriving at an event another
    // listener had already cancelled, and the popover never opened.
    window.addEventListener('click', handleDocumentClick, { capture: true });
}

function handleDocumentClick(event: MouseEvent): void {
    // Never swallow a modified click: a visitor opening the page in a new tab
    // means it, and middle-click/ctrl-click must keep working like a link.
    // defaultPrevented is deliberately NOT checked — at this phase nothing
    // legitimate has cancelled the event yet, and checking it made the popover
    // depend on listener registration order.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const trigger = membershipTriggerFrom(event.target);
    if (!trigger) return;
    const href = trigger.getAttribute('href') ?? MEMBERSHIP_ROUTE;
    event.preventDefault();
    // Nothing else needs this click: the router would navigate away from the
    // page the popover is meant to open over.
    event.stopImmediatePropagation();
    try {
        openMembershipDialog(trigger);
    } catch {
        // A visitor who pressed Membership must still reach it. Falling back to
        // the full page is worse than the popover and far better than nothing.
        window.location.assign(href);
    }
}

function membershipTriggerFrom(target: EventTarget | null): HTMLElement | undefined {
    if (!(target instanceof Element)) return undefined;
    const link = target.closest<HTMLAnchorElement>('a[href]');
    if (!link) return undefined;
    // Inside the dialog the provider links are the real destinations.
    if (link.closest(`#${DIALOG_ID}`)) return undefined;
    // A visitor already reading /membership gets the page, not a layer over it.
    if (routeOf(window.location.pathname) === MEMBERSHIP_ROUTE) return undefined;
    return routeOf(link.getAttribute('href') ?? '') === MEMBERSHIP_ROUTE ? link : undefined;
}

/** `/membership`, `/membership/`, `/membership.html` and absolute forms all match. */
function routeOf(value: string): string | undefined {
    try {
        const url = new URL(value, window.location.origin);
        if (url.origin !== window.location.origin) return undefined;
        return url.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    } catch {
        return undefined;
    }
}

function openMembershipDialog(trigger: HTMLElement): void {
    lastTrigger = trigger;
    dialog ??= buildDialog();
    if (!dialog.isConnected) document.body.append(dialog);
    dialog.hidden = false;
    document.documentElement.dataset.yomuMembershipOpen = 'true';
    setBackgroundInert(true);
    if (!keydownBound) {
        document.addEventListener('keydown', handleKeydown, true);
        keydownBound = true;
    }
    dialog.querySelector<HTMLElement>(FOCUSABLE)?.focus();
}

function closeMembershipDialog(): void {
    if (!dialog || dialog.hidden) return;
    dialog.hidden = true;
    delete document.documentElement.dataset.yomuMembershipOpen;
    setBackgroundInert(false);
    lastTrigger?.focus();
    lastTrigger = undefined;
}

/**
 * Really make the background inert, rather than only trapping Tab.
 *
 * The W3C pattern this follows asks for an inert background, and a scripted Tab
 * trap is not that: it leaves the page behind reachable by screen-reader
 * virtual cursor, by find-in-page, and by any pointer that lands outside the
 * panel. `inert` removes the subtree from the accessibility tree and from hit
 * testing in one attribute, so the promise and the behaviour match.
 *
 * Applied to `document.body`'s element children except the dialog itself, since
 * the dialog is mounted on body: marking body inert would include its own
 * descendant and disable the panel too.
 */
function setBackgroundInert(active: boolean): void {
    for (const node of document.body.children) {
        if (!(node instanceof HTMLElement) || node === dialog) continue;
        if (active) {
            // Remember only what we changed, so a page that already marked
            // something inert keeps it inert after the dialog closes.
            if (!node.inert) node.dataset.yomuMembershipInerted = 'true';
            node.inert = true;
            continue;
        }
        if (node.dataset.yomuMembershipInerted) {
            node.inert = false;
            delete node.dataset.yomuMembershipInerted;
        }
    }
}

function handleKeydown(event: KeyboardEvent): void {
    if (!dialog || dialog.hidden) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        closeMembershipDialog();
        return;
    }
    if (event.key !== 'Tab') return;
    // Focus stays inside: the background is inert while this is open, so letting
    // Tab walk out would leave the keyboard somewhere the visitor cannot see.
    const stops = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(node => node.offsetParent !== null);
    if (!stops.length) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
    }
}

function buildDialog(): HTMLElement {
    const root = document.createElement('div');
    root.className = 'yomu-membership-backdrop';
    root.hidden = true;
    root.addEventListener('click', event => {
        if (event.target === root) closeMembershipDialog();
    });

    const panel = document.createElement('div');
    panel.id = DIALOG_ID;
    panel.className = 'yomu-membership-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', `${DIALOG_ID}-title`);

    const title = document.createElement('h2');
    title.id = `${DIALOG_ID}-title`;
    title.className = 'yomu-membership-title';
    title.textContent = 'Membership';

    const lead = document.createElement('p');
    lead.className = 'yomu-membership-lead';
    lead.textContent = 'Yomu is free and the reader stays free. Membership pays for building it, and includes Academy when it opens.';

    const list = document.createElement('ul');
    list.className = 'yomu-membership-methods';
    for (const method of METHODS) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.className = 'yomu-membership-method';
        link.href = method.href;
        link.dataset.yomuMembershipMethod = method.id;
        if (method.href.startsWith('http')) {
            link.rel = 'noopener';
            link.target = '_blank';
        }
        const name = document.createElement('strong');
        name.textContent = method.name;
        const detail = document.createElement('span');
        detail.textContent = method.detail;
        link.append(name, detail);
        item.append(link);
        list.append(item);
    }

    const more = document.createElement('a');
    more.className = 'yomu-membership-more';
    more.href = MEMBERSHIP_ROUTE;
    more.textContent = 'What members get';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'yomu-membership-close';
    close.textContent = 'Close';
    close.addEventListener('click', closeMembershipDialog);

    panel.append(close, title, lead, list, more);
    root.append(panel);
    return root;
}
