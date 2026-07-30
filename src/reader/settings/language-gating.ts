import { languageSubtag } from '../languages';

export const LANGUAGE_FAMILY_CLASSES = [
    'jp-only',
    'jpzhyue-only',
    'jpzhyueko-only',
    'not-jpzhyueko',
] as const;

export type LanguageFamilyClass = typeof LANGUAGE_FAMILY_CLASSES[number];

interface LanguageFamilyNode {
    family: LanguageFamilyClass;
    node: HTMLElement;
    placeholder: Comment;
}

const familyNodesByRoot = new WeakMap<HTMLElement, LanguageFamilyNode[]>();

/**
 * Applies Yomitan's language-family vocabulary, then physically detaches
 * unsupported families. The CSS classes remain the declarative fallback, while
 * the live DOM contains only controls the selected target can use.
 */
export function syncLanguageFamilyDom(root: HTMLElement, language: string): void {
    const base = languageSubtag(language) ?? language.toLowerCase();
    root.dataset.language = base;
    for (const state of languageFamilyNodes(root)) {
        if (languageFamilyIncludes(state.family, base)) {
            if (!state.node.parentNode) state.placeholder.after(state.node);
        } else {
            state.node.remove();
        }
    }
}

export function languageFamilyIncludes(family: LanguageFamilyClass, language: string): boolean {
    const base = languageSubtag(language) ?? language.toLowerCase();
    if (family === 'jp-only') return base === 'ja';
    const jpZhYue = base === 'ja' || base === 'zh' || base === 'yue';
    if (family === 'jpzhyue-only') return jpZhYue;
    const jpZhYueKo = jpZhYue || base === 'ko';
    return family === 'jpzhyueko-only' ? jpZhYueKo : !jpZhYueKo;
}

function languageFamilyNodes(root: HTMLElement): readonly LanguageFamilyNode[] {
    const states = familyNodesByRoot.get(root) ?? [];
    const selector = LANGUAGE_FAMILY_CLASSES.map(family => `.${family}`).join(',');
    const knownNodes = new Set(states.map(state => state.node));
    const discovered = Array.from(root.querySelectorAll<HTMLElement>(selector))
        .filter(node => !knownNodes.has(node))
        .filter(node => !node.parentElement?.closest(selector))
        .map(node => {
            const family = LANGUAGE_FAMILY_CLASSES.find(value => node.classList.contains(value));
            if (!family) throw new TypeError('Language-family node has no supported family class.');
            const placeholder = root.ownerDocument.createComment(`yomu-language-family:${family}`);
            node.before(placeholder);
            return { family, node, placeholder };
        });
    states.push(...discovered);
    familyNodesByRoot.set(root, states);
    return states;
}
