const API_CONTENT_SECURITY_POLICY =
  "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/**
 * Apply the baseline policy at the Worker boundary so errors, preflights, cache
 * hits, and ordinary responses cannot accidentally diverge.
 *
 * Existing route-specific CSPs win. In particular, yomu-support's donation
 * form needs its inline stylesheet and same-origin form submission.
 */
export function withWorkerSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set(
    "strict-transport-security",
    "max-age=63072000; includeSubDomains",
  );
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  if (!headers.has("content-security-policy")) {
    headers.set("content-security-policy", API_CONTENT_SECURITY_POLICY);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
