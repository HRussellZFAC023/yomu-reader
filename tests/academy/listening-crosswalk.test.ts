import fs from 'node:fs';
import path from 'node:path';
import {
    ACADEMY_LISTENING_CROSSWALK,
    resolveAcademyListeningLocator,
    resolvePackagedAcademyListeningLocator,
    type SourceVerifiedListeningEntry,
} from '../../src/academy/content/listening/listening-crosswalk';
import { verifyCommittedPackagedListening } from './helpers/source-verification';

const LESSON_ROOT = path.resolve('public/academy/content/lessons');
const PUBLIC_MANIFEST = path.resolve('public/academy/content/listening/listening-crosswalk.v1.json');
const DOCS_MANIFEST = path.resolve('docs/public/academy/content/listening/listening-crosswalk.v1.json');
const TASK_MANIFEST = path.resolve('public/academy/content/listening/listening-task-bindings.v1.json');

describe('Academy listening locator crosswalk', () => {
    it('accounts for every authored listening locator exactly once', () => {
        const authored = new Set<string>();
        const crosswalk = ACADEMY_LISTENING_CROSSWALK.entries.map(entry => entry.locator);
        for (const filename of fs.readdirSync(LESSON_ROOT).filter(name => name.endsWith('.json')).sort()) {
            collectListeningLocators(JSON.parse(fs.readFileSync(path.join(LESSON_ROOT, filename), 'utf8')), authored);
        }
        const directBindings = JSON.parse(fs.readFileSync(TASK_MANIFEST, 'utf8')) as {
            entries: Array<{ locator: string; source: { questionMapRef: string } }>;
        };
        directBindings.entries
            .filter(entry => entry.source.questionMapRef.includes('DIRECT_REVIEWED_MINNA_SOURCES')
                || entry.source.questionMapRef.includes('DIRECT_REVIEWED_MOODLE_SOURCES'))
            .forEach(entry => authored.add(entry.locator));

        expect([...crosswalk].sort()).toEqual([...authored].sort());
        expect(new Set(crosswalk).size).toBe(crosswalk.length);
        expect(ACADEMY_LISTENING_CROSSWALK.entries.filter(entry => entry.availability === 'source-verified')).toHaveLength(24);
        expect(ACADEMY_LISTENING_CROSSWALK.entries.filter(entry => entry.availability === 'unavailable')).toHaveLength(22);
    });

    it('keeps unavailable authored scripts explicit and content-addressed', () => {
        const unavailable = ACADEMY_LISTENING_CROSSWALK.entries.filter(entry => entry.availability === 'unavailable');
        for (const entry of unavailable) {
            if (entry.reason === 'no-recording-matching-authored-script') {
                expect(entry.authoredScriptSha256).toMatch(/^[a-f0-9]{64}$/);
                expect(entry.expectedDurationSeconds).toBeGreaterThan(0);
            } else {
                expect(entry.authoredScriptSha256).toBeUndefined();
                expect(entry.expectedDurationSeconds).toBeUndefined();
            }
            expect(resolveAcademyListeningLocator(entry.locator)).toEqual({ status: 'unavailable', entry });
        }
        expect(resolveAcademyListeningLocator('academy://audio/not-authored')).toEqual({
            status: 'unavailable',
            locator: 'academy://audio/not-authored',
            reason: 'locator-not-authored',
        });
    });

    it('verifies every resolved source against committed packaged bytes and provenance', () => {
        const verified = ACADEMY_LISTENING_CROSSWALK.entries.filter(
            (entry): entry is SourceVerifiedListeningEntry => entry.availability === 'source-verified',
        );
        for (const entry of verified) {
            expect(entry.delivery).toBeDefined();
            verifyCommittedPackagedListening({
                locator: entry.locator,
                url: entry.delivery!.url,
                sha256: entry.source.sha256,
                bytes: entry.source.bytes,
            });

            const resolution = resolveAcademyListeningLocator(entry.locator);
            expect(resolution.status).toBe('source-verified');
            if (resolution.status !== 'source-verified') throw new Error('Expected verified listening source.');
            expect(resolution.resource).toEqual({
                assetId: entry.worker.assetId,
                kind: 'audio',
                mediaType: 'audio/mpeg',
                readiness: { state: 'ready' },
            });
        }
    });

    it('exposes packaged fallback for every byte-verified listening source', () => {
        const packaged = ACADEMY_LISTENING_CROSSWALK.entries.filter(
            (entry): entry is SourceVerifiedListeningEntry => entry.availability === 'source-verified' && entry.delivery !== undefined,
        );
        expect(packaged).toHaveLength(24);
        expect(resolvePackagedAcademyListeningLocator('academy/content/soya/audio/jlpt_n5/n5_mock1_l_19.mp3')).toMatchObject({
            status: 'ready',
            url: '/academy/content/listening/media/academy-listening-75194e1fda2886b7.mp3',
        });
        expect(resolvePackagedAcademyListeningLocator('academy/content/soya/audio/jlpt_n5/n5_mock1_l_24.mp3')).toMatchObject({
            status: 'ready',
            url: '/academy/content/listening/media/academy-listening-52ba9cd972e544ef.mp3',
        });
        expect(resolvePackagedAcademyListeningLocator('academy/content/moodle/audio/l1-l19-a43.mp3')).toMatchObject({
            status: 'ready',
            url: '/academy/content/listening/media/academy-listening-75b031947b395f44.mp3',
        });
        expect(resolvePackagedAcademyListeningLocator('academy/content/moodle/audio/l1-l19-a44.mp3')).toMatchObject({
            status: 'ready',
            url: '/academy/content/listening/media/academy-listening-b076fb0e90d9e1b2.mp3',
        });
        expect(resolvePackagedAcademyListeningLocator('academy/content/moodle/audio/l1-l20-a45.mp3')).toMatchObject({
            status: 'ready',
            url: '/academy/content/listening/media/academy-listening-7a7f9cf7c9d0a109.mp3',
        });
        expect(resolvePackagedAcademyListeningLocator('academy/content/moodle/audio/l1-l21-a46.mp3')).toMatchObject({
            status: 'ready',
            url: '/academy/content/listening/media/academy-listening-4f292de0dd3a5791.mp3',
        });
        expect(resolvePackagedAcademyListeningLocator('academy/content/moodle/audio/l2-l03-b22.mp3')).toMatchObject({
            status: 'ready',
            url: '/academy/content/listening/media/academy-listening-6dccd9517dc4e10f.mp3',
        });
        expect(resolvePackagedAcademyListeningLocator('academy/content/moodle/audio/l2-l05-b25.mp3')).toMatchObject({
            status: 'ready',
            url: '/academy/content/listening/media/academy-listening-2e5d1ee1e18a31b7.mp3',
        });
        expect(resolvePackagedAcademyListeningLocator('academy/content/minna/audio/l2-l05-minna-069.mp3')).toMatchObject({
            status: 'ready',
            url: '/academy/content/listening/media/academy-listening-f423d074fd31d9ef.mp3',
        });
        expect(resolvePackagedAcademyListeningLocator('academy/content/minna/audio/l2-l06-minna-072.mp3')).toMatchObject({
            status: 'ready',
            url: '/academy/content/listening/media/academy-listening-71cd9a20f51a1c49.mp3',
        });
        expect(resolvePackagedAcademyListeningLocator('academy/content/minna/audio/l2-l07-minna-074.mp3')).toMatchObject({
            status: 'ready',
            url: '/academy/content/listening/media/academy-listening-2a287bcef237d1e3.mp3',
        });
        expect(resolvePackagedAcademyListeningLocator('academy/content/minna/audio/l2-l09-minna-075.mp3')).toMatchObject({
            status: 'ready',
            url: '/academy/content/listening/media/academy-listening-360cef1923b1e824.mp3',
        });
        expect(resolvePackagedAcademyListeningLocator('academy/content/minna/audio/l2-l10-minna-077.mp3')).toMatchObject({
            status: 'ready',
            url: '/academy/content/listening/media/academy-listening-3be2ca818292e685.mp3',
        });
        expect(resolvePackagedAcademyListeningLocator('academy/content/moodle/audio/l2-l12-track-78.mp3')).toMatchObject({
            status: 'ready',
            url: '/academy/content/listening/media/academy-listening-1039d11bef7a0575.mp3',
        });
        expect(resolvePackagedAcademyListeningLocator('academy/content/moodle/audio/l2-l12-track-79.mp3')).toMatchObject({
            status: 'ready',
            url: '/academy/content/listening/media/academy-listening-612ff9f8f70e5ce4.mp3',
        });
        expect(resolvePackagedAcademyListeningLocator('academy/content/moodle/audio/l2-l13-a11.mp3')).toMatchObject({
            status: 'ready',
            url: '/academy/content/listening/media/academy-listening-596a4499996bd959.mp3',
        });
        expect(resolvePackagedAcademyListeningLocator('academy/content/soya/audio/jlpt_n5/n5_mock1_l_21.mp3')).toMatchObject({
            status: 'ready',
            url: '/academy/content/listening/media/academy-listening-3cffc675cee2c613.mp3',
        });
        expect(resolvePackagedAcademyListeningLocator('academy/content/soya/audio/jlpt_n5/n5_mock1_l_11.mp3')).toMatchObject({
            status: 'ready',
            url: '/academy/content/listening/media/academy-listening-32c6d0a7692f3d5a.mp3',
        });
    });

    it('ships an exact docs/public mirror for local and hosted Academy builds', () => {
        expect(fs.readFileSync(DOCS_MANIFEST)).toEqual(fs.readFileSync(PUBLIC_MANIFEST));
    });
});

function collectListeningLocators(value: unknown, locators: Set<string>): void {
    if (Array.isArray(value)) {
        for (const item of value) collectListeningLocators(item, locators);
        return;
    }
    if (!value || typeof value !== 'object') return;
    const isPackagedListeningTask = (value as { kind?: unknown; sourceId?: unknown }).kind === 'quarantined-listening-choice'
        || (value as { sourceId?: unknown }).sourceId === 'source-moodle-listening-grid'
        || (value as { sourceId?: unknown }).sourceId === 'source-moodle-a46-commute'
        || (value as { sourceId?: unknown }).sourceId === 'source-moodle-b22-holiday-itinerary'
        || (value as { sourceId?: unknown }).sourceId === 'source-moodle-b25-diary'
        || (value as { sourceId?: unknown }).sourceId === 'source-minna-069-conversation'
        || (value as { sourceId?: unknown }).sourceId === 'source-minna-072-conversation'
        || (value as { sourceId?: unknown }).sourceId === 'source-minna-074-true-false';
    for (const [key, item] of Object.entries(value)) {
        if (typeof item === 'string' && (
            (key === 'locator' && (item.startsWith('academy://audio/') || item.startsWith('academy/content/soya/audio/') || item.startsWith('academy/content/minna/audio/')))
            || (key === 'audioRef' && isPackagedListeningTask && (
                item.startsWith('academy/content/soya/audio/') || item.startsWith('academy/content/moodle/audio/') || item.startsWith('academy/content/minna/audio/')
            ))
        )) locators.add(item);
        else collectListeningLocators(item, locators);
    }
}
