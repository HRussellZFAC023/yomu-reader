export interface ProfileReplay {
    steps: Array<Record<string, any>>;
    mobileAmbient?: Record<string, any> | null;
    mobileStress?: Record<string, any> | null;
    [key: string]: any;
}

export function mergeScenarioFunctionProfiles(
    metricsReplay: ProfileReplay,
    cpuReplay: ProfileReplay,
    coverageReplay: ProfileReplay,
): ProfileReplay;

export function shouldRunUninstrumentedDiagnostics(
    profileMode: string,
    smokePreset: boolean,
): boolean;
