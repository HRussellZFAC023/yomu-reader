export function isAbortError(error: unknown): boolean {
    return errorName(error) === 'AbortError';
}

function errorName(error: unknown): string {
    if (!error || typeof error !== 'object') return '';
    const name = (error as { name?: unknown }).name;
    return typeof name === 'string' ? name : '';
}
