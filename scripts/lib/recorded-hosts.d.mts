export interface Json3Track { events?: Array<{ tStartMs?: number; dDurationMs?: number; wWinId?: number; aAppend?: number; segs?: Array<{ utf8?: string; tOffsetMs?: number; acAsrConf?: number }> }> }
export function recordedHostAdapter(recording: unknown, options?: Record<string, unknown>): {
    documentHtml(html: string): string;
    answer(request: unknown): Promise<{ served: string; response: unknown } | null>;
};
