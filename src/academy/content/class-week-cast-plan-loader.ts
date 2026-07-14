import { validateClassWeekCastPlan, type ClassWeekCastPlan } from './class-week-cast-plan';

const CLASS_WEEK_CAST_PLAN_URL = '/academy/content/curriculum/class-week-cast.v1.json';

let defaultLoad: Promise<ClassWeekCastPlan> | null = null;

/** Load the planning-only 73-week class path without promoting it to playable content. */
export function loadClassWeekCastPlan(fetcher: typeof fetch = fetch): Promise<ClassWeekCastPlan> {
    if (fetcher !== fetch) return load(fetcher);
    defaultLoad ??= load(fetcher).catch(error => {
        defaultLoad = null;
        throw error;
    });
    return defaultLoad;
}

async function load(fetcher: typeof fetch): Promise<ClassWeekCastPlan> {
    const response = await fetcher(CLASS_WEEK_CAST_PLAN_URL);
    if (!response.ok) throw new Error(`Could not load the class path (${response.status}).`);
    return validateClassWeekCastPlan(await response.json());
}
