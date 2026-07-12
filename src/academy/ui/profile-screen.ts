import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { academyText } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS, type ProtagonistPortraitId } from '../assets';
import type { LearnerProfileSnapshot } from '../domain/learner-record';
import { copyButton, copyElement, element, screenFrame } from './dom';

const PORTRAITS = [
    ['quality-2', 'portraitCamera'],
    ['quality-3', 'portraitPlanner'],
    ['quality-4', 'portraitCards'],
    ['quality-5', 'portraitNotebook'],
] as const;

export interface ProfileScreenOptions {
    readonly language: AcademyLanguage;
    readonly profile?: LearnerProfileSnapshot | null;
    readonly onSubmit: (profile: LearnerProfileSnapshot) => void | Promise<void>;
}

export function renderProfileScreen(options: ProfileScreenOptions): HTMLElement {
    const { screen, panel, content } = screenFrame({
        language: options.language,
        className: 'academy-profile-screen',
        plate: 'classroom',
        title: 'academyName',
    });
    panel.classList.add('academy-panel-with-character');
    const rie = element('img', 'academy-character academy-character-rie');
    rie.src = ACADEMY_ASSETS.rie;
    rie.alt = options.language === 'ja' ? 'りえ先生' : 'Rie-sensei';
    panel.prepend(rie);
    const greeting = copyElement('p', 'academy-rie-greeting', options.language, 'rieGreeting');
    greeting.lang = 'ja';
    delete greeting.dataset.jpdbReaderSurfaceIgnore;
    greeting.dataset.yomuRuntimeSurface = 'opening-greeting';
    const greetingSupport = copyElement('p', 'academy-rie-greeting-support', options.language, 'rieGreetingSupport');
    const note = copyElement('p', 'academy-fiction-note', options.language, 'fictionNote');
    const form = element('form', 'academy-form academy-profile-form');
    form.id = 'academy-profile-form';
    const nameLabel = copyElement('label', 'academy-label', options.language, 'profileNameLabel');
    const name = element('input', 'academy-input');
    name.name = 'displayName';
    name.required = true;
    name.maxLength = 60;
    name.autocomplete = 'name';
    name.placeholder = academyText(options.language, 'profileNamePlaceholder');
    name.value = options.profile?.displayName ?? '';
    nameLabel.append(name);
    const reasonLabel = copyElement('label', 'academy-label', options.language, 'profileReasonLabel');
    const reason = element('textarea', 'academy-input academy-textarea');
    reason.name = 'learningReason';
    reason.required = true;
    reason.maxLength = 500;
    reason.placeholder = academyText(options.language, 'profileReasonPlaceholder');
    reason.value = options.profile?.learningReason ?? '';
    reasonLabel.append(reason);
    const portraits = element('fieldset', 'academy-portrait-fieldset');
    const legend = copyElement('legend', 'academy-label', options.language, 'profilePortraitLegend');
    portraits.append(legend);
    const grid = element('div', 'academy-portrait-grid');
    PORTRAITS.forEach(([id, labelKey], index) => {
        const label = element('label', 'academy-portrait-option');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'portrait';
        input.value = id;
        input.required = true;
        input.checked = options.profile?.portraitId === id || (!options.profile && index === 0);
        const image = element('img', 'academy-portrait-image');
        image.src = ACADEMY_ASSETS.portraits[id];
        image.alt = academyText(options.language, labelKey);
        const caption = copyElement('span', 'academy-portrait-caption', options.language, labelKey);
        label.append(input, image, caption);
        grid.append(label);
    });
    portraits.append(grid);
    const submit = copyButton(options.language, 'profileSubmit', 'academy-button academy-button-primary');
    submit.type = 'submit';
    submit.setAttribute('form', form.id);
    const actions = element('div', 'academy-profile-actions');
    actions.append(submit);
    form.append(nameLabel, reasonLabel, portraits);
    form.addEventListener('submit', event => {
        event.preventDefault();
        const selected = new FormData(form).get('portrait') as ProtagonistPortraitId | null;
        if (!selected) return;
        submit.disabled = true;
        void Promise.resolve(options.onSubmit({
            displayName: name.value.trim(),
            learningReason: reason.value.trim(),
            portraitId: selected,
        })).catch(() => { submit.disabled = false; });
    });
    content.replaceChildren(greeting, greetingSupport, note, form);
    panel.append(actions);
    return screen;
}
