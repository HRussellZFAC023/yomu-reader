import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { academyText } from '../../reader/app/academy-copy';
import { copyButton, copyElement, element, fieldError, screenFrame, setBusy } from './dom';

export interface AccessScreenOptions {
    readonly language: AcademyLanguage;
    readonly onSubmit: (code: string) => Promise<void>;
}

export function renderAccessScreen(options: AccessScreenOptions): HTMLElement {
    const { screen, content } = screenFrame({
        language: options.language,
        className: 'academy-access-screen',
        plate: 'entrance',
        eyebrow: 'accessEyebrow',
        title: 'accessTitle',
        body: 'accessBody',
    });
    const form = element('form', 'academy-form academy-access-form');
    const label = copyElement('label', 'academy-label', options.language, 'accessCodeLabel');
    const input = element('input', 'academy-input');
    input.name = 'code';
    input.autocomplete = 'one-time-code';
    input.inputMode = 'text';
    input.maxLength = 64;
    input.required = true;
    input.placeholder = academyText(options.language, 'accessCodePlaceholder');
    label.append(input);
    const submit = copyButton(options.language, 'accessSubmit', 'academy-button academy-button-primary');
    submit.type = 'submit';
    const feedback = element('div', 'academy-form-feedback');
    form.append(label, submit, feedback);
    form.addEventListener('submit', event => {
        event.preventDefault();
        feedback.replaceChildren();
        setBusy(submit, true, academyText(options.language, 'accessChecking'));
        void options.onSubmit(input.value).catch(error => {
            const unavailable = error instanceof Error && 'code' in error && error.code === 'unavailable';
            feedback.replaceChildren(fieldError(academyText(options.language, unavailable ? 'accessUnavailable' : 'accessInvalid')));
            submit.disabled = false;
            submit.removeAttribute('aria-busy');
            submit.textContent = academyText(options.language, 'accessSubmit');
            input.focus();
        });
    });
    content.append(form);
    return screen;
}
