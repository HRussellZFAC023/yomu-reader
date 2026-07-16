import type { AudioDirectorControl, SfxCue } from './types';

export type AcademySfxDomain =
    | 'vn'
    | 'speaker'
    | 'door'
    | 'travel'
    | 'worksheet'
    | 'minigame'
    | 'ceremony';

export interface VerifiedShindaySfxAsset {
    readonly sourceRelativePath: string;
    readonly deliveryKey: string;
    readonly contentType: 'audio/wav';
    readonly bytes: number;
    readonly durationSeconds: number;
    readonly sha256: string;
    /** Existing AudioDirector manifest bindings that deliver this exact object. */
    readonly directorCues: readonly SfxCue[];
}

export const SHINDAY_SFX_ASSETS = {
    'menu-cursor-move': {
        sourceRelativePath: 'menu sounds/menu cursor move.wav',
        deliveryKey: 'media/audio/v1/shinday/menu-cursor-move.wav',
        contentType: 'audio/wav', bytes: 26136, durationSeconds: 0.591655,
        sha256: '4dd834120f6843422091e7ec29141420b6ed34513b83df486b0008524941754b',
        directorCues: ['menu.move'],
    },
    'menu-option-select': {
        sourceRelativePath: 'menu sounds/menu option select.wav',
        deliveryKey: 'media/audio/v1/shinday/menu-option-select.wav',
        contentType: 'audio/wav', bytes: 41240, durationSeconds: 0.93415,
        sha256: '89a09620d3144f1dc52937cbe823f2172e61fb896f54ea0c6b0228f65ae0e63f',
        directorCues: ['menu.confirm'],
    },
    'popup-close': {
        sourceRelativePath: 'menu sounds/pop-up close.wav',
        deliveryKey: 'media/audio/v1/shinday/popup-close.wav',
        contentType: 'audio/wav', bytes: 14176, durationSeconds: 0.320454,
        sha256: '8e49f9226da87c3f3544963589603ee7e5df07366ad0c443f9d2bdcc5d2e88d9',
        directorCues: ['menu.cancel'],
    },
    unavailable: {
        sourceRelativePath: 'menu sounds/unavailable.wav',
        deliveryKey: 'media/audio/v1/shinday/unavailable.wav',
        contentType: 'audio/wav', bytes: 14572, durationSeconds: 0.329433,
        sha256: '254614cef31bb968acabe3f66e2f99feef13092fcb46e9d1335d0fd1bc8a935e',
        directorCues: ['action.unavailable'],
    },
    'menu-change': {
        sourceRelativePath: 'menu sounds/menu change.wav',
        deliveryKey: 'media/audio/v1/shinday/menu-change.wav',
        contentType: 'audio/wav', bytes: 44588, durationSeconds: 1.010068,
        sha256: '6ef55475c7cdd3b24a9d5974cddd21052d1d069d2208d47ca86c47ffd3f4e18f',
        directorCues: ['scene.advance'],
    },
    'module-change-1': {
        sourceRelativePath: 'menu sounds/module change 1.wav',
        deliveryKey: 'media/audio/v1/shinday/module-change-1.wav',
        contentType: 'audio/wav', bytes: 130584, durationSeconds: 2.960091,
        sha256: 'cf7bd1bcee2dcb0c634b38dddf2eb1ecdb203105e2cf193383dedb7ac6ce2f03',
        directorCues: ['page.turn'],
    },
    'module-change-2': {
        sourceRelativePath: 'menu sounds/module change 2.wav',
        deliveryKey: 'media/audio/v1/shinday/module-change-2.wav',
        contentType: 'audio/wav', bytes: 132652, durationSeconds: 3.006984,
        sha256: '52fa877fbc0324e1cae47594bed9ff70500a8a35ef6d09a4b003e589347bfcf0',
        directorCues: ['bond.unlock', 'bond.rank'],
    },
    'result-clear': {
        sourceRelativePath: 'menu sounds/result (clear).wav',
        deliveryKey: 'media/audio/v1/shinday/result-clear.wav',
        contentType: 'audio/wav', bytes: 114220, durationSeconds: 2.589025,
        sha256: '49d1916a186f2ce97e3c8a981f5996c89cc6b0b16a79cde9afebd06547347345',
        directorCues: ['feedback.correct', 'doodle.check'],
    },
    'result-not-clear': {
        sourceRelativePath: 'menu sounds/result (not clear).wav',
        deliveryKey: 'media/audio/v1/shinday/result-not-clear.wav',
        contentType: 'audio/wav', bytes: 78452, durationSeconds: 1.777959,
        sha256: 'b38172ad3e43fc177cb2bb230ccb4e696b27f8efca2ee1fd65229d67bc802ca7',
        directorCues: ['feedback.repair'],
    },
    'score-tally': {
        sourceRelativePath: 'menu sounds/score tally.wav',
        deliveryKey: 'media/audio/v1/shinday/score-tally.wav',
        contentType: 'audio/wav', bytes: 4434, durationSeconds: 0.099546,
        sha256: 'cc14e4839d1bc8d9b73e69e3dd49061c41a0df64f64eb08a1c9ff1f007aa608d',
        directorCues: ['feedback.hanamaru'],
    },
    camera: {
        sourceRelativePath: 'other sounds/camera.wav',
        deliveryKey: 'media/audio/v1/shinday/camera.wav',
        contentType: 'audio/wav', bytes: 2882, durationSeconds: 0.128707,
        sha256: 'c4048ea941835c2012feaa346dfb378d5f9050e84a8ebc54f88cdd8620bb41ef',
        directorCues: ['camera.capture'],
    },
    clap: {
        sourceRelativePath: 'other sounds/clap.wav',
        deliveryKey: 'media/audio/v1/shinday/clap.wav',
        contentType: 'audio/wav', bytes: 5654, durationSeconds: 0.127211,
        sha256: 'ca9b0dcc490bed545516ca5832795680f6c565ee4273831dea71e107a421e10b',
        directorCues: ['chapter.complete'],
    },
    click: {
        sourceRelativePath: 'other sounds/click.wav',
        deliveryKey: 'media/audio/v1/shinday/click.wav',
        contentType: 'audio/wav', bytes: 9636, durationSeconds: 0.108753,
        sha256: 'e1a77aa27df3cbf35ff560da73cfbedbd35936c0871cf1a99ea6c7f145624ccf',
        directorCues: ['doodle.stroke'],
    },
    'sonar-beeps-1': {
        sourceRelativePath: 'other sounds/sonar beeps 1.wav',
        deliveryKey: 'media/audio/v1/shinday/sonar-beeps-1.wav',
        contentType: 'audio/wav', bytes: 176444, durationSeconds: 2,
        sha256: '3f92905d0912fad7d52f9b4e073a350f8593dd5b7c6f6e28a243224252d51021',
        directorCues: ['radio.tune'],
    },
} as const satisfies Readonly<Record<string, VerifiedShindaySfxAsset>>;

export type ShindaySfxAssetId = keyof typeof SHINDAY_SFX_ASSETS;

export interface MappedAcademySfxCue {
    readonly cue: string;
    readonly domain: AcademySfxDomain;
    readonly intent: string;
    readonly status: 'mapped';
    readonly assetId: ShindaySfxAssetId;
    readonly directorCue: SfxCue;
    readonly deliveryKey: string;
}

export interface GapAcademySfxCue {
    readonly cue: string;
    readonly domain: AcademySfxDomain;
    readonly intent: string;
    readonly status: 'gap';
    readonly reason: string;
    /** Archive paths worth auditioning; these are not approved semantic mappings. */
    readonly candidates?: readonly string[];
}

export type AcademySfxCueDefinition = MappedAcademySfxCue | GapAcademySfxCue;

export const ACADEMY_SEMANTIC_SFX_CUES = [
    mapped('vn.advance', 'vn', 'Advance a completed VN line or beat.', 'menu-change', 'scene.advance'),
    gap('vn.reveal', 'vn', 'Tick during progressive VN text reveal.', 'No short, neutral reveal tick has been auditioned or delivered.'),
    mapped('vn.choice.move', 'vn', 'Move focus between VN choices.', 'menu-cursor-move', 'menu.move'),
    mapped('vn.choice.confirm', 'vn', 'Commit the focused VN choice.', 'menu-option-select', 'menu.confirm'),
    mapped('vn.choice.cancel', 'vn', 'Close or back out of a VN choice.', 'popup-close', 'menu.cancel'),
    mapped('vn.choice.unavailable', 'vn', 'Reject a locked VN choice.', 'unavailable', 'action.unavailable'),
    gap('speaker.arrival', 'speaker', 'Introduce a speaker entering the active composition.', 'No delivered cue has a verified character-arrival meaning.'),
    gap('speaker.emphasis', 'speaker', 'Accent an authored speaker jump or emphatic beat.', 'No delivered cue has been approved for repeatable dialogue emphasis.'),
    gap('door.open', 'door', 'Open a classroom or venue door.', 'The archive has unnamed effects, but no door source has been identified and delivered.'),
    gap('door.close', 'door', 'Close a classroom or venue door.', 'The archive has unnamed effects, but no door source has been identified and delivered.'),
    mapped('travel.transition', 'travel', 'Bridge a change of campus location.', 'module-change-1', 'page.turn'),
    gap('travel.footstep.indoor', 'travel', 'Ground indoor walking.', 'Footstep files exist, but their surfaces are not identified and none has a delivery key.', ['footstep sounds/se_ev_05_01.wav', 'footstep sounds/se_ev_05_02.wav']),
    gap('travel.footstep.wet', 'travel', 'Ground walking on a wet exterior surface.', 'Footstep files exist, but their surfaces are not identified and none has a delivery key.', ['footstep sounds/se_ev_06_01.wav', 'footstep sounds/se_ev_06_02.wav']),
    mapped('worksheet.success', 'worksheet', 'Confirm a correct worksheet submission.', 'result-clear', 'feedback.correct'),
    mapped('worksheet.repair', 'worksheet', 'Return a worksheet answer for a kind retry.', 'result-not-clear', 'feedback.repair'),
    mapped('worksheet.hanamaru', 'worksheet', 'Mark a compact earned hanamaru flourish.', 'score-tally', 'feedback.hanamaru'),
    mapped('minigame.score.tick', 'minigame', 'Tick a bounded score tally.', 'score-tally', 'feedback.hanamaru'),
    mapped('minigame.success', 'minigame', 'Resolve a minigame as cleared.', 'result-clear', 'feedback.correct'),
    mapped('minigame.repair', 'minigame', 'Resolve a minigame attempt with retry available.', 'result-not-clear', 'feedback.repair'),
    mapped('minigame.doodle.stroke', 'minigame', 'Sound one deliberate doodle stroke.', 'click', 'doodle.stroke'),
    mapped('minigame.doodle.check', 'minigame', 'Confirm a completed doodle check.', 'result-clear', 'doodle.check'),
    mapped('minigame.radio.tune', 'minigame', 'Tune the diegetic radio minigame.', 'sonar-beeps-1', 'radio.tune'),
    mapped('minigame.camera.capture', 'minigame', 'Capture a photo or memory.', 'camera', 'camera.capture'),
    mapped('ceremony.bond.unlock', 'ceremony', 'Reveal an earned bond.', 'module-change-2', 'bond.unlock'),
    mapped('ceremony.bond.rank', 'ceremony', 'Raise an established bond rank.', 'module-change-2', 'bond.rank'),
    mapped('ceremony.chapter.complete', 'ceremony', 'Close a chapter with brief applause.', 'clap', 'chapter.complete'),
] as const satisfies readonly AcademySfxCueDefinition[];

export type AcademySemanticSfxCue = typeof ACADEMY_SEMANTIC_SFX_CUES[number]['cue'];
export type AcademyMappedSfxCue = Extract<typeof ACADEMY_SEMANTIC_SFX_CUES[number], { status: 'mapped' }>;

export const SHINDAY_SFX_CATALOG = Object.freeze({
    version: 1 as const,
    provenance: Object.freeze({
        collection: 'Shinday SFX',
        sourceRepository: 'https://github.com/HRussellZFAC023/shinday',
        sourceRevision: '96fd56fb7e786fb941e5a9b817652bc4c33b7515',
        sourceRoot: 'assets/SFX',
        rightsId: 'shinday-educational',
        rightsHolder: 'Shinday project',
        basis: 'Project-owner-approved and licensed for protected educational use in Yomu Academy',
        attestedAt: '2026-07-12',
        delivery: 'Authenticated Academy session through private Cloudflare R2',
        evidence: Object.freeze([
            'workers/yomu-academy/media-manifest.json',
            'src/academy/audio/manifest.json',
        ]),
    }),
    assets: SHINDAY_SFX_ASSETS,
    cues: ACADEMY_SEMANTIC_SFX_CUES,
});

const CUE_BY_ID = new Map(ACADEMY_SEMANTIC_SFX_CUES.map(definition => [definition.cue, definition]));

export function getAcademySfxCue(cue: AcademySemanticSfxCue): AcademySfxCueDefinition {
    return CUE_BY_ID.get(cue) as AcademySfxCueDefinition;
}

/** Adapter seam for `AudioDirectorControl.playSfx`; gaps intentionally resolve to silence. */
export function resolveDirectorSfxCue(cue: AcademySemanticSfxCue): SfxCue | null {
    const definition = getAcademySfxCue(cue);
    return definition.status === 'mapped' ? definition.directorCue : null;
}

/** Play through the existing director boundary; returns false for documented gaps. */
export function playAcademySfxCue(audio: AudioDirectorControl, cue: AcademySemanticSfxCue): boolean {
    const directorCue = resolveDirectorSfxCue(cue);
    if (!directorCue) return false;
    audio.playSfx(directorCue);
    return true;
}

function mapped<
    Cue extends string,
    Domain extends AcademySfxDomain,
    AssetId extends ShindaySfxAssetId,
    DirectorCue extends (typeof SHINDAY_SFX_ASSETS)[AssetId]['directorCues'][number],
>(cue: Cue, domain: Domain, intent: string, assetId: AssetId, directorCue: DirectorCue) {
    return {
        cue,
        domain,
        intent,
        status: 'mapped' as const,
        assetId,
        directorCue,
        deliveryKey: SHINDAY_SFX_ASSETS[assetId].deliveryKey,
    };
}

function gap<Cue extends string, Domain extends AcademySfxDomain>(
    cue: Cue,
    domain: Domain,
    intent: string,
    reason: string,
    candidates?: readonly string[],
) {
    return { cue, domain, intent, status: 'gap' as const, reason, ...(candidates ? { candidates } : {}) };
}
