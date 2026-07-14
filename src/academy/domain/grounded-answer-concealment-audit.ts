import type { GroundedAnswerConcealmentEvidence } from './grounded-lesson';

export const GROUNDED_ANSWER_CONCEALMENT_AUDIT_REVISION = 'academy-pre-commit-dom.v1';

type AnswerBearingKind = 'translations' | 'transcripts' | 'modelAnswers' | 'acceptedAnswers';

export interface GroundedAnswerConcealmentAuditContext {
    readonly lessonId: string;
    readonly subjectId: string;
    readonly binding: GroundedAnswerConcealmentEvidence['auditBinding'];
    readonly forbiddenValues: Readonly<Record<AnswerBearingKind, readonly string[]>>;
}

export interface GroundedAnswerConcealmentAuditFinding {
    readonly kind: AnswerBearingKind;
    readonly source: 'semantic-surface' | 'learner-facing-value';
    readonly evidence: string;
}

/**
 * Persistable output of running the concealment audit against a renderer-owned
 * pre-commit DOM root. The snapshot makes the result executable again when the
 * grounding registry is verified; a prose assertion is not sufficient.
 */
export interface GroundedAnswerConcealmentAuditArtifact {
    readonly schemaVersion: 1;
    readonly kind: 'grounded-answer-concealment-dom-audit';
    readonly auditRevision: typeof GROUNDED_ANSWER_CONCEALMENT_AUDIT_REVISION;
    readonly binding: Readonly<{
        lessonId: string;
        subjectId: string;
        surfaceId: string;
        rendererId: string;
        rendererRevision: string;
        rendererSha256: string;
        contentRevision: string;
    }>;
    readonly phase: 'pre-commit';
    readonly snapshot: string;
    readonly forbiddenValues: Readonly<Record<AnswerBearingKind, readonly string[]>>;
    readonly findings: readonly GroundedAnswerConcealmentAuditFinding[];
    readonly result: 'pass' | 'fail';
}

const SEMANTIC_SELECTORS: Readonly<Record<AnswerBearingKind, readonly string[]>> = {
    translations: [
        '.academy-vn-translation',
        '[data-answer-bearing="translation"]',
        '[data-support-kind="translation"]',
        '[data-translation]',
    ],
    transcripts: [
        '.academy-lab-transcript',
        '[data-answer-bearing="transcript"]',
        '[data-support-kind="transcript"]',
        '[data-transcript]',
    ],
    modelAnswers: [
        '[data-answer-bearing="model-answer"]',
        '[data-support-kind="model-answer"]',
        '[data-model-answer]',
    ],
    acceptedAnswers: [
        '[data-answer-bearing="accepted-answer"]',
        '[data-accepted-answer]',
    ],
};

/** Run only after the renderer has produced its real pre-commit learner surface. */
export function auditGroundedAnswerConcealmentSurface(
    root: HTMLElement,
    context: GroundedAnswerConcealmentAuditContext,
): GroundedAnswerConcealmentAuditArtifact {
    assertRendererBinding(root, context);
    const forbiddenValues = normalizeForbiddenValues(context.forbiddenValues);
    const snapshot = captureSnapshot(root);
    const findings = inspectSnapshot(snapshot, forbiddenValues);
    return {
        schemaVersion: 1,
        kind: 'grounded-answer-concealment-dom-audit',
        auditRevision: GROUNDED_ANSWER_CONCEALMENT_AUDIT_REVISION,
        binding: {
            lessonId: context.lessonId,
            subjectId: context.subjectId,
            surfaceId: context.binding.surfaceId,
            rendererId: context.binding.renderer.id,
            rendererRevision: context.binding.renderer.revision,
            rendererSha256: context.binding.renderer.sha256,
            contentRevision: context.binding.contentRevision,
        },
        phase: 'pre-commit',
        snapshot,
        forbiddenValues,
        findings,
        result: findings.length ? 'fail' : 'pass',
    };
}

/**
 * Re-run a stored audit and bind it to the lesson, renderer, and registered
 * answer definitions currently requesting learner-write authority.
 */
export function assertGroundedAnswerConcealmentAudit(
    value: unknown,
    context: GroundedAnswerConcealmentAuditContext,
    registeredAnswers: Readonly<{ acceptedAnswers: readonly string[]; modelAnswers: readonly string[] }>,
): asserts value is GroundedAnswerConcealmentAuditArtifact {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('Surface audit is not an executable DOM audit artifact.');
    }
    const artifact = value as Partial<GroundedAnswerConcealmentAuditArtifact>;
    if (artifact.schemaVersion !== 1
        || artifact.kind !== 'grounded-answer-concealment-dom-audit'
        || artifact.auditRevision !== GROUNDED_ANSWER_CONCEALMENT_AUDIT_REVISION
        || artifact.phase !== 'pre-commit'
        || typeof artifact.snapshot !== 'string'
        || !artifact.snapshot.trim()
        || !artifact.binding
        || !artifact.forbiddenValues
        || !Array.isArray(artifact.findings)) {
        throw new TypeError('Surface audit is not an executable DOM audit artifact.');
    }
    const expectedBinding = {
        lessonId: context.lessonId,
        subjectId: context.subjectId,
        surfaceId: context.binding.surfaceId,
        rendererId: context.binding.renderer.id,
        rendererRevision: context.binding.renderer.revision,
        rendererSha256: context.binding.renderer.sha256,
        contentRevision: context.binding.contentRevision,
    };
    if (!sameObject(artifact.binding, expectedBinding)) {
        throw new TypeError('Surface audit is stale for the current lesson content or renderer revision.');
    }
    const forbiddenValues = normalizeForbiddenValues(artifact.forbiddenValues);
    const expectedForbiddenValues = normalizeForbiddenValues(context.forbiddenValues);
    if (!sameObject(forbiddenValues, expectedForbiddenValues)) {
        throw new TypeError('Surface audit omits content-derived answer-bearing values.');
    }
    assertRegisteredValuesCovered(forbiddenValues.acceptedAnswers, registeredAnswers.acceptedAnswers, 'accepted answers');
    assertRegisteredValuesCovered(forbiddenValues.modelAnswers, registeredAnswers.modelAnswers, 'model answers');
    assertSnapshotBinding(artifact.snapshot, context);
    const findings = inspectSnapshot(artifact.snapshot, forbiddenValues);
    if (!sameArray(artifact.findings, findings)) {
        throw new TypeError('Surface audit findings do not match its stored DOM snapshot.');
    }
    if (artifact.result !== 'pass' || findings.length) {
        throw new TypeError('Surface audit found answer-bearing learner DOM before commitment.');
    }
}

function inspectSnapshot(
    snapshot: string,
    forbiddenValues: GroundedAnswerConcealmentAuditArtifact['forbiddenValues'],
): GroundedAnswerConcealmentAuditFinding[] {
    const findings: GroundedAnswerConcealmentAuditFinding[] = [];
    for (const kind of answerBearingKinds()) {
        for (const selector of SEMANTIC_SELECTORS[kind]) {
            if (snapshotHasSelector(snapshot, selector)) {
                findings.push({ kind, source: 'semantic-surface', evidence: selector });
            }
        }
    }
    const learnerFacing = learnerFacingCorpus(snapshot);
    for (const kind of answerBearingKinds()) {
        for (const forbidden of forbiddenValues[kind]) {
            const needle = normalize(forbidden);
            if (needle && learnerFacing.some(value => value.includes(needle))) {
                findings.push({ kind, source: 'learner-facing-value', evidence: forbidden });
            }
        }
    }
    return dedupeFindings(findings);
}

/**
 * Compare rendered learner text rather than serialized tag names. In
 * particular, `<span>こん</span><span>にちは</span>` must be audited as the
 * contiguous visible string `こんにちは`. Form and accessibility attributes
 * are checked separately because they can expose answers without a text node.
 */
function learnerFacingCorpus(snapshot: string): string[] {
    const values = [decodeHtml(snapshot.replace(/<[^>]*>/gu, ''))];
    const learnerAttribute = /\b(?:alt|aria-description|aria-label|aria-roledescription|label|placeholder|title|value)\s*=\s*(?:"([^"]*)"|'([^']*)')/giu;
    for (const match of snapshot.matchAll(learnerAttribute)) {
        values.push(decodeHtml(match[1] ?? match[2] ?? ''));
    }
    return values.map(normalize).filter(Boolean);
}

function assertRendererBinding(root: HTMLElement, context: GroundedAnswerConcealmentAuditContext): void {
    const expected = {
        groundedLessonId: context.lessonId,
        groundedSubjectId: context.subjectId,
        groundedSurfaceId: context.binding.surfaceId,
        groundedRendererId: context.binding.renderer.id,
        groundedRendererRevision: context.binding.renderer.revision,
        groundedRendererSha256: context.binding.renderer.sha256,
        groundedContentRevision: context.binding.contentRevision,
        groundedCommitState: 'pre-commit',
    } as const;
    for (const [key, value] of Object.entries(expected)) {
        if (root.dataset[key] !== value) {
            throw new TypeError(`Surface audit is not bound to renderer DOM (${key}).`);
        }
    }
}

function captureSnapshot(root: HTMLElement): string {
    assertInspectableSurface(root);
    const clone = root.cloneNode(true) as HTMLElement;
    const sourceControls = [root, ...root.querySelectorAll<HTMLElement>('input, textarea, select, option')];
    const clonedControls = [clone, ...clone.querySelectorAll<HTMLElement>('input, textarea, select, option')];
    for (const [index, source] of sourceControls.entries()) {
        const target = clonedControls[index];
        if (!target) throw new TypeError('Surface audit could not capture live form state.');
        if (source instanceof HTMLInputElement && target instanceof HTMLInputElement) {
            target.setAttribute('value', source.value);
            if (source.checked) target.setAttribute('checked', '');
        } else if (source instanceof HTMLTextAreaElement && target instanceof HTMLTextAreaElement) {
            target.textContent = source.value;
        } else if (source instanceof HTMLOptionElement && target instanceof HTMLOptionElement && source.selected) {
            target.setAttribute('selected', '');
        }
    }
    return clone.outerHTML;
}

function assertInspectableSurface(root: HTMLElement): void {
    for (const element of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
        if (element.shadowRoot) {
            throw new TypeError('Surface audit cannot certify an attached shadow root without a separate audit.');
        }
        if (element.localName.includes('-')) {
            throw new TypeError('Surface audit cannot certify an opaque custom-element surface without a separate audit.');
        }
        if (['canvas', 'iframe', 'frame', 'object', 'embed'].includes(element.localName)) {
            throw new TypeError(`Surface audit cannot certify opaque ${element.localName} learner content.`);
        }
    }
}

function normalizeForbiddenValues(
    value: Readonly<Record<AnswerBearingKind, readonly string[]>>,
): Record<AnswerBearingKind, string[]> {
    if (!value || typeof value !== 'object') throw new TypeError('Surface audit needs all forbidden-value groups.');
    return Object.fromEntries(answerBearingKinds().map(kind => {
        const entries = value[kind];
        if (!Array.isArray(entries)) throw new TypeError(`Surface audit needs ${kind} values.`);
        const normalized = [...new Set(entries.map(entry => {
            if (typeof entry !== 'string' || !entry.trim()) throw new TypeError(`Surface audit ${kind} values must be text.`);
            return entry.trim();
        }))].sort();
        return [kind, normalized];
    })) as Record<AnswerBearingKind, string[]>;
}

function assertRegisteredValuesCovered(audited: readonly string[], registered: readonly string[], label: string): void {
    const auditedKeys = new Set(audited.map(normalize));
    const missing = registered.filter(value => !auditedKeys.has(normalize(value)));
    if (missing.length) throw new TypeError(`Surface audit omits registered ${label}.`);
}

function assertSnapshotBinding(snapshot: string, context: GroundedAnswerConcealmentAuditContext): void {
    const expected = {
        'data-grounded-lesson-id': context.lessonId,
        'data-grounded-subject-id': context.subjectId,
        'data-grounded-surface-id': context.binding.surfaceId,
        'data-grounded-renderer-id': context.binding.renderer.id,
        'data-grounded-renderer-revision': context.binding.renderer.revision,
        'data-grounded-renderer-sha256': context.binding.renderer.sha256,
        'data-grounded-content-revision': context.binding.contentRevision,
        'data-grounded-commit-state': 'pre-commit',
    } as const;
    for (const [name, value] of Object.entries(expected)) {
        if (!snapshot.includes(`${name}="${escapeAttribute(value)}"`)) {
            throw new TypeError(`Surface audit snapshot is not bound to renderer DOM (${name}).`);
        }
    }
}

function escapeAttribute(value: string): string {
    return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function snapshotHasSelector(snapshot: string, selector: string): boolean {
    const className = /^\.([a-z0-9_-]+)$/iu.exec(selector)?.[1];
    if (className) {
        const classAttributes = snapshot.match(/\bclass\s*=\s*(?:"[^"]*"|'[^']*')/giu) ?? [];
        return classAttributes.some(attribute => new RegExp(`(?:^|\\s)${escapeRegExp(className)}(?:\\s|$)`, 'u')
            .test(unquoteAttribute(attribute)));
    }
    const valued = /^\[([a-z0-9_-]+)="([^"]*)"\]$/iu.exec(selector);
    if (valued) {
        const [, name, value] = valued;
        return new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(?:"${escapeRegExp(value)}"|'${escapeRegExp(value)}')`, 'iu')
            .test(snapshot);
    }
    const present = /^\[([a-z0-9_-]+)\]$/iu.exec(selector)?.[1];
    return present ? new RegExp(`\\b${escapeRegExp(present)}(?:\\s*=|\\s|/?>)`, 'iu').test(snapshot) : false;
}

function unquoteAttribute(attribute: string): string {
    const equals = attribute.indexOf('=');
    return attribute.slice(equals + 1).trim().slice(1, -1);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function decodeHtml(value: string): string {
    const decoded = value.replace(/&#x([a-f0-9]+);?|&#([0-9]+);?|&(amp|lt|gt|quot|apos);/giu,
        (_match, hex: string | undefined, decimal: string | undefined, named: string | undefined) => {
            if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
            if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
            const entities: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
            return entities[named!.toLowerCase()] ?? _match;
        });
    if (decoded.includes('&#')) throw new TypeError('Surface audit snapshot contains an unresolved numeric character reference.');
    return decoded;
}

function normalize(value: string): string {
    return value.normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/[\s\p{P}\p{S}]+/gu, '');
}

function sameObject(left: object, right: object): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function sameArray(left: readonly unknown[], right: readonly unknown[]): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function dedupeFindings(findings: readonly GroundedAnswerConcealmentAuditFinding[]): GroundedAnswerConcealmentAuditFinding[] {
    return [...new Map(findings.map(finding => [JSON.stringify(finding), finding])).values()];
}

function answerBearingKinds(): readonly AnswerBearingKind[] {
    return ['translations', 'transcripts', 'modelAnswers', 'acceptedAnswers'];
}
