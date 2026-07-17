import fs from 'node:fs';
import path from 'node:path';
import type {
    AuthoredWeekRegistration,
    LoadedAuthoredWeekPackage,
} from '../../../src/academy/content/lesson-content-registry';

export async function validateCommittedAuthoredWeek(
    registration: AuthoredWeekRegistration,
): Promise<LoadedAuthoredWeekPackage> {
    const bytes = fs.readFileSync(path.resolve('public/academy/content/lessons', registration.filename));
    return registration.validate(Uint8Array.from(bytes).buffer);
}

export function committedAuthoredWeekFetcher(registration: AuthoredWeekRegistration): typeof fetch {
    const bytes = fs.readFileSync(path.resolve('public/academy/content/lessons', registration.filename));
    return (async () => new Response(bytes, {
        status: 200,
        headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
}
