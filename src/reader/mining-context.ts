import type { ImmersionKitExample } from './immersion-kit';
import type { ReaderSettings } from './types';

const CONTEXT_PREFIX = 'yomu-mining-context:';
const CONTEXT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 21;

export type MiningSourceKind = 'page' | 'video' | 'image' | 'immersion-kit' | 'jpdb';

export interface StoredMiningContext {
    term: string;
    sentence: string;
    sourceKind: MiningSourceKind;
    sourceTitle: string;
    sourceUrl: string;
    imageUrl?: string;
    immersionIndex?: number;
    immersionTotal?: number;
    updatedAt: number;
}

export interface MiningContext extends StoredMiningContext {
    imageDataUrl?: string;
}

export function saveMiningContext(term: string, context: Omit<StoredMiningContext, 'term' | 'updatedAt'>): StoredMiningContext | null {
    const normalized = term.trim();
    if (!normalized || !context.sentence.trim()) return null;
    const stored: StoredMiningContext = {
        ...context,
        term: normalized,
        sentence: context.sentence.trim(),
        sourceTitle: context.sourceTitle.trim(),
        sourceUrl: context.sourceUrl.trim(),
        updatedAt: Date.now(),
    };
    try {
        localStorage.setItem(contextStorageKey(normalized), JSON.stringify(stored));
    } catch {
        // Metadata-only cache; failing to persist should never block mining.
    }
    return stored;
}

export function loadMiningContext(term: string): StoredMiningContext | null {
    const normalized = term.trim();
    if (!normalized) return null;
    try {
        const raw = localStorage.getItem(contextStorageKey(normalized));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoredMiningContext;
        if (!parsed || parsed.term !== normalized || !parsed.sentence) return null;
        if (Date.now() - Number(parsed.updatedAt || 0) > CONTEXT_MAX_AGE_MS) return null;
        return parsed;
    } catch {
        return null;
    }
}

export function immersionContextFromExample(
    term: string,
    example: ImmersionKitExample,
    index: number,
    total: number,
    imageUrl: string,
): Omit<StoredMiningContext, 'term' | 'updatedAt'> {
    return {
        sentence: example.sentence,
        sourceKind: 'immersion-kit',
        sourceTitle: example.sourceTitle || 'Immersion Kit',
        sourceUrl: immersionKitUrl(term, index),
        imageUrl: imageUrl || undefined,
        immersionIndex: index,
        immersionTotal: total,
    };
}

export function pageMiningContext(sentence: string, sourceKind: MiningSourceKind = 'page'): Omit<StoredMiningContext, 'term' | 'updatedAt'> {
    return {
        sentence,
        sourceKind,
        sourceTitle: document.title || location.hostname,
        sourceUrl: location.href,
    };
}

export function contextLabel(context: StoredMiningContext | MiningContext): string {
    if (context.sourceKind === 'immersion-kit' && context.immersionIndex !== undefined && context.immersionTotal) {
        return `${context.sourceTitle} ${context.immersionIndex + 1}/${context.immersionTotal}`;
    }
    if (context.sourceKind === 'video') return `Video: ${context.sourceTitle}`;
    if (context.sourceKind === 'image') return `Image: ${context.sourceTitle}`;
    if (context.sourceKind === 'jpdb') return `JPDB: ${context.sourceTitle}`;
    return context.sourceTitle || context.sourceUrl || 'Current page';
}

export function shouldUseImmersionContext(settings: ReaderSettings, context: StoredMiningContext | null): context is StoredMiningContext {
    return Boolean(settings.immersionKitEnabled && context?.sourceKind === 'immersion-kit' && context.sentence.trim());
}

function contextStorageKey(term: string): string {
    return `${CONTEXT_PREFIX}${term}`;
}

function immersionKitUrl(term: string, index: number): string {
    const url = new URL('https://www.immersionkit.com/dictionary');
    url.searchParams.set('keyword', term);
    url.searchParams.set('sort', 'sentence_length:asc');
    url.searchParams.set('page', String(index + 1));
    return url.toString();
}
