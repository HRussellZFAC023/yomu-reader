import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type { LearnerProjection } from '../domain/learner-record';
import type { AcademyCheckpoint, AcademyCheckpointUpdate, AcademyRoute } from '../persistence/indexeddb';
import type { AcademyRouteFrame } from './route-history';
import type { AcademyShell } from '../ui/shell';

export interface AcademyRouteContext {
    readonly language: AcademyLanguage;
    readonly checkpoint: AcademyCheckpoint;
    readonly projection: LearnerProjection;
    readonly shell: AcademyShell;
    go(route: AcademyRoute, update?: AcademyCheckpointUpdate): Promise<void>;
    back(): Promise<void>;
    /** Restore a prior route frame, removing transient routes created for the completed flow. */
    returnTo?(destination: AcademyRouteFrame): Promise<void>;
    /** Persist route-local resume state without adding history or remounting the current screen. */
    save?(update: AcademyCheckpointUpdate): Promise<void>;
}

export interface AcademyRouteFlow {
    render(route: AcademyRoute, context: AcademyRouteContext): Promise<boolean>;
}
