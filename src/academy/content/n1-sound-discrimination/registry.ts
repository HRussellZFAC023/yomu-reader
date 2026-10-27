import { createN1SoundDiscriminationPackage } from './package';
import { validateN1SoundDiscrimination } from './plugin';
import type { N1SoundDiscriminationPackage } from './types';

const packageRecord = createN1SoundDiscriminationPackage();
const validationIssues = validateN1SoundDiscrimination(packageRecord.activity);
if (validationIssues.length) {
    throw new TypeError(`Invalid N1 sound-discrimination package: ${validationIssues.map(issue => issue.path).join(', ')}`);
}

export const N1_SOUND_DISCRIMINATION_PACKAGES: readonly N1SoundDiscriminationPackage[] = Object.freeze([packageRecord]);
