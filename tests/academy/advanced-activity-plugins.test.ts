import { describe, expect, it } from 'vitest';
import { N1_OPENING_SEQUENCE_PACKAGES } from '../../src/academy/content/n1-opening-sequence';
import { N1_SOUND_DISCRIMINATION_PACKAGES } from '../../src/academy/content/n1-sound-discrimination';
import { N1_CONTRAST_INFERENCE_PACKAGES } from '../../src/academy/content/n1-contrast-inference';
import { ADVANCED_IMMERSION_PACKAGES } from '../../src/academy/content/advanced-immersion';
import { N2_HOME_LIFE_OPENING_SEQUENCE } from '../../src/academy/content/n2-home-life-opening-sequence';
import { N2_EXTENSIVE_READING_PACKAGES } from '../../src/academy/content/n2-extensive-reading';
import { N2_POLICY_SCOPE_PACKAGES } from '../../src/academy/content/n2-policy-scope';
import { N3_SOURCE_OPENING_PACKAGE_IDS, createN3SourceOpeningPackage } from '../../src/academy/content/n3-source-opening/package';
import { N3_N4_SLEEP_BRIDGE_PACKAGES } from '../../src/academy/content/n3-n4-sleep-bridge';
import { N3_PET_HOUSING_PACKAGES } from '../../src/academy/content/n3-pet-housing';
import { ACADEMY_ACTIVITY_PLUGINS, createAcademyActivityRuntime } from '../../src/academy/minigames';

const advancedActivities = [
    ...N3_SOURCE_OPENING_PACKAGE_IDS.map(id => createN3SourceOpeningPackage(id)),
    ...N3_N4_SLEEP_BRIDGE_PACKAGES,
    ...N3_PET_HOUSING_PACKAGES,
    ...N2_HOME_LIFE_OPENING_SEQUENCE,
    ...N2_EXTENSIVE_READING_PACKAGES,
    ...N2_POLICY_SCOPE_PACKAGES,
    ...N1_OPENING_SEQUENCE_PACKAGES,
    ...N1_SOUND_DISCRIMINATION_PACKAGES,
    ...N1_CONTRAST_INFERENCE_PACKAGES,
    ...ADVANCED_IMMERSION_PACKAGES,
].map(packageRecord => packageRecord.activity);

describe('advanced activity plugin registration', () => {
    it('validates every advanced package through the shared runtime', () => {
        const runtime = createAcademyActivityRuntime();
        const registeredKinds = ACADEMY_ACTIVITY_PLUGINS.map(plugin => plugin.kind);

        expect(new Set(advancedActivities.map(activity => activity.id)).size).toBe(advancedActivities.length);
        expect(new Set(registeredKinds).size).toBe(registeredKinds.length);

        for (const activity of advancedActivities) {
            expect(registeredKinds).toContain(activity.kind);
            expect(runtime.validate(activity)).toEqual([]);
        }
    });
});
