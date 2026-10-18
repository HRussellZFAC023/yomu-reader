export interface HasGateProbe {
    selector: string;
    wholeSubtree: boolean;
}

export const HAS_GATE_PROBES: readonly HasGateProbe[];
