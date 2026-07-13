import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type { LearnerProjection } from '../domain/learner-record';
import type { AcademyCheckpoint, AcademyCheckpointUpdate, AcademyRoute } from '../persistence/indexeddb';
import type { AcademyShell } from '../ui/shell';

export interface AcademyRouteContext {
    readonly language: AcademyLanguage;
    readonly checkpoint: AcademyCheckpoint;
    readonly projection: LearnerProjection;
    readonly shell: AcademyShell;
    go(route: AcademyRoute, update?: AcademyCheckpointUpdate): Promise<void>;
    back(): Promise<void>;
}

export interface AcademyRouteFlow {
    render(route: AcademyRoute, context: AcademyRouteContext): Promise<boolean>;
}
