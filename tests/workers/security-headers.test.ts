import { describe, expect, it } from 'vitest';
import { withWorkerSecurityHeaders } from '../../workers/shared/security-headers';

describe('Worker security headers', () => {
  it('applies the API baseline without changing the response', async () => {
    const secured = withWorkerSecurityHeaders(
      new Response('ok', {
        status: 201,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      }),
    );

    expect(secured.status).toBe(201);
    expect(await secured.text()).toBe('ok');
    expect(secured.headers.get('strict-transport-security'))
      .toBe('max-age=63072000; includeSubDomains');
    expect(secured.headers.get('x-content-type-options')).toBe('nosniff');
    expect(secured.headers.get('referrer-policy')).toBe('no-referrer');
    expect(secured.headers.get('content-security-policy'))
      .toBe("default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  });

  it('preserves a route-specific content security policy', () => {
    const secured = withWorkerSecurityHeaders(
      new Response('form', {
        headers: {
          'content-security-policy':
            "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
        },
      }),
    );

    expect(secured.headers.get('content-security-policy'))
      .toBe("default-src 'none'; style-src 'unsafe-inline'; form-action 'self'");
  });
});
