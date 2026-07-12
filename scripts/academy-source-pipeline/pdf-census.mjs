import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { EXTRACTION_REVISION, PRIVATE_SCHEMA_VERSIONS, insideRoot } from './paths.mjs';
import { readJsonIfPresent, sha256Hex, writeJsonAtomic, writeFileAtomic } from './io.mjs';
import { parsePdfInfo, parsePdfImagesList, buildPageCensus, summarizePageCensus } from './pdf-census-parse.mjs';
import { parsePdfLayoutXml } from './pdf-layout-parse.mjs';
import { parsePdfVectorSvg, vectorReviewState } from './pdf-vector-parse.mjs';
import { createPayloadStore } from './payload-store.mjs';

const RENDER_DPI = 200;
const PAGE_RENDER_SCHEMA = 'yomu-academy.source-pipeline.page-render/v1';
const MAX_TOOL_BUFFER = 256 * 1024 * 1024;
const PREVIOUS_PDF_CENSUS_SCHEMA = 'yomu-academy.source-pipeline.pdf-census/v2';
const TOOL_TIMEOUT_MS = Object.freeze({
    pdfinfo: 60_000,
    pdftotext: 120_000,
    pdfimages: 60_000,
    pdftohtml: 300_000,
    pdftocairo: 60_000,
    // Full-page PNG rendering is deliberately bounded, but gets more room than
    // metadata probes: a verified two-page source in the corpus takes ~2 min.
    pdftoppm: 300_000,
});

/**
 * Complete, resumable census of every unique PDF payload: exact page count,
 * text status, page question signals, raster object census, full 200-DPI page
 * renders, and an HTML visual review index. Failures are recorded as explicit
 * `failed:<tool>` states, never skipped silently.
 */
export function runPdfCensus(roots, ledger, { log = () => {}, retryFailures = false } = {}) {
    const store = createPayloadStore(roots.privateRoot);
    const censusRoot = insideRoot(roots.privateRoot, 'pdf-census');
    mkdirSync(censusRoot, { recursive: true });
    const pdfPayloads = ledger.uniquePayloads.filter(payload =>
        payload.classifications.some(entry => entry.extension === '.pdf'));

    const results = [];
    for (const payload of pdfPayloads) {
        const documentRoot = insideRoot(censusRoot, payload.sha256);
        const censusPath = insideRoot(documentRoot, 'census.json');
        const cached = readJsonIfPresent(censusPath);
        adoptCachedRenderMetadata(documentRoot, cached);
        if (cached?.schema === PREVIOUS_PDF_CENSUS_SCHEMA
            && cached?.extractionRevision === EXTRACTION_REVISION
            && legacyCensusIsComplete(cached, documentRoot)) {
            log(`vector census ${payload.sha256}`);
            const upgraded = upgradeVectorCensus(store.pathFor(payload.sha256), cached, documentRoot);
            writeJsonAtomic(censusPath, upgraded);
            writeFileAtomic(insideRoot(documentRoot, 'index.html'), renderReviewIndex(upgraded));
            results.push(upgraded);
            continue;
        }
        if (cached?.schema === PRIVATE_SCHEMA_VERSIONS.pdfCensus
            && cached?.extractionRevision === EXTRACTION_REVISION
            && censusIsReusable(cached, documentRoot, retryFailures)) {
            results.push(cached);
            continue;
        }
        log(`pdf census ${payload.sha256}`);
        const census = censusOnePdf(store.pathFor(payload.sha256), payload, documentRoot);
        writeJsonAtomic(censusPath, census);
        results.push(census);
    }
    return { schema: PRIVATE_SCHEMA_VERSIONS.pdfCensus, extractionRevision: EXTRACTION_REVISION, documents: results };
}

function censusOnePdf(pdfPath, payload, documentRoot) {
    const base = {
        schema: PRIVATE_SCHEMA_VERSIONS.pdfCensus,
        extractionRevision: EXTRACTION_REVISION,
        payloadSha256: payload.sha256,
        byteLength: payload.byteLength,
        imageDependencyReview: 'review-required',
    };
    let info;
    try {
        info = parsePdfInfo(runTool('pdfinfo', [pdfPath]));
        const boxed = parsePdfInfo(runTool('pdfinfo', [
            '-box', '-f', '1', '-l', String(info.pageCount), pdfPath,
        ]));
        info = { ...info, pageDimensions: boxed.pageDimensions };
    } catch (error) {
        return { ...base, status: 'failed:pdfinfo', failure: String(error?.message ?? error) };
    }

    let pageTexts;
    let textStatus = 'extracted';
    try {
        const text = runTool('pdftotext', ['-layout', pdfPath, '-']);
        pageTexts = text.split('\f').slice(0, info.pageCount);
    } catch (error) {
        pageTexts = [];
        textStatus = `failed:pdftotext (${String(error?.message ?? error)})`;
    }

    let imageObjects;
    try {
        imageObjects = parsePdfImagesList(runTool('pdfimages', ['-list', pdfPath]));
    } catch (error) {
        return { ...base, status: 'failed:pdfimages', failure: String(error?.message ?? error) };
    }

    const nativeImageExtraction = extractNativeImages(pdfPath, documentRoot);
    const layoutResult = extractLayout(pdfPath, documentRoot);
    const vectorResult = extractVectorSignals(pdfPath, documentRoot, info.pageCount);

    let renderedPageCount;
    try {
        renderedPageCount = renderPages(pdfPath, documentRoot, info.pageCount);
    } catch (error) {
        return { ...base, status: 'failed:pdftoppm', failure: String(error?.message ?? error) };
    }
    if (renderedPageCount !== info.pageCount) {
        return { ...base, status: 'failed:render-count', failure: `rendered ${renderedPageCount} of ${info.pageCount} pages` };
    }

    const pages = buildPageCensus({
        pageCount: info.pageCount,
        pageTexts,
        imageObjects,
        pageDimensions: info.pageDimensions,
        layoutPages: layoutResult.pages,
        vectorSignals: vectorResult.signals,
    });
    const hasExtractionGap = textStatus !== 'extracted'
        || nativeImageExtraction.status !== 'complete'
        || layoutResult.summary.status !== 'complete'
        || vectorResult.summary.status !== 'complete';
    const census = {
        ...base,
        status: hasExtractionGap ? 'census-complete-with-reviewable-extraction-gaps' : 'census-complete',
        textExtraction: textStatus,
        layoutExtraction: layoutResult.summary,
        nativeImageExtraction,
        vectorExtraction: vectorResult.summary,
        pageCount: info.pageCount,
        encrypted: info.encrypted,
        renderDpi: RENDER_DPI,
        renderedPageCount,
        pages,
        summary: summarizePageCensus(pages),
    };
    writeFileAtomic(insideRoot(documentRoot, 'index.html'), renderReviewIndex(census));
    return census;
}

function renderPages(pdfPath, documentRoot, pageCount) {
    const pagesRoot = insideRoot(documentRoot, 'pages');
    if (pageRendersMatch(documentRoot, pageCount, RENDER_DPI)) return pageCount;
    rmSync(pagesRoot, { recursive: true, force: true });
    mkdirSync(pagesRoot, { recursive: true });
    runTool('pdftoppm', ['-r', String(RENDER_DPI), '-png', pdfPath, insideRoot(pagesRoot, 'page')]);
    const renderedPageCount = countRenderedPages(pagesRoot);
    if (renderedPageCount === pageCount) {
        writeJsonAtomic(renderMetadataPath(documentRoot), {
            schema: PAGE_RENDER_SCHEMA,
            renderDpi: RENDER_DPI,
            pageCount,
        });
    }
    return renderedPageCount;
}

function countRenderedPages(pagesRoot) {
    if (!existsSync(pagesRoot)) return 0;
    return readdirSync(pagesRoot).filter(name => /^page-?\d+\.png$/.test(name)).length;
}

function censusIsComplete(census, documentRoot) {
    if (!census.status?.startsWith('census-complete')) return false;
    if (!census.layoutExtraction || !census.nativeImageExtraction || !census.vectorExtraction) return false;
    return pageRendersMatch(documentRoot, census.pageCount, census.renderDpi);
}

function censusIsReusable(census, documentRoot, retryFailures) {
    if (censusIsComplete(census, documentRoot)) {
        if (retryFailures && hasReviewableExtractionGap(census)) return false;
        return true;
    }
    return !retryFailures && census.status?.startsWith('failed:');
}

function hasReviewableExtractionGap(census) {
    return census.status === 'census-complete-with-reviewable-extraction-gaps'
        || census.layoutExtraction?.status?.startsWith('failed:')
        || census.nativeImageExtraction?.status?.startsWith('failed:')
        || census.vectorExtraction?.status !== 'complete';
}

function legacyCensusIsComplete(census, documentRoot) {
    return census.status?.startsWith('census-complete')
        && census.layoutExtraction
        && census.nativeImageExtraction
        && pageRendersMatch(documentRoot, census.pageCount, census.renderDpi);
}

export function pageRendersMatch(documentRoot, pageCount, renderDpi) {
    const metadata = readJsonIfPresent(renderMetadataPath(documentRoot));
    return metadata?.schema === PAGE_RENDER_SCHEMA
        && metadata.renderDpi === renderDpi
        && metadata.pageCount === pageCount
        && countRenderedPages(insideRoot(documentRoot, 'pages')) === pageCount;
}

function adoptCachedRenderMetadata(documentRoot, cached) {
    if (!cached || readJsonIfPresent(renderMetadataPath(documentRoot))) return;
    if (!Number.isFinite(cached.renderDpi) || !Number.isInteger(cached.pageCount)) return;
    if (countRenderedPages(insideRoot(documentRoot, 'pages')) !== cached.pageCount) return;
    writeJsonAtomic(renderMetadataPath(documentRoot), {
        schema: PAGE_RENDER_SCHEMA,
        renderDpi: cached.renderDpi,
        pageCount: cached.pageCount,
    });
}

function renderMetadataPath(documentRoot) {
    return insideRoot(documentRoot, 'page-render.json');
}

function upgradeVectorCensus(pdfPath, cached, documentRoot) {
    const vectorResult = extractVectorSignals(pdfPath, documentRoot, cached.pageCount);
    const byPage = new Map(vectorResult.signals.map(signal => [signal.page, signal]));
    const pages = cached.pages.map(page => {
        const vectorSignal = byPage.get(page.page) ?? null;
        const reviewState = vectorReviewState(vectorSignal);
        const layout = page.layout ? {
            ...page.layout,
            vectorRegions: reviewState === 'no-vector-signal' ? [] : [{
                top: 0,
                left: 0,
                width: page.layout.width,
                height: page.layout.height,
                status: reviewState,
                primitiveCount: vectorSignal?.vectorPrimitiveCount ?? null,
            }],
        } : null;
        return { ...page, layout, vectorSignal, vectorReviewState: reviewState };
    });
    const hasGap = cached.status !== 'census-complete' || vectorResult.summary.status !== 'complete';
    return {
        ...cached,
        schema: PRIVATE_SCHEMA_VERSIONS.pdfCensus,
        status: hasGap ? 'census-complete-with-reviewable-extraction-gaps' : 'census-complete',
        vectorExtraction: vectorResult.summary,
        pages,
        summary: summarizePageCensus(pages),
    };
}

function extractNativeImages(pdfPath, documentRoot) {
    const nativeRoot = insideRoot(documentRoot, 'native-images');
    rmSync(nativeRoot, { recursive: true, force: true });
    mkdirSync(nativeRoot, { recursive: true });
    try {
        runTool('pdfimages', ['-all', pdfPath, insideRoot(nativeRoot, 'object')], { timeoutMs: 300_000 });
        const objects = readdirSync(nativeRoot)
            .filter(name => statSync(path.join(nativeRoot, name)).isFile())
            .sort()
            .map(name => {
                const bytes = readFileSync(path.join(nativeRoot, name));
                return {
                    assetName: name,
                    extension: path.extname(name).toLowerCase() || '(none)',
                    byteLength: bytes.length,
                    sha256: sha256Hex(bytes),
                };
            });
        return { status: 'complete', extractedObjectCount: objects.length, objects };
    } catch (error) {
        return { status: 'failed:pdfimages-extract', extractedObjectCount: 0, objects: [], failure: String(error?.message ?? error) };
    }
}

function extractLayout(pdfPath, documentRoot) {
    const layoutRoot = insideRoot(documentRoot, 'layout');
    const xmlPath = insideRoot(layoutRoot, 'document.xml');
    let lastError;
    // Poppler has occasionally returned zero after emitting image files but
    // before the XML appears. One clean retry makes that anomaly explicit and
    // recoverable without turning this into an unbounded retry loop.
    for (let attempt = 1; attempt <= 2; attempt += 1) {
        rmSync(layoutRoot, { recursive: true, force: true });
        mkdirSync(layoutRoot, { recursive: true });
        try {
            runTool('pdftohtml', [
                '-q', '-xml', '-hidden', '-noframes', '-enc', 'UTF-8', pdfPath, xmlPath,
            ], { timeoutMs: 300_000 });
            if (!existsSync(xmlPath)) throw new Error(`pdftohtml attempt ${attempt} emitted no XML layout`);
            const pages = parsePdfLayoutXml(readFileSync(xmlPath, 'utf8'));
            const assetCount = readdirSync(layoutRoot)
                .filter(name => name !== 'document.xml' && statSync(path.join(layoutRoot, name)).isFile())
                .length;
            return { summary: { status: 'complete', pageCount: pages.length, positionedAssetCount: assetCount }, pages };
        } catch (error) {
            lastError = error;
        }
    }
    return {
        summary: { status: 'failed:pdftohtml', pageCount: 0, positionedAssetCount: 0, failure: String(lastError?.message ?? lastError) },
        pages: [],
    };
}

function extractVectorSignals(pdfPath, documentRoot, pageCount) {
    const probeRoot = insideRoot(documentRoot, 'vector-probe');
    rmSync(probeRoot, { recursive: true, force: true });
    mkdirSync(probeRoot, { recursive: true });
    const signals = [];
    for (let page = 1; page <= pageCount; page += 1) {
        const svgPath = insideRoot(probeRoot, `page-${page}.svg`);
        try {
            runTool('pdftocairo', [
                '-svg', '-f', String(page), '-l', String(page), pdfPath, svgPath,
            ], { timeoutMs: 60_000 });
            if (!existsSync(svgPath)) throw new Error('pdftocairo emitted no SVG page');
            signals.push(parsePdfVectorSvg(readFileSync(svgPath, 'utf8'), page));
        } catch (error) {
            signals.push({
                page,
                status: 'failed:pdftocairo',
                vectorPrimitiveCount: null,
                pathDataBytes: null,
                glyphUseCount: null,
                embeddedImageCount: null,
                failure: String(error?.message ?? error),
            });
        } finally {
            rmSync(svgPath, { force: true });
        }
    }
    rmSync(probeRoot, { recursive: true, force: true });
    const failedPageCount = signals.filter(signal => signal.status !== 'complete').length;
    return {
        summary: {
            status: failedPageCount === 0 ? 'complete' : 'complete-with-page-failures',
            pageCount: signals.length,
            failedPageCount,
            vectorHeavyPageCount: signals.filter(signal => vectorReviewState(signal) === 'vector-heavy-review-required').length,
            vectorContentPageCount: signals.filter(signal => vectorReviewState(signal) === 'vector-content-review-required').length,
        },
        signals,
    };
}

/** Visual review index: every page render plus its machine census row. */
function renderReviewIndex(census) {
    const pageNames = pageFileNames(census);
    const rows = census.pages.map((page, index) => renderReviewFigure(page, pageNames[index] ?? '')).join('\n');
    return `<!doctype html>
<meta charset="utf-8">
<title>PDF census ${census.payloadSha256.slice(0, 12)}</title>
<style>
body{font:14px system-ui;margin:1rem;background:#f5f3ef;color:#191817}
.sheet{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1rem}
figure{margin:0;max-width:540px}.page{position:relative;border:1px solid #777;background:white}.page img{display:block;width:100%;height:auto}
.box{position:absolute;pointer-events:none;box-sizing:border-box}.text{border:1px solid rgba(25,105,210,.34);background:rgba(25,105,210,.04)}
.media{border:2px solid rgba(212,75,35,.8);background:rgba(212,75,35,.08)}.vector{border:2px dashed rgba(39,126,73,.9);inset:2px;background:rgba(39,126,73,.025)}figcaption{padding:.35rem 0;line-height:1.45}
</style>
<h1>PDF census — ${census.payloadSha256}</h1>
<p>Status: ${census.status}; pages: ${census.pageCount}; review: ${census.imageDependencyReview}; native extracts: ${census.nativeImageExtraction.extractedObjectCount}; positioned assets: ${census.layoutExtraction.positionedAssetCount}</p>
<p>Blue boxes are text-layer regions. Orange boxes are positioned media candidates. Green dashed boxes mark pages with vector content. All regions remain review-required.</p>
<div class="sheet">${rows}</div>
`;
}

function renderReviewFigure(page, pageName) {
    const overlay = page.layout ? [
        ...page.layout.textBoxes.map(box => renderBox(box, page.layout, 'text')),
        ...page.layout.mediaRegions.map(box => renderBox(box, page.layout, 'media')),
        ...page.layout.vectorRegions.map(box => renderBox(box, page.layout, 'vector')),
    ].join('') : '';
    return `<figure>
      <div class="page"><img loading="lazy" src="pages/${pageName}" alt="Page ${page.page} render">${overlay}</div>
      <figcaption>Page ${page.page} — text: ${page.textStatus}; OCR: ${page.ocrState}; chars: ${page.signals.characterCount}; numbered: ${page.signals.numberedItemCount}; blanks: ${page.signals.blankSlotCount}; native objects: ${page.imageObjectCount}; positioned regions: ${page.layout?.mediaRegions.length ?? 0}; vector: ${page.vectorReviewState}; media: ${page.imageDependencyState}</figcaption>
    </figure>`;
}

function renderBox(box, layout, className) {
    const percent = (value, dimension) => Math.max(0, Math.min(100, (value / dimension) * 100)).toFixed(4);
    return `<span class="box ${className}" style="left:${percent(box.left, layout.width)}%;top:${percent(box.top, layout.height)}%;width:${percent(box.width, layout.width)}%;height:${percent(box.height, layout.height)}%"></span>`;
}

function pageFileNames(census) {
    const width = String(census.pageCount).length;
    return census.pages.map(page => `page-${String(page.page).padStart(Math.max(width, 1), '0')}.png`);
}

function runTool(command, args, { timeoutMs } = {}) {
    return execFileSync(command, args, {
        encoding: 'utf8',
        maxBuffer: MAX_TOOL_BUFFER,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: timeoutMs ?? TOOL_TIMEOUT_MS[command] ?? 60_000,
        killSignal: 'SIGKILL',
    });
}
