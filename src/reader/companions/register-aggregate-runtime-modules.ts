import {
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
} from '../dom/token-text-rendering';
import {
    mergeStoredYomuSrsCards,
    mergeStoredYomuSrsDecks,
    normalizeStoredYomuSrsDeck,
    removeAcademyVocabularyProvenance,
    upsertAcademyVocabulary,
} from '../srs/local-yomu-deck';
import {
    applyInterfaceLocaleToRoot,
    formatIsolated,
    isRtlInterface,
} from '../locales/direction';
import { resolveInterfaceLocale } from '../locales/resolve';
import {
    addViewportChangeListeners,
    createHandleDragController,
    firstChangedTouch,
    getContainedClosest,
} from '../popup/handle-drag';
import * as deinflection from '../lookup/deinflect';
import * as settings from '../settings';
import { registerAggregateRuntimeModules } from './aggregate-runtime-modules';

registerAggregateRuntimeModules({
    deinflection,
    settings,
    tokenTextRendering: {
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
    },
    localYomuDeck: {
        mergeStoredYomuSrsCards,
        mergeStoredYomuSrsDecks,
        normalizeStoredYomuSrsDeck,
        removeAcademyVocabularyProvenance,
        upsertAcademyVocabulary,
    },
    interfaceDirection: {
        applyInterfaceLocaleToRoot,
        formatIsolated,
        isRtlInterface,
    },
    interfaceLocaleResolution: {
        resolveInterfaceLocale,
    },
    handleDrag: {
        addViewportChangeListeners,
        createHandleDragController,
        firstChangedTouch,
        getContainedClosest,
    },
});
