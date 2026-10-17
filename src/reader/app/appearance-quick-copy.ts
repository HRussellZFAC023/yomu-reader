/** Copy for the first row of Settings → Appearance: the accent swatches and the underline choice. */
const EN_APPEARANCE_QUICK_COPY = {
    accentSwatchKurenai: 'Kurenai (crimson)',
    accentSwatchShu: 'Shu (vermilion)',
    accentSwatchAi: 'Ai (indigo)',
    accentSwatchMurasaki: 'Murasaki (purple)',
    accentSwatchYamabuki: 'Yamabuki (amber)',
    accentSwatchSumi: 'Sumi (ink)',
    accentSwatchCustom: 'Custom color',
    underlineQuick: 'Underline',
    underlineQuickStatus: 'Status',
    underlineQuickPitch: 'Pitch',
} as const;

const JA_APPEARANCE_QUICK_COPY = {
    accentSwatchKurenai: '紅（くれない）',
    accentSwatchShu: '朱（しゅ）',
    accentSwatchAi: '藍（あい）',
    accentSwatchMurasaki: '紫（むらさき）',
    accentSwatchYamabuki: '山吹（やまぶき）',
    accentSwatchSumi: '墨（すみ）',
    accentSwatchCustom: 'カスタムカラー',
    underlineQuick: '下線',
    underlineQuickStatus: '学習状態',
    underlineQuickPitch: 'ピッチ',
} as const satisfies Record<keyof typeof EN_APPEARANCE_QUICK_COPY, string>;

export const APPEARANCE_QUICK_COPY = {
    en: EN_APPEARANCE_QUICK_COPY,
    ja: JA_APPEARANCE_QUICK_COPY,
} as const;
