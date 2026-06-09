import { requestJson } from '../network/http';
import { Logger } from '../app/logger';
import type { SubtitleCue } from './subtitle-cues';

const TRANSLATION_BATCH_SIZE = 25;
const TRANSLATION_TIMEOUT_MS = 8000;
const TRANSLATION_SEPARATOR = '\n';

const log = Logger.scope('SubtitleTranslate');

interface GoogleTranslateResponse {
    sentences?: Array<{ trans?: string }>;
}

export async function translateSubtitleCues(cues: SubtitleCue[], sourceLanguage: string, targetLanguage: string): Promise<SubtitleCue[]> {
    if (!cues.length) return [];
    const texts = cues.map(cue => cue.text.trim());
    const batches = batchTexts(texts, TRANSLATION_BATCH_SIZE);
    const translated: string[] = [];
    for (const batch of batches) {
        const results = await translateBatch(batch, sourceLanguage, targetLanguage);
        translated.push(...results);
    }
    return cues.map((cue, index) => ({
        ...cue,
        text: translated[index] || cue.text,
    }));
}

function batchTexts(texts: string[], size: number): string[][] {
    const batches: string[][] = [];
    for (let start = 0; start < texts.length; start += size) {
        batches.push(texts.slice(start, start + size));
    }
    return batches;
}

async function translateBatch(texts: string[], sourceLanguage: string, targetLanguage: string): Promise<string[]> {
    const joined = texts.join(TRANSLATION_SEPARATOR);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLanguage}&tl=${targetLanguage}&dt=t&dj=1&q=${encodeURIComponent(joined)}`;
    const done = log.time('Translate subtitle batch', { count: texts.length });
    try {
        const json = await requestJson(url, {
            timeoutMs: TRANSLATION_TIMEOUT_MS,
            allowDirectCrossOrigin: true,
            allowConfiguredProxy: false,
            allowPublicProxies: false,
            preferFetch: true,
            failureLabel: 'Subtitle translation request',
            timeoutLabel: 'Subtitle translation timed out.',
        }) as GoogleTranslateResponse;
        const result = (json.sentences ?? []).map(item => item.trans ?? '').join('');
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

function padTranslationResults(translated: string[], originals: string[]): string[] {
    const result = translated.map(text => text.trim());
    while (result.length < originals.length) result.push(originals[result.length]);
    return result;
}
