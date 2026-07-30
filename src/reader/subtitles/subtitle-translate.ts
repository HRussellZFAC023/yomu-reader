import { Logger } from '../app/logger';
import { translateText } from '../translation/google';
import type { SubtitleCue } from './subtitle-cues';

const TRANSLATION_BATCH_SIZE = 80;
const TRANSLATION_BATCH_ENCODED_CHAR_BUDGET = 6000;
const TRANSLATION_TIMEOUT_MS = 8000;
const TRANSLATION_SEPARATOR = '\n';

const log = Logger.scope('SubtitleTranslate');

interface TranslateSubtitleCueOptions {
    batchSize?: number;
    encodedCharBudget?: number;
}

export async function translateSubtitleCues(
    cues: SubtitleCue[],
    sourceLanguage: string,
    outputLanguage: string,
    options: TranslateSubtitleCueOptions = {},
): Promise<SubtitleCue[]> {
    if (!cues.length) return [];
    const texts = cues.map(cue => cue.text.trim());
    const batches = batchTexts(
        texts,
        options.batchSize ?? TRANSLATION_BATCH_SIZE,
        options.encodedCharBudget ?? TRANSLATION_BATCH_ENCODED_CHAR_BUDGET,
    );
    const translated: string[] = [];
    for (let index = 0; index < batches.length; index += 1) {
        if (index > 0) await waitForTranslationTurn();
        const batch = batches[index] ?? [];
        const results = await translateBatch(batch, sourceLanguage, outputLanguage);
        translated.push(...results);
    }
    return cues.map((cue, index) => ({
        ...cue,
        text: translated[index] || cue.text,
    }));
}

function batchTexts(texts: string[], size: number, encodedCharBudget: number): string[][] {
    const batches: string[][] = [];
    let current: string[] = [];
    let currentEncodedLength = 0;
    for (const text of texts) {
        const separatorLength = current.length ? encodeURIComponent(TRANSLATION_SEPARATOR).length : 0;
        const encodedLength = encodeURIComponent(text).length;
        if (current.length
            && (current.length >= size || currentEncodedLength + separatorLength + encodedLength > encodedCharBudget)) {
            batches.push(current);
            current = [];
            currentEncodedLength = 0;
        }
        current.push(text);
        currentEncodedLength += (current.length > 1 ? encodeURIComponent(TRANSLATION_SEPARATOR).length : 0) + encodedLength;
    }
    if (current.length) batches.push(current);
    return batches;
}

async function translateBatch(texts: string[], sourceLanguage: string, outputLanguage: string): Promise<string[]> {
    const joined = texts.join(TRANSLATION_SEPARATOR);
    const done = log.time('Translate subtitle batch', { count: texts.length });
    try {
        const result = await translateText(joined, {
            sourceLanguage,
            outputLanguage,
            timeoutMs: TRANSLATION_TIMEOUT_MS,
        });
        const lines = result.split(TRANSLATION_SEPARATOR);
        log.info('Subtitle batch translated', { count: texts.length, resultCount: lines.length });
        return padTranslationResults(lines, texts);
    } catch (error) {
        log.warn('Subtitle batch translation failed', { count: texts.length, error });
        return texts;
    } finally {
        done();
    }
}

function waitForTranslationTurn(): Promise<void> {
    return new Promise(resolve => globalThis.setTimeout(resolve, 0));
}

function padTranslationResults(translated: string[], originals: string[]): string[] {
    const result = translated.map(text => text.trim());
    while (result.length < originals.length) result.push(originals[result.length]);
    return result;
}
