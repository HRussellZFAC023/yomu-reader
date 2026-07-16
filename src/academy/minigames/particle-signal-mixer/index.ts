import './style.css';
import type { ActivityPlugin } from '../../domain/activity-runtime';
import {
    gradeParticleSignalMixer,
    particleSignalMixerReviewSeeds,
    validateParticleSignalMixer,
} from './engine';
import {
    PARTICLE_SIGNAL_MIXER_KIND,
    type ParticleSignalMixerModel,
    type ParticleSignalMixerResponse,
} from './manifest';
import { renderParticleSignalMixer } from './view';

export const particleSignalMixerPlugin: ActivityPlugin<ParticleSignalMixerModel, ParticleSignalMixerResponse> = {
    kind: PARTICLE_SIGNAL_MIXER_KIND,
    validate: validateParticleSignalMixer,
    render: renderParticleSignalMixer,
    grade: gradeParticleSignalMixer,
    toReviewSeeds: particleSignalMixerReviewSeeds,
};

export * from './engine';
export * from './manifest';
