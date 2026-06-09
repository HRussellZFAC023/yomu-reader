export type SettingsDialogControllerClass = typeof import('../settings/dialog-controller').SettingsDialogController;
export type SettingsDialogControllerInstance = InstanceType<SettingsDialogControllerClass>;
export type SubtitlePlayerControllerClass = typeof import('../subtitles/controller').SubtitlePlayerController;
export type SubtitlePlayerControllerInstance = InstanceType<SubtitlePlayerControllerClass>;
export type YoutubeImmersionFilterClass = typeof import('../subtitles/youtube').YoutubeImmersionFilter;
export type YoutubeImmersionFilterInstance = InstanceType<YoutubeImmersionFilterClass>;
export type ImageOcrControllerClass = typeof import('../ocr/controller').ImageOcrController;

interface YomuCompanionRegistry {
    settings?: {
        SettingsDialogController: SettingsDialogControllerClass;
    };
    video?: {
        SubtitlePlayerController: SubtitlePlayerControllerClass;
        YoutubeImmersionFilter: YoutubeImmersionFilterClass;
    };
    ocr?: {
        ImageOcrController: ImageOcrControllerClass;
    };
}

type YomuCompanionWindow = typeof globalThis & {
    __yomuCompanions?: YomuCompanionRegistry;
};

export function registerYomuCompanion<K extends keyof YomuCompanionRegistry>(
    key: K,
    value: NonNullable<YomuCompanionRegistry[K]>,
): void {
    const target = globalThis as YomuCompanionWindow;
    target.__yomuCompanions = {
        ...(target.__yomuCompanions ?? {}),
        [key]: value,
    };
}

export function yomuSettingsDialogController(): SettingsDialogControllerClass | undefined {
    return yomuCompanions().settings?.SettingsDialogController;
}

export function yomuSubtitlePlayerController(): SubtitlePlayerControllerClass | undefined {
    return yomuCompanions().video?.SubtitlePlayerController;
}

export function yomuYoutubeImmersionFilter(): YoutubeImmersionFilterClass | undefined {
    return yomuCompanions().video?.YoutubeImmersionFilter;
}

export function yomuImageOcrController(): ImageOcrControllerClass | undefined {
    return yomuCompanions().ocr?.ImageOcrController;
}

function yomuCompanions(): YomuCompanionRegistry {
    return (globalThis as YomuCompanionWindow).__yomuCompanions ?? {};
}
