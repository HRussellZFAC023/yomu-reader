export function requestKey(request: { method: string; url: string; data?: unknown; headers?: Record<string, string> }): string;
export function inspectReportHtml(report: {
    url: string; mode: string; runtime: string; annotatedWordCount?: number;
    words: Array<{ text: string; reading?: string; opened: boolean; popupText: string }>;
    errors: string[]; missingRequests: string[];
}): string;
