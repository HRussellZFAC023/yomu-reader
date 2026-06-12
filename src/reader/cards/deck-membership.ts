import type { JPDBCard } from '../app/types';

type DeckMembershipSource = NonNullable<JPDBCard['source']>;

export interface CardDeckMembership {
    source: DeckMembershipSource;
    names: string[];
    member: boolean;
}

const DECK_CLASS_NAME_LIMIT = 8;

export function cardDeckMembership(card: JPDBCard): CardDeckMembership {
    const names = cardDeckNames(card);
    return {
        source: cardDeckMembershipSource(card),
        names,
        member: hasPrimaryDeckMembership(card) || hasAnkiDeckMembership(card),
    };
}

function cardDeckNames(card: JPDBCard): string[] {
    return uniqueDeckNames([
        ...primaryDeckNames(card),
        ...ankiDeckNames(card),
    ]);
}

export function cardDeckMembershipClassNames(card: JPDBCard): string[] {
    const membership = cardDeckMembership(card);
    if (!membership.member) return [];
    const classes = new Set<string>(['yomu-deck-member']);
    if (hasPrimaryDeckMembership(card)) addDeckSourceClasses(classes, primaryDeckMembershipSource(card), primaryDeckNames(card));
    if (hasAnkiDeckMembership(card)) addDeckSourceClasses(classes, 'anki', ankiDeckNames(card));
    return [...classes];
}

function deckClassSlug(value: string): string {
    const slug = value
        .normalize('NFKC')
        .trim()
        .toLowerCase()
        .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
    return slug || 'unnamed';
}

function uniqueDeckNames(values: Array<string | null | undefined>): string[] {
    const seen = new Set<string>();
    return values
        .map(value => value?.trim() ?? '')
        .filter(value => {
            if (!value || seen.has(value)) return false;
            seen.add(value);
            return true;
        });
}

function cardDeckMembershipSource(card: JPDBCard): DeckMembershipSource {
    if (!hasPrimaryDeckMembership(card) && hasAnkiDeckMembership(card)) return 'anki';
    return primaryDeckMembershipSource(card);
}

function primaryDeckMembershipSource(card: JPDBCard): DeckMembershipSource {
    return card.source ?? (card.reviewSource === 'jiten-api' ? 'jiten' : 'jpdb');
}

function primaryDeckNames(card: JPDBCard): string[] {
    return uniqueDeckNames([
        ...(card.deckNames ?? []),
        card.sourceDeckName ?? '',
    ]);
}

function ankiDeckNames(card: JPDBCard): string[] {
    return uniqueDeckNames(card.ankiDeckNames ?? []);
}

function hasPrimaryDeckMembership(card: JPDBCard): boolean {
    return primaryDeckNames(card).length > 0
        || card.cardState.includes('in-deck')
        || Boolean(card.jpdbDeckMembership?.trim());
}

function hasAnkiDeckMembership(card: JPDBCard): boolean {
    return ankiDeckNames(card).length > 0;
}

function addDeckSourceClasses(classes: Set<string>, source: DeckMembershipSource, names: string[]): void {
    classes.add(`${source}-deck-member`);
    names.slice(0, DECK_CLASS_NAME_LIMIT).forEach(name => {
        const slug = deckClassSlug(name);
        classes.add(`yomu-deck-${slug}`);
        classes.add(`${source}-deck-${slug}`);
    });
}
