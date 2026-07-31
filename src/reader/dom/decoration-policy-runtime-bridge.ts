export type DecorationPolicyRuntimeApi = typeof import('./decoration-policy');

// The aggregate @require runtime and core userscript are separate IIFEs in one
// userscript sandbox. Keep the DOM policy in that sandbox: unlike the public
// companion registry, this slot is never cloned into Firefox's page realm.
const DECORATION_POLICY_RUNTIME_API_SLOT = Symbol.for('yomu.decoration-policy-runtime-api.v1');

type DecorationPolicyRuntimeRealm = typeof globalThis & { [key: symbol]: unknown };

export function registerDecorationPolicyRuntimeApi(api: DecorationPolicyRuntimeApi): void {
    Object.defineProperty(globalThis as DecorationPolicyRuntimeRealm, DECORATION_POLICY_RUNTIME_API_SLOT, {
        configurable: true,
        enumerable: false,
        value: api,
        writable: true,
    });
}

export function decorationPolicyRuntimeApi(): DecorationPolicyRuntimeApi {
    const api = (globalThis as DecorationPolicyRuntimeRealm)[DECORATION_POLICY_RUNTIME_API_SLOT];
    if (!isDecorationPolicyRuntimeApi(api)) {
        throw new Error('The Yomu decoration-policy runtime is not installed.');
    }
    return api;
}

function isDecorationPolicyRuntimeApi(value: unknown): value is DecorationPolicyRuntimeApi {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<DecorationPolicyRuntimeApi>;
    return typeof candidate.classifyDecoration === 'function'
        && typeof candidate.safeElementMatches === 'function'
        && typeof candidate.setReviewCardFrontPredicate === 'function';
}
