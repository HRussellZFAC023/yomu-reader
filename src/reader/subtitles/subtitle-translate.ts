import { Logger } from '../app/logger';
import { isAbortError } from '../core/errors';
import { abortSignalReason } from '../core/shared-abortable-operation';
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
    signal?: AbortSignal;
}

export async function translateSubtitleCues(
    cues: SubtitleCue[],
    sourceLanguage: string,
    outputLanguage: string,
    options: TranslateSubtitleCueOptions = {},
): Promise<SubtitleCue[]> {
    throwIfSubtitleTranslationAborted(options.signal);
    if (!cues.length) return [];
    const texts = cues.map(cue => cue.text.trim());
    const batches = batchTexts(
        texts,
        options.batchSize ?? TRANSLATION_BATCH_SIZE,
        options.encodedCharBudget ?? TRANSLATION_BATCH_ENCODED_CHAR_BUDGET,
    );
    const translated = await translateSubtitleBatches(batches, sourceLanguage, outputLanguage, options.signal);
    throwIfSubtitleTranslationAborted(options.signal);
    return cues.map((cue, index) => ({
        ...cue,
        text: translated[index] || cue.text,
    }));
}

async function translateSubtitleBatches(
    batches: string[][],
    sourceLanguage: string,
    outputLanguage: string,
    signal?: AbortSignal,
): Promise<string[]> {
    const translated: string[] = [];
    for (const [index, batch] of batches.entries()) {
        if (index > 0) await waitForTranslationTurn(signal);
        const results = await translateBatch(batch, sourceLanguage, outputLanguage, signal);
        translated.push(...results);
    }
    return translated;
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

async function translateBatch(
    texts: string[],
    sourceLanguage: string,
    outputLanguage: string,
    signal?: AbortSignal,
): Promise<string[]> {
    const joined = texts.join(TRANSLATION_SEPARATOR);
    const done = log.time('Translate subtitle batch', { count: texts.length });
    try {
        const result = await translateText(joined, {
            sourceLanguage,
            outputLanguage,
            timeoutMs: TRANSLATION_TIMEOUT_MS,
            signal,
        });
        throwIfSubtitleTranslationAborted(signal);
        const lines = result.split(TRANSLATION_SEPARATOR);
        log.info('Subtitle batch translated', { count: texts.length, resultCount: lines.length });
        return padTranslationResults(lines, texts);
    } catch (error) {
        throwIfSubtitleTranslationCancelled(signal, error);
        log.warn('Subtitle batch translation failed', { count: texts.length, error });
        return texts;
    } finally {
        done();
    }
}

function waitForTranslationTurn(signal?: AbortSignal): Promise<void> {
    throwIfSubtitleTranslationAborted(signal);
    return new Promise((resolve, reject) => {
        const timer = globalThis.setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, 0);
        const onAbort = (): void => {
            globalThis.clearTimeout(timer);
            reject(abortSignalReason(signal));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

function throwIfSubtitleTranslationCancelled(signal: AbortSignal | undefined, error: unknown): void {
    if (signal?.aborted) throw abortSignalReason(signal);
    if (isAbortError(error)) throw error;
}

function throwIfSubtitleTranslationAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw abortSignalReason(signal);
}

function padTranslationResults(translated: string[], originals: string[]): string[] {
    const result = translated.map(text => text.trim());
    while (result.length < originals.length) result.push(originals[result.length]);
    return result;
}
