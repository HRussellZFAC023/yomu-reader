const JPDB_AUDIO_ID_RE = /^(?:\/static\/user\/)?[A-Za-z0-9_./-]+$/;

export function parseJpdbAudioData(value: string): string[] {
    return value.split(',')
        .map(normalizeJpdbAudioGroup)
        .filter(Boolean);
}

export function isValidJpdbAudioId(value: string): boolean {
    return Boolean(value && JPDB_AUDIO_ID_RE.test(value) && !value.includes('..') && !value.startsWith('//'));
}

export function normalizeJpdbAudioGroup(value: string): string {
    const ids = value.split('+')
        .map(item => item.trim())
        .filter(Boolean);
    return ids.length && ids.every(isValidJpdbAudioId) ? ids.join('+') : '';
}
