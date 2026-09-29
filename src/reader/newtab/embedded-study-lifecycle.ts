/** Own a mounted Study instance from initialization through teardown. */
export async function mountEmbeddedStudyRuntime(
    host: HTMLElement,
    runtime: { init(): Promise<void>; destroy(): void },
): Promise<{ dispose(): void }> {
    let disposed = false;
    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        runtime.destroy();
        host.replaceChildren();
    };
    try {
        await runtime.init();
    } catch (error) {
        dispose();
        throw error;
    }
    return { dispose };
}
