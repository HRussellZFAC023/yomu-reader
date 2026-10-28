import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    N2_EXTENSIVE_READING_PACKAGES,
    N2_EXTENSIVE_READING_PROVENANCE,
    N2_EXTENSIVE_READING_SOURCE_PARAGRAPHS,
    canonicalN2ExtensiveReadingSourceItem,
    createN2ExtensiveReadingPackage,
    createN2ExtensiveReadingRuntime,
    resolveN2ExtensiveReadingPackage,
} from '../../src/academy/content/n2-extensive-reading';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';
import { filesHaveSameContent } from './helpers/hash-memo';

const SOYA_ROOT = path.resolve(process.cwd(), '../..', 'references/soya-research/extracted-src-all');
const PUBLIC_PACKAGE = path.resolve('public/academy/content/n2-extensive-reading/package.v1.json');
const OFFLINE_PATH = '/academy/content/n2-extensive-reading/package.v1.json';

afterEach(() => document.body.replaceChildren());

describe('N2-to-N1 extensive-reading package', () => {
    it('pins the exact permitted Soya item without exporting a machine-local path', () => {
        expect(sha256(canonicalN2ExtensiveReadingSourceItem())).toBe(N2_EXTENSIVE_READING_PROVENANCE.sourceItemSha256);
        expect(sha256(N2_EXTENSIVE_READING_SOURCE_PARAGRAPHS.join('\n'))).toBe(N2_EXTENSIVE_READING_PROVENANCE.sourcePassageSha256);
        expect(N2_EXTENSIVE_READING_PROVENANCE).toMatchObject({
            sourceScope: 'soya-research',
            relativePath: 'data/courses/jlpt_n2/mock_test_no1.js',
            payloadSha256: '4665de0aab5656717c930508ee9b92e60d11f71d5030482b86ea31b7a50b5aa5',
            sourceItemId: 'n2_m1_reading_long_2_1',
            answerVisibility: 'after-attempt',
            sourceMediaState: 'none-declared-or-delivered',
        });
        expect(JSON.stringify(N2_EXTENSIVE_READING_PROVENANCE)).not.toContain('/Users/');

        const sourceFile = path.join(SOYA_ROOT, N2_EXTENSIVE_READING_PROVENANCE.relativePath);
        if (existsSync(sourceFile)) {
            const bytes = readFileSync(sourceFile);
            const source = bytes.toString('utf8');
            expect(sha256(bytes)).toBe(N2_EXTENSIVE_READING_PROVENANCE.payloadSha256);
            const pool = Function(source.replace('export const n2_mock_no1_pool =', 'return'))() as SoyaReadingItem[];
            const item = pool.find(candidate => candidate.id === N2_EXTENSIVE_READING_PROVENANCE.sourceItemId);
            expect(item).toBeTruthy();
            expect(sha256(canonicalSoyaItem(item!))).toBe(N2_EXTENSIVE_READING_PROVENANCE.sourceItemSha256);
            expect(item!.passage.split('\n')).toEqual(N2_EXTENSIVE_READING_SOURCE_PARAGRAPHS);
        }
    });

    it('teaches the strategy before an untimed source reading, comprehension, and transfer', () => {
        const runtime = createN2ExtensiveReadingRuntime();
        const lesson = createN2ExtensiveReadingPackage();
        expect(runtime.validate(lesson.activity)).toEqual([]);
        expect(createAcademyActivityRuntime().validate(lesson.activity)).toEqual([]);
        expect(lesson.band).toBe('N2-to-N1');
        expect(lesson.prerequisites.map(item => item.conceptId)).toEqual([
            'reading:n2-main-idea', 'reading:n2-connectives', 'strategy:deferred-lookup',
        ]);
        expect(lesson.activity.payload.strategy.map(item => item.id)).toEqual(['preview', 'pivots', 'flow']);
        expect(lesson.activity.payload.source).toMatchObject({ authorship: 'exact-soya-source-item', timing: 'untimed' });
        expect(lesson.activity.payload.questions.map(question => question.stage)).toEqual([
            'source-comprehension', 'source-comprehension', 'source-comprehension', 'n1-transfer', 'n1-transfer',
        ]);
        expect(lesson.activity.payload.transfer).toMatchObject({ authorship: 'original-yomu-n1-transfer' });
    });

    it('grades all five judgments and emits only targeted lapse repair', () => {
        const runtime = createN2ExtensiveReadingRuntime();
        const { activity } = createN2ExtensiveReadingPackage();
        const correct = response(activity.payload.questions.map(question => [question.id, question.correctOptionId]));
        expect(runtime.evaluate(activity, correct)).toMatchObject({
            result: { outcome: 'pass', score: 1, errorTags: [] },
            reviewSeeds: [
                { reason: 'new-learning' }, { reason: 'new-learning' }, { reason: 'new-learning' },
                { reason: 'new-learning' }, { reason: 'new-learning' },
            ],
        });

        const missed = response(activity.payload.questions.map(question => [
            question.id,
            question.id === 'source-role' ? 'business-rule' : question.correctOptionId,
        ]));
        const lapse = runtime.evaluate(activity, missed);
        expect(lapse.result).toMatchObject({ outcome: 'lapse', score: 0.8, errorTags: ['source-paragraph-role'] });
        expect(lapse.reviewSeeds.map(seed => [seed.content.expression, seed.reason])).toEqual([['定着する', 'repair']]);
        expect(() => runtime.evaluate(activity, { answers: [] })).toThrow(/Every extensive-reading question/);
    });

    it('renders instruction, source, transfer, and optional reflection in order and registers every Reader surface', async () => {
        const runtime = createN2ExtensiveReadingRuntime();
        const { activity } = createN2ExtensiveReadingPackage();
        const host = document.createElement('main');
        document.body.append(host);
        const registered: string[] = [];
        const onEvaluation = vi.fn();
        const controller = runtime.mount(activity, {
            replace(view) { host.replaceChildren(view); },
            announce() {},
            registerReadingSurface(surface) {
                registered.push(surface.dataset.readerSurfaceId ?? '');
                return () => undefined;
            },
        }, onEvaluation);

        const instruction = host.querySelector<HTMLElement>('[data-lesson-phase="instruction"]')!;
        const source = host.querySelector<HTMLElement>('.academy-n2-extensive-reading-source')!;
        const transfer = host.querySelector<HTMLElement>('.academy-n2-extensive-reading-transfer')!;
        expect(instruction.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(source.compareDocumentPosition(transfer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(host.querySelectorAll('[data-reading-stage="source"] p')).toHaveLength(3);
        expect(host.querySelectorAll('[data-reading-stage="transfer"] p')).toHaveLength(2);
        expect(host.querySelectorAll('fieldset')).toHaveLength(5);
        expect(host.querySelector('[data-graded="false"] textarea')).not.toBeNull();
        expect(registered).toEqual(createN2ExtensiveReadingPackage().readerSrs.readerSurfaceIds);

        for (const question of activity.payload.questions) {
            host.querySelector<HTMLInputElement>(`input[name="${question.id}"][value="${question.correctOptionId}"]`)!.checked = true;
        }
        host.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        expect(onEvaluation.mock.calls[0]?.[0].result.outcome).toBe('pass');
        controller.dispose();
    });

    it('projects canonical Reader/SRS work and resolves through its immutable registry', () => {
        const lesson = createN2ExtensiveReadingPackage();
        expect(N2_EXTENSIVE_READING_PACKAGES).toEqual([lesson]);
        expect(Object.isFrozen(N2_EXTENSIVE_READING_PACKAGES)).toBe(true);
        expect(resolveN2ExtensiveReadingPackage(lesson.id)).toBe(N2_EXTENSIVE_READING_PACKAGES[0]);
        expect(() => resolveN2ExtensiveReadingPackage('unknown')).toThrow(/Unknown N2 extensive-reading package/);
        expect(lesson.readerSrs.readerSurfaceIds).toEqual([
            'reader:n2-extensive-reading-01:source:paragraph-1',
            'reader:n2-extensive-reading-01:source:paragraph-2',
            'reader:n2-extensive-reading-01:source:paragraph-3',
            'reader:n2-extensive-reading-01:transfer:paragraph-1',
            'reader:n2-extensive-reading-01:transfer:paragraph-2',
        ]);
        expect(lesson.readerSrs.miningRequests).toHaveLength(3);
        expect(lesson.readerSrs.miningRequests.every(request => request.sourceUrl === undefined)).toBe(true);
        expect(JSON.stringify(lesson.readerSrs)).not.toContain('/Users/');
    });

    it('publishes an answer-free offline descriptor in both hosted trees', () => {
        const source = JSON.parse(readFileSync(PUBLIC_PACKAGE, 'utf8'));
        expect(source.package).toMatchObject({ id: 'n2-extensive-reading-01', band: 'N2-to-N1' });
        expect(source.source).toMatchObject({
            itemId: 'n2_m1_reading_long_2_1',
            sourceAnswersDelivery: 'not-in-public-package',
        });
        expect(source.projections).toEqual({ readerSurfaces: 5, srsTargets: 5, miningRequests: 3 });
        expect(source.dependencies).toEqual({ network: 0, audio: 0, video: 0, externalMedia: 0 });
        expect(JSON.stringify(source)).not.toMatch(/\/Users\/|"answers"|wrong_answers/);
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/n2-extensive-reading/package.v1.json'), PUBLIC_PACKAGE)).toBe(true);
        for (const worker of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            expect(readFileSync(path.resolve(worker), 'utf8')).toContain(`'${OFFLINE_PATH}'`);
        }
    });
});

function sha256(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}

function response(items: readonly (readonly [string, string])[]) {
    return { answers: items.map(([questionId, optionId]) => ({ questionId, optionId })) };
}

interface SoyaReadingItem {
    readonly id: string;
    readonly type: string;
    readonly examSection: string;
    readonly timeLimit: number;
    readonly passage: string;
    readonly question: string;
    readonly answers: readonly string[];
    readonly wrong_answers: readonly string[];
}

function canonicalSoyaItem(item: SoyaReadingItem): string {
    return [
        item.id,
        item.type,
        item.examSection,
        String(item.timeLimit),
        item.passage,
        item.question,
        ...item.answers,
        ...item.wrong_answers,
    ].join('\n') + '\n';
}
