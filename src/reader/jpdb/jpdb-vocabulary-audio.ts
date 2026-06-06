import { parseHtmlDocument } from '../dom';
import { unique } from './jpdb-public-lookup';
import { parseJpdbVocabularyUrl } from './jpdb-text';
import { vocabularyRoot } from './jpdb-vocabulary-root';
import type { JpdbVocabularyCompound } from './jpdb-vocabulary-types';

const JPDB_AUDIO_ID_RE = /^(?:\/static\/user\/)?[A-Za-z0-9_./-]+$/;

export function jpdbAudioIds(root: ParentNode): string[] {
    return unique(Array.from(root.querySelectorAll<HTMLElement>('[data-audio]'))
        .flatMap(element => parseJpdbAudioData(element.dataset.audio ?? '')));
}

export function jpdbVocabularyAudioIds(html: string, spelling: string, reading: string): string[] {
    const doc = parseHtmlDocument(html);
    const root = vocabularyRoot(doc, spelling, reading);
    if (!root) return [];
    return unique(Array.from(root.querySelectorAll<HTMLElement>('a.vocabulary-audio[data-audio], .subsection-headword [data-audio], .subsection-pitch-accent [data-audio]'))
        .filter(element => !element.closest('.subsection-used-in, .subsection-examples'))
        .flatMap(element => parseJpdbAudioData(element.dataset.audio ?? '')));
}

export function parseJpdbAudioData(value: string): string[] {
    return value.split(',')
        .map(normalizeJpdbAudioGroup)
        .filter(Boolean);
}

function isValidJpdbAudioId(value: string): boolean {
    return Boolean(value && JPDB_AUDIO_ID_RE.test(value) && !value.includes('..') && !value.startsWith('//'));
}

function normalizeJpdbAudioGroup(value: string): string {
    const ids = value.split('+')
        .map(item => item.trim())
        .filter(Boolean);
    return ids.length && ids.every(isValidJpdbAudioId) ? ids.join('+') : '';
}

export function shouldRefreshVocabularyEntryAudio(entry: JpdbVocabularyCompound): boolean {
    return Boolean(entry.url && parseJpdbVocabularyUrl(entry.url) && jpdbAudioVoiceCount(entry.audioIds ?? []) < 2);
}

export function isBetterJpdbAudioIds(candidate: string[], current: string[]): boolean {
    if (!candidate.length) return false;
    return jpdbAudioVoiceCount(candidate) > jpdbAudioVoiceCount(current) || (!current.length && candidate.length > 0);
}

function jpdbAudioVoiceCount(audioIds: string[]): number {
    const voices = new Set<string>();
    audioIds.forEach(group => {
        group.split('+').forEach(audioId => {
            const voice = /^(m1|f1|m2|f2)\//.exec(audioId)?.[1];
            if (voice) voices.add(voice);
        });
    });
    return voices.size || audioIds.length;
}
