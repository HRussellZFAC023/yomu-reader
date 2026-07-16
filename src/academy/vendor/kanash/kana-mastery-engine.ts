// Direct TypeScript adaptation of Kanash kana.rs/helper/ja.rs (MIT).
// Pinned source and behavioral changes are recorded in ADAPTATION.md.

export interface KanaMasteryItem {
    readonly id: string;
    readonly kana: string;
    readonly romaji: string;
}

export interface KanaMasterySnapshot {
    readonly shown: number;
    readonly correct: number;
    readonly errors: number;
    readonly input: string;
    readonly currentKana: string | null;
    readonly displayAnswer: boolean;
    readonly masteredIds: readonly string[];
    readonly remaining: number;
    readonly complete: boolean;
}

export interface KanaMasteryResult {
    readonly outcome: 'correct' | 'retry';
    readonly item: KanaMasteryItem;
    readonly mastered: boolean;
}

export interface KanaMasterySession {
    readonly current: KanaMasteryItem | null;
    readonly snapshot: KanaMasterySnapshot;
    submit(input: string): KanaMasteryResult;
    reveal(): string;
    review(): void;
}

export const KANASH_UPSTREAM = Object.freeze({
    repository: 'https://github.com/benoitlx/kanash',
    commit: 'ee8669635d33661bd92deef97e0f73fe03043984',
    license: 'MIT',
    reusedFiles: Object.freeze([
        'kanash-components/src/kana.rs',
        'kanash-components/src/helper/ja.rs',
    ]),
    wrapper: 'src/academy/ui/lesson-zero-kana-mastery.ts',
});

export function createKanaMasterySession(
    items: readonly KanaMasteryItem[],
    random: () => number = Math.random,
): KanaMasterySession {
    if (!items.length) throw new TypeError('Kana mastery needs at least one kana.');
    const ids = new Set<string>();
    for (const item of items) {
        if (!item.id.trim() || ids.has(item.id) || !item.kana.trim() || !item.romaji.trim()) {
            throw new TypeError('Kana mastery items need unique ids, kana, and romaji.');
        }
        ids.add(item.id);
    }

    const queue = shuffled(items, random);
    const mastered = new Set<string>();
    let current = queue.shift() ?? null;
    let shown = 0;
    let correct = 0;
    let errors = 0;
    let input = '';
    let displayAnswer = false;
    let currentHadSupport = false;

    const advance = (): void => {
        input = '';
        displayAnswer = false;
        currentHadSupport = false;
        current = queue.shift() ?? null;
    };

    return {
        get current() { return current ? { ...current } : null; },
        get snapshot() {
            return {
                shown,
                correct,
                errors,
                input,
                currentKana: current?.kana ?? null,
                displayAnswer,
                masteredIds: [...mastered],
                remaining: items.length - mastered.size,
                complete: mastered.size === items.length,
            };
        },
        submit(value) {
            if (!current) throw new TypeError('Kana mastery is already complete.');
            input = normalizeReading(value);
            shown += 1;
            const active = current;
            if (!matchesReading(input, active)) {
                errors += 1;
                currentHadSupport = true;
                return { outcome: 'retry', item: { ...active }, mastered: false };
            }

            const clean = !currentHadSupport && !displayAnswer;
            if (clean) {
                correct += 1;
                mastered.add(active.id);
            } else if (!mastered.has(active.id) && !queue.some(item => item.id === active.id)) {
                queue.push(active);
            }
            advance();
            return { outcome: 'correct', item: { ...active }, mastered: clean };
        },
        reveal() {
            if (!current) throw new TypeError('Kana mastery is already complete.');
            if (!currentHadSupport) throw new TypeError('Answer support is available after an attempt.');
            displayAnswer = true;
            input = '';
            return current.romaji;
        },
        review() {
            if (!current) throw new TypeError('Kana mastery is already complete.');
            currentHadSupport = true;
        },
    };
}

function normalizeReading(value: string): string {
    return value.normalize('NFKC').trim().toLocaleLowerCase('en-US')
        .replace(/[\u30a1-\u30f6]/gu, character => String.fromCharCode(character.charCodeAt(0) - 0x60));
}

function matchesReading(value: string, item: KanaMasteryItem): boolean {
    return value === normalizeReading(item.romaji) || value === normalizeReading(item.kana);
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const target = Math.min(index, Math.max(0, Math.floor(random() * (index + 1))));
        [copy[index], copy[target]] = [copy[target]!, copy[index]!];
    }
    return copy;
}
