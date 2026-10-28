// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { parsePdfInfo, parsePdfImagesList, buildPageCensus, summarizePageCensus } from '../../scripts/academy-source-pipeline/pdf-census-parse.mjs';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { collectQuestionSignals, resolveImageDependencyState } from '../../scripts/academy-source-pipeline/classify.mjs';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { parsePdfLayoutXml } from '../../scripts/academy-source-pipeline/pdf-layout-parse.mjs';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { parsePdfVectorSvg, vectorReviewState } from '../../scripts/academy-source-pipeline/pdf-vector-parse.mjs';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { pageRendersMatch } from '../../scripts/academy-source-pipeline/pdf-census.mjs';
import { buildFixture, toEnv } from './helpers/source-pipeline-fixture';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { resolveRoots } from '../../scripts/academy-source-pipeline/paths.mjs';

const PDFINFO_OUTPUT = [
    'Title:          Worksheet',
    'Pages:          3',
    'Encrypted:      no',
    'Page size:      595.276 x 841.89 pts (A4)',
    'Page    1 size:  595.276 x 841.89 pts (A4)',
    'Page    1 rot:   0',
    'Page    2 size:  612 x 792 pts (Letter)',
    'Page    2 rot:   90',
].join('\n');

const PDFIMAGES_OUTPUT = [
    'page   num  type   width height color comp bpc  enc interp  object ID x-ppi y-ppi size ratio',
    '--------------------------------------------------------------------------------------------',
    '   1     0 image     980   720  rgb     3   8  jpeg   no        12  0   144   144  186K 8.9%',
    '   1     1 image     320   240  gray    1   8  image  no        14  0   150   150   12K 16%',
    '   3     2 image    1200   900  rgb     3   8  jpeg   no        19  0   200   200  240K 7.4%',
].join('\n');

describe('pdf census parsing', () => {
    it('parses pdfinfo page counts and rejects unusable output', () => {
        expect(parsePdfInfo(PDFINFO_OUTPUT)).toEqual({
            pageCount: 3,
            encrypted: false,
            pageSize: '595.276 x 841.89 pts (A4)',
            pageDimensions: [
                { page: 1, widthPoints: 595.276, heightPoints: 841.89, rotation: 0 },
                { page: 2, widthPoints: 612, heightPoints: 792, rotation: 90 },
            ],
        });
        expect(() => parsePdfInfo('Producer: x')).toThrow(/page count/);
    });

    it('parses the pdfimages -list raster census', () => {
        const images = parsePdfImagesList(PDFIMAGES_OUTPUT);
        expect(images).toHaveLength(3);
        expect(images[0]).toMatchObject({ page: 1, type: 'image', width: 980, height: 720 });
        expect(images[0]).toMatchObject({ index: 0, components: 3, bitsPerComponent: 8, encoding: 'jpeg' });
        expect(images[2].page).toBe(3);
    });

    it('parses positioned text/media boxes without retaining private text or paths', () => {
        const xml = `<?xml version="1.0"?>
          <pdf2xml><page number="1" width="892" height="1263">
            <text top="75" left="139" width="198" height="15">秘密の本文</text>
            <image top="100" left="184" width="509" height="412" src="/private/source/out-1_1.png"/>
          </page></pdf2xml>`;
        const pages = parsePdfLayoutXml(xml);
        expect(pages).toEqual([{
            page: 1,
            width: 892,
            height: 1263,
            textBoxes: [{ top: 75, left: 139, width: 198, height: 15 }],
            mediaRegions: [{ top: 100, left: 184, width: 509, height: 412, assetName: 'out-1_1.png' }],
        }]);
        expect(JSON.stringify(pages)).not.toContain('秘密');
        expect(JSON.stringify(pages)).not.toContain('/private/');
    });

    it('separates rendered vector primitives from glyph definitions', () => {
        const svg = `<svg><defs><path id="glyph" d="M 0 0 L 1 1"/></defs>
          <use href="#glyph"/><path d="M 0 0 L 10 10 Z"/><rect width="10" height="5"/></svg>`;
        const signal = parsePdfVectorSvg(svg, 2);
        expect(signal).toMatchObject({
            page: 2,
            vectorPrimitiveCount: 2,
            glyphUseCount: 1,
            embeddedImageCount: 0,
        });
        expect(signal.pathDataBytes).toBeGreaterThan(0);
        expect(vectorReviewState(signal)).toBe('vector-content-review-required');
        expect(vectorReviewState({ ...signal, vectorPrimitiveCount: 20 }))
            .toBe('vector-heavy-review-required');
        expect(vectorReviewState(null)).toBe('vector-review-unavailable');
    });

    it('detects question signals in page text', () => {
        const signals = collectQuestionSignals('1. 絵を見て答えてください（　　）\n2. 聞いて書いてください ______\n答え');
        expect(signals.numberedItemCount).toBe(2);
        expect(signals.blankSlotCount).toBeGreaterThanOrEqual(2);
        expect(signals.imageDependencyCueCount).toBeGreaterThanOrEqual(2);
        expect(signals.listeningCueCount).toBe(1);
        expect(signals.answerKeyCueCount).toBe(1);
    });

    it('never lets an image-bearing page become silently text-only', () => {
        const richText = collectQuestionSignals('長い説明テキスト。'.repeat(20));
        expect(resolveImageDependencyState({ imageObjectCount: 2, signals: richText })).toBe('has-images-review-required');
        const imageCue = collectQuestionSignals('絵を見てください');
        expect(resolveImageDependencyState({ imageObjectCount: 3, signals: imageCue })).toBe('image-dependent-review-required');
        expect(resolveImageDependencyState({ imageObjectCount: 0, signals: imageCue })).toBe('image-cue-without-objects-review-required');
        const plain = collectQuestionSignals('テキストだけの説明がここに続きます。文章がたっぷりあるページです。');
        expect(resolveImageDependencyState({ imageObjectCount: 0, signals: plain })).toBe('text-only-candidate');
    });

    it('builds explicit per-page states, including missing text layers', () => {
        const pages = buildPageCensus({
            pageCount: 3,
            pageTexts: ['1. 絵を見て答えて', ''],
            imageObjects: parsePdfImagesList(PDFIMAGES_OUTPUT),
        });
        expect(pages).toHaveLength(3);
        expect(pages[0].textStatus).toBe('extracted');
        expect(pages[0].imageDependencyState).toBe('image-dependent-review-required');
        expect(pages[1].textStatus).toBe('no-text-layer');
        expect(pages[2].textStatus).toBe('no-text-layer');
        expect(pages[2].imageDependencyState).toBe('image-dependent-review-required');

        const summary = summarizePageCensus(pages);
        expect(summary.pageCount).toBe(3);
        expect(summary.pagesWithoutTextLayer).toBe(2);
        expect(summary.imageObjectCount).toBe(3);
        expect(summary.imageDependentPageCount).toBe(2);
    });

    it('reuses page renders only when the sidecar pins page count and DPI', () => {
        const resolved = resolveRoots(toEnv(buildFixture()));
        const documentRoot = path.join(resolved.privateRoot, 'pdf-census', 'a'.repeat(64));
        const pagesRoot = path.join(documentRoot, 'pages');
        mkdirSync(pagesRoot, { recursive: true });
        writeFileSync(path.join(pagesRoot, 'page-1.png'), Buffer.from('render'));
        writeFileSync(path.join(documentRoot, 'page-render.json'), JSON.stringify({
            schema: 'yomu-academy.source-pipeline.page-render/v1',
            renderDpi: 200,
            pageCount: 1,
        }));
        expect(pageRendersMatch(documentRoot, 1, 200)).toBe(true);
        expect(pageRendersMatch(documentRoot, 1, 300)).toBe(false);
        expect(pageRendersMatch(documentRoot, 2, 200)).toBe(false);
    });
});
