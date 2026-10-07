import type { JPDBCard, ReaderSettings } from '../app/types';
import { uiText } from '../app/i18n';
import type { YomitanMetaEntry } from '../dictionaries/yomitan';
import { escapeHtml } from '../dom/index';
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
    if (components) return pronunciationRow('pitch-accent', components);
    if (options.loading) return '';
    const label = uiText(options.settings.interfaceLanguage, 'noExactPitch');
    return pronunciationRow(
        'pitch-accent',
        `<div class="jpdb-reader-pitch jpdb-reader-pitch-missing" data-pitch-status="no-exact-match" role="status" title="${escapeHtml(label)}">${escapeHtml(label)}</div>`,
    );
}

function pronunciationRow(kind: 'pitch-accent', content: string): string {
    return `<div class="jpdb-reader-pronunciation" data-pronunciation-kind="${kind}">${content}</div>`;
}
