import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { LIBRARY_SCHEMA_VERSIONS } from './paths.mjs';
import { insideRoot } from '../paths.mjs';
import { compareUtf8, readJsonIfPresent, writeJsonAtomic } from '../io.mjs';
import { parsePdfInfo, parsePdfImagesList, buildPageCensus, summarizePageCensus } from '../pdf-census-parse.mjs';
import { parsePdfLayoutXml } from '../pdf-layout-parse.mjs';
import { parsePdfVectorSvg, vectorReviewState } from '../pdf-vector-parse.mjs';

const MAX_TOOL_BUFFER = 512 * 1024 * 1024;
const VECTOR_PROBE_PAGE_CAP = 20;
const TOOL_TIMEOUT_MS = Object.freeze({
    pdfinfo: 60_000, pdftotext: 300_000, pdfimages: 300_000, pdftohtml: 300_000, pdftocairo: 60_000,
});

/**
 * Metadata census for every unique library PDF payload: exact page count,
 * per-page text/question signals, native-image-object census (counts only —
 * no byte extraction), positioned layout regions, and a vector probe.
 *
 * Deliberate scale bounds versus the Moodle census, always recorded
 * explicitly, never silently: no 200-DPI page renders and no native-image
 * byte extraction (textbook-scale PDFs would explode the artifact root), and
 * the per-page vector probe samples the first 20 pages
 * (`vectorProbe.mode: 'sampled'`). Payloads that already have a complete
 * Moodle census are reused by hash via the resolver seam.
 */
export function runLibraryPdfCensus(roots, ledger, resolver, { log = () => {}, retryFailures = false } = {}) {
    const pdfPayloads = ledger.uniquePayloads
        .filter(payload => payload.censusFamily === 'pdf')
        .sort((a, b) => compareUtf8(a.sha256, b.sha256));
    mkdirSync(roots.pdfCensusRoot, { recursive: true });

    const documents = pdfPayloads.map(payload => {
        const moodleCensus = resolver.moodlePdfCensusFor(payload.sha256);
        if (moodleCensus?.status?.startsWith('census-complete')) {
            return summarizeReusedMoodleCensus(payload, moodleCensus);
        }
        const cachePath = insideRoot(roots.pdfCensusRoot, `${payload.sha256}.json`);
        const cached = readJsonIfPresent(cachePath);
        if (cached?.schema === LIBRARY_SCHEMA_VERSIONS.pdfCensus
            && (cached.status === 'census-complete' || (!retryFailures && cached.status?.startsWith('failed:')))) {
            return cached;
        }
        log(`library pdf census ${payload.sha256}`);
        const census = censusOneLibraryPdf(resolver.pathFor(payload), payload, roots);
        writeJsonAtomic(cachePath, census);
        return census;
    });
    const census = {
        schema: LIBRARY_SCHEMA_VERSIONS.pdfCensus,
        documents,
        summary: summarizeDocuments(documents),
    };
    writeJsonAtomic(roots.pdfCensusPath, census);
    return census;
}

function summarizeReusedMoodleCensus(payload, moodle) {
    return {
        schema: LIBRARY_SCHEMA_VERSIONS.pdfCensus,
        payloadSha256: payload.sha256,
        byteLength: payload.byteLength,
        status: 'census-complete',
        censusSource: 'reused-moodle-census',
        pageCount: moodle.pageCount,
        textExtraction: moodle.textExtraction,
        nativeImageObjectCount: moodle.summary?.imageObjectCount ?? null,
        pagesWithoutTextLayer: moodle.summary?.pagesWithoutTextLayer ?? null,
        positionedMediaRegionCount: moodle.summary?.nativeMediaRegionCount ?? null,
        textBoxCount: moodle.summary?.textBoxCount ?? null,
        questionSignalCandidateCount: moodle.summary?.questionSignalCandidateCount ?? null,
        vectorProbe: { mode: 'full', probedPageCount: moodle.pageCount, failedPageCount: moodle.vectorExtraction?.failedPageCount ?? null },
        vectorReviewPageCount: moodle.summary?.vectorReviewPageCount ?? null,
    };
}

function censusOneLibraryPdf(resolved, payload, roots) {
    const base = {
        schema: LIBRARY_SCHEMA_VERSIONS.pdfCensus,
        payloadSha256: payload.sha256,
        byteLength: payload.byteLength,
        censusSource: resolved.source,
    };
    const pdfPath = resolved.absolutePath;
    let info;
    try {
        info = parsePdfInfo(runTool('pdfinfo', [pdfPath]));
    } catch (error) {
        return { ...base, status: 'failed:pdfinfo', failure: String(error?.message ?? error) };
    }

    let pageTexts = [];
    let textStatus = 'extracted';
    try {
        pageTexts = runTool('pdftotext', ['-layout', pdfPath, '-']).split('\f').slice(0, info.pageCount);
    } catch (error) {
        textStatus = `failed:pdftotext (${String(error?.message ?? error)})`;
    }

    let imageObjects = [];
    let imageListStatus = 'complete';
    try {
        imageObjects = parsePdfImagesList(runTool('pdfimages', ['-list', pdfPath]));
    } catch (error) {
        imageListStatus = `failed:pdfimages (${String(error?.message ?? error)})`;
    }

    const layout = extractLayout(pdfPath, roots, payload.sha256);
    const vector = probeVectorSample(pdfPath, roots, payload.sha256, info.pageCount);

    const pages = buildPageCensus({
        pageCount: info.pageCount,
        pageTexts,
        imageObjects,
        pageDimensions: info.pageDimensions ?? [],
        layoutPages: layout.pages,
        vectorSignals: vector.signals,
    });
    const summary = summarizePageCensus(pages);
    return {
        ...base,
        status: 'census-complete',
        pageCount: info.pageCount,
        encrypted: info.encrypted,
        textExtraction: textStatus,
        imageListStatus,
        layoutExtraction: layout.summary,
        vectorProbe: vector.summary,
        nativeImageObjectCount: summary.imageObjectCount,
        pagesWithoutTextLayer: summary.pagesWithoutTextLayer,
        positionedMediaRegionCount: summary.nativeMediaRegionCount,
        textBoxCount: summary.textBoxCount,
        questionSignalCandidateCount: summary.questionSignalCandidateCount,
        vectorReviewPageCount: summary.vectorReviewPageCount,
    };
}

function extractLayout(pdfPath, roots, sha256) {
    const layoutRoot = insideRoot(roots.pdfCensusRoot, `${sha256}.layout-tmp`);
    rmSync(layoutRoot, { recursive: true, force: true });
    mkdirSync(layoutRoot, { recursive: true });
    const xmlPath = insideRoot(layoutRoot, 'document.xml');
    try {
        runTool('pdftohtml', ['-q', '-xml', '-i', '-hidden', '-noframes', '-enc', 'UTF-8', pdfPath, xmlPath]);
        if (!existsSync(xmlPath)) throw new Error('pdftohtml emitted no XML layout');
        const pages = parsePdfLayoutXml(readFileSync(xmlPath, 'utf8'));
        return { summary: { status: 'complete', pageCount: pages.length }, pages };
    } catch (error) {
        return { summary: { status: 'failed:pdftohtml', failure: String(error?.message ?? error) }, pages: [] };
    } finally {
        rmSync(layoutRoot, { recursive: true, force: true });
    }
}

function probeVectorSample(pdfPath, roots, sha256, pageCount) {
    const probedPageCount = Math.min(pageCount, VECTOR_PROBE_PAGE_CAP);
    const probeRoot = insideRoot(roots.pdfCensusRoot, `${sha256}.vector-tmp`);
    rmSync(probeRoot, { recursive: true, force: true });
    mkdirSync(probeRoot, { recursive: true });
    const signals = [];
    try {
        for (let page = 1; page <= probedPageCount; page += 1) {
            const svgPath = insideRoot(probeRoot, `page-${page}.svg`);
            try {
                runTool('pdftocairo', ['-svg', '-f', String(page), '-l', String(page), pdfPath, svgPath]);
                if (!existsSync(svgPath)) throw new Error('pdftocairo emitted no SVG page');
                signals.push(parsePdfVectorSvg(readFileSync(svgPath, 'utf8'), page));
            } catch (error) {
                signals.push({
                    page, status: 'failed:pdftocairo', vectorPrimitiveCount: null, pathDataBytes: null,
                    glyphUseCount: null, embeddedImageCount: null, failure: String(error?.message ?? error),
                });
            } finally {
                rmSync(svgPath, { force: true });
            }
        }
    } finally {
        rmSync(probeRoot, { recursive: true, force: true });
    }
    return {
        summary: {
            mode: probedPageCount < pageCount ? 'sampled' : 'full',
            probedPageCount,
            pageCount,
            failedPageCount: signals.filter(signal => signal.status !== 'complete').length,
            vectorHeavyPageCount: signals.filter(signal => vectorReviewState(signal) === 'vector-heavy-review-required').length,
        },
        signals,
    };
}

function summarizeDocuments(documents) {
    const complete = documents.filter(document => document.status === 'census-complete');
    return {
        documentCount: documents.length,
        complete: complete.length,
        reusedMoodleCensus: documents.filter(document => document.censusSource === 'reused-moodle-census').length,
        failed: documents.filter(document => document.status?.startsWith('failed:')).length,
        pageCount: sum(complete, 'pageCount'),
        pagesWithoutTextLayer: sum(complete, 'pagesWithoutTextLayer'),
        nativeImageObjectCount: sum(complete, 'nativeImageObjectCount'),
        positionedMediaRegionCount: sum(complete, 'positionedMediaRegionCount'),
        textBoxCount: sum(complete, 'textBoxCount'),
        questionSignalCandidateCount: sum(complete, 'questionSignalCandidateCount'),
        vectorReviewPageCount: sum(complete, 'vectorReviewPageCount'),
    };
}

function sum(rows, key) {
    return rows.reduce((total, row) => total + (Number.isFinite(row[key]) ? row[key] : 0), 0);
}

function runTool(command, args) {
    return execFileSync(command, args, {
        encoding: 'utf8',
        maxBuffer: MAX_TOOL_BUFFER,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: TOOL_TIMEOUT_MS[command] ?? 60_000,
        killSignal: 'SIGKILL',
    });
}
