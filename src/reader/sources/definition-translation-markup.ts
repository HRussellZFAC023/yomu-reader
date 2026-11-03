import { createPrivateElementStateSlot } from '../dom/private-element-state';
import { dictionaryDefinitionLanguage } from '../dictionaries/definition-language';

interface DefinitionTranslationText {
    readonly payload: string;
    readonly sourceId: string;
    readonly sourceLanguage: string;
}
type BoundDefinitionTranslationText = DefinitionTranslationText & { readonly isCurrent: () => boolean };
const slot = createPrivateElementStateSlot<BoundDefinitionTranslationText>('definition-translation', value => Object.freeze({ ...value }), { replayable: true });

/** Explicit semantic payload keeps headings, readings, account data and controls off the wire. */
export function definitionTranslationAttributes(payload: string, sourceId: string, sourceLanguage = dictionaryDefinitionLanguage(sourceId)): string {
    return `data-definition-translation-text${slot.attributes({ payload, sourceId, sourceLanguage, isCurrent: () => true })}`;
}

export function bindDefinitionTranslation(element: HTMLElement, value: DefinitionTranslationText, isCurrent: () => boolean = () => true): void {
    slot.bind(element, { ...value, isCurrent });
    element.dataset.definitionTranslationText = '';
}

export const readDefinitionTranslation = slot.read;
