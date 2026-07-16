import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { academyText } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS, type ProtagonistPortraitId } from '../assets';
import type { LearnerProfileSnapshot } from '../domain/learner-record';
import { createAcademyVnStage, type AcademyVnCastMember, type AcademyVnLine } from './vn-stage';

const PORTRAITS = [
    ['quality-2', 'portraitCamera'],
    ['quality-3', 'portraitPlanner'],
    ['quality-4', 'portraitCards'],
    ['quality-5', 'portraitNotebook'],
] as const;

type ProfileStep = 'name' | 'reason' | 'portrait';

export interface ProfileScreenOptions {
    readonly language: AcademyLanguage;
    readonly profile?: LearnerProfileSnapshot | null;
    readonly onSubmit: (profile: LearnerProfileSnapshot) => void | Promise<void>;
    readonly onBack?: () => void;
}

/** The profile is a short Rie conversation; the inputs are scene props, not a form. */
export function renderProfileScreen(options: ProfileScreenOptions): HTMLElement {
    const lifecycle = new AbortController();
    const initialPortrait = portraitId(options.profile?.portraitId) ?? PORTRAITS[0][0];
    const stage = createAcademyVnStage({
        label: academyText(options.language, 'academyName'),
        uiLanguage: options.language,
    });
    stage.element.classList.add('academy-profile-screen');
    stage.element.dataset.academyScreen = 'profile';
    stage.element.dataset.academyRoute = 'profile';
    stage.setDirection({
        plate: {
            id: 'classroom-profile',
            wide: ACADEMY_ASSETS.locations.classroom.wide,
            mobile: ACADEMY_ASSETS.locations.classroom.mobile,
            label: academyText(options.language, 'academyName'),
        },
        transition: 'dissolve',
        focus: { x: 52, y: 46 },
    });

    const name = document.createElement('input');
    name.className = 'academy-input';
    name.name = 'displayName';
    name.required = true;
    name.maxLength = 60;
    name.autocomplete = 'name';
    name.setAttribute('aria-label', academyText(options.language, 'profileNameLabel'));
    name.placeholder = academyText(options.language, 'profileNamePlaceholder');
    name.value = options.profile?.displayName ?? '';

    const reason = document.createElement('textarea');
    reason.className = 'academy-input academy-textarea';
    reason.name = 'learningReason';
    reason.required = true;
    reason.maxLength = 500;
    reason.setAttribute('aria-label', academyText(options.language, 'profileReasonLabel'));
    reason.placeholder = academyText(options.language, 'profileReasonPlaceholder');
    reason.value = options.profile?.learningReason ?? '';

    let selectedPortrait = initialPortrait;
    let currentStep: ProfileStep = 'name';
    const nameStep = entry('name', options.language, academyText(options.language, 'profileNameLabel'), name);
    const reasonStep = entry('reason', options.language, academyText(options.language, 'profileReasonLabel'), reason);
    const portraitStep = portraitEntry(options.language, selectedPortrait, portraitId => {
        selectedPortrait = portraitId;
        syncCast();
    });

    const learnerName = (): string => name.value.trim() || academyText(options.language, 'profilePlayerFallback');
    const rieName = options.language === 'ja' ? 'りえ先生' : 'Rie-sensei';
    const cast = (): readonly AcademyVnCastMember[] => {
        const members: AcademyVnCastMember[] = [{
            characterId: 'rie',
            displayName: rieName,
            alt: options.language === 'ja' ? '教室にいるりえ先生' : 'Rie-sensei in the classroom',
            position: 'left',
            expression: 'neutral',
            expressions: { neutral: { still: ACADEMY_ASSETS.rie } },
        }];
        if (currentStep !== 'portrait') return members;
        members.push({
            characterId: 'learner',
            displayName: learnerName(),
            alt: academyText(options.language, 'profilePlayerAlt'),
            position: 'right',
            expression: 'neutral',
            expressions: { neutral: { still: ACADEMY_ASSETS.portraits[selectedPortrait] } },
        });
        return members;
    };
    const syncCast = (): void => stage.setCast(cast());
    name.addEventListener('input', syncCast, { signal: lifecycle.signal });

    const line = (step: ProfileStep): AcademyVnLine => {
        const player = learnerName();
        const dialogue = step === 'name'
            ? { japanese: academyText(options.language, 'profileNameDialogue'), translation: academyText(options.language, 'profileNameDialogueSupport') }
            : step === 'reason'
                ? { japanese: interpolate(academyText(options.language, 'profileReasonDialogue'), player), translation: interpolate(academyText(options.language, 'profileReasonDialogueSupport'), player) }
                : { japanese: academyText(options.language, 'profilePortraitDialogue'), translation: academyText(options.language, 'profilePortraitDialogueSupport') };
        return {
            id: `profile:${step}`,
            speakerId: 'rie',
            speakerName: rieName,
            japanese: dialogue.japanese,
            reading: {
                showLabel: academyText(options.language, 'readingShow'),
                hideLabel: academyText(options.language, 'readingHide'),
            },
            translation: dialogue.translation,
            translationEarned: true,
        };
    };

    const showStep = (next: ProfileStep): void => {
        currentStep = next;
        stage.element.dataset.profileStep = next;
        syncCast();
        stage.setLine(line(next));
        stage.setObject(next === 'portrait' ? { element: portraitStep } : null);
        stage.setBack(next === 'name'
            ? (options.onBack ? { onBack: options.onBack } : null)
            : { onBack: () => showStep(next === 'portrait' ? 'reason' : 'name') });
        stage.setAction({ element: actionContent(next) });
        if (next === 'name') name.focus();
        else if (next === 'reason') reason.focus();
        else portraitStep.querySelector<HTMLInputElement>('input:checked')?.focus();
    };
    const actionFor = (current: ProfileStep): HTMLButtonElement => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'academy-vn-primary-action academy-profile-advance';
        button.textContent = current === 'portrait'
            ? academyText(options.language, 'profileSubmit')
            : academyText(options.language, 'continue');
        button.setAttribute('aria-label', button.textContent);
        button.addEventListener('click', () => {
            if (current === 'name') {
                if (name.reportValidity()) showStep('reason');
                return;
            }
            if (current === 'reason') {
                if (reason.reportValidity()) showStep('portrait');
                return;
            }
            button.disabled = true;
            void Promise.resolve(options.onSubmit({
                displayName: name.value.trim(),
                learningReason: reason.value.trim(),
                portraitId: selectedPortrait,
            })).catch(() => { button.disabled = false; });
        }, { signal: lifecycle.signal });
        return button;
    };
    const actionContent = (step: ProfileStep): HTMLElement => {
        const action = actionFor(step);
        if (step === 'portrait') return action;
        const flow = document.createElement('div');
        flow.className = 'academy-profile-inline-action';
        flow.append(step === 'name' ? nameStep : reasonStep, action);
        return flow;
    };

    stage.element.addEventListener('academy:dispose', () => lifecycle.abort(), { once: true });
    showStep('name');
    return stage.element;
}

function entry(step: ProfileStep, language: AcademyLanguage, labelText: string, control: HTMLElement): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-profile-vn-entry';
    section.dataset.profileStep = step;
    const label = document.createElement('label');
    label.className = 'academy-label';
    label.lang = language;
    label.textContent = labelText;
    label.append(control);
    section.append(label);
    return section;
}

function portraitEntry(
    language: AcademyLanguage,
    selected: ProtagonistPortraitId,
    onSelect: (portraitId: ProtagonistPortraitId) => void,
): HTMLElement {
    const section = document.createElement('section');
    section.className = 'academy-profile-vn-entry';
    section.dataset.profileStep = 'portrait';
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'academy-portrait-fieldset';
    fieldset.setAttribute('aria-label', academyText(language, 'profilePortraitLegend'));
    const legend = document.createElement('legend');
    legend.className = 'academy-label';
    legend.lang = language;
    legend.textContent = academyText(language, 'profilePortraitLegend');
    const grid = document.createElement('div');
    grid.className = 'academy-portrait-grid';
    for (const [id, labelKey] of PORTRAITS) {
        const label = document.createElement('label');
        label.className = 'academy-portrait-option';
        label.dataset.jpdbReaderSurfaceIgnore = '';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'portrait';
        input.value = id;
        input.checked = id === selected;
        input.setAttribute('aria-label', academyText(language, labelKey));
        input.addEventListener('change', () => { if (input.checked) onSelect(id); });
        const image = document.createElement('img');
        image.className = 'academy-portrait-image';
        image.src = ACADEMY_ASSETS.portraits[id];
        image.alt = '';
        label.append(input, image);
        grid.append(label);
    }
    fieldset.append(legend, grid);
    section.append(fieldset);
    return section;
}

function interpolate(template: string, name: string): string {
    return template.replace('{name}', name);
}

function portraitId(value: string | undefined): ProtagonistPortraitId | undefined {
    return PORTRAITS.some(([id]) => id === value) ? value as ProtagonistPortraitId : undefined;
}
