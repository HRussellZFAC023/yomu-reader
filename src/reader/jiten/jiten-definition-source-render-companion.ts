import { yomuJitenCompanion } from '../companions/registry';
import type { renderJitenDefinitionSource as renderJitenDefinitionSourceImpl } from './jiten-definition-source-render';

// Core-side facade for the Yomu Jiten companion (ADR-0003 split); see
// jiten-public-vocabulary-companion.ts. The Jiten definition card's markup
// builder (meaning groups, readings, conjugations, examples, passive
// references) is a pure renderer reached only after a Jiten lookup resolves,
// so it ships with the companion. Without it the Jiten section renders nothing
// and the other definition sources stack normally.
export const renderJitenDefinitionSource: typeof renderJitenDefinitionSourceImpl = (...args) =>
    yomuJitenCompanion()?.renderJitenDefinitionSource?.(...args) ?? '';
