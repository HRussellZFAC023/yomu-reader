import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { academyText } from '../../reader/app/academy-copy';
import { createSupportDonationService, type SupportDonationService } from '../access/support-donation';
import { copyButton, copyElement, element, fieldError, screenFrame, setBusy, setCopy } from './dom';

export interface AccessScreenOptions {
    readonly language: AcademyLanguage;
    readonly onSubmit: (code: string) => Promise<void>;
    readonly supportDonation?: SupportDonationService;
}

export function renderAccessScreen(options: AccessScreenOptions): HTMLElement {
    const lifecycle = new AbortController();
    const { screen, content } = screenFrame({
        language: options.language,
        className: 'academy-access-screen',
        plate: 'campusEnsemble',
        title: 'academyName',
        body: 'accessBody',
    });
    const form = element('form', 'academy-form academy-access-form');
    // Keep validation inside the paper panel; the browser bubble covers the
    // primary action at narrow viewports.
    form.noValidate = true;
    const label = copyElement('label', 'academy-label', options.language, 'accessCodeLabel');
    const input = element('input', 'academy-input');
    input.name = 'code';
    input.autocomplete = 'one-time-code';
    input.inputMode = 'text';
    input.maxLength = 64;
    input.required = true;
    input.setAttribute('aria-label', academyText(options.language, 'accessCodeLabel'));
    input.placeholder = academyText(options.language, 'accessCodePlaceholder');
    label.append(input);
    const submit = copyButton(options.language, 'accessSubmit', 'academy-button academy-button-primary');
    submit.type = 'submit';
    const getCode = copyButton(options.language, 'accessGetCode', 'academy-button academy-button-secondary academy-get-code');
    getCode.type = 'button';
    const feedback = element('div', 'academy-form-feedback');
    const actions = element('div', 'academy-access-actions');
    actions.append(submit, getCode);
    form.append(label, actions, feedback);
    input.addEventListener('input', () => {
        if (!input.value.trim()) return;
        input.removeAttribute('aria-invalid');
        feedback.replaceChildren();
    }, { signal: lifecycle.signal });
    form.addEventListener('submit', event => {
        event.preventDefault();
        feedback.replaceChildren();
        if (!input.value.trim()) {
            input.setAttribute('aria-invalid', 'true');
            feedback.replaceChildren(fieldError(input.validationMessage || academyText(options.language, 'accessInvalid')));
            input.focus();
            return;
        }
        input.removeAttribute('aria-invalid');
        setBusy(submit, true, academyText(options.language, 'accessChecking'));
        void options.onSubmit(input.value).catch(error => {
            const unavailable = error instanceof Error && 'code' in error && error.code === 'unavailable';
            feedback.replaceChildren(fieldError(academyText(options.language, unavailable ? 'accessUnavailable' : 'accessInvalid')));
            submit.disabled = false;
            submit.removeAttribute('aria-busy');
            setCopy(submit, options.language, 'accessSubmit');
            input.focus();
        });
    });
    const supportDonation = options.supportDonation ?? createSupportDonationService();
    getCode.addEventListener('click', () => supportDonation.open(), { signal: lifecycle.signal });
    content.append(form);
    screen.addEventListener('academy:dispose', () => {
        lifecycle.abort();
    }, { once: true });
    return screen;
}
