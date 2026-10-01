/** Copy OCR shows about page images: scan status pills, video-frame controls, the reader-canvas tap hint and the nothing-to-read notice. */
const EN_OCR_STATUS_COPY = {
    ocrPlayVideo: 'Play video',
    ocrPausedFrameScanning: 'Scanning...',
    ocrPausedFrameReady: 'Text ready',
    ocrPausedFrameNoText: 'No text found',
    ocrPausedFrameFailed: 'Could not read text',
    ocrRetryScan: 'Scan again',
    ocrNoReadableImages: 'No readable images nearby.',
    ocrCanvasTapHint: 'Tap the page to read it',
    ocrCanvasTapHintDismiss: 'Dismiss tip',
} as const;

const JA_OCR_STATUS_COPY = {
    ocrPlayVideo: '動画を再生',
    ocrPausedFrameScanning: 'スキャン中...',
    ocrPausedFrameReady: 'テキスト準備完了',
    ocrPausedFrameNoText: 'テキストが見つかりません',
    ocrPausedFrameFailed: 'テキストを読み取れませんでした',
    ocrRetryScan: '再スキャン',
    ocrNoReadableImages: '近くに読み取れる画像がありません。',
    ocrCanvasTapHint: 'ページをタップすると読めます',
    ocrCanvasTapHintDismiss: 'ヒントを閉じる',
} as const satisfies Record<keyof typeof EN_OCR_STATUS_COPY, string>;

export const OCR_STATUS_COPY = {
    en: EN_OCR_STATUS_COPY,
    ja: JA_OCR_STATUS_COPY,
} as const;
