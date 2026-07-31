import { formatUiText, resolveUiLanguage, uiText } from '../app/i18n';
import type { InterfaceLanguage } from '../app/types';
import { escapeHtml } from '../dom';
import { activeLearningTarget } from '../languages';
import { renderStudyEmpty } from './section-render';

export type GrammarAvailabilityState = 'empty' | 'reference-only' | 'unsupported' | 'unavailable';

export interface GrammarAvailability {
    readonly state: GrammarAvailabilityState;
    readonly message: string;
    readonly referenceUrl: string;
}

/**
 * A stable, visible answer for every detector outcome that has no rule rows.
 *
 * This deliberately reads the active target's Grammar Adapter. The Study UI
 * never guesses support from a language tag and never turns an empty result
 * into a disappearing card.
 */
export function currentGrammarAvailability(
    language: InterfaceLanguage,
    failed = false,
): GrammarAvailability {
    const grammar = activeLearningTarget().grammar;
    if (failed) {
        return {
            state: 'unavailable',
            message: uiText(language, 'grammarCheckUnavailable'),
            referenceUrl: grammar.referenceUrl,
        };
    }
    const state: GrammarAvailabilityState = grammar.rules.length
        ? 'empty'
        : grammar.referenceUrl
            ? 'reference-only'
            : 'unsupported';
    return {
        state,
        message: formatUiText(
            language,
            grammar.rules.length
                ? 'grammarNoLocalMatch'
                : state === 'reference-only'
                    ? 'grammarReferenceOnly'
                    : 'grammarDetectionPending',
            { language: targetLanguageName(activeLearningTarget().language, language) },
        ),
        referenceUrl: grammar.referenceUrl,
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

function targetLanguageName(target: string, interfaceLanguage: InterfaceLanguage): string {
    try {
        return new Intl.DisplayNames([resolveUiLanguage(interfaceLanguage)], { type: 'language' }).of(target) ?? target;
    } catch {
        return target;
    }
}
