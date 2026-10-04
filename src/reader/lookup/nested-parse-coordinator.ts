interface ParseState {
    dirty: boolean;
    running?: Promise<void>;
}

export class NestedParseCoordinator {
    private states = new WeakMap<HTMLElement, ParseState>();

    run(root: HTMLElement, parse: () => Promise<void>, isCurrent: () => boolean): Promise<void> {
        let state = this.states.get(root);
        if (!state) {
            state = { dirty: false };
            this.states.set(root, state);
        }
        state.dirty = true;
        if (state.running) return state.running;
        const currentState = state;
        state.running = this.drain(state, parse, isCurrent).finally(() => {
            currentState.running = undefined;
            // A provider can commit between the drain's final check and this
            // release; its caller must still await that follow-up pass.
            if (currentState.dirty && isCurrent()) return this.run(root, parse, isCurrent);
        });
        return state.running;
    }

    private async drain(state: ParseState, parse: () => Promise<void>, isCurrent: () => boolean): Promise<void> {
        // Provider commits in the same microtask batch share one parse pass.
        await Promise.resolve();
        while (state.dirty && isCurrent()) {
            state.dirty = false;
            await parse();
        }
    }
}
