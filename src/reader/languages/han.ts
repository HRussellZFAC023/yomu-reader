const UNIFIED_IDEOGRAPH_RE = /^\p{Unified_Ideograph}$/u;

/** One Unicode Han ideograph, including supplementary CJK extensions. */
export function isUnifiedIdeograph(value: string): boolean {
    return UNIFIED_IDEOGRAPH_RE.test(value);
}
