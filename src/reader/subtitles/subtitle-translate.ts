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

export type SubtitleTranslationOutcome = 'complete' | 'partial' | 'failed';

interface TranslateSubtitleCueOptions {
    batchSize?: number;
    encodedCharBudget?: number;
    signal?: AbortSignal;
    onProgress?: (cues: SubtitleCue[]) => void;
}

export async function translateSubtitleCues(
    cues: SubtitleCue[],
    sourceLanguage: string,
    outputLanguage: string,
    options: TranslateSubtitleCueOptions = {},
): Promise<SubtitleCue[]> {
    throwIfSubtitleTranslationAborted(options.signal);
    if (!cues.length) return [];
    // A newline separates cues on the wire; source line wrapping must not
    // become another cue or shift every following translation.
    const texts = cues.map(cue => cue.text.replace(/\s*[\r\n]+\s*/g, ' ').trim());
    const batches = batchTexts(
        texts,
        options.batchSize ?? TRANSLATION_BATCH_SIZE,
        options.encodedCharBudget ?? TRANSLATION_BATCH_ENCODED_CHAR_BUDGET,
    );
    const translated = await translateSubtitleBatches(batches, sourceLanguage, outputLanguage, options.signal,
        results => options.onProgress?.(translatedCueResults(cues, results)));
    throwIfSubtitleTranslationAborted(options.signal);
    return translatedCueResults(cues, translated);
}

function translatedCueResults(cues: SubtitleCue[], translated: Array<string | undefined>): SubtitleCue[] {
    return cues.flatMap((cue, index) => {
        const text = translated[index];
        // Source word offsets and originalText describe another language.
        return text ? [{ start: cue.start, end: cue.end, text, transcriptEligible: cue.transcriptEligible }] : [];
    });
}

async function translateSubtitleBatches(
    batches: string[][],
    sourceLanguage: string,
    outputLanguage: string,
    signal: AbortSignal | undefined,
    onProgress: (results: Array<string | undefined>) => void,
): Promise<Array<string | undefined>> {
    const translated: Array<string | undefined> = [];
    for (const [index, batch] of batches.entries()) {
        if (index > 0) await waitForTranslationTurn(signal);
        const results = await translateBatch(batch, sourceLanguage, outputLanguage, signal);
        translated.push(...results);
        onProgress(translated);
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
): Promise<Array<string | undefined>> {
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
        const lines = texts.length === 1 ? [result] : result.split(TRANSLATION_SEPARATOR);
        log.info('Subtitle batch translated', { count: texts.length, resultCount: lines.length });
        if (lines.length !== texts.length) throw new Error('Subtitle translation lost cue boundaries.');
        return lines.map(text => text.trim() || undefined);
    } catch (error) {
        throwIfSubtitleTranslationCancelled(signal, error);
        log.warn('Subtitle batch translation failed', { count: texts.length, error });
        return texts.map(() => undefined);
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
