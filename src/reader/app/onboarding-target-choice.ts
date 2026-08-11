import { uiText } from './i18n';
import type { InterfaceLanguage, ReaderSettings } from './types';
import {
    activateLanguageProfileForOutputLanguage,
    activeLanguageProfile,
    canonicalTagForLearningTarget,
    canonicalTagForSlice1Language,
    learningTargetRosterIdForTag,
    type LearningTargetRosterId,
} from '../languages';
import type { LearnerLanguageId } from '../locales';
import { syncLanguageFamilyDom } from '../settings/language-gating';
import {
    isSelectableStudyTarget,
    populateStudyTargetSelect,
} from './study-target-picker';

/**
 * Owns the first-run target chooser's DOM and validity policy. The onboarding
 * controller supplies orchestration callbacks, but it never has to coordinate
 * a select, error node, placeholder, and target-family attributes separately.
 */
export class OnboardingTargetChoice {
    readonly element: HTMLLabelElement;
    readonly select: HTMLSelectElement;

    private readonly error: HTMLElement;

    constructor(
        settings: ReaderSettings,
        language: InterfaceLanguage,
        labelText: string,
        requiredText: string,
    ) {
        this.element = document.createElement('label');
        this.element.className = 'jpdb-reader-onboarding-language jpdb-reader-onboarding-target-language';

        const label = document.createElement('span');
        label.dataset.onboardingMultilingualCopy = 'targetLanguage';
        label.textContent = labelText;

        this.select = document.createElement('select');
        this.select.name = 'targetLanguage';
        this.select.setAttribute('autocomplete', 'language');
        this.select.required = true;
        this.select.setAttribute('aria-required', 'true');
        populateTargetSelect(this.select, language, initialTarget(settings));

        this.error = document.createElement('span');
        this.error.className = 'jpdb-reader-onboarding-target-required';
        this.error.id = 'jpdb-reader-onboarding-target-required';
        this.error.setAttribute('role', 'status');
        this.error.textContent = requiredText;
        this.select.setAttribute('aria-describedby', this.error.id);
        this.element.append(label, this.select, this.error);
    }

    selectedTarget(): LearningTargetRosterId | null {
        const selected = learningTargetRosterIdForTag(this.select.value);
        return selected && isSelectableStudyTarget(selected) ? selected : null;
    }

    localize(language: InterfaceLanguage): void {
        populateTargetSelect(this.select, language, this.selectedTarget());
    }

    syncAvailability(
        panel: HTMLElement | undefined,
        targetOwnedOptions: HTMLFieldSetElement | undefined,
        requiredText: string,
        selectedTarget = this.selectedTarget(),
    ): void {
        const hasTarget = selectedTarget !== null;
        this.select.setCustomValidity(hasTarget ? '' : requiredText);
        this.error.hidden = hasTarget;
        this.error.textContent = requiredText;
        if (targetOwnedOptions) {
            targetOwnedOptions.hidden = !hasTarget;
            targetOwnedOptions.disabled = !hasTarget;
        }
        panel?.querySelectorAll<HTMLButtonElement>('[data-onboarding-action]').forEach(action => {
            const requiresTarget = action.dataset.onboardingAction !== 'close';
            action.disabled = requiresTarget && !hasTarget;
            action.setAttribute('aria-disabled', String(requiresTarget && !hasTarget));
        });
    }

    syncLanguageFamily(panel: HTMLElement, selectedTarget = this.selectedTarget()): void {
        const selected = selectedTarget ? this.select.selectedOptions[0] : undefined;
        if (!selected) {
            this.select.removeAttribute('lang');
            this.select.removeAttribute('dir');
            syncLanguageFamilyDom(panel, '');
            return;
        }
        this.select.lang = selected.lang;
        this.select.dir = selected.dir;
        syncLanguageFamilyDom(panel, selected.value);
    }

    reportValidity(): boolean {
        return this.select.reportValidity();
    }
}

export function updateOnboardingLanguageProfile(
    settings: ReaderSettings,
    learnerLanguage: LearnerLanguageId,
    targetLanguage: LearningTargetRosterId,
    interfaceLanguage: InterfaceLanguage,
): Pick<ReaderSettings, 'languageProfiles' | 'activeLanguageProfileId'> {
    const learnerLanguageTag = canonicalTagForSlice1Language(learnerLanguage);
    const targetLanguageTag = canonicalTagForLearningTarget(targetLanguage);
    const activated = activateLanguageProfileForOutputLanguage(
        settings.languageProfiles,
        settings.activeLanguageProfileId,
        learnerLanguageTag,
        {
            targetLanguage: targetLanguageTag,
            uiLocale: interfaceLanguage,
            parserProvider: settings.parserProvider,
        },
    );
    return {
        activeLanguageProfileId: activated.activeProfileId,
        languageProfiles: activated.profiles.map(profile => profile.id === activated.activeProfileId
            ? {
                ...profile,
                outputLanguage: learnerLanguageTag,
                learnerLanguage: learnerLanguageTag,
                targetLanguage: targetLanguageTag,
                uiLocale: interfaceLanguage,
                parserProvider: settings.parserProvider,
            }
            : profile),
    };
}

function initialTarget(settings: ReaderSettings): LearningTargetRosterId | null {
    if (!settings.learningTargetChosen) return null;
    const profile = activeLanguageProfile(settings.languageProfiles, settings.activeLanguageProfileId);
    return learningTargetRosterIdForTag(profile?.targetLanguage) ?? 'ja';
}

function populateTargetSelect(
    select: HTMLSelectElement,
    language: InterfaceLanguage,
    selected: LearningTargetRosterId | null,
): void {
    populateStudyTargetSelect(select, language, selected ?? 'ja');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = uiText(language, 'onboardingChooseTarget');
    placeholder.disabled = true;
    placeholder.selected = selected === null;
    select.prepend(placeholder);
    if (selected === null) select.value = '';
}
