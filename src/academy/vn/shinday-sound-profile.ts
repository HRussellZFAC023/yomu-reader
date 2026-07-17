import {
    getAcademySfxCue,
    SHINDAY_SFX_ASSETS,
    SHINDAY_SFX_CATALOG,
    type AcademySemanticSfxCue,
} from '../audio/sfx-catalog';
import type {
    VnFixedSoundCaption,
    VnGapSoundCue,
    VnMappedSoundCue,
    VnMusicCue,
    VnPlacePresentationTreatment,
    VnSoundCue,
    VnSoundProvenance,
} from './performance-contract';

export type ShindayVnSoundId =
    | 'scene.enter'
    | 'scene.exit'
    | 'focus.move'
    | 'choice.confirm'
    | 'feedback.correct'
    | 'feedback.error'
    | 'reward.stamp'
    | 'reward.earned'
    | 'object.menu-page'
    | 'object.radio-tune'
    | 'object.register-tick'
    | 'object.sketch-stroke'
    | 'transit.train-doors-open'
    | 'transit.train-doors-close'
    | 'transit.announcement'
    | 'ambience.rain'
    | 'ambience.cafe'
    | 'ambience.library';

export type ShindayVnAmbienceId = Extract<ShindayVnSoundId, `ambience.${string}`>;

export const SHINDAY_VN_SOUND_CUES = Object.freeze({
    'scene.enter': mapped(
        'scene.enter', 'vn.advance', 0.78,
        caption('effect', '[Enter scene]', '[場面に入る]'),
    ),
    'scene.exit': mapped(
        'scene.exit', 'vn.choice.cancel', 0.85,
        caption('effect', '[Leave scene]', '[場面を出る]'),
    ),
    'focus.move': mapped(
        'focus.move', 'vn.choice.move', 0.9,
        caption('effect', '[Focus moves]', '[選択を移動]'),
    ),
    'choice.confirm': mapped(
        'choice.confirm', 'vn.choice.confirm', 0.78,
        caption('effect', '[Choice confirmed]', '[選択を決定]'),
    ),
    'feedback.correct': mapped(
        'feedback.correct', 'worksheet.success', 0.58,
        caption('effect', '[Correct]', '[正解]'),
    ),
    'feedback.error': mapped(
        'feedback.error', 'worksheet.repair', 0.62,
        caption('effect', '[Try again]', '[もう一度]'),
    ),
    'reward.stamp': mapped(
        'reward.stamp', 'worksheet.hanamaru', 0.72,
        caption('effect', '[Stamp earned]', '[スタンプ獲得]'),
    ),
    'reward.earned': mapped(
        'reward.earned', 'ceremony.bond.unlock', 0.48,
        caption('effect', '[Reward earned]', '[ごほうび獲得]'),
    ),
    'object.menu-page': mapped(
        'object.menu-page', 'travel.transition', 0.74,
        caption('effect', '[Menu page turns]', '[メニューをめくる]'),
    ),
    'object.radio-tune': mapped(
        'object.radio-tune', 'minigame.radio.tune', 0.74,
        caption('effect', '[Radio tuned]', '[ラジオを調整]'),
    ),
    'object.register-tick': mapped(
        'object.register-tick', 'minigame.score.tick', 0.9,
        caption('effect', '[Register counts]', '[レジで数える]'),
    ),
    'object.sketch-stroke': mapped(
        'object.sketch-stroke', 'minigame.doodle.stroke', 0.86,
        caption('effect', '[Paper impression]', '[紙に色を重ねる]'),
    ),
    'transit.train-doors-open': catalogGap(
        'transit.train-doors-open', 'door.open',
        caption('effect', '[Train doors open]', '[電車のドアが開く]'),
    ),
    'transit.train-doors-close': catalogGap(
        'transit.train-doors-close', 'door.close',
        caption('effect', '[Train doors close]', '[電車のドアが閉まる]'),
    ),
    'transit.announcement': gap(
        'transit.announcement',
        'No transcripted, speaker-identified station announcement is hash-pinned in the delivered Shinday release set.',
        { mode: 'authored-required', kind: 'speech' },
    ),
    'ambience.rain': gap(
        'ambience.rain',
        'No rain recording is hash-pinned in the delivered Shinday release set; the visual scene and music theme remain valid without a loop.',
        caption('ambience', '[Rain outside]', '[外の雨音]'),
    ),
    'ambience.cafe': gap(
        'ambience.cafe',
        'No cafe room-tone recording is hash-pinned in the delivered Shinday release set; silence is preferred to a synthetic loop.',
        caption('ambience', '[Cafe ambience]', '[カフェの環境音]'),
    ),
    'ambience.library': gap(
        'ambience.library',
        'No library room-tone recording is hash-pinned in the delivered Shinday release set; silence is preferred to a synthetic loop.',
        caption('ambience', '[Quiet library ambience]', '[静かな図書室の環境音]'),
    ),
} satisfies Readonly<Record<ShindayVnSoundId, VnSoundCue>>);

interface ShindayVnAudioTreatment {
    readonly music: VnMusicCue;
    readonly ambience: ShindayVnAmbienceId;
    readonly unavailableAmbienceFallback: 'theme-or-silence';
    readonly continuousSynthFallback: false;
}

/** Audio treatments only. World place identity and navigation remain host-owned. */
export const SHINDAY_VN_AUDIO_TREATMENTS = Object.freeze({
    rain: treatment('campus.evening', 'ambience.rain'),
    cafe: treatment('cafe.social', 'ambience.cafe'),
    library: treatment('library.quiet', 'ambience.library'),
} satisfies Readonly<Record<'rain' | 'cafe' | 'library', ShindayVnAudioTreatment>>);

export function shindayVnSound(id: ShindayVnSoundId): VnSoundCue {
    return SHINDAY_VN_SOUND_CUES[id];
}

/** Converts a soundscape choice into engine-owned presentation fields only. */
export function shindayVnPlaceAudio(
    treatmentId: keyof typeof SHINDAY_VN_AUDIO_TREATMENTS,
): Pick<VnPlacePresentationTreatment, 'music' | 'sounds'> {
    const treatment = SHINDAY_VN_AUDIO_TREATMENTS[treatmentId];
    return Object.freeze({
        music: treatment.music,
        sounds: Object.freeze([shindayVnSound(treatment.ambience)]),
    });
}

function mapped(
    id: ShindayVnSoundId,
    academyCue: AcademySemanticSfxCue,
    duckMusicTo: number,
    fixedCaption: VnFixedSoundCaption,
): VnMappedSoundCue {
    const definition = getAcademySfxCue(academyCue);
    if (definition.status !== 'mapped') throw new Error(`Shinday VN cue ${id} cannot use unmapped cue ${academyCue}.`);
    const asset = SHINDAY_SFX_ASSETS[definition.assetId];
    return Object.freeze({
        id,
        status: 'mapped',
        sfx: definition.directorCue,
        durationMs: Math.ceil(asset.durationSeconds * 1_000),
        duckMusicTo,
        caption: fixedCaption,
        reducedMotion: 'same-audio',
        provenance: provenance({
            assetId: definition.assetId,
            sourceRelativePath: asset.sourceRelativePath,
            deliveryKey: definition.deliveryKey,
            sha256: asset.sha256,
        }),
    });
}

function catalogGap(
    id: ShindayVnSoundId,
    academyCue: AcademySemanticSfxCue,
    fixedCaption: VnFixedSoundCaption,
): VnGapSoundCue {
    const definition = getAcademySfxCue(academyCue);
    if (definition.status !== 'gap') throw new Error(`Shinday VN gap ${id} unexpectedly resolves to audio.`);
    return gap(id, definition.reason, fixedCaption);
}

function gap(
    id: ShindayVnSoundId,
    reason: string,
    soundCaption: VnGapSoundCue['caption'],
): VnGapSoundCue {
    return Object.freeze({
        id,
        status: 'gap',
        reason,
        fallback: 'silence',
        caption: soundCaption,
        reducedMotion: 'same-audio',
        provenance: provenance(),
    });
}

function caption(
    kind: VnFixedSoundCaption['kind'],
    en: string,
    ja: string,
): VnFixedSoundCaption {
    return Object.freeze({ mode: 'fixed', kind, text: Object.freeze({ en, ja }), announce: false });
}

function provenance(asset: Partial<VnSoundProvenance> = {}): VnSoundProvenance {
    return Object.freeze({
        collection: SHINDAY_SFX_CATALOG.provenance.collection,
        sourceRepository: SHINDAY_SFX_CATALOG.provenance.sourceRepository,
        sourceRevision: SHINDAY_SFX_CATALOG.provenance.sourceRevision,
        rightsId: SHINDAY_SFX_CATALOG.provenance.rightsId,
        evidence: SHINDAY_SFX_CATALOG.provenance.evidence,
        ...asset,
    });
}

function treatment(theme: VnMusicCue['theme'], ambience: ShindayVnAmbienceId): ShindayVnAudioTreatment {
    return Object.freeze({
        music: Object.freeze({ theme, transition: 'crossfade' as const }),
        ambience,
        unavailableAmbienceFallback: 'theme-or-silence',
        continuousSynthFallback: false,
    });
}
