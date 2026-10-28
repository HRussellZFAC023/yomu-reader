import { describe, expect, it, vi } from 'vitest';
import {
    hostedRuntimeGraph,
    loadHostedReaderRuntime,
} from '../../src/reader/app/hosted-runtime-graph';
import { hostedRuntimeGraphFixture } from '../helpers/hosted-runtime-graph';

const GRAPH_SLOT = '__yomuHostedRuntimeGraph';

function graphRealm() {
    const realm = {
        [GRAPH_SLOT]: hostedRuntimeGraphFixture(),
    };
    return realm as unknown as typeof globalThis;
}

describe('hosted Reader runtime graph browser Module', () => {
    it('validates and exposes dependencies before core', () => {
        expect(hostedRuntimeGraph(graphRealm()).scripts.map(script => script.role)).toEqual([
            'dependency',
            'core',
        ]);
    });

    it('serially executes the generated dependency graph before core', async () => {
        const ownerDocument = document.implementation.createHTMLDocument('runtime loader');
        const appended: HTMLScriptElement[] = [];
        dispatchRuntimeScriptEvent(ownerDocument, 'load', script => appended.push(script));

        const loaded = await loadFixtureRuntime(ownerDocument, 'test-runtime');

        expect(appended.map(script => script.dataset.yomuHostedRuntimeRole)).toEqual(['dependency', 'core']);
        expect(appended.map(script => script.dataset.yomuHostedRuntimeState)).toEqual(['loaded', 'loaded']);
        expect(appended.every(script => script.integrity.startsWith('sha256-'))).toBe(true);
        expect(appended.every(script => script.crossOrigin === 'anonymous')).toBe(true);
        expect(loaded.core).toBe(appended[1]);
    });

    it('fails closed without appending core when a dependency fails', async () => {
        const ownerDocument = document.implementation.createHTMLDocument('runtime loader failure');
        const roles: string[] = [];
        dispatchRuntimeScriptEvent(ownerDocument, 'error', script => {
            roles.push(script.dataset.yomuHostedRuntimeRole ?? '');
        });

        await expect(loadFixtureRuntime(ownerDocument, 'failed-runtime'))
            .rejects.toThrow(/dependency failed integrity or network loading/u);
        expect(roles).toEqual(['dependency']);
    });

    it('adopts an existing script only when its role, source, and SRI match', async () => {
        const ownerDocument = document.implementation.createHTMLDocument('runtime loader adoption');
        const [dependency] = hostedRuntimeGraph(graphRealm()).scripts;
        const dependencySrc = `https://yomureader.com/${dependency.path}`;
        const existing = existingRuntimeScript(ownerDocument, 'adopt-runtime-dependency-0', dependencySrc, dependency);
        const appended: HTMLScriptElement[] = [];
        ownerDocument.head.append(existing);
        dispatchRuntimeScriptEvent(ownerDocument, 'load', script => appended.push(script));

        const loaded = await loadFixtureRuntime(ownerDocument, 'adopt-runtime');

        expect(loaded.scripts[0]).toBe(existing);
        expect(appended.map(script => script.dataset.yomuHostedRuntimeRole)).toEqual(['core']);
    });

    it.each([
        ['role', (script: HTMLScriptElement) => { script.dataset.yomuHostedRuntimeRole = 'core'; }],
        ['source', (script: HTMLScriptElement) => { script.src = 'https://attacker.invalid/collision.js'; }],
        ['SRI', (script: HTMLScriptElement) => { script.integrity = 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='; }],
        ['CORS mode', (script: HTMLScriptElement) => { script.crossOrigin = 'use-credentials'; }],
        ['loader state', (script: HTMLScriptElement) => { delete script.dataset.yomuHostedRuntimeState; }],
    ])('fails closed and preserves an existing script whose %s does not match', async (_field, mutate) => {
        const ownerDocument = document.implementation.createHTMLDocument('runtime loader collision');
        const [dependency] = hostedRuntimeGraph(graphRealm()).scripts;
        const existing = existingRuntimeScript(
            ownerDocument,
            'collision-runtime-dependency-0',
            `https://yomureader.com/${dependency.path}`,
            dependency,
        );
        mutate(existing);
        ownerDocument.head.append(existing);

        await expect(loadFixtureRuntime(ownerDocument, 'collision-runtime'))
            .rejects.toThrow(/dependency failed integrity or network loading/u);
        expect(ownerDocument.getElementById(existing.id)).toBe(existing);
    });

    it('fails closed and preserves a non-script element occupying the runtime id', async () => {
        const ownerDocument = document.implementation.createHTMLDocument('runtime element collision');
        const existing = ownerDocument.createElement('div');
        existing.id = 'element-collision-runtime-dependency-0';
        ownerDocument.body.append(existing);

        await expect(loadFixtureRuntime(ownerDocument, 'element-collision-runtime'))
            .rejects.toThrow(/dependency failed integrity or network loading/u);
        expect(ownerDocument.getElementById(existing.id)).toBe(existing);
    });

    it('rejects a dependency whose immutable filename and SRI disagree', () => {
        const realm = graphRealm() as typeof globalThis & { [GRAPH_SLOT]: any };
        realm[GRAPH_SLOT].dependencies[0].path = 'greasyfork/yomu-test.000000000000.user.js';

        expect(() => hostedRuntimeGraph(realm)).toThrow(/filename and integrity disagree/u);
    });
});

function loadFixtureRuntime(ownerDocument: Document, scriptIdPrefix: string) {
    return loadHostedReaderRuntime({
        document: ownerDocument,
        realm: graphRealm(),
        resolveCandidates: script => [`https://yomureader.com/${script.path}`],
        scriptIdPrefix,
    });
}

function dispatchRuntimeScriptEvent(
    ownerDocument: Document,
    eventName: 'error' | 'load',
    visit: (script: HTMLScriptElement) => void,
): void {
    const append = ownerDocument.head.append.bind(ownerDocument.head);
    vi.spyOn(ownerDocument.head, 'append').mockImplementation((...nodes: (Node | string)[]) => {
        append(...nodes);
        for (const node of nodes) {
            if (!(node instanceof HTMLScriptElement)) continue;
            visit(node);
            queueMicrotask(() => node.dispatchEvent(new Event(eventName)));
        }
    });
}

function existingRuntimeScript(
    ownerDocument: Document,
    id: string,
    src: string,
    entry: ReturnType<typeof hostedRuntimeGraph>['scripts'][number],
): HTMLScriptElement {
    const script = ownerDocument.createElement('script');
    script.id = id;
    script.src = src;
    script.integrity = entry.integrity;
    script.crossOrigin = 'anonymous';
    script.dataset.yomuHostedRuntimeRole = entry.role;
    script.dataset.yomuHostedRuntimeState = 'loaded';
    return script;
}
