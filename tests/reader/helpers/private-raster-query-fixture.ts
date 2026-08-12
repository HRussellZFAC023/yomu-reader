import { privateRasterImageForHost } from '../../../src/reader/ocr/private-raster-presenter';

export type PrivateRasterQueryFixture = {
    publicHost<T extends Element = Element>(selector: string): T | null;
    restore(): void;
};

/**
 * Lets pre-existing raster interaction scenarios keep querying the displayed
 * image while production continues to expose only its source-free public host.
 * Privacy assertions bypass the fixture through `publicHost`.
 */
export function installPrivateRasterQueryFixture(
    documentRoot: Document,
    selectors: readonly string[],
): PrivateRasterQueryFixture {
    const privateSelectors = new Set(selectors);
    const queryDescriptor = Object.getOwnPropertyDescriptor(documentRoot, 'querySelector');
    const queryAllDescriptor = Object.getOwnPropertyDescriptor(documentRoot, 'querySelectorAll');
    const query = documentRoot.querySelector.bind(documentRoot);
    const queryAll = documentRoot.querySelectorAll.bind(documentRoot);

    Object.defineProperties(documentRoot, {
        querySelector: {
            configurable: true,
            writable: true,
            value: <T extends Element = Element>(selector: string): T | null => {
                const host = query(selector);
                if (!privateSelectors.has(selector)) return host as T | null;
                return (privateRasterImageForHost(host) ?? host) as T | null;
            },
        },
        querySelectorAll: {
            configurable: true,
            writable: true,
            value: <T extends Element = Element>(selector: string): NodeListOf<T> => {
                const hosts = queryAll(selector);
                if (!privateSelectors.has(selector)) return hosts as NodeListOf<T>;
                const images = [...hosts].map(host => privateRasterImageForHost(host) ?? host);
                Object.defineProperty(images, 'item', {
                    value: (index: number) => images[index] ?? null,
                });
                return images as unknown as NodeListOf<T>;
            },
        },
    });

    return {
        publicHost: <T extends Element = Element>(selector: string): T | null => query(selector) as T | null,
        restore: () => {
            if (queryDescriptor) Object.defineProperty(documentRoot, 'querySelector', queryDescriptor);
            else Reflect.deleteProperty(documentRoot, 'querySelector');
            if (queryAllDescriptor) Object.defineProperty(documentRoot, 'querySelectorAll', queryAllDescriptor);
            else Reflect.deleteProperty(documentRoot, 'querySelectorAll');
        },
    };
}
