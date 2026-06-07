export function isRubyAnnotation(element: Element): boolean {
    return element.tagName === 'RT' || element.tagName === 'RP';
}

export function rubyReadingText(
    element: Element,
    fallback: (root: Node) => string,
    rtText: (element: Element, base: string) => string = defaultRubyText,
): string {
    let text = '';
    let base = '';
    element.childNodes.forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
            base += child.textContent ?? '';
            return;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) return;
        const childElement = child as Element;
        if (childElement.tagName === 'RT') {
            text += rtText(childElement, base);
            base = '';
            return;
        }
        if (childElement.tagName === 'RP') return;
        base += fallback(childElement);
    });
    return text + base || fallback(element);
}

function defaultRubyText(element: Element, base: string): string {
    return element.textContent || base;
}
