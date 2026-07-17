/**
 * World-practice choice buttons intentionally do not expose which option is
 * correct via DOM attributes any more (see src/academy/ui/dom.ts `choiceToken`):
 * `data-choice-id` is now an opaque per-render index, not the content id. Tests
 * resolve a specific choice by looking up its position in the same domain
 * choice list the renderer iterates, then addressing the button at that index.
 */
export interface WorldChoiceRef {
    readonly id: string;
}

function choiceButtons(container: ParentNode): HTMLButtonElement[] {
    return Array.from(container.querySelectorAll<HTMLButtonElement>('[data-choice-id]'));
}

/** Finds the button rendered for `choiceId` within `container`, or null if absent. */
export function worldChoiceButton(
    container: ParentNode,
    choices: readonly WorldChoiceRef[],
    choiceId: string,
): HTMLButtonElement | null {
    const index = choices.findIndex(choice => choice.id === choiceId);
    if (index === -1) return null;
    return choiceButtons(container)[index] ?? null;
}

/**
 * Finds a choice button by its rendered Japanese label text. The label is
 * already visible content (what a learner reads before answering), so
 * matching on it -- rather than an internal content id -- never depends on
 * the DOM exposing which option is correct.
 */
export function worldChoiceButtonByLabel(container: ParentNode, labelJa: string): HTMLButtonElement | null {
    return choiceButtons(container).find(button => button.textContent?.includes(labelJa)) ?? null;
}
