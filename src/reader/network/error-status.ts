export function httpStatusFromError(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const value = error as { status?: unknown; statusCode?: unknown };
    const status = value.status ?? value.statusCode;
    return typeof status === 'number' && Number.isFinite(status) ? status : undefined;
}
