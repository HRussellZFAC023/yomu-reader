import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { academyText } from '../../reader/app/academy-copy';
import type { DonationCheckoutService } from '../access/donation-checkout';
import { copyButton, copyElement, element, fieldError, setBusy, setCopy } from './dom';

export interface DonationDialog {
    readonly element: HTMLDialogElement;
    open(trigger: HTMLElement): void;
    dispose(): void;
}

export function createDonationDialog(language: AcademyLanguage, checkout: DonationCheckoutService): DonationDialog {
    const lifecycle = new AbortController();
    const dialog = element('dialog', 'academy-donation-dialog');
    dialog.setAttribute('aria-labelledby', 'academy-donation-title');
    dialog.setAttribute('aria-describedby', 'academy-donation-description');
    const paper = element('section', 'academy-donation-paper');
    const heading = copyElement('h2', 'academy-donation-title', language, 'donationTitle');
    heading.id = 'academy-donation-title';
    const close = copyButton(language, 'donationClose', 'academy-donation-close');
    close.setAttribute('aria-label', academyText(language, 'donationClose'));
    close.textContent = '×';
    const form = element('form', 'academy-donation-form');
    const amountField = copyElement('label', 'academy-donation-amount', language, 'donationOtherAmount');
    const amountInput = element('input', 'academy-input');
    amountInput.type = 'number';
    amountInput.name = 'donation-amount';
    amountInput.min = '5';
    amountInput.max = '500';
    amountInput.step = '0.01';
    amountInput.inputMode = 'decimal';
    amountInput.placeholder = academyText(language, 'donationAmountPlaceholder');
    amountInput.required = true;
    amountInput.setAttribute('aria-label', academyText(language, 'donationOtherAmount'));
    amountField.append(amountInput);
    const description = copyElement('p', 'academy-donation-description', language, 'donationDescription');
    description.id = 'academy-donation-description';
    const feedback = element('div', 'academy-form-feedback');
    const continueButton = copyButton(language, 'donationContinue', 'academy-button academy-button-primary academy-donation-continue');
    continueButton.type = 'submit';
    const cancel = copyButton(language, 'donationCancel', 'academy-button academy-button-quiet');
    cancel.type = 'button';
    const actions = element('div', 'academy-donation-actions');
    actions.append(continueButton, cancel);
    form.append(amountField, description, feedback, actions);
    paper.append(close, heading, form);
    dialog.append(paper);

    let returnFocus: HTMLElement | null = null;
    let inerted: InertSnapshot[] = [];
    const restoreFocus = () => {
        dialog.removeAttribute('aria-modal');
        restoreInert(inerted);
        inerted = [];
        const target = returnFocus;
        returnFocus = null;
        target?.focus({ preventScroll: true });
    };
    const closeDialog = () => {
        if (typeof dialog.close === 'function' && dialog.open) dialog.close();
        else {
            dialog.removeAttribute('open');
            restoreFocus();
        }
    };
    close.addEventListener('click', closeDialog, { signal: lifecycle.signal });
    cancel.addEventListener('click', closeDialog, { signal: lifecycle.signal });
    dialog.addEventListener('close', restoreFocus, { signal: lifecycle.signal });
    dialog.addEventListener('cancel', event => {
        event.preventDefault();
        closeDialog();
    }, { signal: lifecycle.signal });
    dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeDialog();
            return;
        }
        trapFocus(event, dialog);
    }, { signal: lifecycle.signal });
    form.addEventListener('submit', event => {
        event.preventDefault();
        feedback.replaceChildren();
        const amount = Number(amountInput.value);
        const pence = Math.round(amount * 100);
        if (!Number.isFinite(amount) || amount < 5 || amount > 500 || Math.abs(pence - amount * 100) > 1e-6) {
            feedback.replaceChildren(fieldError(academyText(language, 'donationInvalidAmount')));
            amountInput.focus();
            return;
        }
        setBusy(continueButton, true, academyText(language, 'donationStarting'));
        void checkout.start(amount).catch(() => {
            feedback.replaceChildren(fieldError(academyText(language, 'donationUnavailable')));
            continueButton.disabled = false;
            continueButton.removeAttribute('aria-busy');
            setCopy(continueButton, language, 'donationContinue');
        });
    }, { signal: lifecycle.signal });

    return {
        element: dialog,
        open(trigger) {
            returnFocus = trigger;
            inerted = makeBackgroundInert(dialog);
            dialog.setAttribute('aria-modal', 'true');
            try {
                if (typeof dialog.showModal === 'function') dialog.showModal();
                else dialog.setAttribute('open', '');
            } catch {
                dialog.setAttribute('open', '');
            }
            requestAnimationFrame(() => amountInput.focus());
        },
        dispose() {
            lifecycle.abort();
            restoreInert(inerted);
            inerted = [];
            returnFocus = null;
            dialog.remove();
        },
    };
}

interface InertSnapshot {
    readonly element: HTMLElement;
    readonly inert: boolean;
    readonly ariaHidden: string | null;
}

function makeBackgroundInert(dialog: HTMLElement): InertSnapshot[] {
    const screen = dialog.parentElement;
    const root = dialog.closest('.academy-root');
    const targets = [
        ...Array.from(screen?.children ?? []).filter(element => element !== dialog),
        ...Array.from(root?.querySelectorAll(':scope > .academy-header, :scope > .academy-navigation') ?? []),
    ].filter((element): element is HTMLElement => element instanceof HTMLElement);
    return targets.map(element => {
        const snapshot = {
            element,
            inert: element.inert === true || element.hasAttribute('inert'),
            ariaHidden: element.getAttribute('aria-hidden'),
        };
        element.inert = true;
        element.setAttribute('inert', '');
        element.setAttribute('aria-hidden', 'true');
        return snapshot;
    });
}

function restoreInert(snapshots: readonly InertSnapshot[]): void {
    snapshots.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (inert) element.setAttribute('inert', '');
        else element.removeAttribute('inert');
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
    });
}

function trapFocus(event: KeyboardEvent, root: HTMLElement): void {
    if (event.key !== 'Tab') return;
    const controls = Array.from(root.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    )).filter(control => !control.closest('[hidden]'));
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}
