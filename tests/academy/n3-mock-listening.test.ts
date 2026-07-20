import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    CUR007_N3_MOCK_LISTENING_AUDIT,
    validateCur007N3BatchAudit,
} from '../../src/academy/content/n3-mock-listening/audit';
import {
    N3_MOCK_LISTENING_PACKAGES,
    createN3MockListeningPackage,
} from '../../src/academy/content/n3-mock-listening/package';
import {
    createN3MockListeningRuntime,
    n3MockListeningPlugin,
} from '../../src/academy/content/n3-mock-listening/plugin';
import {
    N3_MOCK_LISTENING_PACKAGE_IDS,
    type N3MockListeningModel,
    type N3MockListeningResponse,
} from '../../src/academy/content/n3-mock-listening/types';
import { ACADEMY_LISTENING_SOURCE_BANK } from '../../src/academy/content/listening/source-bank/listening-source-bank';
import { createMemoryLearnerEventRepository } from '../../src/academy/domain/learner-record';
import { createLearnerEvidence } from '../../src/academy/evidence/learner-evidence';
import {
    ADVANCED_CURRICULUM,
    advancedPackageIdFromLessonId,
} from '../../src/academy/content/advanced-curriculum';

const SOYA_ROOT = process.env.YOMU_SOYA_RESEARCH_ROOT
    ?? path.resolve(process.cwd(), '../yomu/references/soya-research');
const SOYA_SOURCE = path.join(SOYA_ROOT, 'extracted-src-all/data/courses/jlpt_n3/mock1_listening.js');
const OFFICIAL_ROOT = process.env.YOMU_JAPANESE_ROOT
    ?? path.resolve(process.cwd(), '../../Japanese');
const OFFICIAL_N3_ROOT = path.join(OFFICIAL_ROOT, 'Official Sources/N3 Opening 2026-07-18/JLPT 2009');
const AUDIT_RECORDS = new Map(CUR007_N3_MOCK_LISTENING_AUDIT.records.map(record => [record.id, record]));

afterEach(() => document.body.replaceChildren());

describe('CUR-007 N3 mock-listening recovery batch', () => {
    it('closes the frozen 36-item denominator with per-item fail-closed verdicts', () => {
        expect(validateCur007N3BatchAudit()).toEqual([]);
        expect(CUR007_N3_MOCK_LISTENING_AUDIT.denominator).toEqual({
            total: 36,
            soya: 28,
            official: 8,
            byFunction: {
                'task-comprehension': { soya: 6, official: 2 },
                'point-comprehension': { soya: 6, official: 2 },
                'overview-comprehension': { soya: 3, official: 1 },
                'expression-choice': { soya: 4, official: 1 },
                'quick-response': { soya: 9, official: 2 },
            },
        });
        expect(CUR007_N3_MOCK_LISTENING_AUDIT.globalSoyaQuestionMap).toEqual({
            total: 487,
            reviewedBeforeBatch: 2,
            overlapWithBatch: 1,
            newlyReviewed: 27,
            reviewedAfterBatch: 29,
            remaining: 458,
        });
        for (const record of CUR007_N3_MOCK_LISTENING_AUDIT.records) {
            expect(record).toMatchObject({
                level: 'N3',
                skill: 'listening',
                answer: { verdict: 'verified-single-answer' },
                media: { verdict: 'not-shippable' },
                reachability: { status: 'learner-route' },
            });
            expect(record.wording.verdict).toMatch(/^not-shippable-/u);
            expect(record.source.locator).not.toContain('/Users/');
            expect(record.reachability.lessonId).toBe(`advanced:${record.adaptation.packageId}`);
            expect(record.canonical.srsIdentity).toMatch(/^srs:cur007:/u);
            expect(record.adaptation.learnerSkills).toContain('listening');
            expect(record.adaptation).toMatchObject({ sourceContentReuse: 'none' });
            expect(record.adaptation.note.length).toBeGreaterThanOrEqual(20);
        }
        expect(new Set(CUR007_N3_MOCK_LISTENING_AUDIT.records.map(record => record.canonical.srsIdentity)).size).toBe(28);
    });

    it('pins all 28 private Soya source objects and audio payloads when the research root is present', async () => {
        if (!existsSync(SOYA_SOURCE)) return;
        expect(await sha256File(SOYA_SOURCE)).toBe('2c37b6f24b68c60f1abb234157e3428bad5da7690a3d51b11ee2c0b5cb8a6e71');
        const sourceItems = loadExternalSoyaItems();
        const learnerBatch = JSON.stringify(N3_MOCK_LISTENING_PACKAGES);
        expect(sourceItems).toHaveLength(28);
        for (const item of sourceItems) {
            const record = AUDIT_RECORDS.get(`soya:n3-mock1:${item.id}`);
            expect(record, item.id).toBeDefined();
            expect(sha256(JSON.stringify(item)), item.id).toBe(record?.source.itemSha256);
            expect(Array.isArray(item.answers), item.id).toBe(true);
            expect(item.answers, item.id).toHaveLength(1);
            expect(answerResolvesToOption(item.answers, item.options), item.id).toBe(true);
            const audioPath = path.join(SOYA_ROOT, 'audio-public', record!.media.locator);
            expect(statSync(audioPath).size, item.id).toBe(record?.media.bytes);
            expect(await sha256File(audioPath), item.id).toBe(record?.media.sha256);

            const learnerQuestion = N3_MOCK_LISTENING_PACKAGES
                .flatMap(packageRecord => packageRecord.activity.payload.questions)
                .find(question => question.sourceCandidateId === record?.id);
            expect(learnerQuestion, item.id).toBeDefined();
            const learnerWording = JSON.stringify({
                audioText: learnerQuestion!.audioText,
                prompt: learnerQuestion!.prompt,
                options: learnerQuestion!.options,
                explanation: learnerQuestion!.explanation,
            });
            const protectedStrings = collectStrings([item.script, item.options, item.english, item.explanation])
                .map(value => value.trim())
                .filter(value => value.length >= 12);
            expect(protectedStrings.length, item.id).toBeGreaterThan(0);
            protectedStrings.forEach(value => {
                expect(learnerWording, `${item.id} question: ${value.slice(0, 12)}`).not.toContain(value);
                expect(learnerBatch, `${item.id} batch: ${value.slice(0, 12)}`).not.toContain(value);
            });
        }
    }, 30_000);

    it('pins the official question, script, answer, and audio artifacts when the Japanese evidence root is present', async () => {
        if (!existsSync(OFFICIAL_N3_ROOT)) return;
        const expected = new Map([
            ['N3-mondai.pdf', 'ba622e5b3a1d0de40cc390c1abe3aba7928948a3242b88e3afe45b391e8b7444'],
            ['N3-script.pdf', '46d69fb5969fd5e38dc394b23c626139908fc7d0b1eecd97ed9196438cbb8b97'],
            ['N3-seikai.pdf', 'd143b461b95ecc347fe674251aed30ce4eef1a79af4327c9ce0ee6af6f8861d5'],
            ['N3Sample.mp3', 'c637ea91f6f6e51aa085214712642138d76f6d5590ee6518b8d4d635102be3c0'],
        ]);
        for (const [fileName, hash] of expected) {
            expect(await sha256File(path.join(OFFICIAL_N3_ROOT, fileName)), fileName).toBe(hash);
        }
        const officialRecords = CUR007_N3_MOCK_LISTENING_AUDIT.records.filter(record => record.sourceFamily === 'official-jlpt');
        expect(officialRecords).toHaveLength(8);
        officialRecords.forEach(record => {
            expect(record.rights).toMatchObject({
                verdict: 'blocked-publication-use-not-cleared',
                evidenceLocator: 'https://www.jlpt.jp/e/policy.html',
                checkedOn: '2026-07-20',
            });
            expect(record.wording.verdict).toBe('not-shippable-format-calibration-only');
            expect(record.source.companionArtifactSha256).toEqual([
                expected.get('N3-script.pdf'),
                expected.get('N3-seikai.pdf'),
                expected.get('N3Sample.mp3'),
            ]);
        });
    }, 30_000);

    it('maps every Soya candidate and official calibration to five ordered learner packages', () => {
        expect(N3_MOCK_LISTENING_PACKAGES.map(packageRecord => packageRecord.id)).toEqual(N3_MOCK_LISTENING_PACKAGE_IDS);
        expect(N3_MOCK_LISTENING_PACKAGES.map(packageRecord => packageRecord.sequence)).toEqual([
            { ordinal: 1 },
            { ordinal: 2, previousPackageId: N3_MOCK_LISTENING_PACKAGE_IDS[0] },
            { ordinal: 3, previousPackageId: N3_MOCK_LISTENING_PACKAGE_IDS[1] },
            { ordinal: 4, previousPackageId: N3_MOCK_LISTENING_PACKAGE_IDS[2] },
            { ordinal: 5, previousPackageId: N3_MOCK_LISTENING_PACKAGE_IDS[3] },
        ]);
        expect(N3_MOCK_LISTENING_PACKAGES.map(packageRecord => packageRecord.activity.payload.questions.length)).toEqual([6, 6, 3, 4, 9]);
        expect(N3_MOCK_LISTENING_PACKAGES.flatMap(packageRecord => packageRecord.activity.payload.questions)).toHaveLength(28);
        expect(N3_MOCK_LISTENING_PACKAGES.flatMap(packageRecord => packageRecord.activity.provenance.officialCalibrationIds)).toHaveLength(8);
        const quickResponseAnswerPositions = N3_MOCK_LISTENING_PACKAGES[4].activity.payload.questions
            .map(question => question.options.findIndex(option => option.id === question.correctOptionId));
        expect(quickResponseAnswerPositions.filter(position => position === 0)).toHaveLength(3);
        expect(quickResponseAnswerPositions.filter(position => position === 1)).toHaveLength(3);
        expect(quickResponseAnswerPositions.filter(position => position === 2)).toHaveLength(3);
        N3_MOCK_LISTENING_PACKAGES.forEach((packageRecord, index) => {
            expect(createN3MockListeningPackage(packageRecord.id)).toBe(packageRecord);
            expect(packageRecord.activity.provenance).toMatchObject({
                contentAuthorship: 'original-yomu',
                sourceWordingDelivered: false,
                sourceMediaDelivered: false,
            });
            expect(packageRecord.activity.payload.teaching).toHaveLength(2);
            if (index > 0) expect(packageRecord.readerSrs.delayedReviewOf.length).toBeGreaterThan(0);
            packageRecord.activity.payload.questions.forEach(question => {
                expect(AUDIT_RECORDS.get(question.sourceCandidateId)?.adaptation).toMatchObject({
                    packageId: packageRecord.id,
                    learnerItemId: question.id,
                });
                expect(AUDIT_RECORDS.get(question.sourceCandidateId)?.canonical.conceptId).toBe(question.conceptId);
                if (question.officialCalibrationId) {
                    const official = AUDIT_RECORDS.get(question.officialCalibrationId);
                    const soya = AUDIT_RECORDS.get(question.sourceCandidateId);
                    expect(official?.adaptation.packageId).toBe(packageRecord.id);
                    expect(official?.canonical.conceptId).toBe(question.conceptId);
                    expect(official?.canonical.srsIdentity).toBe(soya?.canonical.srsIdentity);
                }
                [
                    question.audioText,
                    question.prompt.ja,
                    question.explanation.ja,
                    ...question.options.map(option => option.label.ja),
                ].forEach(value => expect(value).toMatch(/[ぁ-んァ-ヶ一-龠]/u));
                expect(question.audioText).not.toMatch(/https?:|\/audio\/|soya-eagle|N3Sample/u);
                expect(question.options.filter(option => option.id === question.correctOptionId)).toHaveLength(1);
            });
            expect(JSON.stringify(packageRecord)).not.toContain('未翻訳');
            if (packageRecord.activity.payload.production) {
                expect(packageRecord.activity.payload.production.modelAnswer).toMatch(/[ぁ-んァ-ヶ一-龠]/u);
            }
        });
        expect(() => createN3MockListeningPackage('missing' as never)).toThrow(/Unknown N3 mock-listening package/);
    });

    it('keeps the detailed private evidence ledger out of runtime imports and the public bundle', () => {
        const runtimeSources = [
            'src/academy/content/n3-mock-listening/package.ts',
            'src/academy/content/n3-mock-listening/plugin.ts',
            'src/academy/content/n3-mock-listening/registry.ts',
        ].map(file => readFileSync(path.resolve(file), 'utf8')).join('\n');
        const barrel = readFileSync(path.resolve('src/academy/content/n3-mock-listening/index.ts'), 'utf8');
        const publicBundle = readFileSync(path.resolve('docs/public/academy/app.js'), 'utf8');
        const baselineBundle = execFileSync('git', ['show', 'HEAD:docs/public/academy/app.js'], {
            encoding: 'utf8',
            maxBuffer: 30 * 1024 * 1024,
        });
        expect(runtimeSources).not.toContain("from './audit'");
        expect(runtimeSources).not.toContain('SOYA_SOURCE_SHA256');
        expect(runtimeSources).not.toContain('audioSha256');
        expect(barrel).not.toContain("'./audit'");
        const privateSoyaHashes = CUR007_N3_MOCK_LISTENING_AUDIT.records
            .filter(record => record.sourceFamily === 'soya')
            .flatMap(record => [record.source.itemSha256!, record.media.sha256]);
        expect(privateSoyaHashes).toHaveLength(56);
        const currentExposedHashes = privateSoyaHashes.filter(hash => publicBundle.includes(hash));
        const baselineExposedHashes = privateSoyaHashes.filter(hash => baselineBundle.includes(hash));
        expect(currentExposedHashes).toEqual(baselineExposedHashes);
        expect(currentExposedHashes).toEqual([
            '75d494710c9fe11243553ce71a8f30fa7395c456a0b014636ef89054c42e11f6',
            '07a2a5a708f5a6ea42e435d8df261fbca7f00e7ffe3cab587a450b177583c4c3',
        ]);
        expect(publicBundle.includes('blocked-no-redistribution-record')).toBe(false);
        expect(publicBundle.includes('blocked-publication-use-not-cleared')).toBe(false);
    });

    it('validates, grades deterministic answers, and creates targeted repair seeds', () => {
        expect(n3MockListeningPlugin.kind).toBe('academy-n3-mock-listening');
        const runtime = createN3MockListeningRuntime();
        for (const packageRecord of N3_MOCK_LISTENING_PACKAGES) {
            expect(runtime.validate(packageRecord.activity), packageRecord.id).toEqual([]);
            const response = correctResponse(packageRecord.activity);
            const pass = runtime.evaluate(packageRecord.activity, response);
            expect(pass.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
            expect(pass.reviewSeeds.every(seed => seed.reason === 'new-learning')).toBe(true);
        }

        const point = N3_MOCK_LISTENING_PACKAGES[1].activity;
        const response = correctResponse(point);
        const lapse = createN3MockListeningRuntime().evaluate(point, {
            ...response,
            answers: response.answers.map((answer, index) => index === 0
                ? { ...answer, optionId: point.payload.questions[0].options[0].id }
                : answer),
        });
        expect(lapse.result.outcome).toBe('lapse');
        expect(lapse.result.errorTags).toEqual(['point-elimination']);
        expect(lapse.reviewSeeds).toHaveLength(1);
        expect(lapse.reviewSeeds[0]).toMatchObject({ reason: 'repair', conceptId: 'listening:n3-distractor-elimination' });

        const expression = N3_MOCK_LISTENING_PACKAGES[3].activity;
        const weakProduction = correctResponse(expression);
        const productionLapse = createN3MockListeningRuntime().evaluate(expression, { ...weakProduction, production: 'もう一度。' });
        expect(productionLapse.result.errorTags).toContain('expression-spoken-transfer');
        expect(productionLapse.reviewSeeds.some(seed => seed.content.expression === '恐れ入りますが')).toBe(true);
    });

    it('persists a real advanced-route attempt and its SRS seeds through learner evidence', async () => {
        const packageRecord = N3_MOCK_LISTENING_PACKAGES[4];
        const evaluation = createN3MockListeningRuntime().evaluate(
            packageRecord.activity,
            correctResponse(packageRecord.activity),
        );
        const repository = createMemoryLearnerEventRepository();
        const ingest = vi.fn(async () => undefined);
        const evidence = createLearnerEvidence(repository, {
            ingest,
            async due() { return []; },
            async rate() {},
        });
        await evidence.initialize();

        await expect(evidence.recordActivity(evaluation, `advanced:${packageRecord.id}`)).resolves.toBeUndefined();
        expect((await repository.readAll()).filter(event => event.kind === 'attempt-recorded')).toEqual([
            expect.objectContaining({
                activityId: packageRecord.activity.id,
                sourceQuestionId: packageRecord.activity.sourceQuestionId,
                outcome: 'pass',
            }),
        ]);
        expect(ingest).toHaveBeenCalledWith(evaluation.reviewSeeds);

        await expect(evidence.recordActivity({
            ...evaluation,
            attempt: { ...evaluation.attempt, activityId: 'activity:not-this-package' },
        }, `advanced:${packageRecord.id}`)).rejects.toThrow(/does not match/u);
    });

    it('teaches before practice and reveals only original transcripts, answers, and models after commitment', async () => {
        const runtime = createN3MockListeningRuntime();
        const packageRecord = N3_MOCK_LISTENING_PACKAGES[3];
        const hostElement = document.createElement('main');
        const playback = vi.fn(async () => ({ dispose() {} }));
        const onEvaluation = vi.fn();
        const controller = runtime.mount(packageRecord.activity, {
            language: 'en',
            replace(view) { hostElement.replaceChildren(view); },
            announce() {},
            playPronunciation: playback,
            registerReadingSurface() { return () => undefined; },
        }, onEvaluation);

        const phases = [...hostElement.querySelectorAll<HTMLElement>('[data-lesson-phase], [data-practice-phase]')];
        expect(phases[0]?.dataset.lessonPhase).toBe('instruction');
        expect(hostElement.querySelector('[data-answer-key]')).toBeNull();
        expect(hostElement.querySelector('[data-original-transcript]')).toBeNull();
        expect(hostElement.querySelector('[data-model-answer]')).toBeNull();
        expect(hostElement.textContent).not.toContain(packageRecord.activity.payload.questions[0].audioText);
        expect(hostElement.textContent).not.toContain(packageRecord.activity.payload.production?.modelAnswer);

        hostElement.querySelector<HTMLButtonElement>('[data-original-yomu-playback]')?.click();
        await vi.waitFor(() => expect(playback).toHaveBeenCalledWith(packageRecord.activity.payload.questions[0].audioText));
        completeForm(hostElement, packageRecord.activity);
        hostElement.querySelector<HTMLFormElement>('form')?.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(hostElement.querySelectorAll('[data-answer-key="after-attempt"]')).toHaveLength(4));
        expect(hostElement.querySelectorAll('[data-original-transcript="after-attempt"]')).toHaveLength(4);
        expect(hostElement.textContent).toContain(packageRecord.activity.payload.questions[0].audioText);
        expect(hostElement.textContent).toContain(packageRecord.activity.payload.production?.modelAnswer);
        controller.dispose();
    });

    it('is reachable through the real advanced route without promoting source recordings', () => {
        const routeIds = N3_MOCK_LISTENING_PACKAGE_IDS.map(id => `advanced:${id}` as const);
        routeIds.forEach((lessonId, index) => {
            expect(advancedPackageIdFromLessonId(lessonId)).toBe(N3_MOCK_LISTENING_PACKAGE_IDS[index]);
            expect(ADVANCED_CURRICULUM.some(entry => entry.lessonId === lessonId)).toBe(true);
        });
        expect(ACADEMY_LISTENING_SOURCE_BANK.inventory.sourceFamilies.soya).toMatchObject({
            facts: {
                itemReviewedCandidates: 29,
                mechanicAdaptedCandidates: 28,
                remainingUnreviewedCandidates: 458,
            },
            selected: { recordings: 2, tasks: 2 },
        });
    });
});

function correctResponse(model: N3MockListeningModel): N3MockListeningResponse {
    return {
        answers: model.payload.questions.map(question => ({ questionId: question.id, optionId: question.correctOptionId })),
        ...(model.payload.production ? { production: model.payload.production.modelAnswer } : {}),
    };
}

function completeForm(host: HTMLElement, model: N3MockListeningModel): void {
    model.payload.questions.forEach(question => {
        const input = host.querySelector<HTMLInputElement>(`input[name="${question.id}"][value="${question.correctOptionId}"]`);
        if (input) input.checked = true;
    });
    if (model.payload.production) {
        const textarea = host.querySelector<HTMLTextAreaElement>(`textarea[name="${model.payload.production.id}"]`);
        if (textarea) textarea.value = model.payload.production.modelAnswer;
    }
}

function sha256(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}

function collectStrings(value: unknown): string[] {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(collectStrings);
    if (value && typeof value === 'object') return Object.values(value).flatMap(collectStrings);
    return [];
}

function answerResolvesToOption(answers: unknown, options: unknown): boolean {
    if (!Array.isArray(answers) || answers.length !== 1 || !Array.isArray(options)) return false;
    const answer = answers[0];
    if (typeof answer !== 'string') return false;
    if (options.includes(answer)) return true;
    return /^\d+$/u.test(answer) && Number(answer) >= 1 && Number(answer) <= options.length;
}

function loadExternalSoyaItems(): Array<Record<string, unknown> & {
    id: string;
    english: unknown;
    explanation: unknown;
    options: unknown;
    answers: unknown;
    script: unknown;
}> {
    const moduleUrl = pathToFileURL(SOYA_SOURCE).href;
    const dynamicImport = ['im', 'port'].join('');
    const script = `const source = await ${dynamicImport}(${JSON.stringify(moduleUrl)}); process.stdout.write(JSON.stringify(source.n3_mock1_listening));`;
    return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
    })) as ReturnType<typeof loadExternalSoyaItems>;
}

function sha256File(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = createHash('sha256');
        createReadStream(filePath)
            .on('data', chunk => hash.update(chunk))
            .on('error', reject)
            .on('end', () => resolve(hash.digest('hex')));
    });
}
