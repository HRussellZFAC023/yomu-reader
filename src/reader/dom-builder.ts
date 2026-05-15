type PrimitiveChild = Node | string | number | boolean | null | undefined;
export type DomChild = PrimitiveChild | DomChild[];

export interface DomAttrs {
    class?: string;
    className?: string;
    dataset?: Record<string, string | number | boolean | null | undefined>;
    text?: string | number;
    [name: string]: unknown;
}

type DomDataset = NonNullable<DomAttrs['dataset']>;

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
        applyAttr(element, name, value);
    }
}

function applyAttr(element: HTMLElement, name: string, value: unknown): void {
    if (isSkippedAttrValue(value)) return;
    if (applySpecialAttr(element, name, value)) return;
    element.setAttribute(name, value === true ? '' : String(value));
}

function applySpecialAttr(element: HTMLElement, name: string, value: unknown): boolean {
    return applyClassAttr(element, name, value)
        || applyDatasetAttr(element, name, value)
        || applyTextAttr(element, name, value)
        || applyElementProperty(element, name, value);
}

function isSkippedAttrValue(value: unknown): boolean {
    return value === false || value === null || value === undefined;
}

function applyClassAttr(element: HTMLElement, name: string, value: unknown): boolean {
    if (name !== 'class' && name !== 'className') return false;
    element.className = String(value);
    return true;
}

function applyDatasetAttr(element: HTMLElement, name: string, value: unknown): boolean {
    if (name !== 'dataset') return false;
    for (const [key, dataValue] of Object.entries(datasetAttrValues(value))) {
        applyDatasetValue(element, key, dataValue);
    }
    return true;
}

function datasetAttrValues(value: unknown): DomDataset {
    return (value as DomDataset | undefined) ?? {};
}

function applyDatasetValue(element: HTMLElement, key: string, value: unknown): void {
    if (isSkippedAttrValue(value)) return;
    element.dataset[key] = String(value);
}

function applyTextAttr(element: HTMLElement, name: string, value: unknown): boolean {
    if (name !== 'text') return false;
    element.textContent = String(value);
    return true;
}

function applyElementProperty(element: HTMLElement, name: string, value: unknown): boolean {
    if (!canApplyElementProperty(element, name)) return false;
    return assignElementProperty(element, name, value);
}

function canApplyElementProperty(element: HTMLElement, name: string): boolean {
    if (!(name in element)) return false;
    if (name === 'role') return false;
    return !name.startsWith('aria');
}

function assignElementProperty(element: HTMLElement, name: string, value: unknown): boolean {
    try {
        (element as unknown as Record<string, unknown>)[name] = value;
        return true;
    } catch {
        return false;
    }
}

function appendChildren(parent: ParentNode, children: DomChild[]): void {
    const nodes: Node[] = [];
    collectChildren(nodes, children);
    parent.append(...nodes);
}

function collectChildren(nodes: Node[], children: DomChild[]): void {
    for (const child of children) {
        appendDomChild(nodes, child);
    }
}

function appendDomChild(nodes: Node[], child: DomChild): void {
    if (Array.isArray(child)) {
        collectChildren(nodes, child);
        return;
    }
    if (child instanceof Node) {
        nodes.push(child);
        return;
    }
    if (!isSkippedChild(child)) nodes.push(document.createTextNode(String(child)));
}

function isSkippedChild(child: PrimitiveChild): boolean {
    return child === false || child === null || child === undefined;
}
