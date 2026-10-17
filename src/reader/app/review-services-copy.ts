import { YOMU_DECK_LABEL } from './constants';

/**
 * Copy for Settings → Reviews: one row per review service, its status dot,
 * what it adds, and the per-service "Grade from よむ" switch.
 */
const EN_REVIEW_SERVICES_COPY = {
    reviews: 'Reviews',
    yomuDeck: YOMU_DECK_LABEL,
    gradeFromYomu: 'Grade from よむ',
    reviewServiceKey: '{service} key',
    reviewServiceToken: '{service} token',
    reviewServiceConnect: 'Connect',
    reviewServiceOn: 'Connected',
    reviewServiceOff: 'Not connected',
    reviewServiceAvailable: 'Ready to connect',
    reviewServiceError: 'Needs a new token',
    reviewServiceBuiltIn: 'Built in',
    reviewServiceDisabled: 'Off',
    reviewServiceAddsGrades: 'Grades',
    reviewServiceAddsColors: 'Word colors',
    reviewServiceAddsDecks: 'Decks',
    reviewServiceAddsPitch: 'Pitch accent',
    bunproTokenHelp: 'Import the frontend token from Bunpro settings and treat it like a password. It is saved before it is verified.',
} as const;

const JA_REVIEW_SERVICES_COPY = {
    reviews: '復習',
    yomuDeck: 'よむデッキ',
    gradeFromYomu: 'よむから採点',
    reviewServiceKey: '{service}のキー',
    reviewServiceToken: '{service}のトークン',
    reviewServiceConnect: '接続',
    reviewServiceOn: '接続済み',
    reviewServiceOff: '未接続',
    reviewServiceAvailable: '接続できます',
    reviewServiceError: 'トークンの再取得が必要',
    reviewServiceBuiltIn: '内蔵',
    reviewServiceDisabled: 'オフ',
    reviewServiceAddsGrades: '採点',
    reviewServiceAddsColors: '単語の色',
    reviewServiceAddsDecks: 'デッキ',
    reviewServiceAddsPitch: 'ピッチアクセント',
    bunproTokenHelp: 'Bunpro設定からフロントエンドトークンを取り込み、パスワードと同様に扱ってください。保存時点では未確認です。',
} as const satisfies Record<keyof typeof EN_REVIEW_SERVICES_COPY, string>;

export const REVIEW_SERVICES_COPY = {
    en: EN_REVIEW_SERVICES_COPY,
    ja: JA_REVIEW_SERVICES_COPY,
} as const;
