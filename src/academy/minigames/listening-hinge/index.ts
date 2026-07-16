import './style.css';
import type { ActivityPlugin } from '../../domain/activity-runtime';
import { gradeListeningHinge, listeningHingeReviewSeeds, validateListeningHinge } from './engine';
import { LISTENING_HINGE_KIND, type ListeningHingeModel, type ListeningHingeResponse } from './manifest';
import { renderListeningHinge } from './view';
export const listeningHingePlugin: ActivityPlugin<ListeningHingeModel, ListeningHingeResponse> = { kind: LISTENING_HINGE_KIND, validate: validateListeningHinge, render: renderListeningHinge, grade: gradeListeningHinge, toReviewSeeds: listeningHingeReviewSeeds };
export * from './engine';
export * from './manifest';
