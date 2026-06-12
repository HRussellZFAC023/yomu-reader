export interface SubtitleParseBatchItem {
    text: string;
    key: string;
}

export interface ParsedSubtitleHtmlResult {
    key: string;
    html: string;
    provisional?: boolean;
}

export interface SubtitleParseBatchPlan {
    ready: Array<Promise<ParsedSubtitleHtmlResult>>;
    batch: SubtitleParseBatchItem[];
}

export function planSubtitleParseBatch(
    items: SubtitleParseBatchItem[],
    cachedHtml: (key: string) => string | undefined,
    pendingHtml: (key: string) => Promise<string> | undefined,
): SubtitleParseBatchPlan {
    const ready: Array<Promise<ParsedSubtitleHtmlResult>> = [];
    const batch: SubtitleParseBatchItem[] = [];
    for (const item of items) {
        const cached = cachedHtml(item.key);
        if (cached !== undefined) {
            ready.push(Promise.resolve({ key: item.key, html: cached }));
            continue;
        }
        const pending = pendingHtml(item.key);
        if (pending) ready.push(pending.then(html => ({ key: item.key, html })));
        else batch.push(item);
    }
    return { ready, batch };
}

export function planProvisionalSubtitleParseBatch(
    items: SubtitleParseBatchItem[],
    parsedHtmlCache: ReadonlyMap<string, string>,
    provisionalParsedHtmlCache: ReadonlyMap<string, string>,
    pendingProvisionalParsedHtml: ReadonlyMap<string, Promise<string>>,
    freshEmptyHtml: (key: string) => string | undefined = () => undefined,
): SubtitleParseBatchPlan {
    const ready: Array<Promise<ParsedSubtitleHtmlResult>> = [];
    const batch: SubtitleParseBatchItem[] = [];
    for (const item of items) {
        const cached = parsedHtmlCache.get(item.key);
        if (cached !== undefined) {
            ready.push(Promise.resolve({ key: item.key, html: cached }));
            continue;
        }
        const provisional = provisionalParsedHtmlCache.get(item.key);
        if (provisional !== undefined) {
            ready.push(Promise.resolve({ key: item.key, html: provisional, provisional: true }));
            continue;
        }
        // Known-empty cues stay quiet until their retry TTL lapses; without
        // this the keyless tick re-parses every empty cue forever.
        const empty = freshEmptyHtml(item.key);
        if (empty !== undefined) {
            ready.push(Promise.resolve({ key: item.key, html: empty }));
            continue;
        }
        const pending = pendingProvisionalParsedHtml.get(item.key);
        if (pending) ready.push(pending.then(html => ({ key: item.key, html, provisional: true })));
        else batch.push(item);
    }
    return { ready, batch };
}
