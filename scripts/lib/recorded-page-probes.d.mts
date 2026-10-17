import type { Page } from 'playwright';

export interface CaptionFrame { at: number; time: number | null; primary: string; secondary: string; native: boolean }
export function kanjiReadingCoverage(page: Page, options?: { root?: string; visibleOnly?: boolean }): Promise<{ words: number; kanjiWords: number; withReading: number; ratio: number }>;
export function startCaptionFrameLog(page: Page): Promise<void>;
export function readCaptionFrames(page: Page): Promise<CaptionFrame[]>;
export function captionFlashFrames(frames: CaptionFrame[]): { firstCommitAt: number | null; gapFrames: number; flashFrames: CaptionFrame[] };
