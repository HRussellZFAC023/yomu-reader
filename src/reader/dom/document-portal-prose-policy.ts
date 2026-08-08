import {
    composedAncestorElement,
    isLikelyProseElement,
    safeElementMatches,
    type DecorationState,
} from './decoration-policy';
import { documentAnnotationPortalHasNonTranslationTransform } from './youtube-chrome-annotation-portal';

const DOCUMENT_PORTAL_PROSE_DECORATIONS = new Set<DecorationState>(['prose-full', 'content-ruby']);
const VOLATILE_CONVERSATION_IDENTITY_RE = /(?:^|[-_\s])(?:comment|message|post|reply|chat)(?:[-_\s]|$)/iu;
const VOLATILE_PROSE_IDENTITY_RE = /(?:^|[-_\s])(?:content[-_]?text|paragraph|prose.?wrap|description[-_]?text)(?:[-_\s]|$)/iu;

interface DocumentPortalProseCandidate {
    decoration?: DecorationState;
    insideShadowDOM: boolean;
    interactivePassive: boolean;
    preservesSource: boolean;
}

/**
 * Decide whether volatile prose should paint through the document portal.
 * Callers provide only facts owned by the scan/render pipeline; this module
 * owns the cross-site prose identity and geometry policy.
 */
export function sourcePreservingProseNeedsDocumentPortal(
    host: HTMLElement,
    candidate: DocumentPortalProseCandidate,
): boolean {
    return documentPortalProseCandidateIsEligible(host, candidate)
        && hasDocumentPortalProseAncestor(host);
}

function documentPortalProseCandidateIsEligible(
    host: HTMLElement,
    candidate: DocumentPortalProseCandidate,
): boolean {
    // A body portal can project exact Range boxes through translations, but a
    // scale or rotation also changes reading typography. Keep that prose in its
    // established in-host lane.
    return [
        !candidate.insideShadowDOM,
        host.getRootNode() === host.ownerDocument,
        DOCUMENT_PORTAL_PROSE_DECORATIONS.has(candidate.decoration ?? 'skip'),
        !candidate.interactivePassive,
        candidate.preservesSource,
        !documentAnnotationPortalHasNonTranslationTransform(host),
    ].every(Boolean);
}

function hasDocumentPortalProseAncestor(host: HTMLElement): boolean {
    for (let current: HTMLElement | null = host, depth = 0;
        current && depth < 8;
        current = composedAncestorElement(current), depth += 1) {
        if (isDocumentPortalProseAncestor(current, host)) return true;
    }
    return false;
}

function isDocumentPortalProseAncestor(current: HTMLElement, host: HTMLElement): boolean {
    const identity = `${current.tagName} ${current.id} ${String(current.className || '')}`;
    return [
        isLikelyProseElement(current),
        safeElementMatches(current, 'p,article,blockquote,figcaption,[role="article"]'),
        VOLATILE_CONVERSATION_IDENTITY_RE.test(identity),
        current === host && VOLATILE_PROSE_IDENTITY_RE.test(identity),
    ].some(Boolean);
}
