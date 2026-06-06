import { pitchClassNameForPattern } from '../pitch-accent';

export function getPitchClass(pitchAccent: string[], reading: string): string {
    return pitchAccent[0] ? pitchClassNameForPattern(pitchAccent[0], reading) : '';
}
