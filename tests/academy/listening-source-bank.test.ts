import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import bindingsJson from '../../public/academy/content/listening/listening-task-bindings.v1.json';
import manifestJson from '../../src/academy/content/listening/source-bank/listening-source-bank.v1.json';
import {
    ACADEMY_LISTENING_SOURCE_BANK,
    JLPT_LISTENING_PROGRESSION,
    canonicalListeningTranscriptText,
    findListeningSourceBankEntry,
    getListeningSourceBankEntry,
    listListeningSourceBankEntries,
    listListeningSourceBankExclusions,
    parseListeningSourceBankManifest,
    resolveListeningSourceBankEntry,
    resolveListeningSourceBankLevel,
    type ListeningSourceBankEntry,
    type ListeningTranscriptLine,
} from '../../src/academy/content/listening/source-bank/listening-source-bank';
import { sha256File } from './helpers/hash-memo';

interface MutableManifest {
    levels: Record<string, {
        sourceFamily: string;
        source: { assetId: string };
        transcript: {
            storage: string;
            localPath?: string;
            coverage: Array<{ taskId: string; lineNumbers: number[] }>;
        };
        tasks: Array<{
            id: string;
            answer: Record<string, unknown>;
        }>;
        release: Record<string, unknown>;
    }>;
    inventory: {
        sourceFamilies: Record<string, {
            selected: { recordings: number; tasks: number };
        }>;
    };
    exclusions: Array<{
        id: string;
        sourceFamily: string;
        blockedBy: string[];
    }>;
}

interface TranscriptSidecar {
    schema: string;
    entryId: string;
    lines: ListeningTranscriptLine[];
}

const EXPECTED_LEVELS = ['n5', 'n4', 'n3', 'n2', 'n1'] as const;
const SOURCE_BANK_DIR = path.resolve('src/academy/content/listening/source-bank');

describe('Academy listening source bank', () => {
    it('publishes one exact, progressively ordered source entry for every JLPT band', () => {
        const entries = listListeningSourceBankEntries();

        expect(JLPT_LISTENING_PROGRESSION).toEqual(EXPECTED_LEVELS);
        expect(entries.map(entry => entry.level)).toEqual(EXPECTED_LEVELS);
        expect(entries.map(entry => entry.tasks.length)).toEqual([3, 4, 1, 1, 10]);
        expect(entries.reduce((total, entry) => total + entry.tasks.length, 0)).toBe(19);
        expect(entries.map(entry => entry.source.sha256)).toEqual([
            '7a7f9cf7c9d0a10932007df1528f10fdfd7c0f38fe59bb938aa7a6952ccc47c8',
            '360cef1923b1e824f22ec5ebdaf18896e87846c8c9019f25228da60675c79834',
            '07a2a5a708f5a6ea42e435d8df261fbca7f00e7ffe3cab587a450b177583c4c3',
            '1490d0b5f287864b014fed4ea26e5ad4c10ef702658e5c527943340976ee4d4b',
            'c1d18d224b6036ae0fbe6beb63a6e705969fa38b4df2bac84cddc3a0df4ef72c',
        ]);
        expect(entries.every(entry => entry.pairing.status === 'verified')).toBe(true);
        expect(entries.every(entry => entry.pairing.evidence.some(evidence => evidence.kind === 'task-source'))).toBe(true);
        expect(entries.every(entry => entry.pairing.evidence.some(evidence => evidence.kind === 'transcript-source'))).toBe(true);
        expect(Object.isFrozen(ACADEMY_LISTENING_SOURCE_BANK)).toBe(true);
        expect(Object.isFrozen(entries[0]?.tasks)).toBe(true);
    });

    it('retains the exact prompts and does not manufacture N2 distractors', () => {
        expect(getListeningSourceBankEntry('n5').tasks.map(task => task.prompt)).toEqual([
            '小川さんは １日に {3 4 5} 回 食べます。',
            'ミラーさんは １年に {1 10 12} 回 出張します。',
            'タワポンさんは １週間に {4 5 7} 回 アルバイトを します。',
        ]);
        expect(getListeningSourceBankEntry('n4').tasks.map(task => task.prompt)).toEqual([
            'ワンさんは どんな 部屋を 探していますか。',
            'この 部屋の 家賃は いくらですか。',
            '駅から 何分 かかりますか。',
            '今日 この 部屋を 見る ことが できますか。',
        ]);
        expect(getListeningSourceBankEntry('n3').tasks[0]).toMatchObject({
            kind: 'single-choice',
            prompt: '男の人がこのスマートフォンを選んだ理由は何ですか。',
            answer: { choiceId: 'battery' },
        });
        expect(getListeningSourceBankEntry('n2').tasks[0]).toEqual(expect.objectContaining({
            kind: 'short-answer',
            prompt: '男の人は、時短家電について主に何が大切だと言っていますか。',
            answer: { accepted: ['生まれた時間をどう活用するかを考えること'] },
        }));
        expect(getListeningSourceBankEntry('n1').tasks.map(task => task.answer)).toEqual([
            { choiceId: 'b' }, { choiceId: 'b' }, { choiceId: 'a' }, { choiceId: 'a' }, { choiceId: 'a' },
            { choiceId: 'a' }, { choiceId: 'a' }, { choiceId: 'b' }, { choiceId: 'b' }, { choiceId: 'b' },
        ]);
    });

    it('records all five on-disk families and honestly excludes zero-pairing Genki audio', () => {
        const inventory = ACADEMY_LISTENING_SOURCE_BANK.inventory;

        expect(Object.keys(inventory.sourceFamilies).sort()).toEqual(['genki', 'jlpt-library', 'minna', 'moodle', 'soya']);
        expect(inventory.sourceFamilies.moodle.facts).toMatchObject({
            audioOccurrences: 185,
            uniqueAudioPayloads: 146,
            exactTaskBoundPayloads: 11,
        });
        expect(inventory.sourceFamilies.soya.facts).toMatchObject({
            audioFiles: 58920,
            jlptQuestionMapRecords: 487,
            staticCompleteJlptTasks: 386,
            n1BrowserTtsFallbackRecords: 30,
        });
        expect(inventory.sourceFamilies.minna.facts).toMatchObject({ audioFiles: 87, exactMoodlePayloads: 30 });
        expect(inventory.sourceFamilies.genki).toMatchObject({
            archiveSha256: 'da8ee188f74cb9fbbe47ae197e150dbe8e83b4f6d80095a48bb0dbb78ad4c8ac',
            facts: { audioFiles: 464, exactMoodlePayloads: 0, verifiedTaskPairings: 0 },
            selected: { recordings: 0, tasks: 0 },
            runtime: 'excluded-no-verified-pairing',
        });
        expect(inventory.sourceFamilies['jlpt-library'].facts).toMatchObject({
            shinKanzenListeningAudioFilesN3ToN1: 445,
            verifiedTaskPairings: 1,
        });
        expect(listListeningSourceBankExclusions('genki')).toEqual([
            expect.objectContaining({
                id: 'genki-no-verified-task-pairing',
                blockedBy: expect.arrayContaining(['task-pairing-unverified', 'rights-review-required']),
            }),
        ]);
        expect(listListeningSourceBankExclusions('soya')).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'soya-n1-browser-tts-only' }),
        ]));
        expect(listListeningSourceBankExclusions('jlpt-library')).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'n1-a07-delivery-rights' }),
        ]));
    });

    it('fails closed: every current entry is blocked and no delivery URL or binary is added', () => {
        for (const level of EXPECTED_LEVELS) {
            expect(resolveListeningSourceBankLevel(level)).toMatchObject({
                status: 'blocked',
                releaseState: 'rights-review-required',
            });
        }
        expect(findListeningSourceBankEntry('n1-shin-kanzen-a07-minimal-pairs')).toBe(getListeningSourceBankEntry('n1'));
        expect(findListeningSourceBankEntry('missing-entry')).toBeUndefined();
        expect(JSON.stringify(ACADEMY_LISTENING_SOURCE_BANK)).not.toMatch(/"url"|packaged-static/iu);
        expect(walkFiles(SOURCE_BANK_DIR).filter(file => /\.(?:mp3|m4a|wav|ogg)$/iu.test(file))).toEqual([]);
    });

    it('cross-checks every claimed existing registry binding and audio identity', () => {
        const bindingByTask = new Map(bindingsJson.entries.map(binding => [
            `${binding.packageId}/${binding.sourceQuestionId}`,
            binding,
        ]));
        const existingBindings = listListeningSourceBankEntries().flatMap(entry => entry.tasks.flatMap(task =>
            task.registry.status === 'existing-binding' ? [{ entry, registry: task.registry }] : []));

        expect(existingBindings).toHaveLength(7);
        for (const { entry, registry } of existingBindings) {
            expect(bindingByTask.get(`${registry.packageId}/${registry.sourceQuestionId}`)).toMatchObject({
                packageId: registry.packageId,
                sourceQuestionId: registry.sourceQuestionId,
                source: { audioSha256: entry.source.sha256 },
            });
        }
    });

    it('verifies canonical hashes for every inline transcript', () => {
        for (const entry of listListeningSourceBankEntries()) {
            if (entry.transcript.storage !== 'inline') continue;
            expect(sha256Text(canonicalListeningTranscriptText(entry.transcript.lines))).toBe(entry.transcript.sha256);
            expect(entry.transcript.lines).toHaveLength(entry.transcript.lineCount);
        }
    });

    it('rejects missing levels, unknown release states, and approval without Worker evidence', () => {
        const missingLevel = mutableManifest();
        delete missingLevel.levels.n1;
        expect(() => parseListeningSourceBankManifest(missingLevel)).toThrow(/levels must contain exactly/iu);

        const unknownRelease = mutableManifest();
        unknownRelease.levels.n5!.release = { state: 'probably-approved', reason: 'No.' };
        expect(() => parseListeningSourceBankManifest(unknownRelease)).toThrow(/unknown release state/iu);

        const incompleteApproval = mutableManifest();
        incompleteApproval.levels.n5!.release = {
            state: 'approved',
            reason: 'Approval without delivery must still fail.',
            approval: { authority: 'reviewer', approvedOn: '2026-07-18', evidenceRef: 'review/1' },
        };
        expect(() => parseListeningSourceBankManifest(incompleteApproval)).toThrow(/release\.worker must be an object/iu);
    });

    it('allows only a fully evidenced approval and returns an authenticated-router resource, never a URL', () => {
        const candidate = mutableManifest();
        const n5 = candidate.levels.n5!;
        n5.release = {
            state: 'approved',
            reason: 'Test-only approval fixture.',
            approval: {
                authority: 'test-reviewer',
                approvedOn: '2026-07-18',
                evidenceRef: 'test://approval/n5',
            },
            worker: {
                assetId: n5.source.assetId,
                purpose: 'audio',
                access: 'academy-session-or-signed',
            },
        };

        const parsed = parseListeningSourceBankManifest(candidate);
        const resolved = resolveListeningSourceBankEntry(parsed.levels.n5);
        expect(resolved).toEqual(expect.objectContaining({
            status: 'ready',
            resource: {
                assetId: n5.source.assetId,
                kind: 'audio',
                mediaType: 'audio/mpeg',
                readiness: { state: 'ready' },
            },
        }));
        expect(JSON.stringify(resolved)).not.toContain('"url"');

        const blockedWithWorker = mutableManifest();
        blockedWithWorker.levels.n5!.release.worker = n5.release.worker;
        expect(() => parseListeningSourceBankManifest(blockedWithWorker)).toThrow(/cannot carry approval or delivery while blocked/iu);
    });

    it('rejects invented Genki inclusion, broken task coverage, and invalid answer keys', () => {
        const genki = mutableManifest();
        genki.levels.n5!.sourceFamily = 'genki';
        expect(() => parseListeningSourceBankManifest(genki)).toThrow(/unsupported or unverified source family/iu);

        const missingCoverage = mutableManifest();
        missingCoverage.levels.n5!.transcript.coverage.pop();
        expect(() => parseListeningSourceBankManifest(missingCoverage)).toThrow(/cover every task exactly once/iu);

        const badAnswer = mutableManifest();
        badAnswer.levels.n5!.tasks[0]!.answer.choiceId = 'not-a-choice';
        expect(() => parseListeningSourceBankManifest(badAnswer)).toThrow(/answers an unknown choice/iu);

        const escapedSidecar = mutableManifest();
        escapedSidecar.levels.n4!.transcript.localPath = '../transcript.json';
        expect(() => parseListeningSourceBankManifest(escapedSidecar)).toThrow(/ignored local transcript directory/iu);
    });
});

for (const entry of listListeningSourceBankEntries()) {
    const localSourcePath = resolvePrivateLocator(entry.source.localPath);
    const localSourceExists = fs.existsSync(localSourcePath);
    const verifyLocalSource = localSourceExists ? it : it.skip;
    verifyLocalSource(`local source bytes: ${entry.level} (skips explicitly when ${localSourcePath} is absent)`, () => {
        expect(fs.statSync(localSourcePath).size).toBe(entry.source.bytes);
        expect(sha256File(localSourcePath)).toBe(entry.source.sha256);
    });
}

for (const entry of listListeningSourceBankEntries().filter(hasLocalTranscript)) {
    const localPath = path.resolve(entry.transcript.localPath);
    const localTranscriptExists = fs.existsSync(localPath);
    const verifyLocalTranscript = localTranscriptExists ? it : it.skip;
    verifyLocalTranscript(`local transcript sidecar: ${entry.level} (skips explicitly when ${localPath} is absent)`, () => {
        const raw = fs.readFileSync(localPath);
        const sidecar = JSON.parse(raw.toString('utf8')) as TranscriptSidecar;

        expect(sidecar).toMatchObject({
            schema: 'yomu-academy.listening-transcript/v1',
            entryId: entry.id,
        });
        expect(sidecar.lines).toHaveLength(entry.transcript.lineCount);
        expect(sha256Bytes(raw)).toBe(entry.transcript.localFileSha256);
        expect(sha256Text(canonicalListeningTranscriptText(sidecar.lines))).toBe(entry.transcript.sha256);
    });
}

function hasLocalTranscript(entry: ListeningSourceBankEntry): entry is ListeningSourceBankEntry & {
    transcript: Extract<ListeningSourceBankEntry['transcript'], { storage: 'local-sidecar' }>;
} {
    return entry.transcript.storage === 'local-sidecar';
}

function resolvePrivateLocator(locator: string): string {
    const roots = [
        ['/private/yomu-repo/', process.cwd()],
        ['/private/yomu-references/', path.resolve(process.cwd(), '../..', 'references')],
        ['/private/yomu-project/', path.resolve(process.cwd(), '../..')],
        ['/private/source-downloads/', path.join(homedir(), 'Downloads')],
        [
            '/private/japanese-library/',
            process.env.ACADEMY_LIBRARY_ROOT ?? path.join(homedir(), 'Documents/Japanese'),
        ],
    ] as const;
    const match = roots.find(([prefix]) => locator.startsWith(prefix));
    return match ? path.join(match[1], locator.slice(match[0].length)) : locator;
}

function mutableManifest(): MutableManifest {
    return JSON.parse(JSON.stringify(manifestJson)) as MutableManifest;
}

function sha256Text(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sha256Bytes(value: Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}

function walkFiles(root: string): readonly string[] {
    return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
        const entryPath = path.join(root, entry.name);
        return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
    });
}
