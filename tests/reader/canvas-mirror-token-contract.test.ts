import { afterEach, describe, expect, it } from 'vitest';

import {
    canvasMirrorContentToken,
    mirrorContentTokenForRecords,
    recorderBootstrap,
    resetMirrorSummaryBridgeForTests,
    type MirrorGlobalState,
    type MirrorOp,
    type MirrorRecord,
} from '../../src/reader/ocr/canvas-mirror';

const ID_ATTR = 'data-yomu-mid';
const MARKER_ATTR = 'data-yomu-mirror-recorder';
const DUMP_ATTR = 'data-yomu-mirror-dump';
const REQUEST_ATTR = 'data-yomu-mirror-request';
const PULL_EVENT = 'yomu-canvas-mirror-pull';

function imageOp(url: string, seq: number): MirrorOp {
    return {
        seq,
        srcId: null,
        url,
        sx: 0,
        sy: 0,
        sw: -1,
        sh: -1,
        dx: 0,
        dy: 0,
        dw: -1,
        dh: -1,
        clear: false,
    };
}

function clearOp(seq: number): MirrorOp {
    return { ...imageOp('', seq), clear: true };
}

function compositeOp(srcId: string, seq: number): MirrorOp {
    return { ...imageOp('', seq), srcId };
}

function liveRecordShape(): Record<string, MirrorRecord> {
    return {
        m10: {
            w: 1570,
            h: 2233,
            ops: [
                imageOp('https://viewer-epubs-trial.bookwalker.jp/book/4/OPS/images/old.jpg/0.jpeg?Policy=old&Signature=old&Key-Pair-Id=old', 9),
                clearOp(10),
                imageOp('https://viewer-epubs-trial.bookwalker.jp/book/4/OPS/images/current.jpg/0.jpeg?page=6&Policy=fresh&Signature=fresh&Key-Pair-Id=fresh', 20),
            ],
        },
    };
}

function seedReaderState(records: Record<string, MirrorRecord>): void {
    const state: MirrorGlobalState = { seq: 30, nextId: 20, installed: true, epoch: 7, records };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__yomuCanvasMirror = state;
}

function readerCanvas(id: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.setAttribute(ID_ATTR, id);
    return canvas;
}

function recorderSummary(records: Record<string, MirrorRecord>, id: string): { token: string; version: number } {
    const pageDocument = document.implementation.createHTMLDocument('mirror-contract');
    class CanvasContext { canvas: unknown = null; drawImage(): void { /* recorder hook */ } clearRect(): void { /* recorder hook */ } }
    const state: MirrorGlobalState = { seq: 30, nextId: 20, installed: false, epoch: 7, records };
    const pageWindow = {
        document: pageDocument,
        location: { href: 'https://viewer-trial.bookwalker.jp/03/21/viewer.html?cid=book&cty=1' },
        HTMLCanvasElement: class {},
        CanvasRenderingContext2D: CanvasContext,
        __yomuCanvasMirror: state,
    } as unknown as Parameters<typeof recorderBootstrap>[0];

    recorderBootstrap(pageWindow, {
        a: ID_ATTR,
        m: 6000,
        k: 3000,
        e: 'data-yomu-mirror-epoch',
        d: DUMP_ATTR,
        q: REQUEST_ATTR,
        p: PULL_EVENT,
        r: MARKER_ATTR,
        v: 2,
    });
    const root = pageDocument.documentElement;
    root.setAttribute(REQUEST_ATTR, `summary:${id}`);
    root.dispatchEvent(new CustomEvent(PULL_EVENT));
    const payload = JSON.parse(root.querySelector(`[${DUMP_ATTR}]`)?.textContent ?? '{}') as {
        summaries?: Record<string, string>;
        tv?: number;
    };
    return { token: payload.summaries?.[id] ?? '', version: payload.tv ?? 0 };
}

afterEach(() => {
    document.documentElement.removeAttribute(MARKER_ATTR);
    document.documentElement.removeAttribute(REQUEST_ATTR);
    document.querySelector(`[${DUMP_ATTR}]`)?.remove();
    resetMirrorSummaryBridgeForTests();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).__yomuCanvasMirror;
});

describe('canvas mirror identity contract', () => {
    it('uses one hashed identity for the local fallback and frozen capture records', () => {
        const records = liveRecordShape();
        const capturedToken = mirrorContentTokenForRecords('m10', id => records[id]);
        seedReaderState(records);

        const liveToken = canvasMirrorContentToken(readerCanvas('m10'));

        expect(liveToken).toBe(capturedToken);
        expect(liveToken).toMatch(/^m:[a-z0-9]+$/);
        expect(liveToken).not.toContain('viewer-epubs');
        expect(liveToken).not.toContain('Policy');
    });

    it('keeps page-world summaries byte-identical to the reader token', () => {
        const records = liveRecordShape();
        const readerToken = mirrorContentTokenForRecords('m10', id => records[id]);
        const summary = recorderSummary(records, 'm10');

        expect(summary.version).toBe(2);
        expect(summary.token).toBe(readerToken);
    });

    it('uses the same latest-source fallback in page and reader realms', () => {
        const records: Record<string, MirrorRecord> = {
            source: {
                w: 760,
                h: 1200,
                ops: [imageOp('https://viewer-epubs-trial.bookwalker.jp/book/OPS/images/late.jpg/0.jpeg', 50)],
            },
            visible: {
                w: 1570,
                h: 2233,
                ops: [compositeOp('source', 20)],
            },
        };

        expect(recorderSummary(records, 'visible').token)
            .toBe(mirrorContentTokenForRecords('visible', id => records[id]));
    });

    it('ignores an unversioned summary from a foreign recorder and derives locally', () => {
        const records = liveRecordShape();
        const expected = mirrorContentTokenForRecords('m10', id => records[id]);
        seedReaderState(records);
        const root = document.documentElement;
        root.setAttribute(MARKER_ATTR, '1');
        const responder = (): void => {
            let node = root.querySelector<HTMLElement>(`[${DUMP_ATTR}]`);
            if (!node) {
                node = document.createElement('div');
                node.setAttribute(DUMP_ATTR, '1');
                root.append(node);
            }
            node.textContent = JSON.stringify({ summaries: { m10: 'm:foreign' }, epoch: 7 });
        };
        root.addEventListener(PULL_EVENT, responder);
        try {
            expect(canvasMirrorContentToken(readerCanvas('m10'))).toBe(expected);
            expect(canvasMirrorContentToken(readerCanvas('m10'))).toBe(expected);
        } finally {
            root.removeEventListener(PULL_EVENT, responder);
        }
    });
});
