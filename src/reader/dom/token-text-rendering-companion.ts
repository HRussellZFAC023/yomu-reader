import { aggregateRuntimeModules } from '../companions/aggregate-runtime-modules';
import type { JPDBToken } from '../app/types';
import { kanjiNavigationForElement } from './token-kanji-navigation';
import type * as TokenTextRenderingModule from './token-text-rendering';

// The required aggregate runtime executes before the split core. Capture its
// stable implementation once so hot token rendering keeps direct calls rather
// than crossing the Module seam for every word.
const tokenTextRendering = aggregateRuntimeModules().tokenTextRendering;

export const {
    PITCH_CLASSES,
    effectiveTokenRubies,
    inferredInflectedSurfaceRubies,
    isParticleCard,
    localRubyRange,
    miningInsightTokenKey,
    miningInsightTokenKeys,
    nonOverlappingTokens,
    readerCardId,
    readerCardSource,
    readerReadingIndex,
    readerWordClassName,
    renderHighlightedTextHtml,
    renderKanjiNavigationText,
    renderRuby,
    renderTokenReadings,
    shouldHideFuriganaForCardState,
    shouldRenderRuby,
    tokenPitchClass,
} = tokenTextRendering;

export function renderDetachedReadings(
    surface: string,
    token: JPDBToken,
    kanjiNavigation?: TokenTextRenderingModule.KanjiNavigationRenderOptions,
    preserveTokenRubies = false,
): string {
    return renderTokenReadings(
        surface,
        token,
        kanjiNavigation,
        preserveTokenRubies,
        'detached',
    );
}

export { kanjiNavigationForElement };

export type KanjiNavigationRenderOptions = TokenTextRenderingModule.KanjiNavigationRenderOptions;
export type TokenRenderOptions = TokenTextRenderingModule.TokenRenderOptions;
