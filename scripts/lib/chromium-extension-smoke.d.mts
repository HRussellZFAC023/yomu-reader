interface ExtensionWorker {
    url(): string;
    evaluate(probe: () => boolean): Promise<boolean>;
}

interface ExtensionWorkerContext {
    serviceWorkers(): ExtensionWorker[];
    waitForEvent(event: 'serviceworker', options: {
        predicate(worker: ExtensionWorker): boolean;
        timeout: number;
    }): Promise<ExtensionWorker>;
}

export function waitForChromiumExtensionWorker(context: ExtensionWorkerContext, timeoutMs?: number): Promise<ExtensionWorker>;
