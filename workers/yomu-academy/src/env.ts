import type { D1Database, R2Bucket } from './cf';

/** Bindings and secrets for the yomu-academy Worker (see wrangler.academy.jsonc). */
export interface Env {
    readonly ACADEMY_DB: D1Database;
    readonly ACADEMY_MEDIA: R2Bucket;
    /** Public origin the Academy app is served from, e.g. "https://yomureader.com". */
    readonly ACADEMY_ORIGIN: string;
    /** Secret: HMAC key for invite codes, session tokens, and claim tokens. */
    readonly ACADEMY_INVITE_HMAC_KEY: string;
    /** Secret: HMAC key for rate-limit client subjects (never store raw IPs). */
    readonly ACADEMY_RATE_HMAC_KEY: string;
    /** Secret: bearer token for the admin invite endpoint. */
    readonly ACADEMY_ADMIN_TOKEN: string;
    /** Secret: Stripe test-mode API secret key (sk_test_… only; live keys are rejected). */
    readonly STRIPE_SECRET_KEY: string;
    /** Secret: Stripe webhook signing secret (whsec_…). */
    readonly STRIPE_WEBHOOK_SECRET: string;
    /**
     * Secret: bearer credential for the dormant private payment-ingress
     * contract. Set only when a trusted Worker Service binding is cut over.
     */
    readonly PAYMENT_INGRESS_TOKEN?: string;
    /** Secret: Google web OAuth client id. */
    readonly GOOGLE_OIDC_CLIENT_ID: string;
    /** Secret: Google web OAuth client secret. */
    readonly GOOGLE_OIDC_CLIENT_SECRET: string;
}

/** Injectable clock so webhook tolerance and expiry are testable. */
export type Clock = () => number;
