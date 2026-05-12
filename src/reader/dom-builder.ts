type PrimitiveChild = Node | string | number | boolean | null | undefined;
export type DomChild = PrimitiveChild | DomChild[];

export interface DomAttrs {
    class?: string;
    className?: string;
    dataset?: Record<string, string | number | boolean | null | undefined>;
    text?: string | number;
    [name: string]: unknown;
}

export function el<K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    attrs?: DomAttrs | null,
    ...children: DomChild[]
): HTMLElementTagNameMap[K] {
    const element = document.createElement(tagName);
    applyAttrs(element, attrs);
    appendChildren(element, children);
    return element;
}

export function fragment(...children: DomChild[]): DocumentFragment {
    const root = document.createDocumentFragment();
    appendChildren(root, children);
    return root;
}

export function replaceChildrenWith(parent: Element | DocumentFragment, ...children: DomChild[]): void {
    const nextChildren: Node[] = [];
    collectChildren(nextChildren, children);
    parent.replaceChildren(...nextChildren);
}

function applyAttrs(element: HTMLElement, attrs?: DomAttrs | null): void {
    if (!attrs) return;
    for (const [name, value] of Object.entries(attrs)) {
        if (value === false || value === null || value === undefined) continue;
        if (name === 'class' || name === 'className') {
            element.className = String(value);
            continue;
        }
        if (name === 'dataset') {
            for (const [key, dataValue] of Object.entries((value as DomAttrs['dataset']) ?? {})) {
                if (dataValue !== false && dataValue !== null && dataValue !== undefined) {
                    element.dataset[key] = String(dataValue);
                }
            }
            continue;
        }
        if (name === 'text') {
            element.textContent = String(value);
            continue;
        }
        if (name in element && name !== 'role' && !name.startsWith('aria')) {
            try {
                (element as unknown as Record<string, unknown>)[name] = value;
                continue;
            } catch {
                // Fall back to an attribute for read-only DOM properties.
            }
        }
        element.setAttribute(name, value === true ? '' : String(value));
    }
}

function appendChildren(parent: ParentNode, children: DomChild[]): void {
    const nodes: Node[] = [];
    collectChildren(nodes, children);
    parent.append(...nodes);
}

function collectChildren(nodes: Node[], children: DomChild[]): void {
    for (const child of children) {
        if (Array.isArray(child)) {
            collectChildren(nodes, child);
        } else if (child instanceof Node) {
            nodes.push(child);
        } else if (child !== false && child !== null && child !== undefined) {
            nodes.push(document.createTextNode(String(child)));
        }
    }
}
