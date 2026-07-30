import type { LearningTargetModule } from '../languages/types';
import {
    convertRomajiToKana,
    normalizeJapaneseStudyAnswer,
} from './japanese-input';

/** Apply the input method declared by the active learning target. */
export function normalizeLearningTargetInput(target: LearningTargetModule, value: string): string {
    return target.typing.inputNormalizer === 'romaji-kana'
        ? convertRomajiToKana(value)
        : value;
}

/** Canonicalize a typed answer through the active target's comparison rule. */
export function normalizeLearningTargetAnswer(target: LearningTargetModule, value: string): string {
    return target.typing.answerNormalizer === 'japanese-kana'
        ? normalizeJapaneseStudyAnswer(value)
        : target.normalizeText(value).toLocaleLowerCase(target.language);
}
