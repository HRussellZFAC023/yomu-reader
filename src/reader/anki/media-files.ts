import type { AnkiWordAudioMedia } from './audio';
import { fieldNameForRole } from './field-mapping';
import type {
    AnkiAudioKind,
    AnkiAudioMergeMode,
    AnkiCardContext,
    AnkiMediaFile,
    AnkiPicture,
    ParsedAnkiAudioDataUrl,
    ParsedAnkiImageDataUrl,
} from './types';
import type { AnkiFieldMapping, JPDBCard } from '../app/types';

const ANKI_PRONUNCIATION_AUDIO_FIELD_NAMES = ['Pronunciation'];

export function imageFromDataUrl(dataUrl: string, card: JPDBCard): AnkiPicture | null {
    const parsed = parseAnkiImageDataUrl(dataUrl);
    if (!parsed) return null;
    return {
        filename: `yomu_${safeAnkiMediaName(card)}_${Date.now()}.${parsed.extension}`,
        data: parsed.data,
        fields: ['Image'],
    };
}

export function mergeAudioFilesForNote(fieldNames: string[], options: AnkiCardContext & { audioMergeMode?: AnkiAudioMergeMode }, card: JPDBCard, mapping?: AnkiFieldMapping): AnkiMediaFile[] {
    if (options.audioMergeMode === 'theirs') return [];
    const targets = ankiAudioFieldTargets(fieldNames, mapping);
    if (!targets) return [];
    return retargetAudioFilesByKind(audioFilesFromContext(options, card), targets);
}

export interface AnkiAudioFieldTargets {
    word: string;
    context: string;
}

// Resolves the field each audio kind is written to. Note types that expose only
// one audio field collapse onto it in BOTH directions, so splitting the roles
// never drops audio that used to be written.
export function ankiAudioFieldTargets(fieldNames: string[], mapping?: AnkiFieldMapping): AnkiAudioFieldTargets | null {
    const word = fieldNameForRole(fieldNames, 'audio', mapping) || mediaFieldName(fieldNames, ANKI_PRONUNCIATION_AUDIO_FIELD_NAMES);
    const context = fieldNameForRole(fieldNames, 'sentenceAudio', mapping);
    if (!word && !context) return null;
    return { word: word || context, context: context || word };
}

export function retargetAudioFilesByKind(files: AnkiMediaFile[], targets: AnkiAudioFieldTargets): AnkiMediaFile[] {
    return files.map(file => {
        const { yomuAudioKind: _kind, ...rest } = file;
        return { ...rest, fields: [ankiAudioFieldForKind(file.yomuAudioKind, targets)] };
    });
}

function ankiAudioFieldForKind(kind: AnkiAudioKind | undefined, targets: AnkiAudioFieldTargets): string {
    return kind === 'context' ? targets.context : targets.word;
}

export function mergePictureFilesForNote(
    fieldNames: string[],
    existingFields: Record<string, string>,
    options: AnkiCardContext,
    card: JPDBCard,
    canOwnYomuFields: boolean,
    mapping?: AnkiFieldMapping,
): AnkiPicture[] {
    const fieldName = fieldNameForRole(fieldNames, 'image', mapping);
    if (!fieldName || !options.imageDataUrl) return [];
    if (!canOwnYomuFields && existingFields[fieldName]) return [];
    const image = imageFromDataUrl(options.imageDataUrl, card);
    return image ? [{ ...image, fields: [fieldName] }] : [];
}

export function applyMediaFieldClears(
    fields: Record<string, string>,
    audio: AnkiMediaFile[],
    picture: AnkiPicture[],
    audioMergeMode: AnkiAudioMergeMode | undefined,
    canOwnYomuFields: boolean,
): void {
    // Word and sentence audio can now target different fields, so clear every
    // field the write touches — clearing only the first left stale audio in the
    // other one and appended the new clip after it.
    if (audioMergeMode === 'ours') {
        for (const fieldName of new Set(audio.map(file => file.fields[0]).filter(Boolean))) fields[fieldName] = '';
    }
    if (picture.length && canOwnYomuFields) fields[picture[0].fields[0]] = '';
}

function mediaFieldName(fieldNames: string[], preferredNames: string[]): string {
    const exact = preferredNames.find(name => fieldNames.includes(name));
    if (exact) return exact;
    const preferredLower = new Set(preferredNames.map(name => name.toLowerCase()));
    return fieldNames.find(name => preferredLower.has(name.toLowerCase())) ?? '';
}

export function retargetMediaFiles<T extends AnkiMediaFile | AnkiPicture>(files: T[], fieldName: string): T[] {
    return files.map(file => ({ ...file, fields: [fieldName] }));
}

export function audioFilesFromContext(options: AnkiCardContext, card: JPDBCard): AnkiMediaFile[] {
    const files = [
        audioFromMedia({ dataUrl: options.wordAudioDataUrl, url: options.wordAudioUrl, kind: 'word' }, card),
        audioFromMedia({ dataUrl: options.audioDataUrl, url: options.audioUrl, kind: 'context' }, card),
    ].filter((file): file is AnkiMediaFile => Boolean(file));
    return uniqueAnkiAudioFiles(files);
}

function audioFromMedia(media: AnkiWordAudioMedia & { kind: AnkiAudioKind }, card: JPDBCard): AnkiMediaFile | null {
    const fromData = media.dataUrl ? audioFromDataUrl(media.dataUrl, card, media.kind) : null;
    if (fromData) return fromData;
    return media.url ? audioFromUrl(media.url, card, media.kind) : null;
}

function audioFromDataUrl(dataUrl: string, card: JPDBCard, kind: AnkiAudioKind): AnkiMediaFile | null {
    const parsed = parseAnkiAudioDataUrl(dataUrl);
    if (!parsed) return null;
    return {
        filename: `yomu_${safeAnkiMediaName(card)}_${kind}_${Date.now()}.${parsed.extension}`,
        data: parsed.data,
        fields: ['Audio'],
        yomuAudioKind: kind,
    };
}

function audioFromUrl(url: string, card: JPDBCard, kind: AnkiAudioKind): AnkiMediaFile | null {
    const cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) return null;
    return {
        filename: `yomu_${safeAnkiMediaName(card)}_${kind}_${Date.now()}${audioUrlExtension(cleanUrl)}`,
        url: cleanUrl,
        fields: ['Audio'],
        yomuAudioKind: kind,
    };
}

function uniqueAnkiAudioFiles(files: AnkiMediaFile[]): AnkiMediaFile[] {
    const seen = new Set<string>();
    return files.filter(file => {
        const key = file.data ? `data:${file.data}` : `url:${file.url ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function parseAnkiImageDataUrl(dataUrl: string): ParsedAnkiImageDataUrl | null {
    const match = /^data:image\/(png|jpeg|jpg|webp|svg\+xml)(?:;[^,]*)?;base64,(.+)$/i.exec(dataUrl);
    return match ? { extension: ankiImageExtension(match[1]), data: match[2] } : null;
}

function parseAnkiAudioDataUrl(dataUrl: string): ParsedAnkiAudioDataUrl | null {
    const match = /^data:audio\/([a-z0-9.+-]+)(?:;[^,]*)?;base64,(.+)$/i.exec(dataUrl);
    return match ? { extension: ankiAudioExtension(match[1]), data: match[2] } : null;
}

const ANKI_IMAGE_EXTENSION_ALIASES: Record<string, string> = {
    'jpeg': 'jpg',
    'svg+xml': 'svg',
};

function ankiImageExtension(rawExtension: string): string {
    const extension = rawExtension.toLowerCase();
    return ANKI_IMAGE_EXTENSION_ALIASES[extension] ?? extension;
}

const ANKI_AUDIO_EXTENSION_ALIASES: Record<string, string> = {
    'mpeg': 'mp3',
    'mp3': 'mp3',
    'wav': 'wav',
    'wave': 'wav',
    'x-wav': 'wav',
    'ogg': 'ogg',
    'oga': 'ogg',
    'webm': 'webm',
    'mp4': 'mp4',
    'aac': 'aac',
    'flac': 'flac',
};

function ankiAudioExtension(rawExtension: string): string {
    return ANKI_AUDIO_EXTENSION_ALIASES[rawExtension.toLowerCase()] ?? 'mp3';
}

function audioUrlExtension(url: string): string {
    try {
        const pathname = new URL(url, location.href).pathname;
        const match = /\.([a-z0-9]+)$/i.exec(pathname);
        if (match) return `.${ankiAudioExtension(match[1])}`;
    } catch {
        // Fall through to the common Immersion Kit format.
    }
    return '.mp3';
}

function safeAnkiMediaName(card: JPDBCard): string {
    return card.spelling.replace(/[^\p{L}\p{N}-]+/gu, '_').slice(0, 24) || 'yomu';
}
