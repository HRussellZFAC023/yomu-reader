const TRANSCRIPT_SCROLL_INTENT_WINDOW_MS = 1_500;

export class TranscriptFollowState {
    private intentUntil = 0;
    private manualScrollAt = 0;

    armUserScroll(now = performance.now()): void {
        this.intentUntil = now + TRANSCRIPT_SCROLL_INTENT_WINDOW_MS;
    }

    noteScroll(now = performance.now()): boolean {
        if (now > this.intentUntil) return false;
        this.intentUntil = 0;
        this.manualScrollAt = now;
        return true;
    }

    clear(): void {
        this.intentUntil = 0;
        this.manualScrollAt = 0;
    }

    isPaused(resumeMs: number, now = performance.now()): boolean {
        return Boolean(this.manualScrollAt && now - this.manualScrollAt < resumeMs);
    }

    remainingPauseMs(resumeMs: number, now = performance.now()): number {
        if (!this.manualScrollAt) return 0;
        return Math.max(0, resumeMs - (now - this.manualScrollAt));
    }
}

export function isTranscriptScrollIntentKey(event: KeyboardEvent): boolean {
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    return ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key);
}
