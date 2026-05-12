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
    blacklist: 'blacklisted',
    blacklisted: 'blacklisted',
    ignored: 'blacklisted',
};

export function normalizeCardState(value: unknown): CardState | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return null;

    const dashed = trimmed.replace(/[_\s]+/g, '-');
    const compact = dashed.replace(/-/g, '');
    const aliased = CARD_STATE_ALIASES[trimmed] ?? CARD_STATE_ALIASES[dashed] ?? CARD_STATE_ALIASES[compact];
    if (aliased) return aliased;
    if (CARD_STATES.has(dashed as CardState)) return dashed as CardState;
    return null;
}

export function normalizeCardStates(value: unknown, fallback: CardState = 'not-in-deck'): CardState[] {
    const rawStates = Array.isArray(value) ? value : [value];
    const states: CardState[] = [];
    for (const rawState of rawStates) {
        const state = normalizeCardState(rawState);
        if (state && !states.includes(state)) states.push(state);
    }
    return states.length ? states : [fallback];
}

export function primaryCardState(value: unknown): CardState {
    return normalizeCardStates(value)[0] ?? 'not-in-deck';
}
