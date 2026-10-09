import { uiText } from '../app/i18n';
import type { InterfaceLanguage } from '../app/types';
import { escapeHtml } from '../dom';
import { activeLearningTarget } from '../languages';
import { renderStudyEmpty } from './section-render';

export type GrammarAvailabilityState = 'empty' | 'unavailable';

export interface GrammarAvailability {
    readonly state: GrammarAvailabilityState;
    readonly message: string;
    readonly referenceUrl: string;
}

/** A stable, visible answer when the Japanese grammar detector finds no rule rows. */
export function currentGrammarAvailability(
    language: InterfaceLanguage,
    failed = false,
): GrammarAvailability {
    return {
        state: failed ? 'unavailable' : 'empty',
        message: uiText(language, failed ? 'grammarCheckUnavailable' : 'grammarNoLocalMatch'),
        referenceUrl: activeLearningTarget().grammar.referenceUrl,
    };
}

export function renderGrammarAvailability(availability: GrammarAvailability, language: InterfaceLanguage): string {
    const reference = availability.referenceUrl
        ? `<a class="jpdb-reader-study-guide" href="${escapeHtml(availability.referenceUrl)}" target="_blank" rel="noopener">${escapeHtml(uiText(language, 'grammarReference'))}</a>`
        : '';
    return `<div class="jpdb-reader-grammar-availability" data-grammar-availability="${availability.state}">
        ${renderStudyEmpty(availability.message)}
        ${reference}
    </div>`;
}
