import { uiText } from '../app/i18n';
import type { JPDBCard } from '../app/types';
import type { DeckChoice } from '../cards/deck-choice';
import type { DeckChoiceMembership, DeckPickerMembership } from '../cards/deck-choice-membership';
import { trustedReaderEventHandler } from '../ui/trusted-interaction';

/** All names, evidence and accessibility text stay inside the closed picker. */
export function mountDeckPickerStatus(root: ShadowRoot, select: HTMLSelectElement, card: JPDBCard, choices: readonly DeckChoice[], membership: DeckPickerMembership): () => void {
    const report = document.createElement('div');
    report.id = 'membership-status';
    report.hidden = true;
    report.setAttribute('role', 'status');
    const list = document.createElement('ul');
    const statuses = choices.map(() => document.createElement('span'));
    const rows = choices.map((choice, index) => {
        const row = document.createElement('li');
        const name = document.createElement('strong');
        name.textContent = choice.label;
        name.title = choice.label;
        row.append(name, statuses[index]);
        return row;
    });
    list.append(...rows);
    const help = document.createElement('p');
    help.textContent = uiText(membership.language, 'deckPickerStatusHelp');
    report.append(list, help);
    root.append(report);
    select.setAttribute('aria-describedby', report.id);
    let generation = 0;
    let keyboardOpened = false;
    const show = (index: number, text: string): void => {
        const label = `${choices[index].label} — ${text}`;
        select.options[index + 1].text = label;
        statuses[index].textContent = text;
    };
    const refresh = (): void => {
        const current = ++generation;
        report.hidden = false;
        choices.forEach((_, index) => show(index, uiText(membership.language, 'deckPickerChecking')));
        const loads = membership.load(card, choices);
        choices.forEach((_, index) => {
            void Promise.resolve(loads[index]).then(status => {
                if (generation !== current || !select.isConnected) return;
                show(index, statusText(status ?? { kind: 'unknown', reason: 'unavailable' }, membership));
            }).catch(() => {
                if (generation === current && select.isConnected) show(index, uiText(membership.language, 'deckPickerUnavailable'));
            });
        });
    };
    select.addEventListener('pointerdown', trustedReaderEventHandler(() => { keyboardOpened = true; refresh(); }));
    select.addEventListener('keydown', trustedReaderEventHandler((event: KeyboardEvent) => {
        // Focus/Tab and page-created events never read accounts. Opening or
        // browsing the native picker is an explicit request for its status.
        if (event.key === 'Escape') keyboardOpened = false;
        const opens = ['ArrowDown', 'ArrowUp', ' ', 'F4'].includes(event.key) || (event.key === 'Enter' && select.selectedIndex === 0);
        if (!keyboardOpened && opens) {
            keyboardOpened = true;
            refresh();
        }
    }));
    select.addEventListener('blur', () => {
        generation++;
        keyboardOpened = false;
        if (!report.hidden) choices.forEach((_, index) => {
            if (statuses[index].textContent === uiText(membership.language, 'deckPickerChecking')) show(index, uiText(membership.language, 'deckPickerUnavailable'));
        });
    });
    return refresh;
}

function statusText(status: DeckChoiceMembership, membership: DeckPickerMembership): string {
    if (status.kind === 'saved') return uiText(membership.language, 'deckPickerSaved');
    if (status.kind === 'not-saved') return uiText(membership.language, 'deckPickerNotSaved');
    return uiText(membership.language, status.reason === 'unsupported' ? 'deckPickerUnsupported' : 'deckPickerUnavailable');
}
