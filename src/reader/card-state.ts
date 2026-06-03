import type { CardState } from './types';

const CARD_STATES = new Set<CardState>([
    'new',
    'learning',
    'known',
    'due',
    'failed',
    'locked',
    'never-forget',
    'blacklisted',
    'suspended',
    'in-deck',
    'not-in-deck',
    'redundant',
]);

const CARD_STATE_ALIASES: Record<string, CardState> = {
    never_forget: 'never-forget',
    neverforget: 'never-forget',
    'never forget': 'never-forget',
    not_in_deck: 'not-in-deck',
    notindeck: 'not-in-deck',
    'not in deck': 'not-in-deck',
    in_deck: 'in-deck',
    indeck: 'in-deck',
    'in deck': 'in-deck',
    blacklist: 'blacklisted',
    blacklisted: 'blacklisted',
    ignored: 'blacklisted',
};

interface NormalizedCardStateKeys {
    trimmed: string;
    dashed: string;
    compact: string;
}

export function normalizeCardState(value: unknown): CardState | null {
    const keys = normalizedCardStateKeys(value);
    if (!keys) return null;
    const aliased = aliasedCardState(keys.trimmed, keys.dashed, keys.compact);
    if (aliased) return aliased;
    return knownCardState(keys.dashed);
}

function normalizedCardStateKeys(value: unknown): NormalizedCardStateKeys | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return null;
    return {
        trimmed,
        dashed: trimmed.replace(/[_\s]+/g, '-'),
        compact: trimmed.replace(/[_\s-]+/g, ''),
    };
}

function aliasedCardState(...keys: string[]): CardState | undefined {
    return keys.map(key => CARD_STATE_ALIASES[key]).find(Boolean);
}

function knownCardState(value: string): CardState | null {
    if (CARD_STATES.has(value as CardState)) return value as CardState;
    return null;
}

export function normalizeCardStates(value: unknown, fallback: CardState = 'not-in-deck'): CardState[] {
    const states = uniqueNormalizedCardStates(Array.isArray(value) ? value : [value]);
    return states.length ? states : [fallback];
}

function uniqueNormalizedCardStates(rawStates: unknown[]): CardState[] {
    const states: CardState[] = [];
    for (const rawState of rawStates) {
        appendNormalizedCardState(states, rawState);
    }
    return states;
}

function appendNormalizedCardState(states: CardState[], rawState: unknown): void {
    const state = normalizeCardState(rawState);
    if (!state || states.includes(state)) return;
    states.push(state);
}

export function primaryCardState(value: unknown): CardState {
    return normalizeCardStates(value)[0] ?? 'not-in-deck';
}
