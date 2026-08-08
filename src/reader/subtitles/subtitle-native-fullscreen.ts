import type { SubtitleCue } from './subtitle-cues';

export interface NativeFullscreenCueMirror {
    track: TextTrack | undefined;
    video: HTMLVideoElement | undefined;
}

interface NativeFullscreenCueMirrorOptions {
    track: TextTrack | undefined;
    trackVideo: HTMLVideoElement | undefined;
    video: HTMLVideoElement;
    cues: SubtitleCue[];
    label: string;
    language: string;
}

interface ActiveNativeFullscreenCueMirror extends NativeFullscreenCueMirror {
    track: TextTrack;
    video: HTMLVideoElement;
}

// Native iPhone fullscreen lives in the browser top layer, so DOM annotations
// cannot follow it. This Module owns the complete best-effort text-track mirror
// transaction and returns the state the controller should retain for the next
// cue update.
export function mirrorNativeFullscreenCues(
    options: NativeFullscreenCueMirrorOptions,
): NativeFullscreenCueMirror {
    if (!canMirrorNativeFullscreenCues(options.video)) return previousNativeFullscreenCueMirror(options);
    try {
        const mirror = nativeFullscreenCueMirror(options);
        clearNativeFullscreenCues(mirror.track);
        addNativeFullscreenCues(mirror.track, options.cues);
        mirror.track.mode = 'showing';
        return mirror;
    } catch {
        return failedNativeFullscreenCueMirror(options);
    }
}

function canMirrorNativeFullscreenCues(video: HTMLVideoElement): boolean {
    return typeof video.addTextTrack === 'function' && typeof VTTCue === 'function';
}

function nativeFullscreenCueMirror(options: NativeFullscreenCueMirrorOptions): ActiveNativeFullscreenCueMirror {
    if (options.video === options.trackVideo && options.track) return { track: options.track, video: options.video };
    return {
        track: options.video.addTextTrack('subtitles', options.label, options.language),
        video: options.video,
    };
}

function previousNativeFullscreenCueMirror(options: NativeFullscreenCueMirrorOptions): NativeFullscreenCueMirror {
    return { track: options.track, video: options.trackVideo };
}

function failedNativeFullscreenCueMirror(options: NativeFullscreenCueMirrorOptions): NativeFullscreenCueMirror {
    if (options.video === options.trackVideo) return previousNativeFullscreenCueMirror(options);
    return { track: undefined, video: options.video };
}

function clearNativeFullscreenCues(track: TextTrack): void {
    Array.from(track.cues ?? []).forEach(cue => track.removeCue(cue));
}

function addNativeFullscreenCues(track: TextTrack, cues: SubtitleCue[]): void {
    cues.filter(cue => cue.end > cue.start).forEach(cue => {
        track.addCue(new VTTCue(cue.start, cue.end, cue.originalText ?? cue.text));
    });
}
