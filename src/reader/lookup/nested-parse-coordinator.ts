import { abandonStaleNestedParse } from './nested-text-parse';

interface ParseOwner {
    dirty: boolean;
    running?: Promise<void>;
    parse: () => Promise<void>;
    isCurrent: () => boolean;
}

/**
 * One Nested Parse Owner per root (CONTEXT.md). Passes never overlap, and each
 * starts only if `isCurrent()` still holds right before it runs.
 */
export class NestedParseCoordinator {
    private owners = new WeakMap<HTMLElement, ParseOwner>();

    run(root: HTMLElement, parse: () => Promise<void>, isCurrent: () => boolean): Promise<void> {
        const owner = this.owners.get(root) ?? { dirty: true, parse, isCurrent };
        this.owners.set(root, owner);
        // The latest request's options serve the next pass.
        Object.assign(owner, { dirty: true, parse, isCurrent });
        abandonStaleNestedParse(root);
        owner.running ??= this.drain(owner);
        return owner.running;
    }

    private async drain(owner: ParseOwner): Promise<void> {
        try {
            // Provider commits in the same microtask batch share one parse pass.
            await Promise.resolve();
            while (owner.dirty && owner.isCurrent()) {
                owner.dirty = false;
                await owner.parse();
            }
        } finally {
            // Released in the same turn as the final dirty check: a later
            // request always starts, and is awaited by, a fresh drain.
            owner.running = undefined;
        }
    }
}
