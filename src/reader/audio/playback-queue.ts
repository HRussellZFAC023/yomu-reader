/**
 * Keeps a shuffled bag per audio key. This is intentionally not IID random
 * selection: every candidate in the current bag is offered before a reshuffle.
 */
export class ShuffledAudioDeck {
    private bags = new Map<string, ShuffledAudioBag>();

    constructor(private random: () => number = Math.random) {}

    order(key: string, ids: string[]): string[] {
        if (ids.length < 2) return ids;

        const signature = ids.join('\u0000');
        const current = this.bags.get(key);
        if (reusableAudioBag(current, signature)) return audioDeckOrderWithFallbacks(current.remaining, ids);

        const next = this.buildAudioBag(ids, signature, current);
        this.bags.set(key, next);
        return audioDeckOrderWithFallbacks(next.remaining, ids);
    }

    private buildAudioBag(ids: string[], signature: string, current: ShuffledAudioBag | undefined): ShuffledAudioBag {
        const remaining = this.shuffle(ids);
        const lastPlayed = current?.lastPlayed;
        rotateRepeatedAudioLead(remaining, lastPlayed);
        return { signature, remaining, lastPlayed };
    }

    markPlayed(key: string, id: string): void {
        const current = this.bags.get(key);
        if (!current) return;

        removeAudioDeckId(current.remaining, id);
        current.lastPlayed = id;
    }

    markSkipped(key: string, id: string): void {
        const current = this.bags.get(key);
        if (!current) return;
        removeAudioDeckId(current.remaining, id);
    }

    private shuffle(values: string[]): string[] {
        const shuffled = [...values];
        for (let index = shuffled.length - 1; index > 0; index--) {
            const swapIndex = Math.floor(this.random() * (index + 1));
            [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
        }
        return shuffled;
    }
}

interface ShuffledAudioBag {
    signature: string;
    remaining: string[];
    lastPlayed?: string;
}

function reusableAudioBag(bag: ShuffledAudioBag | undefined, signature: string): bag is ShuffledAudioBag {
    return Boolean(bag && bag.signature === signature && bag.remaining.length);
}

function audioDeckOrderWithFallbacks(remaining: string[], ids: string[]): string[] {
    const unplayed = new Set(remaining);
    return [
        ...remaining,
        ...ids.filter(id => !unplayed.has(id)),
    ];
}

function rotateRepeatedAudioLead(ids: string[], lastPlayed: string | undefined): void {
    if (lastPlayed && ids.length > 1 && ids[0] === lastPlayed) ids.push(ids.shift()!);
}

function removeAudioDeckId(ids: string[], id: string): void {
    const index = ids.indexOf(id);
    if (index >= 0) ids.splice(index, 1);
}
