import {
    AnkiConnectClient,
    AnkiDuplicateNoteError,
    ankiLookupWithUnavailableDetails,
    captureActiveVideoFrame,
    isAnkiDuplicateNoteError,
} from '../anki/client';
import {
    buildYomuAnkiFields,
    buildYomuAnkiPreviewFields,
} from '../anki/field-render';
import { canUseMobileAnkiHandoff, mobileAnkiHandoffAppName } from '../anki/mobile-handoff';
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
