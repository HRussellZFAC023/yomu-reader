import { createReaderBackdrop } from '../popup/shell';

export type ConnectionLostChoice = 'stop' | 'continue' | 'retry';

export interface ConnectionLostDialogText {
    title: string;
    body: string;
    stop: string;
    continueOffline: string;
    retry: string;
}

// One dialog per document: a second grade failing while the prompt is open
// must reuse the pending choice instead of stacking backdrops.
let pendingChoice: Promise<ConnectionLostChoice> | null = null;
let pendingPanel: HTMLElement | null = null;
let pendingFinish: ((choice: ConnectionLostChoice) => void) | null = null;

// Settles an orphaned prompt as "stop" (safe: nothing queued or submitted).
// Called on controller teardown, and defensively when a remount replaced the
// document body underneath an open dialog — an unresolved pendingChoice would
// otherwise deadlock every later grade behind a promise with no UI.
export function cancelConnectionLostDialog(): void {
    pendingFinish?.('stop');
}

export function showConnectionLostDialog(host: Document, text: ConnectionLostDialogText): Promise<ConnectionLostChoice> {
    if (pendingChoice && pendingPanel?.isConnected) return pendingChoice;
    if (pendingChoice) cancelConnectionLostDialog();
    pendingChoice = new Promise<ConnectionLostChoice>(resolve => {
        const finish = (choice: ConnectionLostChoice): void => {
            pendingChoice = null;
            pendingPanel = null;
            pendingFinish = null;
            backdrop.remove();
            panel.remove();
            previousFocus?.focus?.();
            resolve(choice);
        };
        // Dismissing without an explicit choice must not queue or submit
        // anything, so backdrop click and Escape both mean "stop".
        const backdrop = createReaderBackdrop(() => finish('stop'));
        const panel = host.createElement('section');
        panel.className = 'jpdb-reader-connection-lost';
        panel.dataset.jpdbReaderRoot = 'true';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', text.title);
        panel.tabIndex = -1;

        const title = host.createElement('h2');
        title.textContent = text.title;
        const body = host.createElement('p');
        body.textContent = text.body;
        const actions = host.createElement('div');
        actions.className = 'jpdb-reader-connection-lost-actions';

        const action = (label: string, choice: ConnectionLostChoice): HTMLButtonElement => {
            const button = host.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.dataset.connectionLostAction = choice;
            button.addEventListener('click', () => finish(choice));
            actions.append(button);
            return button;
        };
        action(text.stop, 'stop');
        const primary = action(text.continueOffline, 'continue');
        primary.classList.add('jpdb-reader-connection-lost-primary');
        action(text.retry, 'retry');

        panel.append(title, body, actions);
        panel.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                finish('stop');
            }
        });

        const previousFocus = host.activeElement as HTMLElement | null;
        host.body.append(backdrop, panel);
        pendingPanel = panel;
        pendingFinish = finish;
        primary.focus();
    });
    return pendingChoice;
}
