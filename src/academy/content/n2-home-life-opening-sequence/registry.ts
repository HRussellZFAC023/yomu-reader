import { N2_APARTMENT_MOVING_PACKAGES } from '../n2-apartment-moving';
import { N2_HOME_LIFE_READER_PACKAGES } from '../n2-home-life-reader';
import { N2_MOVING_COUPON_PACKAGES } from '../n2-moving-coupon';
import { N2_MOVING_PRIORITY_LISTENING_PACKAGES } from '../n2-moving-priority-listening';
import type { N2OpeningPackage } from '../n2-opening-kit';
import { N2_PPOI_IMPRESSION_PACKAGES } from '../n2-ppoi-impression';

export const N2_HOME_LIFE_OPENING_SEQUENCE: readonly N2OpeningPackage[] = Object.freeze([
    ...N2_APARTMENT_MOVING_PACKAGES,
    ...N2_PPOI_IMPRESSION_PACKAGES,
    ...N2_MOVING_COUPON_PACKAGES,
    ...N2_HOME_LIFE_READER_PACKAGES,
    ...N2_MOVING_PRIORITY_LISTENING_PACKAGES,
]);

validateSequence(N2_HOME_LIFE_OPENING_SEQUENCE);

export function resolveN2HomeLifeOpeningSequencePackage(id: string): N2OpeningPackage {
    const found = N2_HOME_LIFE_OPENING_SEQUENCE.find(candidate => candidate.id === id);
    if (!found) throw new TypeError(`Unknown N2 home-life opening-sequence package: ${id}`);
    return found;
}

function validateSequence(packages: readonly N2OpeningPackage[]): void {
    if (packages.length !== 5 || packages.some((record, index) => record.sequence.order !== index + 1)) {
        throw new TypeError('The N2 home-life opening sequence must contain five ordered packages.');
    }
    packages.forEach((record, index) => {
        const previous = packages[index - 1];
        const next = packages[index + 1];
        if (record.sequence.previousPackageId !== previous?.id || record.sequence.nextPackageId !== next?.id) {
            throw new TypeError(`Broken N2 home-life package link at ${record.id}.`);
        }
        if (previous && record.prerequisites[0]?.fromPackageId !== previous.id) {
            throw new TypeError(`Broken N2 home-life prerequisite at ${record.id}.`);
        }
    });
}
