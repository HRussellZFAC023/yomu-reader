/**
 * Story voice-line resolution seam.
 *
 * public/academy/audio/voice-lines.json (when present) maps a line id to
 * {speaker, text, url} — but its `url` points at yomu-audio's R2-cached
 * `/voice/line` output, which is admin-token gated and must never be fetched
 * client-side (see workers/yomu-audio/src/tts.ts, VOICE_ADMIN_TOKEN). The R2
 * cache key (voice/<speaker>/<sha256>.mp3) also isn't derivable here without
 * duplicating the worker's hashing, so this module cannot resolve that path.
 *
 * Interim: reuse the public, ungated `/audio/tts` word endpoint for short
 * lines only (<=30 chars), same as pronunciation playback. Longer lines
 * no-op — no story audio is worse than wrong audio, and dialogue narration
 * is not this task's target. When the worker exposes a public cached-line
 * lookup (e.g. `/voice/cached?id=`), swap the body of
 * `resolveVoiceLineUrl` for a fetch against it; callers do not change.
 *
 * No caller wires this up yet. The natural hook is
 * `VnAudioDirectorBridge.performanceHooks.onSound` in
 * ./ '../vn/audio-director-bridge' (or a sibling onSpeech hook) — VN beats
 * already flow speaker + text through `performanceHooks`, so a future
 * per-line speech bus would resolve a URL here and hand it to the same
 * HTMLAudioElement plumbing WorkerTtsPronunciationService uses.
 */

const WORD_TTS_ENDPOINT = 'https://audio.yomureader.com/audio/tts';
const MAX_INTERIM_LINE_LENGTH = 30;

/**
 * Resolves a playable audio URL for a story line, or null when no audio is
 * available for it yet. Never fetches the gated voice-lines.json `url`
 * field — only builds URLs against the public word endpoint.
 */
export function resolveVoiceLineUrl(speaker: string, jaText: string): string | null {
    const text = jaText.trim();
    if (!text || text.length > MAX_INTERIM_LINE_LENGTH) return null;
    void speaker; // not used by the public word endpoint; kept for the future per-speaker lookup's signature
    const params = new URLSearchParams({ term: text, reading: text });
    return `${WORD_TTS_ENDPOINT}?${params.toString()}`;
}
