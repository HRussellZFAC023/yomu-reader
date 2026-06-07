import { cardKey } from '../cards/utils';
import type { JPDBCard, JPDBToken } from '../app/types';

const LOW_VALUE_EXAMPLE_PART_RE = /\b(?:particle|conjunction|auxiliary)\b/i;
const KANA_ONLY_RE = /^[\u3040-\u30ffー]+$/u;

export function exampleSentenceLookupTokens(tokens: JPDBToken[], targetCard?: JPDBCard): JPDBToken[] {
    return tokens.filter(token => shouldKeepExampleSentenceToken(token, targetCard));
}

function shouldKeepExampleSentenceToken(token: JPDBToken, targetCard?: JPDBCard): boolean {
    if (targetCard && cardKey(token.card) === cardKey(targetCard)) return true;
    return !isLowValueExampleSentenceToken(token);
}

function isLowValueExampleSentenceToken(token: JPDBToken): boolean {
    const surfaceLength = token.end - token.start;
    if (surfaceLength > 2) return false;
    const spelling = token.card.spelling.trim();
    if (!spelling || !KANA_ONLY_RE.test(spelling)) return false;
    return LOW_VALUE_EXAMPLE_PART_RE.test(token.card.partOfSpeech.join(' '));
}
