import fs from 'node:fs';
import path from 'node:path';
import {
    getAuthoredWeekRegistration,
    loadAuthoredWeekPackage,
} from '../../src/academy/content/lesson-content-registry';

const PACKAGE_ID = 'l2-l24';
const REGISTRATION = getAuthoredWeekRegistration(PACKAGE_ID);
const PACKAGE_PATH = path.resolve('public/academy/content/lessons', REGISTRATION.filename);

describe('authored Academy package loader', () => {
    it('validates package 051 from the exact fetched bytes', async () => {
        const bytes = fs.readFileSync(PACKAGE_PATH);
        const requests: string[] = [];
        const loaded = await loadAuthoredWeekPackage(PACKAGE_ID, (async input => {
            requests.push(String(input));
            return new Response(bytes, {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }) as typeof fetch);

        expect(requests).toEqual(['/academy/content/lessons/051-l2-l24.json']);
        expect(loaded.week).toMatchObject({
            id: PACKAGE_ID,
            provenance: {
                packageId: PACKAGE_ID,
                source: {
                    path: '/academy/content/lessons/051-l2-l24.json',
                    sha256: REGISTRATION.expectedSha256,
                },
            },
        });
    });

    it('rejects a one-byte mutation even when the resulting JSON is still valid', async () => {
        const mutated = Buffer.concat([fs.readFileSync(PACKAGE_PATH), Buffer.from(' ')]);
        const fetcher = (async () => new Response(mutated, {
            status: 200,
            headers: { 'content-type': 'application/json' },
        })) as typeof fetch;

        await expect(loadAuthoredWeekPackage(PACKAGE_ID, fetcher))
            .rejects.toThrow(/does not match its registered bytes/i);
    });

    it('ignores trusted-looking hash metadata and rejects the changed response bytes', async () => {
        const value = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8')) as Record<string, unknown>;
        const forged = JSON.stringify({ ...value, sha256: REGISTRATION.expectedSha256 });
        const fetcher = (async () => new Response(forged, {
            status: 200,
            headers: {
                'content-type': 'application/json',
                'x-content-sha256': REGISTRATION.expectedSha256,
            },
        })) as typeof fetch;

        await expect(loadAuthoredWeekPackage(PACKAGE_ID, fetcher))
            .rejects.toThrow(/does not match its registered bytes/i);
    });
});
