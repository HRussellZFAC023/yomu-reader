export interface HasGateProbe {
    selector: string;
    wholeSubtree: boolean;
}

export const HAS_GATE_PROBES: readonly HasGateProbe[];

export const HAS_GATE_RULE_PROBES: readonly { rule: string; wholeSubtree: boolean }[];
