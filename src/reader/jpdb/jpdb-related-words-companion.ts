import { yomuJpdbCompanion } from '../companions/registry';
import type { renderedJpdbRelatedWords as renderedJpdbRelatedWordsImpl } from './jpdb-related-words';

// Core-side facade for the Yomu JPDB companion (ADR-0003 split); see
// jpdb-companion.ts. Related ("used in") words only exist inside a rendered
// JPDB definition card, so the collector ships with the companion that renders
// them. Without it there are no such words to collect and the enrichment pass
// sees an empty list.
export const renderedJpdbRelatedWords: typeof renderedJpdbRelatedWordsImpl = (...args) =>
    yomuJpdbCompanion()?.renderedJpdbRelatedWords?.(...args) ?? [];

export type { RenderedJpdbRelatedWord } from './jpdb-related-words';
