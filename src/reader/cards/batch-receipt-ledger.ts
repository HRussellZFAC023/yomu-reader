export interface BatchReceiptItem {
    readonly id: string;
    readonly keys: readonly string[];
    readonly required: readonly string[];
}

type ReceiptGroup = Map<string, BatchReceiptItem>;

/** Keep retry prefixes until the whole operation finishes; never evict unresolved work. */
export class BatchReceiptLedger {
    private values = new Map<string, 'completed' | 'uncertain'>();
    private unresolved = new Set<ReceiptGroup>();
    constructor(private limit: number) {}

    get(key: string): 'completed' | 'uncertain' | undefined { return this.values.get(key); }
    set(key: string, value: 'completed' | 'uncertain'): void { this.values.set(key, value); }
    get size(): number { return this.retainedKeys().size; }

    reserve(items: readonly BatchReceiptItem[]): ReceiptGroup | null {
        const ids = new Set(items.map(item => item.id));
        const related = [...this.unresolved].filter(group => [...ids].some(id => group.has(id)));
        const operation = new Map(related.flatMap(group => [...group]));
        // Retrying a failed Anki stage may use corrected connection settings.
        // Replace that item's unfinished destination, retaining the completed prefix.
        items.forEach(item => operation.set(item.id, item));
        const remaining = [...this.unresolved].filter(group => !related.includes(group));
        if (this.retainedKeys([...remaining, operation]).size > this.limit) return null;
        related.forEach(group => this.unresolved.delete(group));
        this.unresolved.add(operation);
        return operation;
    }

    /** A word turned away before anything was written leaves the operation: there is nothing to finish. */
    release(operation: ReceiptGroup, id: string): void {
        operation.delete(id);
    }

    finish(operation: ReceiptGroup): void {
        if ([...operation.values()].every(item => item.required.every(key => this.values.get(key) === 'completed'))) {
            this.unresolved.delete(operation);
        }
    }

    beginGeneration(): void {
        for (const group of this.unresolved) this.finish(group);
        const protectedKeys = new Set([...this.unresolved].flatMap(group => [...group.values()].flatMap(item => item.keys)));
        for (const [key, value] of this.values) {
            if (value === 'completed' && !protectedKeys.has(key)) this.values.delete(key);
        }
    }

    private retainedKeys(groups: readonly ReceiptGroup[] = [...this.unresolved]): Set<string> {
        return new Set([...this.values.keys(), ...groups.flatMap(group => [...group.values()].flatMap(item => item.keys))]);
    }
}
