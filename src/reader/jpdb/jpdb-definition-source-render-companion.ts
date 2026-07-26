import { yomuJpdbCompanion } from '../companions/registry';
import type { renderJpdbDefinitionSource as renderJpdbDefinitionSourceImpl } from './jpdb-definition-source-render';

// Core-side facade for the Yomu JPDB companion (ADR-0003 split); see
// jpdb-companion.ts. The JPDB definition card's markup builder is only reached
// once a JPDB lookup has produced data, which already requires the companion,
// so it ships alongside it. Without the companion the JPDB section renders
// nothing and the remaining definition sources stack normally.
export const renderJpdbDefinitionSource: typeof renderJpdbDefinitionSourceImpl = (...args) =>
    yomuJpdbCompanion()?.renderJpdbDefinitionSource?.(...args) ?? '';
