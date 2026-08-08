// fallow-ignore-file unused-file
// The split Vite build loads this facade through an alias rather than a static import.
import { decorationPolicyRuntimeApi } from './decoration-policy-runtime-bridge';

// The runtime @require executes before the split core. Capture its stable
// policy exports once so core call sites remain ordinary direct function calls.
const policy = decorationPolicyRuntimeApi();

export const {
    COMPACT_INTERACTIVE_CHROME_CONTROL_SELECTOR,
    COMPACT_PASSIVE_CHROME_SELECTOR,
    COMPACT_PASSIVE_INTERACTION_SELECTOR,
    CONSTRAINED_ROW_VERDICT_TTL_MS,
    PASSIVE_INTERACTION_BOUNDARY_SELECTOR,
    PASSIVE_INTERACTION_SELECTOR,
    UI_CLASS_RE,
    applyPassiveChromeMarks,
    boxStyleIsClipCapable,
    clampRowAllowsInFlowRestRuby,
    classifyDecoration,
    closestRubyFragileConstrainedRow,
    compactInteractiveChromeElement,
    compactLength,
    compactPassiveChromeElement,
    compactScanRubySuppression,
    composedAncestorElement,
    contentClipRowShowsRestReadings,
    cssPixels,
    decorationStateForWord,
    decorationSuppressesRuby,
    hasClippedTextConstraint,
    hasDefiniteCssSize,
    hasInlineControlShape,
    hasLineClamp,
    hasUiBox,
    interactivePassiveControl,
    isClipConstrainedRow,
    isCompactInteractiveChromeText,
    isCompactPassiveChromeElement,
    isCompactPassiveInteractionElement,
    isEllipsisTextRow,
    isExplicitControlLink,
    isLikelyProseElement,
    isLikelyProseLink,
    isNavigationChromeContext,
    isNonEditableListboxTrigger,
    isPassiveInteractionElement,
    isPositionedTextOverlay,
    isReadableProseContext,
    isYouTubeHost,
    linkHasControlMedia,
    linkHasControlShape,
    noteConstrainedRowLayoutSettled,
    resetDecorationPolicyCachesForTest,
    safeComputedStyle,
    safeElementMatches,
    selectorPairs,
    setReviewCardFrontPredicate,
    stampDecorationState,
    youtubeNativeChromeMustRemainPageOwned,
    youtubeShelfExpansionChromeMustRemainPageOwned,
} = policy;

export type DecorationState = ReturnType<typeof classifyDecoration>;
export type PassiveChromeMark = Parameters<typeof applyPassiveChromeMarks>[0][number];
export type CompactScanRubySuppression = ReturnType<typeof compactScanRubySuppression>;
