import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    canonicalN2PolicyScopeSourceLocus,
    createN2PolicyScopePackage,
    createN2PolicyScopeRuntime,
    N2_POLICY_SCOPE_PACKAGES,
    N2_POLICY_SCOPE_PROVENANCE,
    resolveN2PolicyScopePackage,
} from '../../src/academy/content/n2-policy-scope';

const LIBRARY_ROOT = process.env.ACADEMY_LIBRARY_ROOT ?? '/Users/heru/Documents/Japanese';

afterEach(() => document.body.replaceChildren());

describe('N2 policy-scope rehearsal package', () => {
    it('pins a permitted local Shin Kanzen source locus without exposing a machine-local path', () => {
        const sourceFile = path.join(LIBRARY_ROOT, N2_POLICY_SCOPE_PROVENANCE.relativePath);
        expect(sha256(canonicalN2PolicyScopeSourceLocus())).toBe(N2_POLICY_SCOPE_PROVENANCE.sourceLocusSha256);
        expect(N2_POLICY_SCOPE_PROVENANCE).toMatchObject({
            sourceScope: 'japanese-library',
            sourceFamily: 'shin-kanzen',
            sourceDocumentSha256: '9f71994c965a0fa9f7e44b9400fa5e6b9c2a97c09c8f28e2d9a1948ecb86967c',
            sourceDocumentByteLength: 69215273,
            sourcePageImageSha256: '19536c486a83cfa64311152208885cc24484d67f9380a05d0669b819e84b6b0b',
            sourceLocus: { pdfPage: 15, printedPage: 4, section: 'III:文章の文法', item: '問題15:空所1-5' },
            rights: {
                state: 'user-permitted-local-reference-only',
                sourceTextDelivery: 'not-delivered',
                sourceMediaDelivery: 'not-delivered',
                learnerActivityText: 'original-yomu-authored',
            },
        });
        expect(JSON.stringify(N2_POLICY_SCOPE_PROVENANCE)).not.toContain('/Users/');

        if (existsSync(sourceFile)) {
            const bytes = readFileSync(sourceFile);
            expect(sha256(bytes)).toBe(N2_POLICY_SCOPE_PROVENANCE.sourceDocumentSha256);
            expect(statSync(sourceFile).size).toBe(N2_POLICY_SCOPE_PROVENANCE.sourceDocumentByteLength);
        }
    });

    it('declares N3 prerequisites and resolves from its local registry', () => {
        const lesson = createN2PolicyScopePackage();
        expect(lesson.band).toBe('N2');
        expect(lesson.prerequisites.map(item => item.conceptId)).toEqual([
            'grammar:n3-condition-baai',
            'grammar:n3-reason-tame-ni',
            'reading:n3-scope-and-contrast',
        ]);
        expect(lesson.prerequisites.every(item => item.minimumEvidence === 'introduced-and-attempted')).toBe(true);
        expect(N2_POLICY_SCOPE_PACKAGES).toEqual([lesson]);
        expect(resolveN2PolicyScopePackage(lesson.id)).toBe(N2_POLICY_SCOPE_PACKAGES[0]);
        expect(() => resolveN2PolicyScopePackage('unknown')).toThrow(/Unknown N2 policy-scope package/);
    });

    it('grades the original N2 rehearsal deterministically and narrows repair SRS seeds', () => {
        const runtime = createN2PolicyScopeRuntime();
        const { activity } = createN2PolicyScopePackage();
        expect(runtime.validate(activity)).toEqual([]);

        const correct = response(activity.payload.questions.map(question => [question.id, question.correctOptionId]));
        const pass = runtime.evaluate(activity, correct);
        expect(pass.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(pass.reviewSeeds).toHaveLength(4);
        expect(pass.reviewSeeds.every(seed => seed.reason === 'new-learning')).toBe(true);

        const missed = response(activity.payload.questions.map(question => [
            question.id,
            question.id === 'condition-limit' ? 'any-new-user' : question.correctOptionId,
        ]));
        const lapse = runtime.evaluate(activity, missed);
        expect(lapse.result).toMatchObject({ outcome: 'lapse', score: 0.75, errorTags: ['scope-condition'] });
        expect(lapse.reviewSeeds.map(seed => [seed.content.expression, seed.reason])).toEqual([
            ['〜場合に限り', 'repair'],
        ]);
        expect(() => runtime.evaluate(activity, { answers: [] })).toThrow(/Every N2 policy-scope question/);
    });

    it('mounts a synthesized original rehearsal and Reader surfaces without delivering the source page', async () => {
        const runtime = createN2PolicyScopeRuntime();
        const { activity } = createN2PolicyScopePackage();
        const host = document.createElement('main');
        document.body.append(host);
        const registered: HTMLElement[] = [];
        const playPronunciation = vi.fn(async () => ({ dispose: vi.fn() }));
        const onEvaluation = vi.fn();
        const controller = runtime.mount(activity, {
            replace(view) { host.replaceChildren(view); },
            announce() {},
            registerReadingSurface(surface) {
                registered.push(surface);
                return () => undefined;
            },
            playPronunciation,
        }, onEvaluation);

        expect(host.textContent).toContain('the permitted reference text, images, and original media are not delivered');
        expect(host.textContent).not.toContain(N2_POLICY_SCOPE_PROVENANCE.sourceTitle);
        expect(host.querySelectorAll('fieldset')).toHaveLength(4);
        expect(host.querySelectorAll('article p')).toHaveLength(2);
        expect(registered).toHaveLength(5);

        host.querySelector<HTMLButtonElement>('[data-rehearsal-playback]')?.click();
        await vi.waitFor(() => expect(playPronunciation).toHaveBeenCalledWith(activity.payload.rehearsal.playbackText));

        for (const question of activity.payload.questions) {
            const input = host.querySelector<HTMLInputElement>(
                `input[name="${question.id}"][value="${question.correctOptionId}"]`,
            );
            expect(input).not.toBeNull();
            input!.checked = true;
        }
        host.querySelector<HTMLFormElement>('form')?.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        expect(host.querySelector('[data-source-transcript]')).toBeNull();
        controller.dispose();
    });

    it('projects only original rehearsal Reader and mining data', () => {
        const lesson = createN2PolicyScopePackage();
        expect(lesson.readerSrs.readerSurfaceIds).toEqual([
            'reader:n2-policy-scope-01:rehearsal:paragraph-1',
            'reader:n2-policy-scope-01:rehearsal:paragraph-2',
        ]);
        expect(lesson.readerSrs.miningRequests).toEqual([
            expect.objectContaining({
                expression: '〜からといって',
                conceptIds: ['grammar:n2-kara-toitte', 'grammar:n2-wake-dewa-nai'],
            }),
            expect.objectContaining({
                expression: '〜場合に限り',
                conceptIds: ['grammar:n2-baai-ni-kagiri', 'reading:n2-policy-purpose-and-scope'],
            }),
        ]);
        expect(lesson.readerSrs.miningRequests.every(request => request.sourceUrl === undefined)).toBe(true);
        expect(JSON.stringify(lesson.readerSrs)).not.toContain(N2_POLICY_SCOPE_PROVENANCE.relativePath);
    });
});

function sha256(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}

function response(items: readonly (readonly [string, string])[]) {
    return { answers: items.map(([questionId, optionId]) => ({ questionId, optionId })) };
}
