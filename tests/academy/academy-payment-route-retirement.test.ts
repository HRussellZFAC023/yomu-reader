// @vitest-environment node
import worker from '../../workers/yomu-academy/src/index';
import type { ExecutionContext } from '../../workers/yomu-academy/src/cf';
import { createFakeAcademy } from './helpers/fake-academy-env';

const context: ExecutionContext = {
    waitUntil(promise): void {
        void promise.catch(() => undefined);
    },
};

describe('Academy-owned Stripe route retirement', () => {
    it.each([
        ['POST', '/academy/api/checkout'],
        ['POST', '/academy/api/stripe/webhook'],
        ['GET', '/academy/api/claim?session_id=cs_test_retired'],
    ])('returns 404 for the retired %s %s route', async (method, path) => {
        const academy = createFakeAcademy();

        const response = await worker.fetch(new Request(`https://yomureader.com${path}`, { method }), academy.env, context);

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toEqual({ error: 'Not found.' });
    });
});
