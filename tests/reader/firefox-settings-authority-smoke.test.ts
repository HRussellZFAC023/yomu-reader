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
    const declarations = names.map(name => {
        const declaration = functionDeclaration(name);
        return SOURCE.slice(declaration.getStart(SOURCE_FILE), declaration.getEnd());
    }).join('\n');
    return Function(`"use strict"; ${declarations}; return { ${names.join(', ')} };`)() as T;
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
            'migration-raw-only',
            'migration-prefixed-only',
            'migration-divergent',
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
            failureToastVisible: true,
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
            'failureToastVisible',
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
        expect(calledFunctions('advanceMigrationScenario')).toContain('browser.storage.local.set');
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
        const guardedWrite = runtimeFunctionWithBindings<(
            config: Record<string, unknown>,
            realSetValue: (...args: unknown[]) => Promise<unknown>,
            key: string,
            value: unknown,
        ) => Promise<unknown>>('guardedDisposableSetValue', {
            sessionStorage: storage,
            settingsAuthorityWrite: (name: string) => name === 'settings',
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
        expect(referencedIdentifiers('storageFaultResult')).toEqual(expect.arrayContaining([
            'durableUnchanged',
            'importDisabled',
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
        };
        const intent = {
            revision: 8,
            records: {
                theme: { seq: 7, value: 'dark' },
                subtitleFontSize: { seq: 8, value: 37 },
            },
        };
        const matches = (values: Record<string, unknown>) =>
            physicalAuthorityPairMatches(values, 'SETTINGS', 'INTENT', settings, intent);
        expect(matches({ SETTINGS: settings, INTENT: intent })).toBe(true);
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

    it('requires complete SETTINGS and INTENT namespace pairs for every migration verdict', () => {
        const raw = runtimeFunction<(current: Record<string, unknown>, presence: Record<string, boolean>) => boolean>(
            'rawMigrationMatches',
        );
        const prefixed = runtimeFunction<typeof raw>('prefixedMigrationMatches');
        const divergent = runtimeFunction<typeof raw>('divergentMigrationMatches');
        const allPresent = { rawSettings: true, rawIntent: true, canonicalSettings: true, canonicalIntent: true };
        expect(raw({ theme: 'dark', subtitleFontSize: 47, sentinel: 'v1.9.2-raw-only' }, allPresent)).toBe(true);
        expect(prefixed(
            { theme: 'light', subtitleFontSize: 31, sentinel: 'v1.9.2-canonical' },
            { ...allPresent, rawSettings: false, rawIntent: false },
        )).toBe(true);
        expect(divergent(
            { theme: 'light', subtitleFontSize: 31, sentinel: 'v1.9.2-divergent-canonical' },
            allPresent,
        )).toBe(true);
        for (const field of Object.keys(allPresent)) {
            expect(raw(
                { theme: 'dark', subtitleFontSize: 47, sentinel: 'v1.9.2-raw-only' },
                { ...allPresent, [field]: false },
            )).toBe(false);
        }

        const { migrationAuthorityMatches, successfulMigrationEvent } = runtimeFunctions<{
            migrationAuthorityMatches: (
                scenario: string,
                values: Record<string, unknown>,
                config: Record<string, unknown>,
            ) => boolean;
            successfulMigrationEvent: (event: Record<string, unknown>) => boolean;
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
            'migrationAuthorityPlan',
            'migrationAuthorityMatches',
            'successfulMigrationEvent',
        ]);
        const prefix = 'usc_test_';
        const settingsKey = 'SETTINGS';
        const intentKey = 'INTENT';
        const rawSettings = { theme: 'dark', subtitleFontSize: 47, accentColor: '#111111' };
        const rawIntent = { revision: 2, records: { theme: { seq: 1, value: 'dark' } } };
        const canonicalSettings = { theme: 'light', subtitleFontSize: 31, accentColor: '#222222' };
        const canonicalIntent = { revision: 4, records: { theme: { seq: 3, value: 'light' } } };
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
            [`${prefix}${settingsKey}`]: rawSettings,
            [`${prefix}${intentKey}`]: rawIntent,
        };
        expect(migrationAuthorityMatches('raw-only', rawPhysical, config)).toBe(true);
        expect(migrationAuthorityMatches('raw-only', {
            ...rawPhysical,
            [`${prefix}${settingsKey}`]: { ...rawSettings, accentColor: '#ffffff' },
        }, config)).toBe(false);
        expect(migrationAuthorityMatches('raw-only', {
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
        expect(migrationAuthorityMatches('prefixed-only', config.scenarios['prefixed-only'], config)).toBe(true);
        expect(migrationAuthorityMatches('divergent', config.scenarios.divergent, config)).toBe(true);
        const missingIntent = { ...config.scenarios.divergent };
        Reflect.deleteProperty(missingIntent, `${prefix}${intentKey}`);
        expect(migrationAuthorityMatches('divergent', missingIntent, config)).toBe(false);

        expect(successfulMigrationEvent({ surface: 'study', ok: true, authorityPairValid: true })).toBe(true);
        expect(successfulMigrationEvent({ surface: 'study', ok: true, authorityPairValid: false })).toBe(false);
        expect(calledFunctions('completeMigrationScenario')).toContain('waitForMigrationScenarioProof');
        expect(calledFunctions('migrationScenarioProof')).toEqual(expect.arrayContaining([
            'browser.storage.local.get',
            'migrationPhysicalObservation',
            'migrationAuthorityMatches',
            'darkThemeClass',
        ]));
        expect(calledFunctions('migrationPhysicalObservation')).toContain('authorityPayloadPair');
        expect(calledFunctions('waitForMigrationScenarioProof').filter(call => call === 'migrationScenarioProof'))
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
});
