import type { JPDBCard, ReaderSettings } from '../app/types';
import type { YomitanMetaEntry } from '../dictionaries/yomitan';
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
 * The popup's pronunciation row: Japanese pitch accent. A stored card from
 * another language (kept from an earlier Yomu) has no pronunciation row.
 */
export function renderPronunciation(options: PronunciationRenderOptions): string {
    if (!options.settings.showPitchAccent || !cardUsesPitchAccentPronunciation(options.card)) return '';
    return renderPitchAccentPronunciation(options);
}

export function cardUsesPitchAccentPronunciation(card: JPDBCard): boolean {
    return !card.language || card.language === 'ja' || card.language.startsWith('ja-');
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
    // An unknown accent draws nothing: no row, no words standing in for it.
    return components ? pronunciationRow('pitch-accent', components) : '';
}

function pronunciationRow(kind: 'pitch-accent', content: string): string {
    return `<div class="jpdb-reader-pronunciation" data-pronunciation-kind="${kind}">${content}</div>`;
}
