import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function createPerformanceEvidenceJournal(outputRoot, initial = {}) {
    rmSync(outputRoot, { recursive: true, force: true });
    mkdirSync(outputRoot, { recursive: true });
    let state = {
        schemaVersion: 1,
        status: 'running',
        startedAt: new Date().toISOString(),
        lastStep: null,
        ...initial,
    };
    checkpoint();
    return {
        update(patch) {
            state = { ...state, ...patch };
            checkpoint();
        },
        markStep(step) {
            state = { ...state, lastStep: { ...step, at: new Date().toISOString() } };
            checkpoint();
        },
        complete(report) {
            const complete = {
                ...report,
                status: 'complete',
                startedAt: state.startedAt,
                completedAt: new Date().toISOString(),
                lastStep: state.lastStep,
            };
            atomicJson(join(outputRoot, 'profile.json'), complete);
            rmSync(join(outputRoot, 'profile.partial.json'), { force: true });
            state = complete;
            return complete;
        },
        fail(error, extra = {}) {
            try {
                const failure = {
                    ...state,
                    ...extra,
                    status: 'failed',
                    failedAt: new Date().toISOString(),
                    failure: serializeError(error),
                };
                atomicJson(join(outputRoot, 'profile.partial.json'), failure);
                atomicJson(join(outputRoot, 'failure.json'), failure);
                state = failure;
                return failure;
            } catch {
                return null;
            }
        },
    };

    function checkpoint() {
        atomicJson(join(outputRoot, 'profile.partial.json'), state);
    }
}

export function serializeError(error) {
    if (!(error instanceof Error))
        return {
            name: 'NonError',
            message: String(error),
            stack: null,
            cause: null,
        };
    return {
        name: error.name,
        message: error.message,
        stack: error.stack ?? null,
        cause: error.cause ? serializeError(error.cause) : null,
    };
}

export async function capturePerformancePageFailure(page, outputRoot, stem, diagnostics = {}) {
    const screenshotPath = join(outputRoot, `${stem}.png`);
    const htmlPath = join(outputRoot, `${stem}.html`);
    const captureErrors = [];
    let state = null;
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(error => {
        captureErrors.push({
            operation: 'screenshot',
            error: serializeError(error),
        });
    });
    await page.content().then(
        html => writeFileSync(htmlPath, html),
        error => {
            captureErrors.push({ operation: 'html', error: serializeError(error) });
        },
    );
    await page
        .evaluate(() => ({
            url: location.href,
            title: document.title,
            readyState: document.readyState,
            bodyText: document.body?.innerText?.slice(0, 4000) ?? '',
            readerWords: document.querySelectorAll('.jpdb-reader-word').length,
            portals: document.querySelectorAll('.jpdb-reader-document-annotation-portal').length,
            popovers: [...document.querySelectorAll('.jpdb-word-popup')].map(popover => ({
                hidden: popover.hidden,
                text: popover.textContent?.replace(/\s+/gu, ' ').trim().slice(0, 500) ?? '',
            })),
        }))
        .then(
            value => {
                state = value;
            },
            error => {
                captureErrors.push({
                    operation: 'state',
                    error: serializeError(error),
                });
            },
        );
    return {
        screenshotPath,
        htmlPath,
        state,
        diagnostics,
        captureErrors,
    };
}

function atomicJson(path, value) {
    const temporaryPath = `${path}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(value, null, 2));
    renameSync(temporaryPath, path);
}
