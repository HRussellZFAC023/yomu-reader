export function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function unescapeYouTubeConfigString(value: string): string {
    try {
        return JSON.parse(`"${value}"`) as string;
    } catch {
        return value;
    }
}

export function readYouTubeConfigStringFromScripts(key: string): string {
    const escapedKey = escapeRegExp(key);
    const patterns = [
        new RegExp(`"${escapedKey}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'u'),
        new RegExp(`${escapedKey}\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'u'),
    ];
    for (const script of Array.from(document.scripts)) {
        const text = script.textContent ?? '';
        const raw = patterns.map(pattern => text.match(pattern)?.[1]).find(Boolean);
        if (raw) return unescapeYouTubeConfigString(raw);
    }
    return '';
}
