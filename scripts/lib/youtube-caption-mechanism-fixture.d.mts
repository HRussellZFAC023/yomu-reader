export interface Json3Segment {
    utf8: string;
    tOffsetMs?: number;
    acAsrConf?: number;
}
export interface Json3Event {
    tStartMs: number;
    dDurationMs: number;
    id?: number;
    wpWinPosId?: number;
    wsWinStyleId?: number;
    wWinId?: number;
    aAppend?: number;
    segs?: Json3Segment[];
}
export interface Json3Track {
    wireMagic: string;
    events: Json3Event[];
    [key: string]: unknown;
}
export function asrCaptionTracksMechanismFixture(options: { seconds: number }): { ja: Json3Track; jaEn: Json3Track; mechanismFixture: true };
