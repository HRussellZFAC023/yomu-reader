import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync('scripts/manual/firefox-settings-authority-smoke.mjs', 'utf8');
const SOURCE_FILE = ts.createSourceFile(
    'firefox-settings-authority-smoke.mjs',
    SOURCE,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.JS,
);

function sourceSection(start: string, end: string): string {
    const startIndex = SOURCE.indexOf(start);
    const endIndex = SOURCE.indexOf(end, startIndex + start.length);
    expect(startIndex, `missing section start: ${start}`).toBeGreaterThanOrEqual(0);
    expect(endIndex, `missing section end: ${end}`).toBeGreaterThan(startIndex);
    return SOURCE.slice(startIndex, endIndex);
}

function functionDeclaration(name: string): ts.FunctionDeclaration {
    const declaration = SOURCE_FILE.statements.find((statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) && statement.name?.text === name,
    );
    expect(declaration, `missing function: ${name}`).toBeDefined();
    return declaration!;
}

function runtimeFunction<T extends (...args: never[]) => unknown>(name: string): T {
    const declaration = functionDeclaration(name);
    const source = SOURCE.slice(declaration.getStart(SOURCE_FILE), declaration.getEnd());
    return Function(`"use strict"; return (${source});`)() as T;
}

function runtimeFunctions<T extends Record<string, (...args: never[]) => unknown>>(names: string[]): T {
    return runtimeFunctionsWithBindings<T>(names, {});
}

function runtimeFunctionsWithBindings<T extends Record<string, (...args: never[]) => unknown>>(
    names: string[],
    bindings: Record<string, unknown>,
): T {
    const declarations = names.map(name => {
        const declaration = functionDeclaration(name);
        return SOURCE.slice(declaration.getStart(SOURCE_FILE), declaration.getEnd());
    }).join('\n');
    const bindingNames = Object.keys(bindings);
    return Function(
        ...bindingNames,
        `"use strict"; ${declarations}; return { ${names.join(', ')} };`,
    )(...Object.values(bindings)) as T;
}

const TOP_LEVEL_FUNCTIONS = new Set(SOURCE_FILE.statements
    .filter(ts.isFunctionDeclaration)
    .map(statement => statement.name!.text));

/** Top-level functions a declaration reaches by name, ignoring property names that merely share one. */
function reachedTopLevelFunctions(name: string): string[] {
    const reached: string[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && TOP_LEVEL_FUNCTIONS.has(node.text) && !propertyNameIdentifier(node)) {
            reached.push(node.text);
        }
        ts.forEachChild(node, visit);
    };
    visit(functionDeclaration(name).body!);
    return reached;
}

function propertyNameIdentifier(node: ts.Identifier): boolean {
    const parent = node.parent;
    return (ts.isPropertyAccessExpression(parent) && parent.name === node)
        || (ts.isPropertyAssignment(parent) && parent.name === node);
}

/** The helper names an injected script declares, expanding spread helper lists. */
function injectedHelperNames(helpers: ts.Expression): string[] {
    if (ts.isCallExpression(helpers)) {
        const declaration = functionDeclaration(expressionPath(helpers.expression));
        const returned = declaration.body!.statements.find(ts.isReturnStatement)!.expression!;
        return injectedHelperNames(returned);
    }
    expect(ts.isArrayLiteralExpression(helpers)).toBe(true);
    return (helpers as ts.ArrayLiteralExpression).elements.flatMap(element => {
        if (ts.isSpreadElement(element)) return injectedHelperNames(element.expression);
        return [(element as ts.Identifier).text];
    });
}

const CORPUS_DIRECTORY = 'tests/reader/fixtures/upgrade-v1.9.3';
const UPGRADE_CORPUS = {
    extension: JSON.parse(readFileSync(`${CORPUS_DIRECTORY}/d-extension-study-and-content-script.json`, 'utf8')),
    unmarked: JSON.parse(readFileSync(`${CORPUS_DIRECTORY}/b-userscript-machine-only-unmarked.json`, 'utf8')),
    seqZeroLedger: JSON.parse(readFileSync(`${CORPUS_DIRECTORY}/c1-userscript-folded-pins-explicit.json`, 'utf8')),
};
const CORPUS_SETTINGS_KEY = 'jpdb-popup-reader-settings';
const CORPUS_INTENT_KEY = 'yomu:settings-intent:v2';
const COMMIT_FIELD = '__yomuSettingsPersistenceCommitV1';

function upgradeSeedFunctions() {
    return runtimeFunctionsWithBindings<{
        upgradeScenarioSeeds: (
            prefix: string,
            corpus: typeof UPGRADE_CORPUS,
        ) => Record<string, Record<string, unknown>>;
    }>([
        'authorityRecord',
        'authorityCommitWitness',
        'withoutAuthorityCommit',
        'committedAuthorityPayloadPair',
        'rekeyedExtensionStorage',
        'unmarkedUpgradeSeed',
        'seqZeroLedgerUpgradeSeed',
        'upgradeScenarioSeeds',
    ], { SETTINGS_KEY: CORPUS_SETTINGS_KEY, INTENT_KEY: CORPUS_INTENT_KEY });
}

function runtimeFunctionWithBindings<T extends (...args: never[]) => unknown>(
    name: string,
    bindings: Record<string, unknown>,
): T {
    const declaration = functionDeclaration(name);
    const source = SOURCE.slice(declaration.getStart(SOURCE_FILE), declaration.getEnd());
    const bindingNames = Object.keys(bindings);
    return Function(...bindingNames, `"use strict"; return (${source});`)(...Object.values(bindings)) as T;
}

function calledFunctions(name: string): string[] {
    const calls: string[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) calls.push(expressionPath(node.expression));
        ts.forEachChild(node, visit);
    };
    visit(functionDeclaration(name));
    return calls;
}

function referencedIdentifiers(name: string): string[] {
    const identifiers: string[] = [];
    const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node)) identifiers.push(node.text);
        ts.forEachChild(node, visit);
    };
    visit(functionDeclaration(name));
    return identifiers;
}

function expressionPath(expression: ts.LeftHandSideExpression): string {
    if (ts.isIdentifier(expression)) return expression.text;
    if (ts.isPropertyAccessExpression(expression)) {
        return `${expressionPath(expression.expression)}.${expression.name.text}`;
    }
    return expression.getText(SOURCE_FILE);
}

function allTrueExcept(fields: string[], omitted?: string): Record<string, boolean> {
    return Object.fromEntries(fields.map(field => [field, field !== omitted]));
}

describe('Firefox settings-authority browser proof contract', () => {
    it('seeds current canonical pairs without promoting the raw-only fixture', () => {
        const seeds = runtimeFunctionWithBindings<(
            prefix: string,
            corpus: typeof UPGRADE_CORPUS,
        ) => Record<string, Record<string, Record<string, unknown>>>>('scenarioSeeds', {
            safeSettings: runtimeFunction('safeSettings'), safeIntent: runtimeFunction('safeIntent'),
            SETTINGS_KEY: 'SETTINGS', INTENT_KEY: 'INTENT', PRIVATE_KEY: 'PRIVATE', PRIVATE_VALUE: 'fixture',
            UNRELATED_KEY: 'UNRELATED', UNRELATED_VALUE: 'keep',
            upgradeScenarioSeeds: upgradeSeedFunctions().upgradeScenarioSeeds,
        })('prefix_', UPGRADE_CORPUS);
        expect(Object.keys(seeds)).toEqual([
            'raw-only',
            'prefixed-only',
            'divergent',
            'upgrade-v193-unmarked',
            'upgrade-v193-seq0-ledger',
            'live',
        ]);
        for (const name of ['prefixed-only', 'divergent', 'live']) {
            const settings = seeds[name]!.prefix_SETTINGS!;
            const intent = seeds[name]!.prefix_INTENT!;
            expect(settings.__yomuSettingsPersistenceCommitV1).toEqual(expect.any(String));
            expect(settings.__yomuSettingsPersistenceCommitV1).toBe(intent.__yomuSettingsPersistenceCommitV1);
        }
        expect(seeds['raw-only']).not.toHaveProperty('prefix_SETTINGS');
        expect(seeds['raw-only']).not.toHaveProperty('prefix_INTENT');
    });

    it('requires an actually visible initial setup surface', () => {
        let present = true;
        let rects = 1;
        let visibility = 'visible';
        const visible = runtimeFunctionWithBindings<() => boolean>('initialSetupVisible', {
            document: { querySelector: () => present ? { getClientRects: () => ({ length: rects }) } : null },
            getComputedStyle: () => ({ visibility }),
        });
        expect(visible()).toBe(true);
        visibility = 'hidden'; expect(visible()).toBe(false);
        visibility = 'visible'; rects = 0; expect(visible()).toBe(false);
        rects = 1; present = false; expect(visible()).toBe(false);
    });

    it('refuses stale bytes and runs the packaged extension through Mozilla tooling', () => {
        expect(SOURCE).toContain("const DEFAULT_EXPECTED_VERSION = '1.9.3'");
        expect(SOURCE).toContain('Refusing stale Firefox bytes');
        expect(SOURCE).toContain("const WEB_EXT_VERSION = '10.5.0'");
        expect(SOURCE).not.toContain("'--pre-install'");
        expect(SOURCE).toContain("'--no-reload'");
        expect(SOURCE).toContain('Firefox Developer Edition.app');
        expect(SOURCE).not.toContain("product: 'Firefox Developer Edition'");
        expect(SOURCE).not.toContain("from 'playwright'");

        const product = runtimeFunction<(binary: string) => string>('firefoxProductFromBinary');
        expect(product('/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox'))
            .toBe('Firefox Developer Edition');
        expect(product('/Applications/Firefox.app/Contents/MacOS/firefox')).toBe('Firefox');
        expect(product('/opt/firefox/firefox')).toBe('Firefox');
        expect(SOURCE).toContain('product: firefoxProduct');
        expect(SOURCE).toContain('Starting ${firefoxProduct} with a disposable profile: ${firefoxBinary}');

        expect(SOURCE).toContain("path.join(extensionDirectory, 'newtab', 'study-storage-runtime.js')");
        expect(SOURCE).toContain("storageRuntimeUrl: './newtab/study-storage-runtime.js'");
        const nestedStudyHtml = [
            '<script src="./study-storage-runtime.js"></script>',
            '<script type="module" src="./app.js?v=abcdef1234"></script>',
        ].join('\n');
        const rootRelativeStudyHtml = nestedStudyHtml.replace('./study-storage-runtime.js', '../study-storage-runtime.js');
        const assertOrder = runtimeFunction<(index: string) => void>('assertStudyStorageOrder');
        const scriptPair = runtimeFunction<() => RegExp>('packagedStudyScriptPair')();
        expect(() => assertOrder(nestedStudyHtml)).not.toThrow();
        expect(() => assertOrder(rootRelativeStudyHtml)).toThrow();
        expect(scriptPair.test(nestedStudyHtml)).toBe(true);
        expect(scriptPair.test(rootRelativeStudyHtml)).toBe(false);
        expect(calledFunctions('instrumentDisposablePackage')).toContain('packagedStudyScriptPair');
    });

    it('covers all namespace, live propagation, import, failure, and reset phases', () => {
        for (const required of [
            'authority-raw-only',
            'authority-prefixed-only',
            'authority-divergent',
            'authority-upgrade-v193-unmarked',
            'reader-upgrade-v193-unmarked',
            'authority-upgrade-v193-seq0-ledger',
            'reader-upgrade-v193-seq0-ledger',
            'study-write-issued',
            'reader-observed-study-write',
            'reader-write-issued',
            'reader-final-state',
            'study-observed-reader-write',
            'study-final-state',
            'study-ui-to-reader',
            'reader-launcher-to-study',
            'settings-launcher-visible',
            'settings-launcher-activate',
            'settings-save-durable-close',
            'requested-settings-panel-open',
            'import-lock',
            'import-result',
            'import-complete',
            '[data-import-status]',
            'backup-save',
            'backup-reload',
            'storage-failure-preparing',
            'fault-ready',
            'fault-armed',
            'fault-result',
            'failureToastObserved',
            'factory-reset-result',
        ]) expect(SOURCE).toContain(required);
    });

    it('observes effective import locking without changing the child disabled state', () => {
        const disabled = runtimeFunction<(button: HTMLButtonElement | null) => boolean>('buttonDisabled');
        document.body.innerHTML = [
            '<form>',
            '  <fieldset disabled>',
            '    <button type="button">Import settings JSON</button>',
            '  </fieldset>',
            '</form>',
        ].join('');
        const button = document.querySelector<HTMLButtonElement>('button');
        expect(button?.disabled).toBe(false);
        expect(disabled(button)).toBe(true);
        expect(disabled(null)).toBe(false);
    });

    it('cannot silently replace trusted Firefox UI acceptance with synthetic clicks', () => {
        expect(SOURCE).toContain('do not substitute console calls or synthetic DOM clicks');
        expect(SOURCE).toContain('native file chooser');
        expect(SOURCE).toContain('Use Firefox UI;');
        expect(SOURCE).toContain('writer tasks may still be settling');
        expect(SOURCE).not.toContain('.click()');
        expect(SOURCE).not.toContain("dispatchEvent(new MouseEvent");
        expect(SOURCE).not.toContain('settings-form-submit');
        expect(SOURCE).toContain('settings-save-activate');
        expect(SOURCE).toContain('exactSave: optionalBoolean(value.exactSave)');
        expect(SOURCE).toContain('attemptId: optionalAttemptId(value.attemptId)');
        expect(SOURCE).toContain('studyInstanceId: optionalStudyInstanceId(value.studyInstanceId)');
        const identifiers = runtimeFunctions<{
            optionalAttemptId: (value: unknown) => string | undefined;
            optionalStudyInstanceId: (value: unknown) => string | undefined;
            optionalUuid: (value: unknown, label: string) => string | undefined;
        }>(['optionalAttemptId', 'optionalStudyInstanceId', 'optionalUuid']);
        const attemptId = identifiers.optionalAttemptId;
        expect(attemptId(undefined)).toBeUndefined();
        expect(attemptId('11111111-1111-4111-8111-111111111111'))
            .toBe('11111111-1111-4111-8111-111111111111');
        expect(() => attemptId('same-for-every-save')).toThrow('Probe save-attempt ID is invalid.');
        const studyInstanceId = identifiers.optionalStudyInstanceId;
        expect(studyInstanceId('33333333-3333-4333-8333-333333333333'))
            .toBe('33333333-3333-4333-8333-333333333333');
        expect(() => studyInstanceId('shared-tab')).toThrow('Probe Study instance ID is invalid.');
        const phaseReferences = referencedIdentifiers('evaluateReaderLauncherToStudy');
        expect(phaseReferences).toEqual(expect.arrayContaining([
            'trustedReaderLauncherActivation',
            'successfulStudyAppearancePanel',
            'trustedStudySaveCompleted',
            'readerLight39Event',
            'readerLauncherToStudyComplete',
        ]));
        expect(SOURCE).toContain("status: acceptancePassed ? 'passed' : 'automated-only-diagnostic'");
    });

    it('requires the no-input launcher, requested packaged panel, trusted Study save, and reader repaint together', () => {
        const complete = runtimeFunction<(proof: Record<string, boolean>) => boolean>(
            'readerLauncherToStudyComplete',
        );
        const fields = [
            'launcherVisible',
            'launcherActivated',
            'requestedPanelOpen',
            'trustedStudySaveCompleted',
            'readerApplied',
        ];
        expect(complete(allTrueExcept(fields))).toBe(true);
        for (const field of fields) expect(complete(allTrueExcept(fields, field))).toBe(false);

        const launcherProof = runtimeFunction<(proof: Record<string, boolean>) => boolean>('launcherSurfaceProof');
        expect(launcherProof({
            launcherVisible: true,
            formOpen: false,
            writableInputsPresent: false,
            launcherActionPresent: true,
        })).toBe(true);
        expect(launcherProof({
            launcherVisible: true,
            formOpen: true,
            writableInputsPresent: false,
            launcherActionPresent: true,
        })).toBe(false);
        expect(launcherProof({
            launcherVisible: true,
            formOpen: false,
            writableInputsPresent: true,
            launcherActionPresent: true,
        })).toBe(false);

        const panelProof = runtimeFunction<(proof: Record<string, boolean | string>) => boolean>(
            'requestedStudyPanelProof',
        );
        expect(panelProof({ launcherAuthorized: true, panel: 'appearance', formOpen: true, panelVisible: true }))
            .toBe(true);
        expect(panelProof({ launcherAuthorized: false, panel: 'appearance', formOpen: true, panelVisible: true }))
            .toBe(false);
        expect(panelProof({ launcherAuthorized: true, panel: 'backup', formOpen: true, panelVisible: true }))
            .toBe(false);

        const trustedActivation = runtimeFunction<(event: Record<string, unknown>) => boolean>(
            'trustedReaderLauncherActivation',
        );
        expect(trustedActivation({ surface: 'reader', ok: true, trusted: true })).toBe(true);
        expect(trustedActivation({ surface: 'reader', ok: true, trusted: false })).toBe(false);
        expect(trustedActivation({ surface: 'study', ok: true, trusted: true })).toBe(false);

        const trustedSave = runtimeFunction<(event: Record<string, unknown>) => boolean>(
            'trustedStudySaveActivation',
        );
        const attemptId = '11111111-1111-4111-8111-111111111111';
        const studyInstanceId = '33333333-3333-4333-8333-333333333333';
        const saveActivation = { type: 'settings-save-activate', surface: 'study', attemptId, studyInstanceId };
        expect(trustedSave({ ...saveActivation, trusted: true, exactSave: true }))
            .toBe(true);
        expect(trustedSave({ ...saveActivation, trusted: true, exactSave: false }))
            .toBe(false);
        expect(trustedSave({ ...saveActivation, trusted: false, exactSave: true }))
            .toBe(false);
        expect(trustedSave({ ...saveActivation, trusted: true, exactSave: true, studyInstanceId: undefined }))
            .toBe(false);
        expect(trustedSave({ ...saveActivation, trusted: true, exactSave: true, attemptId: undefined })).toBe(false);
        expect(trustedSave({ ...saveActivation, type: 'settings-form-state', trusted: true, exactSave: true }))
            .toBe(false);
        expect(calledFunctions('installStudyFormObserver')).toContain('document.addEventListener');
        expect(referencedIdentifiers('installStudyFormObserver')).toContain('reportSettingsSaveActivation');
        expect(calledFunctions('reportSettingsSaveActivation')).toEqual(expect.arrayContaining([
            'eventSubmitButton',
            'isExactSettingsSaveButton',
            'context.post',
        ]));
        expect(referencedIdentifiers('reportSettingsSaveActivation')).toEqual(expect.arrayContaining([
            'tracker',
            'pendingSaveAttempt',
            'priorSuccessToasts',
            'activeSaveAttemptId',
            'activeSaveActivation',
            'randomUUID',
        ]));
        const closeCalls = calledFunctions('reportFormClosed');
        expect(closeCalls).toEqual(expect.arrayContaining([
            'noteTrackedFormClose',
            'pendingClosedSaveAttempt',
            'completePendingFormClose',
            'context.post',
        ]));
        const completionCalls = calledFunctions('completePendingFormClose');
        expect(completionCalls).toEqual(expect.arrayContaining([
            'waitForNewSettingsSaveSuccess',
            'durableSaveClose',
            'takePendingFormClose',
        ]));
        const successWait = completionCalls.indexOf('waitForNewSettingsSaveSuccess');
        const successfulConsume = completionCalls.lastIndexOf('takePendingFormClose');
        const completion = closeCalls.indexOf('completePendingFormClose');
        const durableReport = closeCalls.lastIndexOf('context.post');
        expect(successWait).toBeGreaterThanOrEqual(0);
        expect(successfulConsume).toBeGreaterThan(successWait);
        expect(durableReport).toBeGreaterThan(completion);
        expect(SOURCE).toContain("type: 'settings-save-durable-close'");
        expect(SOURCE).toContain('attemptId: pending.attemptId');
        expect(SOURCE).toContain('successToastVisible: true');
    });

    it('accepts only a newly created visible success toast before consuming that Save attempt', () => {
        const { settingsSaveSuccessToasts, newSettingsSaveSuccessVisible } = runtimeFunctions<{
            settingsSaveSuccessToasts: () => Element[];
            newSettingsSaveSuccessVisible: (priorToasts: Element[]) => boolean;
        }>(['settingsSaveSuccessToasts', 'newSettingsSaveSuccessVisible']);
        document.body.innerHTML = '<div class="jpdb-reader-toast is-visible">Settings saved.</div>';
        const priorToasts = settingsSaveSuccessToasts();
        expect(priorToasts).toHaveLength(1);
        expect(newSettingsSaveSuccessVisible(priorToasts)).toBe(false);

        const newToast = document.createElement('div');
        newToast.className = 'jpdb-reader-toast';
        newToast.textContent = 'Settings saved.';
        document.body.append(newToast);
        expect(newSettingsSaveSuccessVisible(priorToasts)).toBe(false);
        newToast.classList.add('is-visible');
        expect(newSettingsSaveSuccessVisible(priorToasts)).toBe(true);

        const takePending = runtimeFunction<(
            tracker: Record<string, unknown>,
            pending: Record<string, unknown>,
        ) => boolean>('takePendingFormClose');
        const pending = { attemptId: '11111111-1111-4111-8111-111111111111' };
        const tracker = {
            pendingSaveAttempt: pending,
            pendingFormCloseAttemptId: pending.attemptId,
            pendingFormCloseReported: true,
        };
        expect(takePending(tracker, { attemptId: pending.attemptId })).toBe(false);
        expect(tracker.pendingSaveAttempt).toBe(pending);
        expect(takePending(tracker, pending)).toBe(true);
        expect(tracker.pendingSaveAttempt).toBeNull();
        expect(calledFunctions('waitForNewSettingsSaveSuccess')).toContain('browserWaitFor');
    });

    it('pairs each trusted Save with only its own later durable outcome', () => {
        const {
            trustedStudySaveActivation,
            correlatedTrustedStudySave,
            trustedStudySaveCompleted,
            trustedStudySaveFailed,
        } = runtimeFunctions<{
            trustedStudySaveActivation: (event: Record<string, unknown>) => boolean;
            correlatedTrustedStudySave: (
                events: Array<Record<string, unknown>>,
                outcome: string,
            ) => boolean;
            trustedStudySaveCompleted: (events: Array<Record<string, unknown>>) => boolean;
            trustedStudySaveFailed: (
                events: Array<Record<string, unknown>>,
                studyInstanceId?: string,
            ) => boolean;
        }>([
            'trustedStudySaveActivation',
            'correlatedTrustedStudySave',
            'trustedStudySaveCompleted',
            'trustedStudySaveFailed',
        ]);
        expect(trustedStudySaveActivation).toBeTypeOf('function');
        expect(correlatedTrustedStudySave).toBeTypeOf('function');
        const first = '11111111-1111-4111-8111-111111111111';
        const second = '22222222-2222-4222-8222-222222222222';
        const firstStudy = '33333333-3333-4333-8333-333333333333';
        const secondStudy = '44444444-4444-4444-8444-444444444444';
        const activation = {
            type: 'settings-save-activate',
            surface: 'study',
            trusted: true,
            exactSave: true,
            studyInstanceId: firstStudy,
        };
        expect(trustedStudySaveCompleted([
            { ...activation, attemptId: first },
            {
                type: 'settings-save-durable-close',
                surface: 'study',
                ok: true,
                attemptId: first,
                studyInstanceId: firstStudy,
                successToastVisible: true,
            },
        ])).toBe(true);
        expect(trustedStudySaveCompleted([
            {
                type: 'settings-save-durable-close',
                surface: 'study',
                ok: true,
                attemptId: first,
                studyInstanceId: firstStudy,
                successToastVisible: true,
            },
            { ...activation, attemptId: first },
        ])).toBe(false);
        expect(trustedStudySaveCompleted([
            { ...activation, attemptId: first },
            {
                type: 'settings-save-durable-close',
                surface: 'study',
                ok: true,
                attemptId: second,
                studyInstanceId: firstStudy,
                successToastVisible: true,
            },
        ])).toBe(false);
        expect(trustedStudySaveCompleted([
            { ...activation, attemptId: first },
            {
                type: 'settings-save-durable-close',
                surface: 'study',
                ok: true,
                attemptId: first,
                studyInstanceId: secondStudy,
                successToastVisible: true,
            },
        ])).toBe(false);
        expect(trustedStudySaveCompleted([
            { ...activation, attemptId: first },
            {
                type: 'settings-save-durable-close',
                surface: 'study',
                ok: true,
                attemptId: first,
                studyInstanceId: firstStudy,
                successToastVisible: false,
            },
        ])).toBe(false);
        const failedSaveOutcome = {
            type: 'fault-result',
            surface: 'study',
            ok: true,
            attemptId: first,
            studyInstanceId: firstStudy,
            formOpen: true,
            saveDisabled: false,
            importDisabled: false,
            saveBlocked: '',
            successToastVisible: false,
            successToastObserved: false,
            failureToastVisible: false,
            failureToastObserved: true,
            durableUnchanged: true,
        };
        expect(trustedStudySaveFailed([
            { ...activation, attemptId: first },
            failedSaveOutcome,
        ])).toBe(true);
        expect(trustedStudySaveFailed([
            { ...activation, attemptId: first },
            failedSaveOutcome,
        ], secondStudy)).toBe(false);
        for (const field of [
            'formOpen',
            'failureToastObserved',
            'durableUnchanged',
        ]) {
            expect(trustedStudySaveFailed([
                { ...activation, attemptId: first },
                { ...failedSaveOutcome, [field]: false },
            ])).toBe(false);
        }
        for (const field of [
            'saveDisabled',
            'importDisabled',
            'successToastVisible',
            'successToastObserved',
        ]) {
            expect(trustedStudySaveFailed([
                { ...activation, attemptId: first },
                { ...failedSaveOutcome, [field]: true },
            ])).toBe(false);
        }
        expect(trustedStudySaveFailed([
            { ...activation, attemptId: first },
            { ...failedSaveOutcome, saveBlocked: 'settings-save' },
        ])).toBe(false);
        const durableClose = runtimeFunction<(
            context: Record<string, unknown>,
            pending: Record<string, unknown>,
            successVisible: boolean,
        ) => boolean>('durableSaveClose');
        expect(durableClose({ failedSaveAttemptId: '' }, { attemptId: first }, true)).toBe(true);
        expect(durableClose({ failedSaveAttemptId: first }, { attemptId: first }, true)).toBe(false);
        expect(durableClose({ failedSaveAttemptId: '' }, { attemptId: '' }, true)).toBe(false);
        expect(durableClose({ failedSaveAttemptId: '' }, { attemptId: first }, false)).toBe(false);
    });

    it('wires ordinary content to launcher observation and correlates its trusted handoff with the new Study tab', () => {
        expect(calledFunctions('contentProbe')).toContain('installContentLauncherObserver');
        expect(calledFunctions('contentProbe')).not.toContain('installContentFormObserver');
        expect(calledFunctions('inspectContentSettingsLauncher')).toEqual(expect.arrayContaining([
            'contentSettingsLauncher',
            'contentSettingsLauncherState',
            'launcherSurfaceProof',
            'context.post',
        ]));
        expect(calledFunctions('reportContentLauncherActivation')).toEqual(expect.arrayContaining([
            'contentLauncherFromEvent',
            'launcherSurfaceProof',
            'authorizeContentLauncher',
            'context.post',
        ]));
        expect(calledFunctions('authorizeContentLauncher')).toContain('browser.storage.local.set');
        expect(calledFunctions('observeRequestedStudyPanel')).toEqual(expect.arrayContaining([
            'requestedStudyPanelRequest',
            'requestedStudyPanelState',
            'requestedStudyPanelAccepted',
            'browser.storage.local.remove',
            'context.post',
        ]));
        expect(calledFunctions('requestedStudyPanelAccepted')).toContain('requestedStudyPanelProof');
        expect(calledFunctions('browserBootstrap')).toEqual(expect.arrayContaining([
            'seedDisposableStorage',
            'rememberRequestedSettingsPanel',
        ]));
    });

    it('keeps scenario and one-shot automation state shared across launcher-opened Study tabs', () => {
        expect(calledFunctions('seedDisposableStorage')).toEqual(expect.arrayContaining([
            'activeDisposableScenario',
            'disposableScenarioSeeded',
            'replaceDisposableScenario',
        ]));
        expect(calledFunctions('advanceAuthorityScenario')).toContain('browser.storage.local.set');
        expect(calledFunctions('openReaderArticleOnce')).toEqual(expect.arrayContaining([
            'claimDisposableFlag',
            'browser.tabs.create',
        ]));
        expect(calledFunctions('issueStudyLiveWriteOnce')).toEqual(expect.arrayContaining([
            'disposableFlagSet',
            'claimDisposableFlag',
            'performStudyLiveWrite',
        ]));
        expect(calledFunctions('performStudyLiveWrite')).toEqual(expect.arrayContaining([
            'writeStudyLiveSettings',
            'waitForExpectedCanonicalAuthoritySurface',
            'context.post',
        ]));
        expect(calledFunctions('openReaderArticleOnce')).not.toContain('sessionStorage.getItem');
        expect(calledFunctions('issueStudyLiveWriteOnce')).not.toContain('sessionStorage.getItem');
    });

    it('prepares and accepts the storage fault only for the reloaded target among two live Study tabs', () => {
        const targetStudy = '33333333-3333-4333-8333-333333333333';
        const olderStudy = '44444444-4444-4444-8444-444444444444';
        const targetContext = { studyInstanceId: targetStudy };
        const olderContext = { studyInstanceId: olderStudy };
        const preparing = {
            phase: 'storage-failure-preparing',
            storageFailureStudyInstanceId: targetStudy,
        };
        const shouldPrepare = runtimeFunction<(
            context: Record<string, unknown>,
            state: Record<string, unknown>,
            posted: Record<string, boolean>,
        ) => boolean>('shouldPrepareStorageFault');
        expect(shouldPrepare(targetContext, preparing, { faultReady: false })).toBe(true);
        expect(shouldPrepare(olderContext, preparing, { faultReady: false })).toBe(false);
        expect(shouldPrepare(targetContext, preparing, { faultReady: true })).toBe(false);
        expect(shouldPrepare(targetContext, { ...preparing, phase: 'storage-failure' }, { faultReady: false }))
            .toBe(false);

        const { successfulStudyEvent, successfulStudyInstanceEvent } = runtimeFunctions<{
            successfulStudyEvent: (event: Record<string, unknown>) => boolean;
            successfulStudyInstanceEvent: (event: Record<string, unknown>, studyInstanceId: string) => boolean;
        }>(['successfulStudyEvent', 'successfulStudyInstanceEvent']);
        const olderArmed = { surface: 'study', ok: true, studyInstanceId: olderStudy };
        const targetArmed = { surface: 'study', ok: true, studyInstanceId: targetStudy };
        expect(successfulStudyEvent(targetArmed)).toBe(true);
        expect(successfulStudyInstanceEvent(olderArmed, targetStudy)).toBe(false);
        expect(successfulStudyInstanceEvent(targetArmed, targetStudy)).toBe(true);

        expect(referencedIdentifiers('serveProbeState')).toContain('storageFailureStudyInstanceId');
        expect(referencedIdentifiers('evaluateBackupReload')).toEqual(expect.arrayContaining([
            'studyInstanceId',
            'storageFailureStudyInstanceId',
            'studyInstanceLiveness',
        ]));
        expect(calledFunctions('evaluateBackupReload')).toContain('studyInstanceLiveness.clear');
        expect(calledFunctions('evaluateStorageFailurePreparation')).toContain('successfulStudyInstanceEvent');
        expect(referencedIdentifiers('evaluateStorageFailure')).toContain('storageFailureStudyInstanceId');
        expect(referencedIdentifiers('storageFaultReportReady')).toEqual(expect.arrayContaining([
            'studyInstanceId',
            'storageFailureStudyInstanceId',
        ]));
        expect(referencedIdentifiers('createStudyProbeContext')).toEqual(expect.arrayContaining([
            'randomUUID',
            'studyInstanceId',
        ]));
        expect(calledFunctions('installStudyPhasePolling').filter(call => call === 'pollStudyPhase')).toHaveLength(2);
        expect(calledFunctions('pollStudyPhase')).toContain('maybeReportStudyInstanceLive');
        expect(calledFunctions('maybeReportStudyInstanceLive')).toContain('context.post');
        expect(calledFunctions('receiveEvent')).toContain('recordStudyInstanceLiveness');
        expect(referencedIdentifiers('recordStudyInstanceLiveness')).toContain('studyInstanceLiveness');
        expect(sourceSection(
            'function recordStudyInstanceLiveness',
            'function twoDistinctStudyInstancesLive',
        )).toContain("event.type === 'study-instance-live'");
        expect(calledFunctions('evaluateFactoryReset')).toContain('twoDistinctStudyInstancesLive');

        const { twoDistinctStudyInstancesLive: live } = runtimeFunctions<{
            twoDistinctStudyInstancesLive: (
            lastSeen: Map<string, { firstSeen: number; lastSeen: number; count: number }>,
            targetId: string,
            selectedAt: number,
            now?: number,
            liveWindowMs?: number,
            ) => boolean;
        }>([
            'liveStudyInstanceObservations',
            'overlappingStudyInstanceObserved',
            'twoDistinctStudyInstancesLive',
        ]);
        const selectedAt = 1_000;
        const now = 5_000;
        expect(live(new Map([
            [targetStudy, { firstSeen: 1_500, lastSeen: 4_000, count: 2 }],
            [olderStudy, { firstSeen: 2_500, lastSeen: 4_500, count: 2 }],
        ]), targetStudy, selectedAt, now)).toBe(true);
        expect(live(new Map([[
            targetStudy,
            { firstSeen: 1_500, lastSeen: 4_000, count: 2 },
        ]]), targetStudy, selectedAt, now)).toBe(false);
        expect(live(new Map([
            [targetStudy, { firstSeen: 1_500, lastSeen: 4_000, count: 2 }],
            [olderStudy, { firstSeen: selectedAt - 1, lastSeen: 4_500, count: 2 }],
        ]), targetStudy, selectedAt, now)).toBe(false);
        expect(live(new Map([
            [targetStudy, { firstSeen: 1_500, lastSeen: 4_000, count: 2 }],
            [olderStudy, { firstSeen: 2_500, lastSeen: 4_500, count: 2 }],
        ]), targetStudy, selectedAt, 11_000, 6_000)).toBe(false);
        expect(live(new Map([
            [targetStudy, { firstSeen: 1_500, lastSeen: 2_000, count: 2 }],
            [olderStudy, { firstSeen: 2_500, lastSeen: 4_500, count: 2 }],
        ]), targetStudy, selectedAt, now)).toBe(false);

        const lastSeen = new Map<string, { firstSeen: number; lastSeen: number; count: number }>();
        const successfulStudyLivenessEvent = runtimeFunction<(
            event: Record<string, unknown>,
        ) => boolean>('successfulStudyLivenessEvent');
        const record = runtimeFunctionWithBindings<(
            event: Record<string, unknown>,
            observedAt?: number,
        ) => void>('recordStudyInstanceLiveness', {
            studyInstanceLiveness: lastSeen,
            successfulStudyLivenessEvent,
        });
        record({ type: 'surface-boot', surface: 'study', ok: true, studyInstanceId: olderStudy }, 2_000);
        expect(lastSeen.size).toBe(0);
        record({ type: 'study-instance-live', surface: 'study', ok: true, studyInstanceId: olderStudy }, 2_500);
        expect(lastSeen.get(olderStudy)).toEqual({ firstSeen: 2_500, lastSeen: 2_500, count: 1 });
        record({ type: 'study-instance-live', surface: 'study', ok: true, studyInstanceId: olderStudy }, 4_500);
        expect(lastSeen.get(olderStudy)).toEqual({ firstSeen: 2_500, lastSeen: 4_500, count: 2 });
    });

    it('stabilizes authority before readiness and consumes only the exact trusted Save attempt', async () => {
        const snapshots = ['first', 'first', 'first', 'second', 'second'];
        const snapshot = vi.fn(async () => snapshots.shift() ?? 'second');
        const stableSnapshot = runtimeFunctionWithBindings<(
            context: Record<string, unknown>,
            posted: Record<string, unknown>,
            observedAt: number,
        ) => Promise<string>>('stableStorageFaultSnapshot', {
            studySettingsAuthoritySnapshot: snapshot,
        });
        const posted = { faultSnapshotCandidate: '', faultSnapshotCandidateAt: 0 };
        const context = { config: {} };
        await expect(stableSnapshot(context, posted, 1_000)).resolves.toBe('');
        await expect(stableSnapshot(context, posted, 1_500)).resolves.toBe('');
        await expect(stableSnapshot(context, posted, 1_800)).resolves.toBe('first');
        await expect(stableSnapshot(context, posted, 1_900)).resolves.toBe('');
        await expect(stableSnapshot(context, posted, 2_700)).resolves.toBe('second');

        const values = new Map<string, string>();
        const storage = {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => { values.set(key, value); },
        };
        const arm = runtimeFunctionWithBindings<(
            context: Record<string, unknown>,
            attemptId: string,
        ) => boolean | null>('armPreparedStorageFault', { sessionStorage: storage });
        const faultContext = { config: { faultKey: 'fault' }, faultReady: false };
        expect(arm(faultContext, 'attempt-1')).toBeNull();
        faultContext.faultReady = true;
        expect(arm(faultContext, 'attempt-1')).toBe(false);
        values.set('fault', 'ready');
        faultContext.faultReady = true;
        expect(arm(faultContext, 'attempt-1')).toBe(true);
        expect(values.get('fault')).toBe('armed:attempt-1');
        expect(faultContext.faultReady).toBe(false);

        const durableWrite = vi.fn(async () => 'durable');
        const post = vi.fn(async () => undefined);
        const noteSettingsWrite = vi.fn();
        const guardedWrite = runtimeFunctionWithBindings<(
            config: Record<string, unknown>,
            realSetValue: (...args: unknown[]) => Promise<unknown>,
            key: string,
            value: unknown,
        ) => Promise<unknown>>('guardedDisposableSetValue', {
            sessionStorage: storage,
            settingsAuthorityWrite: (name: string) => name === 'settings',
            noteDisposableSettingsWrite: noteSettingsWrite,
            armedStorageFaultAttempt: runtimeFunctionWithBindings('armedStorageFaultAttempt', {
                sessionStorage: storage,
            }),
            postBrowserProbeEvent: post,
        });
        values.set('fault', 'ready');
        await expect(guardedWrite({ faultKey: 'fault' }, durableWrite, 'settings', {}))
            .resolves.toBe('durable');
        expect(values.get('fault')).toBe('ready');
        values.set('fault', 'armed:attempt-1');
        await expect(guardedWrite({ faultKey: 'fault' }, durableWrite, 'unrelated', {}))
            .resolves.toBe('durable');
        expect(values.get('fault')).toBe('armed:attempt-1');
        await expect(guardedWrite({ faultKey: 'fault' }, durableWrite, 'settings', {}))
            .rejects.toThrow('injected storage failure');
        expect(values.get('fault')).toBe('consumed:attempt-1');
        expect(post).toHaveBeenCalledWith(
            { faultKey: 'fault' },
            'study',
            { type: 'fault-consumed', attemptId: 'attempt-1' },
        );
        // Both settings writes count (passed-through and faulted); the unrelated one does not.
        expect(noteSettingsWrite).toHaveBeenCalledTimes(2);
        const countKey = 'firefoxSettingsAuthoritySmokeTestWrites';
        const note = runtimeFunction<(config: Record<string, unknown>) => void>('noteDisposableSettingsWrite');
        note({ settingsWriteCountKey: countKey });
        note({ settingsWriteCountKey: countKey });
        expect(Reflect.get(globalThis, countKey)).toBe(2);
        Reflect.deleteProperty(globalThis, countKey);

        const ready = runtimeFunctionWithBindings<(
            context: Record<string, unknown>,
            state: Record<string, unknown>,
            posted: Record<string, boolean>,
        ) => boolean>('storageFaultReportReady', { sessionStorage: storage });
        const reportContext = {
            config: { faultKey: 'fault' },
            studyInstanceId: 'target',
            activeSaveAttemptId: 'attempt-1',
        };
        const reportState = { phase: 'storage-failure', storageFailureStudyInstanceId: 'target' };
        expect(ready(reportContext, reportState, { faultResult: false })).toBe(true);
        expect(ready(reportContext, {
            ...reportState,
            storageFailureStudyInstanceId: 'older',
        }, { faultResult: false })).toBe(false);
        reportContext.activeSaveAttemptId = 'attempt-2';
        expect(ready(reportContext, reportState, { faultResult: false })).toBe(false);
    });

    it('waits for the server-observed successful Study write before the Reader overwrites it', () => {
        const requiredEvents = sourceSection(
            'const REQUIRED_AUTOMATED_EVENTS',
            'const VALUE_ARGUMENT_FIELDS',
        );
        for (const event of [
            'study-write-issued',
            'reader-observed-study-write',
            'reader-write-issued',
            'reader-final-state',
            'study-observed-reader-write',
            'study-final-state',
        ]) expect(requiredEvents).toContain(event);
        expect(referencedIdentifiers('automatedPhasesComplete')).toEqual(expect.arrayContaining([
            'REQUIRED_AUTOMATED_EVENTS',
            'automatedEventPredicate',
        ]));
        const { successfulStudyWriteEvent, successfulStudyWriteAcknowledged: acknowledged } = runtimeFunctions<{
            successfulStudyWriteEvent: (event: Record<string, unknown>) => boolean;
            successfulStudyWriteAcknowledged: (events: Array<Record<string, unknown>>) => boolean;
        }>(['successfulStudyWriteEvent', 'successfulStudyWriteAcknowledged']);
        const proof = {
            type: 'study-write-issued',
            surface: 'study',
            ok: true,
            authorityPairValid: true,
            theme: 'dark',
            subtitleFontSize: 37,
            darkClass: true,
        };
        expect(successfulStudyWriteEvent(proof)).toBe(true);
        expect(acknowledged([proof])).toBe(true);
        expect(acknowledged([{ ...proof, surface: 'reader' }])).toBe(false);
        expect(acknowledged([{ ...proof, theme: 'light' }])).toBe(false);
        expect(acknowledged([{ ...proof, subtitleFontSize: 39 }])).toBe(false);
        expect(acknowledged([{ ...proof, darkClass: false }])).toBe(false);
        expect(acknowledged([{ ...proof, authorityPairValid: false }])).toBe(false);
        expect(acknowledged([{ ...proof, ok: false }])).toBe(false);
        expect(acknowledged([{ type: 'reader-observed-study-write', ok: true }])).toBe(false);
        expect(acknowledged([proof, { type: 'later-event', ok: true }])).toBe(true);

        const stateReferences = referencedIdentifiers('serveProbeState');
        expect(stateReferences).toEqual(expect.arrayContaining([
            'successfulStudyWriteAcknowledged',
            'studyWriteAcknowledged',
        ]));
        expect(calledFunctions('waitForStudyWriteAcknowledgement')).toEqual(expect.arrayContaining([
            'browserWaitFor',
            'fetchProbeState',
        ]));

        const issueCalls = calledFunctions('issueReaderWrite');
        const readerObserved = issueCalls.indexOf('context.post');
        const barrier = issueCalls.indexOf('waitForStudyWriteAcknowledgement');
        const firstWrite = issueCalls.indexOf('compilerMessage');
        const physicalWriteProof = issueCalls.indexOf('waitForExpectedCanonicalAuthorityPair', firstWrite);
        const issued = issueCalls.indexOf('context.post', physicalWriteProof);
        const finalState = issueCalls.indexOf('waitForExpectedCanonicalAuthoritySurface', firstWrite);
        expect(readerObserved).toBeGreaterThanOrEqual(0);
        expect(barrier).toBeGreaterThan(readerObserved);
        expect(firstWrite).toBeGreaterThan(barrier);
        expect(physicalWriteProof).toBeGreaterThan(firstWrite);
        expect(issued).toBeGreaterThan(physicalWriteProof);
        expect(finalState).toBeGreaterThan(issued);
        expect(SOURCE).toContain("type: 'reader-final-state'");
        expect(SOURCE).toContain("type: 'study-final-state'");

        const {
            successfulReaderWriteIssuedEvent,
            successfulReaderFinalStateEvent,
            successfulStudyFinalStateEvent,
        } = runtimeFunctions<{
            successfulReaderWriteIssuedEvent: (event: Record<string, unknown>) => boolean;
            successfulReaderFinalStateEvent: (event: Record<string, unknown>) => boolean;
            successfulStudyFinalStateEvent: (event: Record<string, unknown>) => boolean;
        }>([
            'successfulReaderWriteIssuedEvent',
            'successfulReaderFinalStateEvent',
            'successfulStudyFinalStateEvent',
        ]);
        const readerFinal = {
            surface: 'reader',
            ok: true,
            authorityPairValid: true,
            theme: 'light',
            subtitleFontSize: 39,
            sentinel: 'reader-live-write',
            darkClass: false,
        };
        expect(successfulReaderWriteIssuedEvent(readerFinal)).toBe(true);
        expect(successfulReaderFinalStateEvent(readerFinal)).toBe(true);
        expect(successfulReaderFinalStateEvent({ ...readerFinal, darkClass: true })).toBe(false);
        expect(successfulReaderFinalStateEvent({ ...readerFinal, authorityPairValid: false })).toBe(false);
        const studyFinal = { ...readerFinal, surface: 'study' };
        expect(successfulStudyFinalStateEvent(studyFinal)).toBe(true);
        expect(successfulStudyFinalStateEvent({ ...studyFinal, sentinel: 'study-live-write' })).toBe(false);
        expect(successfulStudyFinalStateEvent({ ...studyFinal, authorityPairValid: false })).toBe(false);
    });

    it('drops superseded surface observations and waits for exact final storage plus DOM sentinels', () => {
        expect(calledFunctions('observeSettingsSurface')).toEqual(expect.arrayContaining([
            'settingsSummary',
            'browserWaitFor',
            'surfaceObservationReadiness',
            'waitForExpectedSettingsSurface',
            'context.post',
        ]));
        expect(SOURCE).toContain("return 'superseded'");
        expect(SOURCE).toContain("if (readiness !== 'ready') return");
        expect(calledFunctions('waitForExpectedSettingsSurface').filter(call => call === 'exactSettingsSurface'))
            .toHaveLength(2);
        expect(calledFunctions('exactSettingsSurface')).toEqual(expect.arrayContaining([
            'context.readSettings',
            'settingsSummariesMatch',
            'darkThemeClass',
        ]));
        expect(calledFunctions('issueStudyLiveWriteOnce')).toContain('performStudyLiveWrite');
        expect(calledFunctions('performStudyLiveWrite')).toContain('waitForExpectedCanonicalAuthoritySurface');
        expect(calledFunctions('issueReaderWrite')).toEqual(expect.arrayContaining([
            'waitForExpectedCanonicalAuthorityPair',
            'waitForExpectedCanonicalAuthoritySurface',
        ]));
        expect(calledFunctions('reportStudyReaderWrite')).toContain('reportStudyFinalState');
        expect(calledFunctions('reportStudyFinalState')).toContain('waitForExpectedCanonicalAuthoritySurface');
        expect(SOURCE).toContain("expected.sentinel === 'reader-live-write'");
        expect(referencedIdentifiers('sharedProbeHelpers')).toEqual(expect.arrayContaining([
            'fetchProbeState',
            'exactSettingsSurface',
            'waitForExpectedSettingsSurface',
            'exactCanonicalAuthoritySurface',
            'waitForExpectedCanonicalAuthoritySurface',
            'physicalAuthorityPairMatches',
            'surfaceObservationReadiness',
            'takePendingFormClose',
            'durableSaveClose',
        ]));
        expect(referencedIdentifiers('studyObserverHelpers')).toEqual(expect.arrayContaining([
            'performStudyLiveWrite',
            'shouldPrepareStorageFault',
            'stableStorageFaultSnapshot',
            'armPreparedStorageFault',
            'completedStorageFaultResult',
            'storageFaultEvent',
        ]));
    });

    it('requires delayed stable rechecks for terminal surfaces and the failed-save no-success verdict', async () => {
        const surfaceReads = [
            { theme: 'light', authorityPairValid: true },
            null,
        ];
        const surfaceProbe = vi.fn(async () => surfaceReads.shift() ?? null);
        const surfaceDelays: number[] = [];
        const surfaceWait = runtimeFunctionWithBindings<(
            context: Record<string, unknown>,
            settings: Record<string, unknown>,
            intent: Record<string, unknown>,
        ) => Promise<unknown>>('waitForExpectedCanonicalAuthoritySurface', {
            browserWaitFor: (predicate: () => Promise<unknown>) => predicate(),
            exactCanonicalAuthoritySurface: surfaceProbe,
            setTimeout: (callback: () => void, delay: number) => {
                surfaceDelays.push(delay);
                callback();
                return 0;
            },
        });
        await expect(surfaceWait({}, {}, {})).resolves.toBeNull();
        expect(surfaceProbe).toHaveBeenCalledTimes(2);
        expect(surfaceDelays).toEqual([500]);

        const failureReads = [{ ok: true }, { ok: false }];
        const failureProbe = vi.fn(async () => failureReads.shift() ?? { ok: false });
        const failureDelays: number[] = [];
        const failureWait = runtimeFunctionWithBindings<(
            context: Record<string, unknown>,
        ) => Promise<unknown>>('waitForDurableStorageFault', {
            browserWaitFor: (predicate: () => Promise<unknown>) => predicate(),
            storageFaultResult: failureProbe,
            setTimeout: (callback: () => void, delay: number) => {
                failureDelays.push(delay);
                callback();
                return 0;
            },
        });
        await expect(failureWait({})).resolves.toBeNull();
        expect(failureProbe).toHaveBeenCalledTimes(2);
        expect(failureDelays).toEqual([750]);
    });

    it('accepts a sanitized imported backup when its exact authority pair stays unchanged', async () => {
        let currentAuthority = 'stable-authority-pair';
        const authoritySnapshot = vi.fn(async () => currentAuthority);
        const storageFaultResult = runtimeFunctionWithBindings<(
            context: Record<string, unknown>,
        ) => Promise<Record<string, unknown>>>('storageFaultResult', {
            studyCanonicalSummary: async () => ({ theme: 'dark', subtitleFontSize: 43 }),
            studySettingsAuthoritySnapshot: authoritySnapshot,
            latestSettingsForm: () => ({}),
            studyFormState: () => ({
                saveDisabled: false,
                importDisabled: false,
                saveBlocked: '',
            }),
            successToastVisible: () => false,
            failureToastVisible: () => false,
        });

        await expect(storageFaultResult({
            faultAuthoritySnapshot: 'stable-authority-pair',
            successToastObserved: false,
            failureToastObserved: true,
        })).resolves.toMatchObject({
            ok: true,
            durableUnchanged: true,
            theme: 'dark',
            subtitleFontSize: 43,
        });
        currentAuthority = 'changed-authority-pair';
        await expect(storageFaultResult({
            faultAuthoritySnapshot: 'stable-authority-pair',
            successToastObserved: false,
            failureToastObserved: true,
        })).resolves.toMatchObject({ ok: false, durableUnchanged: false });
        expect(authoritySnapshot).toHaveBeenCalledTimes(2);
    });

    it('prepares storage failure before instructions and arms only for the exact Save', () => {
        expect(calledFunctions('evaluateBackupReload')).toContain('startPreparationPhase');
        expect(calledFunctions('evaluateBackupReload')).not.toContain('startPhase');
        expect(SOURCE).toContain("state.phase === 'storage-failure-preparing'");
        expect(SOURCE).toContain("type: 'fault-ready', ok: true");
        expect(SOURCE).toContain("type: 'fault-armed', ok: faultArmed");
        expect(calledFunctions('evaluateStorageFailurePreparation')).toContain('startPhase');
        expect(SOURCE).toContain('no user action yet');
        expect(SOURCE).toContain("Wait for the terminal's fault-ready manual phase");
        expect(SOURCE).not.toContain('setTimeout(resolve, 1_200)');
        expect(calledFunctions('maybePrepareStorageFault')).toEqual(expect.arrayContaining([
            'stableStorageFaultSnapshot',
            'sessionStorage.setItem',
            'context.post',
        ]));
        expect(calledFunctions('stableStorageFaultSnapshot')).toContain('studySettingsAuthoritySnapshot');
        expect(calledFunctions('armPreparedStorageFault')).toEqual(expect.arrayContaining([
            'sessionStorage.getItem',
            'sessionStorage.setItem',
        ]));
        const activationCalls = calledFunctions('reportSettingsSaveActivation');
        expect(sourceSection(
            'function reportSettingsSaveActivation',
            'function eventSubmitButton',
        )).toContain('if (!event.isTrusted) return;');
        expect(activationCalls.indexOf('isExactSettingsSaveButton'))
            .toBeLessThan(activationCalls.indexOf('armPreparedStorageFault'));
        expect(activationCalls.indexOf('settingsSaveFailureToasts'))
            .toBeLessThan(activationCalls.indexOf('armPreparedStorageFault'));
        expect(sourceSection(
            'function reportSettingsSaveActivation',
            'function eventSubmitButton',
        )).toContain('context.failureToastBaselineClear = settingsSaveFailureToasts().length === 0;');
        expect(activationCalls.indexOf('armPreparedStorageFault'))
            .toBeLessThan(activationCalls.indexOf('context.post'));
        expect(calledFunctions('maybeReportStorageFault')).toContain('completedStorageFaultResult');
        expect(calledFunctions('completedStorageFaultResult')).toContain('waitForDurableStorageFault');
        expect(calledFunctions('waitForDurableStorageFault')).toEqual(expect.arrayContaining([
            'browserWaitFor',
            'storageFaultResult',
            'setTimeout',
        ]));
        expect(calledFunctions('waitForDurableStorageFault').filter(call => call === 'storageFaultResult'))
            .toHaveLength(2);
        expect(calledFunctions('storageFaultResult')).toEqual(expect.arrayContaining([
            'studyFormState',
            'successToastVisible',
            'failureToastVisible',
            'studySettingsAuthoritySnapshot',
        ]));
        expect(SOURCE).toContain("toast.textContent?.trim() === 'Settings save failed.'");
        expect(SOURCE).toContain('durableUnchanged: optionalBoolean(value.durableUnchanged)');
        expect(SOURCE).toContain('successToastObserved: optionalBoolean(value.successToastObserved)');
        expect(SOURCE).toContain('failureToastObserved: optionalBoolean(value.failureToastObserved)');
        expect(referencedIdentifiers('storageFaultResult')).toEqual(expect.arrayContaining([
            'durableUnchanged',
            'importDisabled',
            'failureToastObserved',
            'successToastObserved',
        ]));
        expect(calledFunctions('studySettingsAuthoritySnapshot')).toContain('browser.storage.local.get');
        expect(sourceSection(
            'async function maybePrepareStorageFault',
            'function armPreparedStorageFault',
        )).toContain("sessionStorage.setItem(context.config.faultKey, 'ready')");
        expect(sourceSection(
            'function armedStorageFaultAttempt',
            'function settingsAuthorityWrite',
        )).toContain("const prefix = 'armed:'");
        expect(referencedIdentifiers('storageFaultEvent')).toContain('activeSaveAttemptId');
        expect(referencedIdentifiers('maybeReportStorageFault')).toContain('activeSaveActivation');
    });

    it('latches only a visible failure toast from the consumed trusted Save attempt', () => {
        const storage = new Map<string, string>();
        const session = { getItem: (key: string) => storage.get(key) ?? null };
        const failureToastVisible = vi.fn(() => true);
        const observationIsCurrent = runtimeFunctionWithBindings<(
            context: Record<string, unknown>,
        ) => boolean>('failureToastObservationIsCurrent', { sessionStorage: session });
        const observe = runtimeFunctionWithBindings<(context: {
            activeSaveAttemptId: string;
            config: { faultKey: string };
            failureToastObserved: boolean;
            failureToastBaselineClear: boolean;
        }) => void>('observeStudyFailureToast', {
            failureToastObservationIsCurrent: observationIsCurrent,
            failureToastVisible,
        });
        const context = {
            activeSaveAttemptId: 'attempt-1',
            config: { faultKey: 'fault' },
            failureToastObserved: false,
            failureToastBaselineClear: true,
        };

        context.failureToastBaselineClear = false;
        storage.set('fault', 'consumed:attempt-1');
        observe(context);
        expect(context.failureToastObserved).toBe(false);
        expect(failureToastVisible).not.toHaveBeenCalled();

        context.failureToastBaselineClear = true;
        storage.set('fault', 'ready');
        observe(context);
        expect(context.failureToastObserved).toBe(false);
        expect(failureToastVisible).not.toHaveBeenCalled();

        storage.set('fault', 'consumed:other-attempt');
        observe(context);
        expect(context.failureToastObserved).toBe(false);
        expect(failureToastVisible).not.toHaveBeenCalled();

        storage.set('fault', 'consumed:attempt-1');
        observe(context);
        expect(context.failureToastObserved).toBe(true);
        expect(failureToastVisible).toHaveBeenCalledOnce();
    });

    it('treats a not-yet-visible matching failure toast as a prior attempt', () => {
        const functions = runtimeFunctions<{
            settingsSaveFailureToasts: () => Element[];
            failureToastVisible: () => boolean;
        }>(['settingsSaveFailureToasts', 'failureToastVisible']);
        document.body.innerHTML = '<div class="jpdb-reader-toast">Settings save failed.</div>';

        expect(functions.settingsSaveFailureToasts()).toHaveLength(1);
        expect(functions.failureToastVisible()).toBe(false);
    });

    it('records key names and safe sentinels without serializing storage values', () => {
        expect(SOURCE).toContain('valuePayloadsLogged: false');
        expect(SOURCE).toContain('keyNamesOnly: true');
        expect(SOURCE).toContain('optionalKeyNames');
        expect(SOURCE).toContain('assertReportContainsNoValuePayloads');
        expect(SOURCE).toContain("[UNRELATED_KEY]: UNRELATED_VALUE");
        expect(SOURCE).toContain("const PRIVATE_KEY = 'yomu:private:academy-device:v1'");
        expect(SOURCE).toContain("probeToken: config.probeToken");
        expect(SOURCE).toContain("payload?.probeToken !== proof.probeToken");
        expect(SOURCE).not.toContain('stranded-private-secret');
    });

    it('rejects incomplete, torn, corrupt, or merely summary-equal physical authority pairs', () => {
        const { physicalAuthorityPairMatches } = runtimeFunctions<{
            physicalAuthorityPairMatches: (
                values: Record<string, unknown>,
                settingsKey: string,
                intentKey: string,
                settings: Record<string, unknown>,
                intent: Record<string, unknown>,
            ) => boolean;
        }>([
            'canonicalProbeValue',
            'probeValuesMatch',
            'withoutAuthorityCommit',
            'authorityRecord',
            'managedAuthorityPayload',
            'compatibleManagedAuthorityPayloads',
            'committedAuthorityPayloadPair',
            'authorityCommitWitness',
            'authorityPayloadPair',
            'physicalAuthorityPairMatches',
        ]);
        const settings = {
            theme: 'dark',
            subtitleFontSize: 37,
            accentColor: '#315d8c',
            nested: { enabled: true, order: ['a', 'b'] },
            __yomuSettingsPersistenceCommitV1: 'fixture-pair',
        };
        const intent = {
            revision: 8,
            __yomuSettingsPersistenceCommitV1: 'fixture-pair',
            records: {
                theme: { seq: 7, value: 'dark' },
                subtitleFontSize: { seq: 8, value: 37 },
            },
        };
        const matches = (values: Record<string, unknown>) =>
            physicalAuthorityPairMatches(values, 'SETTINGS', 'INTENT', settings, intent);
        expect(matches({ SETTINGS: settings, INTENT: intent })).toBe(true);
        const unmarkedSettings = { ...settings };
        const unmarkedIntent = { ...intent };
        Reflect.deleteProperty(unmarkedSettings, '__yomuSettingsPersistenceCommitV1');
        Reflect.deleteProperty(unmarkedIntent, '__yomuSettingsPersistenceCommitV1');
        expect(matches({ SETTINGS: unmarkedSettings, INTENT: unmarkedIntent })).toBe(false);
        expect(matches({ SETTINGS: { ...settings, accentColor: '#ffffff' }, INTENT: intent })).toBe(false);
        expect(matches({ SETTINGS: settings })).toBe(false);
        expect(matches({
            SETTINGS: { ...settings, __yomuSettingsPersistenceCommitV1: 'same-commit' },
            INTENT: { ...intent, __yomuSettingsPersistenceCommitV1: 'same-commit' },
        })).toBe(true);
        expect(matches({
            SETTINGS: { ...settings, __yomuSettingsPersistenceCommitV1: 'settings-commit' },
            INTENT: { ...intent, __yomuSettingsPersistenceCommitV1: 'intent-commit' },
        })).toBe(false);
        expect(matches({
            SETTINGS: { __yomuManagedStateEnvelope: 1, epoch: '1:reset', value: settings },
            INTENT: { __yomuManagedStateEnvelope: 1, epoch: '1:reset', value: intent },
        })).toBe(true);
        expect(matches({
            SETTINGS: { __yomuManagedStateEnvelope: 1, epoch: '1:reset', value: settings },
            INTENT: { __yomuManagedStateEnvelope: 1, epoch: '2:reset', value: intent },
        })).toBe(false);
        expect(matches({
            SETTINGS: { __yomuManagedStateEnvelope: 1, epoch: '1:reset', value: settings },
            INTENT: intent,
        })).toBe(false);
        expect(matches({
            SETTINGS: { __yomuManagedStateEnvelope: 2, epoch: '1:reset', value: settings },
            INTENT: { __yomuManagedStateEnvelope: 2, epoch: '1:reset', value: intent },
        })).toBe(false);
    });

    it('requires a current pair or an observed raw-only initial-setup state', () => {
        const raw = runtimeFunction<(current: Record<string, unknown>, presence: Record<string, boolean>) => boolean>(
            'rawOnlyAuthorityMatches',
        );
        const prefixed = runtimeFunction<typeof raw>('prefixedAuthorityMatches');
        const divergent = runtimeFunction<typeof raw>('divergentAuthorityMatches');
        const allPresent = { rawSettings: true, rawIntent: true, canonicalSettings: true, canonicalIntent: true };
        const rawOnly = { ...allPresent, canonicalSettings: false, canonicalIntent: false };
        expect(raw({}, rawOnly)).toBe(true);
        expect(raw({}, allPresent)).toBe(false);
        expect(prefixed(
            { theme: 'light', subtitleFontSize: 31, sentinel: 'current-canonical' },
            { ...allPresent, rawSettings: false, rawIntent: false },
        )).toBe(true);
        expect(divergent(
            { theme: 'light', subtitleFontSize: 31, sentinel: 'current-divergent-canonical' },
            allPresent,
        )).toBe(true);
        for (const field of Object.keys(rawOnly)) {
            expect(raw({}, { ...rawOnly, [field]: !rawOnly[field as keyof typeof rawOnly] })).toBe(false);
        }

        const { scenarioAuthorityMatches, successfulAuthorityEvent } = runtimeFunctions<{
            scenarioAuthorityMatches: (
                scenario: string,
                values: Record<string, unknown>,
                config: Record<string, unknown>,
            ) => boolean;
            successfulAuthorityEvent: (event: Record<string, unknown>) => boolean;
        }>([
            'canonicalProbeValue',
            'probeValuesMatch',
            'withoutAuthorityCommit',
            'authorityRecord',
            'managedAuthorityPayload',
            'compatibleManagedAuthorityPayloads',
            'committedAuthorityPayloadPair',
            'authorityCommitWitness',
            'authorityPayloadPair',
            'physicalAuthorityPairMatches',
            'studySettingsAuthorityKey',
            'scenarioAuthorityPlan',
            'scenarioAuthorityMatches',
            'successfulAuthorityEvent',
        ]);
        const prefix = 'usc_test_';
        const settingsKey = 'SETTINGS';
        const intentKey = 'INTENT';
        const rawSettings = { theme: 'dark', subtitleFontSize: 47, accentColor: '#111111' };
        const rawIntent = { revision: 2, records: { theme: { seq: 1, value: 'dark' } } };
        const canonicalSettings = { theme: 'light', subtitleFontSize: 31, accentColor: '#222222', __yomuSettingsPersistenceCommitV1: 'fixture' };
        const canonicalIntent = { revision: 4, records: { theme: { seq: 3, value: 'light' } }, __yomuSettingsPersistenceCommitV1: 'fixture' };
        const divergentRaw = { ...rawSettings, marker: 'divergent-raw' };
        const divergentCanonical = { ...canonicalSettings, marker: 'divergent-canonical' };
        const config = {
            storagePrefix: prefix,
            settingsKey,
            intentKey,
            scenarios: {
                'raw-only': { [settingsKey]: rawSettings, [intentKey]: rawIntent },
                'prefixed-only': {
                    [`${prefix}${settingsKey}`]: canonicalSettings,
                    [`${prefix}${intentKey}`]: canonicalIntent,
                },
                divergent: {
                    [settingsKey]: divergentRaw,
                    [intentKey]: rawIntent,
                    [`${prefix}${settingsKey}`]: divergentCanonical,
                    [`${prefix}${intentKey}`]: canonicalIntent,
                },
            },
        };
        const rawPhysical = {
            [settingsKey]: rawSettings,
            [intentKey]: rawIntent,
        };
        expect(scenarioAuthorityMatches('raw-only', rawPhysical, config)).toBe(true);
        expect(scenarioAuthorityMatches('raw-only', {
            ...rawPhysical,
            [`${prefix}${settingsKey}`]: { ...rawSettings, accentColor: '#ffffff' },
        }, config)).toBe(false);
        expect(scenarioAuthorityMatches('raw-only', {
            ...rawPhysical,
            [`${prefix}${settingsKey}`]: {
                ...rawSettings,
                __yomuSettingsPersistenceCommitV1: 'settings-commit',
            },
            [`${prefix}${intentKey}`]: {
                ...rawIntent,
                __yomuSettingsPersistenceCommitV1: 'intent-commit',
            },
        }, config)).toBe(false);
        expect(scenarioAuthorityMatches('prefixed-only', config.scenarios['prefixed-only'], config)).toBe(true);
        expect(scenarioAuthorityMatches('divergent', config.scenarios.divergent, config)).toBe(true);
        const missingIntent = { ...config.scenarios.divergent };
        Reflect.deleteProperty(missingIntent, `${prefix}${intentKey}`);
        expect(scenarioAuthorityMatches('divergent', missingIntent, config)).toBe(false);

        expect(successfulAuthorityEvent({ surface: 'study', ok: true, authorityPairValid: true })).toBe(true);
        expect(successfulAuthorityEvent({ surface: 'study', scenario: 'raw-only', ok: true, authorityPairValid: true })).toBe(false);
        expect(successfulAuthorityEvent({ surface: 'study', scenario: 'raw-only', ok: true, authorityAbsent: true, onboardingVisible: true })).toBe(true);
        expect(successfulAuthorityEvent({ surface: 'study', scenario: 'raw-only', ok: true, authorityAbsent: true, onboardingVisible: false })).toBe(false);
        expect(successfulAuthorityEvent({ surface: 'study', ok: true, authorityPairValid: false })).toBe(false);
        expect(calledFunctions('completeAuthorityScenario')).toContain('waitForAuthorityScenarioProof');
        expect(calledFunctions('authorityScenarioProof')).toEqual(expect.arrayContaining([
            'browser.storage.local.get',
            'authorityPhysicalObservation',
            'scenarioAuthorityMatches',
            'darkThemeClass',
        ]));
        expect(calledFunctions('authorityPhysicalObservation')).toContain('authorityPayloadPair');
        expect(calledFunctions('waitForAuthorityScenarioProof').filter(call => call === 'authorityScenarioProof'))
            .toHaveLength(2);
    });

    it('cannot pass reset while raw, prefixed, slotted, or logical authority/private state survives', () => {
        const observer = sourceSection('async function studyObserver(config)', 'async function contentProbe(config)');
        expect(SOURCE).toContain('[PRIVATE_KEY]: `${PRIVATE_VALUE}-live-raw`');
        expect(SOURCE).toContain('[`${prefix}${PRIVATE_KEY}`]: `${PRIVATE_VALUE}-live-canonical`');
        expect(observer).toContain('key.includes(encodeURIComponent(config.privateKey))');
        expect(observer).toContain('config.settingsKey,\n                config.intentKey,\n                config.privateKey,');
        expect(observer).toContain('const managedAuthorityKeys = keys.filter(key => key !== config.unrelatedKey)');
        const complete = runtimeFunction<(
            logicalAuthorityAbsent: boolean,
            managedAuthorityKeys: string[],
            unrelatedPresent: boolean,
        ) => boolean>('factoryResetComplete');
        expect(complete(true, [], true)).toBe(true);
        expect(complete(false, [], true)).toBe(false);
        expect(complete(true, ['authority-survivor'], true)).toBe(false);
        expect(complete(true, [], false)).toBe(false);
    });

    it('seeds both v1.9.3 upgrade scenarios from the real corpus bytes under the packaged prefix', () => {
        expect(SOURCE).toContain(`const SETTINGS_KEY = '${CORPUS_SETTINGS_KEY}'`);
        expect(SOURCE).toContain(`const INTENT_KEY = '${CORPUS_INTENT_KEY}'`);
        expect(SOURCE).toContain("path.join(ROOT, 'tests', 'reader', 'fixtures', 'upgrade-v1.9.3')");
        expect(SOURCE).toContain("extension: 'd-extension-study-and-content-script.json'");
        expect(SOURCE).toContain("unmarked: 'b-userscript-machine-only-unmarked.json'");
        expect(SOURCE).toContain("seqZeroLedger: 'c1-userscript-folded-pins-explicit.json'");

        const corpusPrefix = UPGRADE_CORPUS.extension.compilerStoragePrefix as string;
        const extensionBytes = UPGRADE_CORPUS.extension.extensionStorageLocal as Record<string, unknown>;
        const prefix = 'usc_packaged_harness_';
        const { upgradeScenarioSeeds } = upgradeSeedFunctions();
        const seeds = upgradeScenarioSeeds(prefix, UPGRADE_CORPUS);
        expect(Object.keys(seeds)).toEqual(['upgrade-v193-unmarked', 'upgrade-v193-seq0-ledger']);

        // 1. d's extension bytes in b's unmarked shape: no commit id and no intent ledger.
        const unmarked = seeds['upgrade-v193-unmarked']!;
        expect(Object.keys(UPGRADE_CORPUS.unmarked.gm)).not.toContain(CORPUS_INTENT_KEY);
        expect(Object.keys(unmarked).sort()).toEqual(
            Object.keys(UPGRADE_CORPUS.unmarked.gm).map(key => `${prefix}${key}`).sort(),
        );
        const markedSettings = extensionBytes[`${corpusPrefix}${CORPUS_SETTINGS_KEY}`] as Record<string, unknown>;
        expect(markedSettings[COMMIT_FIELD]).toEqual(expect.any(String));
        const unmarkedSettings = { ...markedSettings };
        Reflect.deleteProperty(unmarkedSettings, COMMIT_FIELD);
        expect(unmarked[`${prefix}${CORPUS_SETTINGS_KEY}`]).toEqual(unmarkedSettings);
        expect(unmarked[`${prefix}${CORPUS_SETTINGS_KEY}`]).not.toHaveProperty(COMMIT_FIELD);
        expect(unmarked[`${prefix}yomu:prefer-japanese-site-language:v1`])
            .toBe(extensionBytes[`${corpusPrefix}yomu:prefer-japanese-site-language:v1`]);
        expect(unmarked).not.toHaveProperty(`${prefix}${CORPUS_INTENT_KEY}`);

        // 2. c1's committed pair with seq-0 ledger records, verbatim under the packaged prefix.
        const seqZero = seeds['upgrade-v193-seq0-ledger']!;
        expect(seqZero).toEqual(Object.fromEntries(Object.entries(UPGRADE_CORPUS.seqZeroLedger.gm)
            .map(([key, value]) => [`${prefix}${key}`, value])));
        const intent = seqZero[`${prefix}${CORPUS_INTENT_KEY}`] as {
            records: Record<string, { seq: number }>;
            __yomuSettingsPersistenceCommitV1: string;
        };
        expect(Object.values(intent.records).some(record => record.seq === 0)).toBe(true);
        expect(intent[COMMIT_FIELD]).toEqual(expect.any(String));
        expect((seqZero[`${prefix}${CORPUS_SETTINGS_KEY}`] as Record<string, unknown>)[COMMIT_FIELD])
            .toBe(intent[COMMIT_FIELD]);

        expect(Object.keys({ ...unmarked, ...seqZero }).every(key => key.startsWith(prefix))).toBe(true);
        expect(() => upgradeScenarioSeeds(prefix, { ...UPGRADE_CORPUS, unmarked: UPGRADE_CORPUS.seqZeroLedger }))
            .toThrow('no longer unmarked');
        expect(() => upgradeScenarioSeeds(prefix, { ...UPGRADE_CORPUS, seqZeroLedger: UPGRADE_CORPUS.unmarked }))
            .toThrow('seq-0 ledger pair');

        const assertPrefix = runtimeFunction<(corpus: typeof UPGRADE_CORPUS, prefix: string) => void>(
            'assertUpgradeCorpusStoragePrefix',
        );
        expect(() => assertPrefix(UPGRADE_CORPUS, corpusPrefix)).not.toThrow();
        expect(() => assertPrefix(UPGRADE_CORPUS, prefix)).toThrow('would not read v1.9.3 extension bytes');
        const main = sourceSection('const storagePrefix = storagePrefixFromAdapter', 'const studyIndexPath');
        expect(main.indexOf('assertUpgradeCorpusStoragePrefix'))
            .toBeLessThan(main.indexOf('upgradeScenarioExpectations'));

        const { upgradeScenarioExpectations } = runtimeFunctions<{
            upgradeScenarioExpectations: (corpus: typeof UPGRADE_CORPUS) => Record<string, unknown>;
        }>(['upgradeExpectedSettings', 'upgradeScenarioExpectations']);
        const extensionOutcome = { theme: 'dark', subtitleFontSize: 40, accentColor: '#5ea780' };
        const seqZeroOutcome = { theme: 'dark', subtitleFontSize: 40, accentColor: '#2563eb' };
        expect(upgradeScenarioExpectations(UPGRADE_CORPUS)).toEqual({
            'upgrade-v193-unmarked': { study: extensionOutcome, reader: extensionOutcome },
            'upgrade-v193-seq0-ledger': { study: seqZeroOutcome, reader: seqZeroOutcome },
        });
    });

    it('accepts a v1.9.3 upgrade read only when both surfaces apply corpus values and nothing is written', () => {
        const expected = { theme: 'dark', subtitleFontSize: 40, accentColor: '#5ea780' };
        const events = runtimeFunctionsWithBindings<{
            successfulUpgradeStudyEvent: (event: Record<string, unknown>) => boolean;
            successfulUpgradeReaderEvent: (event: Record<string, unknown>) => boolean;
            upgradeReaderScenariosObserved: (events: Array<Record<string, unknown>>) => string[];
        }>([
            'upgradeSurfaceMatches',
            'upgradeStudyObservationMatches',
            'successfulUpgradeStudyEvent',
            'successfulUpgradeReaderEvent',
            'upgradeReaderScenariosObserved',
        ], { upgradeExpectations: { 'upgrade-v193-unmarked': { study: expected, reader: expected } } });
        const applied = {
            scenario: 'upgrade-v193-unmarked',
            ok: true,
            theme: 'dark',
            subtitleFontSize: 40,
            darkClass: true,
            appliedSubtitleFontSize: 40,
            accentApplied: true,
            onboardingVisible: false,
            recoveryVisible: false,
        };
        const study = {
            ...applied,
            type: 'authority-upgrade-v193-unmarked',
            surface: 'study',
            durableUnchanged: true,
            settingsWriteObserved: false,
        };
        const reader = { ...applied, type: 'reader-upgrade-v193-unmarked', surface: 'reader' };
        expect(events.successfulUpgradeStudyEvent(study)).toBe(true);
        expect(events.successfulUpgradeReaderEvent(reader)).toBe(true);
        const surfaceBreaks: Array<[string, unknown]> = [
            ['ok', false],
            ['theme', 'light'],
            ['subtitleFontSize', 28],
            ['darkClass', false],
            ['appliedSubtitleFontSize', 28],
            ['appliedSubtitleFontSize', undefined],
            ['accentApplied', false],
            ['onboardingVisible', true],
            ['recoveryVisible', true],
            ['scenario', 'upgrade-v193-seq0-ledger'],
        ];
        for (const [field, value] of surfaceBreaks) {
            expect(events.successfulUpgradeStudyEvent({ ...study, [field]: value }), field).toBe(false);
            expect(events.successfulUpgradeReaderEvent({ ...reader, [field]: value }), field).toBe(false);
        }
        expect(events.successfulUpgradeStudyEvent({ ...study, durableUnchanged: false })).toBe(false);
        expect(events.successfulUpgradeStudyEvent({ ...study, settingsWriteObserved: true })).toBe(false);
        expect(events.successfulUpgradeStudyEvent({ ...study, settingsWriteObserved: undefined })).toBe(false);
        expect(events.successfulUpgradeStudyEvent({ ...study, surface: 'reader' })).toBe(false);
        expect(events.successfulUpgradeReaderEvent({ ...reader, surface: 'study' })).toBe(false);
        expect(events.successfulUpgradeReaderEvent({ ...reader, type: 'reader-ready' })).toBe(false);
        expect(events.upgradeReaderScenariosObserved([
            study,
            { ...reader, ok: false },
            reader,
        ])).toEqual(['upgrade-v193-unmarked']);

        const config = { settingsKey: CORPUS_SETTINGS_KEY, intentKey: CORPUS_INTENT_KEY, storagePrefix: 'usc_p_' };
        const settingsKey = `usc_p_${CORPUS_SETTINGS_KEY}`;
        const siteLanguageKey = 'usc_p_yomu:prefer-japanese-site-language:v1';
        const seed = { [settingsKey]: { theme: 'dark', nested: { a: 1, order: [1, 2] } }, [siteLanguageKey]: false };
        const { upgradeSeedUnchanged: unchanged, upgradeStorageChangeObserved: changed } = runtimeFunctions<{
            upgradeSeedUnchanged: (
                values: Record<string, unknown>,
                config: Record<string, unknown>,
                seed: Record<string, unknown>,
            ) => boolean;
            upgradeStorageChangeObserved: (
                changes: Record<string, unknown>,
                areaName: string,
                config: Record<string, unknown>,
                seed: Record<string, unknown>,
            ) => boolean;
        }>([
            'canonicalProbeValue',
            'probeValuesMatch',
            'studySettingsAuthorityKey',
            'upgradeSeedUnchanged',
            'upgradeStorageChangeObserved',
        ]);
        expect(unchanged({
            [siteLanguageKey]: false,
            [settingsKey]: { nested: { order: [1, 2], a: 1 }, theme: 'dark' },
            'firefox-settings-authority-smoke-unrelated': 'keep-unrelated-v1',
            'usc_p_yomu:study-cache': 1,
        }, config, seed)).toBe(true);
        for (const values of [
            { ...seed, [settingsKey]: { theme: 'dark', nested: { a: 1, order: [2, 1] } } },
            { ...seed, [settingsKey]: { ...seed[settingsKey], [COMMIT_FIELD]: 'read-adopted' } },
            { ...seed, [siteLanguageKey]: true },
            { [settingsKey]: seed[settingsKey] },
            { ...seed, [`usc_p_${CORPUS_INTENT_KEY}`]: { revision: 0, records: {} } },
            { ...seed, [`usc_p_yomu:state-slot:v1:reset:${CORPUS_SETTINGS_KEY}`]: {} },
            { ...seed, [CORPUS_SETTINGS_KEY]: seed[settingsKey] },
        ]) expect(unchanged(values, config, seed)).toBe(false);
        expect(changed({ [siteLanguageKey]: {} }, 'local', config, seed)).toBe(true);
        expect(changed({ [`usc_p_${CORPUS_INTENT_KEY}`]: {} }, 'local', config, seed)).toBe(true);
        expect(changed({ 'usc_p_yomu:study-cache': {} }, 'local', config, seed)).toBe(false);
        expect(changed({ [settingsKey]: {} }, 'sync', config, seed)).toBe(false);

        const writeObserved = runtimeFunction<(
            config: Record<string, unknown>,
            writes: { observed: boolean },
        ) => boolean>('upgradeSettingsWriteObserved');
        const countKey = 'firefoxSettingsAuthoritySmokeUpgradeTestWrites';
        expect(writeObserved({ settingsWriteCountKey: countKey }, { observed: false })).toBe(false);
        expect(writeObserved({ settingsWriteCountKey: countKey }, { observed: true })).toBe(true);
        Reflect.set(globalThis, countKey, 1);
        expect(writeObserved({ settingsWriteCountKey: countKey }, { observed: false })).toBe(true);
        Reflect.deleteProperty(globalThis, countKey);
    });

    it('reads what the booted surface applied and treats either recovery surface as a failure', () => {
        const { appliedSettingsObservation } = runtimeFunctions<{
            appliedSettingsObservation: (expected: Record<string, unknown>) => Record<string, unknown>;
        }>(['finiteSettingNumber', 'initialSetupVisible', 'settingsRecoveryVisible', 'appliedSettingsObservation']);
        const root = document.documentElement;
        root.classList.add('jpdb-reader-theme-dark');
        root.style.setProperty('--jpdb-reader-accent', '#5EA780', 'important');
        root.style.setProperty('--subtitle-font-size-target', '40px');
        document.body.innerHTML = '<main></main>';
        try {
            expect(appliedSettingsObservation({ accentColor: '#5ea780' })).toEqual({
                darkClass: true,
                appliedSubtitleFontSize: 40,
                accentApplied: true,
                onboardingVisible: false,
                recoveryVisible: false,
            });
            expect(appliedSettingsObservation({ accentColor: '#2563eb' })).toMatchObject({ accentApplied: false });
            document.body.innerHTML = '<section data-extension-settings-recovery="blocked"></section>';
            expect(appliedSettingsObservation({ accentColor: '#5ea780' })).toMatchObject({ recoveryVisible: true });
            document.body.innerHTML = '<button data-yomu-settings-recovery="unavailable"></button>';
            expect(appliedSettingsObservation({ accentColor: '#5ea780' })).toMatchObject({ recoveryVisible: true });
            root.style.removeProperty('--subtitle-font-size-target');
            expect(appliedSettingsObservation({ accentColor: '#5ea780' }).appliedSubtitleFontSize).toBeUndefined();
        } finally {
            root.classList.remove('jpdb-reader-theme-dark');
            root.style.removeProperty('--jpdb-reader-accent');
            root.style.removeProperty('--subtitle-font-size-target');
            document.body.innerHTML = '';
        }
    });

    it('runs the upgrade scenarios after the authority checks, each with its own closed Reader tab', async () => {
        const order: string[] = [];
        const advance = runtimeFunctionWithBindings<(
            config: Record<string, unknown>,
            scenario: string,
        ) => Promise<void>>('advanceAuthorityScenario', {
            sessionStorage: { setItem: (_key: string, value: string) => { order.push(value); } },
            browser: { storage: { local: { set: async () => undefined } } },
            location: { reload: () => undefined },
        });
        for (const scenario of [
            'raw-only',
            'prefixed-only',
            'divergent',
            'upgrade-v193-unmarked',
            'upgrade-v193-seq0-ledger',
        ]) await advance({ scenarioKey: 'scenario' }, scenario);
        expect(order).toEqual([
            'prefixed-only',
            'divergent',
            'upgrade-v193-unmarked',
            'upgrade-v193-seq0-ledger',
            'live',
        ]);
        const scenarioEnum = sourceSection('scenario: optionalEnum(value.scenario', ']),');
        expect(scenarioEnum).toContain("'upgrade-v193-unmarked'");
        expect(scenarioEnum).toContain("'upgrade-v193-seq0-ledger'");

        const observerCalls = calledFunctions('studyObserver');
        expect(observerCalls.indexOf('completeUpgradeScenario')).toBeGreaterThan(observerCalls.indexOf('waitForStudyBoot'));
        expect(observerCalls.indexOf('completeUpgradeScenario'))
            .toBeLessThan(observerCalls.indexOf('completeAuthorityScenario'));
        const proofCalls = calledFunctions('upgradeScenarioProof');
        expect(proofCalls.filter(call => call === 'waitForStableProof')).toHaveLength(2);
        expect(proofCalls.indexOf('bootUpgradeReader')).toBeGreaterThan(proofCalls.indexOf('waitForStableProof'));
        expect(proofCalls.indexOf('bootUpgradeReader')).toBeLessThan(proofCalls.lastIndexOf('waitForStableProof'));
        const readerCalls = calledFunctions('bootUpgradeReader');
        expect(readerCalls.indexOf('browser.tabs.create')).toBeLessThan(readerCalls.indexOf('browserWaitFor'));
        expect(readerCalls.indexOf('browserWaitFor')).toBeLessThan(readerCalls.indexOf('browser.tabs.remove'));
        expect(referencedIdentifiers('bootUpgradeReader')).toContain('upgradeReaderScenarios');
        expect(referencedIdentifiers('serveProbeState')).toContain('upgradeReaderScenariosObserved');
        expect(calledFunctions('completeUpgradeScenario')).toEqual(expect.arrayContaining([
            'recordUpgradeStorageWrites',
            'upgradeScenarioProof',
            'context.post',
            'advanceAuthorityScenario',
        ]));
        expect(calledFunctions('recordUpgradeStorageWrites')).toContain('browser.storage.onChanged.addListener');

        const contentCalls = calledFunctions('contentProbe');
        const readyPost = contentCalls.indexOf('context.post');
        expect(contentCalls.indexOf('completeUpgradeReaderScenario')).toBeGreaterThanOrEqual(0);
        expect(contentCalls.indexOf('completeUpgradeReaderScenario')).toBeLessThan(readyPost);
        const upgradeReaderCalls = calledFunctions('completeUpgradeReaderScenario');
        expect(upgradeReaderCalls).toEqual(expect.arrayContaining(['waitForStableProof', 'context.post']));
        expect(calledFunctions('upgradeReaderProof')).toContain('readerSurfaceInitialized');

        const instrument = sourceSection('async function instrumentDisposablePackage', 'function injectedScript');
        expect(sourceSection('const bootstrapConfig = {', '};')).toContain('settingsWriteCountKey');
        expect(sourceSection('const observerConfig = {', '};')).toContain('upgradeScenarios: options.upgradeExpectations');
        expect(sourceSection('const observerConfig = {', '};')).toContain('settingsWriteCountKey');
        expect(sourceSection('const contentConfig = {', '};')).toContain('upgradeScenarios: options.upgradeExpectations');
        expect(instrument).toContain('scenarioSeeds(options.storagePrefix, options.upgradeCorpus)');
    });

    it('injects every top-level helper each browser entrypoint reaches', () => {
        const injections: Array<{ entry: string; helpers: string[] }> = [];
        const visit = (node: ts.Node): void => {
            if (ts.isCallExpression(node) && expressionPath(node.expression) === 'injectedScript') {
                const [, entry, helpers] = node.arguments;
                injections.push({ entry: (entry as ts.Identifier).text, helpers: injectedHelperNames(helpers!) });
            }
            ts.forEachChild(node, visit);
        };
        visit(functionDeclaration('instrumentDisposablePackage'));
        expect(injections.map(injection => injection.entry)).toEqual(['browserBootstrap', 'studyObserver', 'contentProbe']);
        for (const { entry, helpers } of injections) {
            const declared = new Set([entry, ...helpers]);
            expect(helpers.length, entry).toBe(declared.size - 1);
            const missing: string[] = [];
            const visited = new Set<string>();
            const reach = (name: string): void => {
                if (visited.has(name)) return;
                visited.add(name);
                for (const reached of reachedTopLevelFunctions(name)) {
                    if (declared.has(reached)) reach(reached);
                    else missing.push(`${name} -> ${reached}`);
                }
            };
            reach(entry);
            expect(missing, entry).toEqual([]);
        }
        expect(reachedTopLevelFunctions('studyObserver')).toContain('completeUpgradeScenario');
        expect(reachedTopLevelFunctions('contentProbe')).toContain('completeUpgradeReaderScenario');
        expect(reachedTopLevelFunctions('guardedDisposableSetValue')).toContain('noteDisposableSettingsWrite');
    });
});
