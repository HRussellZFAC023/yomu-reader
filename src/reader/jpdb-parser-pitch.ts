import { countMorae, normalizePitchPatternForReading, pitchLevels as readPitchLevels } from './pitch-accent';

export function getPitchClass(pitchAccent: string[], reading: string): string {
    const levels = pitchLevelsForReading(pitchAccent, reading);
    if (levels.length < 2) return '';
    return classifyPitchProfile({
        rises: countPitchTransitions(levels, 'L', 'H'),
        drops: countPitchTransitions(levels, 'H', 'L'),
        dropAt: levels.findIndex((level, index) => index > 0 && levels[index - 1] === 'H' && level === 'L'),
        startsLow: levels[0] === 'L',
        startsHigh: levels[0] === 'H',
        endsLow: levels[levels.length - 1] === 'L',
        moraCount: countMorae(reading),
    });
}

interface PitchProfile {
    rises: number;
    drops: number;
    dropAt: number;
    startsLow: boolean;
    startsHigh: boolean;
    endsLow: boolean;
    moraCount: number;
}

const PITCH_PROFILE_CLASSIFIERS: Array<[string, (profile: PitchProfile) => boolean]> = [
    ['atamadaka', isAtamadaka],
    ['odaka', isOdaka],
    ['heiban', isHeiban],
    ['nakadaka', isNakadaka],
    ['kifuku', isKifuku],
];

function pitchLevelsForReading(pitchAccent: string[], reading: string): string[] {
    const pattern = pitchAccent[0] ? normalizePitchPatternForReading(pitchAccent[0], reading) : '';
    return pattern ? readPitchLevels(pattern) : [];
}

function classifyPitchProfile(profile: PitchProfile): string {
    return PITCH_PROFILE_CLASSIFIERS.find(([, matches]) => matches(profile))?.[0] ?? '';
}

function isAtamadaka(profile: PitchProfile): boolean {
    return profile.startsHigh && profile.drops === 1;
}

function isOdaka(profile: PitchProfile): boolean {
    return Boolean(profile.moraCount && profile.startsLow && profile.dropAt === profile.moraCount);
}

function isHeiban(profile: PitchProfile): boolean {
    return profile.startsLow && profile.rises === 1 && !profile.endsLow;
}

function isNakadaka(profile: PitchProfile): boolean {
    return profile.startsLow && profile.rises === 1 && profile.endsLow;
}

function isKifuku(profile: PitchProfile): boolean {
    return profile.rises > 1 || profile.drops > 1;
}

function countPitchTransitions(levels: string[], from: string, to: string): number {
    let count = 0;
    for (let index = 1; index < levels.length; index++) {
        if (levels[index - 1] === from && levels[index] === to) count++;
    }
    return count;
}
