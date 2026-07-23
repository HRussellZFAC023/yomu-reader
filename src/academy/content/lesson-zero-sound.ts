import { ACADEMY_ASSETS } from '../assets';
import type {
    LessonZeroSoundDefinition,
    LessonZeroSoundLineId,
    LessonZeroSoundSpeakerId,
} from '../domain/lesson-zero-sound-session';
import type { LessonZeroContent } from './lesson-zero';

export const LESSON_ZERO_SOUND_ACTIVITY_ID = 'activity:lesson-zero-sound-input' as const;

const SPEAKERS: Readonly<Record<LessonZeroSoundSpeakerId, {
    readonly displayName: string;
    readonly katakanaName: string;
    readonly portraitUrl?: string;
}>> = {
    xingyu: {
        displayName: 'Xingyu',
        katakanaName: 'シンユ',
        portraitUrl: ACADEMY_ASSETS.xingyuListening,
    },
    mika: {
        displayName: 'Mika',
        katakanaName: 'ミカ',
        portraitUrl: ACADEMY_ASSETS.mikaSound,
    },
};

export function createLessonZeroSoundDefinition(
    content: LessonZeroContent,
): LessonZeroSoundDefinition {
    const activity = content.lesson.activities.find(candidate => candidate.id === LESSON_ZERO_SOUND_ACTIVITY_ID);
    if (!activity || activity.inputScriptId !== 'input:lesson-zero-sound-hosts') {
        throw new TypeError('Lesson Zero is missing its sound-first introduction activity.');
    }
    const script = content.lesson.inputScripts.find(candidate => candidate.id === activity.inputScriptId);
    if (!script || script.kind !== 'dialogue' || script.lines.length !== 2) {
        throw new TypeError('Lesson Zero sound input needs exactly two authored voices.');
    }
    const assetById = new Map(content.lesson.audioAssets.map(asset => [asset.id, asset]));
    const lines = script.lines.map(line => {
        if (!isSoundLineId(line.id) || !isSoundSpeakerId(line.speakerId) || !line.audioAssetId) {
            throw new TypeError(`Sound line ${line.id} lacks a canonical speaker or line-level audio binding.`);
        }
        const audio = assetById.get(line.audioAssetId);
        if (!audio || audio.state !== 'ready' || audio.verifiedPairing !== true || !audio.runtimeUrl) {
            throw new TypeError(`Sound line ${line.id} is not paired with release-ready audio.`);
        }
        return {
            id: line.id,
            speakerId: line.speakerId,
            japanese: line.japanese,
            reading: line.reading,
            meaning: { en: line.english, ja: line.japanese },
            audioUrl: audio.runtimeUrl,
        };
    });
    const speakerIds = lines.map(line => line.speakerId);
    if (new Set(speakerIds).size !== 2) {
        throw new TypeError('Lesson Zero sound input must use two different voices.');
    }
    return {
        schemaVersion: 1,
        id: 'session:lesson-zero-sound-input',
        activityId: LESSON_ZERO_SOUND_ACTIVITY_ID,
        contentRevision: content.lesson.contentVersion,
        conceptIds: activity.conceptIds,
        lines,
        speakers: speakerIds.map(id => ({ id, ...SPEAKERS[id] })),
    };
}

function isSoundLineId(value: string): value is LessonZeroSoundLineId {
    return value === 'line:lesson-zero-sound-xingyu' || value === 'line:lesson-zero-sound-mika';
}

function isSoundSpeakerId(value: string): value is LessonZeroSoundSpeakerId {
    return value === 'xingyu' || value === 'mika';
}
