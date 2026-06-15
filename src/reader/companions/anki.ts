import {
    AnkiConnectClient,
    AnkiDuplicateNoteError,
    ankiLookupWithUnavailableDetails,
    buildYomuAnkiFields,
    buildYomuAnkiPreviewFields,
    canUseMobileAnkiHandoff,
    captureActiveVideoFrame,
    isAnkiDuplicateNoteError,
    mobileAnkiHandoffAppName,
} from '../anki/client';
import { resolveAnkiWordAudio } from '../anki/audio';
import {
    pruneRedundantAnkiGlyphRepeats,
    renderAnkiActionRow,
    renderAnkiExistingSection,
    renderAnkiNewCardPreview,
    renderAnkiRenderedCardStudyBody,
    renderReviewButtons,
    reviewButtonGrades,
} from '../anki/render-impl';
import { registerYomuCompanion } from './registry';

registerYomuCompanion('anki', {
    AnkiConnectClient,
    AnkiDuplicateNoteError,
    ankiLookupWithUnavailableDetails,
    buildYomuAnkiFields,
    buildYomuAnkiPreviewFields,
    canUseMobileAnkiHandoff,
    captureActiveVideoFrame,
    isAnkiDuplicateNoteError,
    mobileAnkiHandoffAppName,
    resolveAnkiWordAudio,
    renderAnkiActionRow,
    renderAnkiExistingSection,
    renderAnkiNewCardPreview,
    pruneRedundantAnkiGlyphRepeats,
    renderAnkiRenderedCardStudyBody,
    renderReviewButtons,
    reviewButtonGrades,
});
