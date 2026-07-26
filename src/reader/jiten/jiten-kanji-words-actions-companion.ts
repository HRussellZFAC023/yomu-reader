import { yomuKanjiStudyCompanion } from '../companions/registry';
import type {
    filterJitenKanjiWords as filterJitenKanjiWordsImpl,
    JitenKanjiWordsActionContext as JitenKanjiWordsActionContextImpl,
    loadMoreJitenKanjiWords as loadMoreJitenKanjiWordsImpl,
} from './jiten-kanji-words-actions';

export type JitenKanjiWordsActionContext = JitenKanjiWordsActionContextImpl;

// Core-side facade for the Yomu Kanji/Study companion (ADR-0003 split); see
// jiten-kanji-info-render-companion.ts. These handlers only fire from buttons
// inside markup the companion rendered, so without it there is nothing to act
// on and the no-op is the correct behaviour.
export const filterJitenKanjiWords: typeof filterJitenKanjiWordsImpl = async (...args) => {
    await yomuKanjiStudyCompanion()?.filterJitenKanjiWords?.(...args);
};

export const loadMoreJitenKanjiWords: typeof loadMoreJitenKanjiWordsImpl = async (...args) => {
    await yomuKanjiStudyCompanion()?.loadMoreJitenKanjiWords?.(...args);
};
