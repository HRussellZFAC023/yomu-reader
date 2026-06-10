import { contextPitchPattern, pitchClassNameForPattern } from '../lookup/pitch-accent';

export function getPitchClass(pitchAccent: string[], reading: string): string {
    const pattern = contextPitchPattern(pitchAccent, reading);
    return pattern ? pitchClassNameForPattern(pattern, reading) : '';
}
