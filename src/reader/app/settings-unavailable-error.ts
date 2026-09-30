/**
 * Startup could not witness the learner's settings: the storage backend
 * rejected the read, or the settings pair stayed torn through the strict
 * reader's retries. Boot turns this into the content-page recovery affordance
 * instead of leaving an ordinary site with no visible Reader at all.
 */
class ReaderSettingsUnavailableError extends Error {
    override readonly name = 'ReaderSettingsUnavailableError';

    constructor(cause: unknown) {
        super('Reader settings could not be read.', { cause });
    }
}

export function rejectAsReaderSettingsUnavailable(cause: unknown): never {
    throw new ReaderSettingsUnavailableError(cause);
}

export function isReaderSettingsUnavailable(error: unknown): boolean {
    return error instanceof ReaderSettingsUnavailableError;
}
