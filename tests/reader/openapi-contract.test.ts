import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// The executable OpenAPI builder is JavaScript so docs can be built without a
// TypeScript runtime. Vitest still loads the same module used in production.
// @ts-expect-error The JavaScript builder intentionally has no declaration file.
const openapi = await import('../../scripts/openapi/yomu-openapi.mjs');

type Operation = { readonly method: string; readonly path: string; readonly operationId: string };
type ObjectSchema = {
    readonly required: readonly string[];
    readonly properties: Readonly<Record<string, unknown>>;
    readonly additionalProperties: boolean;
};

const root = resolve(import.meta.dirname, '../..');

function routeSet(operations: readonly Operation[]): Set<string> {
    return new Set(operations.map(operation => `${operation.method.toUpperCase()} ${operation.path}`));
}

function literalAcademyRoutes(): Set<string> {
    const router = readFileSync(resolve(root, 'workers/yomu-academy/src/index.ts'), 'utf8');
    const paymentRouter = readFileSync(resolve(root, 'workers/yomu-academy/src/payment-routes.ts'), 'utf8');
    const routes = new Set([...router.matchAll(/case '([A-Z]+ \/academy\/(?:api|media)\/[^']+)'/gu)].map(match => match[1]));

    for (const match of paymentRouter.matchAll(/route === '([A-Z]+ \/academy\/api\/[^']+)'/gu)) routes.add(match[1]);
    routes.add('PUT /academy/api/pairings/{pairingId}');
    routes.add('PUT /academy/api/device/pairings/{pairingId}');
    routes.add('DELETE /academy/api/account/devices/{deviceId}');
    routes.add('GET /academy/api/classes/{classId}/board');
    routes.add('GET /academy/api/classes/{classId}/leaderboard');
    routes.add('GET /academy/api/classes/{classId}/summary');
    routes.add('PATCH /academy/api/classes/{classId}/members/{accountId}/moderation');
    routes.add('GET /academy/media/{assetPath}');
    return routes;
}

describe('public Yomu OpenAPI contracts', () => {
    it('builds four independently selectable service contracts with unique operation ids', () => {
        expect(openapi.validateOpenApiDocuments()).toEqual({ services: 4, operations: 70 });

        const documents = openapi.serviceDocuments as Record<string, { paths: Record<string, Record<string, { operationId: string }>> }>;
        const ids = Object.values(documents)
            .flatMap(document => (
                Object.values(document.paths).flatMap(path => Object.values(path).map(operation => operation.operationId))
            ));
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('documents every externally routed Academy operation and no internal payment ingress', () => {
        const documented = routeSet(openapi.academyOperations);
        const routed = literalAcademyRoutes();

        expect([...documented].sort()).toEqual([...routed].sort());
        expect([...documented].some(route => route.includes('/academy/internal/'))).toBe(false);
    });

    it('keeps the other public service route surfaces complete', () => {
        expect([...routeSet(openapi.audioOperations)].sort()).toEqual([
            'GET /', 'GET /audio/tts', 'GET /audio/{key}', 'GET /healthz', 'GET /status', 'GET /voice/line',
        ]);
        expect([...routeSet(openapi.supportOperations)].sort()).toEqual([
            'GET /checkout', 'GET /claim', 'GET /donate', 'GET /goal', 'GET /healthz', 'GET /progress', 'GET /status',
            'POST /stripe/webhook', 'POST /webhook', 'POST /webhooks/bmac', 'POST /webhooks/kofi',
            'POST /webhooks/patreon', 'POST /webhooks/paypal',
        ]);
        expect([...routeSet(openapi.edgeOperations)].sort()).toEqual(['GET /', 'GET /healthz', 'GET /status']);
    });

    it('keeps support funding response schemas aligned with the Worker payloads', () => {
        const documents = openapi.serviceDocuments as Record<string, {
            components: { schemas: Record<string, ObjectSchema> };
        }>;
        const schemas = documents.support.components.schemas;
        const expectedFields = {
            SupportGoal: ['service', 'currency', 'floorGBP', 'forecastGBP', 'monthlyGoalGBP', 'breakdown'],
            SupportProgress: [
                'service', 'currency', 'month', 'totalThisMonthGbp', 'totalTodayGbp', 'needsRate', 'providers', 'source',
            ],
            SupportStatus: [
                'service', 'status', 'revision', 'currency', 'dailyBudgetGbp', 'donationGoalGbp',
                'floorGbp', 'forecastGbp', 'donationsTodayGbp', 'donationsThisMonthGbp',
                'donationsSource', 'needsRate', 'estimatedDailyCostGbp', 'estimatedMonthlyCostGbp',
                'goalMet', 'progressRatio', 'donateUrl', 'featuresAtRisk', 'providers', 'breakdown',
                'academyDeliveryAlert', 'display', 'banner',
            ],
        } as const;

        for (const [name, fields] of Object.entries(expectedFields)) {
            const schema = schemas[name];
            expect(schema.additionalProperties).toBe(false);
            expect([...schema.required].sort()).toEqual([...fields].sort());
            expect(Object.keys(schema.properties).sort()).toEqual([...fields].sort());
        }
    });

    it('publishes JSON, YAML, the Academy aliases, and the service catalog', () => {
        const apiRoot = resolve(root, 'docs/public/api');
        for (const service of ['academy', 'audio', 'support', 'edge']) {
            const json = JSON.parse(readFileSync(resolve(apiRoot, `${service}.openapi.json`), 'utf8')) as { openapi: string };
            const yaml = readFileSync(resolve(apiRoot, `${service}.openapi.yaml`), 'utf8');
            expect(json.openapi).toBe('3.1.0');
            expect(yaml).toMatch(/^"openapi": "3\.1\.0"/mu);
        }

        expect(JSON.parse(readFileSync(resolve(apiRoot, 'openapi.json'), 'utf8')).info.title).toBe('Yomu Academy API');
        expect(readFileSync(resolve(apiRoot, 'openapi.yaml'), 'utf8')).toContain('"title": "Yomu Academy API"');
        expect(JSON.parse(readFileSync(resolve(apiRoot, 'catalog.json'), 'utf8')).services).toHaveLength(4);
    });
});
