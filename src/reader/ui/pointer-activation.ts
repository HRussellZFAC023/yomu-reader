import {
    ControlPointerTarget,
    claimLocalTapActivation,
    enabledReaderControl,
    installControlTapActivation,
} from './trusted-interaction';

/** Root-local adapter for surfaces that own their own interaction lifecycle. */
export function installLocalTapActivation(root: HTMLElement): void {
    if (!claimLocalTapActivation(root)) return;
    root.dataset.yomuPointerActivationInstalled = 'true';
    const resolveControl = (target: EventTarget | null): ControlPointerTarget | null => {
        const control = enabledReaderControl(target);
        return control && root.contains(control) ? { target: control, root } : null;
    };
    installControlTapActivation(root, root.ownerDocument, resolveControl, { stopOnActivate: true });
}
