import {
    auditGroundedAnswerConcealmentSurface,
    type GroundedAnswerConcealmentAuditArtifact,
} from '../../src/academy/domain/grounded-answer-concealment-audit';
import {
    assertGroundedLessonDefinitionsResolve,
    createGroundedDefinitionRegistry,
    type GroundedDefinitionRecord,
} from '../../src/academy/domain/grounded-definition-registry';
import type {
    GroundedAnswerConcealmentEvidence,
    GroundedLessonContract,
    GroundingProofSet,
} from '../../src/academy/domain/grounded-lesson';

const claim: GroundedAnswerConcealmentEvidence = {
    surfaceAudit: {
        id: 'surface-audit:test',
        registry: 'academy-content',
        revision: 'test.v1',
        sha256: 'c'.repeat(64),
    },
    answerBearingContent: {
        id: 'answer-bearing-content:test',
        registry: 'academy-content',
        revision: 'test.v1',
        sha256: 'f'.repeat(64),
    },
    auditBinding: {
        surfaceId: 'surface:test',
        renderer: {
            id: 'surface-renderer:test',
            registry: 'activity-plugin',
            revision: 'renderer.v1',
            sha256: '1'.repeat(64),
        },
        contentRevision: 'test.v1',
    },
    learnerFacingPreCommit: {
        translations: 'absent',
        transcripts: 'absent',
        modelAnswers: 'absent',
        acceptedAnswers: 'absent',
    },
    revealPolicy: 'after-first-attempt',
};

describe('grounded definition registry', () => {
    it('replays a renderer-bound pre-commit DOM audit against registered answers', () => {
        const audit = cleanAudit(claim);
        const registry = registryWithSurfaceArtifact(audit);

        expect(() => assertGroundedLessonDefinitionsResolve(lessonWithClaim(claim), registry)).not.toThrow();
    });

    it('rejects a self-asserted claim that never audited renderer DOM', () => {
        const registry = registryWithSurfaceArtifact({
            learnerFacingPreCommit: claim.learnerFacingPreCommit,
            revealPolicy: claim.revealPolicy,
        });

        expect(() => assertGroundedLessonDefinitionsResolve(lessonWithClaim(claim), registry))
            .toThrow(/not an executable DOM audit artifact/i);
    });

    it('rejects a dangling surface-audit reference', () => {
        const registry = createGroundedDefinitionRegistry([
            rendererRecord(), answerBearingRecord(), ...assessmentRecords(),
        ]);

        expect(() => assertGroundedLessonDefinitionsResolve(lessonWithClaim(claim), registry))
            .toThrow(/dangling grounded definition surface-audit:test/i);
    });

    it.each([
        ['renderer revision', {
            renderer: { ...claim.auditBinding.renderer, revision: 'renderer.v2' },
        }],
        ['content revision', { contentRevision: 'test.v2' }],
    ])('rejects an audit stale for the current %s', (_label, update) => {
        const staleClaim: GroundedAnswerConcealmentEvidence = {
            ...claim,
            auditBinding: { ...claim.auditBinding, ...update },
        };
        const registry = registryWithSurfaceArtifact(cleanAudit(claim));

        expect(() => assertGroundedLessonDefinitionsResolve(lessonWithClaim(staleClaim), registry))
            .toThrow(/stale for the current lesson content|does not match its registered revision/i);
    });

    it('rejects a passing label when the replayed DOM contains an accepted answer', () => {
        const audit = cleanAudit(claim, '正解');
        expect(audit.result).toBe('fail');
        const dishonest = { ...audit, result: 'pass' as const };
        const registry = registryWithSurfaceArtifact(dishonest);

        expect(() => assertGroundedLessonDefinitionsResolve(lessonWithClaim(claim), registry))
            .toThrow(/answer-bearing learner DOM/i);
    });

    it('rejects a snapshot tampered after audit even when stored findings stay clean', () => {
        const audit = cleanAudit(claim);
        const tampered = {
            ...audit,
            snapshot: audit.snapshot.replace('</form>', '<span>正解</span></form>'),
        };
        const registry = registryWithSurfaceArtifact(tampered);

        expect(() => assertGroundedLessonDefinitionsResolve(lessonWithClaim(claim), registry))
            .toThrow(/findings do not match its stored DOM snapshot/i);
    });

    it('finds an untagged translation leaked through ordinary learner-facing copy', () => {
        const audit = cleanAudit(claim, 'Correct answer');

        expect(audit.result).toBe('fail');
        expect(audit.findings).toContainEqual({
            kind: 'translations',
            source: 'learner-facing-value',
            evidence: 'Correct answer',
        });
    });

    it('finds an answer split across ordinary inline elements', () => {
        const root = surfaceRoot(claim);
        const first = document.createElement('span');
        const second = document.createElement('span');
        first.textContent = '正';
        second.textContent = '解';
        root.append(first, second);

        const audit = auditGroundedAnswerConcealmentSurface(root, auditContext(claim));

        expect(audit.result).toBe('fail');
        expect(audit.findings).toContainEqual({
            kind: 'acceptedAnswers',
            source: 'learner-facing-value',
            evidence: '正解',
        });
    });

    it('refuses open and potentially closed shadow-root bypasses', () => {
        const openRoot = surfaceRoot(claim);
        const openHost = document.createElement('div');
        openHost.attachShadow({ mode: 'open' }).textContent = '正解';
        openRoot.append(openHost);
        expect(() => auditGroundedAnswerConcealmentSurface(openRoot, auditContext(claim)))
            .toThrow(/shadow root/i);

        const closedRoot = surfaceRoot(claim);
        const closedHost = document.createElement('answer-host');
        closedHost.attachShadow({ mode: 'closed' }).textContent = '正解';
        expect(closedHost.shadowRoot).toBeNull();
        closedRoot.append(closedHost);
        expect(() => auditGroundedAnswerConcealmentSurface(closedRoot, auditContext(claim)))
            .toThrow(/opaque custom-element surface/i);
    });

    it.each(['canvas', 'iframe'])('refuses opaque %s learner content', tagName => {
        const root = surfaceRoot(claim);
        root.append(document.createElement(tagName));

        expect(() => auditGroundedAnswerConcealmentSurface(root, auditContext(claim)))
            .toThrow(new RegExp(`opaque ${tagName} learner content`, 'i'));
    });

    it.each(['&#x6B63', '&#27491'])('detects a semicolon-less encoded answer: %s', encoded => {
        const audit = cleanAudit(claim);
        const tampered = {
            ...audit,
            snapshot: audit.snapshot.replace('</form>', `<span>${encoded}解</span></form>`),
        };
        const registry = registryWithSurfaceArtifact(tampered);

        expect(() => assertGroundedLessonDefinitionsResolve(lessonWithClaim(claim), registry))
            .toThrow(/findings do not match its stored DOM snapshot/i);
    });

    it('rejects an audit corpus that omits a registered accepted answer', () => {
        const audit = cleanAudit(claim, 'Type your response.', { acceptedAnswers: [] });
        const registry = registryWithSurfaceArtifact(audit, { acceptedAnswers: [] });

        expect(() => assertGroundedLessonDefinitionsResolve(lessonWithClaim(claim), registry))
            .toThrow(/omits registered accepted answers/i);
    });

    it('rejects an audit that omits content-derived translation or transcript values', () => {
        const audit = cleanAudit(claim, 'Type your response.', { translations: [], transcripts: [] });
        const registry = registryWithSurfaceArtifact(audit);

        expect(() => assertGroundedLessonDefinitionsResolve(lessonWithClaim(claim), registry))
            .toThrow(/omits content-derived answer-bearing values/i);
    });

    it('replays stored evidence without browser globals', () => {
        const registry = registryWithSurfaceArtifact(cleanAudit(claim));
        vi.stubGlobal('document', undefined);
        try {
            expect(() => assertGroundedLessonDefinitionsResolve(lessonWithClaim(claim), registry)).not.toThrow();
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

function cleanAudit(
    value: GroundedAnswerConcealmentEvidence,
    learnerText = 'Type your response.',
    forbiddenUpdate: Partial<Readonly<{
        translations: readonly string[];
        transcripts: readonly string[];
        modelAnswers: readonly string[];
        acceptedAnswers: readonly string[];
    }>> = {},
): GroundedAnswerConcealmentAuditArtifact {
    const root = surfaceRoot(value, learnerText);
    return auditGroundedAnswerConcealmentSurface(root, auditContext(value, forbiddenUpdate));
}

function surfaceRoot(
    value: GroundedAnswerConcealmentEvidence,
    learnerText = 'Type your response.',
): HTMLFormElement {
    const root = document.createElement('form');
    root.dataset.groundedLessonId = 'lesson:test';
    root.dataset.groundedSubjectId = 'lesson:test';
    root.dataset.groundedSurfaceId = value.auditBinding.surfaceId;
    root.dataset.groundedRendererId = value.auditBinding.renderer.id;
    root.dataset.groundedRendererRevision = value.auditBinding.renderer.revision;
    root.dataset.groundedRendererSha256 = value.auditBinding.renderer.sha256;
    root.dataset.groundedContentRevision = value.auditBinding.contentRevision;
    root.dataset.groundedCommitState = 'pre-commit';
    const input = document.createElement('input');
    input.setAttribute('aria-label', learnerText);
    root.append(input);
    return root;
}

function auditContext(
    value: GroundedAnswerConcealmentEvidence,
    forbiddenUpdate: Partial<Readonly<{
        translations: readonly string[];
        transcripts: readonly string[];
        modelAnswers: readonly string[];
        acceptedAnswers: readonly string[];
    }>> = {},
) {
    return {
        lessonId: 'lesson:test',
        subjectId: 'lesson:test',
        binding: value.auditBinding,
        forbiddenValues: {
            translations: ['Correct answer'],
            transcripts: ['Transcript text'],
            modelAnswers: ['模範解答'],
            acceptedAnswers: ['正解'],
            ...forbiddenUpdate,
        },
    } as const;
}

function surfaceRecord(
    value: GroundedAnswerConcealmentEvidence,
    artifact: unknown,
): GroundedDefinitionRecord {
    return {
        ref: value.surfaceAudit,
        kind: 'surface-audit',
        source: { contentId: 'content:test', locator: 'preCommitSurface' },
        value: artifact,
    };
}

function rendererRecord(): GroundedDefinitionRecord {
    return {
        ref: claim.auditBinding.renderer,
        kind: 'surface-renderer',
        source: {
            contentId: 'renderer:lesson-test',
            locator: 'renderLessonTestPreCommitSurface',
        },
        value: { surfaceId: claim.auditBinding.surfaceId },
    };
}

function assessmentRecords(): GroundedDefinitionRecord[] {
    return [{
        ref: definition('grader:test', 'd'),
        kind: 'deterministic-grader',
        source: { contentId: 'content:test', locator: 'grader' },
        value: { method: 'exact' },
    }, {
        ref: definition('answer-set:test', 'e'),
        kind: 'answer-set',
        source: { contentId: 'content:test', locator: 'acceptedAnswers' },
        value: { acceptedAnswers: ['正解'] },
    }];
}

function answerBearingRecord(update: Partial<Readonly<{
    translations: readonly string[];
    transcripts: readonly string[];
    modelAnswers: readonly string[];
    acceptedAnswers: readonly string[];
}>> = {}): GroundedDefinitionRecord {
    return {
        ref: claim.answerBearingContent,
        kind: 'answer-bearing-content',
        source: { contentId: 'content:test', locator: 'answerBearingContent' },
        value: {
            translations: ['Correct answer'],
            transcripts: ['Transcript text'],
            modelAnswers: ['模範解答'],
            acceptedAnswers: ['正解'],
            ...update,
        },
    };
}

function registryWithSurfaceArtifact(
    artifact: unknown,
    answerUpdate: Parameters<typeof answerBearingRecord>[0] = {},
) {
    return createGroundedDefinitionRegistry([
        surfaceRecord(claim, artifact),
        rendererRecord(),
        answerBearingRecord(answerUpdate),
        ...assessmentRecords(),
    ]);
}

function lessonWithClaim(value: GroundedAnswerConcealmentEvidence): GroundedLessonContract {
    const blocked = { state: 'review-blocked' as const, blockerIds: ['blocker:test'] };
    const proofs: GroundingProofSet = {
        input: blocked,
        curriculum: blocked,
        instruction: blocked,
        answerConcealment: { state: 'ready', evidence: value },
        media: blocked,
        assessment: {
            state: 'ready',
            evidence: {
                method: 'deterministic',
                grader: definition('grader:test', 'd'),
                answerSets: [definition('answer-set:test', 'e')],
            },
        },
        repair: blocked,
        learnerEvidence: blocked,
        accessibility: blocked,
    };
    return {
        schemaVersion: 1,
        lessonId: 'lesson:test',
        contentRevision: 'test.v1',
        status: 'review-blocked',
        blockerIds: ['blocker:test'],
        overview: { proofs, productionSequence: blocked },
        activities: [],
    };
}

function definition(id: string, digest = 'c') {
    return {
        id,
        registry: 'academy-content' as const,
        revision: 'test.v1',
        sha256: digest.repeat(64),
    };
}
