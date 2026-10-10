import { ACADEMY_SRS_LABEL } from './constants';

// Saving a looked-up word to a collection destination: each destination's
// confirmation, and why a save could not happen.
const EN = {
    defaultDeck: 'Default',
    collectNoDestination: 'None of your decks can take this word. Turn one on in Settings.',
    collectWordNotFound: 'Not saved: this word was not found in your preferred grading service.',
    // An ordinary page can read these, so they name no service, deck or Anki state (ADR-0020).
    collectAlreadySaved: 'Already in one of your decks. Open Study to edit it.',
    collectHandoffOpened: 'Opened your deck app. Finish saving there.',
    collectNotSaved: 'This word was not saved. Try again, or open Study for details.',
    jpdbAddApiKeyRequired: 'Add a JPDB API key, or use Add to Anki.',
    addedToJpdb: 'Added to JPDB.',
    jitenAddApiKeyRequired: 'Add a Jiten API key, or use Add to Anki.',
    // Jiten takes a single word only into a word list (StudyDeckType 2).
    jitenNeedsWordList: 'To save words to Jiten, create a word list on jiten.moe.',
    addedToJiten: 'Added to Jiten.',
    bunproAddApiKeyRequired: 'Add a Bunpro frontend API token, or use Add to Anki.',
    bunproNoMatchingWord: 'Bunpro has no entry for this word.',
    addedToBunpro: 'Added to Bunpro.',
    yomuLocalSrsDisabled: `Enable ${ACADEMY_SRS_LABEL} in Settings first.`,
    yomuLocalSrsStorageFailed: 'Your Academy deck could not be saved. Browser storage may be full. Free some site storage, then try again.',
    yomuLocalSrsSaveInterrupted: 'Your Academy deck was not saved because saving was interrupted. Try again.',
    addedToYomuLocal: 'Added to your default deck.',
    // An Academy word kept without a schedule (Library, Stats and the popups).
    savedWord: 'Saved',
} as const;

const JA: Record<keyof typeof EN, string> = {
    defaultDeck: 'デフォルト',
    collectNoDestination: 'この単語を追加できるデッキがありません。設定でデッキを有効にしてください。',
    collectWordNotFound: '優先採点サービスでこの単語が見つからなかったため、保存していません。',
    collectAlreadySaved: 'すでにデッキにあります。編集はStudyで行えます。',
    collectHandoffOpened: 'デッキのアプリを開きました。そちらで保存を完了してください。',
    collectNotSaved: 'この単語は保存されませんでした。もう一度お試しいただくか、Studyで詳細を確認してください。',
    jpdbAddApiKeyRequired: 'JPDB APIキーかAnki追加が必要です。',
    addedToJpdb: 'JPDBに追加しました。',
    jitenAddApiKeyRequired: 'Jiten APIキーかAnki追加が必要です。',
    jitenNeedsWordList: 'Jitenに単語を保存するには、jiten.moeで単語リストを作成してください。',
    addedToJiten: 'Jitenに追加しました。',
    bunproAddApiKeyRequired: 'Bunproのfrontend_api_tokenかAnki追加が必要です。',
    bunproNoMatchingWord: 'この単語はBunproに見つかりませんでした。',
    addedToBunpro: 'Bunproに追加しました。',
    yomuLocalSrsDisabled: '先に設定でAcademyを有効にしてください。',
    yomuLocalSrsStorageFailed: 'Academyデッキを保存できませんでした。ブラウザーの保存容量が不足している可能性があります。サイトの保存容量を空けてから、もう一度お試しください。',
    yomuLocalSrsSaveInterrupted: '保存が中断されたため、Academyデッキに保存されませんでした。もう一度お試しください。',
    addedToYomuLocal: 'デフォルトのデッキに追加しました。',
    savedWord: '保存済み',
};

export const COLLECTION_COPY = { en: EN, ja: JA };
