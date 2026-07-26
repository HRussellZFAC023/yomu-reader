import { yomuKanjiStudyCompanion } from '../companions/registry';
import type {
    jitenKanjiOriginFactLabels as jitenKanjiOriginFactLabelsImpl,
    renderJitenKanjiInfo as renderJitenKanjiInfoImpl,
    renderJitenKanjiKeywordLine as renderJitenKanjiKeywordLineImpl,
} from './jiten-kanji-info-render';

// Core-side facade for the Yomu Kanji/Study companion (ADR-0003 split). Jiten
// kanji panels — fact rows, keyword chips, paged word lists — are kanji study
// material rendered inside an already-open popover, so their markup builders
// ship with the rest of the kanji surface. Without the companion the kanji
// section renders nothing rather than a broken shell.
export const renderJitenKanjiInfo: typeof renderJitenKanjiInfoImpl = (...args) =>
    yomuKanjiStudyCompanion()?.renderJitenKanjiInfo?.(...args) ?? '';

export const renderJitenKanjiKeywordLine: typeof renderJitenKanjiKeywordLineImpl = (...args) =>
    yomuKanjiStudyCompanion()?.renderJitenKanjiKeywordLine?.(...args) ?? '';

export const jitenKanjiOriginFactLabels: typeof jitenKanjiOriginFactLabelsImpl = (...args) =>
    yomuKanjiStudyCompanion()?.jitenKanjiOriginFactLabels?.(...args) ?? [];
