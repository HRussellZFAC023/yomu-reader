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
    renderAnkiActionRow,
    renderAnkiExistingSection,
    renderAnkiNewCardPreview,
    pruneRedundantAnkiGlyphRepeats,
    renderAnkiRenderedCardStudyBody,
    renderReviewButtons,
    reviewButtonGrades,
});
