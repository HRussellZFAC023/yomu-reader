import type { JPDBCard, ReaderSettings } from '../app/types';
import { uiText } from '../app/i18n';
import type { YomitanMetaEntry } from '../dictionaries/yomitan';
import { escapeHtml } from '../dom/index';
import { extractIpaPronunciations } from '../lookup/ipa-pronunciation';
import { defaultLearningTargetModule, learningTargetModuleFor } from '../languages/target-runtime';
import {
    alignedExpressionComponentPitches,
    renderExpressionComponentPitches,
    renderPitch,
    type ExpressionComponentLookup,
    type ExpressionComponentPitch,
} from './pitch';

export interface PronunciationRenderOptions {
    card: JPDBCard;
    settings: ReaderSettings;
    metaEntries?: readonly YomitanMetaEntry[];
    expressionComponents?: readonly ExpressionComponentLookup[];
    componentPitches?: readonly ExpressionComponentPitch[];
    loading?: boolean;
    dictionaryLabel: (name: string) => string;
}

/**
 * One pronunciation surface with target-owned semantics. Japanese pitch accent
 * and dictionary IPA are variants of the same row, so a non-Japanese card can
 * never fall through to a Japanese "pitch unavailable" status.
 */
export function renderPronunciation(options: PronunciationRenderOptions): string {
    if (!options.settings.showPitchAccent) return '';
    const target = learningTargetModuleFor(options.card.language ?? 'ja')
        ?? defaultLearningTargetModule();
    switch (target.featureSemantics.pronunciation) {
        case 'pitch-accent':
            return renderPitchAccentPronunciation(options);
        case 'ipa':
            return renderIpaPronunciation(options);
        default:
            return '';
    }
}

export function cardUsesPitchAccentPronunciation(card: JPDBCard): boolean {
    const target = learningTargetModuleFor(card.language ?? 'ja')
        ?? defaultLearningTargetModule();
    return target.featureSemantics.pronunciation === 'pitch-accent';
}

function renderPitchAccentPronunciation(options: PronunciationRenderOptions): string {
    const whole = renderPitch(options.card, [...(options.metaEntries ?? [])]);
    if (whole) return pronunciationRow('pitch-accent', whole);

    const alignedComponents = options.loading ? [] : alignedExpressionComponentPitches(
        options.card,
        [...(options.expressionComponents ?? [])],
        [...(options.componentPitches ?? [])],
    );
    const components = renderExpressionComponentPitches(alignedComponents);
    if (components) return pronunciationRow('pitch-accent', components);
    if (options.loading) return '';
    const label = uiText(options.settings.interfaceLanguage, 'noExactPitch');
    return pronunciationRow(
        'pitch-accent',
        `<div class="jpdb-reader-pitch jpdb-reader-pitch-missing" data-pitch-status="no-exact-match" role="status" title="${escapeHtml(label)}">${escapeHtml(label)}</div>`,
    );
}

function renderIpaPronunciation(options: PronunciationRenderOptions): string {
    const disabled = new Set(
        options.settings.dictionaryPreferences
            .filter(preference => !preference.enabled)
            .map(preference => preference.name),
    );
    const pronunciations = extractIpaPronunciations(options.metaEntries ?? [], {
        expression: options.card.spelling,
        reading: options.card.reading,
    }).filter(pronunciation => !disabled.has(pronunciation.dictionary));
    if (!pronunciations.length) return '';

    const variants = pronunciations.map(({ ipa, dictionary }) => {
        const source = options.dictionaryLabel(dictionary) || dictionary;
        const accessibleLabel = `IPA ${ipa}. ${source}`;
        return `<span class="jpdb-reader-pronunciation-variant" data-dictionary="${escapeHtml(dictionary)}" data-pronunciation-source="local" title="${escapeHtml(accessibleLabel)}" aria-label="${escapeHtml(accessibleLabel)}"><span aria-hidden="true">IPA </span>${escapeHtml(ipa)}</span>`;
    }).join('');
    const label = uiText(options.settings.interfaceLanguage, 'pronunciation');
    return `<div class="jpdb-reader-pronunciation jpdb-reader-pronunciation-ipa" data-pronunciation-kind="ipa" role="group" aria-label="${escapeHtml(label)}">${variants}</div>`;
}

function pronunciationRow(kind: 'pitch-accent', content: string): string {
    return `<div class="jpdb-reader-pronunciation" data-pronunciation-kind="${kind}">${content}</div>`;
}
